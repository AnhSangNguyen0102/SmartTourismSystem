import os

try:
    import redis
    from redis.exceptions import ConnectionError
except ImportError:
    redis = None
    ConnectionError = Exception

# Cấu hình Redis từ biến môi trường hoặc mặc định localhost
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Khởi tạo cấu hình (Không cần try...except ở đây vì nó chưa gọi mạng)
redis_client = None
if redis:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)


def acquire_match_lock(user_id: str, timeout_seconds: int = 30) -> bool:
    """
    Sử dụng SETNX để cấp phát lock ghép cặp cho người chơi.
    Trả về True nếu lấy được lock (người chơi chưa có lock), False nếu đang có lock.
    """
    if not redis_client:
        print("Warning: redis_client chưa được khởi tạo. Mock acquire_match_lock.")
        return True
    
    lock_key = f"lock:quest:{user_id}"
    
    # BẮT LỖI TẠI ĐÂY LÚC THỰC THI
    try:
        is_acquired = redis_client.set(lock_key, "1", ex=timeout_seconds, nx=True)
        return bool(is_acquired)
    except ConnectionError:
        print("⚠️ Warning: Không thể kết nối tới Redis Server. Bỏ qua cấp lock.")
        return True # Fallback cho đi tiếp


def release_match_lock(user_id: str):
    """
    Giải phóng lock (Xóa Key) khi người chơi hủy hoặc hoàn thành.
    """
    if not redis_client:
        return
        
    lock_key = f"lock:quest:{user_id}"
    
    # BẮT LỖI TẠI ĐÂY LÚC THỰC THI
    try:
        redis_client.delete(lock_key)
    except ConnectionError:
        print(f"⚠️ Warning: Không thể kết nối tới Redis Server. Bỏ qua xóa lock cho {user_id}.")