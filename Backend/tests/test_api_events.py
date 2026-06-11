import pytest
from datetime import datetime, timedelta
from uuid import uuid4
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    Users, UserProfiles, UserRole, UserStatus, RegisterType,
    Cities, Locations, EnterpriseProfiles, EnterpriseStatus,
    EnterpriseEvents, EnterpriseEventQR, EnterpriseEventSteps,
    HiddenEventParticipants, BusinessLocation, QuestTypeEnum, RarityEnum
)
from core.security import create_access_token

@pytest.fixture(name="event_setup")
def event_setup_fixture(db_session: Session):
    # 1. Tạo Thành phố mẫu
    city = Cities(
        city_id=60,
        city_name="Đà Nẵng",
        region="Miền Trung",
        latitude=Decimal("16.0544"),
        longitude=Decimal("108.2022")
    )
    db_session.add(city)
    db_session.commit()

    # 2. Tạo Doanh nghiệp mẫu ACTIVE
    ent_uid = uuid4()
    ent_user = Users(
        user_id=ent_uid,
        full_name="Chủ Event",
        email="ent.event@corp.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.ENTERPRISE,
        status=UserStatus.ACTIVE
    )
    ent_profile = EnterpriseProfiles(
        user_id=ent_uid,
        business_name="Doanh Nghiệp Tổ Chức Sự Kiện",
        contact_person="Nguyễn Sự Kiện",
        contact_email="sukiendoanhnghiep@corp.com",
        contact_phone="0911556677",
        status=EnterpriseStatus.ACTIVE
    )
    db_session.add(ent_user)
    db_session.add(ent_profile)
    db_session.commit()

    # 3. Tạo Địa điểm mẫu và liên kết với Doanh nghiệp
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Cầu Rồng Đà Nẵng",
        address="An Hải Tây, Sơn Trà, Đà Nẵng",
        latitude=Decimal("16.0611"),
        longitude=Decimal("108.2273"),
        city_id=60,
        open_time=datetime.strptime("00:00:00", "%H:%M:%S").time(),
        close_time=datetime.strptime("23:59:59", "%H:%M:%S").time(),
        min_price=Decimal("0"),
        max_price=Decimal("0"),
        is_active=True
    )
    db_session.add(loc)
    db_session.commit()

    db_session.add(BusinessLocation(business_id=ent_profile.enterprise_id, location_id=loc_id))
    db_session.commit()

    # 4. Tạo User thường thám hiểm
    user_uid = uuid4()
    user = Users(
        user_id=user_uid,
        full_name="Nguyễn Thám Hiểm Event",
        email="playerevent@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    profile = UserProfiles(
        user_id=user_uid,
        full_name="Nguyễn Thám Hiểm Event",
        date_of_birth=datetime(1996, 6, 6).date(),
        gender="MALE",
        total_points=0,
        points_balance=0
    )
    db_session.add(user)
    db_session.add(profile)
    db_session.commit()

    return {
        "enterprise_user_id": ent_uid,
        "enterprise_id": ent_profile.enterprise_id,
        "location_id": loc_id,
        "normal_user_id": user_uid,
        "profile": profile,
        "location": loc
    }

