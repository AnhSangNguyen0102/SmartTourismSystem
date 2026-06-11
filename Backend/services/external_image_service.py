"""Search reusable fallback images for system-managed locations."""

from __future__ import annotations

from html import unescape
from html.parser import HTMLParser
import logging
import unicodedata
from typing import Any, Iterable

import httpx


WIKIMEDIA_COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIMEDIA_USER_AGENT = (
    "SmartTourismSystem/1.0 "
    "(https://github.com/phantiendung-fr/SmartTourismSystem; location image fallback)"
)
SUPPORTED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ELIGIBLE_LOCATION_CATEGORY_TERMS = {
    "diem tham quan",
    "danh lam",
    "thang canh",
    "di tich",
    "lich su",
    "di san",
    "tourist attraction",
    "landmark",
    "historic",
    "historical",
    "heritage",
    "scenic",
}

logger = logging.getLogger(__name__)


def _normalized_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.casefold().replace("đ", "d"))
    return " ".join(
        "".join(character for character in text if not unicodedata.combining(character)).split()
    )


def is_external_image_category_eligible(category_names: Iterable[str]) -> bool:
    """Allow Commons fallback only for sightseeing and historical categories."""
    return any(
        term in _normalized_text(category_name)
        for category_name in category_names
        for term in ELIGIBLE_LOCATION_CATEGORY_TERMS
    )


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _plain_text(value: str | None) -> str | None:
    if not value:
        return None

    parser = _TextExtractor()
    parser.feed(value)
    text = unescape(" ".join(parser.parts))
    return " ".join(text.split()) or None


def _metadata_value(metadata: dict[str, Any], key: str) -> str | None:
    item = metadata.get(key)
    if not isinstance(item, dict):
        return None
    return _plain_text(item.get("value"))


def _parse_commons_pages(payload: dict[str, Any], limit: int) -> list[dict[str, str | None]]:
    pages = payload.get("query", {}).get("pages", [])
    if isinstance(pages, dict):
        pages = pages.values()

    images: list[dict[str, str | None]] = []
    for page in pages:
        image_info_list = page.get("imageinfo") or []
        if not image_info_list:
            continue

        image_info = image_info_list[0]
        if image_info.get("mime") not in SUPPORTED_IMAGE_MIME_TYPES:
            continue

        image_url = image_info.get("thumburl") or image_info.get("url")
        source_url = image_info.get("descriptionurl")
        if not image_url or not source_url:
            continue

        metadata = image_info.get("extmetadata") or {}
        images.append(
            {
                "url": image_url,
                "source_url": source_url,
                "title": str(page.get("title", "")).removeprefix("File:") or None,
                "author": _metadata_value(metadata, "Artist") or _metadata_value(metadata, "Credit"),
                "license": _metadata_value(metadata, "LicenseShortName"),
                "license_url": _metadata_value(metadata, "LicenseUrl"),
            }
        )
        if len(images) >= limit:
            break

    return images


async def search_wikimedia_commons_images(
    query: str,
    *,
    limit: int = 3,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, str | None]]:
    """Return relevant bitmap images and attribution metadata from Commons."""
    if not query.strip() or limit < 1:
        return []

    params = {
        "action": "query",
        "format": "json",
        "formatversion": 2,
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": 6,
        "gsrlimit": min(max(limit * 3, 6), 15),
        "gsrsort": "relevance",
        "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata",
        "iiurlwidth": 1600,
        "iiextmetadatalanguage": "en",
        "iiextmetadatafilter": "Artist|Credit|LicenseShortName|LicenseUrl",
    }

    async def request(active_client: httpx.AsyncClient) -> list[dict[str, str | None]]:
        response = await active_client.get(
            WIKIMEDIA_COMMONS_API,
            params=params,
            headers={"User-Agent": WIKIMEDIA_USER_AGENT},
        )
        response.raise_for_status()
        return _parse_commons_pages(response.json(), limit)

    try:
        if client is not None:
            return await request(client)

        async with httpx.AsyncClient(
            timeout=8.0,
        ) as active_client:
            return await request(active_client)
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.warning("Wikimedia Commons image search failed for %r: %s", query, exc)
        return []
