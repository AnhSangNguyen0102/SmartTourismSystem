"""
================================================================================
 crud/crud_auth.py  │  USE CASE: Đăng nhập & Kiểm soát thiết bị
================================================================================
 Q   Op      Table(s)                                  Function
 ──  ──────  ────────────────────────────────────────  ─────────────────────────────────────
 Q1  SELECT  USERS                                     get_user_by_email
 Q2  SELECT  USER_SESSIONS                             get_active_sessions_count
 Q2  SELECT  USER_SESSIONS                             get_active_sessions
 Q2  SELECT  USER_SESSIONS                             get_session_by_device
 Q3  UPDATE  USER_SESSIONS                             revoke_oldest_sessions
 Q3  UPDATE  USER_SESSIONS                             revoke_session_by_device
 Q3  UPDATE  USER_SESSIONS                             revoke_all_sessions
 Q4  INSERT  USER_SESSIONS                             create_user_session
 Q5  SELECT  USER_PROFILES, PREFERENCE_TAG_WEIGHTS     get_user_profile_with_preferences
================================================================================
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select, func

from models import Users, UserSessions, UserProfiles, PreferenceTagWeights, ActivityLog


# ---------------------------------------------------------------------------
# Q1 – Truy vấn tài khoản theo email  (SELECT users)
# ---------------------------------------------------------------------------

def get_user_by_email(db: Session, email: str) -> Optional[Users]:
    """
    Lấy bản ghi Users duy nhất khớp với *email*.
    Trả về ``None`` nếu không tìm thấy.
    """
    statement = select(Users).where(Users.email == email)
    return db.exec(statement).first()


# ---------------------------------------------------------------------------
# Q2 – Kiểm tra số session đang active  (SELECT user_sessions)
# ---------------------------------------------------------------------------

def get_active_sessions_count(db: Session, user_id: UUID) -> int:
    """
    Đếm số session của *user_id* mà:
    - ``is_revoked = FALSE``
    - ``expires_at > NOW()``
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    statement = select(func.count(UserSessions.session_id)).where(
        UserSessions.user_id == user_id,
        UserSessions.is_revoked == False,
        UserSessions.expires_at > now,
    )
    return db.exec(statement).one()


def get_active_sessions(db: Session, user_id: UUID) -> list[UserSessions]:
    """
    Lấy toàn bộ session đang active của *user_id*, sắp xếp mới nhất trước.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    statement = (
        select(UserSessions)
        .where(
            UserSessions.user_id == user_id,
            UserSessions.is_revoked == False,
            UserSessions.expires_at > now,
        )
        .order_by(UserSessions.created_at.desc())
    )
    return db.exec(statement).all()


def get_session_by_device(
    db: Session, user_id: UUID, device_id: str
) -> Optional[UserSessions]:
    """
    Tìm session active cho một thiết bị cụ thể.
    Dùng để kiểm tra thiết bị đã đăng nhập chưa.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    statement = select(UserSessions).where(
        UserSessions.user_id == user_id,
        UserSessions.device_id == device_id,
        UserSessions.is_revoked == False,
        UserSessions.expires_at > now,
    )
    return db.exec(statement).first()


# ---------------------------------------------------------------------------
# Q3 – Thu hồi session cũ nếu vượt limit  (UPDATE user_sessions)
# ---------------------------------------------------------------------------

def revoke_oldest_sessions(
    db: Session, user_id: UUID, keep_limit: int = 3
) -> int:
    """
    Đặt ``is_revoked = TRUE`` cho các session cũ nhất vượt quá *keep_limit*.

    Parameters
    ----------
    keep_limit : int
        Số lượng session mới nhất được giữ lại (mặc định 3).

    Returns
    -------
    int
        Số session bị thu hồi.
    """
    active = get_active_sessions(db, user_id)

    if len(active) <= keep_limit:
        return 0

    to_revoke = active[keep_limit:]          # Các session cũ vượt limit
    for session in to_revoke:
        session.is_revoked = True
        db.add(session)
    db.commit()
    return len(to_revoke)


