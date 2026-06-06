import pytest
from datetime import date, datetime, timedelta
from uuid import uuid4
from decimal import Decimal
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    Users, UserProfiles, UserRole, UserStatus, RegisterType,
    Cities, Locations, Vouchers, UserVouchers, VoucherLocations,
    VoucherTypeEnum, DiscountTypeEnum, VoucherStatusEnum, UserVoucherStatusEnum,
    EnterpriseProfiles, EnterpriseStatus
)
from core.security import create_access_token

@pytest.fixture(autouse=True)
def mock_redis_locks():
    """Mock các hàm khóa Redis để test chạy độc lập không phụ thuộc mạng."""
    with patch("core.redis_locks.acquire_voucher_lock", return_value=True), \
         patch("core.redis_locks.release_voucher_lock", return_value=None):
        yield

@pytest.fixture(name="voucher_setup")
def voucher_setup_fixture(db_session: Session):
    # 1. Tạo Thành phố mẫu
    city = Cities(
        city_id=20,
        city_name="Vũng Tàu",
        region="Miền Nam",
        latitude=Decimal("10.34599"),
        longitude=Decimal("107.08426")
    )
    db_session.add(city)
    db_session.commit()

    # 2. Tạo Địa điểm mẫu
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Bạch Dinh",
        address="Trần Phú, Vũng Tàu",
        latitude=Decimal("10.3541"),
        longitude=Decimal("107.0768"),
        city_id=20,
        open_time=datetime.strptime("07:30:00", "%H:%M:%S").time(),
        close_time=datetime.strptime("17:30:00", "%H:%M:%S").time(),
        min_price=Decimal("15000"),
        max_price=Decimal("15000"),
        is_active=True
    )
    db_session.add(loc)
    db_session.commit()

    # 3. Tạo Doanh nghiệp mẫu ACTIVE
    ent_uid = uuid4()
    ent_user = Users(
        user_id=ent_uid,
        full_name="Chủ Khách Sạn",
        email="ent.voucher@corp.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.ENTERPRISE,
        status=UserStatus.ACTIVE
    )
    ent_profile = EnterpriseProfiles(
        user_id=ent_uid,
        business_name="Khách sạn Vũng Tàu Corp",
        contact_person="Lê Doanh Nghiệp",
        contact_email="ent.vouchers@corp.com",
        contact_phone="0911223399",
        status=EnterpriseStatus.ACTIVE
    )
    db_session.add(ent_user)
    db_session.add(ent_profile)
    db_session.commit()

    # 4. Tạo User thường tích điểm để đổi voucher
    user_uid = uuid4()
    user = Users(
        user_id=user_uid,
        full_name="Nguyễn Đổi Voucher",
        email="customer@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    profile = UserProfiles(
        user_id=user_uid,
        full_name="Nguyễn Đổi Voucher",
        date_of_birth=date(1995, 5, 5),
        gender="MALE",
        points_balance=500,  # 500 điểm tích lũy
        total_points=500
    )
    db_session.add(user)
    db_session.add(profile)
    db_session.commit()

    # 5. Tạo Admin mẫu để tạo system voucher
    admin_uid = uuid4()
    admin_user = Users(
        user_id=admin_uid,
        full_name="Admin Hệ Thống",
        email="admin.vouchers@smarttourism.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE
    )
    db_session.add(admin_user)
    db_session.commit()

    return {
        "location_id": loc_id,
        "enterprise_user_id": ent_uid,
        "enterprise_id": ent_profile.enterprise_id,
        "normal_user_id": user_uid,
        "admin_user_id": admin_uid,
        "profile": profile
    }

