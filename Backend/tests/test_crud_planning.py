import pytest
from uuid import uuid4
from datetime import date
from decimal import Decimal
from sqlmodel import Session

from models import Users, Cities, PlanningSessions, PlanningStatus, Tags, TravelRequestPreferences, RequestActionType, RegisterType, UserRole, UserStatus
from crud.crud_planning import (
    create_planning_session, create_session_preferences, get_planning_session,
    update_session_status, create_request_history_log
)

@pytest.fixture(name="planning_setup")
def planning_setup_fixture(db_session: Session):
    # Create user
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Người Lập Kế Hoạch",
        email="planner@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)

    # Create city
    city = Cities(
        city_id=2,
        city_name="Đà Nẵng",
        region="Miền Trung",
        latitude=Decimal("16.0544"),
        longitude=Decimal("108.2022")
    )
    db_session.add(city)

    # Create valid tag
    tag = Tags(tag_id=1, tag_name="Biển")
    db_session.add(tag)
    db_session.commit()

    return {
        "user_id": user_id,
        "city_id": 2,
        "tag_id": 1
    }

def test_planning_session_crud(db_session: Session, planning_setup):
    user_id = planning_setup["user_id"]
    city_id = planning_setup["city_id"]
    tag_id = planning_setup["tag_id"]

    # 1. Create planning session
    session = create_planning_session(
        db=db_session,
        user_id=user_id,
        city_id=city_id,
        pax_adult=2,
        pax_children=1,
        budget=Decimal("3000000"),
        start_day=date.today(),
        end_day=date.today() + date.resolution
    )

    assert session.session_id is not None
    assert session.pax_adult == 2
    assert session.status == PlanningStatus.PENDING

    # 2. Create session preferences with valid and invalid tags
    # tag 999 does not exist, tag_id exists
    prefs = create_session_preferences(db_session, session.session_id, [tag_id, 999])
    assert len(prefs) == 1
    assert prefs[0].tag_id == tag_id

    # 3. Get planning session (note: it returns a tuple/row representing selected columns)
    fetched = get_planning_session(db_session, session.session_id)
    assert fetched is not None
    assert fetched.session_id == session.session_id
    assert fetched.budget == Decimal("3000000")

    # 4. Update status
    updated = update_session_status(db_session, session.session_id, PlanningStatus.CONFIRMED)
    assert updated is not None
    assert updated.status == PlanningStatus.CONFIRMED

    # 5. Create request history log
    log = create_request_history_log(
        db=db_session,
        session_id=session.session_id,
        action_type=RequestActionType.CREATE,
        state_before='{"status": "PENDING"}'
    )
    assert log.log_id is not None
    assert log.session_id == session.session_id
    assert log.action_type == RequestActionType.CREATE
    assert log.state_before == '{"status": "PENDING"}'
