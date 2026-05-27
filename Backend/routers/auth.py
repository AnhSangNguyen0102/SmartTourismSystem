import secrets
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from sqlmodel import select
from jose import jwt, JWTError

from datetime import datetime, timedelta, timezone 
from pydantic import BaseModel # Thêm thư viện này để tạo form nhận OTP


from database import get_session
import crud.crud_user as crud_user
import crud.crud_auth as crud_auth 
import schemas
from models import EnterpriseProfiles, EnterpriseStatus, UserRole, UserStatus
import core.security as security

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# Thay bằng Client ID của nhóm
GOOGLE_CLIENT_ID = "(Thay thế bằng Client ID của nhóm)"

from core.config import settings


router = APIRouter(tags=["Auth - Đăng nhập/Đăng ký"])

# ===========================================================================
# 1. CÁC CLASS NHẬN DỮ LIỆU TỪ FRONTEND CHO CHỨC NĂNG OTP
# ===========================================================================
class ForgotPasswordReq(BaseModel):
    email: str

class ResetPasswordReq(BaseModel):
    email: str
    otp: str
    new_password: str

# BỘ NHỚ TẠM ĐỂ LƯU OTP (Hết hạn sau 5 phút)
otp_storage = {}
rate_limit_storage = {}

def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    now = datetime.now(timezone.utc)
    record = rate_limit_storage.get(key, {"count": 0, "reset_at": now + timedelta(seconds=window_seconds)})
    if now > record["reset_at"]:
        record = {"count": 0, "reset_at": now + timedelta(seconds=window_seconds)}
    record["count"] += 1
    rate_limit_storage[key] = record
    if record["count"] > limit:
        raise HTTPException(status_code=429, detail="Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.")

# ===========================================================================
# 2. CÁC API XỬ LÝ AUTHENTICATION
# ===========================================================================

@router.post("/register")
def register(user_data: schemas.UserCreate, db: Session = Depends(get_session)):
    # 1. Kiểm tra user tồn tại
    existing_user = crud_auth.get_user_by_email(db, email=user_data.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email này đã được đăng ký")
    
    requested_role = str(user_data.role or "USER").upper()
    is_enterprise_signup = requested_role == UserRole.ENTERPRISE.value

    if is_enterprise_signup:
        missing_fields = [
            label for label, value in {
                "business_name": user_data.business_name,
                "contact_person": user_data.contact_person,
                "contact_email": user_data.contact_email,
                "contact_phone": user_data.contact_phone,
            }.items()
            if not value
        ]
        if missing_fields:
            raise HTTPException(
                status_code=400,
                detail="Thiếu thông tin hồ sơ doanh nghiệp",
            )

    # 2. Tạo user. Tài khoản doanh nghiệp vẫn chờ Admin duyệt trước khi nhận role ENTERPRISE.
    new_user = crud_user.create_user(
        db=db, 
        full_name=user_data.full_name, 
        email=user_data.email, 
        password=user_data.password,
        register_type=user_data.register_type, 
        role=UserRole.USER,
        status=UserStatus.ACTIVE

    )

    if is_enterprise_signup:
        profile = EnterpriseProfiles(
            user_id=new_user.user_id,
            business_name=user_data.business_name.strip(),
            contact_person=user_data.contact_person.strip(),
            contact_email=str(user_data.contact_email),
            contact_phone=user_data.contact_phone.strip(),
            status=EnterpriseStatus.PENDING,
        )
        db.add(profile)
        db.commit()

    return {
        "message": (
            "Đăng ký thành công, hồ sơ doanh nghiệp đang chờ Admin duyệt"
            if is_enterprise_signup
            else "Đăng ký thành công"
        ),
        "email": new_user.email,
        "enterprise_profile_status": (
            EnterpriseStatus.PENDING.value if is_enterprise_signup else None
        ),
    }

@router.post("/login", response_model=schemas.TokenResponse)
def login(credentials: schemas.UserLogin, db: Session = Depends(get_session)):
    check_rate_limit(f"login:{credentials.email.lower()}", limit=5, window_seconds=300)
    user = crud_auth.get_user_by_email(db, email=credentials.email)
    
    # Dùng UserStatus.ACTIVE thay vì string "ACTIVE"
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại hoặc bị khóa")

    if not security.verify_password(credentials.password, user.passwordhash):
        raise HTTPException(status_code=401, detail="Mật khẩu không chính xác")

    user_role_str = getattr(user.role, 'value', user.role)
    access_token = security.create_access_token(data={"sub": str(user.user_id), "role": user_role_str})
    refresh_token = security.create_refresh_token(data={"sub": str(user.user_id)})

    # Lấy device_id từ Frontend gửi lên, nếu không có thì mặc định là 'web-browser'
    device_id = credentials.device_id or 'web-browser'
    crud_user.create_user_session(
        db=db, 
        user_id=user.user_id, 
        device_id=device_id,
        refresh_token=refresh_token,
    )
    profile_data = {}
    
    # Import model (Bạn kiểm tra lại đường dẫn import file models của nhóm nhé)
    from models import UserProfiles, EnterpriseProfiles 

    if user_role_str == "ENTERPRISE":
        profile = db.query(EnterpriseProfiles).filter(EnterpriseProfiles.user_id == user.user_id).first()
        if profile:
            profile_data = {
                "business_name": profile.business_name,
                "contact_person": profile.contact_person,
                "contact_phone": profile.contact_phone,
                "status": getattr(profile.status, 'value', profile.status) if profile.status else "PENDING"
            }
    else:
        profile = db.query(UserProfiles).filter(UserProfiles.user_id == user.user_id).first()
        if profile:
            profile_data = {
                "date_of_birth": str(profile.date_of_birth) if profile.date_of_birth else "",
                "gender": getattr(profile.gender, 'value', profile.gender) if profile.gender else "MALE",
                "base_location": profile.base_location or "",
                "bio": profile.bio or "",
                "travel_style": getattr(profile.travel_style, 'value', profile.travel_style) if profile.travel_style else "",
                "privacy_status": getattr(profile.privacy_status, 'value', profile.privacy_status) if profile.privacy_status else "PUBLIC",
                "total_points": profile.total_points or 0,
                "points_balance": profile.points_balance or 0,
            }
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "user_id": str(user.user_id),
            "email": user.email,
            "full_name": user.full_name or "User",
            "role": user_role_str,
            **profile_data
        }
    }