def test_create_and_deactivate_enterprise_event(client: TestClient, db_session: Session, event_setup):
    ent_uid = event_setup["enterprise_user_id"]
    loc_id = event_setup["location_id"]

    ent_token = create_access_token(data={"sub": str(ent_uid), "role": "ENTERPRISE"})
    headers = {"Authorization": f"Bearer {ent_token}"}

    # 1. Doanh nghiệp tạo sự kiện hợp lệ
    payload = {
        "title": "Sự kiện check-in Cầu Rồng",
        "description": "Tham gia mini-game nhận quà hấp dẫn tại Cầu Rồng",
        "rarity": "RARE",
        "start_time": datetime.utcnow().isoformat(),
        "end_time": (datetime.utcnow() + timedelta(days=5)).isoformat(),
        "location_id": str(loc_id),
        "radius_meters": 150,
        "reward_exp": 100,
        "reward_coin": 50,
        "max_scans": 50,
        "question": "Cầu Rồng phun lửa vào ngày nào trong tuần?",
        "option_a": "Thứ Bảy và Chủ Nhật",
        "option_b": "Thứ Hai",
        "option_c": "Thứ Tư",
        "option_d": "Thứ Sáu",
        "correct_answer": "A"
    }

    response = client.post("/api/enterprise/events", json=payload, headers=headers)
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["status"] == "ok"
    assert res_json["event_id"] is not None
    assert res_json["qr"]["max_scans"] == 50

    event_id = res_json["event_id"]

    # Xác minh dữ liệu lưu xuống các bảng EnterpriseEvents, QR, Steps
    event_db = db_session.get(EnterpriseEvents, event_id)
    assert event_db is not None
    assert event_db.title == "Sự kiện check-in Cầu Rồng"
    assert event_db.multiplier == 2  # Rarity RARE -> multiplier = 2

    steps = db_session.query(EnterpriseEventSteps).filter(EnterpriseEventSteps.event_id == event_id).all()
    assert len(steps) == 3  # PHOTO, QUIZ, QR

    # 2. Xem danh sách sự kiện doanh nghiệp đã tạo
    list_response = client.get("/api/enterprise/events", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["event_id"] == event_id

    # 3. Hủy kích hoạt sự kiện
    delete_response = client.delete(f"/api/enterprise/events/{event_id}", headers=headers)
    assert delete_response.status_code == 200
    assert event_db.is_active is False

def test_user_participate_and_verify_campaign(client: TestClient, db_session: Session, event_setup):
    ent_id = event_setup["enterprise_id"]
    user_uid = event_setup["normal_user_id"]
    profile = event_setup["profile"]
    loc = event_setup["location"]

    # Dựng sẵn 1 sự kiện ACTIVE trong DB
    event_id = uuid4()
    event = EnterpriseEvents(
        event_id=event_id,
        enterprise_id=ent_id,
        title="Checkin Cầu Rồng Du Khách",
        description="Sự kiện dành cho du khách",
        quest_type=QuestTypeEnum.CHECKIN,
        latitude=loc.latitude,
        longitude=loc.longitude,
        radius_meters=100,
        reward_exp=50,
        reward_coin=30,
        multiplier=1,
        rarity=RarityEnum.COMMON,
        start_time=datetime.utcnow() - timedelta(days=1),
        end_time=datetime.utcnow() + timedelta(days=3),
        is_active=True
    )
    db_session.add(event)
    db_session.flush()

    # Dựng QR token
    qr = EnterpriseEventQR(
        event_id=event_id,
        qr_token="EVT-XYZ-123456",
        max_scans=10,
        scanned_count=0
    )
    db_session.add(qr)

    # Dựng Steps
    step1 = EnterpriseEventSteps(event_id=event_id, step_type="PHOTO", title="Chụp ảnh", prompt="Chụp Cầu Rồng", sort_order=1)
    step2 = EnterpriseEventSteps(event_id=event_id, step_type="QUIZ", title="Câu đố", prompt="Hỏi?", option_a="Đúng", option_b="Sai", option_c="", option_d="", correct_answer="A", sort_order=2)
    step3 = EnterpriseEventSteps(event_id=event_id, step_type="QR", title="Quét mã", prompt="Quét QR", sort_order=3)
    db_session.add(step1)
    db_session.add(step2)
    db_session.add(step3)
    db_session.commit()

    # Sinh token của user thường tham gia
    user_token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    user_headers = {"Authorization": f"Bearer {user_token}"}

    # 1. Người dùng lấy danh sách chiến dịch đang active ở gần (đứng gần Cầu Rồng)
    campaigns_response = client.get(f"/api/v1/campaigns/active?latitude={loc.latitude}&longitude={loc.longitude}", headers=user_headers)
    assert campaigns_response.status_code == 200
    assert len(campaigns_response.json()) == 1
    assert campaigns_response.json()[0]["event_id"] == str(event_id)

    # 2. Xác thực và hoàn thành thử thách (Verify campaign)
    verify_payload = {
        "event_id": str(event_id),
        "latitude": float(loc.latitude),
        "longitude": float(loc.longitude),
        "image_url": "http://img.com/my-dragon-bridge.jpg",
        "answer": "A",
        "qr_token": "EVT-XYZ-123456"
    }
    response_verify = client.post("/api/v1/campaigns/verify", json=verify_payload, headers=user_headers)
    assert response_verify.status_code == 200
    res_data = response_verify.json()
    assert res_data["status"] == "ok"
    assert res_data["reward_exp"] == 50
    assert res_data["reward_coin"] == 30

    # Kiểm tra điểm tích lũy được cộng
    db_session.refresh(profile)
    assert profile.total_points == 50
    assert profile.points_balance == 30

    # Lịch sử tham gia được lưu
    participation = db_session.query(HiddenEventParticipants).filter(
        HiddenEventParticipants.user_id == user_uid,
        HiddenEventParticipants.event_id == event_id
    ).first()
    assert participation is not None
