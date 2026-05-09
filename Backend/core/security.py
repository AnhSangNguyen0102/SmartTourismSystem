# ============================================================
# core/security.py  –  Password hashing & JWT utilities
# Tích hợp logic JWT từ code của bạn bạn (PyJWT, HTTPBearer, Phân quyền)
# Dùng thư viện bcrypt chuẩn để tránh crash
# ============================================================

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
import bcrypt

from core.config import settings

# ---------------------------------------------------------------------------
# Setup Security Scheme cho FastAPI Swagger UI / Phân quyền
# ---------------------------------------------------------------------------
security_scheme = HTTPBearer()

# ---------------------------------------------------------------------------
# Password hashing  (sử dụng bcrypt trực tiếp để tránh lỗi crash passlib)
# ---------------------------------------------------------------------------

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Compare a plain-text password against its bcrypt hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )


def get_password_hash(password: str) -> str:
    """Return the bcrypt hash of *password*."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


# ---------------------------------------------------------------------------
# JWT Tokens (Access & Refresh)
# ---------------------------------------------------------------------------

def create_access_token(data: dict) -> str:
    """Tạo Access Token (thời hạn tính bằng phút)"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Tạo Refresh Token (thời hạn tính bằng ngày, mặc định 7 ngày)"""
    to_encode = data.copy()
    # Nếu trong settings chưa có REFRESH_TOKEN_EXPIRE_DAYS thì ta dùng hardcode 7 ngày
    expire_days = getattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 7)
    expire = datetime.now(timezone.utc) + timedelta(days=expire_days)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ---------------------------------------------------------------------------
# Phân quyền / Kiểm tra Token
# ---------------------------------------------------------------------------

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security_scheme)):
    """
    Dependency của FastAPI để trích xuất và verify token từ Header.
    Sử dụng:
        @app.get("/me")
        def get_me(user_info: dict = Depends(verify_token)): ...
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload  # Trả về thông tin user (ví dụ: sub/email, role)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Token đã hết hạn",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Token không hợp lệ",
            headers={"WWW-Authenticate": "Bearer"}
        )
