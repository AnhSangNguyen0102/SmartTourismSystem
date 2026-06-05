import secrets
import hashlib
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.orm import Session
from sqlmodel import select
from jose import jwt, JWTError
from email_validator import validate_email, EmailNotValidError

from datetime import datetime, timedelta, timezone 
from pydantic import BaseModel # Thêm thư viện này để tạo form nhận OTP


from database import get_session
import crud.crud_user as crud_user
import crud.crud_auth as crud_auth 
import schemas
from models import EnterpriseProfiles, EnterpriseStatus, UserRole, UserStatus, RegisterType, Users
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

class VerifyResetOtpReq(BaseModel):
    email: str
    otp: str

class VerifyRegistrationReq(BaseModel):
    email: str
    otp: str

class ResendRegisterOtpReq(BaseModel):
    email: str

# BỘ NHỚ TẠM ĐỂ LƯU OTP (Hết hạn sau 5 phút)
otp_storage = {}
register_otp_storage = {}
rate_limit_storage = {}

# Danh sách một số tên miền email rác/tạm thời phổ biến để chặn
DISPOSABLE_DOMAINS = {
    "temp-mail.org", "tempmail.com", "mailinator.com", "yopmail.com", 
    "10minutemail.com", "guerrillamail.com", "sharklasers.com", "guerrillamailblock.com",
    "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "spam4.me",
    "grr.la", "dispostable.com", "maildrop.cc", "getairmail.com", "throwawaymail.com",
    "tempmailaddress.com", "crazymailing.com", "mintemail.com", "mailnesia.com"
}

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

@router.get("/check-email")
def check_email(email: str, db: Session = Depends(get_session)):
    """Kiểm tra xem email hợp lệ và đã tồn tại trong hệ thống chưa."""
    # 1. Kiểm tra email thực tế (MX/DNS check)
    email_clean = email.strip()
    try:
        validate_email(email_clean, check_deliverability=True)
    except EmailNotValidError:
        raise HTTPException(
            status_code=400, 
            detail="Email không tồn tại hoặc không thể nhận thư. Vui lòng kiểm tra lại."
        )

    # 1.5 Kiểm tra xem có thuộc danh sách chặn email rác/ảo không
    email_domain = email_clean.split("@")[-1].lower()
    if email_domain in DISPOSABLE_DOMAINS:
        raise HTTPException(
            status_code=400,
            detail="Hệ thống không chấp nhận các dịch vụ email tạm thời hoặc email rác. Vui lòng sử dụng địa chỉ email chính thức (như Gmail, Yahoo, Outlook, v.v.)."
        )

    # 2. Kiểm tra tồn tại trong DB
    user = crud_auth.get_user_by_email(db, email=email_clean)
    print(f"[!] Email check for {email_clean} -> Exists: {user is not None}")
    
    is_pending = False
    if user:
        is_pending = user.status == UserStatus.PENDING

    return {
        "exists": user is not None,
        "is_pending": is_pending
    }

