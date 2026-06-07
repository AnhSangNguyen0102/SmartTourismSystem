import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlmodel import Session

from models import Users, UserSessions, UserProfiles, PreferenceTagWeights, ActivityLog, Tags, UserRole, UserStatus, RegisterType
from crud.crud_auth import (
    get_user_by_email,
    get_active_sessions_count,
    get_active_sessions,
    get_session_by_device,
    revoke_oldest_sessions,
    revoke_session_by_device,
    revoke_all_sessions,
    create_user_session,
    get_user_profile_with_preferences,
    get_session_by_refresh_token,
    update_session_token,
    create_activity_log
)
from crud.crud_user import create_user

@pytest.fixture(name="test_user")
def test_user_fixture(db_session: Session) -> Users:
    """Tạo user thử nghiệm cho các test case liên quan đến session."""
    user = create_user(
        db=db_session,
        full_name="Nguyễn Văn Auth",
        email="van.auth@example.com",
        password="TestPassword123!",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    return user

def test_get_user_by_email(db_session: Session, test_user: Users):
    # Test tìm thấy user tồn tại
    found_user = get_user_by_email(db_session, "van.auth@example.com")
    assert found_user is not None
    assert found_user.user_id == test_user.user_id
    assert found_user.email == "van.auth@example.com"

    # Test không tìm thấy với email không tồn tại
    not_found = get_user_by_email(db_session, "doesnotexist@example.com")
    assert not_found is None

def test_create_user_session(db_session: Session, test_user: Users):
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7)
    session = create_user_session(
        db=db_session,
        user_id=test_user.user_id,
        device_id="iphone-14",
        refresh_token_hash="hashed_token_value_abc",
        expires_at=expires_at
    )
    
    assert session.session_id is not None
    assert session.user_id == test_user.user_id
    assert session.device_id == "iphone-14"
    assert session.refresh_token_hash == "hashed_token_value_abc"
    assert session.is_revoked is False
    assert session.expires_at == expires_at

def test_active_sessions_flow(db_session: Session, test_user: Users):
    # Ban đầu chưa có session nào
    assert get_active_sessions_count(db_session, test_user.user_id) == 0
    assert len(get_active_sessions(db_session, test_user.user_id)) == 0

    # Tạo 2 session active cho 2 thiết bị khác nhau
    future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2)
    s1 = create_user_session(db_session, test_user.user_id, "device-1", "hash-1", future)
    s2 = create_user_session(db_session, test_user.user_id, "device-2", "hash-2", future)

    # Đếm số session active
    assert get_active_sessions_count(db_session, test_user.user_id) == 2
    
    active_list = get_active_sessions(db_session, test_user.user_id)
    assert len(active_list) == 2
    # Sắp xếp mới nhất trước
    assert active_list[0].session_id == s2.session_id

    # Tìm kiếm session theo thiết bị cụ thể
    found_s1 = get_session_by_device(db_session, test_user.user_id, "device-1")
    assert found_s1 is not None
    assert found_s1.session_id == s1.session_id

    # Tìm kiếm thiết bị chưa đăng nhập
    assert get_session_by_device(db_session, test_user.user_id, "device-unknown") is None

def test_expired_session_handling(db_session: Session, test_user: Users):
    # Tạo session đã hết hạn
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
    create_user_session(db_session, test_user.user_id, "device-expired", "hash-exp", past)

    # Đếm số session active (phải loại bỏ session hết hạn)
    assert get_active_sessions_count(db_session, test_user.user_id) == 0
    assert len(get_active_sessions(db_session, test_user.user_id)) == 0
    assert get_session_by_device(db_session, test_user.user_id, "device-expired") is None

def test_revoke_sessions(db_session: Session, test_user: Users):
    future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2)
    create_user_session(db_session, test_user.user_id, "device-1", "hash-1", future)
    create_user_session(db_session, test_user.user_id, "device-2", "hash-2", future)

    # Thu hồi session theo thiết bị
    revoked = revoke_session_by_device(db_session, test_user.user_id, "device-1")
    assert revoked is True
    assert get_active_sessions_count(db_session, test_user.user_id) == 1

    # Thử thu hồi thiết bị không tồn tại/đã bị thu hồi
    assert revoke_session_by_device(db_session, test_user.user_id, "device-1") is False

    # Thu hồi tất cả session còn lại
    count_revoked = revoke_all_sessions(db_session, test_user.user_id)
    assert count_revoked == 1
    assert get_active_sessions_count(db_session, test_user.user_id) == 0

