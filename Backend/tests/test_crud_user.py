import pytest
from datetime import datetime, timedelta, timezone, date
from uuid import uuid4
from decimal import Decimal
from sqlmodel import Session

from models import (
    Users, UserProfiles, PreferenceTagWeights, CategoryVisitHistory,
    PlanningSessions, Tags, Categories, Cities, EnterpriseProfiles,
    UserRole, UserStatus, RegisterType, GenderEnum, TravelStyle, PrivacyStatus, KycStatus, PlanningStatus, EnterpriseStatus
)
from crud.crud_user import (
    create_user,
    get_user_by_id,
    get_user_by_email,
    get_user_tag_weights,
    update_user_tag_weights,
    get_user_category_history,
    update_category_visit_history,
    get_user_avg_budget,
    update_user_status,
    create_user_profile,
    update_user_role,
    update_user_profile,
    update_user_kyc_status,
    create_social_user,
    update_enterprise_profile
)

@pytest.fixture(name="user_id")
def user_id_fixture():
    return uuid4()

def test_create_user(db_session: Session, user_id):
    user = create_user(
        db=db_session,
        full_name="Nguyễn Văn User",
        email="van.user@example.com",
        password="MySecretPassword1!",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.PENDING,
        user_id=user_id
    )

    assert user.user_id == user_id
    assert user.full_name == "Nguyễn Văn User"
    assert user.email == "van.user@example.com"
    assert user.register_type == RegisterType.EMAIL
    assert user.role == UserRole.USER
    assert user.status == UserStatus.PENDING
    assert user.passwordhash != "MySecretPassword1!"  # Phải được băm mật khẩu

    # Kiểm tra get_user_by_id
    found_by_id = get_user_by_id(db_session, user_id)
    assert found_by_id is not None
    assert found_by_id.email == "van.user@example.com"

def test_update_user_status_and_role(db_session: Session, user_id):
    user = create_user(
        db=db_session,
        full_name="Test Role Status",
        email="test.role@example.com",
        password="Password123!",
        user_id=user_id
    )

    # Cập nhật status
    updated_user = update_user_status(db_session, user_id, UserStatus.ACTIVE)
    assert updated_user is not None
    assert updated_user.status == UserStatus.ACTIVE

    # Cập nhật role
    updated_role = update_user_role(db_session, user_id, UserRole.ADMIN)
    assert updated_role is not None
    assert updated_role.role == UserRole.ADMIN

    # Thử cập nhật user không tồn tại
    assert update_user_status(db_session, uuid4(), UserStatus.ACTIVE) is None
    assert update_user_role(db_session, uuid4(), UserRole.ADMIN) is None

def test_user_profiles_crud(db_session: Session, user_id):
    # Tạo user trước làm khóa ngoại
    create_user(
        db=db_session,
        full_name="User Profile Test",
        email="profile.test@example.com",
        password="Password123!",
        user_id=user_id
    )

    # 1. Tạo profile
    dob = date(1998, 12, 25)
    profile = create_user_profile(
        db=db_session,
        user_id=user_id,
        full_name="User Profile Test",
        date_of_birth=dob,
        gender=GenderEnum.FEMALE,
        bio="Hello world",
        base_location="Hà Nội",
        travel_style=TravelStyle.BACKPACKER,
        privacy_status=PrivacyStatus.PUBLIC
    )

    assert profile.profile_id is not None
    assert profile.user_id == user_id
    assert profile.date_of_birth == dob
    assert profile.gender == GenderEnum.FEMALE
    assert profile.bio == "Hello world"
    assert profile.base_location == "Hà Nội"
    assert profile.travel_style == TravelStyle.BACKPACKER
    assert profile.kyc_status == KycStatus.UNVERIFIED

    # 2. Cập nhật profile (update_user_profile)
    updated = update_user_profile(
        db=db_session,
        user_id=user_id,
        bio="Updated bio",
        base_location="Hồ Chí Minh",
        date_of_birth="2000-01-01"  # test parse string sang date
    )
    assert updated is not None
    assert updated.bio == "Updated bio"
    assert updated.base_location == "Hồ Chí Minh"
    assert updated.date_of_birth == date(2000, 1, 1)

    # 3. Cập nhật kyc status
    updated_kyc = update_user_kyc_status(db_session, user_id, KycStatus.APPROVED)
    assert updated_kyc is not None
    assert updated_kyc.kyc_status == KycStatus.APPROVED

    # Thử cập nhật profile của user không tồn tại (sẽ trả về None cho KYC status)
    assert update_user_kyc_status(db_session, uuid4(), KycStatus.APPROVED) is None

def test_preference_tag_weights_crud(db_session: Session, user_id):
    create_user(
        db=db_session,
        full_name="Tag Weights",
        email="weights@example.com",
        password="Password123!",
        user_id=user_id
    )

    # Cần tạo Tag thực tế trước để thỏa mãn FK
    tag = Tags(tag_id=5, tag_name="Di tích")
    db_session.add(tag)
    db_session.commit()

    # Cập nhật trọng số lần đầu (sẽ INSERT)
    row = update_user_tag_weights(db_session, user_id, tag_id=5, new_weight=0.75)
    assert row is not None
    assert row.weight == 0.75

    # Cập nhật trọng số lần hai (sẽ UPDATE)
    row_updated = update_user_tag_weights(db_session, user_id, tag_id=5, new_weight=0.9)
    assert row_updated is not None
    assert row_updated.weight == 0.9

    # Kiểm tra truy vấn
    weights = get_user_tag_weights(db_session, user_id)
    assert len(weights) == 1
    assert weights[0].tag_id == 5
    assert weights[0].weight == 0.9

