# ĐỀ XUẤT THAY ĐỔI CẤU TRÚC THƯ MỤC dummy_data NHƯ SAU (ĐỔI THÀNH CÁC FILE NHƯ TRONG THƯ MỤC database_seeding)

**Lý do thay đổi:** Việc sử dụng các script Python cho thấy hiệu quả vượt trội trong việc xử lý các ràng buộc khóa ngoại (Foreign Keys) phức tạp, tự động hóa luồng dữ liệu và dễ dàng reset môi trường test hơn so với SQL.

## 📊 Nguồn dữ liệu (Data Source)
* Dữ liệu tham quan, lưu trú, ăn uống cốt lõi được trích xuất và xử lý từ dataset **Vietnam_tourism_2026_v2** trên Kaggle (Tác giả: *prPlayerAnh*). 
* 🔗 **Link Dataset:** [Vietnam Tourism 2026 v2](https://www.kaggle.com/datasets/prplayeranh/vietnam-tourism-2026-v2)
* Ngoài nguồn dữ liệu trên, nhóm đã chủ động thiết kế và bổ sung thêm các bộ dữ liệu mô phỏng giả lập (Mock Users, Lịch trình, Tọa độ Tracking...) để đáp ứng đầy đủ các tính năng đặc thù không có sẵn trong dataset gốc.

# 🗄️ Database Seeding

Thư mục này chứa các script Python (`seed_data`) dùng để khởi tạo và giả lập dữ liệu mẫu cho database (Supabase/PostgreSQL) của dự án Hệ Thống Du Lịch Thông Minh.

Việc tạo dữ liệu mẫu giúp các thành viên trong nhóm (Frontend, Backend, AI) có sẵn dữ liệu chuẩn để phát triển và kiểm thử các tính năng như: Gợi ý địa điểm, Lên lịch trình (Planning) và Tracking mà không cần thao tác thủ công trên ứng dụng.

## 📦 Yêu cầu cài đặt (Prerequisites)

Trước khi chạy script, hãy đảm bảo môi trường máy tính của bạn đã cài đặt Python và các thư viện cần thiết.

1. Cài đặt các thư viện Python:
   ```bash
   pip install supabase
   pip install Faker
Đảm bảo file dữ liệu gốc Vietnam_tourism_2026.json nằm cùng thư mục với các script.

Cấu hình API Key: Mở 2 file .py, thay thế biến url và key bằng thông tin cấu hình Supabase thực tế của dự án. (Lưu ý: Không push API Key thật lên GitHub).

# 📂 Cấu trúc các file Script
Hệ thống script được chia làm 2 giai đoạn chạy tuần tự:

1. Dữ liệu tĩnh (Master Data)
File: seed_location_tag.py

Mục đích: Đọc dữ liệu từ file JSON và đổ vào database.

Các bảng bị ảnh hưởng: categories, cities, locations, tags, location_categories, location_tags.

Tần suất chạy: Thường chỉ chạy 1 lần duy nhất khi khởi tạo database mới hoặc khi file JSON có cập nhật lớn.

2. Dữ liệu giao dịch (Transaction/Mock Data)
File: seed_user_planning.py

Mục đích: Sử dụng thư viện Faker để tạo ra các người dùng ảo, gán sở thích và tự động sinh ra các lịch trình chuyến đi chi tiết theo từng ngày.

Các bảng bị ảnh hưởng: users, user_profiles, preference_tag_weights, planning_sessions, itineraries, itinerary_days, itinerary_stops.

Tần suất chạy: Chạy nhiều lần trong quá trình dev để reset hoặc tạo thêm dữ liệu test thuật toán AI và UI Lịch trình.