# Smart Tourism System

## Báo cáo rà soát changes: dọn routing và tracking theo tuyến

Ngày thực hiện: 2026-06-06

## Phạm vi rà soát

- `42` file tracked thay đổi: `33` file chỉnh sửa và `9` file xóa hoàn toàn.
- Diff tracked hiện có `117` dòng thêm và `2.563` dòng xóa.
- `README.md` là file mới, hiện chưa được track.

## Kết luận rà soát

- Hệ thống vẫn gợi ý **địa điểm** phù hợp qua `/api/suggestions/recommend`.
- Người dùng tự chọn địa điểm và thứ tự lựa chọn được giữ nguyên khi tạo chuyến đi.
- Changes đã xóa phần routing cũ gồm TSP, OSRM, route/polyline và cảnh báo lệch hướng.
- GPS vẫn được giữ để xác thực bán kính check-in, hidden quest và các tính năng vị trí khác.
- Đây là breaking change đối với client còn gọi endpoint tracking hoặc còn đọc `routes`/`total_distance`.
- Chưa thấy reference runtime còn sót tới Google Maps, OSRM, TSP, `RouteMap`, route polyline hoặc deviation endpoint.
- Một số tài liệu/comment vẫn dùng từ `tracking` theo nghĩa cũ và cần rà soát riêng.

## Những gì đã xóa

### Danh sách 9 file bị xóa hoàn toàn

- `Backend/core/google_maps.py`
- `Frontend/src/components/RouteMap/RouteMap.js`
- `Frontend/src/components/RouteMap/RouteMap.css`
- `Frontend/src/screens/Trip/PlanningScreen.js`
- `Frontend/src/screens/Trip/TrackingScreen.js`
- `fix_routemap.py`
- `resolve_tripdetail.py`
- `scratch/update_trip_detail.py`
- `huong_dan_test_mobile.md`

### Google Maps, OSRM và tối ưu tuyến đường

- Xóa module `Backend/core/google_maps.py`.
- Xóa cấu hình `OSRM_BASE_URL` và `AVG_CITY_SPEED_KMH`.
- Xóa thuật toán TSP bitmask và nearest-neighbor.
- Xóa distance matrix, route service, travel-time fallback và polyline decoder.
- Xóa payload `start_lat`/`start_lon` và việc xin GPS khi tạo chuyến đi.

### Route segment và polyline

- Xóa model ORM `ItineraryRoutes`.
- Xóa bảng `ITINERARY_ROUTES` khỏi `Backend/schema.sql`.
- Xóa CRUD tạo route đơn lẻ và route hàng loạt.
- Xóa `RouteResponse` và trường `routes` khỏi API chi tiết chuyến đi.
- Xóa việc truy vấn route/polyline trong API.
- Xóa component:
  - `Frontend/src/components/RouteMap/RouteMap.js`
  - `Frontend/src/components/RouteMap/RouteMap.css`

### Tracking theo tuyến đường và cảnh báo lệch hướng

- Xóa endpoint:
  - `POST /api/trips/tracking`
  - `GET /api/trips/{itinerary_id}/deviation-status`
- Xóa model ORM và schema SQL:
  - `GpsTrackingLogs` / `GPS_TRACKING_LOGS`
  - `DeviationLogs` / `DEVIATION_LOGS`
- Xóa CRUD ghi GPS tracking và deviation log.
- Xóa frontend service `sendTracking()` và `getDeviationStatus()`.
- Xóa CSS badge cảnh báo lệch hướng.

### Logic và UI không còn đúng với hệ thống

- Xóa logic chấm điểm và thành tựu dựa trên quãng đường route luôn bằng `0`.
- Xóa hiển thị `0 km` ở trang chủ, lịch sử và chi tiết lịch sử.
- Xóa hai màn hình placeholder một dòng:
  - `Frontend/src/screens/Trip/PlanningScreen.js`
  - `Frontend/src/screens/Trip/TrackingScreen.js`
- Xóa các script sửa route cũ:
  - `fix_routemap.py`
  - `resolve_tripdetail.py`
  - `scratch/update_trip_detail.py`
- Xóa tài liệu test mobile `huong_dan_test_mobile.md`.

## Những gì được thay thế hoặc đổi tên

- Chi tiết địa điểm dùng `LocationDetailMap` với Leaflet/OpenStreetMap thay cho iframe và link Google Maps.
- `LocationDetailMap` chỉ hiển thị vị trí địa điểm/người dùng, không vẽ đường nối ép theo tuyến.
- `_geocode_address` được đổi thành `_resolve_coordinates` để phản ánh đúng bộ xác định tọa độ POC hiện tại.
- Tài liệu và comment cũ được cập nhật để không còn hướng dẫn sử dụng Google Maps, OSRM hoặc TSP.

## Những gì được giữ lại

