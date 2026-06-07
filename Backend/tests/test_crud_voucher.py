import pytest
from uuid import uuid4
from datetime import date, datetime, timedelta, time
from decimal import Decimal
from fastapi import HTTPException
from sqlmodel import Session, select
from unittest.mock import patch

from models import (
    Users, UserProfiles, Cities, Locations, Vouchers, UserVouchers, VoucherLocations,
    VoucherTypeEnum, DiscountTypeEnum, VoucherStatusEnum, UserVoucherStatusEnum,
    EnterpriseProfiles, EnterpriseStatus, RegisterType, UserRole, UserStatus
)
import schemas
from crud.crud_voucher import (
    create_voucher, get_voucher_by_id, get_vouchers_by_location, get_user_vouchers,
    claim_voucher, use_voucher, get_vouchers_by_enterprise, delete_voucher
)

@pytest.fixture(autouse=True)
def mock_redis_locks():
    """Mock locks to run standalone without network."""
    with patch("crud.crud_voucher.acquire_voucher_lock", return_value=True), \
         patch("crud.crud_voucher.release_voucher_lock", return_value=None):
        yield

@pytest.fixture(name="voucher_db_setup")
def voucher_db_setup_fixture(db_session: Session):
    # User
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Đổi Voucher",
        email="claim@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)

    profile = UserProfiles(
        user_id=user_id,
        full_name="Đổi Voucher",
        date_of_birth=date(1995, 1, 1),
        gender="MALE",
        total_points=500,
        points_balance=300 # 300 points balance
    )
    db_session.add(profile)

    # City & Location
    city = Cities(city_id=1, city_name="Hà Nội", region="Miền Bắc", latitude=Decimal("21.027"), longitude=Decimal("105.834"))
    db_session.add(city)
    db_session.commit()

    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Văn Miếu",
        address="Đống Đa",
        latitude=Decimal("21.029"),
        longitude=Decimal("105.836"),
        city_id=1,
        open_time=time(8, 0),
        close_time=time(18, 0),
        min_price=Decimal("0"),
        max_price=Decimal("0")
    )
    db_session.add(loc)

    # Enterprise profile
    ent_id = uuid4()
    ent_profile = EnterpriseProfiles(
        enterprise_id=ent_id,
        user_id=uuid4(),
        business_name="Doanh Nghiệp Voucher",
        contact_person="Director",
        contact_email="entvoucher@gmail.com",
        contact_phone="0911223344",
        status=EnterpriseStatus.ACTIVE
    )
    db_session.add(ent_profile)
    db_session.commit()

    return {
        "user_id": user_id,
        "location_id": loc_id,
        "enterprise_id": ent_id,
        "profile": profile
    }

def test_create_and_query_vouchers(db_session: Session, voucher_db_setup):
    loc_id = voucher_db_setup["location_id"]
    ent_id = voucher_db_setup["enterprise_id"]

    voucher_data = schemas.VoucherCreate(
        voucher_type=VoucherTypeEnum.BUSINESS,
        code="PROMO50K",
        title="Khuyến mãi 50K",
        description="Giảm giá 50.000đ khi thanh toán",
        discount_type=DiscountTypeEnum.FIXED,
        discount_value=50000.0,
        start_date=date.today(),
        end_date=date.today() + timedelta(days=10),
        quantity=20,
        max_per_user=1,
        point_cost=50,
        location_ids=[loc_id]
    )

    # 1. Create voucher
    voucher = create_voucher(db_session, voucher_data, business_id=ent_id)
    assert voucher.voucher_id is not None
    assert voucher.code == "PROMO50K"

    # 2. Get voucher by ID
    fetched = get_voucher_by_id(db_session, voucher.voucher_id)
    assert fetched is not None
    assert fetched.code == "PROMO50K"

    # 3. Get vouchers by location
    vouchers_loc = get_vouchers_by_location(db_session, loc_id)
    assert len(vouchers_loc) == 1
    assert vouchers_loc[0].code == "PROMO50K"

    # 4. Get vouchers by enterprise
    vouchers_ent = get_vouchers_by_enterprise(db_session, ent_id)
    assert len(vouchers_ent) == 1

