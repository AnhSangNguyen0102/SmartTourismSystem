# 📍 Chức năng: Đăng ký Địa điểm Doanh nghiệp

> **Module:** Location Registration  
> **Endpoint:** `POST /api/v1/locations/register`  
> **Phân quyền:** Chỉ user có `role = ENTERPRISE` và `status = ACTIVE`

---

## 📋 Mục lục

1. [Tổng quan luồng xử lý](#tổng-quan-luồng-xử-lý)
2. [Các file tạo mới](#các-file-tạo-mới)
3. [Các file cập nhật](#các-file-cập-nhật)
4. [Cấu trúc dữ liệu](#cấu-trúc-dữ-liệu)
5. [Hướng dẫn cài đặt & chạy](#hướng-dẫn-cài-đặt--chạy)
6. [Hướng dẫn test](#hướng-dẫn-test)
7. [Biến môi trường](#biến-môi-trường)
8. [Lưu ý & Known Issues](#lưu-ý--known-issues)

---

## 🔄 Tổng quan luồng xử lý

```
Doanh nghiệp nhập thông tin địa điểm
            ↓
[require_enterprise_active] Kiểm tra JWT token
  → role = ENTERPRISE?
  → enterprise_profiles.status = ACTIVE?
            ↓
[location_service] Validate nghiệp vụ
  → close_time > open_time?
  → max_price >= min_price?
  → Địa điểm đã tồn tại trong thành phố chưa?
            ↓
[_geocode_address] Google Maps Geocoding API
  → Địa chỉ text → latitude, longitude
            ↓
[Transaction] INSERT 4 bảng cùng lúc
  → LOCATIONS (status = PENDING)
  → BUSINESS_LOCATION
  → LOCATION_CATEGORIES
  → LOCATION_TAGS
            ↓
Trả về thông tin địa điểm + thông báo chờ Admin duyệt
```

---

## 🆕 Các file tạo mới

### `services/location_service.py`
Tầng Service xử lý toàn bộ logic nghiệp vụ:
- Gọi **Google Maps Geocoding API** để lấy tọa độ từ địa chỉ text
- Validate nghiệp vụ: giờ mở/đóng cửa, giá, trùng tên địa điểm
- Thực hiện **multi-table transaction** — INSERT 4 bảng trong một lần, rollback toàn bộ nếu lỗi

### `routers/location_router.py`
Định nghĩa API Endpoint `POST /api/v1/locations/register`:
- Dependency `require_enterprise_active` kiểm tra JWT + quyền ENTERPRISE
- Gọi `location_service.register_location()` xử lý nghiệp vụ
- Trả về `LocationRegisterResponse` với thông báo chờ Admin duyệt

### `test_location_register.py`
Script test tự động với 7 test case:

| TC | Mô tả | Expected |
|----|-------|----------|
| TC0 | Health check server | 200 |
| TC1 | Đăng ký hợp lệ (token ENTERPRISE + ACTIVE) | 201 |
| TC2 | Trùng tên địa điểm | 400 |
| TC3 | close_time <= open_time | 400 |
| TC4 | max_price < min_price | 400 |
| TC5 | city_id không tồn tại | 400/404 |
| TC6 | Thiếu field bắt buộc | 422 |

### `services/__init__.py` & `routers/__init__.py`
File init rỗng để biến 2 thư mục thành Python packages chuẩn.

---

## 🔄 Các file cập nhật

### `schemas.py`
Bổ sung thêm:
- `LocationCreate` — Pydantic model nhận dữ liệu từ client (bao gồm `address`, `category_ids`, `tag_ids`)
- `LocationRegisterResponse` — Response trả về gồm thông tin địa điểm + message chờ duyệt
- Cập nhật `LocationResponse` thêm trường `city_id`

### `crud/crud_location.py`
Bổ sung 5 hàm query mới (Q8 → Q12):
- `check_location_exists()` — Kiểm tra trùng tên trong cùng thành phố
- `create_location()` — INSERT vào bảng `LOCATIONS`
- `create_business_location()` — INSERT vào bảng `BUSINESS_LOCATION`
- `create_location_categories()` — INSERT vào bảng `LOCATION_CATEGORIES`
- `create_location_tags()` — INSERT vào bảng `LOCATION_TAGS`

> **Lưu ý thiết kế:** Q9-Q12 không tự commit — việc commit được đẩy lên tầng Service để đảm bảo tính toàn vẹn transaction. Nếu bất kỳ bước INSERT nào thất bại, toàn bộ sẽ được rollback, tránh dữ liệu rác trong database.

### `core/security.py`
Bổ sung block `except Exception:` trong hàm `verify_token()`:
- Trước đây: token giả mạo có thể gây crash server, trả về HTTP 500
- Sau khi sửa: mọi lỗi giải mã JWT đều được bắt và trả về HTTP 401 Unauthorized gọn gàng

```python
# Trước
except jwt.InvalidTokenError:
    raise HTTPException(401, "Token không hợp lệ")

# Sau — bắt tất cả exception còn lại
except jwt.InvalidTokenError:
    raise HTTPException(401, "Token không hợp lệ")
except Exception:
    raise HTTPException(401, "Token không hợp lệ")
```

### `main.py`
- Import và đăng ký `location_router` với prefix `/api/v1`

### `.env`
- Thêm biến `GOOGLE_API_KEY` (placeholder)

---

## 📦 Cấu trúc dữ liệu

### Request Body — `LocationCreate`
```json
{
    "location_name": "Smoke Corp Lounge Sài Gòn",
    "address": "29 Ngô Quyền, Quận 1, Hồ Chí Minh, Việt Nam",
    "city_id": 1,
    "open_time": "08:00:00",
    "close_time": "22:00:00",
    "min_price": "100000.00",
    "max_price": "500000.00",
    "currency": "VND",
    "category_ids": [1, 2],
    "tag_ids": [1, 2, 3]
}
```

### Response — `LocationRegisterResponse` (HTTP 201)
```json
{
    "location": {
        "location_id": "43c43910-e35e-4d48-9bd9-b6d5e3f95a34",
        "location_name": "Smoke Corp Lounge Sài Gòn",
        "latitude": "10.776797",
        "longitude": "106.700981",
        "city_id": 1,
        "min_price": "100000.00",
        "max_price": "500000.00",
        "currency": "VND",
        "open_time": "08:00:00",
        "close_time": "22:00:00"
    },
    "message": "Địa điểm đang chờ Admin duyệt. Chúng tôi sẽ thông báo khi có kết quả."
}
```

### Các bảng database liên quan
| Bảng | Thao tác | Mô tả |
|------|----------|-------|
| `LOCATIONS` | INSERT | Thông tin địa điểm, status = PENDING |
| `BUSINESS_LOCATION` | INSERT | Liên kết doanh nghiệp với địa điểm |
| `LOCATION_CATEGORIES` | INSERT | Danh mục của địa điểm |
| `LOCATION_TAGS` | INSERT | Tags của địa điểm |

---

## 🚀 Hướng dẫn cài đặt & chạy

### 1. Cài đặt dependencies
```bash
pip install -r requirements.txt
```

### 2. Cấu hình `.env`
```env
DATABASE_URL=postgresql://...
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
GOOGLE_API_KEY=your-google-maps-api-key
```

### 3. Chạy server
```bash
python -m uvicorn main:app --reload
```

### 4. Kiểm tra endpoint trên Swagger UI
```
http://127.0.0.1:8000/docs
```

---

## 🧪 Hướng dẫn test

### Bước 1 — Tạo JWT token cho user ENTERPRISE
```bash
python -c "
from jose import jwt
from datetime import datetime, timedelta, timezone

token = jwt.encode(
    {
        'sub': '<user_id_enterprise>',
        'role': 'ENTERPRISE',
        'exp': datetime.now(timezone.utc) + timedelta(minutes=60)
    },
    'your-secret-key-here',
    algorithm='HS256'
)
print(token)
"
```

### Bước 2 — Điền token vào file test
Mở `test_location_register.py`, tìm dòng:
```python
TOKEN = "PASTE_TOKEN_HERE"
```
Thay bằng token vừa tạo.

### Bước 3 — Chạy test

**Terminal 1 — Chạy server:**
```bash
python -m uvicorn main:app --reload
```

**Terminal 2 — Chạy test:**
```bash
python test_location_register.py
```

### Kết quả mong đợi
```
═══ TEST ĐĂNG KÝ ĐỊA ĐIỂM ═══
  [PASS] TC0 - Server UP
  [PASS] TC1 - Đăng ký hợp lệ        → 201
  [PASS] TC2 - Trùng tên             → 400
  [PASS] TC3 - close_time <= open    → 400
  [PASS] TC4 - max < min price       → 400
  [PASS] TC5 - city_id không tồn tại → 400/404
  [PASS] TC6 - Thiếu field           → 422
══════════════════════════════
  KẾT QUẢ: 7/7 PASS | 0/7 FAIL
```

---

## 🔑 Biến môi trường

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| `DATABASE_URL` | Connection string Supabase PostgreSQL | ✅ |
| `SECRET_KEY` | Khóa bí mật ký JWT token | ✅ |
| `ALGORITHM` | Thuật toán JWT (mặc định: HS256) | ✅ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Thời hạn access token (phút) | ✅ |
| `GOOGLE_API_KEY` | Google Maps Geocoding API key | ✅ |

---

## ⚠️ Lưu ý & Known Issues

### 1. Google Maps API — Bypass cho POC
Hiện tại `_geocode_address()` trong `location_service.py` đang dùng tọa độ mặc định thay vì gọi Google API thật (do chưa có API key):
```python
# TODO: Thay bằng Google Maps API thật khi có key
return 10.776797, 106.700981  # Mặc định HCM
```
Khi có `GOOGLE_API_KEY` thật → uncomment code gọi API và xóa đoạn bypass.

### 2. Địa điểm sau khi đăng ký ở trạng thái PENDING
Admin cần duyệt địa điểm trước khi hiển thị cho user. Chức năng duyệt địa điểm của Admin chưa được implement trong sprint này.

### 3. TC2 trong file test — Đã fix ✅
Token giả mạo trước đây trả về HTTP 500 — đã được fix bằng cách bổ sung `except Exception:` vào `verify_token()` trong `core/security.py`. Hiện tại trả về HTTP 401 đúng chuẩn.

### 4. Unique constraint tọa độ
Ràng buộc `UQ_LOCATION_COORD` đảm bảo không có 2 địa điểm trùng tọa độ. Khi bypass Google Maps bằng tọa độ mặc định, các test case chạy liên tiếp có thể bị conflict — đây là hành vi bình thường khi test với bypass.

---

## 👤 Người thực hiện

| Thành viên | Nhiệm vụ |
|------------|---------|
| _(tên bạn)_ | Database, CRUD, Service, Router, Test |

---

*Cập nhật lần cuối: 06/05/2026*
