# 📘 CRUD Query Documentation
## Du Lịch Thông Minh Việt Nam – Backend Database Layer

> **Tổng quan:** Hệ thống gồm **9 module CRUD** với **46 hàm query** bao phủ toàn bộ các Use Case của ứng dụng, xây dựng trên nền **FastAPI + SQLModel + PostgreSQL (Supabase)**.

---

## 🛠️ Tech Stack

| Thành phần | Thư viện |
|------------|----------|
| Web Framework | `FastAPI >= 0.111.0` |
| ORM | `SQLModel >= 0.0.18` + `SQLAlchemy >= 2.0.0` |
| Database Driver | `psycopg2-binary >= 2.9.9` |
| Auth / JWT | `python-jose[cryptography] >= 3.3.0` |
| Password Hashing | `bcrypt < 4.0.0` |
| Validation | `pydantic >= 2.0.0` + `email-validator` |

---

## 🔐 Module 1 – `crud/crud_auth.py`
**Use Case: Đăng nhập & Kiểm soát thiết bị**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `get_user_by_email` | SELECT | `users` | Tìm tài khoản theo email để xác thực đăng nhập |
| Q2 | `get_active_sessions_count` | SELECT | `user_sessions` | Đếm số thiết bị đang đăng nhập (so sánh với limit) |
| Q2 | `get_active_sessions` | SELECT | `user_sessions` | Lấy danh sách session đang active của user |
| Q2 | `get_session_by_device` | SELECT | `user_sessions` | Tìm session theo device_id cụ thể |
| Q3 | `revoke_oldest_sessions` | UPDATE | `user_sessions` | Thu hồi các session cũ nhất khi vượt giới hạn thiết bị |
| Q3 | `revoke_session_by_device` | UPDATE | `user_sessions` | Thu hồi session của một thiết bị cụ thể khi đăng xuất |
| Q3 | `revoke_all_sessions` | UPDATE | `user_sessions` | Thu hồi toàn bộ session (đăng xuất tất cả thiết bị) |
| Q4 | `create_user_session` | INSERT | `user_sessions` | Tạo session mới, lưu refresh token hash + device_id |
| Q5 | `get_user_profile_with_preferences` | SELECT | `user_profiles`, `preference_tag_weights` | Lấy avatar, tên và danh sách sở thích sau khi đăng nhập thành công |

---

## 👤 Module 2 – `crud/crud_user.py`
**Use Case: Quản lý User, Sở thích & KYC**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `get_user_by_email` | SELECT | `users` | Kiểm tra email đã tồn tại chưa (dùng cho đăng ký) |
| Q2 | `create_user` | INSERT | `users` | Tạo tài khoản mới, tự động hash password, status PENDING |
| Q3 | `get_user_tag_weights` | SELECT | `preference_tag_weights` | Lấy trọng số sở thích của user theo tag |
| Q4 | `update_user_tag_weights` | UPSERT | `preference_tag_weights` | Cập nhật / học sở thích user sau mỗi tương tác |
| Q5 | `get_user_category_history` | SELECT | `category_visit_history` | Lấy lịch sử danh mục địa điểm user đã ghé thăm |
| Q6 | `update_category_visit_history` | UPSERT | `category_visit_history` | Tăng điểm lịch sử khi user ghé một danh mục địa điểm |
| Q7 | `get_user_avg_budget` | SELECT | `planning_sessions` | Tính ngân sách trung bình user từng lập kế hoạch |
| Q8 | `update_user_status` | UPDATE | `users` | Cập nhật trạng thái tài khoản (PENDING → ACTIVE, BANNED...) |
| Q9 | `create_user_profile` | INSERT | `user_profiles` | Khởi tạo profile trống sau khi xác minh tài khoản thành công |
| Q10 | `update_user_role` | UPDATE | `users` | Nâng cấp role user (USER → ENTERPRISE sau khi Admin duyệt) |
| Q11 | `update_user_profile` | UPDATE | `user_profiles` | Cập nhật thông tin cá nhân, ảnh đại diện, travel style... |
| Q12 | `update_user_kyc_status` | UPDATE | `user_profiles` | Cập nhật trạng thái KYC (PENDING / APPROVED / REJECTED) |

