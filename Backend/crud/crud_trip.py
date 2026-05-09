# ============================================================
# crud/crud_trip.py  –  Itinerary / Trip CRUD operations
# ============================================================

from typing import Optional, Sequence
from uuid import UUID

from sqlmodel import Session, select

from models import (
    Itineraries,
    ItineraryDays,
    ItineraryStatus,
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
