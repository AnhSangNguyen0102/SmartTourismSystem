from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from models import Itinerary, ItineraryDay, ItineraryStop, CheckinProgress

def create_itinerary(
    db: Session,
    user_id: str,
    name: str,
    total_travel_time: int,
) -> Itinerary:
    """Tạo một lộ trình (Itinerary) mới."""
    db_itinerary = Itinerary(
        user_id=user_id,
        name=name,
        status="DRAFT",
        total_travel_time=total_travel_time
    )
    db.add(db_itinerary)
    db.commit()
    db.refresh(db_itinerary)
    return db_itinerary

def create_itinerary_day(
    db: Session,
    itinerary_id: str,
    day_order: int,
    travel_date: str,
    total_time: int
) -> ItineraryDay:
    """Tạo thông tin một ngày trong lộ trình."""
    db_day = ItineraryDay(
        itinerary_id=itinerary_id,
        day_order=day_order,
        travel_date=travel_date,
        total_time=total_time
    )
    db.add(db_day)
    db.commit()
    db.refresh(db_day)
    return db_day

def create_itinerary_stop(
    db: Session,
    day_id: int,
    location_id: str,
    stop_order: int,
    checkin_radius: int = 100
) -> ItineraryStop:
    """Tạo một điểm dừng trong ngày."""
    db_stop = ItineraryStop(
        day_id=day_id,
        location_id=location_id,
        stop_order=stop_order,
        # Đặt thời gian dummy vì hiện tại chưa có logic tính toán thời gian chính xác
        arrival_time="08:00:00",
        departure_time="09:00:00",
        checkin_radius=checkin_radius,
        status="PENDING"
    )
    db.add(db_stop)
    db.commit()
    db.refresh(db_stop)
    return db_stop

def get_itinerary(db: Session, itinerary_id: str) -> Optional[Itinerary]:
    """Lấy thông tin lộ trình kèm theo ngày và các điểm dừng."""
    return (
        db.query(Itinerary)
        .filter(Itinerary.itinerary_id == itinerary_id)
        .options(
            joinedload(Itinerary.days)
            .joinedload(ItineraryDay.stops)
            .joinedload(ItineraryStop.location)
        )
        .first()
    )

def update_itinerary_status(db: Session, itinerary_id: str, status: str) -> Optional[Itinerary]:
    """Cập nhật trạng thái của lộ trình."""
    db_itinerary = db.query(Itinerary).filter(Itinerary.itinerary_id == itinerary_id).first()
    if db_itinerary:
        db_itinerary.status = status
        db_itinerary.updated_at = func.now()
        db.commit()
        db.refresh(db_itinerary)
    return db_itinerary

def get_itinerary_stop(db: Session, stop_id: int) -> Optional[ItineraryStop]:
    """Lấy thông tin 1 điểm dừng cụ thể để phục vụ Check-in."""
    return (
        db.query(ItineraryStop)
        .filter(ItineraryStop.stop_id == stop_id)
        .options(joinedload(ItineraryStop.location))
        .first()
    )

def mark_stop_completed(db: Session, user_id: str, stop_id: int, lat: float, lon: float) -> CheckinProgress:
    """Đánh dấu điểm dừng là đã hoàn thành và lưu log Checkin."""
    # Đổi trạng thái trạm
    db_stop = db.query(ItineraryStop).filter(ItineraryStop.stop_id == stop_id).first()
    if db_stop:
        db_stop.status = "COMPLETED"
    
    # Tạo log check-in
    db_progress = CheckinProgress(
        user_id=user_id,
        stop_id=stop_id,
        is_completed=True,
        latitude=lat,
        longitude=lon
    )
    db.add(db_progress)
    db.commit()
    db.refresh(db_progress)
    
    return db_progress