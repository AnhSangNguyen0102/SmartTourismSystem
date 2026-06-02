# ============================================================
# core/security.py  –  Password hashing & JWT utilities
# Tích hợp logic JWT từ code của bạn (PyJWT, HTTPBearer, Phân quyền)
# Dùng thư viện bcrypt chuẩn để tránh crash
# Hỗ trợ giải mã kép: HS256 nội bộ & RS256/ES256 Supabase Auth
# ============================================================

from datetime import datetime, timedelta, timezone
from typing import Any
import json
import requests
import bcrypt
import jwt
from pathlib import Path
from cachetools import cached, TTLCache

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from core.config import settings

# ---------------------------------------------------------------------------
# Setup Security Scheme cho FastAPI Swagger UI / Phân quyền
# ---------------------------------------------------------------------------
security_scheme = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Cấu hình Supabase JWKS (JSON Web Key Sets)
# ---------------------------------------------------------------------------
JWKS_CACHE_FILE = Path(__file__).parent / "jwks-cache.json"

# Lấy Supabase URL từ config hoặc env (mặc định lấy từ settings nếu có)
SUPABASE_URL = getattr(settings, "SUPABASE_URL", "https://digajfgykehjaqzaegey.supabase.co")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

def save_jwks_cache(jwks):
    """Lưu JWKS vào file cache cục bộ đề phòng lỗi mạng DNS."""
    try:
        with open(JWKS_CACHE_FILE, "w") as f:
            json.dump(jwks, f)
    except Exception as e:
        print(f"[!] Không thể lưu JWKS cache: {e}")

def load_jwks_cache():
    """Tải JWKS từ file cache cục bộ."""
    try:
        if JWKS_CACHE_FILE.exists():
            with open(JWKS_CACHE_FILE, "r") as f:
                return json.load(f)
    except Exception as e:
        print(f"[!] Không thể tải JWKS cache: {e}")
    return None

# Cache Public Key trong 1 giờ để tối ưu tài nguyên mạng
@cached(cache=TTLCache(maxsize=1, ttl=3600))
def get_jwk_public_key(kid: str):
    jwks = None
    try:
        # Thử tải JWKS từ server Supabase với timeout ngắn (3 giây)
        response = requests.get(JWKS_URL, timeout=3)
        response.raise_for_status()
        jwks = response.json()
        save_jwks_cache(jwks)
    except Exception as e:
        print(f"[!] Lỗi DNS/Kết nối khi lấy JWKS từ Supabase ({e}). Đang dùng cache cục bộ...")
        jwks = load_jwks_cache()
    
    if jwks:
        for key_data in jwks.get("keys", []):
            if key_data.get("kid") == kid:
                return jwt.PyJWK(key_data).key
                
        print(f"[!] Không tìm thấy Key ID {kid} trong JWKS.")
    
    return None

# ---------------------------------------------------------------------------
# Password hashing  (sử dụng bcrypt trực tiếp để tránh lỗi crash passlib)
# ---------------------------------------------------------------------------

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Compare a plain-text password against its bcrypt hash."""
    if not hashed_password:
        return False
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
    Hỗ trợ đồng thời HS256 nội bộ và RS256/ES256 từ Supabase Auth.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Vui lòng đăng nhập để thực hiện thao tác này!",
            headers={"WWW-Authenticate": "Bearer"}
        )
    token = credentials.credentials
    try:
        # Lấy thông tin header chưa giải mã
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        
        # 1. Trường hợp Token nội bộ HS256 (không chứa kid)
        if not kid:
            payload = jwt.decode(
                token, 
                settings.SECRET_KEY, 
                algorithms=[settings.ALGORITHM],
                options={"verify_aud": False}
            )
            # Chuẩn hóa thuộc tính user_id và sub
            user_id = payload.get("user_id") or payload.get("sub")
            return {
                "sub": payload.get("sub"),
                "user_id": str(user_id),
                "userId": str(user_id),
                "role": payload.get("role", "USER"),
                **payload
            }
            
        # 2. Trường hợp Token từ Supabase Auth (chứa kid, mã hóa RS256/ES256)
        public_key = get_jwk_public_key(kid)
        if not public_key:
            try:
                # Dự phòng bằng SECRET_KEY đối xứng
                payload = jwt.decode(
                    token, 
                    settings.SECRET_KEY, 
                    algorithms=[settings.ALGORITHM], 
                    options={"verify_aud": False}
                )
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Không thể xác thực Token. Không tìm thấy Public Key cho Key ID: {kid}.",
                    headers={"WWW-Authenticate": "Bearer"}
                )
        else:
            payload = jwt.decode(
                token,
                key=public_key,
                algorithms=["RS256", "ES256"],
                options={"verify_aud": False},
                leeway=60
            )
            
        user_id = payload.get("sub")
        email = payload.get("email") or user_id
        role = payload.get("role", "USER")
        
        return {
            "sub": str(user_id),
            "email": email,
            "user_id": str(user_id),
            "userId": str(user_id),
            "role": role,
            **payload
        }
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Token đã hết hạn. Vui lòng đăng nhập lại!",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail=f"Token không hợp lệ: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail=f"Lỗi xác thực hệ thống: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"}
        )

def verify_token_optional(credentials: HTTPAuthorizationCredentials = Security(security_scheme)):
    """
    Dependency của FastAPI tương tự verify_token nhưng không bắt buộc đăng nhập.
    Trả về dictionary thông tin user nếu token hợp lệ, ngược lại trả về None.
    """
    if not credentials:
        return None
    try:
        return verify_token(credentials)
    except Exception:
        return None

