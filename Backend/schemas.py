# ============================================================
# schemas.py  –  Pydantic v2 request / response schemas
# Maps to SQLModel tables defined in models.py
# ============================================================

from __future__ import annotations

from datetime import date, datetime, time

from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from models import (
    CurrencyEnum,
    EnterpriseStatus,
    GenderEnum,
    ItineraryStatus,
    KycStatus,
    PlanningStatus,
    PrivacyStatus,
    RegisterType,

    StopStatus,
    TravelStyle,
    UserRole,
    UserStatus,
    VerificationAction,

)


# ============================================================
class MessageResponse(BaseModel):
    """Generic API message (e.g. for delete / status endpoints)."""
    detail: str

# USER SCHEMAS
# ============================================================

class UserCreate(BaseModel):
    """Payload for registering a new user."""
    email: EmailStr
    password: str = Field(min_length=8, description="Mật khẩu tối thiểu 8 ký tự")
    full_name: str = Field(max_length=100)
    register_type: RegisterType = RegisterType.EMAIL
    role: str = "USER"



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
# USER PROFILE SCHEMAS
# ============================================================

class UserProfileCreate(BaseModel):
    """
    Payload để tạo profile sau khi đăng ký thành công.
    Dùng cho crud_user.create_user_profile().
    """
    full_name: str = Field(max_length=255)
    date_of_birth: date
    gender: GenderEnum
    avatar_url: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=500)
    base_location: Optional[str] = Field(default=None, max_length=100)
    travel_style: Optional[TravelStyle] = None
    privacy_status: PrivacyStatus = PrivacyStatus.PUBLIC


class UserProfileUpdate(BaseModel):
    """
    Payload để cập nhật thông tin profile.
    Tất cả field đều optional — chỉ field được truyền mới được ghi đè.
    Dùng cho crud_user.update_user_profile().
    """
    avatar_url: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=500)
    base_location: Optional[str] = Field(default=None, max_length=100)
    travel_style: Optional[TravelStyle] = None
    privacy_status: Optional[PrivacyStatus] = None
    identity_doc_url: Optional[str] = None
    selfie_url: Optional[str] = None


class UserProfileResponse(BaseModel):
    """Thông tin profile trả về cho client."""
    profile_id: UUID
    user_id: UUID
    full_name: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    date_of_birth: date
    gender: GenderEnum
    base_location: Optional[str] = None
    travel_style: Optional[TravelStyle] = None
    privacy_status: PrivacyStatus
    kyc_status: KycStatus
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class KycStatusUpdate(BaseModel):
    """
    Payload để cập nhật kyc_status của user profile.
    Dùng cho crud_user.update_user_kyc_status().
    """
    kyc_status: KycStatus


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


