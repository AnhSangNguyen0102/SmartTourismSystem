import pytest
from datetime import date, datetime, timedelta, time
from uuid import uuid4
from decimal import Decimal
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    Users, UserProfiles, UserRole, UserStatus, RegisterType,
    Cities, Locations, PhotoTasks, UserTaskProgress, TaskSubmissions,
    QATasks, QRTasks, UserTaskHistory, UserDailyQuests, ProgressStatusEnum, SubmissionStatusEnum
)
from core.security import create_access_token

@pytest.fixture(autouse=True)
def mock_ai_services():
    """Mock việc kiểm định hình ảnh bằng Gemini để không gọi API bên ngoài."""
    mock_result = {"is_matched": True, "confidence_score": 0.92, "reason": "Hình ảnh phù hợp"}
    with patch("services.ai_verification.verify_image_with_gemini", return_value=mock_result):
        yield

@pytest.fixture(name="game_setup")
def game_setup_fixture(db_session: Session):
    # 1. Tạo Thành phố mẫu
    city = Cities(
        city_id=30,
        city_name="Huế",
        region="Miền Trung",
        latitude=Decimal("16.4637"),
        longitude=Decimal("107.5908")
    )
    db_session.add(city)
    db_session.commit()

    # 2. Tạo Địa điểm mẫu
    loc_id = uuid4()
    loc = Locations(
        location_id=loc_id,
        location_name="Đại Nội Huế",
        address="Huế, Thừa Thiên Huế",
        latitude=Decimal("16.4691"),
        longitude=Decimal("107.5776"),
        city_id=30,
        open_time=time(8, 0, 0),
        close_time=time(17, 30, 0),
        min_price=Decimal("200000"),
        max_price=Decimal("200000"),
        is_active=True
    )
    db_session.add(loc)
    db_session.commit()

    # 3. Tạo User mẫu chơi game
    user_uid = uuid4()
    user = Users(
        user_id=user_uid,
        full_name="Nguyễn Thám Hiểm",
        email="explorer@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    profile = UserProfiles(
        user_id=user_uid,
        full_name="Nguyễn Thám Hiểm",
        date_of_birth=date(1998, 8, 8),
        gender="MALE",
        total_points=0,
        points_balance=0,
        last_attendance_date=None,
        attendance_streak=0
    )
    db_session.add(user)
    db_session.add(profile)
    db_session.commit()

    return {
        "city_id": 30,
        "location_id": loc_id,
        "user_id": user_uid,
        "profile": profile
    }

