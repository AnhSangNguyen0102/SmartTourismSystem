from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from database import get_db
import core.security as security
import crud.crud_user as crud_user
from schemas import (
    CreateItineraryRequest, ItineraryOut,
    CheckInRequest, CheckInResponse, TripProgressResponse
)
from crud.crud_location import get_locations_by_ids
from crud.crud_trip import (
    create_itinerary, create_itinerary_day, create_itinerary_stop,
    get_itinerary, update_itinerary_status, get_itinerary_stop, mark_stop_completed
)
from core.algorithms import estimate_travel_time, check_within_radius

router = APIRouter(prefix="/api/trips", tags=["Trips - Lộ trình & Theo dõi"])

def get_current_user_id(db: Session, current_user_dict: dict) -> str:
    """Lấy user_id thực tế từ database dựa trên email trong token."""
    email = current_user_dict.get("sub")
    user = crud_user.get_user_by_email(db, email=email)
    if not user:
        raise HTTPException(status_code=401, detail="User không tồn tại")
    return user.user_id


@router.post("/create", response_model=ItineraryOut, summary="Tạo lộ trình mới")
def create_new_itinerary(
    request: CreateItineraryRequest, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.verify_token)
):
    user_id = get_current_user_id(db, current_user)

    # 1. Validate locations
    locations = get_locations_by_ids(db, request.location_ids)
    found_ids = {loc.location_id for loc in locations}
    missing = [lid for lid in request.location_ids if lid not in found_ids]
    if missing:
        raise HTTPException(status_code=400, detail=f"Không tìm thấy địa điểm: {missing}")

    loc_map = {loc.location_id: loc for loc in locations}
    ordered_locations = [loc_map[lid] for lid in request.location_ids]

    # 2. Tính tổng thời gian di chuyển
    total_time = 0
    for i in range(len(ordered_locations) - 1):
        a = ordered_locations[i]
        b = ordered_locations[i + 1]
        total_time += estimate_travel_time(float(a.latitude), float(a.longitude), float(b.latitude), float(b.longitude))

    # 3. Lưu vào DB theo 3 lớp: Itinerary -> ItineraryDay -> ItineraryStop
    # Để đơn giản trong phiên bản này, ta dồn tất cả vào 1 ngày duy nhất (Day 1)
    trip = create_itinerary(db, user_id=user_id, name=request.name, total_travel_time=total_time)
    
    day = create_itinerary_day(
        db, 
        itinerary_id=trip.itinerary_id, 
        day_order=1, 
        travel_date=request.start_date.isoformat(), 
        total_time=total_time
    )

    for order, loc_id in enumerate(request.location_ids, start=1):
        create_itinerary_stop(db, day_id=day.day_id, location_id=loc_id, stop_order=order)

    # Reload
    full_trip = get_itinerary(db, trip.itinerary_id)
    return ItineraryOut.model_validate(full_trip)


@router.get("/{itinerary_id}", response_model=ItineraryOut, summary="Xem chi tiết lộ trình")
def get_trip_detail(itinerary_id: str, db: Session = Depends(get_db)):
    trip = get_itinerary(db, itinerary_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Không tìm thấy chuyến đi")
    return ItineraryOut.model_validate(trip)


@router.post("/{stop_id}/checkin", response_model=CheckInResponse, summary="Check-in tại trạm")
def checkin_stop(
    stop_id: int, 
    request: CheckInRequest, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(security.verify_token)
):
    user_id = get_current_user_id(db, current_user)
    
    stop = get_itinerary_stop(db, stop_id)
    if not stop:
        raise HTTPException(status_code=404, detail="Không tìm thấy trạm dừng")
        
    if stop.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Trạm này đã được check-in trước đó")

    # Kiểm tra bán kính
    is_within, distance = check_within_radius(
        request.latitude, request.longitude,
        float(stop.location.latitude), float(stop.location.longitude),
        radius_m=stop.checkin_radius
    )

    if not is_within:
        raise HTTPException(
            status_code=400,
            detail=f"Bạn cách trạm {distance:.0f}m. Cần ở trong phạm vi {stop.checkin_radius}m để check-in."
        )

    # Lưu log
    progress = mark_stop_completed(db, user_id, stop_id, request.latitude, request.longitude)

    return CheckInResponse(
        success=True,
        message=f"✅ Check-in thành công tại '{stop.location.location_name}'!",
        stop_id=stop_id,
        progress_id=progress.progress_id
    )