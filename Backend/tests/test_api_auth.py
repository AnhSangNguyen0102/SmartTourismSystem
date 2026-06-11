import pytest
from datetime import datetime, timedelta, timezone, date
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlmodel import Session
import hashlib

from models import Users, UserProfiles, UserRole, UserStatus, RegisterType, EnterpriseProfiles, EnterpriseStatus
from core.security import create_access_token, create_refresh_token, get_password_hash
from routers.auth import otp_storage, register_otp_storage

@pytest.fixture(autouse=True)
def clean_otp_storages():
    """Dọn dẹp bộ nhớ tạm lưu OTP trước mỗi test case."""
    otp_storage.clear()
    register_otp_storage.clear()
    yield
    otp_storage.clear()
    register_otp_storage.clear()

def test_check_email_endpoints(client: TestClient, db_session: Session):
    # 1. Test check-email không tồn tại
    response = client.get("/api/auth/check-email?email=new.user@gmail.com")
    assert response.status_code == 200
    assert response.json() == {"exists": False, "is_pending": False}

    # 2. Test check-email rác (bị chặn)
    response = client.get("/api/auth/check-email?email=trash@tempmail.com")
    assert response.status_code == 400
    assert "email tạm thời hoặc email rác" in response.json()["detail"]

    # 3. Test check-email định dạng sai
    response = client.get("/api/auth/check-email?email=invalidemail")
    assert response.status_code == 400

    # 4. Test check-email đã tồn tại
    user = Users(
        user_id=uuid4(),
        full_name="Đã Tồn Tại",
        email="existing@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()
    
    response = client.get("/api/auth/check-email?email=existing@gmail.com")
    assert response.status_code == 200
    assert response.json() == {"exists": True, "is_pending": False}

def test_registration_and_otp_verification_flow(client: TestClient, db_session: Session):
    # 1. Đăng ký tài khoản mới thành công
    reg_data = {
        "full_name": "Nguyễn Đăng Ký",
        "email": "dangky@gmail.com",
        "password": "Password123!",
        "register_type": "EMAIL",
        "role": "USER"
    }
    response = client.post("/api/auth/register", json=reg_data)
    assert response.status_code == 200
    assert response.json()["status"] == "verification_pending"
    assert response.json()["email"] == "dangky@gmail.com"

    # Kiểm tra xem user được tạo ở trạng thái PENDING
    user_in_db = db_session.query(Users).filter(Users.email == "dangky@gmail.com").first()
    assert user_in_db is not None
    assert user_in_db.status == UserStatus.PENDING

    # Kiểm tra xem OTP đã được lưu trong storage chưa
    email_key = "dangky@gmail.com"
    assert email_key in register_otp_storage
    
    # Lấy OTP thô từ cache bằng cách mò hash (hoặc bypass bằng cách đặt giá trị xác định)
    # Vì OTP được tạo ngẫu nhiên, ta sẽ sửa đổi mã OTP đã lưu trong storage sang một mã cố định để test verify
    test_otp = "123456"
    hashed_otp = hashlib.sha256(test_otp.encode()).hexdigest()
    register_otp_storage[email_key]["otp"] = hashed_otp

    # 2. Xác thực OTP sai
    verify_data = {"email": "dangky@gmail.com", "otp": "000000"}
    response = client.post("/api/auth/verify-registration", json=verify_data)
    assert response.status_code == 400
    assert "Mã OTP không chính xác" in response.json()["detail"]

    # 3. Xác thực OTP đúng
    verify_data["otp"] = "123456"
    response = client.post("/api/auth/verify-registration", json=verify_data)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Xác minh user đã ACTIVE và có profile được tạo tự động
    db_session.refresh(user_in_db)
    assert user_in_db.status == UserStatus.ACTIVE
    
    profile = db_session.query(UserProfiles).filter(UserProfiles.user_id == user_in_db.user_id).first()
    assert profile is not None
    assert profile.full_name == "Nguyễn Đăng Ký"
    assert profile.gender == "OTHER"

def test_login_endpoint(client: TestClient, db_session: Session):
    # Tạo user ACTIVE để login
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Thành Viên Active",
        email="active@gmail.com",
        passwordhash=get_password_hash("Password123!"),
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    # Tạo kèm profile
    profile = UserProfiles(
        user_id=user_id,
        full_name="Thành Viên Active",
        date_of_birth=date(1995, 1, 1),
        gender="MALE",
        avatar_url="http://avatar.com/1.png"
    )
    db_session.add(user)
    db_session.add(profile)
    db_session.commit()

    # 1. Login sai mật khẩu
    login_data = {"email": "active@gmail.com", "password": "WrongPassword!"}
    response = client.post("/api/auth/login", json=login_data)
    assert response.status_code == 401
    assert "Mật khẩu không chính xác" in response.json()["detail"]

    # 2. Login thành công
    login_data["password"] = "Password123!"
    response = client.post("/api/auth/login", json=login_data)
    assert response.status_code == 200
    res_json = response.json()
    assert "access_token" in res_json
    assert "refresh_token" in res_json
    assert res_json["user"]["email"] == "active@gmail.com"
    assert res_json["user"]["avatar_url"] == "http://avatar.com/1.png"

def test_google_login(client: TestClient, db_session: Session):
    # Endpoint /google-login sử dụng verify_oauth2_token của Google đã được mock tự động trong conftest
    token_payload = {"token": "dummy-google-jwt-token", "device_id": "Pixel-7"}
    response = client.post("/api/auth/google-login", json=token_payload)
    
    assert response.status_code == 200
    res_json = response.json()
    assert "access_token" in res_json
    assert "refresh_token" in res_json
    assert res_json["user"]["email"] == "test_google@example.com"
    assert res_json["user"]["full_name"] == "Google Tester"

    # Kiểm tra xem user Google đã được tạo tự động trong DB chưa
    user = db_session.query(Users).filter(Users.email == "test_google@example.com").first()
    assert user is not None
    assert user.register_type == RegisterType.SOCIAL

def test_me_and_update_profile_endpoints(client: TestClient, db_session: Session):
    # Tạo user mẫu
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Nguyễn Văn Me",
        email="me@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    profile = UserProfiles(
        user_id=user_id,
        full_name="Nguyễn Văn Me",
        date_of_birth=date(1996, 6, 6),
        gender="MALE",
        bio="Lập trình viên test /me"
    )
    db_session.add(user)
    db_session.add(profile)
    db_session.commit()

    # Sinh access token cho user
    access_token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {access_token}"}

    # 1. Gọi API /me
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["user"]["email"] == "me@gmail.com"
    assert res_json["user"]["bio"] == "Lập trình viên test /me"

    # 2. Gọi API /update-profile
    update_data = {
        "bio": "Bio đã cập nhật thông qua API",
        "gender": "FEMALE",
        "base_location": "Sài Gòn"
    }
    response = client.put("/api/auth/update-profile", json=update_data, headers=headers)
    assert response.status_code == 200
    assert response.json()["message"] == "Cập nhật hồ sơ thành công!"

    # Xác minh lại thông tin đã đổi trong DB
    db_session.refresh(profile)
    assert profile.bio == "Bio đã cập nhật thông qua API"
    assert profile.gender == "FEMALE"
    assert profile.base_location == "Sài Gòn"

