"""
================================================================================
 crud/crud_user.py  │  USE CASE: Quản lý User, Sở thích & KYC
================================================================================
 Q    Op      Table(s)                         Function
 ───  ──────  ───────────────────────────────  ────────────────────────────────
 Q1   SELECT  USERS                            get_user_by_email
 Q2   INSERT  USERS                            create_user
 Q3   SELECT  PREFERENCE_TAG_WEIGHTS           get_user_tag_weights
 Q4   UPSERT  PREFERENCE_TAG_WEIGHTS           update_user_tag_weights
 Q5   SELECT  CATEGORY_VISIT_HISTORY           get_user_category_history
 Q6   UPSERT  CATEGORY_VISIT_HISTORY           update_category_visit_history
 Q7   SELECT  PLANNING_SESSIONS                get_user_avg_budget
 Q8   UPDATE  USERS                            update_user_status
 Q9   INSERT  USER_PROFILES                    create_user_profile
 Q10  UPDATE  USERS                            update_user_role
 Q11  UPDATE  USER_PROFILES                    update_user_profile
 Q12  UPDATE  USER_PROFILES                    update_user_kyc_status
================================================================================
"""

from datetime import datetime, timezone
from decimal import Decimal
from datetime import date
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Session, select, func

from core.security import get_password_hash
from models import (
    Users,
    UserProfiles,
    RegisterType,
    UserRole,
    UserStatus,
    GenderEnum,
    TravelStyle,
    PrivacyStatus,
    KycStatus,
    PreferenceTagWeights,
    CategoryVisitHistory,
    PlanningSessions,
    PlanningStatus,
)
from schemas import UserCreate


# ---------------------------------------------------------------------------
# Q1 – Tìm user theo email  (SELECT users WHERE email = ?)
# ---------------------------------------------------------------------------

def get_user_by_email(db: Session, email: str) -> Optional[Users]:
    """
    Lấy bản ghi ``Users`` khớp với *email*.

    Trả về ``None`` nếu không tìm thấy.
    Columns trả về: user_id, email, passwordhash, role, status.
    """
    statement = (
        select(
            Users.user_id,
            Users.email,
            Users.passwordhash,
            Users.role,
            Users.status,
        )
        .where(Users.email == email)
    )
    return db.exec(statement).first()


# ---------------------------------------------------------------------------
# Q2 – Tạo tài khoản mới  (INSERT INTO users)
# ---------------------------------------------------------------------------

def create_user(
    db: Session,
    *,
    full_name: str,
    email: str,
    password: str,
    social_id: Optional[str] = None,
    register_type: RegisterType = RegisterType.EMAIL,
    role: UserRole = UserRole.USER,
    status: UserStatus = UserStatus.PENDING,
) -> Users:
    """
    Tạo tài khoản mới và lưu vào bảng ``users``.

    - Hash plain-text password trước khi lưu.
    - Tự động sinh ``user_id`` (UUID v4), ``create_at``, ``update_at``.

    Parameters
    ----------
    password : str
        Mật khẩu plain-text — sẽ được hash ngay trước khi INSERT.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db_user = Users(
        user_id=uuid4(),
        full_name=full_name,
        email=email,
        passwordhash=get_password_hash(password),
        social_id=social_id,
        register_type=register_type,
        role=role,
        status=status,
        create_at=now,
        update_at=now,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# ---------------------------------------------------------------------------
# Q3 – Lấy trọng số tag của user  (SELECT preference_tag_weights WHERE user_id = ?)
# ---------------------------------------------------------------------------

def get_user_tag_weights(
    db: Session, user_id: UUID
) -> list[PreferenceTagWeights]:
    """
    Lấy danh sách ``PreferenceTagWeights`` của *user_id*, sắp xếp theo
    weight giảm dần — phục vụ chấm điểm gợi ý.

    Columns trả về: tag_id, weight, update_at.
    """
    statement = (
        select(
            PreferenceTagWeights.tag_id,
            PreferenceTagWeights.weight,
            PreferenceTagWeights.update_at,
        )
        .where(PreferenceTagWeights.user_id == user_id)
        .order_by(PreferenceTagWeights.weight.desc())
    )
    return db.exec(statement).all()


# ---------------------------------------------------------------------------
# Q4 – Cập nhật trọng số tag  (UPDATE preference_tag_weights)
# ---------------------------------------------------------------------------

def update_user_tag_weights(
    db: Session,
    user_id: UUID,
    tag_id: int,
    new_weight: float,
) -> Optional[PreferenceTagWeights]:
    """
    Cập nhật ``weight`` và ``update_at`` cho cặp (user_id, tag_id).

    Nếu bản ghi chưa tồn tại thì INSERT mới.
    Trả về bản ghi sau khi cập nhật, hoặc ``None`` nếu thất bại.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    statement = select(PreferenceTagWeights).where(
        PreferenceTagWeights.user_id == user_id,
        PreferenceTagWeights.tag_id == tag_id,
    )
    row = db.exec(statement).first()

    if row is None:
        # INSERT nếu chưa có bản ghi
        row = PreferenceTagWeights(
            user_id=user_id,
            tag_id=tag_id,
            weight=new_weight,
            update_at=now,
        )
    else:
        row.weight = new_weight
        row.update_at = now

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Q5 – Lấy lịch sử ghé thăm category  (SELECT category_visit_history WHERE user_id = ?)
# ---------------------------------------------------------------------------

