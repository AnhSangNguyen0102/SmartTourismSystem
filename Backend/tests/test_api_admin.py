import pytest
from datetime import date, datetime, timedelta, time
from uuid import uuid4
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlmodel import Session
import json

from models import (
    Users, UserProfiles, UserRole, UserStatus, RegisterType,
    Cities, Locations, EnterpriseProfiles, EnterpriseStatus,
    LocationSubmissions, VerificationLogs, VerificationAction
)
from core.security import create_access_token

@pytest.fixture(name="admin_setup")
def admin_setup_fixture(db_session: Session):
    # 1. Tạo Admin mẫu
    admin_uid = uuid4()
    admin_user = Users(
        user_id=admin_uid,
        full_name="Quản Trị Viên",
        email="admin.board@smarttourism.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE
    )
    db_session.add(admin_user)
    db_session.commit()

    # 2. Tạo Người dùng mẫu để kiểm duyệt
    user_uid = uuid4()
    user = Users(
        user_id=user_uid,
        full_name="Người Dùng Thử Nghiệm",
        email="test.user@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    profile = UserProfiles(
        user_id=user_uid,
        full_name="Người Dùng Thử Nghiệm",
        date_of_birth=date(1995, 5, 5),
        gender="MALE",
        points_balance=1000,
        total_points=1000
    )
    db_session.add(user)
    db_session.add(profile)
    db_session.commit()

    # 3. Tạo Doanh nghiệp mẫu đang PENDING duyệt
    ent_uid = uuid4()
    ent_user = Users(
        user_id=ent_uid,
        full_name="Chủ Doanh Nghiệp Mẫu",
        email="business.pending@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,  # Chưa duyệt thì role vẫn là USER
        status=UserStatus.ACTIVE
    )
    ent_profile = EnterpriseProfiles(
        user_id=ent_uid,
        business_name="Doanh Nghiệp Đang Chờ Duyệt",
        contact_person="Nguyễn Doanh Nhân",
        contact_email="doanhnhan@gmail.com",
        contact_phone="0911223388",
        status=EnterpriseStatus.PENDING
    )
    db_session.add(ent_user)
    db_session.add(ent_profile)
    db_session.commit()

    # 4. Tạo Thành phố mẫu
    city = Cities(
        city_id=1,
        city_name="Hà Nội",
        region="Miền Bắc",
        latitude=Decimal("21.027764"),
        longitude=Decimal("105.834160")
    )
    db_session.add(city)
    db_session.commit()

    # 5. Tạo yêu cầu Đề xuất địa điểm kinh doanh PENDING
    sub_payload = {
        "location_name": "Cà Phê Đường Tàu",
        "address": "Phùng Hưng, Hoàn Kiếm, Hà Nội",
        "city_id": 1,
        "open_time": "08:00:00",
        "close_time": "22:00:00",
        "min_price": "25000",
        "max_price": "50000",
        "currency": "VND",
        "category_ids": [],
        "tag_ids": []
    }
    sub_id = uuid4()
    submission = LocationSubmissions(
        submission_id=sub_id,
        enterprise_id=ent_profile.enterprise_id,
        type="CREATE",
        status="PENDING",
        data_json=json.dumps(sub_payload)
    )
    db_session.add(submission)
    db_session.commit()

    return {
        "admin_user_id": admin_uid,
        "target_user_id": user_uid,
        "enterprise_id": ent_profile.enterprise_id,
        "enterprise_user_id": ent_uid,
        "submission_id": sub_id,
        "profile": profile
    }

def test_admin_check_unauthorized_access(client: TestClient, admin_setup):
    # Dùng Token User bình thường gọi API admin -> Phải trả về 403 Forbidden
    user_token = create_access_token(data={"sub": str(admin_setup["target_user_id"]), "role": "USER"})
    headers = {"Authorization": f"Bearer {user_token}"}
    
    response = client.get("/api/admin/users", headers=headers)
    assert response.status_code == 403
    assert "Bạn không có quyền truy cập" in response.json()["detail"]

