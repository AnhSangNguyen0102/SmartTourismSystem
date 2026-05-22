import enum
import secrets
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional, List
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from database import get_session
from core.security import verify_token
from models import (
    Users,
    EnterpriseProfiles,
    EnterpriseEvents,
    EnterpriseEventQR,
    RarityEnum,
    QuestTypeEnum
)

router = APIRouter(tags=["Enterprise - Event Management"])

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_enterprise_profile(current_user: dict, db: Session) -> EnterpriseProfiles:
    sub = current_user.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Xác thực không hợp lệ")
        
    # Get user
    try:
        user_uuid = UUID(sub)
        user = db.get(Users, user_uuid)
    except ValueError:
        user = db.exec(select(Users).where(Users.email == sub)).first()
        
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
        
    role_str = getattr(user.role, 'value', user.role)
    if role_str != "ENTERPRISE":
        raise HTTPException(status_code=403, detail="Chỉ dành cho tài khoản Doanh nghiệp")
        
    enterprise = db.exec(select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user.user_id)).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Chưa đăng ký thông tin hồ sơ doanh nghiệp")
        
    return enterprise

# ============================================================
# API ENDPOINTS
# ============================================================

@router.post("/api/enterprise/events")
def create_enterprise_event(
    event_data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Doanh nghiệp đăng ký sự kiện động ẩn."""
    enterprise = get_enterprise_profile(current_user, db)
    
    title = event_data.get("title")
    description = event_data.get("description")
    quest_type = event_data.get("quest_type", "CHECKIN")
    lat = event_data.get("latitude")
    lng = event_data.get("longitude")
    radius_meters = event_data.get("radius_meters", 100)
    reward_exp = event_data.get("reward_exp", 100)
    reward_coin = event_data.get("reward_coin", 50)
    rarity = event_data.get("rarity", "COMMON")
    start_time_str = event_data.get("start_time")
    end_time_str = event_data.get("end_time")
    
    if not all([title, description, lat is not None, lng is not None, start_time_str, end_time_str]):
        raise HTTPException(status_code=400, detail="Vui lòng điền đầy đủ các thông tin bắt buộc")
        
    try:
        start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00")).replace(tzinfo=None)
        end_time = datetime.fromisoformat(end_time_str.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(status_code=400, detail="Định dạng thời gian không hợp lệ. Sử dụng ISO 8601 (YYYY-MM-DDTHH:MM:SS)")
        
    # Map rarity string to enum
    try:
        rarity_enum = RarityEnum(rarity.upper())
    except ValueError:
        rarity_enum = RarityEnum.COMMON
        
    # Map quest_type string to enum
    try:
        quest_type_enum = QuestTypeEnum(quest_type.upper())
    except ValueError:
        quest_type_enum = QuestTypeEnum.CHECKIN
        
    # Multiplier based on rarity
    rarity_multipliers = {
        RarityEnum.COMMON: 1,
        RarityEnum.RARE: 2,
        RarityEnum.EPIC: 3,
        RarityEnum.LEGENDARY: 5
    }
    multiplier = rarity_multipliers.get(rarity_enum, 1)
    
    # Save event
    new_event = EnterpriseEvents(
        enterprise_id=enterprise.enterprise_id,
        title=title,
        description=description,
        quest_type=quest_type_enum,
        latitude=Decimal(str(lat)),
        longitude=Decimal(str(lng)),
        radius_meters=int(radius_meters),
        reward_exp=int(reward_exp),
        reward_coin=int(reward_coin),
        multiplier=multiplier,
        rarity=rarity_enum,
        start_time=start_time,
        end_time=end_time,
        is_active=True
    )
    
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    
    # If quest type is QR, auto-generate a scan token
    qr_data = None
    if quest_type_enum == QuestTypeEnum.QR:
        qr_token = f"EVT-{new_event.event_id.hex[:6].upper()}-{secrets.token_hex(4).upper()}"
        qr_entry = EnterpriseEventQR(
            event_id=new_event.event_id,
            qr_token=qr_token,
            max_scans=event_data.get("max_scans", 100),
            scanned_count=0
        )
        db.add(qr_entry)
        db.commit()
        db.refresh(qr_entry)
        qr_data = {
            "qr_id": str(qr_entry.qr_id),
            "qr_token": qr_entry.qr_token,
            "max_scans": qr_entry.max_scans
        }
        
    return {
        "status": "ok",
        "message": "Đăng ký sự kiện thành công",
        "event_id": str(new_event.event_id),
        "qr": qr_data
    }

@router.get("/api/enterprise/events", response_model=List[dict])
def get_enterprise_events(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Lấy danh sách các sự kiện do doanh nghiệp sở hữu tạo ra."""
    enterprise = get_enterprise_profile(current_user, db)
    
    events = db.exec(
        select(EnterpriseEvents)
        .where(EnterpriseEvents.enterprise_id == enterprise.enterprise_id)
        .order_by(EnterpriseEvents.created_at.desc())
    ).all()
    
    result = []
    for ev in events:
        qr_entry = db.exec(
            select(EnterpriseEventQR).where(EnterpriseEventQR.event_id == ev.event_id)
        ).first()
        
        result.append({
            "event_id": str(ev.event_id),
            "title": ev.title,
            "description": ev.description,
            "quest_type": ev.quest_type.value,
            "latitude": float(ev.latitude),
            "longitude": float(ev.longitude),
            "radius_meters": ev.radius_meters,
            "reward_exp": ev.reward_exp,
            "reward_coin": ev.reward_coin,
            "rarity": ev.rarity.value,
            "multiplier": ev.multiplier,
            "start_time": ev.start_time.isoformat(),
            "end_time": ev.end_time.isoformat(),
            "is_active": ev.is_active,
            "qr_token": qr_entry.qr_token if qr_entry else None,
            "scanned_count": qr_entry.scanned_count if qr_entry else 0,
            "max_scans": qr_entry.max_scans if qr_entry else 0
        })
        
    return result

@router.delete("/api/enterprise/events/{event_id}")
def delete_enterprise_event(
    event_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Hủy kích hoạt hoặc xóa sự kiện doanh nghiệp."""
    enterprise = get_enterprise_profile(current_user, db)
    
    event = db.get(EnterpriseEvents, UUID(event_id))
    if not event or event.enterprise_id != enterprise.enterprise_id:
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại hoặc bạn không có quyền sửa đổi")
        
    # Toggle active off
    event.is_active = False
    db.add(event)
    
    # Cancel all active spawns associated with this event
    active_spawns = db.exec(
        select(PlayerHiddenTasks)
        .where(PlayerHiddenTasks.target_id == event.event_id)
        .where(PlayerHiddenTasks.status == SpawnStatusEnum.ACTIVE)
    ).all()
    for spawn in active_spawns:
        spawn.status = SpawnStatusEnum.EXPIRED
        db.add(spawn)
        
    db.commit()
    return {"status": "ok", "message": "Hủy sự kiện thành công"}
