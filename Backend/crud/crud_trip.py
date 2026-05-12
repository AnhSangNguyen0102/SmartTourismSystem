# ============================================================
# crud/crud_trip.py  –  Itinerary / Trip CRUD operations
# ============================================================

from typing import Optional, Sequence, List
from uuid import UUID
from datetime import datetime
from sqlmodel import Session, select

from models import (
    Itineraries,
    ItineraryDays,
    ItineraryStops,
    ItineraryRoutes,
    ItineraryStatus,
    StopStatus,
    CheckinProgress,
    GpsTrackingLogs,
    DeviationLogs,
    CurrencyEnum,
)
from schemas import ItineraryCreate


# ---------------------------------------------------------------------------
# Create  (transactional)
# ---------------------------------------------------------------------------

def create_itinerary_with_days(
    db: Session,
    user_id: UUID,
    session_id: UUID,
    itinerary_in: ItineraryCreate,
    days_data: list[dict],
) -> Itineraries:
    """
    Create an ``Itineraries`` row **and** its child ``ItineraryDays``
    inside a single transaction.

    If inserting any ``ItineraryDays`` fails, the entire operation
    (including the parent ``Itineraries`` row) is rolled back to
    guarantee data integrity.

    Parameters
    ----------
    db : Session
        Active SQLModel / SQLAlchemy session.
    user_id : UUID
        Owner of the itinerary.
    session_id : UUID
        Related planning session.
    itinerary_in : ItineraryCreate
        Basic itinerary payload from the client.
    days_data : list[dict]
        Each dict should contain at minimum::

            {
                "day_order": int,
                "travel_date": date,
                "estimated_budget": Decimal,
                "total_time": int,          # minutes
                "currency": "VND" | "USD",  # optional, defaults to VND
            }

    Returns
    -------
    Itineraries
        The newly created itinerary (refreshed from DB).

    Raises
    ------
    Exception
        Re-raises any error after rolling back the transaction.
    """
    try:
        # --- 1. Insert parent: Itineraries --------------------------------
        itinerary = Itineraries(
            session_id=session_id,
            user_id=user_id,
            status=ItineraryStatus.DRAFT,
            total_budget=itinerary_in.budget,
            currency=CurrencyEnum.VND,
            total_travel_time=0,
            total_distance=0,
        )
        db.add(itinerary)
        # Flush to obtain itinerary_id without committing
        db.flush()

        # --- 2. Insert children: ItineraryDays ----------------------------
        for day in days_data:
            itinerary_day = ItineraryDays(
                itinerary_id=itinerary.itinerary_id,
                day_order=day["day_order"],
                travel_date=day["travel_date"],
                estimated_budget=day["estimated_budget"],
                currency=day.get("currency", CurrencyEnum.VND),
                total_time=day.get("total_time", 0),
            )
            db.add(itinerary_day)

        # --- 3. Commit the whole transaction ------------------------------
        db.commit()
        db.refresh(itinerary)
        return itinerary

    except Exception:
        db.rollback()
        raise

# --- Bổ sung các hàm Create lẻ để linh hoạt hơn ---

def create_itinerary(db: Session, session_id: UUID, user_id: UUID, name: str, total_travel_time: int, commit: bool = True) -> Itineraries:
    db_itinerary = Itineraries(
        session_id=session_id,
        user_id=user_id,
        name=name,
        total_travel_time=total_travel_time,
        total_distance=0,
        total_budget=0,
        status=ItineraryStatus.DRAFT
    )
    db.add(db_itinerary)
    if commit:
        db.commit()
        db.refresh(db_itinerary)
    else:
        db.flush()
    return db_itinerary

def create_itinerary_day(db: Session, itinerary_id: UUID, day_order: int, travel_date: str, total_time: int, estimated_budget: float = 0, commit: bool = True) -> ItineraryDays:
    db_day = ItineraryDays(
        itinerary_id=itinerary_id,
        day_order=day_order,
        travel_date=datetime.strptime(travel_date, "%Y-%m-%d").date(),
        estimated_budget=estimated_budget,
        total_time=total_time
    )
    db.add(db_day)
    if commit:
        db.commit()
        db.refresh(db_day)
    else:
        db.flush()
    return db_day

def create_itinerary_stop(db: Session, day_id: int, location_id: UUID, stop_order: int, arrival_time=None, departure_time=None, commit: bool = True) -> ItineraryStops:
    db_stop = ItineraryStops(
        day_id=day_id,
        location_id=location_id,
        stop_order=stop_order,
        arrival_time=arrival_time or "08:00:00",
        departure_time=departure_time or "09:30:00",
        status=StopStatus.PENDING
    )
    db.add(db_stop)
    if commit:
        db.commit()
        db.refresh(db_stop)
    else:
        db.flush()
    return db_stop

def create_itinerary_route(db: Session, from_stop_id: int, to_stop_id: int, travel_time: int, distance: float, polyline: str, commit: bool = True) -> ItineraryRoutes:
    db_route = ItineraryRoutes(
        from_stop_id=from_stop_id,
        to_stop_id=to_stop_id,
        travel_time=travel_time,
        distance=distance,
        polyline_data=polyline
    )
    db.add(db_route)
    if commit:
        db.commit()
        db.refresh(db_route)
    else:
        db.flush()
    return db_route

# --- Tracking & Check-in Logic ---

def get_itinerary_stop(db: Session, stop_id: int) -> Optional[ItineraryStops]:
    return db.get(ItineraryStops, stop_id)

def mark_stop_completed(db: Session, user_id: UUID, stop_id: int, lat: float, lng: float) -> CheckinProgress:
    # 1. Update status của Stop
    db_stop = db.get(ItineraryStops, stop_id)
    if db_stop:
        db_stop.status = StopStatus.COMPLETED
        db.add(db_stop)
    
    # 2. Tạo bản ghi CheckinProgress
    progress = CheckinProgress(
        user_id=user_id,
        stop_id=stop_id,
        is_completed=True,
        latitude=lat,
        longitude=lng,
        checkin_time=datetime.utcnow()
    )
    db.add(progress)
    db.commit()
    db.refresh(progress)
    return progress

# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_user_itineraries(
    db: Session,
    user_id: UUID,
) -> Sequence[Itineraries]:
    """
    Return all itineraries belonging to *user_id*, newest first.
    """
    statement = (
        select(Itineraries)
        .where(Itineraries.user_id == user_id)
        .order_by(Itineraries.create_at.desc())  # type: ignore[union-attr]
    )
    return db.exec(statement).all()


def get_itinerary_by_id(
    db: Session,
    itinerary_id: UUID,
) -> Optional[Itineraries]:
    """
    Fetch a single itinerary by its primary key.
    """
    return db.get(Itineraries, itinerary_id)
