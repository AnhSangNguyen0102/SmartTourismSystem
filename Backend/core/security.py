# ============================================================
# core/security.py  –  Password hashing & JWT utilities
# ============================================================

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from core.config import settings

# ---------------------------------------------------------------------------
# Password hashing  (bcrypt)
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Compare a plain-text password against its bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Return the bcrypt hash of *password*."""
    return pwd_context.hash(password)


# ---------------------------------------------------------------------------
# JWT access tokens
# ---------------------------------------------------------------------------

def create_access_token(
    subject: str | Any,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Create a signed JWT.

    Parameters
    ----------
    subject : str | Any
        Value stored in the ``sub`` claim (typically a user-id or email).
        Automatically cast to ``str``.
    expires_delta : timedelta, optional
        Custom lifetime.  Falls back to
        ``settings.ACCESS_TOKEN_EXPIRE_MINUTES`` when *None*.

    Returns
    -------
    str
        Encoded JWT string.
    """
    now = datetime.now(timezone.utc)

    if expires_delta is not None:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
    }

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode & verify a JWT.

    Raises
    ------
    JWTError
        If the token is invalid, expired, or tampered with.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError:
        raise