def test_admin_grant_and_deduct_points(client: TestClient, db_session: Session, admin_setup):
    admin_uid = admin_setup["admin_user_id"]
    target_uid = admin_setup["target_user_id"]
    profile = admin_setup["profile"]

    admin_token = create_access_token(data={"sub": str(admin_uid), "role": "ADMIN"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Tặng điểm cho user
    grant_payload = {"user_id": str(target_uid), "amount": 500}
    response = client.post("/api/admin/grant-points", json=grant_payload, headers=headers)
    assert response.status_code == 200
    db_session.refresh(profile)
    assert profile.points_balance == 1500  # 1000 + 500

    # 2. Khấu trừ điểm của user
    deduct_payload = {"action": "deduct", "amount": 800}
    response = client.patch(f"/api/admin/users/{target_uid}/points", json=deduct_payload, headers=headers)
    assert response.status_code == 200
    db_session.refresh(profile)
    assert profile.points_balance == 700  # 1500 - 800

    # 3. Reset điểm của user về 0
    reset_payload = {"action": "reset"}
    response = client.patch(f"/api/admin/users/{target_uid}/points", json=reset_payload, headers=headers)
    assert response.status_code == 200
    db_session.refresh(profile)
    assert profile.points_balance == 0

def test_admin_lock_unlock_user(client: TestClient, db_session: Session, admin_setup):
    admin_uid = admin_setup["admin_user_id"]
    target_uid = admin_setup["target_user_id"]

    admin_token = create_access_token(data={"sub": str(admin_uid), "role": "ADMIN"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Khóa tài khoản user (Ban)
    response = client.patch(f"/api/admin/users/{target_uid}/status", json={"action": "lock"}, headers=headers)
    assert response.status_code == 200
    user_db = db_session.get(Users, target_uid)
    assert user_db.status == UserStatus.BANNED

    # 2. Mở khóa tài khoản user (Unlock)
    response = client.patch(f"/api/admin/users/{target_uid}/status", json={"action": "unlock"}, headers=headers)
    assert response.status_code == 200
    db_session.refresh(user_db)
    assert user_db.status == UserStatus.ACTIVE

def test_admin_approve_enterprise_flow(client: TestClient, db_session: Session, admin_setup):
    admin_uid = admin_setup["admin_user_id"]
    ent_id = admin_setup["enterprise_id"]
    ent_uid = admin_setup["enterprise_user_id"]

    admin_token = create_access_token(data={"sub": str(admin_uid), "role": "ADMIN"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Lấy danh sách doanh nghiệp đang chờ duyệt
    response = client.get("/api/admin/enterprises/pending", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["enterprise_id"] == str(ent_id)

    # 2. Duyệt hồ sơ doanh nghiệp
    approve_response = client.post(f"/api/admin/enterprises/{ent_id}/approve", headers=headers)
    assert approve_response.status_code == 200
    assert "Đã duyệt doanh nghiệp thành công" in approve_response.json()["message"]

    # Xác minh trạng thái đổi thành ACTIVE và role đổi thành ENTERPRISE
    ent_profile_db = db_session.get(EnterpriseProfiles, ent_id)
    assert ent_profile_db.status == EnterpriseStatus.ACTIVE
    ent_user_db = db_session.get(Users, ent_uid)
    assert ent_user_db.role == UserRole.ENTERPRISE

    # Xác minh log duyệt được ghi nhận
    log = db_session.query(VerificationLogs).filter(VerificationLogs.enterprise_id == ent_id).first()
    assert log is not None
    assert log.action == VerificationAction.APPROVE

def test_admin_approve_location_submission_flow(client: TestClient, db_session: Session, admin_setup):
    admin_uid = admin_setup["admin_user_id"]
    sub_id = admin_setup["submission_id"]

    admin_token = create_access_token(data={"sub": str(admin_uid), "role": "ADMIN"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Lấy danh sách địa điểm đề xuất chờ duyệt
    response = client.get("/api/admin/location-submissions", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1

    # 2. Xem chi tiết đề xuất địa điểm
    detail_response = client.get(f"/api/admin/location-submissions/{sub_id}", headers=headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["pending_data"]["location_name"] == "Cà Phê Đường Tàu"

    # 3. Phê duyệt địa điểm
    approve_response = client.post(f"/api/admin/location-submissions/{sub_id}/approve", headers=headers)
    assert approve_response.status_code == 200
    assert "Đã phê duyệt địa điểm thành công" in approve_response.json()["message"]

    # Xác minh DB đã lưu địa điểm chính thức
    sub_db = db_session.get(LocationSubmissions, sub_id)
    assert sub_db.status == "APPROVED"
    assert sub_db.location_id is not None
    
    loc = db_session.get(Locations, sub_db.location_id)
    assert loc is not None
    assert loc.location_name == "Cà Phê Đường Tàu"
