import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from core.security import verify_token
from database import get_session
from routers.gamification import auto_complete_daily_quest
from models import (
    BusinessLocation,
    EnterpriseEventQR,
    EnterpriseEventSteps,
    EnterpriseEvents,
    EnterpriseProfiles,
    EnterpriseStatus,
    HiddenEventParticipants,
    Locations,
    PlayerHiddenTasks,
    QuestTypeEnum,
    RarityEnum,
    SpawnStatusEnum,
    Users,
)

router = APIRouter(tags=["Enterprise - Event Management"])


def _parse_datetime(value: str, field_name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except (AttributeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} không đúng định dạng ISO 8601.",
        )


def _serialize_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        return f"{value.isoformat()}Z"
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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
    steps = db.exec(
        select(EnterpriseEventSteps)
        .where(EnterpriseEventSteps.event_id == event.event_id)
        .order_by(EnterpriseEventSteps.sort_order.asc())
    ).all()
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
        "event_mode": "HIDDEN_MULTI_STEP" if steps else "CAMPAIGN",
        "steps": [
            {
                "step_type": step.step_type,
                "title": step.title,
                "prompt": step.prompt,
                "option_a": step.option_a,
                "option_b": step.option_b,
                "option_c": step.option_c,
                "option_d": step.option_d,
                "sort_order": step.sort_order,
            }
            for step in steps
        ],
        "quest_type": event.quest_type.value,
        "latitude": float(event.latitude),
        "longitude": float(event.longitude),
        "radius_meters": event.radius_meters,
        "reward_exp": event.reward_exp,
        "reward_coin": event.reward_coin,
        "rarity": event.rarity.value,
        "multiplier": event.multiplier,
        "start_time": _serialize_datetime(event.start_time),
        "end_time": _serialize_datetime(event.end_time),
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
        rarity = RarityEnum(str(event_data.get("rarity", "COMMON")).upper())
    except ValueError:
        raise HTTPException(status_code=400, detail="rarity không hợp lệ.")

    start_time = _parse_datetime(event_data.get("start_time"), "start_time")
    end_time = _parse_datetime(event_data.get("end_time"), "end_time")
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time phải nhỏ hơn end_time.")

    try:
        location_id = UUID(str(event_data["location_id"])) if event_data.get("location_id") else None
        radius_meters = int(event_data.get("radius_meters", 100))
        reward_exp = int(event_data.get("reward_exp", 100))
        reward_coin = int(event_data.get("reward_coin", 50))
        max_scans = int(event_data.get("max_scans", 100))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Địa điểm/tọa độ, bán kính và phần thưởng phải hợp lệ.")

    if radius_meters < 0 or reward_exp < 0 or reward_coin < 0 or max_scans < 1:
        raise HTTPException(status_code=400, detail="Bán kính/phần thưởng/lượt quét không được âm.")

    location = db.get(Locations, location_id) if location_id else None
    if location_id:
        if not location or not location.is_active:
            raise HTTPException(status_code=404, detail="Địa điểm doanh nghiệp không tồn tại hoặc chưa active.")

        owns_location = db.exec(
            select(BusinessLocation).where(
                BusinessLocation.business_id == enterprise.enterprise_id,
                BusinessLocation.location_id == location.location_id,
            )
        ).first()
        if not owns_location:
            raise HTTPException(status_code=403, detail="Bạn chỉ được tạo event cho địa điểm thuộc doanh nghiệp mình.")

        event_latitude = location.latitude
        event_longitude = location.longitude
        place_name = location.location_name
    else:
        try:
            event_latitude = Decimal(str(event_data["latitude"]))
            event_longitude = Decimal(str(event_data["longitude"]))
        except (KeyError, TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Thiếu latitude/longitude khi không chọn địa điểm.")
        place_name = title

    question = (event_data.get("question") or f"Bạn đang tham gia sự kiện nào?").strip()
    option_a = (event_data.get("option_a") or title).strip()
    option_b = (event_data.get("option_b") or "Một địa điểm khác").strip()
    option_c = (event_data.get("option_c") or "Khu vực chưa xác định").strip()
    option_d = (event_data.get("option_d") or "Không có đáp án đúng").strip()
    correct_answer = (event_data.get("correct_answer") or "A").strip().upper()
    if correct_answer not in {"A", "B", "C", "D"}:
        raise HTTPException(status_code=400, detail="Đáp án đúng phải là A, B, C hoặc D.")

    photo_title = (event_data.get("photo_title") or f"Chụp ảnh check-in tại {place_name}").strip()
    photo_description = (
        event_data.get("photo_description")
        or f"Chụp ảnh rõ khu vực sự kiện {place_name} để xác thực bạn đã đến đúng điểm."
    ).strip()

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
        quest_type=QuestTypeEnum.CHECKIN,
        latitude=event_latitude,
        longitude=event_longitude,
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
    db.flush()
    db.refresh(new_event)

    qr_token = f"EVT-{new_event.event_id.hex[:6].upper()}-{secrets.token_hex(4).upper()}"
    qr_entry = EnterpriseEventQR(
        event_id=new_event.event_id,
        qr_token=qr_token,
        max_scans=max_scans,
        scanned_count=0,
    )
    db.add(qr_entry)
    db.add(
        EnterpriseEventSteps(
            event_id=new_event.event_id,
            step_type="PHOTO",
            title=photo_title,
            prompt=photo_description,
            sort_order=1,
        )
    )
    db.add(
        EnterpriseEventSteps(
            event_id=new_event.event_id,
            step_type="QUIZ",
            title="Câu hỏi sự kiện",
            prompt=question,
            option_a=option_a,
            option_b=option_b,
            option_c=option_c,
            option_d=option_d,
            correct_answer=correct_answer,
            sort_order=2,
        )
    )
    db.add(
        EnterpriseEventSteps(
            event_id=new_event.event_id,
            step_type="QR",
            title="Quét QR sự kiện",
            prompt="Quét hoặc nhập mã QR do doanh nghiệp cung cấp để hoàn thành sự kiện.",
            sort_order=3,
        )
    )
    db.commit()

    return {
        "status": "ok",
        "message": "Tạo event nhiệm vụ ẩn nhiều bước thành công",
        "event_id": str(new_event.event_id),
        "location_id": str(location.location_id) if location else None,
        "qr": {
            "qr_token": qr_token,
            "max_scans": max_scans,
        },
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
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
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
    has_player_location = latitude is not None and longitude is not None
    if has_player_location:
        from core.spatial_logic import calculate_haversine_distance

    for event in events:
        participated = db.exec(
            select(HiddenEventParticipants)
            .where(HiddenEventParticipants.user_id == user.user_id)
            .where(HiddenEventParticipants.event_id == event.event_id)
        ).first()
        if participated:
            continue

        if has_player_location:
            dist = calculate_haversine_distance(
                float(latitude),
                float(longitude),
                float(event.latitude),
                float(event.longitude),
            )
            if dist > float(event.radius_meters) + 20.0:
                continue

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

    steps = db.exec(
        select(EnterpriseEventSteps).where(EnterpriseEventSteps.event_id == event.event_id)
    ).all()

    if steps:
        image_url = verify_data.get("image_url") or verify_data.get("photo_url")
        if not image_url:
            raise HTTPException(status_code=400, detail="Vui lòng hoàn thành bước chụp ảnh sự kiện")

        quiz_step = next((step for step in steps if step.step_type == "QUIZ"), None)
        user_answer = verify_data.get("answer")
        correct_answer = quiz_step.correct_answer if quiz_step else "A"
        if not user_answer or user_answer.strip().upper() != correct_answer.strip().upper():
            raise HTTPException(status_code=400, detail="Đáp án câu hỏi sự kiện chưa chính xác")

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

    else:
        # Xác thực cụ thể theo loại thử thách cũ để không phá dữ liệu event đã có.
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

    # Tự động hoàn thành nhiệm vụ hằng ngày tương ứng (nếu có)
    daily_quest_type = None
    if event.quest_type == QuestTypeEnum.CHECKIN or getattr(event.quest_type, "value", None) == "CHECKIN":
        daily_quest_type = "GPS"
    elif event.quest_type == QuestTypeEnum.QUIZ or getattr(event.quest_type, "value", None) == "QUIZ":
        daily_quest_type = "QUIZ"
    elif event.quest_type == QuestTypeEnum.PHOTO or getattr(event.quest_type, "value", None) == "PHOTO":
        daily_quest_type = "AI_PHOTO"
        
    if daily_quest_type:
        auto_complete_daily_quest(db, target_user_id, daily_quest_type)

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
