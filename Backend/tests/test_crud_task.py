import pytest
from uuid import uuid4
from datetime import datetime, timedelta, time
from decimal import Decimal
from fastapi import HTTPException
from sqlmodel import Session

from models import (
    Users, UserProfiles, Locations, QATasks, QRTasks, UserTaskHistory,
    TaskTypeEnum, RegisterType, UserRole, UserStatus, Cities
)
from crud.crud_task import crud_task, calculate_haversine_distance
from schemas import QASubmissionRequest, QRScanRequest

@pytest.fixture(name="task_db_setup")
def task_db_setup_fixture(db_session: Session):
    # User
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Người Làm Nhiệm Vụ",
        email="doer@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)

    # Profile
    profile = UserProfiles(
        user_id=user_id,
        full_name="Người Làm Nhiệm Vụ",
        date_of_birth=datetime(2000, 1, 1).date(),
        gender="MALE",
        total_points=0,
        points_balance=0
    )
    db_session.add(profile)

    # City
    city = Cities(
        city_id=5,
        city_name="Vũng Tàu",
        region="Miền Nam",
        latitude=Decimal("10.3459"),
        longitude=Decimal("107.0842")
    )
    db_session.add(city)
    db_session.commit()

    # Location
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Bạch Dinh Vũng Tàu",
        address="Trần Phú, Vũng Tàu",
        latitude=Decimal("10.3541"),
        longitude=Decimal("107.0768"),
        city_id=5,
        open_time=time(7, 30),
        close_time=time(17, 30),
        min_price=Decimal("15000"),
        max_price=Decimal("15000")
    )
    db_session.add(loc)
    db_session.commit()

    return {
        "user_id": user_id,
        "location_id": loc_id,
        "profile": profile,
        "location": loc
    }

def test_calculate_haversine_distance():
    # Test distance between two nearby coordinates
    # Bach Dinh (10.3541, 107.0768) and a point ~20 meters away
    dist = calculate_haversine_distance(10.3541, 107.0768, 10.35415, 107.0769)
    assert 10.0 <= dist <= 30.0

def test_get_qa_tasks_by_location(db_session: Session, task_db_setup):
    loc_id = task_db_setup["location_id"]
    qa = QATasks(
        location_id=loc_id,
        question="Cây cầu nào nối tiếng ở Đà Nẵng?",
        option_a="Cầu Rồng",
        option_b="Cầu Sông Hàn",
        option_c="Cầu Thuận Phước",
        option_d="Cầu Trần Thị Lý",
        correct_answer="A"
    )
    db_session.add(qa)
    db_session.commit()

    tasks = crud_task.get_qa_tasks_by_location(db_session, loc_id)
    assert len(tasks) == 1
    assert tasks[0].question == "Cây cầu nào nối tiếng ở Đà Nẵng?"

def test_submit_qa_answer(db_session: Session, task_db_setup):
    user_id = task_db_setup["user_id"]
    loc_id = task_db_setup["location_id"]
    profile = task_db_setup["profile"]

    # 1. QA Task not found -> 404
    req_not_found = QASubmissionRequest(task_id=uuid4(), selected_option="A")
    with pytest.raises(HTTPException) as exc:
        crud_task.submit_qa_answer(db_session, user_id, req_not_found)
    assert exc.value.status_code == 404

    # Save a valid QA Task
    qa = QATasks(
        location_id=loc_id,
        question="Hồ Hoàn Kiếm ở đâu?",
        option_a="Hà Nội",
        option_b="Hồ Chí Minh",
        option_c="Đà Nẵng",
        option_d="Cần Thơ",
        correct_answer="A",
        reward_exp=20,
        reward_coin=10
    )
    db_session.add(qa)
    db_session.commit()

    # 2. Wrong Answer -> returns success=False
    req_wrong = QASubmissionRequest(task_id=qa.task_id, selected_option="B")
    resp_wrong = crud_task.submit_qa_answer(db_session, user_id, req_wrong)
    assert resp_wrong.success is False
    assert profile.total_points == 0

    # 3. Correct Answer -> success=True, awards points
    req_correct = QASubmissionRequest(task_id=qa.task_id, selected_option="A")
    resp_correct = crud_task.submit_qa_answer(db_session, user_id, req_correct)
    assert resp_correct.success is True
    assert resp_correct.reward_exp == 20
    assert resp_correct.reward_coin == 10
    
    db_session.refresh(profile)
    assert profile.total_points == 20
    assert profile.points_balance == 10

    # 4. Try to submit again same day -> 400 (Anti-cheat)
    with pytest.raises(HTTPException) as exc:
        crud_task.submit_qa_answer(db_session, user_id, req_correct)
    assert exc.value.status_code == 400

