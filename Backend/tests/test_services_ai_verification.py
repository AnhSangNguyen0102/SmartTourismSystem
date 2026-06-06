import pytest
import httpx
from unittest.mock import patch, AsyncMock, MagicMock
from services.ai_verification import (
    repair_json_reason, _get_image_mime_type, verify_image_with_gemini
)

def test_repair_json_reason():
    # Standard broken JSON where reason has nested quotes
    broken = '{"is_matched": true, "confidence_score": 90.0, "anti_cheat_passed": true, "reason": "Ảnh rất đẹp, khớp với "Bạch Dinh" mẫu"}'
    fixed = repair_json_reason(broken)
    # The double quotes around "Bạch Dinh" should be replaced by single quotes
    assert '"Bạch Dinh"' not in fixed
    assert "'Bạch Dinh'" in fixed

    # JSON cut off at the end
    truncated = '{"is_matched": false, "reason": "Không khớp'
    fixed_truncated = repair_json_reason(truncated)
    assert fixed_truncated.endswith('"}')

def test_get_image_mime_type():
    png_bytes = b'\x89PNG\r\n\x1a\n'
    jpeg_bytes = b'\xff\xd8\xff\xe0'
    webp_bytes = b'RIFF\x00\x00\x00\x00WEBP'
    gif_bytes = b'GIF89a'
    unknown_bytes = b'abcdef'

    assert _get_image_mime_type(png_bytes) == "image/png"
    assert _get_image_mime_type(jpeg_bytes) == "image/jpeg"
    assert _get_image_mime_type(webp_bytes) == "image/webp"
    assert _get_image_mime_type(gif_bytes) == "image/gif"
    assert _get_image_mime_type(unknown_bytes) == "image/jpeg"

@pytest.mark.asyncio
async def test_verify_image_with_gemini_success():
    # Mock download of reference image
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b'mock_ref_image_data'

    # Mock photo service response
    mock_photo_svc = AsyncMock()
    mock_photo_svc.generate_text.return_value = '{"is_matched": true, "confidence_score": 95.0, "anti_cheat_passed": true, "reason": "Ảnh khớp hoàn toàn"}'

    with patch("services.ai_verification.get_photo_service", return_value=mock_photo_svc), \
         patch("httpx.AsyncClient.get", return_value=mock_resp):
        result = await verify_image_with_gemini(b'user_image_data', "https://example.com/ref.jpg")
        assert result["is_matched"] is True
        assert result["confidence_score"] == 95.0
        assert result["anti_cheat_passed"] is True
        assert result["reason"] == "Ảnh khớp hoàn toàn"

@pytest.mark.asyncio
async def test_verify_image_with_gemini_low_confidence():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b'mock_ref_image_data'

    mock_photo_svc = AsyncMock()
    # Confidence is 50, which is below 60 threshold
    mock_photo_svc.generate_text.return_value = '{"is_matched": true, "confidence_score": 50.0, "anti_cheat_passed": true, "reason": "Khớp một phần nhưng không đủ"}'

    with patch("services.ai_verification.get_photo_service", return_value=mock_photo_svc), \
         patch("httpx.AsyncClient.get", return_value=mock_resp):
        result = await verify_image_with_gemini(b'user_image_data', "https://example.com/ref.jpg")
        # Safety guard should force is_matched = False
        assert result["is_matched"] is False
        assert result["confidence_score"] == 50.0

@pytest.mark.asyncio
async def test_verify_image_with_gemini_failed_anti_cheat():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b'mock_ref_image_data'

    mock_photo_svc = AsyncMock()
    # anti_cheat_passed is False
    mock_photo_svc.generate_text.return_value = '{"is_matched": true, "confidence_score": 85.0, "anti_cheat_passed": false, "reason": "Ảnh chụp từ màn hình điện thoại khác"}'

    with patch("services.ai_verification.get_photo_service", return_value=mock_photo_svc), \
         patch("httpx.AsyncClient.get", return_value=mock_resp):
        result = await verify_image_with_gemini(b'user_image_data', "https://example.com/ref.jpg")
        # Safety guard should force is_matched = False due to anti-cheat fail
        assert result["is_matched"] is False
        assert result["anti_cheat_passed"] is False

@pytest.mark.asyncio
async def test_verify_image_with_gemini_download_error():
    mock_photo_svc = AsyncMock()
    # Simulated connection error during download
    with patch("services.ai_verification.get_photo_service", return_value=mock_photo_svc), \
         patch("httpx.AsyncClient.get", side_effect=httpx.HTTPError("Network failure")):
        result = await verify_image_with_gemini(b'user_image_data', "https://example.com/ref.jpg")
        # Should result in failure response
        assert result["is_matched"] is False
        assert "Lỗi" in result["reason"] or "Dịch vụ" in result["reason"]
