from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from uuid import UUID, uuid4
from datetime import datetime
import json
from sqlalchemy import func
from typing import List, Optional

import models
from core.security import verify_token

router = APIRouter(prefix="/api/admin", tags=["Admin Tools - Quản trị và kiểm duyệt"])


def check_duplicate_locations(db: Session, name: str, lat: float, lon: float, address: str = None) -> list:
    """Kiểm tra trùng lặp địa điểm dựa trên tên, toạ độ và địa chỉ"""
    warnings = []

    # 1. Kiểm tra trùng tên (case-insensitive)
    same_name = db.exec(
        select(models.Locations).where(
            func.lower(models.Locations.location_name) == name.strip().lower()
        )
    ).first()
    if same_name:
        warnings.append({
            "location_name": same_name.location_name,
            "address": same_name.location_name, # Fallback
            "reasons": ["Trùng tên địa điểm"]
        })

    # 2. Kiểm tra toạ độ quá gần (trong khoảng ~50m ~ 0.0005 độ)
    nearby = db.exec(
        select(models.Locations).where(
            func.abs(models.Locations.latitude - lat) < 0.0005,
            func.abs(models.Locations.longitude - lon) < 0.0005
        )
    ).first()
    if nearby and (same_name is None or nearby.location_id != same_name.location_id):
        warnings.append({
            "location_name": nearby.location_name,
            "address": "Tọa độ quá gần",
            "reasons": ["Tọa độ trùng lặp hoặc rất gần"]
        })

    return warnings


def check_admin_access(current_user: dict = Depends(verify_token), db: Session = Depends(get_session)):
    """Kiểm tra quyền Admin."""
    user_id_str = current_user.get("user_id") or current_user.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Không tìm thấy thông tin user")
        
    try:
        user_uuid = UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="User ID không hợp lệ")

    user = db.exec(select(models.Users).where(models.Users.user_id == user_uuid)).first()

    if not user or user.role != models.UserRole.ADMIN or user.status != models.UserStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập tính năng này.")
    return user


def _parse_time_value(raw_value: str, fallback: str):
    value = raw_value or fallback
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail=f"Định dạng thời gian không hợp lệ: {value}")


def _load_submission_data(sub: models.LocationSubmissions) -> dict:
    try:
        return json.loads(sub.data_json)
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu đề xuất địa điểm không hợp lệ.")


def _get_target_user(db: Session, target_user_id: UUID) -> models.Users:
    user = db.exec(select(models.Users).where(models.Users.user_id == target_user_id)).first()
    if not user or user.status == models.UserStatus.INACTIVE:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    return user


def _revoke_user_sessions(db: Session, user_id: UUID) -> None:
    sessions = db.exec(
        select(models.UserSessions).where(
            models.UserSessions.user_id == user_id,
            models.UserSessions.is_revoked == False,
        )
    ).all()
    for session in sessions:
        session.is_revoked = True
        db.add(session)