def revoke_session_by_device(
    db: Session, user_id: UUID, device_id: str
) -> bool:
    """
    Thu hồi session của một thiết bị cụ thể (yêu cầu đăng xuất nơi khác).

    Returns
    -------
    bool
        ``True`` nếu tìm thấy và thu hồi, ``False`` nếu không tìm thấy.
    """
    session = get_session_by_device(db, user_id, device_id)
    if session is None:
        return False
    session.is_revoked = True
    db.add(session)
    db.commit()
    return True


def revoke_all_sessions(db: Session, user_id: UUID) -> int:
    """
    Thu hồi toàn bộ session active (dùng khi đổi mật khẩu / bị khóa tài khoản).

    Returns
    -------
    int
        Số session bị thu hồi.
    """
    active = get_active_sessions(db, user_id)
    for session in active:
        session.is_revoked = True
        db.add(session)
    db.commit()
    return len(active)


# ---------------------------------------------------------------------------
# Q4 – Tạo session mới  (INSERT user_sessions)
# ---------------------------------------------------------------------------

def create_user_session(
    db: Session,
    user_id: UUID,
    device_id: str,
    refresh_token_hash: str,
    expires_at: datetime,
) -> UserSessions:
    """
    Tạo bản ghi session mới lưu refresh-token hash và device_id.

    Parameters
    ----------
    refresh_token_hash : str
        Hash (bcrypt / SHA-256) của refresh token — **không** lưu plaintext.
    expires_at : datetime
        Thời điểm hết hạn của session (naive UTC).
    """
    db_session = UserSessions(
        user_id=user_id,
        device_id=device_id,
        refresh_token_hash=refresh_token_hash,
        expires_at=expires_at,
        is_revoked=False,
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


# ---------------------------------------------------------------------------
# Q5 – Lấy profile cơ bản + Preferences  (SELECT user_profiles + preference_tag_weights)
# ---------------------------------------------------------------------------

def get_user_profile_with_preferences(
    db: Session, user_id: UUID
) -> dict:
    """
    Lấy thông tin hiển thị sau khi đăng nhập thành công:
    - ``user_profiles`` : avatar_url, full_name, privacy_status, …
    - ``preference_tag_weights`` : danh sách tag + weight cá nhân hoá.

    Returns
    -------
    dict
        ``{"profile": UserProfiles | None, "preferences": list[PreferenceTagWeights]}``
    """
    profile = db.exec(
        select(UserProfiles).where(UserProfiles.user_id == user_id)
    ).first()

    preferences = db.exec(
        select(PreferenceTagWeights).where(PreferenceTagWeights.user_id == user_id)
    ).all()

    return {
        "profile": profile,
        "preferences": preferences,
    }


# ---------------------------------------------------------------------------
# Q6 – Tìm session bằng refresh token  (SELECT user_sessions)
# ---------------------------------------------------------------------------

def get_session_by_refresh_token(
    db: Session, refresh_token_hash: str
) -> Optional[UserSessions]:
    """
    Lấy bản ghi session khớp với refresh_token_hash.
    Trả về None nếu không tìm thấy.
    """
    statement = (
        select(UserSessions)
        .where(UserSessions.refresh_token_hash == refresh_token_hash)
        .where(UserSessions.is_revoked == False)
    )
    return db.exec(statement).first()


# ---------------------------------------------------------------------------
# Q7 – Cập nhật refresh token  (UPDATE user_sessions)
# ---------------------------------------------------------------------------

def update_session_token(
    db: Session, session_id: UUID, new_refresh_token_hash: str
) -> Optional[UserSessions]:
    """
    Cập nhật refresh token hash mới (Rotate token) cho session.
    """
    session = db.get(UserSessions, session_id)
    if session:
        session.refresh_token_hash = new_refresh_token_hash
        db.add(session)
        db.commit()
        db.refresh(session)
    return session


# ---------------------------------------------------------------------------
# Q8 – Ghi nhật ký hệ thống  (INSERT activity_log)
# ---------------------------------------------------------------------------

def create_activity_log(
    db: Session,
    user_id: UUID,
    action: str,
    status: str = "SUCCESS",
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
) -> ActivityLog:
    """
    Ghi nhật ký hoạt động (Audit log) của user mỗi lần đăng nhập/đăng xuất.
    """
    log = ActivityLog(
        user_id=user_id,
        action=action,
        status=status,
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
