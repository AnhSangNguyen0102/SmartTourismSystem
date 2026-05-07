# ============================================================
# crud/crud_user.py  –  User CRUD operations
# ============================================================

from typing import Optional

from sqlmodel import Session, select

from core.security import get_password_hash, verify_password
from models import Users
from schemas import UserCreate


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_user_by_email(db: Session, email: str) -> Optional[Users]:
    """
    Look up a user by their email address.

    Returns the ``Users`` row or ``None`` if not found.
    """
    statement = select(Users).where(Users.email == email)
    return db.exec(statement).first()


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def create_user(db: Session, user_in: UserCreate) -> Users:
    """
    Register a new user.

    1. Hash the plain-text password via ``get_password_hash``.
    2. Build a ``Users`` model instance (passwordhash = hashed value).
    3. Persist to DB and return the refreshed row.
    """
    hashed_password = get_password_hash(user_in.password)

    db_user = Users(
        full_name=user_in.full_name,
        email=user_in.email,
        passwordhash=hashed_password,
        register_type=user_in.register_type,
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# ---------------------------------------------------------------------------
# Authenticate
# ---------------------------------------------------------------------------

def authenticate_user(
    db: Session,
    email: str,
    password: str,
) -> Optional[Users]:
    """
    Validate credentials and return the ``Users`` row on success.

    Returns ``None`` when:
    - No user with the given email exists.
    - The password does not match the stored hash.
    """
    user = get_user_by_email(db, email)
    if user is None:
        return None
    if not verify_password(password, user.passwordhash):
        return None
    return user