def _create_location_from_submission(
    db: Session,
    sub: models.LocationSubmissions,
    data: dict,
) -> models.Locations:
    now = datetime.utcnow()
    location = models.Locations(
        location_id=uuid4(),
        location_name=data.get("location_name", "").strip(),
        address=data.get("address"),
        latitude=data.get("latitude", 0),
        longitude=data.get("longitude", 0),
        city_id=int(data.get("city_id", 1)),
        open_time=_parse_time_value(data.get("open_time"), "08:00:00"),
        close_time=_parse_time_value(data.get("close_time"), "22:00:00"),
        min_price=data.get("min_price", 0),
        max_price=data.get("max_price", 0),
        currency=data.get("currency", "VND"),
        is_active=True,
        create_at=now,
        update_at=now,
    )
    if not location.location_name:
        raise HTTPException(status_code=400, detail="Tên địa điểm trong yêu cầu bị trống.")

    db.add(location)
    db.flush()

    db.add(models.BusinessLocation(business_id=sub.enterprise_id, location_id=location.location_id))

    # Validate categories against existing category_ids to avoid foreign key violations
    category_ids = [int(cid) for cid in (data.get("category_ids") or [])]
    if category_ids:
        existing_categories = db.exec(select(models.Categories.category_id).where(models.Categories.category_id.in_(category_ids))).all()
        valid_category_ids = set(existing_categories)
        for category_id in category_ids:
            if category_id in valid_category_ids:
                db.add(models.LocationCategories(location_id=location.location_id, category_id=category_id))

    # Validate tags against existing tag_ids to avoid foreign key violations
    tag_ids = [int(tid) for tid in (data.get("tag_ids") or [])]
    if tag_ids:
        existing_tags = db.exec(select(models.Tags.tag_id).where(models.Tags.tag_id.in_(tag_ids))).all()
        valid_tag_ids = set(existing_tags)
        for tag_id in tag_ids:
            if tag_id in valid_tag_ids:
                db.add(models.LocationTags(location_id=location.location_id, tag_id=tag_id))

    for index, image_url in enumerate(data.get("images") or [], start=1):
        if image_url:
            db.add(
                models.LocationsImage(
                    location_id=location.location_id,
                    url=image_url,
                    display_order=index,
                )
            )

    return location


@router.post("/reset-ranks")
def reset_all_ranks(admin: models.Users = Depends(check_admin_access), db: Session = Depends(get_session)):
    """Reset toàn bộ điểm và hạng của tất cả người dùng"""
    profiles = db.exec(select(models.UserProfiles)).all()
    for profile in profiles:
        profile.points_balance = 0
        profile.total_points = 0
        db.add(profile)
    db.commit()
    return {"message": "Đã reset toàn bộ thứ hạng server thành công."}


