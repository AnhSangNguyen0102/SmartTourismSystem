# Định nghĩa dữ liệu đầu vào/đầu ra cho API
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import date, time, datetime

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    device_id: Optional[str] = "mobile_app"

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str  
    token_type: str = "bearer"
    role: str
    full_name: str


class SuggestionRequest(BaseModel):
    city_id: int = Field(..., description="ID của thành phố cần gợi ý")
    budget: float = Field(..., description="Ngân sách tối đa của người dùng")
    preferred_tags: List[str] = Field(default=[], description="Danh sách tên các tag sở thích (ví dụ: 'biển', 'núi')")
    max_results: int = 10

class LocationOut(BaseModel):
    location_id: str
    location_name: str
    latitude: float
    longitude: float
    opentime: time
    closetime: time
    min_price: float
    max_price: float
    currency: str
    tags: List[str] = []
    score: Optional[float] = None # Điểm gợi ý sau khi tính toán

    class Config:
        from_attributes = True

class SuggestionResponse(BaseModel):
    total: int
    locations: List[LocationOut]

class CreateItineraryRequest(BaseModel):
    name: str = Field(..., description="Tên lộ trình")
    start_date: date
    end_date: date
    location_ids: List[str] = Field(..., description="Danh sách ID các địa điểm người dùng đã chọn")

class ItineraryStopOut(BaseModel):
    stop_id: int
    location_id: str
    stop_order: int
    arrival_time: time
    departure_time: time
    checkin_radius: int
    status: str
    location: Optional[LocationOut] = None

    class Config:
        from_attributes = True

class ItineraryDayOut(BaseModel):
    day_id: int
    day_order: int
    travel_date: date
    estimated_budget: float
    total_time: int
    stops: List[ItineraryStopOut] = []

    class Config:
        from_attributes = True

class ItineraryOut(BaseModel):
    itinerary_id: str
    user_id: str
    name: Optional[str]
    status: str
    total_budget: float
    currency: str
    total_travel_time: int
    total_distance: float
    days: List[ItineraryDayOut] = []

    class Config:
        from_attributes = True

class CheckInRequest(BaseModel):
    latitude: float = Field(..., description="Vĩ độ hiện tại của GPS điện thoại")
    longitude: float = Field(..., description="Kinh độ hiện tại của GPS điện thoại")

class CheckInResponse(BaseModel):
    success: bool
    message: str
    stop_id: int
    progress_id: int

class TripProgressResponse(BaseModel):
    itinerary_id: str
    status: str
    total_stops: int
    completed_stops: int
    completion_percentage: float