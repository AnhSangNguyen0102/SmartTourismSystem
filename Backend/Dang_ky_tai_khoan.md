# 🚀 Feature Update: Đăng ký & Phân quyền Doanh nghiệp

## 📝 Mô tả chung
Đã hoàn thiện luồng Đăng ký tài khoản doanh nghiệp (B2B) và cơ chế xét duyệt của Admin. Đồng thời, thiết lập thành công hệ thống Phân quyền (Role-Based Access Control - RBAC) bằng JWT Token để bảo vệ các API quan trọng.

## 📂 Chi tiết các file thay đổi

* **`routers/auth.py`** (Thêm mới/Di chuyển): 
    * Đã di chuyển file `auth.py` cũ từ thư mục `api/` sang thư mục `routers/`.
    * Cập nhật logic API Login: Cấp phát đầy đủ `access_token` và `refresh_token`, trả về `role` của user trong response.
* **`core/dependencies.py`** (Thêm mới): 
    * Tạo mới file chứa các Dependency bảo mật.
    * Cung cấp các hàm kiểm tra quyền: `require_admin` (Chỉ Admin) và `require_enterprise` (Doanh nghiệp & Admin).
* **`routers/enterprise.py`** (Thêm mới): 
    * Xây dựng API `POST /api/enterprise/register-profile` cho User nộp hồ sơ B2B.
    * Xây dựng API `PUT /api/enterprise/{enterprise_id}/verify` cho Admin duyệt/từ chối hồ sơ và tự động nâng cấp role.
* **`schemas.py`** (Chỉnh sửa): 
    * Bổ sung class `TokenResponse` cho luồng Login.
    * Thêm các schema validation dữ liệu đầu vào/đầu ra cho doanh nghiệp (`EnterpriseProfileCreate`, `EnterpriseStatusUpdate`,...).
* **`main.py`** (Chỉnh sửa): 
    * Đăng ký (include) các router mới `auth.router` và `enterprise.router` vào ứng dụng FastAPI chính.

## 🧪 Hướng dẫn Test
1.  Chạy server: `uvicorn main:app --reload`
2.  Mở Swagger UI tại: `http://localhost:8000/docs`
3.  **Test luồng nộp hồ sơ:** Đăng nhập bằng tài khoản `USER` thường -> Lấy Token -> Gọi API `/register-profile` -> Kiểm tra Supabase thấy trạng thái `PENDING`.
4.  **Test luồng duyệt:** Đăng nhập bằng tài khoản `ADMIN` -> Lấy Token mới -> Gọi API `/{enterprise_id}/verify` -> Chọn trạng thái `ACTIVE` -> Check lại tài khoản User đã tự động chuyển Role thành `ENTERPRISE`.

## ⚠️ Lưu ý

* Đã refactor lại file `auth.py` và đưa vào thư mục `routers/`. Các logic đăng nhập/đăng ký cơ bản đã chạy ổn định. Khi bạn làm tiếp luồng xác minh OTP, hãy gắn nó vào sau bước đăng ký nhé.
* Cơ chế bảo mật cho doanh nghiệp đã sẵn sàng. Khi bạn viết API thêm mới dịch vụ, chỉ cần import `require_enterprise` từ `core/dependencies.py` và gài vào tham số của API (VD: `current_user: dict = Depends(require_enterprise)`) là hệ thống sẽ tự động chặn các user không có quyền.