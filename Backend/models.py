# Định nghĩa các bảng SQL (Users, Locations, Trips,...).
import uuid
from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, Date, Time, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    user_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = Column(String(255))
    passwordhash = Column(String(255), nullable=False) 
    email = Column(String(255), unique=True, index=True, nullable=False)
    social_id = Column(String(255), nullable=True)
    register_type = Column(String(50), default="EMAIL")
    role = Column(String(50), default="USER")
    status = Column(String(20), default="ACTIVE")
    create_at = Column(DateTime(timezone=True), server_default=func.now())
    update_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

class UserSession(Base):
    __tablename__ = "user_sessions"

    session_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.user_id"))
    device_id = Column(String(255))
    refresh_token_hash = Column(String(500))
    is_revoked = Column(Boolean, default=False) 
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# ======================================================================
# PHẦN BỔ SUNG: BẢNG DỮ LIỆU LIÊN QUAN ĐẾN LỘ TRÌNH VÀ GỢI Ý ĐỊA ĐIỂM
# Lưu ý: Các ID được định dạng kiểu String(36) để chứa UUID theo đúng file thiết kế.
# ======================================================================

class City(Base):
    __tablename__ = "cities"

    city_id = Column(Integer, primary_key=True, index=True)
    city_name = Column(String(255), nullable=False)
    region = Column(String(100), nullable=False)
    country = Column(String(100), default="VIETNAM", nullable=False)
    description = Column(String(255), nullable=True)
    image_url = Column(String(500), nullable=True)
    latitude = Column(Numeric(10, 6), nullable=False)
    longitude = Column(Numeric(10, 6), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    locations = relationship("Location", back_populates="city")


class Tag(Base):
    __tablename__ = "tags"

    tag_id = Column(Integer, primary_key=True, index=True) # INT IDENTITY
    tag_name = Column(String(50), nullable=False)

    locations = relationship("LocationTag", back_populates="tag")


class Location(Base):
    __tablename__ = "locations"

    location_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    location_name = Column(String(255), nullable=False)
    latitude = Column(Numeric(10, 6), nullable=False)
    longitude = Column(Numeric(10, 6), nullable=False)
    city_id = Column(Integer, ForeignKey("cities.city_id"), nullable=False)
    opentime = Column(Time, nullable=False)
    closetime = Column(Time, nullable=False)
    min_price = Column(Numeric(18, 2), nullable=False)
    max_price = Column(Numeric(18, 2), nullable=False)
    currency = Column(String(10), default="VND", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    city = relationship("City", back_populates="locations")
    tags = relationship("LocationTag", back_populates="location")


class LocationTag(Base):
    __tablename__ = "location_tags"

    location_id = Column(String(36), ForeignKey("locations.location_id"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.tag_id"), primary_key=True)

    location = relationship("Location", back_populates="tags")
    tag = relationship("Tag", back_populates="locations")


class Itinerary(Base):
    __tablename__ = "itineraries"

    itinerary_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.user_id"), nullable=False) 
    session_id = Column(String(36), nullable=True) # Có thể liên kết tới PlanningSession
    name = Column(String(255), nullable=True)
    status = Column(String(20), default="DRAFT", nullable=False)
    total_budget = Column(Numeric(18, 2), nullable=False, default=0)
    currency = Column(String(10), default="VND", nullable=False)
    total_travel_time = Column(Integer, nullable=False, default=0)
    total_distance = Column(Numeric(10, 2), nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    days = relationship("ItineraryDay", back_populates="itinerary", cascade="all, delete-orphan")


class ItineraryDay(Base):
    __tablename__ = "itineraries_days"

    day_id = Column(Integer, primary_key=True, index=True) # INT IDENTITY
    itinerary_id = Column(String(36), ForeignKey("itineraries.itinerary_id"), nullable=False)
    day_order = Column(Integer, nullable=False)
    travel_date = Column(Date, nullable=False)
    estimated_budget = Column(Numeric(18, 2), nullable=False, default=0)
    currency = Column(String(10), default="VND", nullable=False)
    total_time = Column(Integer, nullable=False, default=0)

    itinerary = relationship("Itinerary", back_populates="days")
    stops = relationship("ItineraryStop", back_populates="day", cascade="all, delete-orphan")


class ItineraryStop(Base):
    __tablename__ = "itineraries_stops"

    stop_id = Column(Integer, primary_key=True, index=True) # INT IDENTITY
    day_id = Column(Integer, ForeignKey("itineraries_days.day_id"), nullable=False)
    location_id = Column(String(36), ForeignKey("locations.location_id"), nullable=False)
    stop_order = Column(Integer, nullable=False)
    arrival_time = Column(Time, nullable=False)
    departure_time = Column(Time, nullable=False)
    checkin_radius = Column(Integer, nullable=False)
    reward = Column(Integer, nullable=False, default=0)
    status = Column(String(20), default="PENDING", nullable=False)

    day = relationship("ItineraryDay", back_populates="stops")
    location = relationship("Location")


class CheckinProgress(Base):
    __tablename__ = "checkin_progress"

    progress_id = Column(Integer, primary_key=True, index=True) # INT IDENTITY
    user_id = Column(String(36), ForeignKey("users.user_id"), nullable=False)
    stop_id = Column(Integer, ForeignKey("itineraries_stops.stop_id"), nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    checkin_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    latitude = Column(Numeric(10, 6), nullable=False)
    longitude = Column(Numeric(10, 6), nullable=False)