def test_daily_attendance_api(client: TestClient, db_session: Session, game_setup):
    user_uid = game_setup["user_id"]
    profile = game_setup["profile"]
    token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Điểm danh ngày đầu tiên
    response = client.post(f"/api/gamification/daily-attendance/{user_uid}", headers=headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["data"]["streak"] == 1
    assert res_data["data"]["exp_reward"] == 50

    # Kiểm tra database cập nhật
    db_session.refresh(profile)
    assert profile.last_attendance_date == date.today()
    assert profile.attendance_streak == 1
    assert profile.total_points == 50

    # 2. Cố tình điểm danh lần 2 trong ngày -> Trả về lỗi 400
    response = client.post(f"/api/gamification/daily-attendance/{user_uid}", headers=headers)
    assert response.status_code == 400
    assert "Hôm nay bạn đã điểm danh rồi" in response.json()["detail"]

def test_daily_quests_and_chest(client: TestClient, db_session: Session, game_setup):
    user_uid = game_setup["user_id"]
    profile = game_setup["profile"]
    token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Gọi lấy danh sách nhiệm vụ hàng ngày (sẽ tự động bốc ngẫu nhiên và lưu DB nếu chưa có)
    response = client.get(f"/api/gamification/daily-quests/{user_uid}", headers=headers)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert len(res_data["data"]) == 3
    assert res_data["chest_claimed"] is False

    # 2. Cố tình claim rương khi chưa hoàn thành nhiệm vụ -> Báo lỗi 400
    response = client.post(f"/api/gamification/daily-quests/{user_uid}/claim-chest", headers=headers)
    assert response.status_code == 400
    assert "phải hoàn thành toàn bộ 3 nhiệm vụ" in response.json()["detail"]

    # 3. Đánh dấu 3 nhiệm vụ thành hoàn thành trong DB để mở rương
    quests_in_db = db_session.query(UserDailyQuests).filter(UserDailyQuests.user_id == user_uid).all()
    for q in quests_in_db:
        q.is_completed = True
        db_session.add(q)
    db_session.commit()

    # 4. Mở rương thành công
    response = client.post(f"/api/gamification/daily-quests/{user_uid}/claim-chest", headers=headers)
    assert response.status_code == 200
    assert "Mở rương thưởng thành công!" in response.json()["message"]
    
    # Kiểm tra EXP và Coin cộng vào profile
    db_session.refresh(profile)
    assert profile.total_points == 300
    assert profile.points_balance == 200
    assert profile.last_daily_chest_date == date.today()

def test_qa_task_submit(client: TestClient, db_session: Session, game_setup):
    loc_id = game_setup["location_id"]
    user_uid = game_setup["user_id"]
    profile = game_setup["profile"]
    token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Dựng sẵn câu hỏi Q&A trắc nghiệm gắn với địa điểm
    task_id = uuid4()
    qa = QATasks(
        task_id=task_id,
        location_id=loc_id,
        question="Cổng Ngọ Môn Đại Nội Huế có mấy lối đi?",
        option_a="3 lối đi",
        option_b="5 lối đi",
        option_c="4 lối đi",
        option_d="6 lối đi",
        correct_answer="B",  # 5 lối đi
        question_type="multiple_choice",
        difficulty="easy",
        reward_exp=100,
        reward_coin=50
    )
    db_session.add(qa)
    db_session.commit()

    # 1. Trả lời sai trắc nghiệm -> Trả về success: False
    payload_wrong = {"task_id": str(task_id), "selected_option": "A"}
    response = client.post("/tasks/qa/submit", json=payload_wrong, headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is False
    assert "không chính xác" in response.json()["message"]

    # 2. Trả lời đúng trắc nghiệm -> Trả về success: True và được cộng EXP
    payload_correct = {"task_id": str(task_id), "selected_option": "B"}
    response = client.post("/tasks/qa/submit", json=payload_correct, headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["reward_exp"] == 100
    assert response.json()["new_total_points"] == 100

    # Kiểm tra database lưu vết lịch sử hoàn thành để tránh spam làm lại
    history = db_session.query(UserTaskHistory).filter(UserTaskHistory.user_id == user_uid).first()
    assert history is not None
    assert history.task_id == task_id
    assert history.earned_exp == 100

def test_qr_task_scan(client: TestClient, db_session: Session, game_setup):
    loc_id = game_setup["location_id"]
    user_uid = game_setup["user_id"]
    token = create_access_token(data={"sub": str(user_uid), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # Tạo sẵn QR task trong DB
    qr_id = uuid4()
    qr = QRTasks(
        qr_task_id=qr_id,
        location_id=loc_id,
        qr_token="ben-thanh-secret-qr-token-999",
        reward_exp=150,
        reward_coin=100,
        is_one_time=False,
        is_used=False,
        expired_at=datetime.utcnow() + timedelta(days=1)
    )
    db_session.add(qr)
    db_session.commit()

    # Quét mã QR thành công (tọa độ nằm trong Đại Nội Huế: 16.4691, 107.5776)
    scan_payload = {
        "qr_token": "ben-thanh-secret-qr-token-999",
        "latitude": 16.4691,
        "longitude": 107.5776
    }
    response = client.post("/tasks/qr/scan", json=scan_payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["reward_exp"] == 150

    # Thử quét lại chính mã đó -> Trả về lỗi 400 (Anti-cheat)
    response2 = client.post("/tasks/qr/scan", json=scan_payload, headers=headers)
    assert response2.status_code == 400
    assert "Bạn đã hoàn thành nhiệm vụ này trong ngày hôm nay" in response2.json()["detail"]
