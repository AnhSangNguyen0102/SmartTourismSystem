import asyncio

import httpx

from services.external_image_service import (
    WIKIMEDIA_USER_AGENT,
    is_external_image_category_eligible,
    search_wikimedia_commons_images,
)


def test_external_image_category_eligibility_is_limited_to_sightseeing_and_history():
    assert is_external_image_category_eligible(["Điểm tham quan"])
    assert is_external_image_category_eligible(["Danh lam thắng cảnh"])
    assert is_external_image_category_eligible(["Di tích lịch sử"])
    assert is_external_image_category_eligible(["Cultural heritage"])
    assert not is_external_image_category_eligible(["Quán ăn"])
    assert not is_external_image_category_eligible(["Nơi lưu trú"])
    assert not is_external_image_category_eligible([])


def test_search_wikimedia_commons_images_parses_reusable_bitmap_metadata():
    payload = {
        "query": {
            "pages": [
                {
                    "title": "File:Ignored map.svg",
                    "imageinfo": [
                        {
                            "mime": "image/svg+xml",
                            "url": "https://example.com/map.svg",
                            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Ignored_map.svg",
                        }
                    ],
                },
                {
                    "title": "File:Ben Thanh Market.jpg",
                    "imageinfo": [
                        {
                            "mime": "image/jpeg",
                            "url": "https://example.com/original.jpg",
                            "thumburl": "https://example.com/thumb.jpg",
                            "descriptionurl": "https://commons.wikimedia.org/wiki/File:Ben_Thanh_Market.jpg",
                            "extmetadata": {
                                "Artist": {"value": "<a href='/wiki/User:Test'>Test Author</a>"},
                                "LicenseShortName": {"value": "CC BY-SA 4.0"},
                                "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0/"},
                            },
                        }
                    ],
                },
            ]
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["gsrnamespace"] == "6"
        assert request.headers["User-Agent"] == WIKIMEDIA_USER_AGENT
        assert "https://github.com/phantiendung-fr/SmartTourismSystem" in WIKIMEDIA_USER_AGENT
        return httpx.Response(200, json=payload)

    async def run_search():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await search_wikimedia_commons_images("Ben Thanh Market Vietnam", client=client)

    images = asyncio.run(run_search())

    assert images == [
        {
            "url": "https://example.com/thumb.jpg",
            "source_url": "https://commons.wikimedia.org/wiki/File:Ben_Thanh_Market.jpg",
            "title": "Ben Thanh Market.jpg",
            "author": "Test Author",
            "license": "CC BY-SA 4.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        }
    ]


def test_search_wikimedia_commons_images_returns_empty_and_logs_http_error(caplog):
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    async def run_search():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await search_wikimedia_commons_images("Ben Thanh Market", client=client)

    caplog.set_level("WARNING", logger="services.external_image_service")
    images = asyncio.run(run_search())

    assert images == []
    assert "Wikimedia Commons image search failed" in caplog.text
