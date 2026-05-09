"""
================================================================================
 crud/crud_itinerary.py  │  USE CASE: Quản lý lộ trình
================================================================================
 Q   Op      Table(s)                                      Function
 ──  ──────  ────────────────────────────────────────────  ──────────────────────────────────────
 Q1  INSERT  ITINERARIES                                   create_itinerary
 Q2  INSERT  ITINERARY_DAYS                                create_itinerary_days
 Q3  INSERT  ITINERARY_STOPS                               create_itinerary_stops
 Q4  INSERT  ITINERARY_ROUTES                              create_itinerary_routes
 Q5  SELECT  ITINERARIES, ITINERARY_DAYS, ITINERARY_STOPS  get_itinerary_full
 Q6  UPDATE  ITINERARIES                                   update_itinerary_status
 Q7  SELECT  ITINERARIES                                   get_itinerary_history
 Q8  SELECT  ITINERARY_DAYS, ITINERARY_STOPS, LOCATIONS    get_itinerary_stops_with_locations
================================================================================
"""

from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlmodel import Session, select

from models import (
    Itineraries,
    ItineraryDays,
    ItineraryStops,
    ItineraryRoutes,
    ItineraryStatus,
    StopStatus,
    CurrencyEnum,
    Locations,
)


# ---------------------------------------------------------------------------
# Q1 – Tạo lộ trình tổng quan  (INSERT INTO itineraries)
# ---------------------------------------------------------------------------