---

## 🏢 Module 3 – `crud/crud_enterprise.py`
**Use Case: Đăng ký doanh nghiệp & Duyệt hồ sơ**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `create_enterprise_profile` | INSERT | `enterprise_profiles` | Lưu hồ sơ doanh nghiệp mới với status PENDING |
| Q2 | `get_pending_enterprise_profiles` | SELECT | `enterprise_profiles` | Lấy danh sách hồ sơ đang chờ Admin xét duyệt |
| Q3 | `update_enterprise_status` | UPDATE | `enterprise_profiles` | Duyệt (ACTIVE) hoặc từ chối (REJECTED) hồ sơ doanh nghiệp |
| Q4 | `create_verification_log` | INSERT | `verification_logs` | Ghi lại hành động duyệt/từ chối của Admin kèm lý do |

---

## 🌍 Module 4 – `crud/crud_reference.py`
**Use Case: Reference / Master Data**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `get_active_cities` | SELECT | `cities` | Lấy danh sách thành phố đang được hỗ trợ (is_active = true) |
| Q2 | `get_all_categories` | SELECT | `categories` | Lấy tất cả danh mục địa điểm (Tham quan, Ẩm thực...) |
| Q3 | `get_all_tags` | SELECT | `tags` | Lấy toàn bộ tag để user tick chọn sở thích khi onboarding |

---

## 📍 Module 5 – `crud/crud_location.py`
**Use Case: Quản lý địa điểm & Gợi ý**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `get_locations_by_city_and_categories` | SELECT | `locations`, `location_categories`, `cities` | Lấy danh sách địa điểm theo thành phố, có filter danh mục (phục vụ AI gợi ý) |
| Q2 | `get_location_tags` | SELECT | `tags`, `location_tags` | Lấy danh sách tag gắn với một địa điểm cụ thể |
| Q3 | `get_location_by_ids` | SELECT | `locations` | Lấy chi tiết địa điểm theo danh sách ID |
| Q4 | `get_location_images` | SELECT | `locations_image` | Lấy thư viện ảnh của một địa điểm |

---

## 📝 Module 6 – `crud/crud_planning.py`
**Use Case: Quản lý phiên lập kế hoạch**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `create_planning_session` | INSERT | `planning_sessions` | Lưu yêu cầu chuyến đi (ngày đi, ngân sách, số người...) |
| Q2 | `create_session_preferences` | INSERT | `travel_request_preferences` | Lưu các tag sở thích user chọn cho chuyến đi cụ thể |
| Q3 | `get_planning_session` | SELECT | `planning_sessions` | Lấy thông tin phiên lập kế hoạch theo session_id |
| Q4 | `update_session_status` | UPDATE | `planning_sessions` | Cập nhật trạng thái phiên (PENDING → SUGGESTING → CONFIRMED) |

---

## 🗺️ Module 7 – `crud/crud_itinerary.py`
**Use Case: Quản lý lộ trình**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `create_itinerary` | INSERT | `itineraries` | Lưu thông tin tổng quan chuyến đi (tổng ngân sách, thời gian...) |
| Q2 | `create_itinerary_days` | INSERT | `itinerary_days` | Tạo lịch trình từng ngày (Ngày 1, Ngày 2...) |
| Q3 | `create_itinerary_stops` | INSERT | `itinerary_stops` | Lưu từng điểm dừng (trạm) trong một ngày |
| Q4 | `create_itinerary_routes` | INSERT | `itinerary_routes` | Lưu thông tin tuyến đường giữa 2 trạm (khoảng cách, polyline) |
| Q5 | `get_itinerary_full` | SELECT | `itineraries`, `itinerary_days`, `itinerary_stops` | Lấy toàn bộ dữ liệu lộ trình: Chuyến đi → Ngày → Điểm dừng |
| Q6 | `update_itinerary_status` | UPDATE | `itineraries` | Cập nhật trạng thái lộ trình (DRAFT → CONFIRMED → COMPLETED) |
| Q7 | `get_itinerary_history` | SELECT | `itineraries` | Lấy lịch sử các chuyến đi của user |
| Q8 | `get_itinerary_stops_with_locations` | SELECT | `itinerary_days`, `itinerary_stops`, `locations` | Lấy danh sách điểm dừng kèm tọa độ địa lý (phục vụ màn hình bản đồ) |

