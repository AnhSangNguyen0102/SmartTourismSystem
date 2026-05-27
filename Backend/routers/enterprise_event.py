import secrets
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from core.security import verify_token
from database import get_session
from models import (
    EnterpriseEventQR,
    EnterpriseEvents,
    EnterpriseProfiles,
    EnterpriseStatus,
    HiddenEventParticipants,
    PlayerHiddenTasks,
    QuestTypeEnum,
    RarityEnum,
    SpawnStatusEnum,
    Users,
)

router = APIRouter(tags=["Enterprise - Event Management"])


def _parse_datetime(value: str, field_name: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except (AttributeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} không đúng định dạng ISO 8601.",
        )


def get_enterprise_profile(current_user: dict, db: Session) -> EnterpriseProfiles:
    sub = current_user.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Xác thực không hợp lệ")

    try:
        user_uuid = UUID(str(sub))
    except ValueError:
        raise HTTPException(status_code=401, detail="Token không chứa user_id hợp lệ")

    user = db.get(Users, user_uuid)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

    role_str = getattr(user.role, "value", user.role)
    if role_str != "ENTERPRISE":
        raise HTTPException(status_code=403, detail="Chỉ dành cho tài khoản doanh nghiệp")

    enterprise = db.exec(
        select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user.user_id)
    ).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Chưa đăng ký hồ sơ doanh nghiệp")
    if enterprise.status != EnterpriseStatus.ACTIVE:
        raise HTTPException(
            status_code=403,
            detail="Hồ sơ doanh nghiệp chưa ACTIVE nên chưa thể quản lý chiến dịch.",
        )
    return enterprise


def _serialize_event(db: Session, event: EnterpriseEvents) -> dict:
    qr_entry = db.exec(
        select(EnterpriseEventQR).where(EnterpriseEventQR.event_id == event.event_id)
    ).first()
    participant_count = db.exec(
        select(func.count(HiddenEventParticipants.participation_id)).where(
            HiddenEventParticipants.event_id == event.event_id
        )
    ).one()
    scanned_count = participant_count or (qr_entry.scanned_count if qr_entry else 0)

    return {
        "event_id": str(event.event_id),
        "title": event.title,
        "description": event.description,
        "quest_type": event.quest_type.value,
        "latitude": float(event.latitude),
        "longitude": float(event.longitude),
        "radius_meters": event.radius_meters,
        "reward_exp": event.reward_exp,
        "reward_coin": event.reward_coin,
        "rarity": event.rarity.value,
        "multiplier": event.multiplier,
        "start_time": event.start_time.isoformat(),
        "end_time": event.end_time.isoformat(),
        "is_active": event.is_active,
        "qr_token": qr_entry.qr_token if qr_entry else None,
        "scanned_count": scanned_count,
        "max_scans": qr_entry.max_scans if qr_entry else 0,
    }


