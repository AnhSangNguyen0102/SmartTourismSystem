import pytest
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlmodel import Session
from unittest.mock import patch

from models import Users, RegisterType, UserRole, UserStatus
from core.security import create_access_token

@pytest.fixture(name="task_setup")
def task_setup_fixture(db_session: Session):
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Nguyễn Văn Nhiệm Vụ",
        email="nhiemvu@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()
    return {
        "user_id": user_id
    }

def test_get_location_qa_tasks_api(client: TestClient, task_setup):
    location_id = uuid4()
    mock_tasks = [
        {"task_id": str(uuid4()), "question": "Đây là địa danh nào?", "options": ["A", "B"], "points": 10}
    ]

    with patch("routers.task_router.crud_task.get_qa_tasks_by_location", return_value=mock_tasks) as mock_get:
        response = client.get(f"/locations/{location_id}/qa-tasks")
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["question"] == "Đây là địa danh nào?"
        mock_get.assert_called_once_with(db=pytest.any, location_id=location_id)

def test_submit_qa_task_api(client: TestClient, task_setup):
    user_id = task_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "task_id": str(uuid4()),
        "selected_option": "A"
    }

    mock_result = {
        "success": True,
        "reward_points": 20,
        "message": "Trả lời chính xác!"
    }

    with patch("routers.task_router.crud_task.submit_qa_answer", return_value=mock_result) as mock_submit:
        response = client.post("/tasks/qa/submit", json=payload, headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True
        mock_submit.assert_called_once()

def test_scan_qr_task_api(client: TestClient, task_setup):
    user_id = task_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "location_id": str(uuid4()),
        "qr_code_content": "https://smarttourism.vn/qr/location/123"
    }

    mock_result = {
        "success": True,
        "reward_points": 50,
        "message": "Quét mã thành công!"
    }

    with patch("routers.task_router.crud_task.scan_qr_task", return_value=mock_result) as mock_scan:
        response = client.post("/tasks/qr/scan", json=payload, headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True
        mock_scan.assert_called_once()

def test_get_all_tasks_for_location_api(client: TestClient, task_setup):
    user_id = task_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    location_id = uuid4()
    mock_tasks_data = [
        {"task_id": str(uuid4()), "task_type": "QA", "is_completed": False}
    ]

    with patch("routers.task_router.crud_task.get_aggregated_tasks", return_value=mock_tasks_data) as mock_agg:
        response = client.get(f"/locations/{location_id}/tasks/aggregated", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["location_id"] == str(location_id)
        assert len(data["tasks"]) == 1
        mock_agg.assert_called_once()

def test_finalize_stop_checkin_api(client: TestClient, task_setup):
    user_id = task_setup["user_id"]
    token = create_access_token(data={"sub": str(user_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    with patch("routers.task_router.complete_itinerary_stop", return_value=True) as mock_complete:
        response = client.post("/stops/12/complete", headers=headers)
        assert response.status_code == 200
        assert response.json()["success"] is True
        mock_complete.assert_called_once_with(db=pytest.any, user_id=user_id, stop_id=12)

    with patch("routers.task_router.complete_itinerary_stop", return_value=False):
        response = client.post("/stops/12/complete", headers=headers)
        assert response.status_code == 400