def test_forgot_reset_password_flow(client: TestClient, db_session: Session):
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Người Quên Mật Khẩu",
        email="quenpass@gmail.com",
        passwordhash=get_password_hash("OldPassword123!"),
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()

    # 1. Gửi yêu cầu quên mật khẩu
    response = client.post("/api/auth/forgot-password", json={"email": "quenpass@gmail.com"})
    assert response.status_code == 200

    # Lấy OTP và set cố định
    email_key = "quenpass@gmail.com"
    assert email_key in otp_storage
    test_otp = "888888"
    otp_storage[email_key]["otp"] = hashlib.sha256(test_otp.encode()).hexdigest()

    # 2. Xác thực OTP khôi phục
    response = client.post("/api/auth/verify-reset-otp", json={"email": "quenpass@gmail.com", "otp": "888888"})
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # 3. Đổi mật khẩu mới
    reset_payload = {
        "email": "quenpass@gmail.com",
        "otp": "888888",
        "new_password": "NewPassword123!"
    }
    response = client.post("/api/auth/reset-password", json=reset_payload)
    assert response.status_code == 200
    assert "Đổi mật khẩu thành công" in response.json()["message"]

    # Xác minh OTP đã bị xóa sau khi đổi mật khẩu
    assert email_key not in otp_storage

    # Thử login bằng mật khẩu mới
    response = client.post("/api/auth/login", json={"email": "quenpass@gmail.com", "password": "NewPassword123!"})
    assert response.status_code == 200
    assert "access_token" in response.json()