@router.post("/grant-points")
def grant_points(
    data: dict, 
    admin: models.Users = Depends(check_admin_access), 
    db: Session = Depends(get_session)
):
    """Gửi thêm điểm cho một người dùng hoặc tất cả người dùng"""
    target_user_id = data.get("user_id") 
    try:
        amount = int(data.get("amount", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Số điểm phải là số nguyên.")

    if amount <= 0 or amount > 100000:
        raise HTTPException(status_code=400, detail="Số điểm phải nằm trong khoảng 1 đến 100000.")
    
    def update_profile(profile):
        profile.points_balance = (profile.points_balance or 0) + amount
        profile.total_points = (profile.total_points or 0) + amount
        db.add(profile)

    if target_user_id:
        user_uuid = UUID(target_user_id)
        profile = db.exec(select(models.UserProfiles).where(models.UserProfiles.user_id == user_uuid)).first()
        if profile:
            update_profile(profile)
    else:
        profiles = db.exec(select(models.UserProfiles)).all()
        for profile in profiles:
            update_profile(profile)
            
    db.commit()
    return {"message": f"Đã gửi {amount} PTS thành công."}


@router.get("/users")
def get_all_users(admin: models.Users = Depends(check_admin_access), db: Session = Depends(get_session)):
    """Lấy danh sách người dùng đầy đủ cho Admin"""
    stmt = select(models.Users, models.UserProfiles).join(
        models.UserProfiles, models.Users.user_id == models.UserProfiles.user_id, isouter=True
    ).where(
        models.Users.status != models.UserStatus.INACTIVE
    )
    users = db.exec(stmt).all()
    
    return [
        {
            "id": str(u.user_id),
            "name": u.full_name,
            "email": u.email,
            "role": getattr(u.role, "value", u.role),
            "points": p.points_balance if p else 0,
            "total_points": p.total_points if p else 0,
            "rank": p.status if p else None,
            "status": getattr(u.status, "value", u.status),
            "created_at": u.create_at
        } for u, p in users
    ]


@router.patch("/users/{target_user_id}/points")
def update_user_points(
    target_user_id: UUID,
    data: dict,
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session),
):
    """Admin trừ hoặc reset điểm của một người dùng. Điểm không bao giờ xuống dưới 0."""
    _get_target_user(db, target_user_id)
    profile = db.exec(select(models.UserProfiles).where(models.UserProfiles.user_id == target_user_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ người dùng.")

    action = str(data.get("action", "")).lower()
    if action == "deduct":
        try:
            amount = int(data.get("amount", 0))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Số điểm phải là số nguyên.")
        if amount <= 0 or amount > 100000:
            raise HTTPException(status_code=400, detail="Số điểm phải nằm trong khoảng 1 đến 100000.")

        profile.points_balance = max(0, int(profile.points_balance or 0) - amount)
        profile.total_points = max(0, int(profile.total_points or 0) - amount)
    elif action == "reset":
        profile.points_balance = 0
        profile.total_points = 0
    else:
        raise HTTPException(status_code=400, detail="Hành động điểm không hợp lệ.")

    profile.updated_at = datetime.utcnow()
    db.add(profile)
    db.commit()
    return {
        "message": "Đã cập nhật điểm người dùng.",
        "points_balance": profile.points_balance,
        "total_points": profile.total_points,
    }


@router.patch("/users/{target_user_id}/status")
def update_user_status(
    target_user_id: UUID,
    data: dict,
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session),
):
    """Admin khóa hoặc mở khóa tài khoản."""
    target_user = _get_target_user(db, target_user_id)
    if target_user.user_id == admin.user_id:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản admin đang thao tác.")

    action = str(data.get("action", "")).lower()
    if action == "lock":
        target_user.status = models.UserStatus.BANNED
        _revoke_user_sessions(db, target_user.user_id)
    elif action == "unlock":
        target_user.status = models.UserStatus.ACTIVE
    else:
        raise HTTPException(status_code=400, detail="Hành động trạng thái không hợp lệ.")

    target_user.update_at = datetime.utcnow()
    db.add(target_user)
    db.commit()
    return {"message": "Đã cập nhật trạng thái tài khoản.", "status": target_user.status}


@router.delete("/social/posts/{post_id}")
def admin_delete_post(post_id: UUID, admin: models.Users = Depends(check_admin_access), db: Session = Depends(get_session)):
    """Admin xóa bài viết vi phạm"""
    post = db.exec(select(models.SocialPosts).where(models.SocialPosts.post_id == post_id)).first()
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài viết.")
    db.delete(post)
    db.commit()
    return {"message": "Đã xóa bài viết vi phạm."}


@router.get("/social/reports")
def get_reports(admin: models.Users = Depends(check_admin_access), db: Session = Depends(get_session)):
    """Lấy danh sách báo cáo vi phạm"""
    reports = db.exec(
        select(models.UserFeedbacks).where(models.UserFeedbacks.feedback_type == models.FeedbackType.REPORT)
    ).all()
    return reports


@router.get("/stats")
def get_system_stats(admin: models.Users = Depends(check_admin_access), db: Session = Depends(get_session)):
    """Lấy số liệu thống kê toàn hệ thống"""
    total_users = db.query(models.Users).filter(models.Users.status != models.UserStatus.INACTIVE).count()
    total_posts = db.query(models.SocialPosts).count()
    
    # Tính tổng điểm
    total_points = 0
    profiles = db.exec(
        select(models.UserProfiles)
        .join(models.Users, models.Users.user_id == models.UserProfiles.user_id)
        .where(models.Users.status != models.UserStatus.INACTIVE)
    ).all()
    for p in profiles:
        total_points += p.total_points
        
    pending_enterprises = db.query(models.EnterpriseProfiles).filter(
        models.EnterpriseProfiles.status == models.EnterpriseStatus.PENDING
    ).count()
    
    return {
        "total_users": total_users,
        "total_posts": total_posts,
        "total_points_awarded": total_points,
        "pending_enterprises": pending_enterprises
    }


@router.post("/rewards/vouchers")
def create_voucher(data: dict, admin: models.Users = Depends(check_admin_access), db: Session = Depends(get_session)):
    """Admin tạo voucher mới (Stub)"""
    return {"message": "Đã tạo voucher mới thành công (Tính năng Demo)."}


@router.post("/rewards/quests")
def create_quest(data: dict, admin: models.Users = Depends(check_admin_access), db: Session = Depends(get_session)):
    """Admin tạo nhiệm vụ mới (Thêm thành tựu mới vào DB)"""
    new_ach = models.Achievements(
        achievement_id=f"quest_{uuid4().hex[:6]}",
        title=data.get("title", "Nhiệm vụ mới"),
        description=data.get("description", ""),
        points_reward=data.get("reward", 100),
        badge_icon=data.get("icon", "🌟"),
        condition_type="checkin_count",
        condition_value=data.get("target", 1)
    )
    db.add(new_ach)
    db.commit()
    return {"message": "Đã tạo nhiệm vụ mới thành công."}


@router.put("/update-role/{target_user_id}")
def update_user_role(
    target_user_id: UUID,
    role_data: dict,
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session)
):
    """Cập nhật phân quyền người dùng"""
    target_user = _get_target_user(db, target_user_id)
    if target_user.user_id == admin.user_id:
        raise HTTPException(status_code=400, detail="Không thể tự thay đổi role của admin đang thao tác.")
    if target_user.role == models.UserRole.ENTERPRISE:
        raise HTTPException(status_code=400, detail="Không thể đổi role tài khoản ENTERPRISE tại màn này.")
        
    new_role_str = role_data.get("role")
    try:
        new_role = models.UserRole(new_role_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ")
    if new_role not in (models.UserRole.USER, models.UserRole.ADMIN):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ chuyển giữa USER và ADMIN.")

    target_user.role = new_role
    target_user.update_at = datetime.utcnow()
    db.add(target_user)
    db.commit()
    return {"message": f"Đã cập nhật vai trò cho {target_user.full_name} thành {new_role_str}."}


# ==============================================================================
# ENTERPRISE MODERATION
# ==============================================================================

@router.get("/enterprises/pending")
def get_pending_enterprises(
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session)
):
    """Lấy danh sách tài khoản doanh nghiệp đang chờ duyệt"""
    profiles = db.exec(
        select(models.EnterpriseProfiles).where(
            models.EnterpriseProfiles.status == models.EnterpriseStatus.PENDING
        ).order_by(models.EnterpriseProfiles.created_at.asc())
    ).all()
    
    return [
        {
            "enterprise_id": str(p.enterprise_id),
            "user_id": str(p.user_id),
            "business_name": p.business_name,
            "contact_person": p.contact_person,
            "contact_email": p.contact_email,
            "contact_phone": p.contact_phone,
            "created_at": p.created_at
        } for p in profiles
    ]


@router.post("/enterprises/{enterprise_id}/approve")
def approve_enterprise(
    enterprise_id: UUID,
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session)
):
    """Duyệt doanh nghiệp đăng ký tài khoản"""
    profile = db.exec(
        select(models.EnterpriseProfiles).where(
            models.EnterpriseProfiles.enterprise_id == enterprise_id
        )
    ).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ doanh nghiệp.")
    if profile.status != models.EnterpriseStatus.PENDING:
        raise HTTPException(status_code=400, detail="Hồ sơ không ở trạng thái chờ duyệt.")

    profile.status = models.EnterpriseStatus.ACTIVE
    profile.updated_at = datetime.utcnow()
    db.add(profile)
    
    # Nâng cấp vai trò người dùng thành ENTERPRISE
    user = db.exec(select(models.Users).where(models.Users.user_id == profile.user_id)).first()
    if user:
        user.role = models.UserRole.ENTERPRISE
        user.update_at = datetime.utcnow()
        db.add(user)
        
    # Ghi nhật ký
    log = models.VerificationLogs(
        enterprise_id=profile.enterprise_id,
        admin_id=admin.user_id,
        action=models.VerificationAction.APPROVE,
        reason="Duyệt tài khoản doanh nghiệp thành công.",
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()
    
    return {"message": "Đã duyệt doanh nghiệp thành công!"}


@router.post("/enterprises/{enterprise_id}/reject")
def reject_enterprise(
    enterprise_id: UUID,
    req_body: dict,
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session)
):
    """Từ chối doanh nghiệp đăng ký tài khoản"""
    profile = db.exec(
        select(models.EnterpriseProfiles).where(
            models.EnterpriseProfiles.enterprise_id == enterprise_id
        )
    ).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ doanh nghiệp.")
    if profile.status != models.EnterpriseStatus.PENDING:
        raise HTTPException(status_code=400, detail="Hồ sơ không ở trạng thái chờ duyệt.")

    reason = (req_body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Lý do từ chối là bắt buộc.")
    profile.status = models.EnterpriseStatus.REJECTED
    profile.updated_at = datetime.utcnow()
    db.add(profile)
    
    log = models.VerificationLogs(
        enterprise_id=profile.enterprise_id,
        admin_id=admin.user_id,
        action=models.VerificationAction.REJECT,
        reason=reason,
        created_at=datetime.utcnow()
    )
    db.add(log)
    db.commit()
    
    return {"message": "Đã từ chối doanh nghiệp thành công."}


# ==============================================================================
# LOCATION SUBMISSIONS MODERATION
# ==============================================================================

@router.get("/location-submissions")
def get_location_submissions(
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session)
):
    """Lấy danh sách các đề xuất địa điểm chờ duyệt"""
    subs = db.exec(
        select(models.LocationSubmissions).where(
            models.LocationSubmissions.status == "PENDING"
        ).order_by(models.LocationSubmissions.created_at.asc())
    ).all()
    
    result = []
    for sub in subs:
        ep = db.exec(select(models.EnterpriseProfiles).where(models.EnterpriseProfiles.enterprise_id == sub.enterprise_id)).first()
        business_name = ep.business_name if ep else "Doanh nghiệp ẩn danh"
        
        try:
            data = json.loads(sub.data_json)
        except Exception:
            data = {}
            
        result.append({
            "submission_id": str(sub.submission_id),
            "location_id": str(sub.location_id) if sub.location_id else None,
            "enterprise_id": str(sub.enterprise_id),
            "enterprise_name": business_name,
            "type": sub.type,
            "status": sub.status,
            "location_name": data.get("location_name"),
            "address": data.get("address"),
            "created_at": sub.created_at
        })
        
    return result