---

## 🎯 Module 8 – `crud/crud_tracking.py`
**Use Case: Tracking hành trình & Check-in**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `create_checkin_progress` | INSERT | `checkin_progress` | Tạo bản ghi check-in mới tại một điểm dừng |
| Q2 | `update_checkin_status` | UPDATE | `checkin_progress`, `itinerary_stops` | Đánh dấu check-in hoàn tất, cập nhật trạng thái stop → COMPLETED |
| Q3 | `create_gps_log` | INSERT | `gps_tracking_logs` | Ghi nhận tọa độ GPS real-time của user trong hành trình |
| Q4 | `create_deviation_log` | INSERT | `deviation_logs` | Ghi lại cảnh báo khi user đi chệch quá xa so với lộ trình |
| Q5 | `verify_stop_in_itinerary` | SELECT | `itinerary_days`, `itinerary_stops` | Xác minh điểm dừng có thuộc chuyến đi hiện tại không |
| Q6 | `get_checkin_by_stop` | SELECT | `checkin_progress` | Kiểm tra user đã check-in tại điểm dừng này trước đó chưa |
| Q7 | `get_stop_with_radius` | SELECT | `itinerary_stops`, `locations` | Lấy tọa độ và bán kính cho phép check-in của một điểm dừng |

---

## ⭐ Module 9 – `crud/crud_feedback.py`
**Use Case: Thu thập Feedback**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `create_user_feedback` | INSERT | `user_feedbacks` | Lưu feedback (BUG / SUGGESTION / REPORT) từ user |
| Q2 | `get_system_feedbacks` | SELECT | `user_feedbacks` | Lấy danh sách feedback cho Admin xử lý |

---

## ⚙️ Module 10 – `crud/crud_system.py`
**Use Case: System Settings & Exports**

| # | Hàm | Thao tác | Bảng | Mô tả |
|---|-----|----------|------|-------|
| Q1 | `get_system_setting` | SELECT | `system_settings` | Lấy cấu hình hệ thống theo config_key (ví dụ: max_devices) |
| Q2 | `create_export_history` | INSERT | `export_histories` | Tạo bản ghi export file (Excel/PDF) với status PROCESSING |
| Q3 | `update_export_status` | UPDATE | `export_histories` | Cập nhật kết quả export (COMPLETED / FAILED) kèm file URL |

---

## 🔐 Security Layer – `core/security.py`

| Hàm | Mô tả |
|-----|-------|
| `get_password_hash(password)` | Hash password bằng bcrypt trước khi lưu DB |
| `verify_password(plain, hashed)` | So sánh password plain-text với bcrypt hash |
| `create_access_token(data)` | Tạo JWT Access Token (thời hạn ngắn, tính bằng phút) |
| `create_refresh_token(data)` | Tạo JWT Refresh Token (thời hạn dài, mặc định 7 ngày) |
| `verify_token(credentials)` | FastAPI Dependency – verify token từ Authorization Header |

---

## 📊 Tổng kết

| Module | File | Số hàm |
|--------|------|--------|
| Auth | `crud_auth.py` | 9 |
| User | `crud_user.py` | 12 |
| Enterprise | `crud_enterprise.py` | 4 |
| Reference | `crud_reference.py` | 3 |
| Location | `crud_location.py` | 4 |
| Planning | `crud_planning.py` | 4 |
| Itinerary | `crud_itinerary.py` | 8 |
| Tracking | `crud_tracking.py` | 7 |
| Feedback | `crud_feedback.py` | 2 |
| System | `crud_system.py` | 3 |
| **TỔNG** | | **56 hàm** |

---

*Tài liệu được tạo tự động – cập nhật lần cuối: 06/05/2026*
