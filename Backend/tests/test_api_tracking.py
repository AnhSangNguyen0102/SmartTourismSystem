import pytest
from datetime import date, datetime, timedelta, time
from uuid import uuid4
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    Users, UserProfiles, UserRole, UserStatus, RegisterType,
    Cities, Locations, PlanningSessions, Itineraries, ItineraryDays, ItineraryStops,
    StopStatus, ItineraryStatus, CheckinProgress
)
from core.security import create_access_token

@pytest.fixture(name="tracking_setup")
def tracking_setup_fixture(db_session: Session):
    # 1. Tạo Thành phố mẫu
    city = Cities(
        city_id=50,
        city_name="Đà Lạt",
        region="Tây Nguyên",
        latitude=Decimal("11.9404"),
        longitude=Decimal("108.4583")
    )
    db_session.add(city)
    db_session.commit()

    # 2. Tạo User mẫu
    user_uid = uuid4()
    user = Users(
        user_id=user_uid,
        full_name="Nguyễn Định Vị",
        email="gps@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    profile = UserProfiles(
        user_id=user_uid,
        full_name="Nguyễn Định Vị",
        date_of_birth=date(1997, 7, 7),
        gender="FEMALE",
        total_points=0,
        points_balance=100
    )
    db_session.add(user)
    db_session.add(profile)
    db_session.commit()

    # 3. Tạo Địa điểm mẫu
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Hồ Xuân Hương",
        address="Trung tâm Đà Lạt",
        latitude=Decimal("11.940000"),
        longitude=Decimal("108.445000"),
        city_id=50,
        open_time=time(0, 0, 0),
        close_time=time(23, 59, 59),
        min_price=Decimal("0"),
        max_price=Decimal("0"),
        is_active=True
    )
    db_session.add(loc)
    db_session.commit()

    # 4. Tạo Planning Session
    session_id = uuid4()
    plan = PlanningSessions(
        session_id=session_id,
        user_id=user_uid,
        city_id=50,
        budget=Decimal("100000"),
        start_day=date.today(),
        end_day=date.today(),
        status="CONFIRMED"
    )
    db_session.add(plan)
    db_session.commit()

    # 5. Tạo Itinerary, Day, và Stop
    itinerary_id = uuid4()
    itinerary = Itineraries(
        itinerary_id=itinerary_id,
        session_id=session_id,
        user_id=user_uid,
        name="Tour Đà Lạt",
        status=ItineraryStatus.CONFIRMED,
        total_budget=Decimal("0"),
        total_travel_time=0,
        total_distance=Decimal("0.0")
    )
    db_session.add(itinerary)
    db_session.commit()

    day = ItineraryDays(
        itinerary_id=itinerary_id,
        day_order=1,
        travel_date=date.today(),
        estimated_budget=Decimal("0"),
        total_time=0
    )
    db_session.add(day)
    db_session.commit()

    stop = ItineraryStops(
        day_id=day.day_id,
        location_id=loc_id,
        stop_order=1,
        arrival_time=time(9, 0, 0),
        departure_time=time(10, 0, 0),
        checkin_radius=100,  # 100 mét
        reward=0,
        status=StopStatus.PENDING
    )
    db_session.add(stop)
    db_session.commit()

    return {
        "user_id": user_uid,
        "itinerary_id": itinerary_id,
        "stop_id": stop.stop_id,
        "location": loc,
        "profile": profile
    }

def test_checkin_stop_success(client: TestClient, db_session: Session, tracking_setup):
    user_uid = tracking_setup["user_id"]
    stop_id = tracking_setup["stop_id"]
    loc = tracking_setup["location"]
    profile = tracking_setup["profile"]

    # Đăng nhập
    token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Check-in đúng tọa độ (distance = 0) -> Thành công
    checkin_payload = {
        "latitude": float(loc.latitude),
        "longitude": float(loc.longitude)
    }
    response = client.post(f"/api/trips/{stop_id}/checkin", json=checkin_payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert "Check-in thành công" in response.json()["message"]

    # Xác minh DB đã lưu checkin_progress ở dạng is_completed = True
    progress = db_session.query(CheckinProgress).filter(CheckinProgress.stop_id == stop_id).first()
    assert progress is not None
    assert progress.is_completed is True

    # Xác minh trạm dừng chuyển sang COMPLETED
    stop_db = db_session.get(ItineraryStops, stop_id)
    assert stop_db.status == StopStatus.COMPLETED

    # Xác minh được cộng điểm thưởng (mặc định trạm đầu tiên là 10 điểm)
    assert stop_db.reward == 10
    db_session.refresh(profile)
    # Since there was only 1 stop, the itinerary auto-completed, transferring total_points to points_balance
    assert profile.total_points == 0
    assert profile.points_balance == 230  # 100 base + 10 checkin + 120 completion bonus (1 stop * 20 + 100 perfect trip)

def test_checkin_stop_too_far(client: TestClient, db_session: Session, tracking_setup):
    user_uid = tracking_setup["user_id"]
    stop_id = tracking_setup["stop_id"]
    loc = tracking_setup["location"]

    token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Check-in lệch tọa độ đi rất xa (Vĩ độ tăng thêm 1 độ tương ứng khoảng 111 km)
    checkin_payload = {
        "latitude": float(loc.latitude) + 1.0,
        "longitude": float(loc.longitude)
    }
    response = client.post(f"/api/trips/{stop_id}/checkin", json=checkin_payload, headers=headers)
    
    assert response.status_code == 400
    assert "Cần ở trong phạm vi 100m để check-in" in response.json()["detail"]
