import pytest
from uuid import uuid4
from sqlmodel import Session

from models import Users, EnterpriseProfiles, EnterpriseStatus, VerificationAction, BusinessLocation, RegisterType, UserRole, UserStatus
from crud.crud_enterprise import (
    create_enterprise_profile, get_pending_enterprise_profiles,
    update_enterprise_status, create_verification_log, get_business_locations
)

@pytest.fixture(name="user_setup")
def user_setup_fixture(db_session: Session):
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Chủ Khách Sạn",
        email="hotel@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()
    return user_id

def test_enterprise_profile_crud(db_session: Session, user_setup):
    user_id = user_setup

    # Create profile
    profile = create_enterprise_profile(
        db=db_session,
        user_id=user_id,
        business_name="Khách Sạn Mường Thanh",
        contact_person="Nguyễn Văn A",
        contact_email="muongthanh@gmail.com",
        contact_phone="0909090909"
    )

    assert profile.enterprise_id is not None
    assert profile.status == EnterpriseStatus.PENDING
    assert profile.business_name == "Khách Sạn Mường Thanh"

    # Get pending list
    pending = get_pending_enterprise_profiles(db_session)
    assert len(pending) == 1
    assert pending[0].enterprise_id == profile.enterprise_id

    # Update status to ACTIVE
    updated = update_enterprise_status(db_session, profile.enterprise_id, EnterpriseStatus.ACTIVE)
    assert updated is not None
    assert updated.status == EnterpriseStatus.ACTIVE

    # Pend list should now be empty
    pending_empty = get_pending_enterprise_profiles(db_session)
    assert len(pending_empty) == 0

    # Create verification log
    admin_id = uuid4()
    log = create_verification_log(
        db=db_session,
        enterprise_id=profile.enterprise_id,
        admin_id=admin_id,
        action=VerificationAction.APPROVE,
        reason="Hồ sơ đầy đủ"
    )
    assert log.log_id is not None
    assert log.enterprise_id == profile.enterprise_id
    assert log.admin_id == admin_id
    assert log.action == VerificationAction.APPROVE

    # Business location lookup
    loc = BusinessLocation(business_id=profile.enterprise_id, location_id=uuid4())
    db_session.add(loc)
    db_session.commit()

    locations = get_business_locations(db_session, profile.enterprise_id)
    assert len(locations) == 1
    assert locations[0].location_id == loc.location_id