@router.post("/api/enterprise/events")
def create_enterprise_event(
    event_data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session),
):
    enterprise = get_enterprise_profile(current_user, db)

    title = (event_data.get("title") or "").strip()
    description = (event_data.get("description") or "").strip()
    if not title or not description:
        raise HTTPException(status_code=400, detail="Tên và mô tả chiến dịch là bắt buộc.")

    try:
        quest_type = QuestTypeEnum(str(event_data.get("quest_type", "CHECKIN")).upper())
    except ValueError:
        raise HTTPException(status_code=400, detail="quest_type không hợp lệ.")

    try:
        rarity = RarityEnum(str(event_data.get("rarity", "COMMON")).upper())
    except ValueError:
        raise HTTPException(status_code=400, detail="rarity không hợp lệ.")

    start_time = _parse_datetime(event_data.get("start_time"), "start_time")
    end_time = _parse_datetime(event_data.get("end_time"), "end_time")
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time phải nhỏ hơn end_time.")

    try:
        latitude = Decimal(str(event_data["latitude"]))
        longitude = Decimal(str(event_data["longitude"]))
        radius_meters = int(event_data.get("radius_meters", 100))
        reward_exp = int(event_data.get("reward_exp", 100))
        reward_coin = int(event_data.get("reward_coin", 50))
        max_scans = int(event_data.get("max_scans", 100))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Tọa độ, bán kính và phần thưởng phải hợp lệ.")

    if radius_meters < 0 or reward_exp < 0 or reward_coin < 0 or max_scans < 1:
        raise HTTPException(status_code=400, detail="Bán kính/phần thưởng/lượt quét không được âm.")

    rarity_multipliers = {
        RarityEnum.COMMON: 1,
        RarityEnum.RARE: 2,
        RarityEnum.EPIC: 3,
        RarityEnum.LEGENDARY: 5,
    }

    new_event = EnterpriseEvents(
        enterprise_id=enterprise.enterprise_id,
        title=title,
        description=description,
        quest_type=quest_type,
        latitude=latitude,
        longitude=longitude,
        radius_meters=radius_meters,
        reward_exp=reward_exp,
        reward_coin=reward_coin,
        multiplier=rarity_multipliers.get(rarity, 1),
        rarity=rarity,
        start_time=start_time,
        end_time=end_time,
        is_active=True,
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    qr_data = None
    if quest_type == QuestTypeEnum.QR:
        qr_token = f"EVT-{new_event.event_id.hex[:6].upper()}-{secrets.token_hex(4).upper()}"
        qr_entry = EnterpriseEventQR(
            event_id=new_event.event_id,
            qr_token=qr_token,
            max_scans=max_scans,
            scanned_count=0,
        )
        db.add(qr_entry)
        db.commit()
        db.refresh(qr_entry)
        qr_data = {
            "qr_id": str(qr_entry.qr_id),
            "qr_token": qr_entry.qr_token,
            "max_scans": qr_entry.max_scans,
        }

    return {
        "status": "ok",
        "message": "Tạo chiến dịch thành công",
        "event_id": str(new_event.event_id),
        "qr": qr_data,
    }


@router.get("/api/enterprise/events", response_model=list[dict])
def get_enterprise_events(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session),
):
    enterprise = get_enterprise_profile(current_user, db)
    events = db.exec(
        select(EnterpriseEvents)
        .where(EnterpriseEvents.enterprise_id == enterprise.enterprise_id)
        .order_by(EnterpriseEvents.created_at.desc())
    ).all()
    return [_serialize_event(db, event) for event in events]


@router.delete("/api/enterprise/events/{event_id}")
def delete_enterprise_event(
    event_id: UUID,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session),
):
    enterprise = get_enterprise_profile(current_user, db)

    event = db.get(EnterpriseEvents, event_id)
    if not event or event.enterprise_id != enterprise.enterprise_id:
        raise HTTPException(status_code=404, detail="Chiến dịch không tồn tại hoặc không thuộc doanh nghiệp này.")

    event.is_active = False
    db.add(event)

    active_spawns = db.exec(
        select(PlayerHiddenTasks)
        .where(PlayerHiddenTasks.target_id == event.event_id)
        .where(PlayerHiddenTasks.status == SpawnStatusEnum.ACTIVE)
    ).all()
    for spawn in active_spawns:
        spawn.status = SpawnStatusEnum.EXPIRED
        db.add(spawn)

    db.commit()
    return {"status": "ok", "message": "Đã hủy kích hoạt chiến dịch."}


@router.get("/api/enterprise/stats/daily-flow")
def get_enterprise_daily_flow(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session),
):
    enterprise = get_enterprise_profile(current_user, db)
    events = db.exec(
        select(EnterpriseEvents.event_id).where(
            EnterpriseEvents.enterprise_id == enterprise.enterprise_id
        )
    ).all()

    flow_data = {weekday: 0 for weekday in range(7)}
    if events:
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        participants = db.exec(
            select(HiddenEventParticipants).where(
                HiddenEventParticipants.event_id.in_(events),
                HiddenEventParticipants.completed_at >= seven_days_ago,
            )
        ).all()
        for participant in participants:
            flow_data[participant.completed_at.weekday()] += 1

    return [
        {"day": "T2", "count": flow_data[0]},
        {"day": "T3", "count": flow_data[1]},
        {"day": "T4", "count": flow_data[2]},
        {"day": "T5", "count": flow_data[3]},
        {"day": "T6", "count": flow_data[4]},
        {"day": "T7", "count": flow_data[5]},
        {"day": "CN", "count": flow_data[6]},
    ]