@router.post("/google-login")
def google_login(token_data: dict, db: Session = Depends(get_session)):
    token = token_data.get("token")
    device_id = token_data.get("device_id", "Web-Browser")
    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
        email = idinfo['email']
        full_name = idinfo.get('name', 'Google User')
        social_id = idinfo['sub']

        user = crud_user.get_user_by_email(db, email=email)
        if not user:
            user = crud_user.create_social_user(db, full_name, email, social_id, "GOOGLE")
        elif user.status != UserStatus.ACTIVE:
            raise HTTPException(status_code=401, detail="Tài khoản không tồn tại hoặc bị khóa")
        
        user_role_str = getattr(user.role, 'value', user.role)

        access_token = security.create_access_token(data={"sub": str(user.user_id), "role": user_role_str})
        refresh_token = security.create_refresh_token(data={"sub": str(user.user_id)})
        
        crud_user.create_user_session(db, user.user_id, device_id, refresh_token)

        return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "user_id": str(user.user_id),
            "email": user.email,
            "full_name": user.full_name or "User",
            "role": getattr(user.role, 'value', user.role) # Lấy đúng string role
        }
    }
    except ValueError:
        raise HTTPException(status_code=401, detail="Xác thực Google thất bại")

@router.post("/logout")
def logout(refresh_token: str = Header(..., alias="Authorization-Refresh"), db: Session = Depends(get_session)):
    try:
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = UUID(str(payload.get("sub")))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Refresh token không hợp lệ")

    success = crud_user.revoke_session(db, user_id=user_id, refresh_token=refresh_token)
    if not success:
        raise HTTPException(status_code=400, detail="Phiên không hợp lệ hoặc đã đăng xuất")
    return {"message": "Đăng xuất thành công"}


