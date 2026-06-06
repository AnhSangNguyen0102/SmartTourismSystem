import pytest
from uuid import uuid4
from datetime import date, time, datetime, timedelta
from decimal import Decimal
from sqlmodel import Session, select

from models import (
    Users, Cities, Locations, PlanningSessions, Itineraries, ItineraryDays, ItineraryStops,
    ItineraryStatus, StopStatus, CurrencyEnum, UserProfiles, RegisterType, UserRole, UserStatus, ItineraryRoutes
)
from crud.crud_itinerary import (
    create_itinerary, create_itinerary_days, create_itinerary_stops, get_itinerary_full,
    update_itinerary_status, get_itinerary_history, get_itinerary_stops_with_locations,
    auto_cancel_expired_trips, create_itinerary_routes
)

@pytest.fixture(name="itinerary_setup")
def itinerary_setup_fixture(db_session: Session):
    # Create user
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Người Đi Du Lịch",
        email="traveler@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()

    profile = UserProfiles(
        user_id=user_id,
        full_name="Người Đi Du Lịch",
        date_of_birth=date(1990, 1, 1),
        gender="MALE",
        total_points=100,
        points_balance=50
    )
    db_session.add(profile)

    # Create City
    city = Cities(
        city_id=10,
        city_name="Hà Nội",
        region="Miền Bắc",
        latitude=Decimal("21.027764"),
        longitude=Decimal("105.834160")
    )
    db_session.add(city)
    db_session.commit()

    # Create location
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Hồ Gươm",
        address="Hoàn Kiếm, Hà Nội",
        latitude=Decimal("21.0285"),
        longitude=Decimal("105.8521"),
        city_id=10,
        open_time=time(0, 0),
        close_time=time(23, 59),
        min_price=Decimal("0"),
        max_price=Decimal("0")
    )
    db_session.add(loc)
    db_session.commit()

    # Create planning session
    session_id = uuid4()
    planning = PlanningSessions(
        session_id=session_id,
        user_id=user_id,
        city_id=10,
        pax_adult=2,
        budget=Decimal("5000000"),
        start_day=date.today() - timedelta(days=5),
        end_day=date.today() - timedelta(days=2) # ended 2 days ago
    )
    db_session.add(planning)
    db_session.commit()

    return {
        "user_id": user_id,
        "city_id": 10,
        "location_id": loc_id,
        "session_id": session_id,
        "profile": profile,
        "planning": planning
    }

def test_itinerary_flow(db_session: Session, itinerary_setup):
    session_id = itinerary_setup["session_id"]
    user_id = itinerary_setup["user_id"]
    loc_id = itinerary_setup["location_id"]

    # 1. Create itinerary
    itinerary = create_itinerary(
        db=db_session,
        session_id=session_id,
        user_id=user_id,
        name="Tour Hà Nội Mùa Thu",
        total_budget=Decimal("2000000"),
        total_travel_time=480,
        total_distance=Decimal("0")
    )
    assert itinerary.itinerary_id is not None
    assert itinerary.name == "Tour Hà Nội Mùa Thu"
    assert itinerary.status == ItineraryStatus.DRAFT

    # 2. Bulk insert itinerary days
    days_data = [
        {
            "itinerary_id": itinerary.itinerary_id,
            "day_order": 1,
            "travel_date": date.today(),
            "estimated_budget": Decimal("1000000"),
            "total_time": 240
        }
    ]
    days = create_itinerary_days(db_session, days_data)
    assert len(days) == 1
    assert days[0].day_id is not None
    assert days[0].day_order == 1

    # 3. Bulk insert itinerary stops
    stops_data = [
        {
            "day_id": days[0].day_id,
            "location_id": loc_id,
            "stop_order": 1,
            "arrival_time": time(9, 0),
            "departure_time": time(11, 0),
            "checkin_radius": 150,
            "reward": 50,
            "status": StopStatus.PENDING
        }
    ]
    stops = create_itinerary_stops(db_session, stops_data)
    assert len(stops) == 1
    assert stops[0].stop_id is not None
    assert stops[0].stop_order == 1

    # 4. Get full itinerary information
    full_info = get_itinerary_full(db_session, itinerary.itinerary_id)
    assert len(full_info) == 1
    # Check that it returns tuple containing itinerary details
    assert full_info[0].itinerary_id == itinerary.itinerary_id
    assert full_info[0].day_id == days[0].day_id
    assert full_info[0].stop_id == stops[0].stop_id

    # 5. Get stops with locations
    stops_locs = get_itinerary_stops_with_locations(db_session, itinerary.itinerary_id)
    assert len(stops_locs) == 1
    assert stops_locs[0].location_name == "Hồ Gươm"

    # 6. Update status
    updated = update_itinerary_status(db_session, itinerary.itinerary_id, ItineraryStatus.CONFIRMED)
    assert updated is not None
    assert updated.status == ItineraryStatus.CONFIRMED

    # 7. Get history
    history = get_itinerary_history(db_session, user_id)
    assert len(history) == 1
    assert history[0].itinerary_id == itinerary.itinerary_id

