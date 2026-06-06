import pytest
from uuid import uuid4
from datetime import date, time
from decimal import Decimal
from sqlmodel import Session, select

from models import Users, Cities, Locations, PlanningSessions, Itineraries, ItineraryDays, ItineraryStops, StopStatus, ItineraryStatus, RegisterType, UserRole, UserStatus
from schemas import ItineraryCreate
from crud.crud_trip import (
    create_itinerary_with_days, create_itinerary, create_itinerary_day, create_itinerary_stop,
    get_itinerary_stop, mark_stop_completed, get_user_itineraries, get_itinerary_by_id
)

@pytest.fixture(name="trip_setup")
def trip_setup_fixture(db_session: Session):
    # User
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Người Đi Tour",
        email="tourist@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)

    # City
    city = Cities(city_id=1, city_name="Nha Trang", region="Miền Trung", latitude=Decimal("12.238"), longitude=Decimal("109.196"))
    db_session.add(city)
    db_session.commit()

    # Location
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Tháp Bà Ponagar",
        address="Nha Trang",
        latitude=Decimal("12.265"),
        longitude=Decimal("109.195"),
        city_id=1,
        open_time=time(6, 0),
        close_time=time(18, 0),
        min_price=Decimal("22000"),
        max_price=Decimal("22000")
    )
    db_session.add(loc)
    db_session.commit()

    # Planning Session
    session_id = uuid4()
    planning = PlanningSessions(
        session_id=session_id,
        user_id=user_id,
        city_id=1,
        pax_adult=2,
        budget=Decimal("3000000"),
        start_day=date.today(),
        end_day=date.today()
    )
    db_session.add(planning)
    db_session.commit()

    return {
        "user_id": user_id,
        "session_id": session_id,
        "location_id": loc_id
    }

def test_create_itinerary_with_days_transactional(db_session: Session, trip_setup):
    user_id = trip_setup["user_id"]
    session_id = trip_setup["session_id"]

    itinerary_in = ItineraryCreate(
        city_id=1,
        start_day=date.today(),
        end_day=date.today(),
        budget=Decimal("1200000")
    )
    days_data = [
        {
            "day_order": 1,
            "travel_date": date.today(),
            "estimated_budget": Decimal("600000"),
            "total_time": 180
        },
        {
            "day_order": 2,
            "travel_date": date.today(),
            "estimated_budget": Decimal("600000"),
            "total_time": 180
        }
    ]

    # Successful creation
    itinerary = create_itinerary_with_days(db_session, user_id, session_id, itinerary_in, days_data)
    assert itinerary.itinerary_id is not None
    assert itinerary.status == ItineraryStatus.DRAFT

    days = db_session.exec(select(ItineraryDays).where(ItineraryDays.itinerary_id == itinerary.itinerary_id)).all()
    assert len(days) == 2

    # Check roll back on failure (missing required day_order key)
    bad_days = [{"travel_date": date.today(), "estimated_budget": Decimal("500000")}]
    with pytest.raises(Exception):
        create_itinerary_with_days(db_session, user_id, session_id, itinerary_in, bad_days)

def test_flexible_trip_crud_ops(db_session: Session, trip_setup):
    user_id = trip_setup["user_id"]
    session_id = trip_setup["session_id"]
    loc_id = trip_setup["location_id"]

    # 1. Create Itinerary
    itinerary = create_itinerary(db_session, session_id, user_id, "Nha Trang Vui Vẻ", 300)
    assert itinerary.itinerary_id is not None
    assert itinerary.name == "Nha Trang Vui Vẻ"

    # 2. Create Itinerary Day
    day = create_itinerary_day(db_session, itinerary.itinerary_id, 1, str(date.today()), 150, 500000)
    assert day.day_id is not None
    assert day.day_order == 1

    # 3. Create Itinerary Stop
    stop = create_itinerary_stop(db_session, day.day_id, loc_id, 1, "09:00:00", "10:30:00", 25000)
    assert stop.stop_id is not None
    assert stop.stop_order == 1

    # 4. Get Itinerary Stop
    fetched_stop = get_itinerary_stop(db_session, stop.stop_id)
    assert fetched_stop is not None
    assert fetched_stop.stop_id == stop.stop_id

    # 5. Mark Stop Completed
    progress = mark_stop_completed(db_session, user_id, stop.stop_id, 12.265, 109.195)
    assert progress.progress_id is not None
    assert progress.is_completed is True
    
    db_session.refresh(stop)
    assert stop.status == StopStatus.COMPLETED

    # 6. Read User Itineraries & By ID
    user_trips = get_user_itineraries(db_session, user_id)
    assert len(user_trips) >= 1
    assert user_trips[0].itinerary_id == itinerary.itinerary_id

    by_id = get_itinerary_by_id(db_session, itinerary.itinerary_id)
    assert by_id is not None
    assert by_id.name == "Nha Trang Vui Vẻ"
