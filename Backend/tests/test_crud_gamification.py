import pytest
import uuid
from datetime import date
from unittest.mock import MagicMock, patch
from sqlmodel import Session

from models import UserProfiles
from crud.crud_gamification import (
    check_newbie_gift, claim_newbie_gift, daily_attendance,
    get_nearby_treasures, claim_treasure, get_leaderboard, get_hot_locations
)

def test_check_newbie_gift():
    session = MagicMock(spec=Session)
    user_id = uuid.uuid4()
    
    # Mock return value of check newbie query
    mock_result = MagicMock()
    mock_result.first.return_value = [True]
    session.exec.return_value = mock_result

    result = check_newbie_gift(session, user_id)
    assert result is True
    session.exec.assert_called_once()

def test_claim_newbie_gift():
    session = MagicMock(spec=Session)
    user_id = uuid.uuid4()

    mock_result = MagicMock()
    mock_result.first.return_value = [str(user_id)]
    session.exec.return_value = mock_result

    result = claim_newbie_gift(session, user_id)
    assert result is True

def test_daily_attendance_new_streak():
    session = MagicMock(spec=Session)
    user_id = uuid.uuid4()

    profile = UserProfiles(
        user_id=user_id,
        full_name="User Test",
        date_of_birth=date(2000, 1, 1),
        gender="OTHER",
        last_attendance_date=date(2026, 6, 4), # two days ago, streak reset
        attendance_streak=5,
        total_points=100,
        points_balance=50
    )

    mock_result = MagicMock()
    mock_result.first.return_value = profile
    session.exec.return_value = mock_result

    with patch("crud.crud_gamification.date") as mock_date:
        # Freeze today to date(2026, 6, 6)
        mock_date.today.return_value = date(2026, 6, 6)
        
        result = daily_attendance(session, user_id)
        assert result["status"] == "success"
        assert result["new_streak"] == 1 # reset streak
        assert result["exp_reward"] == 100
        assert result["coin_reward"] == 50
        assert result["is_streak_bonus"] is False
        assert profile.last_attendance_date == date(2026, 6, 6)
        session.commit.assert_called_once()

def test_daily_attendance_already_attended():
    session = MagicMock(spec=Session)
    user_id = uuid.uuid4()

    profile = UserProfiles(
        user_id=user_id,
        full_name="User Test",
        date_of_birth=date(2000, 1, 1),
        gender="OTHER",
        last_attendance_date=date(2026, 6, 6),
        attendance_streak=1
    )

    mock_result = MagicMock()
    mock_result.first.return_value = profile
    session.exec.return_value = mock_result

    with patch("crud.crud_gamification.date") as mock_date:
        mock_date.today.return_value = date(2026, 6, 6)
        
        result = daily_attendance(session, user_id)
        assert "error" in result
        assert result["error"] == "Hôm nay bạn đã điểm danh rồi!"

def test_get_nearby_treasures():
    session = MagicMock(spec=Session)
    user_id = uuid.uuid4()

    # Mock DB row matching structure
    mock_row = MagicMock()
    mock_row._mapping = {
        "SPAWN_ID": "spawn-uuid",
        "LATITUDE": 10.35,
        "LONGITUDE": 107.08,
        "ITEM_NAME": "Chén Cổ"
    }

    mock_result = MagicMock()
    mock_result.all.return_value = [mock_row]
    session.exec.return_value = mock_result

    treasures = get_nearby_treasures(session, user_id)
    assert len(treasures) == 1
    assert treasures[0]["ITEM_NAME"] == "Chén Cổ"

def test_claim_treasure():
    session = MagicMock(spec=Session)
    user_id = uuid.uuid4()
    spawn_id = uuid.uuid4()

    result = claim_treasure(session, user_id, spawn_id, item_id=45)
    assert result is True
    # Verify two execution calls (claim + inventory addition)
    assert session.exec.call_count == 2

def test_get_leaderboard():
    session = MagicMock(spec=Session)
    
    mock_row = MagicMock()
    mock_row._mapping = {
        "FULL_NAME": "Nguyễn Văn Chiến Thắng",
        "SCORE_EXP": 1500,
        "RANKING": 1
    }

    mock_result = MagicMock()
    mock_result.all.return_value = [mock_row]
    session.exec.return_value = mock_result

    leaderboard = get_leaderboard(session, city_id=1, period_type="WEEK", period_value="2026-W23")
    assert len(leaderboard) == 1
    assert leaderboard[0]["FULL_NAME"] == "Nguyễn Văn Chiến Thắng"

def test_get_hot_locations():
    session = MagicMock(spec=Session)

    mock_row = MagicMock()
    mock_row._mapping = {
        "LOCATION_NAME": "Hồ Hoàn Kiếm",
        "CAMPAIGN_NAME": "X2 Trải nghiệm hè"
    }

    mock_result = MagicMock()
    mock_result.all.return_value = [mock_row]
    session.exec.return_value = mock_result

    locations = get_hot_locations(session)
    assert len(locations) == 1
    assert locations[0]["LOCATION_NAME"] == "Hồ Hoàn Kiếm"