@router.get("/me")
def get_my_profile(
    current_user: dict = Depends(security.verify_token),
    db: Session = Depends(get_session)
):
    user_id = current_user.get("sub")
    
    # 1. Tìm user trong bảng chính
    user = crud_user.get_user_by_id(db, user_id=user_id) 
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại hoặc bị khóa")

    user_role_str = getattr(user.role, 'value', user.role)
    profile_data = {}

    # 2. RẼ NHÁNH: Lấy dữ liệu tùy theo Role
    if user_role_str == "ENTERPRISE":
        # (Nếu code báo lỗi import EnterpriseProfiles, hãy import nó vào nhé)
        from models import EnterpriseProfiles 
        profile = db.exec(select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user.user_id)).first()
        
        if profile:
            profile_data = {
                "business_name": profile.business_name,
                "contact_person": profile.contact_person,
                "contact_phone": profile.contact_phone,
                "status": getattr(profile.status, 'value', profile.status) if profile.status else "PENDING"
            }
    else:
        from models import UserProfiles
        profile = db.exec(select(UserProfiles).where(UserProfiles.user_id == user.user_id)).first()
        
        if profile:
            profile_data = {
                "date_of_birth": str(profile.date_of_birth) if profile.date_of_birth else "",
                "gender": getattr(profile.gender, 'value', profile.gender) if profile.gender else "MALE",
                "base_location": profile.base_location or "",
                "bio": profile.bio or "",
                "travel_style": getattr(profile.travel_style, 'value', profile.travel_style) if profile.travel_style else "",
                "privacy_status": getattr(profile.privacy_status, 'value', profile.privacy_status) if profile.privacy_status else "PUBLIC",
                "total_points": profile.total_points or 0,
                "points_balance": profile.points_balance or 0,
            }

    # 3. Trả về cấu trúc bọc trong key "user" GIỐNG HỆT với API /login
    return {
        "user": {
            "user_id": str(user.user_id),
            "email": user.email,
            "full_name": user.full_name or "Khách hàng",
            "role": user_role_str,
            **profile_data  # Trải phẳng dữ liệu (bio, location, business_name...) ra đây
        }
    }

@router.put("/update-profile")
def update_profile(
    data: dict, 
    current_user: dict = Depends(security.verify_token), 
    db: Session = Depends(get_session)
):
    user_id = current_user.get("sub")
    role = current_user.get("role") # Lấy role từ Token (USER hay ENTERPRISE)
    
    if "user_id" in data:
        del data["user_id"]
        
    # 🌟 "KẺ CHUYỂN MẠCH" Ở ĐÂY:
    if role == "ENTERPRISE":
        # Cập nhật vào bảng Doanh nghiệp
        updated_user = crud_user.update_enterprise_profile(db=db, user_id=user_id, **data)
    else:
        # Cập nhật vào bảng Cá nhân mặc định
        updated_user = crud_user.update_user_profile(db=db, user_id=user_id, **data)
    
    if not updated_user:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
        
    return {"message": "Cập nhật hồ sơ thành công!", "user": updated_user}
# ===========================================================================
# 3. CHỨC NĂNG QUÊN MẬT KHẨU (GỬI OTP VÀ ĐỔI PASS MỚI)
# ===========================================================================

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordReq, db: Session = Depends(get_session)):
    check_rate_limit(f"forgot:{req.email.lower()}", limit=3, window_seconds=900)
    # 1. Kiểm tra email có tồn tại không
    user = crud_auth.get_user_by_email(db, email=req.email)
    if not user:
        return {"message": "Nếu email tồn tại, mã OTP sẽ được gửi qua kênh đã cấu hình."}

    # 2. Sinh mã OTP ngẫu nhiên (6 chữ số)
    otp_code = str(secrets.randbelow(900000) + 100000)

    # 3. Lưu OTP và thời gian hết hạn (5 phút) vào bộ nhớ tạm
    expire_time = datetime.now(timezone.utc) + timedelta(minutes=5)
    otp_storage[req.email] = {"otp": otp_code, "expire_time": expire_time}

    # TODO: Gửi OTP qua email/SMS provider. Không ghi OTP ra log để tránh lộ mã.
    return {"message": "Nếu email tồn tại, mã OTP sẽ được gửi qua kênh đã cấu hình."}

@router.post("/reset-password")
def reset_password(req: ResetPasswordReq, db: Session = Depends(get_session)):
    check_rate_limit(f"reset:{req.email.lower()}", limit=5, window_seconds=900)
    # 1. Kiểm tra xem email này có đang yêu cầu OTP không
    record = otp_storage.get(req.email)
    if not record:
        raise HTTPException(status_code=400, detail="Chưa gửi yêu cầu hoặc phiên đã bị hủy!")

    # 2. Kiểm tra mã OTP gửi lên có khớp không
    if record["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Mã OTP không chính xác!")

    # 3. Kiểm tra xem OTP có bị quá hạn 5 phút không
    if datetime.now(timezone.utc) > record["expire_time"]:
        del otp_storage[req.email]
        raise HTTPException(status_code=400, detail="Mã OTP đã hết hạn!")

    # 4. Tìm User trong CSDL
    user = crud_auth.get_user_by_email(db, email=req.email)
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại!")

    # 5. Cập nhật mật khẩu mới (Băm mật khẩu trước khi lưu)
    user.passwordhash = security.get_password_hash(req.new_password)
    user.update_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    db.commit()

    # 6. Xóa OTP sau khi dùng thành công
    del otp_storage[req.email]

    return {"message": "Đổi mật khẩu thành công! Bạn có thể đăng nhập ngay bây giờ."}