- Gợi ý **địa điểm** theo ngân sách và tag sở thích.
- Planning session và dữ liệu đầu vào chuyến đi.
- Danh sách địa điểm người dùng chọn.
- Thứ tự địa điểm do người dùng chọn.
- Chia danh sách đã chọn theo ngày.
- Ngân sách dự kiến.
- Check-in theo bán kính GPS.
- Nhiệm vụ, chiến dịch và gameplay.
- Leaflet/OpenStreetMap phục vụ hiển thị bản đồ.

## Hành vi tạo chuyến đi sau cleanup

Backend chia danh sách người dùng chọn theo ngày nhưng không thay đổi thứ tự:

```python
for order, loc_id in enumerate(chunk_ids, start=1):
    create_itinerary_stop(
        db,
        location_id=loc_id,
        stop_order=order,
        ...
    )
```

Test API đã được bổ sung để xác nhận:

- Danh sách stop trả về đúng thứ tự `location_ids` người dùng gửi.
- Response chi tiết chuyến đi không còn trường `routes`.

## Ảnh hưởng tới database thật

Việc xóa model khỏi `models.py` chỉ khiến ORM không còn quản lý các bảng đó. Nó **không tự động xóa bảng hoặc dữ liệu trên database thật**.

- `SQLModel.metadata.create_all()` chỉ tạo bảng còn thiếu, không chạy `DROP TABLE` hoặc `DROP COLUMN`.
- Các bảng cũ đã tồn tại trên database thật vẫn còn nguyên.
- Backend mới không còn đọc hoặc ghi các bảng cũ.
- Chỉ migration có lệnh `DROP`, `SQLModel.metadata.drop_all()` hoặc SQL thủ công mới xóa dữ liệu.

Trường `itineraries.total_distance` vẫn được giữ nội bộ và gán `0` vì database hiện tại khai báo `NOT NULL`. Trường này không còn:

- Được trả trên API.
- Được hiển thị trên UI.
- Được dùng để tính điểm.

Nếu nhóm muốn xóa vật lý các bảng/cột cũ trên database thật, cần viết và kiểm tra một migration riêng.

## Điểm cần review trước khi commit

### Thay đổi credential database

`Backend/.env` đang đổi `DATABASE_URL` sang một credential database khác. Đây là thay đổi ngoài phạm vi cleanup và có nguy cơ làm lộ credential vì `.env` đang được Git theo dõi.

- Xác nhận đúng database mục tiêu trước khi commit/deploy.
- Không commit credential thật; chuyển sang secret của môi trường triển khai.
- Rotate credential nếu chuỗi hiện tại đã từng được chia sẻ hoặc push.

### Breaking changes của API

- Xóa `POST /api/trips/tracking`.
- Xóa `GET /api/trips/{itinerary_id}/deviation-status`.
- Xóa `routes` khỏi response chi tiết chuyến đi.
- Xóa `total_distance` khỏi response tạo chuyến đi, lịch sử và chi tiết.
- Xóa `start_lat`/`start_lon` khỏi payload tạo chuyến đi.

Client hoặc tài liệu API cũ dùng các endpoint/trường trên sẽ cần cập nhật.

### File xóa cần xác nhận

`huong_dan_test_mobile.md` là tài liệu hướng dẫn khởi chạy và kiểm thử mobile tổng quát, không chỉ liên quan tới routing/tracking. Cần xác nhận việc xóa file này là chủ ý trước khi commit.

### Tài liệu/comment còn lệch

Reference runtime đã sạch, nhưng vẫn còn mô tả tracking cũ tại một số nơi, tiêu biểu:

- `SECURITY_HARDENING_REPORT.md` vẫn nói tracking GPS ghi log.
- `cau_truc_thu_muc.txt` vẫn mô tả `trips.py` có tracking.
- `Backend/crud/crud_itinerary.py` vẫn nhắc “Tracking screen”.
- `Backend/readme.md` và `Backend/database_seeding/readme.md` vẫn mô tả tracking cũ.
- Bảng tổng kết trong `Backend/crud/CRUD_README.md` chưa khớp số hàm tracking hiện tại.

## Xác minh

- Reference scan runtime: không còn Google Maps, OSRM, TSP, polyline route, `RouteMap`, deviation endpoint hoặc tracking endpoint theo route.
- `git diff --check`: đạt.
- `python -m py_compile` cho toàn bộ file Python đã sửa: đạt.
- Import FastAPI `main` và tạo toàn bộ SQLModel metadata trên SQLite: đạt.
- `npm run build`: đạt, còn `4` ESLint warning ở các component ngoài phạm vi cleanup.
- Pytest mục tiêu đã được chạy thử nhưng bị chặn khi nạp `tests/conftest.py`: `database.py` truyền `max_overflow` cho SQLite và phát sinh `TypeError`.

## Ghi chú ngoài phạm vi

- Cleanup không tạo migration để xóa vật lý bảng/cột cũ trên database thật.
- Các khái niệm `total_distance`, achievement/quest loại `DISTANCE` và leaderboard khoảng cách vẫn còn ở một số model/schema gamification, nhưng không còn được cập nhật từ route chuyến đi.