def create_itinerary(
    db: Session,
    *,
    session_id: UUID,
    user_id: UUID,
    name: Optional[str] = None,
    status: ItineraryStatus = ItineraryStatus.DRAFT,
    total_budget: Decimal,
    currency: CurrencyEnum = CurrencyEnum.VND,
    total_travel_time: int,
    total_distance: Decimal,
) -> Itineraries:
    """
    Tạo bản ghi ``itineraries`` sau khi thuật toán tối ưu hoàn thành.

    Tự động sinh ``itinerary_id`` (UUID v4), ``create_at``, ``update_at``.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    itinerary = Itineraries(
        itinerary_id=uuid4(),
        session_id=session_id,
        user_id=user_id,
        name=name,
        status=status,
        total_budget=total_budget,
        currency=currency,
        total_travel_time=total_travel_time,
        total_distance=total_distance,
        create_at=now,
        update_at=now,
    )
    db.add(itinerary)
    db.commit()
    db.refresh(itinerary)
    return itinerary


# ---------------------------------------------------------------------------
# Q2 – Tạo các ngày trong lộ trình  (INSERT INTO itinerary_days)
# ---------------------------------------------------------------------------

def create_itinerary_days(
    db: Session,
    days_data: list[dict],
) -> list[ItineraryDays]:
    """
    Tạo nhiều bản ghi ``itinerary_days`` cùng lúc (bulk insert).

    Parameters
    ----------
    days_data : list[dict]
        Mỗi phần tử chứa: itinerary_id, day_order, travel_date,
        estimated_budget, currency, total_time.

    Returns
    -------
    list[ItineraryDays]
        Danh sách bản ghi vừa tạo.

    Example
    -------
    ::

        create_itinerary_days(db, [
            {
                "itinerary_id": uuid,
                "day_order": 1,
                "travel_date": date(2025, 6, 1),
                "estimated_budget": Decimal("500000"),
                "currency": CurrencyEnum.VND,
                "total_time": 480,
            },
        ])
    """
    rows: list[ItineraryDays] = []
    for d in days_data:
        row = ItineraryDays(
            itinerary_id=d["itinerary_id"],
            day_order=d["day_order"],
            travel_date=d["travel_date"],
            estimated_budget=d["estimated_budget"],
            currency=d.get("currency", CurrencyEnum.VND),
            total_time=d["total_time"],
        )
        db.add(row)
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


# ---------------------------------------------------------------------------
# Q3 – Tạo các điểm dừng trong từng ngày  (INSERT INTO itinerary_stops)
# ---------------------------------------------------------------------------

def create_itinerary_stops(
    db: Session,
    stops_data: list[dict],
) -> list[ItineraryStops]:
    """
    Tạo nhiều bản ghi ``itinerary_stops`` cùng lúc (bulk insert).

    Parameters
    ----------
    stops_data : list[dict]
        Mỗi phần tử chứa: day_id, location_id, stop_order, arrival_time,
        departure_time, checkin_radius (optional), reward (optional),
        status (optional).

    Returns
    -------
    list[ItineraryStops]
        Danh sách bản ghi vừa tạo.
    """
    rows: list[ItineraryStops] = []
    for s in stops_data:
        row = ItineraryStops(
            day_id=s["day_id"],
            location_id=s["location_id"],
            stop_order=s["stop_order"],
            arrival_time=s["arrival_time"],
            departure_time=s["departure_time"],
            checkin_radius=s.get("checkin_radius", 100),
            reward=s.get("reward", 0),
            status=s.get("status", StopStatus.PENDING),
        )
        db.add(row)
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


# ---------------------------------------------------------------------------
# Q4 – Tạo đường đi giữa các điểm dừng  (INSERT INTO itinerary_routes)
# ---------------------------------------------------------------------------

def create_itinerary_routes(
    db: Session,
    routes_data: list[dict],
) -> list[ItineraryRoutes]:
    """
    Tạo nhiều bản ghi ``itinerary_routes`` cùng lúc (bulk insert).

    Parameters
    ----------
    routes_data : list[dict]
        Mỗi phần tử chứa: from_stop_id, to_stop_id, travel_time,
        distance, polyline_data.

    Returns
    -------
    list[ItineraryRoutes]
        Danh sách bản ghi vừa tạo.
    """
    rows: list[ItineraryRoutes] = []
    for r in routes_data:
        row = ItineraryRoutes(
            from_stop_id=r["from_stop_id"],
            to_stop_id=r["to_stop_id"],
            travel_time=r["travel_time"],
            distance=r["distance"],
            polyline_data=r["polyline_data"],
        )
        db.add(row)
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


# ---------------------------------------------------------------------------
# Q5 – Lấy toàn bộ thông tin lộ trình
#       (SELECT itineraries JOIN itinerary_days JOIN itinerary_stops WHERE itinerary_id = ?)
# ---------------------------------------------------------------------------

def get_itinerary_full(db: Session, itinerary_id: UUID) -> list:
    """
    Lấy toàn bộ thông tin lộ trình gồm itinerary → days → stops,
    sắp xếp theo day_order ASC, stop_order ASC.

    Columns trả về:
        itinerary_id, total_budget, total_travel_time, total_distance, status,
        day_id, day_order, travel_date,
        stop_id, stop_order, arrival_time, departure_time.
    """
    statement = (
        select(
            Itineraries.itinerary_id,
            Itineraries.total_budget,
            Itineraries.total_travel_time,
            Itineraries.total_distance,
            Itineraries.status,
            ItineraryDays.day_id,
            ItineraryDays.day_order,
            ItineraryDays.travel_date,
            ItineraryStops.stop_id,
            ItineraryStops.stop_order,
            ItineraryStops.arrival_time,
            ItineraryStops.departure_time,
        )
        .join(ItineraryDays, Itineraries.itinerary_id == ItineraryDays.itinerary_id)
        .join(ItineraryStops, ItineraryDays.day_id == ItineraryStops.day_id)
        .where(Itineraries.itinerary_id == itinerary_id)
        .order_by(ItineraryDays.day_order.asc(), ItineraryStops.stop_order.asc())
    )
    return db.exec(statement).all()


# ---------------------------------------------------------------------------
# Q6 – Cập nhật trạng thái lộ trình  (UPDATE itineraries SET status, update_at)
# ---------------------------------------------------------------------------

def update_itinerary_status(
    db: Session,
    itinerary_id: UUID,
    new_status: ItineraryStatus,
) -> Optional[Itineraries]:
    """
    Cập nhật ``status`` và ``update_at`` cho lộ trình *itinerary_id*.

    Trả về bản ghi sau cập nhật, hoặc ``None`` nếu không tìm thấy.
    """
    statement = select(Itineraries).where(
        Itineraries.itinerary_id == itinerary_id
    )
    row = db.exec(statement).first()
    if row is None:
        return None

    row.status = new_status
    row.update_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Q7 – Lấy lịch sử lộ trình của user
#       (SELECT itineraries WHERE user_id = ? AND status IN ('COMPLETED', 'CANCELLED'))
# ---------------------------------------------------------------------------

def get_itinerary_history(db: Session, user_id: UUID) -> list:
    """
    Lấy lịch sử các lộ trình COMPLETED hoặc CANCELLED của *user_id*,
    sắp xếp theo ``create_at`` giảm dần (mới nhất trước).

    Columns trả về:
        itinerary_id, name, status, total_budget, total_distance, create_at.
    """
    statement = (
        select(
            Itineraries.itinerary_id,
            Itineraries.name,
            Itineraries.status,
            Itineraries.total_budget,
            Itineraries.total_distance,
            Itineraries.create_at,
        )
        .where(
            Itineraries.user_id == user_id,
            Itineraries.status.in_([
                ItineraryStatus.COMPLETED,
                ItineraryStatus.CANCELLED,
            ]),
        )
        .order_by(Itineraries.create_at.desc())
    )
    return db.exec(statement).all()


# ---------------------------------------------------------------------------
# Q8 – Lấy danh sách trạm kèm thông tin địa điểm  (UC7 Q1 – Tracking screen)
#       SELECT itineraries + itinerary_days + itinerary_stops + locations
# ---------------------------------------------------------------------------

def get_itinerary_stops_with_locations(db: Session, itinerary_id: UUID) -> list:
    """
    Lấy toàn bộ các trạm trong lộ trình kèm thông tin địa điểm tương ứng.
    Dùng cho màn hình bản đồ tracking để vẽ markers và route.

    Columns trả về:
        day_id, day_order, travel_date,
        stop_id, stop_order, arrival_time, departure_time, checkin_radius, status,
        location_id, location_name, latitude, longitude, open_time, close_time.

    Sắp xếp theo day_order ASC, stop_order ASC.
    """
    statement = (
        select(
            ItineraryDays.day_id,
            ItineraryDays.day_order,
            ItineraryDays.travel_date,
            ItineraryStops.stop_id,
            ItineraryStops.stop_order,
            ItineraryStops.arrival_time,
            ItineraryStops.departure_time,
            ItineraryStops.checkin_radius,
            ItineraryStops.status,
            Locations.location_id,
            Locations.location_name,
            Locations.latitude,
            Locations.longitude,
            Locations.open_time,
            Locations.close_time,
        )
        .select_from(Itineraries)
        .join(ItineraryDays, Itineraries.itinerary_id == ItineraryDays.itinerary_id)
        .join(ItineraryStops, ItineraryDays.day_id == ItineraryStops.day_id)
        .join(Locations, ItineraryStops.location_id == Locations.location_id)
        .where(Itineraries.itinerary_id == itinerary_id)
        .order_by(ItineraryDays.day_order.asc(), ItineraryStops.stop_order.asc())
    )
    return db.exec(statement).all()