def test_create_voucher_api(client: TestClient, db_session: Session, voucher_setup):
    loc_id = voucher_setup["location_id"]

    # 1. Admin tạo SYSTEM voucher thành công
    admin_token = create_access_token(data={"sub": str(voucher_setup["admin_user_id"]), "role": "ADMIN"})
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    
    payload = {
        "voucher_type": "SYSTEM",
        "code": "SYSVOUCHER100",
        "title": "Voucher Giảm Giá Hệ Thống",
        "description": "Giảm giá 100k cho mọi hoạt động",
        "brand_name": "Hệ thống",
        "discount_type": "FIXED",
        "discount_value": 100000.0,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=10)),
        "quantity": 10,
        "max_per_user": 1,
        "point_cost": 100,
        "location_ids": [str(loc_id)]
    }

    response = client.post("/api/vouchers/", json=payload, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["code"] == "SYSVOUCHER100"
    assert response.json()["voucher_type"] == "SYSTEM"

    # 2. Doanh nghiệp tạo BUSINESS voucher thành công
    ent_token = create_access_token(data={"sub": str(voucher_setup["enterprise_user_id"]), "role": "ENTERPRISE"})
    ent_headers = {"Authorization": f"Bearer {ent_token}"}

    payload_ent = dict(payload)
    payload_ent["code"] = "ENTHOTEL20"
    payload_ent["title"] = "Giảm giá khách sạn 20%"
    payload_ent["discount_type"] = "PERCENT"
    payload_ent["discount_value"] = 20.0
    payload_ent["voucher_type"] = "BUSINESS"

    response = client.post("/api/vouchers/", json=payload_ent, headers=ent_headers)
    assert response.status_code == 200
    assert response.json()["code"] == "ENTHOTEL20"
    # Dù gửi voucher_type gì lên, server tự gán BUSINESS do role là ENTERPRISE
    assert response.json()["voucher_type"] == "BUSINESS"
    assert response.json()["business_id"] == str(voucher_setup["enterprise_id"])

    # 3. User thường cố tạo voucher -> Báo lỗi 403
    user_token = create_access_token(data={"sub": str(voucher_setup["normal_user_id"]), "role": "USER"})
    user_headers = {"Authorization": f"Bearer {user_token}"}
    response = client.post("/api/vouchers/", json=payload, headers=user_headers)
    assert response.status_code == 403

def test_claim_and_use_voucher_flow(client: TestClient, db_session: Session, voucher_setup):
    loc_id = voucher_setup["location_id"]
    user_uid = voucher_setup["normal_user_id"]
    profile = voucher_setup["profile"]

    # Đăng ký sẵn 1 voucher giá 200 điểm tích lũy, số lượng = 2
    voucher_id = uuid4()
    v = Vouchers(
        voucher_id=voucher_id,
        business_id=None,
        voucher_type=VoucherTypeEnum.SYSTEM,
        code=f"CLAIMTEST-{uuid4().hex[:4]}",
        title="Voucher Đổi Điểm",
        discount_type=DiscountTypeEnum.FIXED,
        discount_value=Decimal("50000"),
        start_date=date.today() - timedelta(days=1),  # Bắt đầu từ hôm qua
        end_date=date.today() + timedelta(days=5),
        quantity=2,
        remaining_quantity=2,
        max_per_user=1,
        point_cost=200,
        status=VoucherStatusEnum.ACTIVE
    )
    db_session.add(v)
    db_session.commit()

    # Sinh Token User
    user_token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    user_headers = {"Authorization": f"Bearer {user_token}"}

    # 1. Đổi voucher thành công
    response = client.post(f"/api/vouchers/{voucher_id}/claim", headers=user_headers)
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["success"] is True
    assert res_json["new_point_balance"] == 300  # 500 - 200 = 300
    
    # Xác minh kho voucher người dùng đã tăng lên
    my_vouchers = client.get("/api/vouchers/my-vouchers", headers=user_headers)
    assert len(my_vouchers.json()) == 1
    user_voucher_id = my_vouchers.json()[0]["user_voucher_id"]

    # 2. Đổi tiếp lần 2 khi giới hạn là 1 -> Báo lỗi
    response = client.post(f"/api/vouchers/{voucher_id}/claim", headers=user_headers)
    assert response.status_code == 400
    assert "tối đa 1 lần" in response.json()["detail"]

    # 3. Đổi voucher khác khi thiếu điểm -> Báo lỗi
    v2_id = uuid4()
    v2 = Vouchers(
        voucher_id=v2_id,
        business_id=None,
        voucher_type=VoucherTypeEnum.SYSTEM,
        code=f"EXPENSIVE-{uuid4().hex[:4]}",
        title="Voucher Đắt Đỏ",
        discount_type=DiscountTypeEnum.FIXED,
        discount_value=Decimal("100000"),
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
        quantity=1,
        remaining_quantity=1,
        max_per_user=1,
        point_cost=400,  # Cần 400 điểm, hiện tại chỉ còn 300
        status=VoucherStatusEnum.ACTIVE
    )
    db_session.add(v2)
    db_session.commit()

    response = client.post(f"/api/vouchers/{v2_id}/claim", headers=user_headers)
    assert response.status_code == 400
    assert "không đủ điểm" in response.json()["detail"]

    # 4. Sử dụng voucher vừa nhận -> Thành công
    response = client.post(f"/api/vouchers/{user_voucher_id}/use", headers=user_headers)
    assert response.status_code == 200
    assert "Sử dụng voucher thành công!" in response.json()["message"]

    # 5. Cố tình sử dụng lại voucher đã dùng -> Báo lỗi
    response = client.post(f"/api/vouchers/{user_voucher_id}/use", headers=user_headers)
    assert response.status_code == 400
    assert "đã được sử dụng" in response.json()["detail"]

def test_delete_voucher_api(client: TestClient, db_session: Session, voucher_setup):
    ent_uid = voucher_setup["enterprise_user_id"]
    ent_id = voucher_setup["enterprise_id"]

    # Tạo voucher của doanh nghiệp đó
    voucher_id = uuid4()
    v = Vouchers(
        voucher_id=voucher_id,
        business_id=ent_id,
        voucher_type=VoucherTypeEnum.BUSINESS,
        code="DELETEME1",
        title="Voucher Cần Xóa",
        discount_type=DiscountTypeEnum.PERCENT,
        discount_value=Decimal("10"),
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
        quantity=5,
        remaining_quantity=5,
        status=VoucherStatusEnum.ACTIVE
    )
    db_session.add(v)
    db_session.commit()

    ent_token = create_access_token(data={"sub": str(ent_uid), "role": "ENTERPRISE"})
    ent_headers = {"Authorization": f"Bearer {ent_token}"}

    # Xóa voucher (Soft Delete)
    response = client.delete(f"/api/vouchers/{voucher_id}", headers=ent_headers)
    assert response.status_code == 200
    assert "Đã xóa voucher thành công" in response.json()["message"]

    # Xác minh trạng thái đổi sang DISABLED trong database
    db_session.refresh(v)
    assert v.status == VoucherStatusEnum.DISABLED
