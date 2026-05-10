# LƯU Ý: Đây là code đề xuất cho module data, có thể xem và so sánh với bên 2 nhóm chức năng để chỉnh sửa.

# Module Data

Phần này chịu trách nhiệm quản lý toàn bộ kết nối cơ sở dữ liệu và xử lý các truy vấn logic cho hệ thống.

# Kiến Trúc Truy Cập Dữ Liệu (Hybrid Data Access)
Hệ thống áp dụng mô hình lai để tối ưu hiệu năng:
- **Truy cập trực tiếp (Mobile -> Supabase):** Dùng cho các tác vụ realtime (Tracking GPS, Chat).
- **Truy cập gián tiếp (Mobile -> Backend -> DB):** Dùng cho các nghiệp vụ phức tạp, yêu cầu bảo mật cao và Transaction (Lên kế hoạch chuyến đi, Đăng ký/Đăng nhập).

# Cấu Trúc Thư Mục Module Data
- `database.py`: Quản lý Connection Pooler (Port 6543) và Session.
- `models.py`: Định nghĩa các bảng SQL vật lý.
- `schemas.py`: Định nghĩa Pydantic models để validate dữ liệu API.
- `crud/`: Chứa các hàm truy vấn logic (Create, Read, Update, Delete) tách biệt.
- `core/config.py`: Quản lý biến môi trường và cấu hình hệ thống.

# Hướng Dẫn Cài Đặt (Local)
1. Kích hoạt môi trường ảo: `.\venv\Scripts\activate`
2. Cài đặt thư viện: `pip install -r requirements.txt`
3. Cấu hình file `.env` với cổng `6543` để kết nối qua Supavisor.
4. Chạy server: `uvicorn main:app --reload`

# Cách Kiểm Tra Tính Năng (dưới đây hướng dẫn kiểm tra với chức năng đăng ký nhưng phần code tổng đã là module data hoàn thiện)
Truy cập `http://127.0.0.1:8000/docs` để sử dụng Swagger UI. Hiện đã hoàn thiện luồng test cho chức năng **Đăng ký User** (kiểm tra toàn bộ chuỗi kết nối từ Schema -> Security -> CRUD -> Database).