# MỚI: thêm class TokenResponse
class TokenResponse(BaseModel):
    """Payload trả về khi đăng nhập thành công."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: UserRole
    full_name: str

    
# ============================================================
# ENTERPRISE SCHEMAS
# ============================================================

class EnterpriseProfileCreate(BaseModel):
    """
    Payload để đăng ký tài khoản doanh nghiệp.
    Dùng cho crud_enterprise.create_enterprise_profile().
    """
    business_name: str = Field(max_length=255)
    contact_person: str = Field(max_length=255)
    contact_email: EmailStr = Field(max_length=50)
    contact_phone: str = Field(max_length=10, pattern=r"^\d{10}$")


class EnterpriseProfileResponse(BaseModel):
    """Thông tin hồ sơ doanh nghiệp trả về cho client."""
    enterprise_id: UUID
    user_id: UUID
    business_name: str
    contact_person: str
    contact_email: str
    contact_phone: str
    status: EnterpriseStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EnterpriseStatusUpdate(BaseModel):
    """
    Payload để Admin duyệt / từ chối hồ sơ doanh nghiệp.
    Dùng cho crud_enterprise.update_enterprise_status() + create_verification_log().
    """
    status: EnterpriseStatus
    reason: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Lý do từ chối (bắt buộc khi status = REJECTED)",
    )


# ============================================================
# REFERENCE / MASTER DATA SCHEMAS
# ============================================================

class CityResponse(BaseModel):
    """Thành phố trả về từ crud_reference.get_active_cities()."""
    city_id: int
    city_name: str
    latitude: Decimal
    longitude: Decimal
    region: str

    model_config = ConfigDict(from_attributes=True)


class CategoryResponse(BaseModel):
    """Danh mục địa điểm trả về từ crud_reference.get_all_categories()."""
    category_id: int
    category_name: str

    model_config = ConfigDict(from_attributes=True)


class TagResponse(BaseModel):
    """Tag sở thích trả về từ crud_reference.get_all_tags()."""
    tag_id: int
    tag_name: str

    model_config = ConfigDict(from_attributes=True)



# ============================================================
# PLANNING SESSION SCHEMAS
# ============================================================

class PlanningSessionCreate(BaseModel):
    """
    Payload để tạo phiên lập kế hoạch.
    Bổ sung tag_ids so với version cũ để lưu vào TRAVEL_REQUEST_PREFERENCES.
    Dùng cho crud_planning.create_planning_session() + create_session_preferences().
    """
    city_id: int
    start_day: date
    end_day: date
    budget: Decimal = Field(gt=0, decimal_places=2)
    currency: CurrencyEnum = CurrencyEnum.VND
    pax_adult: int = Field(default=1, gt=0)
    pax_children: int = Field(default=0, ge=0)
    tag_ids: list[int] = Field(default_factory=list, description="Danh sách tag sở thích cho chuyến đi")



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
# LOCATION SCHEMAS
# ============================================================
class LocationCreate(BaseModel):
    """
    Payload để doanh nghiệp đăng ký địa điểm kinh doanh mới.
    ``address`` được dùng để gọi Google Maps Geocoding API lấy latitude/longitude.
    Dùng cho services/location_service.register_location().
    """
    location_name: str = Field(max_length=255, description="Tên địa điểm kinh doanh")
    address: str = Field(description="Địa chỉ đầy đủ — dùng để Geocode tọa độ qua Google Maps API")
    city_id: int = Field(description="ID thành phố thuộc hệ thống")
    open_time: time = Field(description="Giờ mở cửa (HH:MM:SS)")
    close_time: time = Field(description="Giờ đóng cửa (HH:MM:SS) — phải sau open_time")
    min_price: Decimal = Field(ge=0, decimal_places=2, description="Giá tối thiểu (>= 0)")
    max_price: Decimal = Field(ge=0, decimal_places=2, description="Giá tối đa (>= min_price)")
    currency: CurrencyEnum = Field(default=CurrencyEnum.VND)
    category_ids: list[int] = Field(default_factory=list, description="Danh sách category_id")
    tag_ids: list[int] = Field(default_factory=list, description="Danh sách tag_id")

class LocationRegisterResponse(BaseModel):
    """
    Phản hồi sau khi doanh nghiệp đăng ký địa điểm thành công.
    Bao gồm thông tin địa điểm vừa tạo kèm thông báo chờ duyệt.
    """
    location: LocationResponse
    message: str

    model_config = ConfigDict(from_attributes=True)

class LocationResponse(BaseModel):
    """
    Thông tin địa điểm trả về từ crud_location.get_locations_by_city_and_categories()
    và get_location_by_ids().
    """
    location_id: UUID
    location_name: str
    latitude: Decimal
    longitude: Decimal
    city_id: int
    min_price: Decimal
    max_price: Decimal
    currency: CurrencyEnum
    open_time: time
    close_time: time

    model_config = ConfigDict(from_attributes=True)


class LocationImageResponse(BaseModel):
    """Ảnh địa điểm trả về từ crud_location.get_location_images()."""
    image_id: int
    location_id: UUID
    url: str
    display_order: int

    model_config = ConfigDict(from_attributes=True)


# ============================================================
# ITINERARY SCHEMAS
# ============================================================

class ItineraryCreate(BaseModel):
    """
    Minimal payload to kick-off itinerary generation.
    The heavy lifting (stops, routes) is handled server-side.
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

class ItineraryStopResponse(BaseModel):
    """
    Một trạm dừng kèm thông tin địa điểm.
    Dùng cho crud_itinerary.get_itinerary_stops_with_locations() (UC7).
    """
    day_id: int
    day_order: int
    travel_date: date
    stop_id: int
    stop_order: int
    arrival_time: time
    departure_time: time
    checkin_radius: int
    status: StopStatus
    location_id: UUID
    location_name: str
    latitude: Decimal
    longitude: Decimal
    open_time: time
    close_time: time

    model_config = ConfigDict(from_attributes=True)


class ItineraryStatusUpdate(BaseModel):
    """Payload để cập nhật trạng thái lộ trình."""
    status: ItineraryStatus


# ============================================================
# TRACKING & CHECK-IN SCHEMAS
# ============================================================

class CheckinCreate(BaseModel):
    """
    Payload khi user bắt đầu check-in tại một trạm dừng.
    Dùng cho crud_tracking.create_checkin_progress() (UC8 Q7).
    """
    stop_id: int
    latitude: Decimal = Field(decimal_places=6)
    longitude: Decimal = Field(decimal_places=6)


class CheckinResponse(BaseModel):
    """Kết quả check-in trả về cho client."""
    progress_id: int
    user_id: UUID
    stop_id: int
    is_completed: bool
    checkin_time: datetime
    latitude: Decimal
    longitude: Decimal

    model_config = ConfigDict(from_attributes=True)


class GpsLogCreate(BaseModel):
    """
    Payload ghi nhận tọa độ GPS real-time trong quá trình di chuyển.
    Dùng cho crud_tracking.create_gps_log() (UC7 Q2).
    """
    progress_id: int
    latitude: Decimal = Field(decimal_places=6)
    longitude: Decimal = Field(decimal_places=6)


class DeviationLogCreate(BaseModel):
    """
    Payload ghi nhận cảnh báo lệch lộ trình.
    Dùng cho crud_tracking.create_deviation_log() (UC7 Q3).
    """
    itinerary_id: UUID
    latitude: Decimal = Field(decimal_places=6)
    longitude: Decimal = Field(decimal_places=6)

# ============================================================
# GENERIC MESSAGE SCHEMA
# ============================================================

class MessageResponse(BaseModel):
    """Generic API message (e.g. for delete / status endpoints)."""
    detail: str

