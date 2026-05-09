"""
================================================================================
 crud/crud_enterprise.py  │  USE CASE: Đăng ký doanh nghiệp & Duyệt hồ sơ
================================================================================
 Q   Op      Table(s)               Function
 ──  ──────  ─────────────────────  ──────────────────────────────────
 Q1  INSERT  ENTERPRISE_PROFILES    create_enterprise_profile
 Q2  SELECT  ENTERPRISE_PROFILES    get_pending_enterprise_profiles
 Q3  UPDATE  ENTERPRISE_PROFILES    update_enterprise_status
 Q4  INSERT  VERIFICATION_LOGS      create_verification_log
================================================================================
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

# pyrefly: ignore [missing-import]
from sqlmodel import Session, select

from models import (
    EnterpriseProfiles,
    EnterpriseStatus,
    VerificationLogs,
    VerificationAction,
    BusinessLocation,
)


# ---------------------------------------------------------------------------
# Q1 – Lưu hồ sơ doanh nghiệp  (INSERT INTO enterprise_profiles)
# ---------------------------------------------------------------------------

def create_enterprise_profile(
    db: Session,
    *,
    user_id: UUID,
    business_name: str,
    contact_person: str,
    contact_email: str,
    contact_phone: str,
    status: EnterpriseStatus = EnterpriseStatus.PENDING,
) -> EnterpriseProfiles:
    """
    Tạo bản ghi ``enterprise_profiles`` khi user đăng ký tài khoản doanh nghiệp.

    ``status`` mặc định là ``PENDING`` — chờ Admin xét duyệt.
    Tự động sinh ``enterprise_id`` (UUID v4), ``created_at``, ``updated_at``.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    profile = EnterpriseProfiles(
        enterprise_id=uuid4(),
        user_id=user_id,
        business_name=business_name,
        contact_person=contact_person,
        contact_email=contact_email,
        contact_phone=contact_phone,
        status=status,
        created_at=now,
        updated_at=now,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


# ---------------------------------------------------------------------------
# Q2 – Lấy danh sách hồ sơ đang chờ duyệt
#       (SELECT enterprise_profiles WHERE status = 'PENDING')
# ---------------------------------------------------------------------------

def get_pending_enterprise_profiles(db: Session) -> list[EnterpriseProfiles]:
    """
    Trả về danh sách tất cả ``enterprise_profiles`` có ``status = PENDING``,
    sắp xếp theo ``created_at`` tăng dần (hồ sơ cũ nhất ưu tiên trước).

    Dùng cho màn hình Admin xét duyệt doanh nghiệp.
    """
    statement = (
        select(EnterpriseProfiles)
        .where(EnterpriseProfiles.status == EnterpriseStatus.PENDING)
        .order_by(EnterpriseProfiles.created_at.asc())
    )
    return db.exec(statement).all()


# ---------------------------------------------------------------------------
# Q3 – Cập nhật trạng thái hồ sơ doanh nghiệp
#       (UPDATE enterprise_profiles SET status WHERE enterprise_id = ?)
# ---------------------------------------------------------------------------

def update_enterprise_status(
    db: Session,
    enterprise_id: UUID,
    new_status: EnterpriseStatus,
) -> Optional[EnterpriseProfiles]:
    """
    Cập nhật ``status`` hồ sơ doanh nghiệp (PENDING → ACTIVE hoặc REJECTED).

    Trả về bản ghi sau cập nhật, hoặc ``None`` nếu không tìm thấy.
    """
    row = db.exec(
        select(EnterpriseProfiles).where(
            EnterpriseProfiles.enterprise_id == enterprise_id
        )
    ).first()
    if row is None:
        return None

    row.status = new_status
    row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Q4 – Ghi log hành động duyệt/từ chối của Admin
#       (INSERT INTO verification_logs)
# ---------------------------------------------------------------------------

def create_verification_log(
    db: Session,
    *,
    enterprise_id: UUID,
    admin_id: UUID,
    action: VerificationAction,
    reason: Optional[str] = None,
) -> VerificationLogs:
    """
    Ghi lại hành động Admin đã thực hiện (APPROVE / REJECT) với hồ sơ doanh nghiệp.

    Parameters
    ----------
    enterprise_id : UUID
        Hồ sơ doanh nghiệp được xét duyệt.
    admin_id : UUID
        User (role=ADMIN) thực hiện hành động.
    action : VerificationAction
        ``APPROVE`` hoặc ``REJECT``.
    reason : str | None
        Lý do từ chối (bắt buộc khi REJECT, tuỳ chọn khi APPROVE).
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    log = VerificationLogs(
        enterprise_id=enterprise_id,
        admin_id=admin_id,
        action=action,
        reason=reason,
        created_at=now,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ---------------------------------------------------------------------------
# Q5 – Lấy địa điểm kinh doanh (SELECT business_location)
# ---------------------------------------------------------------------------

def get_business_locations(
    db: Session,
    enterprise_id: UUID
) -> list[BusinessLocation]:
    """
    Lấy danh sách các địa điểm thuộc quyền quản lý của doanh nghiệp.
    """
    statement = select(BusinessLocation).where(BusinessLocation.business_id == enterprise_id)
    return db.exec(statement).all()
