import pytest
from datetime import date, datetime, timedelta, time
from uuid import uuid4
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    Users, UserProfiles, UserRole, UserStatus, RegisterType,
    Cities, Locations, PlanningSessions, Itineraries, ItineraryDays, ItineraryStops, ItineraryStatus, StopStatus
)
from core.security import create_access_token

@pytest.fixture(name="planning_setup")
def planning_setup_fixture(db_session: Session):
    # 1. Tạo Thành phố mẫu
    city = Cities(
        city_id=40,
        city_name="Nha Trang",
        region="Miền Trung",
        latitude=Decimal("12.23879"),
        longitude=Decimal("109.19674")
    )
    db_session.add(city)
    db_session.commit()

    # 2. Tạo User mẫu
    user_uid = uuid4()
    user = Users(
        user_id=user_uid,
        full_name="Nguyễn Lộ Trình",
        email="planner@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    profile = UserProfiles(
        user_id=user_uid,
        full_name="Nguyễn Lộ Trình",
        date_of_birth=date(1996, 6, 6),
        gender="MALE",
        total_points=0,
        points_balance=100
    )
    db_session.add(user)
    db_session.add(profile)
    db_session.commit()

    # 3. Tạo hai Địa điểm mẫu để dựng lộ trình
    loc1_id = uuid4()
    loc1 = Locations(
        location_id=loc1_id,
        location_name="Tháp Bà Ponagar",
        address="2 Tháng 4, Nha Trang",
        latitude=Decimal("12.2653"),
        longitude=Decimal("109.1958"),
        city_id=40,
        open_time=time(6, 0, 0),
        close_time=time(18, 0, 0),
        min_price=Decimal("30000"),
        max_price=Decimal("30000"),
        is_active=True
    )
    
    loc2_id = uuid4()
    loc2 = Locations(
        location_id=loc2_id,
        location_name="Hòn Chồng Nha Trang",
        address="Phạm Văn Đồng, Nha Trang",
        latitude=Decimal("12.2725"),
        longitude=Decimal("109.2059"),
        city_id=40,
        open_time=time(7, 0, 0),
        close_time=time(19, 0, 0),
        min_price=Decimal("22000"),
        max_price=Decimal("22000"),
        is_active=True
    )
    db_session.add(loc1)
    db_session.add(loc2)
    db_session.commit()

    return {
        "city_id": 40,
        "user_id": user_uid,
        "location_ids": [loc1_id, loc2_id],
        "profile": profile
    }

def test_planning_session_creation(client: TestClient, db_session: Session, planning_setup):
    user_uid = planning_setup["user_id"]
    token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "city_id": planning_setup["city_id"],
        "start_day": str(date.today()),
        "end_day": str(date.today() + timedelta(days=2)),
        "budget": 1500000.00,
        "currency": "VND",
        "pax_adult": 2,
        "pax_children": 1,
        "tag_ids": [1, 2]
    }

    # Gọi API tạo phiên lập kế hoạch
    response = client.post("/api/planning/create", json=payload, headers=headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["session_id"] is not None
    assert res_data["budget"] == "1500000.00"
    assert res_data["pax_adult"] == 2

    # Xác minh lưu xuống database thành công
    session_id = res_data["session_id"]
    session_db = db_session.get(PlanningSessions, session_id)
    assert session_db is not None
    assert session_db.user_id == user_uid

def test_create_and_manage_itinerary_flow(client: TestClient, db_session: Session, planning_setup):
    user_uid = planning_setup["user_id"]
    token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Dựng sẵn 1 Planning Session trong DB
    session_id = uuid4()
    plan = PlanningSessions(
        session_id=session_id,
        user_id=user_uid,
        city_id=planning_setup["city_id"],
        budget=Decimal("500000"),
        start_day=date.today(),
        end_day=date.today() + timedelta(days=1),
        status="PENDING"
    )
    db_session.add(plan)
    db_session.commit()

    # 1. Gọi API tạo Lộ trình mới từ danh sách Địa điểm
    itinerary_payload = {
        "session_id": str(session_id),
        "name": "Chuyến Đi Nha Trang 2 Ngày",
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=1)),
        "location_ids": [str(lid) for lid in planning_setup["location_ids"]]
    }
    response = client.post("/api/trips/create", json=itinerary_payload, headers=headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["itinerary_id"] is not None
    assert res_data["name"] == "Chuyến Đi Nha Trang 2 Ngày"
    assert res_data["status"] == "DRAFT"

    itinerary_id = res_data["itinerary_id"]

    # 2. Xem chi tiết lộ trình vừa tạo
    detail_response = client.get(f"/api/trips/{itinerary_id}")
    assert detail_response.status_code == 200
    detail_data = detail_response.json()
    assert len(detail_data["stops"]) == 2
    assert detail_data["stops"][0]["location_name"] == "Tháp Bà Ponagar"
    assert [stop["location_id"] for stop in detail_data["stops"]] == [
        str(location_id) for location_id in planning_setup["location_ids"]
    ]
    assert "routes" not in detail_data

    # 3. Hủy chuyến đi
    cancel_response = client.put(f"/api/trips/{itinerary_id}/cancel", headers=headers)
    assert cancel_response.status_code == 200
    assert "Chuyến đi đã được hủy" in cancel_response.json()["detail"]

    # Xác minh trạng thái đổi thành CANCELLED trong DB
    itinerary_db = db_session.get(Itineraries, itinerary_id)
    assert itinerary_db.status == ItineraryStatus.CANCELLED

    # 4. Xem lịch sử chuyến đi
    history_response = client.get("/api/trips/history", headers=headers)
    assert history_response.status_code == 200
    history_list = history_response.json()
    assert len(history_list) >= 1
    assert history_list[0]["itinerary_id"] == str(itinerary_id)
    assert history_list[0]["status"] == "CANCELLED"
