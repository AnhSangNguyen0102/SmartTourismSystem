import os
import asyncio
import time
import pytest
from unittest.mock import patch

from services.gemini_key_manager import GeminiKeyManager
from services.rate_limited_key_manager import RateLimitedKeyManager


# =====================================================================
# Tests for GeminiKeyManager
# =====================================================================

def test_gemini_key_manager_load_from_keys():
    """Kiểm tra khởi tạo GeminiKeyManager bằng danh sách key truyền trực tiếp."""
    keys = ["keyA", "keyB", "keyC"]
    manager = GeminiKeyManager(keys=keys)
    
    assert manager.key_count == 3
    assert manager.all_keys == keys

    async def run():
        # Kiểm tra tính năng xoay vòng Round-Robin
        k1 = await manager.get_next_key()
        k2 = await manager.get_next_key()
        k3 = await manager.get_next_key()
        k4 = await manager.get_next_key()
        k5 = await manager.get_next_key()
        
        assert k1 == "keyA"
        assert k2 == "keyB"
        assert k3 == "keyC"
        assert k4 == "keyA"
        assert k5 == "keyB"

    asyncio.run(run())


def test_gemini_key_manager_load_from_env_numbered():
    """Kiểm tra load các key dạng đánh số GEMINI_API_KEY_1, GEMINI_API_KEY_2..."""
    mock_env = {
        "GEMINI_API_KEY_1": "envKey1",
        "GEMINI_API_KEY_2": "envKey2",
        "GEMINI_API_KEY_3": "",  # kết thúc chuỗi đánh số
        "GEMINI_API_KEYS": "ignored_comma_key",
        "GEMINI_API_KEY": "ignored_single_key",
        "GOOGLE_API_KEY": "ignored_google_key"
    }
    with patch.dict(os.environ, mock_env):
        manager = GeminiKeyManager()
        assert manager.all_keys == ["envKey1", "envKey2"]


def test_gemini_key_manager_load_from_env_comma():
    """Kiểm tra load từ biến môi trường GEMINI_API_KEYS phân tách bằng dấu phẩy."""
    mock_env = {
        "GEMINI_API_KEYS": "commaKey1, commaKey2, commaKey3",
        "GEMINI_API_KEY": "ignored_single_key",
        "GOOGLE_API_KEY": "ignored_google_key"
    }
    # Đảm bảo không có các biến đánh số làm ảnh hưởng
    with patch.dict(os.environ, mock_env), \
         patch("os.getenv", side_effect=lambda name, default="": mock_env.get(name, default)):
        manager = GeminiKeyManager()
        assert manager.all_keys == ["commaKey1", "commaKey2", "commaKey3"]


def test_gemini_key_manager_load_from_env_single():
    """Kiểm tra load từ biến môi trường đơn lẻ GEMINI_API_KEY."""
    mock_env = {
        "GEMINI_API_KEY": "singleKey",
        "GOOGLE_API_KEY": "ignored_google_key"
    }
    with patch.dict(os.environ, mock_env), \
         patch("os.getenv", side_effect=lambda name, default="": mock_env.get(name, default)):
        manager = GeminiKeyManager()
        assert manager.all_keys == ["singleKey"]


def test_gemini_key_manager_load_from_env_google():
    """Kiểm tra load fallback từ biến môi trường GOOGLE_API_KEY."""
    mock_env = {
        "GOOGLE_API_KEY": "googleFallbackKey"
    }
    with patch.dict(os.environ, mock_env), \
         patch("os.getenv", side_effect=lambda name, default="": mock_env.get(name, default)):
        manager = GeminiKeyManager()
        assert manager.all_keys == ["googleFallbackKey"]


def test_gemini_key_manager_load_from_env_empty():
    """Kiểm tra lỗi ValueError khi không tìm thấy API key nào."""
    mock_env = {}
    with patch.dict(os.environ, mock_env), \
         patch("os.getenv", side_effect=lambda name, default="": mock_env.get(name, default)):
        with pytest.raises(ValueError) as exc_info:
            GeminiKeyManager()
        assert "Không tìm thấy Gemini API key nào" in str(exc_info.value)


# =====================================================================
# Tests for RateLimitedKeyManager
# =====================================================================

def test_rate_limited_key_manager_basic():
    """Kiểm tra khởi tạo và hoạt động cơ bản của RateLimitedKeyManager."""
    keys = ["key1", "key2"]
    manager = RateLimitedKeyManager(keys=keys, rpm=5, rpd=10)
    
    assert manager.all_keys == keys

    async def run():
        # Kiểm tra tính xoay vòng round-robin khi gọi acquire
        k1 = await manager.acquire()
        k2 = await manager.acquire()
        k3 = await manager.acquire()
        
        assert k1 == "key1"
        assert k2 == "key2"
        assert k3 == "key1"
        
        # Test release (không gây lỗi)
        manager.release("key1")

    asyncio.run(run())


