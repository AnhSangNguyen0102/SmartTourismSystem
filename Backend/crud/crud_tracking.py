"""
================================================================================
 crud/crud_tracking.py  │  USE CASE: Check-in địa điểm
================================================================================
 Q   Op      Table(s)                                  Function
 ──  ──────  ────────────────────────────────────────  ──────────────────────────
 Q1  INSERT  CHECKIN_PROGRESS                          create_checkin_progress
 Q2  UPDATE  CHECKIN_PROGRESS, ITINERARY_STOPS         update_checkin_status
 Q3  SELECT  CHECKIN_PROGRESS                          get_checkin_by_stop
 Q4  SELECT  ITINERARY_STOPS, LOCATIONS, ITINERARIES  get_stop_with_ownership
================================================================================
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from models import (
    CheckinProgress,
    ItineraryStops,
    ItineraryDays,
    Itineraries,
    Locations,
    StopStatus,
)


# ---------------------------------------------------------------------------
# Q1 – Tạo bản ghi check-in  (INSERT INTO checkin_progress)
# ---------------------------------------------------------------------------

def create_checkin_progress(
    db: Session,
    *,
    user_id: UUID,
    stop_id: int,
    latitude: Decimal,
    longitude: Decimal,
    checkin_time: Optional[datetime] = None,
) -> CheckinProgress:
    """
    Tạo bản ghi ``checkin_progress`` khi user đến trạm dừng.

    - ``is_completed`` mặc định là ``False`` — sẽ cập nhật sau khi
      xác nhận hoàn tất qua :func:`update_checkin_status`.
    - ``checkin_time`` mặc định là thời điểm hiện tại (UTC) nếu không truyền.

    Parameters
    ----------
    latitude, longitude : Decimal
        Tọa độ GPS tại thời điểm check-in.
    """
    if checkin_time is None:
        checkin_time = datetime.now(timezone.utc).replace(tzinfo=None)

    progress = CheckinProgress(
        user_id=user_id,
        stop_id=stop_id,
        is_completed=False,
        checkin_time=checkin_time,
        latitude=latitude,
        longitude=longitude,
    )
    db.add(progress)
    db.flush()
    db.refresh(progress)
    return progress


# ---------------------------------------------------------------------------
# Q2 – Cập nhật trạng thái hoàn thành check-in & stop
#       UPDATE checkin_progress SET is_completed = true WHERE progress_id = ?
#       UPDATE itinerary_stops SET status = 'COMPLETED' WHERE stop_id = ?
# ---------------------------------------------------------------------------

def update_checkin_status(
    db: Session,
    progress_id: int,
    stop_id: int,
    latitude: Optional[Decimal] = None,
    longitude: Optional[Decimal] = None,
) -> tuple[Optional[CheckinProgress], Optional[ItineraryStops], bool]:
    """
    Đánh dấu check-in hoàn thành và cập nhật trạng thái stop sang COMPLETED.

    Thực hiện 2 UPDATE trong cùng một transaction:
    1. ``checkin_progress.is_completed = True``
    2. ``itinerary_stops.status = 'COMPLETED'``

    Returns
    -------
    tuple[CheckinProgress | None, ItineraryStops | None, bool]
        Cặp (progress, stop) sau cập nhật, và cờ bool báo hiệu vừa mới complete (tránh race condition).
    """
    is_new_completion = False
    
    # 1. Cập nhật checkin_progress
    progress = db.exec(
        select(CheckinProgress)
        .where(CheckinProgress.progress_id == progress_id)
    ).first()
    
    if progress is not None:
        if not progress.is_completed:
            progress.is_completed = True
            is_new_completion = True
            
        if latitude is not None:
            progress.latitude = latitude
        if longitude is not None:
            progress.longitude = longitude
        db.add(progress)

    # 2. Cập nhật itinerary_stops
    stop = db.exec(
        select(ItineraryStops).where(ItineraryStops.stop_id == stop_id)
    ).first()
    if stop is not None:
        stop.status = StopStatus.COMPLETED
        db.add(stop)

    db.flush()

    return progress, stop, is_new_completion


# ---------------------------------------------------------------------------
# Q3 – Kiểm tra stop đã được check-in chưa  (UC8 Q5)
#       SELECT checkin_progress WHERE user_id = ? AND stop_id = ?
# ---------------------------------------------------------------------------

def get_checkin_by_stop(
    db: Session,
    user_id: UUID,
    stop_id: int,
) -> Optional[CheckinProgress]:
    """
    Tìm bản ghi ``checkin_progress`` của *user_id* tại *stop_id*.

    - Trả về bản ghi nếu đã từng check-in (dù chưa hoàn thành).
    - Trả về ``None`` nếu chưa check-in lần nào.

    Caller kiểm tra ``row.is_completed`` để biết đã hoàn thành hay chưa.
    """
    statement = select(CheckinProgress).where(
        CheckinProgress.user_id == user_id,
        CheckinProgress.stop_id == stop_id,
    )
    return db.exec(statement).first()


# ---------------------------------------------------------------------------
# Q4 – Kiểm tra quyền sở hữu + Lấy dữ liệu trạm
# ---------------------------------------------------------------------------

def get_stop_with_ownership(
    db: Session,
    user_id: UUID,
    stop_id: int,
):
    """
    Trả về dữ liệu trạm nếu user sở hữu, ``None`` nếu không.
    """
    statement = (
        select(
            ItineraryStops.stop_id,
            ItineraryStops.checkin_radius,
            ItineraryStops.reward,
            ItineraryStops.stop_order,
            Itineraries.itinerary_id,
            Locations.location_id,
            Locations.location_name,
            Locations.latitude,
            Locations.longitude,
        )
        .join(Locations, ItineraryStops.location_id == Locations.location_id)
        .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
        .join(Itineraries, ItineraryDays.itinerary_id == Itineraries.itinerary_id)
        .where(
            Itineraries.user_id == user_id,
            ItineraryStops.stop_id == stop_id,
        )
    )
    return db.exec(statement).first()


# ---------------------------------------------------------------------------
# Q8 – Kiểm tra quyền sở hữu trạm (Anti IDOR) — giữ lại cho endpoint khác
# ---------------------------------------------------------------------------

def verify_stop_ownership(
    db: Session,
    user_id: UUID,
    stop_id: int,
) -> bool:
    """
    Kiểm tra xem *stop_id* có thuộc về một itinerary do *user_id* tạo ra hay không.
    Dùng để chặn IDOR trong quá trình check-in.
    """
    statement = (
        select(ItineraryStops.stop_id)
        .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
        .join(Itineraries, ItineraryDays.itinerary_id == Itineraries.itinerary_id)
        .where(
            Itineraries.user_id == user_id,
            ItineraryStops.stop_id == stop_id,
        )
    )
    result = db.exec(statement).first()
    return result is not None

# MỚI: thêm hàm
def complete_itinerary_stop(db: Session, user_id: UUID, stop_id: int) -> bool:
    """
    Đánh dấu một trạm dừng trong hành trình là ĐÃ HOÀN THÀNH.
    Được gọi khi người chơi bấm nút 'Check-in hoàn thành' sau khi làm xong các tasks.
    """
    # 1. Kiểm tra ownership (chống gian lận IDOR)
    is_owner = verify_stop_ownership(db, user_id, stop_id)
    if not is_owner:
        return False
        
    # 2. Cập nhật trạng thái
    stop = db.get(ItineraryStops, stop_id)
    if stop and stop.status != StopStatus.COMPLETED:
        stop.status = StopStatus.COMPLETED
        db.add(stop)
        
        # Tự động hoàn thành các nhiệm vụ hằng ngày loại EXPLORE và DISTANCE
        from routers.gamification import auto_complete_daily_quest
        try:
            auto_complete_daily_quest(db, user_id, "EXPLORE")
            auto_complete_daily_quest(db, user_id, "DISTANCE")
        except Exception as e:
            print(f"[Daily Quest] Lỗi tự động hoàn thành: {e}")
            
        db.commit()
        return True
    return False
