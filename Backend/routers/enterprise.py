from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

import schemas
from core.dependencies import require_admin, require_enterprise_active
from core.security import verify_token
from database import get_session
from models import (
    BusinessLocation,
    EnterpriseProfiles,
    EnterpriseStatus,
    LocationSubmissions,
    Locations,
    UserRole,
    Users,
    VerificationAction,
    VerificationLogs,
)

router = APIRouter(prefix="/enterprise", tags=["Enterprise Accounts"])


def _user_id_from_payload(payload: dict) -> UUID:
    try:
        return UUID(str(payload.get("sub")))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token không hợp lệ")


def _apply_enterprise_verification(
    *,
    db: Session,
    enterprise_id: UUID,
    admin_id: UUID,
    new_status: EnterpriseStatus,
    reason: str | None = None,
) -> EnterpriseProfiles:
    profile = db.exec(
        select(EnterpriseProfiles).where(EnterpriseProfiles.enterprise_id == enterprise_id)
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ doanh nghiệp")
    if profile.status != EnterpriseStatus.PENDING:
        raise HTTPException(status_code=400, detail="Hồ sơ không ở trạng thái chờ duyệt")
    if new_status not in (EnterpriseStatus.ACTIVE, EnterpriseStatus.REJECTED):
        raise HTTPException(status_code=400, detail="Trạng thái cập nhật không hợp lệ")
    if new_status == EnterpriseStatus.REJECTED and not (reason or "").strip():
        raise HTTPException(status_code=400, detail="Lý do từ chối là bắt buộc")

    profile.status = new_status
    profile.updated_at = datetime.utcnow()
    db.add(profile)

    if new_status == EnterpriseStatus.ACTIVE:
        user = db.get(Users, profile.user_id)
        if user:
            user.role = UserRole.ENTERPRISE
            db.add(user)

    db.add(
        VerificationLogs(
            enterprise_id=enterprise_id,
            admin_id=admin_id,
            action=(
                VerificationAction.APPROVE
                if new_status == EnterpriseStatus.ACTIVE
                else VerificationAction.REJECT
            ),
            reason=reason,
        )
    )
    db.commit()
    db.refresh(profile)
    return profile


@router.post("/register-profile", response_model=schemas.EnterpriseProfileResponse)
def submit_enterprise_profile(
    profile_data: schemas.EnterpriseProfileCreate,
    db: Session = Depends(get_session),
    current_user: dict = Depends(verify_token),
):
    user_id = _user_id_from_payload(current_user)
    user = db.get(Users, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    existing = db.exec(
        select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user_id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Tài khoản này đã có hồ sơ doanh nghiệp",
        )

    profile = EnterpriseProfiles(
        user_id=user_id,
        business_name=profile_data.business_name,
        contact_person=profile_data.contact_person,
        contact_email=str(profile_data.contact_email),
        contact_phone=profile_data.contact_phone,
        status=EnterpriseStatus.PENDING,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/profile", response_model=schemas.EnterpriseProfileResponse)
def get_enterprise_profile(
    db: Session = Depends(get_session),
    current_user: dict = Depends(verify_token),
):
    user_id = _user_id_from_payload(current_user)
    profile = db.exec(
        select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user_id)
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Chưa có hồ sơ doanh nghiệp")
    return profile


@router.get("/location-submissions")
def get_my_location_submissions(
    payload: dict = Depends(require_enterprise_active),
    db: Session = Depends(get_session),
):
    enterprise_id = UUID(str(payload["enterprise_id"]))
    submissions = db.exec(
        select(LocationSubmissions)
        .where(LocationSubmissions.enterprise_id == enterprise_id)
        .order_by(LocationSubmissions.created_at.desc())
    ).all()
    return [
        {
            "submission_id": str(sub.submission_id),
            "location_id": str(sub.location_id) if sub.location_id else None,
            "type": sub.type,
            "status": sub.status,
            "created_at": sub.created_at,
            "reviewed_at": sub.reviewed_at,
            "reject_reason": sub.reject_reason,
        }
        for sub in submissions
    ]


@router.get("/locations")
def get_my_enterprise_locations(
    payload: dict = Depends(require_enterprise_active),
    db: Session = Depends(get_session),
):
    enterprise_id = UUID(str(payload["enterprise_id"]))
    rows = db.exec(
        select(Locations)
        .join(BusinessLocation, Locations.location_id == BusinessLocation.location_id)
        .where(BusinessLocation.business_id == enterprise_id)
        .order_by(Locations.create_at.desc())
    ).all()
    return [
        {
            "location_id": str(loc.location_id),
            "location_name": loc.location_name,
            "address": loc.address,
            "latitude": float(loc.latitude),
            "longitude": float(loc.longitude),
            "city_id": loc.city_id,
            "open_time": loc.open_time.isoformat(),
            "close_time": loc.close_time.isoformat(),
            "min_price": float(loc.min_price),
            "max_price": float(loc.max_price),
            "currency": getattr(loc.currency, "value", loc.currency),
            "is_active": loc.is_active,
        }
        for loc in rows
    ]


@router.put("/{enterprise_id}/verify", response_model=schemas.EnterpriseProfileResponse)
def verify_enterprise_profile(
    enterprise_id: UUID,
    action_data: schemas.EnterpriseStatusUpdate,
    db: Session = Depends(get_session),
    current_admin: dict = Depends(require_admin),
):
    return _apply_enterprise_verification(
        db=db,
        enterprise_id=enterprise_id,
        admin_id=UUID(str(current_admin.get("sub"))),
        new_status=action_data.status,
        reason=action_data.reason,
    )