def test_rate_limited_key_manager_sleep_logic():
    """
    Kiểm tra logic tính toán thời gian ngủ khi hết quota RPM (Sliding Window).
    Sử dụng mock time.monotonic và asyncio.sleep để giả lập thời gian trôi qua.
    """
    virtual_time = 1000.0

    def mock_monotonic():
        return virtual_time

    async def mock_sleep(delay):
        nonlocal virtual_time
        virtual_time += delay

    with patch("time.monotonic", side_effect=mock_monotonic), \
         patch("asyncio.sleep", side_effect=mock_sleep) as mock_s:

        # RPM = 1, RPD = 5
        manager = RateLimitedKeyManager(keys=["key1"], rpm=1, rpd=5)

        async def run():
            # Request 1: Được cấp key1 ngay tại t = 1000.0
            k1 = await manager.acquire()
            assert k1 == "key1"
            assert virtual_time == 1000.0

            # Request 2: Gọi acquire tiếp. Vì RPM = 1 nên key1 đã hết quota.
            # KeyManager tính toán thời điểm kế tiếp key1 khả dụng là:
            # timestamp của request cũ nhất (1000.0) + WINDOW_MINUTE (60s) = 1060.0.
            # Thời gian chờ đợi là: (1060.0 - 1000.0) + 0.1s buffer = 60.1s.
            # Sau khi ngủ 60.1s, virtual_time tăng lên 1060.1.
            # KeyManager thử lại vòng lặp, key1 khả dụng -> cấp key1 và ghi nhận timestamp mới (1060.1).
            k2 = await manager.acquire()
            assert k2 == "key1"
            assert virtual_time == 1060.1
            mock_s.assert_called_once()
            assert mock_s.call_args[0][0] == pytest.approx(60.1)

            # Reset mock để kiểm tra tiếp
            mock_s.reset_mock()

            # Request 3: Gọi acquire tiếp lúc t = 1060.1.
            # Request 2 có timestamp 1060.1, nên thời điểm tiếp theo khả dụng là 1060.1 + 60s = 1120.1.
            # Chờ đợi: (1120.1 - 1060.1) + 0.1s buffer = 60.1s.
            # Sleep 60.1s -> virtual_time = 1120.2.
            k3 = await manager.acquire()
            assert k3 == "key1"
            assert virtual_time == pytest.approx(1120.2)
            mock_s.assert_called_once()
            assert mock_s.call_args[0][0] == pytest.approx(60.1)

        asyncio.run(run())


def test_rate_limited_key_manager_429_cooldown():
    """Kiểm tra khi một key bị báo cáo rate limited (429) thì tự động bị cool-down."""
    virtual_time = 1000.0

    def mock_monotonic():
        return virtual_time

    with patch("time.monotonic", side_effect=mock_monotonic):
        manager = RateLimitedKeyManager(keys=["key1", "key2"], rpm=10, rpd=10)

        async def run():
            # acquire key1
            k1 = await manager.acquire()
            assert k1 == "key1"

            # Báo cáo key1 bị lỗi 429, cần cool-down 30 giây
            manager.report_rate_limited("key1", retry_after=30.0)

            # Lần tiếp theo acquire: Mặc dù theo round-robin sẽ đến lượt key1,
            # nhưng do key1 đang cool-down nên hệ thống bỏ qua và lấy key2.
            k2 = await manager.acquire()
            assert k2 == "key2"

            # Thử gửi cho key không tồn tại (không gây crash)
            manager.report_rate_limited("non_existent_key", retry_after=10.0)

        asyncio.run(run())


def test_rate_limited_key_manager_403_disable():
    """Kiểm tra khi key bị vô hiệu hóa vĩnh viễn (lỗi 403)."""
    manager = RateLimitedKeyManager(keys=["key1", "key2"], rpm=10, rpd=10)

    async def run():
        # Vô hiệu hóa key1
        manager.disable_key("key1")

        # acquire() lúc này chỉ trả về key2
        k1 = await manager.acquire()
        assert k1 == "key2"
        k2 = await manager.acquire()
        assert k2 == "key2"

        # Thử vô hiệu hóa key không tồn tại (không gây crash)
        manager.disable_key("non_existent_key")

        # Vô hiệu hóa luôn key2
        manager.disable_key("key2")

        # Hệ thống không còn key nào hoạt động -> Ném lỗi RuntimeError
        with pytest.raises(RuntimeError) as exc_info:
            await manager.acquire()
        assert "Tất cả Gemini API key đều bị vô hiệu hóa" in str(exc_info.value)

    asyncio.run(run())


def test_rate_limited_key_manager_stats():
    """Kiểm tra cấu trúc và tính chính xác của hàm stats()."""
    virtual_time = 1000.0

    def mock_monotonic():
        return virtual_time

    with patch("time.monotonic", side_effect=mock_monotonic):
        manager = RateLimitedKeyManager(keys=["key1", "key2"], rpm=5, rpd=20)

        async def run():
            # Sử dụng key1
            k1 = await manager.acquire()
            assert k1 == "key1"
            
            # Đưa key1 vào trạng thái cool-down 45 giây
            manager.report_rate_limited("key1", retry_after=45.0)

            # Vô hiệu hóa key2
            manager.disable_key("key2")

            # Lấy thống kê
            stats = manager.stats()
            assert len(stats) == 2

            s1 = next(s for s in stats if s["key_suffix"] == "...key1")
            s2 = next(s for s in stats if s["key_suffix"] == "...key2")

            assert s1["disabled"] is False
            assert s1["cool_remaining"] == pytest.approx(45.0)
            assert s1["rpm_used"] == 1
            assert s1["rpd_used"] == 1
            assert s1["rpm_limit"] == 5
            assert s1["rpd_limit"] == 20

            assert s2["disabled"] is True
            assert s2["cool_remaining"] == 0.0
            assert s2["rpm_used"] == 0
            assert s2["rpd_used"] == 0

        asyncio.run(run())
