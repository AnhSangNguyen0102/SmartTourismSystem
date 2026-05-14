"""
models.py - SQLModel models for FastAPI + Supabase (PostgreSQL)
Generated from schema.sql
"""

from __future__ import annotations
import enum
from decimal import Decimal
from datetime import date, datetime, time
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Index, Column, Numeric, UniqueConstraint
from sqlmodel import Field, SQLModel


# ============================================================
# ENUMS
# ============================================================

class RegisterType(str, enum.Enum):
    EMAIL = "EMAIL"
    CREDENTIALS = "CREDENTIALS"
    SOCIAL = "SOCIAL"

class UserRole(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"
    ENTERPRISE = "ENTERPRISE"

class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    BANNED = "BANNED"
    PENDING = "PENDING"

class GenderEnum(str, enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"

class TravelStyle(str, enum.Enum):
    BACKPACKER = "BACKPACKER"
    RESORT = "RESORT"
    CULTURAL = "CULTURAL"
    ECO = "ECO"
    ADVENTURE = "ADVENTURE"
    FAMILY = "FAMILY"
    FOODIE = "FOODIE"
    LUXURY = "LUXURY"
    WELLNESS = "WELLNESS"

class PrivacyStatus(str, enum.Enum):
    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"

class KycStatus(str, enum.Enum):
    UNVERIFIED = "UNVERIFIED"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class EnterpriseStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    REJECTED = "REJECTED"

class VerificationAction(str, enum.Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"

class CurrencyEnum(str, enum.Enum):
    VND = "VND"
    USD = "USD"

class PlanningStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUGGESTING = "SUGGESTING"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"

class RequestActionType(str, enum.Enum):
    CREATE = "CREATE"
    RE_INPUT = "RE_INPUT"
    CANCEL = "CANCEL"

class ItineraryStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"

class StopStatus(str, enum.Enum):
    PENDING = "PENDING"
    VISITING = "VISITING"
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"

class ExportFormat(str, enum.Enum):
    excel = "excel"
    pdf = "pdf"

class ExportStatus(str, enum.Enum):
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class FeedbackType(str, enum.Enum):
    BUG = "BUG"
    SUGGESTION = "SUGGESTION"
    REPORT = "REPORT"

class FeedbackStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    RESOLVED = "RESOLVED"


# ============================================================
# GROUP 1: USER MANAGEMENT
# ============================================================

class Users(SQLModel, table=True):
    __tablename__ = "users"

    user_id: UUID = Field(default_factory=uuid4, primary_key=True)
    full_name: str = Field(max_length=100)
    
    # Đã sửa thành Optional để hỗ trợ Đăng nhập Google không cần mật khẩu
    passwordhash: Optional[str] = Field(default=None, max_length=255) 
    

    email: str = Field(max_length=255, unique=True, index=True)
    social_id: Optional[str] = Field(default=None, max_length=255)
    register_type: RegisterType
    role: UserRole = Field(default=UserRole.USER)

    status: UserStatus = Field(default=UserStatus.PENDING) # Hoặc đổi thành ACTIVE tùy logic của bạn

    create_at: datetime = Field(default_factory=datetime.utcnow)
    update_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("ux_users_social_id", "social_id", unique=True, postgresql_where="social_id IS NOT NULL"),
    )


class UserProfiles(SQLModel, table=True):
    __tablename__ = "user_profiles"

    profile_id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", unique=True, index=True)
    full_name: str = Field(max_length=255)
    avatar_url: Optional[str] = Field(default=None)
    bio: Optional[str] = Field(default=None, max_length=500)
    date_of_birth: date
    gender: GenderEnum
    base_location: Optional[str] = Field(default=None, max_length=100)
    travel_style: Optional[TravelStyle] = Field(default=None)
    privacy_status: PrivacyStatus = Field(default=PrivacyStatus.PUBLIC)
    identity_doc_url: Optional[str] = Field(default=None)
    selfie_url: Optional[str] = Field(default=None)
    kyc_status: KycStatus = Field(default=KycStatus.UNVERIFIED)
    total_points: int = Field(default=0, ge=0)
    points_balance: int = Field(default=0, ge=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class UserSessions(SQLModel, table=True):
    __tablename__ = "user_sessions"

    session_id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", index=True)
    device_id: str = Field(max_length=255)
    refresh_token_hash: str = Field(max_length=512)
    is_revoked: bool = Field(default=False)
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================
# GROUP 2: ENTERPRISE
# ============================================================

class EnterpriseProfiles(SQLModel, table=True):
    __tablename__ = "enterprise_profiles"

    enterprise_id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", index=True)
    business_name: str = Field(max_length=255)
    contact_person: str = Field(max_length=255)
    contact_email: str = Field(max_length=50)
    contact_phone: str = Field(max_length=10)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    status: EnterpriseStatus = Field(default=EnterpriseStatus.PENDING)


class VerificationLogs(SQLModel, table=True):
    __tablename__ = "verification_logs"

    log_id: Optional[int] = Field(default=None, primary_key=True)
    enterprise_id: UUID = Field(foreign_key="enterprise_profiles.enterprise_id", index=True)
    admin_id: UUID = Field(foreign_key="users.user_id")
    action: VerificationAction
    reason: Optional[str] = Field(default=None, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================
# GROUP 3: REFERENCE DATA
# ============================================================

class ReferenceMasterData(SQLModel, table=True):
    __tablename__ = "reference_master_data"

    ref_code: str = Field(max_length=50, primary_key=True)
    ref_type: str = Field(max_length=50, index=True)
    ref_value: str = Field(max_length=255)
    is_active: bool = Field(default=True)


class Tags(SQLModel, table=True):
    __tablename__ = "tags"

    tag_id: Optional[int] = Field(default=None, primary_key=True)
    tag_name: str = Field(max_length=50, unique=True, index=True)


class Categories(SQLModel, table=True):
    __tablename__ = "categories"

    category_id: Optional[int] = Field(default=None, primary_key=True)
    category_name: str = Field(max_length=50, unique=True, index=True)


class Cities(SQLModel, table=True):
    __tablename__ = "cities"

    city_id: Optional[int] = Field(default=None, primary_key=True)
    city_name: str = Field(max_length=255, unique=True, index=True)
    region: str = Field(max_length=100)
    country: str = Field(max_length=100, default="VIETNAM")
    description: Optional[str] = Field(default=None, max_length=255)
    image_url: Optional[str] = Field(default=None, max_length=500)
    latitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    longitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================
# GROUP 4: USER PREFERENCES & HISTORY
# ============================================================

class PreferenceTagWeights(SQLModel, table=True):
    __tablename__ = "preference_tag_weights"

    tag_id: int = Field(foreign_key="tags.tag_id", primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", primary_key=True)
    weight: float = Field(ge=0.0, lt=1.0)
    update_at: datetime = Field(default_factory=datetime.utcnow)


class CategoryVisitHistory(SQLModel, table=True):
    __tablename__ = "category_visit_history"

    category_id: int = Field(foreign_key="categories.category_id", primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", primary_key=True)
    visit_count: int = Field(default=0, ge=0)
    last_visit: datetime


# ============================================================
# GROUP 5: LOCATIONS
# ============================================================

class Locations(SQLModel, table=True):
    __tablename__ = "locations"

    location_id: UUID = Field(default_factory=uuid4, primary_key=True)
    location_name: str = Field(max_length=255, index=True)
    latitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    longitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    city_id: int = Field(foreign_key="cities.city_id", index=True)
    open_time: time
    close_time: time
    min_price: Decimal = Field(sa_column=Column(Numeric(18, 2), nullable=False))
    max_price: Decimal = Field(sa_column=Column(Numeric(18, 2), nullable=False))
    currency: CurrencyEnum = Field(default=CurrencyEnum.VND)
    create_at: datetime = Field(default_factory=datetime.utcnow)
    update_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("latitude", "longitude", name="uq_location_coord"),
    )


class LocationsImage(SQLModel, table=True):
    __tablename__ = "locations_image"

    image_id: Optional[int] = Field(default=None, primary_key=True)
    location_id: UUID = Field(foreign_key="locations.location_id", index=True)
    url: str = Field(max_length=500, unique=True)
    display_order: int = Field(default=1, gt=0)
    update_at: datetime = Field(default_factory=datetime.utcnow)


class LocationTags(SQLModel, table=True):
    __tablename__ = "location_tags"

    location_id: UUID = Field(foreign_key="locations.location_id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.tag_id", primary_key=True)


class LocationCategories(SQLModel, table=True):
    __tablename__ = "location_categories"

    location_id: UUID = Field(foreign_key="locations.location_id", primary_key=True)
    category_id: int = Field(foreign_key="categories.category_id", primary_key=True)


class BusinessLocation(SQLModel, table=True):
    __tablename__ = "business_location"

    business_id: UUID = Field(foreign_key="enterprise_profiles.enterprise_id", primary_key=True)
    location_id: UUID = Field(foreign_key="locations.location_id", primary_key=True)


class LocationStats(SQLModel, table=True):
    __tablename__ = "location_stats"

    stat_id: Optional[int] = Field(default=None, primary_key=True)
    location_id: UUID = Field(foreign_key="locations.location_id", index=True)
    total_views: int = Field(default=0)
    total_checkins: int = Field(default=0)
    completion_rate: float = Field(default=0.0, ge=0.0, le=100.0)
    recorded_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================
# GROUP 6: PLANNING & ITINERARY
# ============================================================

class PlanningSessions(SQLModel, table=True):
    __tablename__ = "planning_sessions"

    session_id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", index=True)
    city_id: int = Field(foreign_key="cities.city_id", index=True)
    pax_adult: int = Field(default=1, gt=0)
    pax_children: int = Field(default=0, ge=0)
    budget: Decimal = Field(sa_column=Column(Numeric(18, 2), nullable=False))
    currency: CurrencyEnum = Field(default=CurrencyEnum.VND)
    start_day: date
    end_day: date
    status: PlanningStatus = Field(default=PlanningStatus.PENDING)
    create_at: datetime = Field(default_factory=datetime.utcnow)


class RequestHistoryLogs(SQLModel, table=True):
    __tablename__ = "request_history_logs"

    log_id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="planning_sessions.session_id", index=True)
    action_type: RequestActionType
    state_before: Optional[str] = Field(default=None)
    create_at: datetime = Field(default_factory=datetime.utcnow)


class TravelRequestPreferences(SQLModel, table=True):
    __tablename__ = "travel_request_preferences"

    session_id: UUID = Field(foreign_key="planning_sessions.session_id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.tag_id", primary_key=True)


class Itineraries(SQLModel, table=True):
    __tablename__ = "itineraries"

    itinerary_id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="planning_sessions.session_id", index=True)
    user_id: UUID = Field(foreign_key="users.user_id", index=True)
    name: Optional[str] = Field(default=None, max_length=255)
    status: ItineraryStatus = Field(default=ItineraryStatus.DRAFT)
    total_budget: Decimal = Field(sa_column=Column(Numeric(18, 2), nullable=False))
    currency: CurrencyEnum = Field(default=CurrencyEnum.VND)
    budget_category: str = Field(default="MEDIUM", max_length=20)
    total_travel_time: int = Field(ge=0)
    total_distance: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    create_at: datetime = Field(default_factory=datetime.utcnow)
    update_at: datetime = Field(default_factory=datetime.utcnow)


class ItineraryDays(SQLModel, table=True):
    __tablename__ = "itinerary_days"

    day_id: Optional[int] = Field(default=None, primary_key=True)
    itinerary_id: UUID = Field(foreign_key="itineraries.itinerary_id", index=True)
    day_order: int = Field(gt=0)
    travel_date: date
    estimated_budget: Decimal = Field(sa_column=Column(Numeric(18, 2), nullable=False))
    currency: CurrencyEnum = Field(default=CurrencyEnum.VND)
    total_time: int = Field(ge=0)


class ItineraryStops(SQLModel, table=True):
    __tablename__ = "itinerary_stops"

    stop_id: Optional[int] = Field(default=None, primary_key=True)
    day_id: int = Field(foreign_key="itinerary_days.day_id", index=True)
    location_id: UUID = Field(foreign_key="locations.location_id", index=True)
    stop_order: int = Field(gt=0)
    arrival_time: time
    departure_time: time
    checkin_radius: int = Field(default=100)
    reward: int = Field(default=0, ge=0)
    estimated_price: Decimal = Field(sa_column=Column(Numeric(18, 2), nullable=False, default=0))
    status: StopStatus = Field(default=StopStatus.PENDING)


class ItineraryRoutes(SQLModel, table=True):
    __tablename__ = "itinerary_routes"

    route_id: Optional[int] = Field(default=None, primary_key=True)
    from_stop_id: int = Field(foreign_key="itinerary_stops.stop_id")
    to_stop_id: int = Field(foreign_key="itinerary_stops.stop_id")
    travel_time: int = Field(ge=0)
    distance: Decimal = Field(sa_column=Column(Numeric(10, 2), nullable=False))
    polyline_data: str


# ============================================================
# GROUP 7: TRACKING
# ============================================================

class CheckinProgress(SQLModel, table=True):
    __tablename__ = "checkin_progress"

    progress_id: Optional[int] = Field(default=None, primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", index=True)
    stop_id: int = Field(foreign_key="itinerary_stops.stop_id", index=True)
    is_completed: bool = Field(default=False)
    checkin_time: datetime = Field(default_factory=datetime.utcnow)
    latitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    longitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))

    __table_args__ = (
        UniqueConstraint("user_id", "stop_id", name="uq_checkin"),
    )


class GpsTrackingLogs(SQLModel, table=True):
    __tablename__ = "gps_tracking_logs"

    log_id: Optional[int] = Field(default=None, primary_key=True)
    progress_id: int = Field(foreign_key="checkin_progress.progress_id", index=True)
    latitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    longitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    tracking_time: datetime = Field(default_factory=datetime.utcnow)


class DeviationLogs(SQLModel, table=True):
    __tablename__ = "deviation_logs"

    alert_id: Optional[int] = Field(default=None, primary_key=True)
    itinerary_id: UUID = Field(foreign_key="itineraries.itinerary_id", index=True)
    latitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    longitude: Decimal = Field(sa_column=Column(Numeric(10, 6), nullable=False))
    alert_time: datetime = Field(default_factory=datetime.utcnow)


# ============================================================
# GROUP 8: SYSTEM MANAGEMENT
# ============================================================

class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_log"

    log_id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", index=True)
    action: str = Field(max_length=100)
    status: str = Field(max_length=50)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    user_agent: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SystemSettings(SQLModel, table=True):
    __tablename__ = "system_settings"

    setting_id: Optional[int] = Field(default=None, primary_key=True)
    config_key: str = Field(max_length=100, unique=True, index=True)
    config_value: str
    updated_by: UUID = Field(foreign_key="users.user_id")
    update_at: datetime = Field(default_factory=datetime.utcnow)


class SystemMetrics(SQLModel, table=True):
    __tablename__ = "system_metrics"

    metric_id: Optional[int] = Field(default=None, primary_key=True)
    cpu_usage: float = Field(ge=0.0, le=100.0)
    ram_usage: float = Field(ge=0.0, le=100.0)
    api_latency: float = Field(ge=0.0)
    recorded_at: datetime = Field(default_factory=datetime.utcnow)


class ExportHistories(SQLModel, table=True):
    __tablename__ = "export_histories"

    export_id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", index=True)
    format: ExportFormat
    file_url: str = Field(max_length=500)
    status: ExportStatus = Field(default=ExportStatus.PROCESSING)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserFeedbacks(SQLModel, table=True):
    __tablename__ = "user_feedbacks"

    feedback_id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.user_id", index=True)
    feedback_type: FeedbackType
    content: str
    status: FeedbackStatus = Field(default=FeedbackStatus.PENDING)
    created_at: datetime = Field(default_factory=datetime.utcnow)
