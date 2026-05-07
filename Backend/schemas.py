# ============================================================
# schemas.py  –  Pydantic v2 request / response schemas
# Maps to SQLModel tables defined in models.py
# ============================================================

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from models import (
    CurrencyEnum,
    GenderEnum,
    ItineraryStatus,
    KycStatus,
    PlanningStatus,
    PrivacyStatus,
    RegisterType,
    TravelStyle,
    UserRole,
    UserStatus,
)


# ============================================================
# USER SCHEMAS
# ============================================================

class UserCreate(BaseModel):
    """Payload for registering a new user."""
    email: EmailStr
    password: str = Field(min_length=8, description="Mật khẩu tối thiểu 8 ký tự")
    full_name: str = Field(max_length=100)
    register_type: RegisterType = RegisterType.EMAIL


class UserLogin(BaseModel):
    """Payload for authenticating an existing user."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """
    Public user representation – **never** exposes ``passwordhash``.
    Uses ``from_attributes`` so it can be built directly from a
    ``Users`` SQLModel instance.
    """
    user_id: UUID
    full_name: str
    email: str
    social_id: Optional[str] = None
    register_type: RegisterType
    role: UserRole
    status: UserStatus
    create_at: datetime
    update_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# AUTH / JWT SCHEMAS
# ============================================================

class Token(BaseModel):
    """Returned after successful login."""
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """Decoded JWT payload."""
    sub: UUID                          # user_id
    exp: Optional[int] = None          # expiry (unix timestamp)
    role: Optional[UserRole] = None


# ============================================================
# PLANNING SESSION SCHEMAS
# ============================================================

class PlanningSessionCreate(BaseModel):
    """Payload for creating a new planning session (trip request)."""
    city_id: int
    start_day: date
    end_day: date
    budget: Decimal = Field(gt=0, decimal_places=2)
    currency: CurrencyEnum = CurrencyEnum.VND
    pax_adult: int = Field(default=1, gt=0)
    pax_children: int = Field(default=0, ge=0)


class PlanningSessionResponse(BaseModel):
    """Basic planning session info returned to the client."""
    session_id: UUID
    user_id: UUID
    city_id: int
    pax_adult: int
    pax_children: int
    budget: Decimal
    currency: CurrencyEnum
    start_day: date
    end_day: date
    status: PlanningStatus
    create_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# ITINERARY SCHEMAS
# ============================================================

class ItineraryCreate(BaseModel):
    """
    Minimal payload to kick‑off itinerary generation.
    The heavy lifting (stops, routes) is handled server‑side.
    """
    city_id: int
    start_day: date
    end_day: date
    budget: Decimal = Field(gt=0, decimal_places=2)


class ItineraryResponse(BaseModel):
    """Basic itinerary information returned to the client."""
    itinerary_id: UUID
    session_id: UUID
    user_id: UUID
    name: Optional[str] = None
    status: ItineraryStatus
    total_budget: Decimal
    currency: CurrencyEnum
    total_travel_time: int
    total_distance: Decimal
    create_at: datetime
    update_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# GENERIC MESSAGE SCHEMA
# ============================================================

class MessageResponse(BaseModel):
    """Generic API message (e.g. for delete / status endpoints)."""
    detail: str