@router.post("/register")
def register(request: Request, user_data: schemas.UserCreate, db: Session = Depends(get_session)):
    # 1. Kiểm tra email đã được đăng ký chưa
    existing_user = crud_auth.get_user_by_email(db, email=user_data.email)
    
    # 1.5 Kiểm tra chặn các tên miền email rác bổ sung lúc gửi register
    email_domain = user_data.email.split("@")[-1].lower()
    if email_domain in DISPOSABLE_DOMAINS:
        raise HTTPException(
            status_code=400,
            detail="Hệ thống không chấp nhận các dịch vụ email tạm thời hoặc email rác."
        )

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

    if existing_user:
        if existing_user.status == UserStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Email này đã được đăng ký")
        else:
            # Nếu tài khoản vẫn ở trạng thái PENDING (chưa xác thực OTP xong),
            # cho phép người dùng đăng ký lại để cập nhật thông tin mới và gửi mã OTP mới.
            existing_user.full_name = user_data.full_name
            existing_user.passwordhash = security.get_password_hash(user_data.password)
            existing_user.register_type = user_data.register_type
            
            # Cập nhật thông tin doanh nghiệp nếu có
            if is_enterprise_signup:
                profile = db.query(EnterpriseProfiles).filter(EnterpriseProfiles.user_id == existing_user.user_id).first()
                if profile:
                    profile.business_name = user_data.business_name.strip()
                    profile.contact_person = user_data.contact_person.strip()
                    profile.contact_email = str(user_data.contact_email)
                    profile.contact_phone = user_data.contact_phone.strip()
                    db.add(profile)
                else:
                    profile = EnterpriseProfiles(
                        user_id=existing_user.user_id,
                        business_name=user_data.business_name.strip(),
                        contact_person=user_data.contact_person.strip(),
                        contact_email=str(user_data.contact_email),
                        contact_phone=user_data.contact_phone.strip(),
                        status=EnterpriseStatus.PENDING,
                    )
                    db.add(profile)
            
            db.add(existing_user)
            db.commit()
            new_user = existing_user
    else:
        # 2. Tạo user với trạng thái mặc định là PENDING
        new_user = crud_user.create_user(
            db=db, 
            full_name=user_data.full_name, 
            email=user_data.email, 
            password=user_data.password,
            register_type=user_data.register_type, 
            role=UserRole.USER,
            status=UserStatus.PENDING,
            user_id=user_data.user_id,
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

    # 3. Sinh mã OTP xác thực email và gửi email
    otp_code = str(secrets.randbelow(900000) + 100000)
    expire_time = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Băm OTP trước khi lưu
    hashed_otp = hashlib.sha256(otp_code.encode()).hexdigest()
    register_otp_storage[user_data.email.lower().strip()] = {
        "otp": hashed_otp,
        "expire_time": expire_time,
        "attempts": 0
    }

    # Ghi mã OTP vào file debug để dễ dàng lấy trong môi trường development
    try:
        with open("otp_debug.txt", "w", encoding="utf-8") as f:
            f.write(f"Mã OTP gần nhất (Đăng ký) của {user_data.email.lower().strip()}: {otp_code}\nThời gian: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    except Exception as debug_err:
        print(f"[Debug OTP] Lỗi ghi file debug: {debug_err}")

    # Gọi gửi mail OTP
    from services.email_service import send_otp_email
    client_ip = request.client.host if request.client else "Không xác định"
    send_otp_email(user_data.email, otp_code, client_ip=client_ip)

    return {
        "status": "verification_pending",
        "message": (
            "Yêu cầu đăng ký doanh nghiệp đã được ghi nhận. Vui lòng xác thực email để hoàn tất."
            if is_enterprise_signup
            else "Đăng ký thành công. Vui lòng xác thực email của bạn bằng mã OTP."
        ),
        "email": new_user.email,
        "enterprise_profile_status": (
            EnterpriseStatus.PENDING.value if is_enterprise_signup else None
        ),
    }

@router.post("/verify-registration")
def verify_registration(req: VerifyRegistrationReq, db: Session = Depends(get_session)):
    email_lower = req.email.lower().strip()
    record = register_otp_storage.get(email_lower)
    if not record:
        raise HTTPException(status_code=400, detail="Không tìm thấy yêu cầu xác thực hoặc phiên đã hết hạn!")

    # 1. Kiểm tra hết hạn trước
    if datetime.now(timezone.utc) > record["expire_time"]:
        del register_otp_storage[email_lower]
        raise HTTPException(status_code=400, detail="Mã OTP đã hết hạn!")

    # 2. Kiểm tra khớp mã (OTP băm SHA-256)
    submitted_otp_hash = hashlib.sha256(req.otp.strip().encode()).hexdigest()
    if record["otp"] != submitted_otp_hash:
        record["attempts"] += 1
        if record["attempts"] >= 3:
            del register_otp_storage[email_lower]
            raise HTTPException(
                status_code=400, 
                detail="Mã OTP đã bị vô hiệu hóa do bạn nhập sai quá 3 lần. Vui lòng gửi lại yêu cầu để nhận mã mới."
            )
        else:
            remaining_attempts = 3 - record["attempts"]
            raise HTTPException(
                status_code=400, 
                detail=f"Mã OTP không chính xác! Bạn còn {remaining_attempts} lần thử."
            )

    # Tìm user trong DB và kích hoạt tài khoản
    user = crud_auth.get_user_by_email(db, email=email_lower)
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại!")

    user.status = UserStatus.ACTIVE
    user.update_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    db.commit()

    # Tạo hồ sơ cá nhân tương ứng nếu là USER
    user_role_str = getattr(user.role, 'value', user.role)
    if user_role_str != "ENTERPRISE":
        from models import UserProfiles
        from datetime import date
        profile = db.query(UserProfiles).filter(UserProfiles.user_id == user.user_id).first()
        if not profile:
            profile = UserProfiles(
                user_id=user.user_id,
                full_name=user.full_name,
                date_of_birth=date(1990, 1, 1),
                gender="OTHER"
            )
            db.add(profile)
            db.commit()

    # Xóa OTP sau khi xác nhận thành công
    del register_otp_storage[email_lower]

    return {"status": "success", "message": "Xác thực email thành công! Bạn hiện đã có thể đăng nhập."}

@router.post("/resend-register-otp")
def resend_register_otp(request: Request, req: ResendRegisterOtpReq, db: Session = Depends(get_session)):
    email_lower = req.email.lower().strip()
    user = crud_auth.get_user_by_email(db, email=email_lower)
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại!")

    if user.status == UserStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Tài khoản này đã được xác thực hoạt động!")

    # Giới hạn 60 giây gửi lại mã 1 lần
    check_rate_limit(f"resend_otp:{email_lower}", limit=1, window_seconds=60)

    # Sinh mã OTP mới
    otp_code = str(secrets.randbelow(900000) + 100000)
    expire_time = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Băm OTP trước khi lưu
    hashed_otp = hashlib.sha256(otp_code.encode()).hexdigest()
    register_otp_storage[email_lower] = {
        "otp": hashed_otp,
        "expire_time": expire_time,
        "attempts": 0
    }

    # Ghi mã OTP vào file debug để dễ dàng lấy trong môi trường development
    try:
        with open("otp_debug.txt", "w", encoding="utf-8") as f:
            f.write(f"Mã OTP gần nhất (Gửi lại) của {email_lower}: {otp_code}\nThời gian: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    except Exception as debug_err:
        print(f"[Debug OTP] Lỗi ghi file debug: {debug_err}")

    # Gửi email
    from services.email_service import send_otp_email
    client_ip = request.client.host if request.client else "Không xác định"
    send_otp_email(user.email, otp_code, client_ip=client_ip)

    return {"message": "Mã OTP mới đã được gửi lại vào email của bạn."}

@router.post("/login", response_model=schemas.TokenResponse)
def login(credentials: schemas.UserLogin, db: Session = Depends(get_session)):
    check_rate_limit(f"login:{credentials.email.lower()}", limit=5, window_seconds=300)
    user = crud_auth.get_user_by_email(db, email=credentials.email)
    
    if not user:
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")
    
    if user.status == UserStatus.PENDING:
        raise HTTPException(status_code=401, detail="Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để kích hoạt bằng mã OTP.")
        
    if user.status == UserStatus.BANNED:
        raise HTTPException(status_code=401, detail="Tài khoản của bạn đã bị khóa. Vui lòng liên hệ ban quản trị để được hỗ trợ.")
        
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Tài khoản không hoạt động hoặc đã bị ngừng sử dụng.")

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
                "avatar_url": profile.avatar_url or "",
            }
    has_pass = user.register_type in [RegisterType.EMAIL, RegisterType.CREDENTIALS]
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "user_id": str(user.user_id),
            "email": user.email,
            "full_name": user.full_name or "User",
            "role": user_role_str,
            "has_password": has_pass,
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

        has_pass = user.register_type in [RegisterType.EMAIL, RegisterType.CREDENTIALS]
        return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "user_id": str(user.user_id),
            "email": user.email,
            "full_name": user.full_name or "User",
            "role": getattr(user.role, 'value', user.role), # Lấy đúng string role
            "has_password": has_pass
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
    if isinstance(user_id, str):
        try:
            user_id = UUID(user_id)
        except ValueError:
            pass
    
    # 1. Tìm user trong bảng chính
    user = crud_user.get_user_by_id(db, user_id=user_id) 
    if not user:
        # Check if this is a Supabase social user token that needs to be synchronized
        email = current_user.get("email")
        if email and user_id:
            try:
                # Avoid duplicate email in database
                user = crud_auth.get_user_by_email(db, email=email)
                if not user:
                    full_name = current_user.get("user_metadata", {}).get("full_name") or current_user.get("name") or "Google User"
                    # Create user directly using the same UUID from Supabase
                    user = Users(
                        user_id=user_id,
                        full_name=full_name,
                        email=email,
                        passwordhash=security.get_password_hash(secrets.token_urlsafe(32)),
                        social_id=str(user_id),
                        register_type=RegisterType.SOCIAL,
                        role=UserRole.USER,
                        status=UserStatus.ACTIVE
                    )
                    db.add(user)
                    db.commit()
                    db.refresh(user)

                    # Create profile corresponding to user
                    from datetime import date
                    from models import UserProfiles
                    profile = UserProfiles(
                        user_id=user.user_id,
                        full_name=user.full_name,
                        date_of_birth=date(1990, 1, 1),
                        gender="OTHER"
                    )
                    db.add(profile)
                    db.commit()
                    db.refresh(user)
            except Exception as e:
                print(f"[!] Error auto-creating social user: {e}")
                raise HTTPException(status_code=401, detail="Không thể đồng bộ tài khoản Google với hệ thống")

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
                "avatar_url": profile.avatar_url or "",
            }

    # 3. Trả về cấu trúc bọc trong key "user" GIỐNG HỆT với API /login
    has_pass = user.register_type in [RegisterType.EMAIL, RegisterType.CREDENTIALS]
    return {
        "user": {
            "user_id": str(user.user_id),
            "email": user.email,
            "full_name": user.full_name or "Khách hàng",
            "role": user_role_str,
            "has_password": has_pass,
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
def forgot_password(request: Request, req: ForgotPasswordReq, db: Session = Depends(get_session)):
    email_clean = req.email.lower().strip()
    check_rate_limit(f"forgot_limit:{email_clean}", limit=1, window_seconds=60)
    # 1. Kiểm tra email có tồn tại không
    user = crud_auth.get_user_by_email(db, email=email_clean)
    if not user:
        return {"message": "Nếu email tồn tại, mã OTP sẽ được gửi qua kênh đã cấu hình."}

    # 2. Sinh mã OTP ngẫu nhiên (6 chữ số)
    otp_code = str(secrets.randbelow(900000) + 100000)

    # 3. Lưu OTP và thời gian hết hạn (5 phút) vào bộ nhớ tạm sau khi băm
    expire_time = datetime.now(timezone.utc) + timedelta(minutes=5)
    hashed_otp = hashlib.sha256(otp_code.encode()).hexdigest()
    otp_storage[email_clean] = {
        "otp": hashed_otp,
        "expire_time": expire_time,
        "attempts": 0
    }

    # Ghi mã OTP vào file debug để dễ dàng lấy trong môi trường development
    try:
        with open("otp_debug.txt", "w", encoding="utf-8") as f:
            f.write(f"Mã OTP gần nhất (Quên mật khẩu) của {email_clean}: {otp_code}\nThời gian: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    except Exception as debug_err:
        print(f"[Debug OTP] Lỗi ghi file debug: {debug_err}")

    # Gửi mã OTP khôi phục qua email
    from services.email_service import send_reset_password_email
    client_ip = request.client.host if request.client else "Không xác định"
    send_reset_password_email(user.email, otp_code, client_ip=client_ip)

    return {"message": "Nếu email tồn tại, mã OTP sẽ được gửi qua kênh đã cấu hình."}

@router.post("/verify-reset-otp")
def verify_reset_otp(req: VerifyResetOtpReq):
    email_clean = req.email.lower().strip()
    record = otp_storage.get(email_clean)
    if not record:
        raise HTTPException(status_code=400, detail="Không tìm thấy yêu cầu xác thực hoặc phiên đã hết hạn!")

    # 1. Kiểm tra hết hạn trước
    if datetime.now(timezone.utc) > record["expire_time"]:
        del otp_storage[email_clean]
        raise HTTPException(status_code=400, detail="Mã OTP đã hết hạn!")

    # 2. Kiểm tra khớp mã (OTP băm SHA-256)
    submitted_otp_hash = hashlib.sha256(req.otp.strip().encode()).hexdigest()
    if record["otp"] != submitted_otp_hash:
        record["attempts"] += 1
        if record["attempts"] >= 3:
            del otp_storage[email_clean]
            raise HTTPException(
                status_code=400, 
                detail="Mã OTP đã bị vô hiệu hóa do bạn nhập sai quá 3 lần. Vui lòng gửi lại yêu cầu để nhận mã mới."
            )
        else:
            remaining_attempts = 3 - record["attempts"]
            raise HTTPException(
                status_code=400, 
                detail=f"Mã OTP không chính xác! Bạn còn {remaining_attempts} lần thử."
            )

    return {"status": "success", "message": "Xác thực mã OTP thành công! Vui lòng đặt lại mật khẩu mới."}

@router.post("/reset-password")
def reset_password(req: ResetPasswordReq, db: Session = Depends(get_session)):
    email_clean = req.email.lower().strip()
    check_rate_limit(f"reset:{email_clean}", limit=5, window_seconds=900)
    # 1. Kiểm tra xem email này có đang yêu cầu OTP không
    record = otp_storage.get(email_clean)
    if not record:
        raise HTTPException(status_code=400, detail="Chưa gửi yêu cầu hoặc phiên đã bị hủy!")

    # 2. Kiểm tra xem OTP có bị quá hạn 5 phút không
    if datetime.now(timezone.utc) > record["expire_time"]:
        del otp_storage[email_clean]
        raise HTTPException(status_code=400, detail="Mã OTP đã hết hạn!")

    # 3. Kiểm tra mã OTP gửi lên có khớp không (OTP băm SHA-256)
    submitted_otp_hash = hashlib.sha256(req.otp.strip().encode()).hexdigest()
    if record["otp"] != submitted_otp_hash:
        record["attempts"] += 1
        if record["attempts"] >= 3:
            del otp_storage[email_clean]
            raise HTTPException(
                status_code=400, 
                detail="Mã OTP đã bị vô hiệu hóa do bạn nhập sai quá 3 lần. Vui lòng gửi lại yêu cầu để nhận mã mới."
            )
        else:
            remaining_attempts = 3 - record["attempts"]
            raise HTTPException(
                status_code=400, 
                detail=f"Mã OTP không chính xác! Bạn còn {remaining_attempts} lần thử."
            )

    # 4. Tìm User trong CSDL
    user = crud_auth.get_user_by_email(db, email=email_clean)
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại!")

    # 5. Cập nhật mật khẩu mới (Băm mật khẩu trước khi lưu)
    user.passwordhash = security.get_password_hash(req.new_password)
    user.update_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    db.commit()

    # 6. Xóa OTP sau khi dùng thành công
    del otp_storage[email_clean]

    return {"message": "Đổi mật khẩu thành công! Bạn có thể đăng nhập ngay bây giờ."}

@router.post("/update-password")
def update_password(
    data: dict,
    current_user: dict = Depends(security.verify_token),
    db: Session = Depends(get_session)
):
    user_id = current_user.get("sub")
    if isinstance(user_id, str):
        try:
            user_id = UUID(user_id)
        except ValueError:
            pass
    user = crud_user.get_user_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    has_pass = user.register_type in [RegisterType.EMAIL, RegisterType.CREDENTIALS]

    new_password = data.get("new_password")
    if not new_password or len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Mật khẩu mới phải có ít nhất 8 ký tự")

    if has_pass:
        old_password = data.get("old_password")
        if not old_password:
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp mật khẩu hiện tại")
        if not security.verify_password(old_password, user.passwordhash):
            raise HTTPException(status_code=400, detail="Mật khẩu hiện tại không chính xác")

    # Cập nhật password
    user.passwordhash = security.get_password_hash(new_password)
    user.register_type = RegisterType.EMAIL
    user.update_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"message": "Cập nhật mật khẩu thành công!"}