def test_revoke_oldest_sessions_limit(db_session: Session, test_user: Users):
    future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2)
    # Tạo 5 sessions (s1 cũ nhất, s5 mới nhất)
    sessions = []
    for i in range(5):
        s = create_user_session(db_session, test_user.user_id, f"device-{i}", f"hash-{i}", future)
        # Sửa đổi create_at để đảm bảo thứ tự thời gian phân biệt
        s.created_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=i)
        db_session.add(s)
        sessions.append(s)
    db_session.commit()

    # Thu hồi các session cũ vượt quá limit = 3
    revoked_count = revoke_oldest_sessions(db_session, test_user.user_id, keep_limit=3)
    assert revoked_count == 2  # Phải thu hồi 2 session cũ nhất (device-0, device-1)
    
    # Kiểm tra số lượng session active còn lại là 3
    assert get_active_sessions_count(db_session, test_user.user_id) == 3
    
    # Kiểm tra xem các session còn active là s2, s3, s4 (mới nhất)
    active_ids = [s.session_id for s in get_active_sessions(db_session, test_user.user_id)]
    assert sessions[0].session_id not in active_ids
    assert sessions[1].session_id not in active_ids
    assert sessions[2].session_id in active_ids

def test_token_rotation(db_session: Session, test_user: Users):
    future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=2)
    s = create_user_session(db_session, test_user.user_id, "pc-web", "old-hash", future)

    # Tìm session bằng token hash cũ
    found = get_session_by_refresh_token(db_session, "old-hash")
    assert found is not None
    assert found.session_id == s.session_id

    # Cập nhật token mới
    updated = update_session_token(db_session, s.session_id, "new-hash")
    assert updated is not None
    assert updated.refresh_token_hash == "new-hash"

    # Token cũ không tìm thấy nữa
    assert get_session_by_refresh_token(db_session, "old-hash") is None
    # Token mới tìm thấy
    assert get_session_by_refresh_token(db_session, "new-hash") is not None

def test_get_user_profile_with_preferences(db_session: Session, test_user: Users):
    # Tạo profile cho user
    profile = UserProfiles(
        user_id=test_user.user_id,
        full_name="Nguyễn Văn Auth",
        date_of_birth=datetime(1995, 5, 5).date(),
        gender="MALE",
        bio="Lập trình viên test"
    )
    db_session.add(profile)

    # Tạo tag cha trước để dữ liệu preference thỏa khóa ngoại như PostgreSQL thật.
    db_session.add(Tags(tag_id=10, tag_name="Ẩm thực"))
    db_session.add(Tags(tag_id=11, tag_name="Lịch sử"))
    db_session.flush()

    # Tạo một vài tag preferences
    t1 = PreferenceTagWeights(tag_id=10, user_id=test_user.user_id, weight=0.8)
    t2 = PreferenceTagWeights(tag_id=11, user_id=test_user.user_id, weight=0.4)
    db_session.add(t1)
    db_session.add(t2)
    db_session.commit()

    # Truy vấn dữ liệu tổng hợp
    data = get_user_profile_with_preferences(db_session, test_user.user_id)
    assert data["profile"] is not None
    assert data["profile"].bio == "Lập trình viên test"
    assert len(data["preferences"]) == 2
    assert data["preferences"][0].tag_id == 10
    assert data["preferences"][0].weight == 0.8

def test_create_activity_log(db_session: Session, test_user: Users):
    log = create_activity_log(
        db=db_session,
        user_id=test_user.user_id,
        action="LOGIN",
        status="SUCCESS",
        ip_address="127.0.0.1",
        user_agent="Pytest-Client"
    )

    assert log.log_id is not None
    assert log.user_id == test_user.user_id
    assert log.action == "LOGIN"
    assert log.status == "SUCCESS"
    assert log.ip_address == "127.0.0.1"
    assert log.user_agent == "Pytest-Client"