def get_user_category_history(
    db: Session, user_id: UUID
) -> list[CategoryVisitHistory]:
    """
    Lấy lịch sử ghé thăm category của *user_id*, sắp xếp theo
    visit_count giảm dần — phục vụ chấm điểm gợi ý.

    Columns trả về: category_id, visit_count, last_visit.
    """
    statement = (
        select(
            CategoryVisitHistory.category_id,
            CategoryVisitHistory.visit_count,
            CategoryVisitHistory.last_visit,
        )
        .where(CategoryVisitHistory.user_id == user_id)
        .order_by(CategoryVisitHistory.visit_count.desc())
    )
    return db.exec(statement).all()


# ---------------------------------------------------------------------------
# Q6 – Cập nhật lịch sử ghé thăm category  (UPDATE category_visit_history)
# ---------------------------------------------------------------------------

def update_category_visit_history(
    db: Session,
    user_id: UUID,
    category_id: int,
    increment: int = 1,
) -> CategoryVisitHistory:
    """
    Tăng ``visit_count`` thêm *increment* và cập nhật ``last_visit`` cho
    cặp (user_id, category_id).

    Nếu bản ghi chưa tồn tại thì INSERT mới với visit_count = increment.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    statement = select(CategoryVisitHistory).where(
        CategoryVisitHistory.user_id == user_id,
        CategoryVisitHistory.category_id == category_id,
    )
    row = db.exec(statement).first()

    if row is None:
        row = CategoryVisitHistory(
            user_id=user_id,
            category_id=category_id,
            visit_count=increment,
            last_visit=now,
        )
    else:
        row.visit_count = row.visit_count + increment
        row.last_visit = now

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Q7 – Lấy ngân sách trung bình  (SELECT AVG(budget) FROM planning_sessions)
# ---------------------------------------------------------------------------

def get_user_avg_budget(
    db: Session, user_id: UUID
) -> Optional[Decimal]:
    """
    Tính ngân sách trung bình (AVG budget) từ các phiên đã CONFIRMED của *user_id*.

    Trả về ``None`` nếu user chưa có phiên nào được xác nhận.
    """
    statement = (
        select(func.avg(PlanningSessions.budget))
        .where(
            PlanningSessions.user_id == user_id,
            PlanningSessions.status == PlanningStatus.CONFIRMED,
        )
    )
    return db.exec(statement).one_or_none()


# ---------------------------------------------------------------------------
# Q8 – Cập nhật trạng thái user  (UPDATE users SET status WHERE user_id = ?)
# ---------------------------------------------------------------------------

def update_user_status(
    db: Session,
    user_id: UUID,
    new_status: UserStatus,
) -> Optional[Users]:
    """
    Cập nhật ``status`` của user (ví dụ PENDING → ACTIVE sau khi xác minh email).

    Trả về bản ghi sau cập nhật, hoặc ``None`` nếu không tìm thấy.
    """
    row = db.exec(select(Users).where(Users.user_id == user_id)).first()
    if row is None:
        return None
    row.status = new_status
    row.update_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Q9 – Tạo bản ghi profile trống  (INSERT INTO user_profiles)
# ---------------------------------------------------------------------------

def create_user_profile(
    db: Session,
    *,
    user_id: UUID,
    full_name: str,
    date_of_birth: date,
    gender: GenderEnum,
    avatar_url: Optional[str] = None,
    bio: Optional[str] = None,
    base_location: Optional[str] = None,
    travel_style: Optional[TravelStyle] = None,
    privacy_status: PrivacyStatus = PrivacyStatus.PUBLIC,
) -> UserProfiles:
    """
    Tạo bản ghi ``user_profiles`` ngay sau khi user đăng ký thành công.

    Các trường KYC (identity_doc_url, selfie_url, kyc_status) mặc định là
    ``None`` / ``UNVERIFIED`` và sẽ được điền sau.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    profile = UserProfiles(
        user_id=user_id,
        full_name=full_name,
        date_of_birth=date_of_birth,
        gender=gender,
        avatar_url=avatar_url,
        bio=bio,
        base_location=base_location,
        travel_style=travel_style,
        privacy_status=privacy_status,
        updated_at=now,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


# ---------------------------------------------------------------------------
# Q10 – Nâng cấp role user  (UPDATE users SET role WHERE user_id = ?)
# ---------------------------------------------------------------------------

def update_user_role(
    db: Session,
    user_id: UUID,
    new_role: UserRole,
) -> Optional[Users]:
    """
    Nâng cấp ``role`` của user (ví dụ USER → ENTERPRISE sau khi duyệt hồ sơ DN).

    Trả về bản ghi sau cập nhật, hoặc ``None`` nếu không tìm thấy.
    """
    row = db.exec(select(Users).where(Users.user_id == user_id)).first()
    if row is None:
        return None
    row.role = new_role
    row.update_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Q11 – Cập nhật thông tin profile  (UPDATE user_profiles WHERE user_id = ?)
# ---------------------------------------------------------------------------

def update_user_profile(
    db: Session,
    user_id: UUID,
    *,
    avatar_url: Optional[str] = None,
    bio: Optional[str] = None,
    base_location: Optional[str] = None,
    travel_style: Optional[TravelStyle] = None,
    privacy_status: Optional[PrivacyStatus] = None,
    identity_doc_url: Optional[str] = None,
    selfie_url: Optional[str] = None,
) -> Optional[UserProfiles]:
    """
    Cập nhật thông tin profile của user — chỉ ghi đè các field được truyền vào
    (truthy check; ``None`` nghĩa là "không thay đổi field đó").

    Columns có thể cập nhật:
        avatar_url, bio, base_location, travel_style, privacy_status,
        identity_doc_url, selfie_url.
    """
    row = db.exec(
        select(UserProfiles).where(UserProfiles.user_id == user_id)
    ).first()
    if row is None:
        return None

    if avatar_url is not None:
        row.avatar_url = avatar_url
    if bio is not None:
        row.bio = bio
    if base_location is not None:
        row.base_location = base_location
    if travel_style is not None:
        row.travel_style = travel_style
    if privacy_status is not None:
        row.privacy_status = privacy_status
    if identity_doc_url is not None:
        row.identity_doc_url = identity_doc_url
    if selfie_url is not None:
        row.selfie_url = selfie_url

    row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Q12 – Cập nhật kyc_status  (UPDATE user_profiles SET kyc_status WHERE user_id = ?)
# ---------------------------------------------------------------------------

def update_user_kyc_status(
    db: Session,
    user_id: UUID,
    new_kyc_status: KycStatus,
) -> Optional[UserProfiles]:
    """
    Cập nhật ``kyc_status`` của profile người dùng.

    Luồng thông thường: UNVERIFIED → PENDING (khi user nộp giấy tờ)
    → APPROVED hoặc REJECTED (sau khi admin xét duyệt).

    Trả về bản ghi sau cập nhật, hoặc ``None`` nếu không tìm thấy.
    """
    row = db.exec(
        select(UserProfiles).where(UserProfiles.user_id == user_id)
    ).first()
    if row is None:
        return None
    row.kyc_status = new_kyc_status
    row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
