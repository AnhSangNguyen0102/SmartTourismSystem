"""
================================================================================
 crud/crud_tracking.py  │  USE CASE: Tracking hành trình & Check-in
================================================================================
 Q   Op      Table(s)                                  Function
 ──  ──────  ────────────────────────────────────────  ──────────────────────────
 Q1  INSERT  CHECKIN_PROGRESS                          create_checkin_progress
 Q2  UPDATE  CHECKIN_PROGRESS, ITINERARY_STOPS         update_checkin_status
 Q3  INSERT  GPS_TRACKING_LOGS                         create_gps_log
 Q4  INSERT  DEVIATION_LOGS                            create_deviation_log
 Q5  SELECT  ITINERARY_DAYS, ITINERARY_STOPS           verify_stop_in_itinerary
 Q6  SELECT  CHECKIN_PROGRESS                          get_checkin_by_stop
 Q7  SELECT  ITINERARY_STOPS, LOCATIONS                get_stop_with_radius
================================================================================
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from models import (
    CheckinProgress,
    GpsTrackingLogs,
    DeviationLogs,
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
# Q3 – Ghi nhật ký tọa độ GPS  (INSERT INTO gps_tracking_logs)
# ---------------------------------------------------------------------------

def create_gps_log(
    db: Session,
    *,
    progress_id: int,
    latitude: Decimal,
    longitude: Decimal,
    tracking_time: Optional[datetime] = None,
) -> GpsTrackingLogs:
    """
    Ghi một điểm tọa độ GPS vào ``gps_tracking_logs``.

    Hàm này được gọi liên tục trong quá trình di chuyển (mỗi N giây).
    ``tracking_time`` mặc định là thời điểm hiện tại (UTC) nếu không truyền.

    Parameters
    ----------
    progress_id : int
        Khóa ngoại trỏ đến ``checkin_progress.progress_id``.
    latitude, longitude : Decimal
        Tọa độ GPS tại thời điểm ghi.
    """
    if tracking_time is None:
        tracking_time = datetime.now(timezone.utc).replace(tzinfo=None)

    log = GpsTrackingLogs(
        progress_id=progress_id,
        latitude=latitude,
        longitude=longitude,
        tracking_time=tracking_time,
    )
    db.add(log)
    db.flush()
    db.refresh(log)
    return log


# ---------------------------------------------------------------------------
# Q4 – Ghi cảnh báo lệch lộ trình  (INSERT INTO deviation_logs)
# ---------------------------------------------------------------------------

def create_deviation_log(
    db: Session,
    *,
    itinerary_id: UUID,
    latitude: Decimal,
    longitude: Decimal,
    alert_time: Optional[datetime] = None,
) -> DeviationLogs:
    """
    Ghi một cảnh báo vào ``deviation_logs`` khi user đi lệch lộ trình.

    ``alert_time`` mặc định là thời điểm hiện tại (UTC) nếu không truyền.

    Parameters
    ----------
    itinerary_id : UUID
        Lộ trình đang bị lệch.
    latitude, longitude : Decimal
        Tọa độ GPS tại thời điểm phát hiện lệch.
    """
    if alert_time is None:
        alert_time = datetime.now(timezone.utc).replace(tzinfo=None)

    deviation = DeviationLogs(
        itinerary_id=itinerary_id,
        latitude=latitude,
        longitude=longitude,
        alert_time=alert_time,
    )
    db.add(deviation)
    db.flush()
    db.refresh(deviation)
    return deviation


# ---------------------------------------------------------------------------
# Q5 – Kiểm tra stop có thuộc chuyến đi không  (UC8 Q4)
#       SELECT itineraries + itinerary_days + itinerary_stops + locations
# ---------------------------------------------------------------------------

def verify_stop_in_itinerary(
    db: Session,
    itinerary_id: UUID,
    stop_id: int,
) -> bool:
    """
    Kiểm tra xem *stop_id* có thuộc về *itinerary_id* hay không.

    Dùng để ngăn user check-in vào trạm không thuộc chuyến đi của họ.

    Returns
    -------
    bool
        ``True`` nếu stop thuộc itinerary, ``False`` nếu không.
    """
    statement = (
        select(ItineraryStops.stop_id)
        .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
        .where(
            ItineraryDays.itinerary_id == itinerary_id,
            ItineraryStops.stop_id == stop_id,
        )
    )
    result = db.exec(statement).first()
    return result is not None


# ---------------------------------------------------------------------------
# Q6 – Kiểm tra stop đã được check-in chưa  (UC8 Q5)
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
# Q7 – Lấy tọa độ + bán kính cho phép của trạm  (UC8 Q6)
#       SELECT itinerary_stops + locations WHERE stop_id = ?
# ---------------------------------------------------------------------------

def get_stop_with_radius(db: Session, stop_id: int):
    """
    Lấy thông tin tọa độ GPS và bán kính check-in của *stop_id*.

    Dùng để tính khoảng cách Haversine giữa vị trí thực tế của user
    và tọa độ địa điểm trước khi cho phép check-in.

    Columns trả về:
        stop_id, checkin_radius,
        location_id, location_name, latitude, longitude.

    Trả về ``None`` nếu không tìm thấy stop.
    """
    statement = (
        select(
            ItineraryStops.stop_id,
            ItineraryStops.checkin_radius,
            ItineraryStops.reward,
            Locations.location_id,
            Locations.location_name,
            Locations.latitude,
            Locations.longitude,
        )
        .join(Locations, ItineraryStops.location_id == Locations.location_id)
        .where(ItineraryStops.stop_id == stop_id)
    )
    return db.exec(statement).first()
# ---------------------------------------------------------------------------
# Q8b – Gộp: Kiểm tra quyền sở hữu + Lấy dữ liệu trạm (1 query thay vì 2)
# ---------------------------------------------------------------------------

def get_stop_with_ownership(
    db: Session,
    user_id: UUID,
    stop_id: int,
):
    """
    Gộp ``verify_stop_ownership`` + ``get_stop_with_radius`` thành 1 query duy nhất.
    Trả về dữ liệu trạm nếu user sở hữu, ``None`` nếu không.
    """
    statement = (
        select(
            ItineraryStops.stop_id,
            ItineraryStops.checkin_radius,
            ItineraryStops.reward,
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
