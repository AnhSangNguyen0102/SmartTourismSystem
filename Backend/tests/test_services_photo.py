import pytest
import httpx
import json
from unittest.mock import patch, AsyncMock, MagicMock
from services.photo_service import (
    GeminiPhotoService, _detect_mime, _extract_text, _extract_error_message, _parse_retry_after,
    GeminiError, GeminiRateLimitError, GeminiInvalidKeyError, GeminiClientError, GeminiServerError
)

def test_detect_mime():
    assert _detect_mime(b"\x89PNG\r\n") == "image/png"
    assert _detect_mime(b"\xff\xd8\xff") == "image/jpeg"
    assert _detect_mime(b"RIFF\x00\x00\x00\x00WEBP") == "image/webp"
    assert _detect_mime(b"GIF89a") == "image/gif"
    assert _detect_mime(b"unknown") == "image/jpeg"

def test_extract_text():
    # Valid candidate
    res_valid = {"candidates": [{"content": {"parts": [{"text": "  Hello World  "}]}}]}
    assert _extract_text(res_valid) == "Hello World"

    # Empty candidate
    res_empty = {"candidates": []}
    assert _extract_text(res_empty) is None

def test_extract_error_message():
    resp_json = MagicMock()
    resp_json.json.return_value = {"error": {"message": "Invalid API key"}}
    assert _extract_error_message(resp_json) == "Invalid API key"

    resp_text = MagicMock()
    resp_text.json.side_effect = Exception("No JSON")
    resp_text.text = "Plain text error description"
    assert _extract_error_message(resp_text) == "Plain text error description"

def test_parse_retry_after():
    assert _parse_retry_after("Retry after 35 seconds") == 37.0
    assert _parse_retry_after("retryDelay: 10s") == 12.0
    assert _parse_retry_after("No delay info", default=45.0) == 45.0

def test_build_payload():
    km = MagicMock()
    svc = GeminiPhotoService(key_manager=km)
    payload = svc._build_payload("Test Prompt", [b"img1", b"img2"], ["image/png", "image/jpeg"])
    
    assert payload["generationConfig"]["temperature"] == 0.2
    assert payload["contents"][0]["parts"][0]["text"] == "Test Prompt"
    assert payload["contents"][0]["parts"][1]["inline_data"]["mime_type"] == "image/png"
    # base64 encoded b"img1" is "aW1nMQ=="
    assert payload["contents"][0]["parts"][1]["inline_data"]["data"] == "aW1nMQ=="

@pytest.mark.asyncio
async def test_generate_text_success():
    km = AsyncMock()
    km.acquire.return_value = "mock_key"
    
    svc = GeminiPhotoService(key_manager=km)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"candidates": [{"content": {"parts": [{"text": "Success response"}]}}]}

    with patch("httpx.AsyncClient.post", return_value=mock_resp) as mock_post:
        result = await svc.generate_text("Analyze image", [b"img_bytes"])
        assert result == "Success response"
        km.acquire.assert_called_once()
        km.release.assert_called_once_with("mock_key")
        mock_post.assert_called()

@pytest.mark.asyncio
async def test_generate_text_rate_limited():
    km = AsyncMock()
    km.acquire.return_value = "mock_key"

    svc = GeminiPhotoService(key_manager=km)

    # First attempt: 429 Rate limited. Second attempt: 200 Success
    resp_429 = MagicMock()
    resp_429.status_code = 429
    resp_429.text = "Retry after 10 seconds"

    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.json.return_value = {"candidates": [{"content": {"parts": [{"text": "Recovered response"}]}}]}

    # Mock post requests
    post_mock = AsyncMock()
    post_mock.side_effect = [resp_429, resp_200]

    with patch("httpx.AsyncClient.post", post_mock):
        result = await svc.generate_text("Analyze image", [b"img_bytes"])
        assert result == "Recovered response"
        km.report_rate_limited.assert_called_once_with("mock_key", 12.0)
        assert km.acquire.call_count == 2

@pytest.mark.asyncio
async def test_generate_text_invalid_key():
    km = AsyncMock()
    km.acquire.return_value = "mock_key"

    svc = GeminiPhotoService(key_manager=km)

    # First attempt: 403 Invalid Key. Second attempt: 200 Success
    resp_403 = MagicMock()
    resp_403.status_code = 403
    resp_403.text = "Invalid Key"

    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.json.return_value = {"candidates": [{"content": {"parts": [{"text": "Recovered response"}]}}]}

    post_mock = AsyncMock()
    post_mock.side_effect = [resp_403, resp_200]

    with patch("httpx.AsyncClient.post", post_mock):
        result = await svc.generate_text("Analyze image", [b"img_bytes"])
        assert result == "Recovered response"
        km.disable_key.assert_called_once_with("mock_key")
        assert km.acquire.call_count == 2
