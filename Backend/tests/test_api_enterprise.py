import pytest
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import Users, EnterpriseProfiles, EnterpriseStatus, UserRole, UserStatus, RegisterType
from core.security import create_access_token

@pytest.fixture(name="enterprise_setup")
def enterprise_setup_fixture(db_session: Session):
    # 1. Create a regular user who will register as enterprise
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Nguyễn Văn Doanh Nghiệp",
        email="doanhnghiep@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()

    # 2. Create an admin user for verifying
    admin_id = uuid4()
    admin = Users(
        user_id=admin_id,
        full_name="Admin Hệ Thống",
        email="admin.ent@smarttourism.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE
    )
    db_session.add(admin)
    db_session.commit()

    return {
        "user_id": user_id,
        "admin_id": admin_id
    }

def test_register_profile_api(client: TestClient, db_session: Session, enterprise_setup):
    user_id = enterprise_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Submit enterprise profile successfully
    payload = {
        "business_name": "Công ty TNHH Smart Tour",
        "contact_person": "Nguyễn Văn Doanh Nghiệp",
        "contact_email": "contact@smarttour.com",
        "contact_phone": "0987654321"
    }
    response = client.post("/enterprise/register-profile", json=payload, headers=headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["business_name"] == "Công ty TNHH Smart Tour"
    assert res_data["status"] == "PENDING"
    assert res_data["user_id"] == str(user_id)

    # Submitting again should result in 400
    response = client.post("/enterprise/register-profile", json=payload, headers=headers)
    assert response.status_code == 400
    assert "đã có hồ sơ doanh nghiệp" in response.json()["detail"]

def test_get_enterprise_profile_api(client: TestClient, db_session: Session, enterprise_setup):
    user_id = enterprise_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Profile does not exist yet -> 404
    response = client.get("/enterprise/profile", headers=headers)
    assert response.status_code == 404

    # Create profile directly
    profile = EnterpriseProfiles(
        user_id=user_id,
        business_name="Touring Corp",
        contact_person="Director",
        contact_email="director@touring.com",
        contact_phone="0123456789",
        status=EnterpriseStatus.PENDING
    )
    db_session.add(profile)
    db_session.commit()

    # Get profile successfully
    response = client.get("/enterprise/profile", headers=headers)
    assert response.status_code == 200
    assert response.json()["business_name"] == "Touring Corp"

def test_verify_enterprise_profile_api(client: TestClient, db_session: Session, enterprise_setup):
    user_id = enterprise_setup["user_id"]
    admin_id = enterprise_setup["admin_id"]

    admin_token = create_access_token(data={"sub": str(admin_id), "role": "ADMIN"})
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create pending profile
    profile = EnterpriseProfiles(
        user_id=user_id,
        business_name="Touring Corp",
        contact_person="Director",
        contact_email="director@touring.com",
        contact_phone="0123456789",
        status=EnterpriseStatus.PENDING
    )
    db_session.add(profile)
    db_session.commit()

    # Reject without reason -> 400
    payload_reject = {"status": "REJECTED", "reason": ""}
    response = client.put(f"/enterprise/{profile.enterprise_id}/verify", json=payload_reject, headers=admin_headers)
    assert response.status_code == 400

    # Reject with reason -> success
    payload_reject = {"status": "REJECTED", "reason": "Giấy phép không hợp lệ"}
    response = client.put(f"/enterprise/{profile.enterprise_id}/verify", json=payload_reject, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "REJECTED"

    # Profile no longer pending -> try to approve -> 400
    payload_approve = {"status": "ACTIVE", "reason": ""}
    response = client.put(f"/enterprise/{profile.enterprise_id}/verify", json=payload_approve, headers=admin_headers)
    assert response.status_code == 400

    # Create another pending profile to test approval
    user_id2 = uuid4()
    user2 = Users(
        user_id=user_id2,
        full_name="User 2",
        email="user2@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user2)
    profile2 = EnterpriseProfiles(
        user_id=user_id2,
        business_name="Touring Corp 2",
        contact_person="Director 2",
        contact_email="director2@touring.com",
        contact_phone="0123456780",
        status=EnterpriseStatus.PENDING
    )
    db_session.add(profile2)
    db_session.commit()

    # Approve -> success, changes user role to ENTERPRISE
    response = client.put(f"/enterprise/{profile2.enterprise_id}/verify", json={"status": "ACTIVE", "reason": ""}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "ACTIVE"

    db_session.refresh(user2)
    assert user2.role == UserRole.ENTERPRISE
