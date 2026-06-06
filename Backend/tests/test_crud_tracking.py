import pytest
from uuid import uuid4
from datetime import time, date, datetime
from decimal import Decimal
from sqlmodel import Session

from models import (
    Users, Cities, Locations, PlanningSessions, Itineraries, ItineraryDays, ItineraryStops,
    CheckinProgress, StopStatus, RegisterType, UserRole, UserStatus, GpsTrackingLogs, DeviationLogs
)
from crud.crud_tracking import (
    create_checkin_progress, update_checkin_status, get_checkin_by_stop,
    get_stop_with_ownership, verify_stop_ownership, complete_itinerary_stop,
    create_gps_log, create_deviation_log, verify_stop_in_itinerary, get_stop_with_radius
)

@pytest.fixture(name="tracking_setup")
def tracking_setup_fixture(db_session: Session):
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Người Thám Hiểm",
        email="explorer.tracking@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)

    # City
    city = Cities(city_id=1, city_name="Hồ Chí Minh", region="Miền Nam", latitude=Decimal("10.776"), longitude=Decimal("106.700"))
    db_session.add(city)
    db_session.commit()

    # Location
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Nhà Thờ Đức Bà",
        address="Q1, TP HCM",
        latitude=Decimal("10.7797"),
        longitude=Decimal("106.6990"),
        city_id=1,
        open_time=time(8, 0),
        close_time=time(18, 0),
        min_price=Decimal("0"),
        max_price=Decimal("0")
    )
    db_session.add(loc)
    db_session.commit()

    # Itinerary structures
    planning = PlanningSessions(
        session_id=uuid4(),
        user_id=user_id,
        city_id=1,
        pax_adult=1,
        budget=Decimal("1000000"),
        start_day=date.today(),
        end_day=date.today()
    )
    db_session.add(planning)
    db_session.commit()

    itinerary = Itineraries(
        itinerary_id=uuid4(),
        session_id=planning.session_id,
        user_id=user_id,
        name="Tour Sài Gòn",
        total_budget=Decimal("500000"),
        total_travel_time=120
    )
    db_session.add(itinerary)
    db_session.commit()

    day = ItineraryDays(
        itinerary_id=itinerary.itinerary_id,
        day_order=1,
        travel_date=date.today(),
        estimated_budget=Decimal("500000"),
        total_time=120
    )
    db_session.add(day)
    db_session.commit()

    stop = ItineraryStops(
        day_id=day.day_id,
        location_id=loc_id,
        stop_order=1,
        arrival_time=time(10, 0),
        departure_time=time(11, 0),
        status=StopStatus.PENDING
    )
    db_session.add(stop)
    db_session.commit()

    return {
        "user_id": user_id,
        "stop_id": stop.stop_id,
        "location_id": loc_id,
        "itinerary_id": itinerary.itinerary_id
    }

def test_checkin_progress_flow(db_session: Session, tracking_setup):
    user_id = tracking_setup["user_id"]
    stop_id = tracking_setup["stop_id"]

    # 1. Create check-in progress (not completed yet)
    progress = create_checkin_progress(
        db=db_session,
        user_id=user_id,
        stop_id=stop_id,
        latitude=Decimal("10.7795"),
        longitude=Decimal("106.6992")
    )
    db_session.commit()
    assert progress.progress_id is not None
    assert progress.is_completed is False

    # 2. Query check-in by stop
    fetched = get_checkin_by_stop(db_session, user_id, stop_id)
    assert fetched is not None
    assert fetched.progress_id == progress.progress_id

    # 3. Update check-in status (mark completed)
    progress_up, stop_up, is_new = update_checkin_status(
        db=db_session,
        progress_id=progress.progress_id,
        stop_id=stop_id,
        latitude=Decimal("10.7797"),
        longitude=Decimal("106.6990")
    )
    db_session.commit()

    assert progress_up.is_completed is True
    assert stop_up.status == StopStatus.COMPLETED
    assert is_new is True

    # 4. Get stop with ownership details
    stop_owner = get_stop_with_ownership(db_session, user_id, stop_id)
    assert stop_owner is not None
    assert stop_owner.location_name == "Nhà Thờ Đức Bà"

    # 5. Verify stop ownership (anti IDOR)
    assert verify_stop_ownership(db_session, user_id, stop_id) is True
    assert verify_stop_ownership(db_session, uuid4(), stop_id) is False

def test_complete_itinerary_stop(db_session: Session, tracking_setup):
    user_id = tracking_setup["user_id"]
    stop_id = tracking_setup["stop_id"]

    # Complete stop directly
    success = complete_itinerary_stop(db_session, user_id, stop_id)
    assert success is True

    # Check database status
    stop = db_session.get(ItineraryStops, stop_id)
    assert stop.status == StopStatus.COMPLETED

    # Call again when already completed -> should return False
    success_retry = complete_itinerary_stop(db_session, user_id, stop_id)
    assert success_retry is False

def test_create_gps_log(db_session: Session, tracking_setup):
    user_id = tracking_setup["user_id"]
    stop_id = tracking_setup["stop_id"]
    
    # 1. Create check-in progress
    progress = create_checkin_progress(
        db=db_session,
        user_id=user_id,
        stop_id=stop_id,
        latitude=Decimal("10.7795"),
        longitude=Decimal("106.6992")
    )
    db_session.commit()
    
    # 2. Create GPS log
    log = create_gps_log(
        db=db_session,
        progress_id=progress.progress_id,
        latitude=Decimal("10.7796"),
        longitude=Decimal("106.6991"),
        tracking_time=datetime.now()
    )
    db_session.commit()
    
    assert log.log_id is not None
    assert log.progress_id == progress.progress_id
    assert log.latitude == Decimal("10.7796")
    assert log.longitude == Decimal("106.6991")

def test_create_deviation_log(db_session: Session, tracking_setup):
    itinerary_id = tracking_setup["itinerary_id"]
    
    log = create_deviation_log(
        db=db_session,
        itinerary_id=itinerary_id,
        latitude=Decimal("10.7800"),
        longitude=Decimal("106.7000"),
        alert_time=datetime.now()
    )
    db_session.commit()
    
    assert log.alert_id is not None
    assert log.itinerary_id == itinerary_id
    assert log.latitude == Decimal("10.7800")
    assert log.longitude == Decimal("106.7000")

def test_verify_stop_in_itinerary(db_session: Session, tracking_setup):
    itinerary_id = tracking_setup["itinerary_id"]
    stop_id = tracking_setup["stop_id"]
    
    # Verify valid stop
    assert verify_stop_in_itinerary(db_session, itinerary_id, stop_id) is True
    
    # Verify non-existent mapping
    assert verify_stop_in_itinerary(db_session, itinerary_id, 99999) is False
    assert verify_stop_in_itinerary(db_session, uuid4(), stop_id) is False

def test_get_stop_with_radius(db_session: Session, tracking_setup):
    stop_id = tracking_setup["stop_id"]
    location_id = tracking_setup["location_id"]
    
    # Fetch stop
    res = get_stop_with_radius(db_session, stop_id)
    assert res is not None
    assert res.stop_id == stop_id
    assert res.location_id == location_id
    assert res.location_name == "Nhà Thờ Đức Bà"
    assert res.latitude == Decimal("10.7797")
    assert res.longitude == Decimal("106.6990")