def test_auto_cancel_expired_trips(db_session: Session, itinerary_setup):
    session_id = itinerary_setup["session_id"]
    user_id = itinerary_setup["user_id"]
    profile = itinerary_setup["profile"]

    # Create itinerary that is not completed or cancelled, linked to expired planning session
    itinerary = create_itinerary(
        db=db_session,
        session_id=session_id,
        user_id=user_id,
        name="Expired Tour",
        status=ItineraryStatus.DRAFT,
        total_budget=Decimal("1500000"),
        total_travel_time=360,
        total_distance=Decimal("0")
    )

    # Run auto cancellation
    cancelled = auto_cancel_expired_trips(db_session, user_id=user_id)
    assert len(cancelled) == 1
    assert cancelled[0].itinerary_id == itinerary.itinerary_id
    assert cancelled[0].status == ItineraryStatus.CANCELLED

    # Check points refunding logic
    db_session.refresh(profile)
    assert profile.points_balance == 150 # 50 (original) + 100 (total_points refunded)
    assert profile.total_points == 0

def test_create_itinerary_routes(db_session: Session, itinerary_setup):
    session_id = itinerary_setup["session_id"]
    user_id = itinerary_setup["user_id"]
    loc_id = itinerary_setup["location_id"]

    # 1. Create itinerary
    itinerary = create_itinerary(
        db=db_session,
        session_id=session_id,
        user_id=user_id,
        name="Tour Test Routes",
        total_budget=Decimal("1000000"),
        total_travel_time=120,
        total_distance=Decimal("0")
    )
    db_session.commit()

    # 2. Create day
    days = create_itinerary_days(db_session, [
        {
            "itinerary_id": itinerary.itinerary_id,
            "day_order": 1,
            "travel_date": date.today(),
            "estimated_budget": Decimal("500000"),
            "total_time": 120
        }
    ])
    day_id = days[0].day_id

    # 3. Create 2 stops
    stops = create_itinerary_stops(db_session, [
        {
            "day_id": day_id,
            "location_id": loc_id,
            "stop_order": 1,
            "arrival_time": time(9, 0),
            "departure_time": time(10, 0),
            "checkin_radius": 150,
            "reward": 50,
            "status": StopStatus.PENDING
        },
        {
            "day_id": day_id,
            "location_id": loc_id,
            "stop_order": 2,
            "arrival_time": time(11, 0),
            "departure_time": time(12, 0),
            "checkin_radius": 150,
            "reward": 50,
            "status": StopStatus.PENDING
        }
    ])
    from_stop_id = stops[0].stop_id
    to_stop_id = stops[1].stop_id

    # 4. Create routes
    routes_data = [
        {
            "from_stop_id": from_stop_id,
            "to_stop_id": to_stop_id,
            "travel_time": 15,
            "distance": Decimal("2.5"),
            "polyline_data": "abcxyz"
        }
    ]
    routes = create_itinerary_routes(db_session, routes_data)
    assert len(routes) == 1
    assert routes[0].from_stop_id == from_stop_id
    assert routes[0].to_stop_id == to_stop_id
    assert routes[0].travel_time == 15
    assert routes[0].distance == Decimal("2.5")
    assert routes[0].polyline_data == "abcxyz"