@router.get("/location-submissions/{submission_id}")
def get_location_submission_detail(
    submission_id: UUID,
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session)
):
    """Xem chi tiết yêu cầu kiểm duyệt địa điểm"""
    sub = db.exec(select(models.LocationSubmissions).where(models.LocationSubmissions.submission_id == submission_id)).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu kiểm duyệt.")
        
    ep = db.exec(select(models.EnterpriseProfiles).where(models.EnterpriseProfiles.enterprise_id == sub.enterprise_id)).first()
    enterprise_info = {
        "enterprise_id": str(ep.enterprise_id),
        "business_name": ep.business_name,
        "contact_person": ep.contact_person,
        "contact_email": ep.contact_email
    } if ep else None
    
    try:
        pending_data = json.loads(sub.data_json)
    except Exception:
        pending_data = {}

    current_data = None
    if sub.location_id:
        loc = db.exec(select(models.Locations).where(models.Locations.location_id == sub.location_id)).first()
        if loc:
            imgs = db.exec(select(models.LocationsImage).where(models.LocationsImage.location_id == loc.location_id).order_by(models.LocationsImage.display_order.asc())).all()
            current_data = {
                "location_name": loc.location_name,
                "latitude": float(loc.latitude),
                "longitude": float(loc.longitude),
                "address": getattr(loc, "address", "Việt Nam"),
                "images": [im.url for im in imgs],
            }

    duplicate_warnings = []
    if sub.status == "PENDING" and pending_data.get("location_name"):
        duplicate_warnings = check_duplicate_locations(
            db=db,
            name=pending_data.get("location_name"),
            lat=pending_data.get("latitude", 0),
            lon=pending_data.get("longitude", 0),
            address=pending_data.get("address"),
        )

    return {
        "submission_id": str(sub.submission_id),
        "location_id": str(sub.location_id) if sub.location_id else None,
        "type": sub.type,
        "status": sub.status,
        "created_at": sub.created_at,
        "reject_reason": sub.reject_reason,
        "enterprise": enterprise_info,
        "pending_data": pending_data,
        "current_data": current_data,
        "duplicate_warnings": duplicate_warnings
    }


