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
async def create_enterprise_event(
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

    # Phát thông báo WebSocket thời gian thực tới các người chơi ở gần trong vòng 5km
    try:
        from routers.social_quest import manager, player_locations
        from core.spatial_logic import calculate_haversine_distance

        evt_lat = float(new_event.latitude)
        evt_lng = float(new_event.longitude)

        for user_id_str in list(manager.active_connections.keys()):
            if user_id_str in player_locations:
                loc = player_locations[user_id_str]
                u_lat = float(loc.get("lat", 0))
                u_lng = float(loc.get("lng", 0))

                dist = calculate_haversine_distance(u_lat, u_lng, evt_lat, evt_lng)
                if dist <= 5000.0:  # Bán kính gửi tin nhắn là 5km
                    await manager.send_personal_message({
                        "event": "new_campaign",
                        "data": {
                            "event_id": str(new_event.event_id),
                            "title": new_event.title,
                            "description": new_event.description,
                            "quest_type": new_event.quest_type.value,
                            "latitude": float(new_event.latitude),
                            "longitude": float(new_event.longitude),
                            "radius_meters": new_event.radius_meters,
                            "reward_exp": new_event.reward_exp,
                            "reward_coin": new_event.reward_coin,
                            "rarity": new_event.rarity.value,
                            "start_time": new_event.start_time.isoformat(),
                            "end_time": new_event.end_time.isoformat()
                        }
                    }, user_id_str)
    except Exception as ws_err:
        print(f"[Realtime Campaign] Lỗi khi phát WebSocket: {ws_err}")

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


@router.get("/api/v1/campaigns/active", response_model=list[dict])
def get_active_campaigns(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Lấy danh sách tất cả chiến dịch doanh nghiệp đang hoạt động cho người chơi."""
    now = datetime.utcnow()
    events = db.exec(
        select(EnterpriseEvents)
        .where(EnterpriseEvents.is_active == True)
        .where(EnterpriseEvents.start_time <= now)
        .where(EnterpriseEvents.end_time >= now)
    ).all()

    # Chỉ trả về những chiến dịch mà người chơi chưa hoàn thành
    from routers.hidden_quest import get_db_user
    user = get_db_user(current_user, db)

    result = []
    for event in events:
        participated = db.exec(
            select(HiddenEventParticipants)
            .where(HiddenEventParticipants.user_id == user.user_id)
            .where(HiddenEventParticipants.event_id == event.event_id)
        ).first()
        if not participated:
            result.append(_serialize_event(db, event))

    return result


@router.post("/api/v1/campaigns/verify")
def verify_campaign(
    verify_data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Xác thực và hoàn thành thử thách của chiến dịch doanh nghiệp cho người chơi."""
    from routers.hidden_quest import get_db_user, validate_coordinates, haversine_distance
    from models import UserProfiles

    user = get_db_user(current_user, db)
    event_id = verify_data.get("event_id")
    player_lat = verify_data.get("latitude")
    player_lng = verify_data.get("longitude")

    if not event_id or player_lat is None or player_lng is None:
        raise HTTPException(status_code=400, detail="Thiếu thông tin xác thực")

    player_lat, player_lng = validate_coordinates(player_lat, player_lng)
    now = datetime.utcnow()
    target_user_id = user.user_id

    event = db.get(EnterpriseEvents, UUID(event_id))
    if not event or not event.is_active:
        raise HTTPException(status_code=404, detail="Chiến dịch doanh nghiệp không tồn tại hoặc đã kết thúc")

    # Kiểm tra nếu đã hoàn thành rồi
    participated = db.exec(
        select(HiddenEventParticipants)
        .where(HiddenEventParticipants.user_id == target_user_id)
        .where(HiddenEventParticipants.event_id == event.event_id)
    ).first()
    if participated:
        raise HTTPException(status_code=400, detail="Bạn đã hoàn thành chiến dịch này rồi!")

    # Kiểm tra khoảng cách đứng trong bán kính quét
    dist = haversine_distance(float(player_lat), float(player_lng), float(event.latitude), float(event.longitude))
    if dist > float(event.radius_meters) + 20.0:  # Dung sai 20m do GPS drift
        raise HTTPException(
            status_code=400,
            detail=f"Bạn ở quá xa địa điểm chiến dịch ({int(dist)}m / Bán kính: {event.radius_meters}m)"
        )

    # Xác thực cụ thể theo loại thử thách
    if event.quest_type == QuestTypeEnum.QR:
        qr_token = verify_data.get("qr_token")
        if not qr_token:
            raise HTTPException(status_code=400, detail="Yêu cầu quét mã QR sự kiện")

        qr_entry = db.exec(
            select(EnterpriseEventQR)
            .where(EnterpriseEventQR.event_id == event.event_id)
            .where(EnterpriseEventQR.qr_token == qr_token)
        ).first()

        if not qr_entry:
            raise HTTPException(status_code=400, detail="Mã QR sự kiện không hợp lệ")

        if qr_entry.scanned_count >= qr_entry.max_scans:
            raise HTTPException(status_code=400, detail="Số lượng quà tặng qua mã QR này đã đạt giới hạn")

        qr_entry.scanned_count += 1
        db.add(qr_entry)

    elif event.quest_type == QuestTypeEnum.QUIZ:
        user_answer = verify_data.get("answer")
        correct_answer = verify_data.get("correct_answer", "A")
        if not user_answer or user_answer.strip().upper() != correct_answer.strip().upper():
            raise HTTPException(status_code=400, detail="Đáp án câu hỏi chưa chính xác")

    elif event.quest_type == QuestTypeEnum.PHOTO:
        image_url = verify_data.get("image_url")
        if not image_url:
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp ảnh chụp check-in")

    final_exp = event.reward_exp * event.multiplier
    final_coin = event.reward_coin * event.multiplier

    # Cộng thưởng
    profile = db.exec(select(UserProfiles).where(UserProfiles.user_id == target_user_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ người dùng")

    profile.total_points = (profile.total_points or 0) + final_exp
    profile.points_balance = (profile.points_balance or 0) + final_coin
    profile.updated_at = now
    db.add(profile)

    # Lưu lịch sử tham gia
    participation = HiddenEventParticipants(
        user_id=target_user_id,
        event_id=event.event_id,
        earned_exp=final_exp,
        earned_coin=final_coin,
        feedback_image_url=verify_data.get("image_url"),
        completed_at=now
    )
    db.add(participation)
    db.commit()
    db.refresh(profile)

    return {
        "status": "ok",
        "title": event.title,
        "reward_exp": final_exp,
        "reward_coin": final_coin,
        "total_points": profile.total_points,
        "points_balance": profile.points_balance
    }