def test_category_visit_history_crud(db_session: Session, user_id):
    create_user(
        db=db_session,
        full_name="Cat History",
        email="cathist@example.com",
        password="Password123!",
        user_id=user_id
    )

    # Cần tạo Category thực tế trước để thỏa mãn FK
    cat = Categories(category_id=8, category_name="Ẩm thực")
    db_session.add(cat)
    db_session.commit()

    # Cập nhật lần đầu (INSERT)
    row = update_category_visit_history(db_session, user_id, category_id=8, increment=2)
    assert row is not None
    assert row.visit_count == 2

    # Cập nhật lần hai (UPDATE)
    row_updated = update_category_visit_history(db_session, user_id, category_id=8, increment=3)
    assert row_updated is not None
    assert row_updated.visit_count == 5

    # Lấy lịch sử
    history = get_user_category_history(db_session, user_id)
    assert len(history) == 1
    assert history[0].category_id == 8
    assert history[0].visit_count == 5

def test_get_user_avg_budget(db_session: Session, user_id):
    create_user(
        db=db_session,
        full_name="Budget Tester",
        email="budget@example.com",
        password="Password123!",
        user_id=user_id
    )

    # Phải tạo City làm FK cho PlanningSession
    city = Cities(
        city_id=1,
        city_name="Đà Nẵng",
        region="Miền Trung",
        latitude=Decimal("16.0544"),
        longitude=Decimal("108.2022")
    )
    db_session.add(city)
    db_session.commit()

    # Chưa có planning session nào được confirmed -> Trả về None
    assert get_user_avg_budget(db_session, user_id) is None

    # Tạo 2 planning session CONFIRMED
    p1 = PlanningSessions(
        session_id=uuid4(),
        user_id=user_id,
        city_id=1,
        budget=Decimal("2000000.00"),
        start_day=date(2025, 6, 1),
        end_day=date(2025, 6, 3),
        status=PlanningStatus.CONFIRMED
    )
    p2 = PlanningSessions(
        session_id=uuid4(),
        user_id=user_id,
        city_id=1,
        budget=Decimal("4000000.00"),
        start_day=date(2025, 7, 1),
        end_day=date(2025, 7, 3),
        status=PlanningStatus.CONFIRMED
    )
    # 1 planning session PENDING (không được tính vào AVG)
    p3 = PlanningSessions(
        session_id=uuid4(),
        user_id=user_id,
        city_id=1,
        budget=Decimal("5000000.00"),
        start_day=date(2025, 8, 1),
        end_day=date(2025, 8, 3),
        status=PlanningStatus.PENDING
    )
    db_session.add(p1)
    db_session.add(p2)
    db_session.add(p3)
    db_session.commit()

    # Trung bình cộng ngân sách = (2M + 4M) / 2 = 3M
    avg = get_user_avg_budget(db_session, user_id)
    assert avg is not None
    assert float(avg) == 3000000.0

def test_create_social_user(db_session: Session):
    social_user = create_social_user(
        db=db_session,
        full_name="Google User",
        email="google.user@example.com",
        social_id="google-id-112233",
        register_type="GOOGLE"
    )

    assert social_user.user_id is not None
    assert social_user.full_name == "Google User"
    assert social_user.email == "google.user@example.com"
    assert social_user.social_id == "google-id-112233"
    assert social_user.register_type == "GOOGLE"
    assert social_user.status == UserStatus.ACTIVE

def test_enterprise_profile_crud(db_session: Session, user_id):
    create_user(
        db=db_session,
        full_name="Enterprise User",
        email="ent@corp.com",
        password="Password123!",
        user_id=user_id
    )

    # 1. Tạo/cập nhật profile doanh nghiệp lần đầu (sẽ INSERT)
    ent_profile = update_enterprise_profile(
        db=db_session,
        user_id=user_id,
        business_name="Công ty du lịch ABC",
        contact_person="Nguyễn Doanh Nhân",
        contact_email="abc@corp.com",
        contact_phone="0987654321"
    )

    assert ent_profile.enterprise_id is not None
    assert ent_profile.user_id == user_id
    assert ent_profile.business_name == "Công ty du lịch ABC"
    assert ent_profile.status == EnterpriseStatus.PENDING

    # 2. Cập nhật profile doanh nghiệp (sẽ UPDATE)
    ent_profile_updated = update_enterprise_profile(
        db=db_session,
        user_id=user_id,
        business_name="Công ty du lịch ABC Cập Nhật",
        status=EnterpriseStatus.ACTIVE
    )

    assert ent_profile_updated.business_name == "Công ty du lịch ABC Cập Nhật"
    assert ent_profile_updated.status == EnterpriseStatus.ACTIVE