@router.post("/location-submissions/{submission_id}/approve")
def approve_location_submission(
    submission_id: UUID,
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session)
):
    """Phê duyệt yêu cầu tạo/sửa địa điểm"""
    sub = db.exec(select(models.LocationSubmissions).where(models.LocationSubmissions.submission_id == submission_id)).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu.")
    if sub.status != "PENDING":
        raise HTTPException(status_code=400, detail="Yêu cầu không ở trạng thái chờ duyệt.")

    try:
        data = _load_submission_data(sub)
        if sub.type == "CREATE":
            location = _create_location_from_submission(db, sub, data)
            sub.location_id = location.location_id

        elif sub.type == "UPDATE" and sub.location_id:
            loc = db.exec(select(models.Locations).where(models.Locations.location_id == sub.location_id)).first()
            if loc:
                loc.location_name = data.get("location_name", loc.location_name)
                loc.address = data.get("address", loc.address)
                loc.latitude = data.get("latitude", loc.latitude)
                loc.longitude = data.get("longitude", loc.longitude)
                loc.city_id = data.get("city_id", loc.city_id)
                if data.get("open_time"):
                    loc.open_time = _parse_time_value(data.get("open_time"), loc.open_time.strftime("%H:%M:%S"))
                if data.get("close_time"):
                    loc.close_time = _parse_time_value(data.get("close_time"), loc.close_time.strftime("%H:%M:%S"))
                loc.min_price = data.get("min_price", loc.min_price)
                loc.max_price = data.get("max_price", loc.max_price)
                loc.currency = data.get("currency", loc.currency)
                loc.update_at = datetime.utcnow()
                db.add(loc)
            else:
                raise HTTPException(status_code=404, detail="Không tìm thấy địa điểm cần cập nhật.")
        else:
            raise HTTPException(status_code=400, detail="Loại yêu cầu địa điểm không được hỗ trợ.")

        sub.status = "APPROVED"
        sub.reviewed_at = datetime.utcnow()
        sub.reviewed_by = admin.user_id
        db.add(sub)
        db.add(
            models.LocationVerificationLogs(
                submission_id=sub.submission_id,
                location_id=sub.location_id,
                admin_id=admin.user_id,
                action="APPROVE",
                reason="Phê duyệt yêu cầu địa điểm.",
            )
        )
        db.commit()
    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Lỗi phê duyệt dữ liệu: {str(e)}")
    return {"message": "Đã phê duyệt địa điểm thành công!"}


@router.post("/location-submissions/{submission_id}/reject")
def reject_location_submission(
    submission_id: UUID,
    req_body: dict,
    admin: models.Users = Depends(check_admin_access),
    db: Session = Depends(get_session)
):
    """Từ chối yêu cầu tạo/sửa địa điểm"""
    sub = db.exec(select(models.LocationSubmissions).where(models.LocationSubmissions.submission_id == submission_id)).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu.")
    if sub.status != "PENDING":
        raise HTTPException(status_code=400, detail="Yêu cầu không ở trạng thái chờ duyệt.")

    reason = (req_body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Lý do từ chối là bắt buộc.")
    sub.status = "REJECTED"
    sub.reject_reason = reason
    sub.reviewed_at = datetime.utcnow()
    sub.reviewed_by = admin.user_id
    
    db.add(sub)
    db.add(
        models.LocationVerificationLogs(
            submission_id=sub.submission_id,
            location_id=sub.location_id,
            admin_id=admin.user_id,
            action="REJECT",
            reason=reason,
        )
    )
    db.commit()
    return {"message": "Đã từ chối yêu cầu kiểm duyệt địa điểm."}
