# Báo Cáo Kỹ Thuật Chức Năng 2: Gợi ý, Xây dựng & Theo dõi Lộ trình (Sprint 4)

## 1. Những thay đổi và tính năng đã thực hiện

Chức năng 2 đã được tích hợp hoàn chỉnh theo đúng thiết kế CSDL (File CSV `CauTrucDatabaseThucTe.csv`) với các hạng mục sau:

- Khai báo mới **7 Bảng dữ liệu** vào file `models.py` bằng SQLAlchemy.
- Xây dựng **Tầng Thuật toán lõi** (`core/algorithms.py`) tính toán độ khớp sở thích và khoảng cách thực tế.
- Xây dựng **Tầng Truy xuất** (`crud/crud_location.py`, `crud_trip.py`) xử lý query.
- Xây dựng **Tầng API** (`api/locations.py`, `api/trips.py`) làm Endpoints cho Client gọi.
- **Bảo mật:** Đã khóa API của Chức năng 2 bằng cơ chế JWT (`security.verify_token`), đồng bộ với chức năng Auth của nhóm để chặn người dùng chưa đăng nhập.

---

## 2. Các Bảng Database đã thêm vào hệ thống

| Tên Bảng (SQLAlchemy) | Tương ứng trong CSV | Chức năng |
| :--- | :--- | :--- |
| `City` | `CITIES` | Quản lý Tỉnh/Thành phố. |
| `Location` | `LOCATIONS` | Quản lý Địa điểm du lịch (với `min_price`, `max_price`). |
| `Tag` | `TAGS` | Danh mục sở thích (Biển, Núi, Thư giãn...). |
| `LocationTag` | `LOCATIONS_TAG` | Bảng trung gian nối N-N giữa Location và Tag. |
| `Itinerary` | `ITINERARIES` | Quản lý Lộ trình tổng quát của User. |
| `ItineraryDay` | `ITINERARIES_DAYS` | Quản lý phân chia từng ngày trong Lộ trình. |
| `ItineraryStop` | `ITINERARIES_STOPS` | Quản lý chi tiết từng trạm dừng trong ngày & Bán kính Check-in. |
| `CheckinProgress` | `CHECKIN_PROGRESS` | Log lưu lại tọa độ GPS thực tế lúc user bấm Check-in (chống Fake GPS). |

*(Lưu ý: Khóa chính của bảng người dùng (`user_id`) đã được thống nhất chuyển sang dạng Chuỗi `String(36)` - UUID để tuân thủ thiết kế thực tế của CSV).*

---

## 3. Khai báo Chi tiết Thuật toán

Chức năng sử dụng 2 thuật toán lõi:

### A. Thuật toán gợi ý địa điểm (Scoring)
Khi người dùng nhập Ngân sách và Các tag sở thích mong muốn, hệ thống áp dụng:
1. **Ràng buộc cứng (Hard Constraint):** `location.min_price > user_budget` $\rightarrow$ Loại bỏ lập tức.
2. **Ràng buộc mềm (Jaccard Similarity):** Tính độ tương đồng giữa mảng Tag của User ($A$) và mảng Tag của Địa điểm ($B$).
   $$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$
   *Địa điểm có điểm Jaccard càng cao sẽ được xếp hạng (Rank) lên trên cùng.*
3. **Thưởng (Bonus):** Nếu `max_price` của địa điểm cũng bé hơn hoặc bằng `budget` của User, cộng thêm `0.2` điểm thưởng để ưu tiên các địa điểm hoàn toàn an toàn về giá.

### B. Thuật toán Không gian (Haversine Formula)
Dùng để tính Khoảng cách đường chim bay giữa 2 điểm GPS (Kinh độ/Vĩ độ):
1. **Ước lượng thời gian:** Tính khoảng cách chia cho Vận tốc trung bình (40km/h) để ra thời gian di chuyển (Estimate Travel Time) khi lên lịch trình.
2. **Kiểm duyệt Check-in:** Khi user bấm checkin tại `ItineraryStop`, tính khoảng cách từ tọa độ điện thoại (`user_lat`, `user_lon`) đến tọa độ của trạm. Nếu khoảng cách (mét) $\le$ `checkin_radius` của trạm $\rightarrow$ Check-in thành công.

---

## 4. Dự báo Thay đổi & Khả năng Tái sử dụng cho các chức năng khác

### 🚀 Tính kế thừa (Tái sử dụng)
Những chức năng khác hoàn toàn có thể tái sử dụng "tài sản" của Chức năng 2:
- **Chức năng Tìm kiếm (Search) / Hiển thị địa điểm:** Có thể dùng lại file `crud_location.py` (đã có sẵn query truy xuất địa điểm kèm Tags).
- **Chức năng Gamification (Làm nhiệm vụ / Đổi quà):** Dễ dàng "lắng nghe" dữ liệu thay đổi từ bảng `CheckinProgress` hoặc `ItineraryStop.status == 'COMPLETED'`. Khi trạm dừng được Check-in thành công, Gamification có thể tự động trigger cộng điểm (Reward) cho User.
- **Chức năng Quản lý chi phí chuyến đi:** Có thể lấy tổng `total_budget` và `currency` từ bảng `Itinerary` để dựng biểu đồ.

### ⚠️ Khả năng Conflict & Sửa đổi trong tương lai
- **Conflict Auth:** Hàm `get_current_user_id` hiện đang phụ thuộc vào việc User login bằng Email. Nếu module Auth thêm chức năng Login bằng Social (Google/Facebook) mà không lưu Email, hàm này sẽ cần sửa lại logic truy vấn `user_id`.
- **Logic Tính Thời Gian / Đường đi:** Hàm ước lượng thời gian `estimate_travel_time` hiện tại chỉ dùng khoảng cách đường chim bay chia cho vận tốc cố định. Trong tương lai, nếu nhóm tích hợp **Google Maps API** hoặc **OSRM** (Chức năng Tối ưu / Planning), hàm này sẽ bị thay thế bởi API call thực tế.
- **Trạng thái (Status):** Nếu Chức năng Xử lý sau khi kết thúc có định nghĩa thêm các trạng thái mới (như `REVIEWED`), ta cần sửa đổi lại các lệnh Check `status` ở file API.