def test_scan_qr_task(db_session: Session, task_db_setup):
    user_id = task_db_setup["user_id"]
    loc_id = task_db_setup["location_id"]
    profile = task_db_setup["profile"]

    # 1. QR code not found -> 404
    req_not_found = QRScanRequest(location_id=loc_id, qr_token="unknown_token", latitude=10.3541, longitude=107.0768)
    with pytest.raises(HTTPException) as exc:
        crud_task.scan_qr_task(db_session, user_id, req_not_found)
    assert exc.value.status_code == 404

    # Seed an expired QR Task
    qr_expired = QRTasks(
        location_id=loc_id,
        qr_token="expired_token",
        expired_at=datetime.utcnow() - timedelta(minutes=5)
    )
    db_session.add(qr_expired)
    db_session.commit()

    # 2. Expired QR -> 400
    req_expired = QRScanRequest(location_id=loc_id, qr_token="expired_token", latitude=10.3541, longitude=107.0768)
    with pytest.raises(HTTPException) as exc:
        crud_task.scan_qr_task(db_session, user_id, req_expired)
    assert exc.value.status_code == 400

    # Seed a valid QR Task
    qr_valid = QRTasks(
        location_id=loc_id,
        qr_token="valid_token",
        expired_at=datetime.utcnow() + timedelta(hours=1),
        reward_exp=30,
        reward_coin=15
    )
    db_session.add(qr_valid)
    db_session.commit()

    # 3. GPS Too far (>100m) -> 400
    req_too_far = QRScanRequest(location_id=loc_id, qr_token="valid_token", latitude=11.3541, longitude=108.0768)
    with pytest.raises(HTTPException) as exc:
        crud_task.scan_qr_task(db_session, user_id, req_too_far)
    assert exc.value.status_code == 400

    # 4. Scan successful -> success=True, updates points
    req_success = QRScanRequest(location_id=loc_id, qr_token="valid_token", latitude=10.354101, longitude=107.076801)
    resp_success = crud_task.scan_qr_task(db_session, user_id, req_success)
    assert resp_success.success is True
    assert resp_success.reward_exp == 30

    db_session.refresh(profile)
    assert profile.total_points == 30

def test_get_aggregated_tasks(db_session: Session, task_db_setup):
    user_id = task_db_setup["user_id"]
    loc_id = task_db_setup["location_id"]

    # Seed a QA Task and a QR Task
    qa = QATasks(
        location_id=loc_id,
        question="Hỏi đáp 1",
        option_a="A", option_b="B", option_c="C", option_d="D",
        correct_answer="A"
    )
    qr = QRTasks(
        location_id=loc_id,
        qr_token="qr_aggregate",
        is_one_time=False,
        expired_at=datetime.utcnow() + timedelta(hours=1)
    )
    db_session.add(qa)
    db_session.add(qr)
    db_session.commit()

    # Mark the QA Task completed
    history = UserTaskHistory(
        user_id=user_id,
        location_id=loc_id,
        task_type=TaskTypeEnum.QA,
        task_id=qa.task_id,
        earned_exp=10,
        earned_coin=5,
        completed_at=datetime.utcnow()
    )
    db_session.add(history)
    db_session.commit()

    # Check aggregation list
    aggregated = crud_task.get_aggregated_tasks(db_session, user_id, loc_id)
    assert len(aggregated) == 2

    # Find tasks in response list
    qa_aggregated = next(t for t in aggregated if t["task_type"] == "QA")
    qr_aggregated = next(t for t in aggregated if t["task_type"] == "QR")

    assert qa_aggregated["is_completed"] is True
    assert qr_aggregated["is_completed"] is False
