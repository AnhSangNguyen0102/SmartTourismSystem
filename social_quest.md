1. Hướng dẫn Thiết lập Cơ sở dữ liệu Redis Cloud
Vì hệ thống quản lý real-time lock và vị trí người chơi liên tục trên RAM, ứng dụng bắt buộc phải kết nối tới một cụm Redis Server. Sau đây là cách tạo tài khoản đám mây miễn phí để lấy Endpoint và URL:

Bước 1: Tạo tài khoản Redis Cloud
Truy cập vào trang chủ: [https://app.redislabs.com/](https://app.redislabs.com/)
Đăng ký một tài khoản mới (hoặc chọn đăng nhập nhanh bằng Google Github).

Bước 2: Tạo một Database Miễn phí
Sau khi đăng nhập, bấm vào nút dấu + ở Databases bên menu để tạo mới.
Tại phần gói dung lượng, chọn gói **Fixed / Free 30MB** (Gói này hoàn toàn miễn phí, đủ sức đáp ứng cho việc test lab và làm đồ án).
Bấm **Create** để khởi tạo cụm dữ liệu.

Bước 3: Thu thập thông tin Endpoint, Port và Password
Sau khi Database hiển thị trạng thái hoạt động màu xanh, bạn cuộn xuống giao diện cấu hình để lấy 3 thông số then chốt:
**Public endpoint:** Có cấu trúc dạng chuỗi ký tự (Ví dụ: `redis-12345.c1.ap-southeast-1-1.ec2.cloud.redislabs.com:12345`).
   * Phần chữ trước dấu `:` chính là **Endpoint**.
   * Phần số sau dấu `:` chính là **Port**.
**Security / Default user password:** Bấm vào biểu tượng con mắt hoặc nút Copy để lấy chuỗi **Mật khẩu** ngẫu nhiên dài do hệ thống tự sinh.

Bước 4: Tạo chuỗi biến môi trường `REDIS_URL`
Bạn ráp các mảnh thông tin trên vào định dạng chuẩn sau trong file .env:
REDIS_URL="redis://default:MAT_KHAU_CUA_BAN@PUBLIC_ENDPOINT_CUA_BAN:PORT/0"

2. Hãy chuẩn bị 2 cửa sổ trình duyệt đặt song song trên màn hình máy tính của bạn:

Cửa sổ 1 (Người chơi A): Mở Tab trình duyệt thông thường (http://localhost:3000), tiến hành đăng nhập tài khoản A.

Cửa sổ 2 (Người chơi B): Mở một Tab trình duyệt ở chế độ Ẩn danh (Incognito) hoặc trình duyệt khác độc lập, đăng nhập tài khoản B.

3. Luồng hoạt động

Điều kiện: User A và User B đang ở gần nhau trong phạm vi 15m.

Cả 2 user bấm vào nút "Phát tín hiệu" trên khung giả lập DEV: MOCK GPS thì sẽ hiện màn hình nhiệm vụ tương tác. 2 user nhấn vào nút tham gia thì sẽ hiện tọa độ điểm hẹn chung, 2 user cùng đi đến điểm hẹn.

Nếu 2 user ở gần trong phạm vi 3m thì sẽ nhấn vào nút đã gặp nhau, quét gps để xác nhận thành công, nếu quá phạm vi 3m thì sẽ hiện cách (...m) và nhắc nhở đến gần lại.

Nếu 1 trong 2 user nhấn từ chối tham gia hoặc hủy nhiệm vụ thì trở về màn hình chính

Khung 🛰️ DEV: MOCK GPS được thiết kế ở góc dưới màn hình ứng dụng Frontend làm nhiệm vụ giả lập hành vi di chuyển vật lý của người dùng trên trình duyệt web.