def test_claim_voucher_validations(db_session: Session, voucher_db_setup):
    user_id = voucher_db_setup["user_id"]
    profile = voucher_db_setup["profile"]
    loc_id = voucher_db_setup["location_id"]

    # Seed an expensive voucher (cost = 500, user only has 300 points)
    v_expensive = Vouchers(
        business_id=None,
        voucher_type=VoucherTypeEnum.SYSTEM,
        code="EXPENSIVE",
        title="Voucher Đắt Đỏ",
        discount_type=DiscountTypeEnum.FIXED,
        discount_value=Decimal("10000"),
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
        quantity=5,
        remaining_quantity=5,
        max_per_user=1,
        point_cost=500,
        status=VoucherStatusEnum.ACTIVE
    )
    db_session.add(v_expensive)
    db_session.commit()

    # 1. Claim when insufficient points -> 400
    with pytest.raises(HTTPException) as exc:
        claim_voucher(db_session, user_id, v_expensive.voucher_id)
    assert exc.value.status_code == 400
    assert "không đủ điểm" in exc.value.detail

    # Seed an affordable voucher
    v_cheap = Vouchers(
        business_id=None,
        voucher_type=VoucherTypeEnum.SYSTEM,
        code="CHEAP",
        title="Voucher rẻ",
        discount_type=DiscountTypeEnum.FIXED,
        discount_value=Decimal("10000"),
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
        quantity=5,
        remaining_quantity=5,
        max_per_user=1,
        point_cost=100,
        status=VoucherStatusEnum.ACTIVE
    )
    db_session.add(v_cheap)
    db_session.commit()

    # 2. Claim success -> user_voucher created, points deducted
    resp = claim_voucher(db_session, user_id, v_cheap.voucher_id)
    assert resp.success is True
    assert resp.new_point_balance == 200 # 300 - 100

    db_session.refresh(v_cheap)
    assert v_cheap.remaining_quantity == 4

    # 3. Claim again when limit is 1 -> 400
    with pytest.raises(HTTPException) as exc:
        claim_voucher(db_session, user_id, v_cheap.voucher_id)
    assert exc.value.status_code == 400
    assert "tối đa" in exc.value.detail

def test_use_voucher_flow(db_session: Session, voucher_db_setup):
    user_id = voucher_db_setup["user_id"]

    voucher = Vouchers(
        business_id=None,
        voucher_type=VoucherTypeEnum.SYSTEM,
        code="USEME",
        title="Dùng tôi",
        discount_type=DiscountTypeEnum.FIXED,
        discount_value=Decimal("5000"),
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
        quantity=5,
        remaining_quantity=5,
        max_per_user=1,
        point_cost=10,
        status=VoucherStatusEnum.ACTIVE
    )
    db_session.add(voucher)
    db_session.commit()

    user_voucher = UserVouchers(
        user_id=user_id,
        voucher_id=voucher.voucher_id,
        status=UserVoucherStatusEnum.COLLECTED
    )
    db_session.add(user_voucher)
    db_session.commit()

    # 1. Use voucher successfully
    resp = use_voucher(db_session, user_id, user_voucher.user_voucher_id)
    assert "Sử dụng voucher thành công" in resp["message"]

    db_session.refresh(user_voucher)
    assert user_voucher.status == UserVoucherStatusEnum.USED

    # 2. Use again -> 400
    with pytest.raises(HTTPException) as exc:
        use_voucher(db_session, user_id, user_voucher.user_voucher_id)
    assert exc.value.status_code == 400
    assert "đã được sử dụng" in exc.value.detail

def test_delete_voucher_soft(db_session: Session, voucher_db_setup):
    ent_id = voucher_db_setup["enterprise_id"]
    
    # Create owner user linked to this enterprise
    owner_id = uuid4()
    owner = Users(
        user_id=owner_id,
        full_name="Chủ sở hữu doanh nghiệp",
        email="entowner@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.ENTERPRISE,
        status=UserStatus.ACTIVE
    )
    db_session.add(owner)
    
    ent = db_session.get(EnterpriseProfiles, ent_id)
    ent.user_id = owner_id
    db_session.add(ent)
    db_session.commit()

    # Seed voucher belonging to enterprise
    voucher = Vouchers(
        business_id=ent_id,
        voucher_type=VoucherTypeEnum.BUSINESS,
        code="DELETEME",
        title="Xoá tôi",
        discount_type=DiscountTypeEnum.FIXED,
        discount_value=Decimal("10000"),
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
        quantity=5,
        remaining_quantity=5,
        max_per_user=1,
        point_cost=50,
        status=VoucherStatusEnum.ACTIVE
    )
    db_session.add(voucher)
    db_session.commit()

    # Soft delete voucher
    resp = delete_voucher(db_session, voucher.voucher_id, owner_id)
    assert "Đã xóa voucher thành công" in resp["message"]

    db_session.refresh(voucher)
    assert voucher.status == VoucherStatusEnum.DISABLED
