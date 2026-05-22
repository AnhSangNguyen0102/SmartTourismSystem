import random
import enum
from uuid import UUID, uuid4
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from decimal import Decimal
from math import radians, cos, sin, asin, sqrt

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlmodel import Session, select

from database import get_session
from core.security import verify_token
from models import (
    Users,
    UserProfiles,
    HiddenChests,
    PlayerHiddenTasks,
    EnterpriseEvents,
    EnterpriseEventQR,
    HiddenEventParticipants,
    HiddenSpawnLogs,
    HiddenTaskCooldowns,
    RarityEnum,
    QuestTypeEnum,
    SpawnStatusEnum
)

router = APIRouter(tags=["Gamification - Hidden Quest"])

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance between two coordinates in meters."""
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371000  # Radius of earth in meters
    return c * r

def get_db_user(current_user: dict, db: Session) -> Users:
    sub = current_user.get("sub")
    
    print(f"=== DEBUG GAMIFICATION ===\n> sub từ Token: {sub}\n> Kiểu dữ liệu sub: {type(sub)}")
    
    if not sub:
        raise HTTPException(status_code=401, detail="Xác thực không hợp lệ")
    
    # Thử tìm bằng UUID trước
    try:
        user_uuid = UUID(sub)
        user = db.get(Users, user_uuid)
        if user:
            print(f"> Tìm thấy user bằng UUID: {user.email}")
            return user
    except ValueError:
        print("> sub không phải định dạng UUID chuẩn, chuyển xuống tìm bằng Email...")
        
    # Thử tìm bằng Email
    user = db.exec(select(Users).where(Users.email == sub)).first()
    if user:
        print(f"> Tìm thấy user bằng Email: {user.user_id}")
        return user
        
    print("> ❌ KẾT QUẢ: Không tìm thấy bất kỳ User nào trong bảng Users khớp với sub trên!")
    raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")

# ============================================================
# API ENDPOINTS
# ============================================================

@router.get("/api/v1/hidden/active", response_model=List[dict])
def get_active_hidden_tasks(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Retrieve active spawned tasks for the player."""
    user = get_db_user(current_user, db)
    now = datetime.utcnow()
    
    target_user_id = user.user_id if isinstance(user.user_id, UUID) else UUID(str(user.user_id))
    
    # Auto-expire tasks in database
    expired_tasks = db.exec(
        select(PlayerHiddenTasks)
        .where(PlayerHiddenTasks.user_id == target_user_id)
        .where(PlayerHiddenTasks.status == SpawnStatusEnum.ACTIVE)
        .where(PlayerHiddenTasks.expires_at < now)
    ).all()
    
    if expired_tasks:
        for t in expired_tasks:
            t.status = SpawnStatusEnum.EXPIRED
            db.add(t)
            
            # Log expiration
            log = HiddenSpawnLogs(
                user_id=target_user_id,
                action="EXPIRE",
                target_id=t.target_id,
                latitude=t.latitude,
                longitude=t.longitude
            )
            db.add(log)
        db.commit()
        
    # Get active tasks
    active_tasks = db.exec(
        select(PlayerHiddenTasks)
        .where(PlayerHiddenTasks.user_id == target_user_id)
        .where(PlayerHiddenTasks.status == SpawnStatusEnum.ACTIVE)
    ).all()
    
    result = []
    for task in active_tasks:
        details = {
            "spawn_id": str(task.spawn_id),
            "task_type": task.task_type,
            "target_id": str(task.target_id),
            "latitude": float(task.latitude),
            "longitude": float(task.longitude),
            "rarity": task.rarity,
            "expires_at": task.expires_at.isoformat()
        }
        
        if task.task_type == "CHEST":
            chest = db.get(HiddenChests, task.target_id)
            if chest:
                details["title"] = chest.title
                details["description"] = chest.description
        else:
            event = db.get(EnterpriseEvents, task.target_id)
            if event:
                details["title"] = event.title
                details["description"] = event.description
                details["quest_type"] = event.quest_type
                details["radius_meters"] = event.radius_meters
                details["reward_exp"] = event.reward_exp
                details["reward_coin"] = event.reward_coin
                
        result.append(details)
        
    return result

@router.post("/api/v1/hidden/ping-location")
def ping_location(
    coords: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Checks and triggers spawning of nearby hidden items."""
    user = get_db_user(current_user, db)
    lat = coords.get("latitude")
    lng = coords.get("longitude")
    
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Vĩ độ và kinh độ là bắt buộc")
        
    now = datetime.utcnow()
    target_user_id = user.user_id if isinstance(user.user_id, UUID) else UUID(str(user.user_id))
    
    # 1. Clean expired tasks
    expired = db.exec(
        select(PlayerHiddenTasks)
        .where(PlayerHiddenTasks.user_id == target_user_id)
        .where(PlayerHiddenTasks.status == SpawnStatusEnum.ACTIVE)
        .where(PlayerHiddenTasks.expires_at < now)
    ).all()
    for t in expired:
        t.status = SpawnStatusEnum.EXPIRED
        db.add(t)
    db.commit()
    
    # 2. Check Cooldown
    cooldown = db.exec(
        select(HiddenTaskCooldowns)
        .where(HiddenTaskCooldowns.user_id == target_user_id)
        .where(HiddenTaskCooldowns.cooldown_until > now)
    ).first()
    
    # 3. Check active count
    active_tasks = db.exec(
        select(PlayerHiddenTasks)
        .where(PlayerHiddenTasks.user_id == target_user_id)
        .where(PlayerHiddenTasks.status == SpawnStatusEnum.ACTIVE)
    ).all()
    
    if cooldown or len(active_tasks) >= 3:
        return {"status": "ok", "message": "Cooldown active or maximum tasks reached", "spawned": False}
        
    if random.random() > 0.3:
        return {"status": "ok", "message": "Spawn roll missed", "spawned": False}
        
    enterprise_events = db.exec(
        select(EnterpriseEvents)
        .where(EnterpriseEvents.is_active == True)
        .where(EnterpriseEvents.start_time <= now)
        .where(EnterpriseEvents.end_time >= now)
    ).all()
    
    nearby_events = []
    for ev in enterprise_events:
        dist = haversine_distance(float(lat), float(lng), float(ev.latitude), float(ev.longitude))
        if dist <= 500.0:
            participated = db.exec(
                select(HiddenEventParticipants)
                .where(HiddenEventParticipants.user_id == target_user_id)
                .where(HiddenEventParticipants.event_id == ev.event_id)
            ).first()
            
            already_spawned = any(t.task_type == "DYNAMIC_QUEST" and t.target_id == ev.event_id for t in active_tasks)
            
            if not participated and not already_spawned:
                nearby_events.append(ev)
                
    spawned_item = None
    if nearby_events and random.random() < 0.6:
        target_event = random.choice(nearby_events)
        offset_lat = random.uniform(-0.001, 0.001)
        offset_lng = random.uniform(-0.001, 0.001)
        
        new_task = PlayerHiddenTasks(
            user_id=target_user_id,
            task_type="DYNAMIC_QUEST",
            target_id=target_event.event_id,
            latitude=Decimal(str(float(target_event.latitude) + offset_lat)),
            longitude=Decimal(str(float(target_event.longitude) + offset_lng)),
            status=SpawnStatusEnum.ACTIVE,
            rarity=target_event.rarity,
            expires_at=now + timedelta(minutes=15)
        )
        db.add(new_task)
        spawned_item = {
            "type": "DYNAMIC_QUEST",
            "title": target_event.title,
            "rarity": target_event.rarity
        }
    else:
        chests = db.exec(select(HiddenChests)).all()
        if not chests:
            return {"status": "ok", "message": "No chest templates found", "spawned": False}
            
        rarity_roll = random.random()
        if rarity_roll < 0.02:
            target_rarity = RarityEnum.LEGENDARY
        elif rarity_roll < 0.10:
            target_rarity = RarityEnum.EPIC
        elif rarity_roll < 0.30:
            target_rarity = RarityEnum.RARE
        else:
            target_rarity = RarityEnum.COMMON
            
        chest_candidates = [c for c in chests if c.rarity == target_rarity]
        if not chest_candidates:
            chest_candidates = chests
            
        target_chest = random.choice(chest_candidates)
        angle = random.uniform(0, 360)
        distance = random.uniform(20, 100)
        
        lat_offset = (distance * cos(radians(angle))) / 111320
        lng_offset = (distance * sin(radians(angle))) / (40075000 * cos(radians(float(lat))) / 360)
        
        new_task = PlayerHiddenTasks(
            user_id=target_user_id,
            task_type="CHEST",
            target_id=target_chest.chest_id,
            latitude=Decimal(str(float(lat) + lat_offset)),
            longitude=Decimal(str(float(lng) + lng_offset)),
            status=SpawnStatusEnum.ACTIVE,
            rarity=target_chest.rarity,
            expires_at=now + timedelta(minutes=10)
        )
        db.add(new_task)
        spawned_item = {
            "type": "CHEST",
            "title": target_chest.title,
            "rarity": target_chest.rarity
        }
        
    log = HiddenSpawnLogs(
        user_id=target_user_id,
        action="SPAWN_CHEST" if spawned_item["type"] == "CHEST" else "SPAWN_QUEST",
        target_id=new_task.target_id,
        latitude=new_task.latitude,
        longitude=new_task.longitude
    )
    db.add(log)
    
    cooldown_entry = HiddenTaskCooldowns(
        user_id=target_user_id,
        cooldown_until=now + timedelta(minutes=3)
    )
    db.add(cooldown_entry)
    db.commit()
    
    return {
        "status": "ok",
        "spawned": True,
        "item": spawned_item
    }

# ============================================================
# 🔥 HÀM CLAIM_CHEST ĐÃ ĐƯỢC CHUẨN HÓA CÁC THÔNG BÁO LỖI CHÍNH XÁC
# ============================================================
@router.post("/api/v1/hidden/claim-chest")
def claim_chest(
    claim_data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Unlock and claim a treasure chest."""
    user = get_db_user(current_user, db)
    spawn_id = claim_data.get("spawn_id")
    player_lat = claim_data.get("latitude")
    player_lng = claim_data.get("longitude")
    
    if not spawn_id or player_lat is None or player_lng is None:
        raise HTTPException(status_code=400, detail="Thiếu thông tin spawn_id hoặc tọa độ GPS")
        
    now = datetime.utcnow()
    target_user_id = user.user_id if isinstance(user.user_id, UUID) else UUID(str(user.user_id))
    
    try:
        task_uuid = UUID(str(spawn_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="ID rương (spawn_id) không đúng định dạng")

    task = db.get(PlayerHiddenTasks, task_uuid)
    if not task or task.user_id != target_user_id or task.task_type != "CHEST":
        raise HTTPException(status_code=404, detail="Rương không tồn tại")
        
    if task.status != SpawnStatusEnum.ACTIVE:
        raise HTTPException(status_code=400, detail="Rương này đã được mở hoặc đã hết hạn (expired)")
        
    # ❌ LỖI HẾT HẠN (Frontend dựa vào từ khóa 'expired' hoặc 'hết hạn')
    if task.expires_at < now:
        task.status = SpawnStatusEnum.EXPIRED
        db.add(task)
        db.commit()
        raise HTTPException(status_code=400, detail="Rương đã hết thời gian tồn tại (expired)")
        
    # ❌ LỖI KHOẢNG CÁCH QUÁ XA (Trả về status: "too_far" dạng JSON thành công)
    dist = haversine_distance(float(player_lat), float(player_lng), float(task.latitude), float(task.longitude))
    if dist > 5.0:  
        return {
            "status": "too_far",
            "message": "Bạn nằm ngoài bán kính rương, hãy tới gần hơn để mở!",
            "current_distance": round(dist, 2),
            "required_distance": 5.0
        }
        
    chest = db.get(HiddenChests, task.target_id)
    if not chest:
        raise HTTPException(status_code=404, detail="Không tìm thấy cấu hình rương")
        
    rarity_multipliers = {
        RarityEnum.COMMON: 1,
        RarityEnum.RARE: 2,
        RarityEnum.EPIC: 3,
        RarityEnum.LEGENDARY: 5
    }
    multiplier = rarity_multipliers.get(task.rarity, 1)
    
    min_exp = chest.min_exp if chest.min_exp is not None else 10
    max_exp = chest.max_exp if chest.max_exp is not None else 30
    min_coin = chest.min_coin if chest.min_coin is not None else 5
    max_coin = chest.max_coin if chest.max_coin is not None else 15

    base_exp = random.randint(min_exp, max_exp)
    base_coin = random.randint(min_coin, max_coin)
    
    final_exp = base_exp * multiplier
    final_coin = base_coin * multiplier
    
    profile = db.exec(select(UserProfiles).where(UserProfiles.user_id == user.user_id)).first()
    
    # --- CƠ CHẾ TỰ ĐỘNG TẠO PROFILE VỚI GIÁ TRỊ MẶC ĐỊNH AN TOÀN ---
    if not profile:
        print(f"⚠️ Đang khởi tạo Profile an toàn cho user: {user.email}")
        
        from datetime import date
        
        profile = UserProfiles(
            user_id=user.user_id,
            full_name=getattr(user, 'full_name', 'Người dùng mới'),
            date_of_birth=date(1990, 1, 1), # Giá trị mặc định để vượt qua NotNull constraint
            gender='OTHER',                 # Giá trị mặc định để vượt qua NotNull constraint
            total_points=0,
            points_balance=0
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    # -----------------------------------------------------------
        
    profile.total_points = (profile.total_points or 0) + final_exp
    profile.points_balance = (profile.points_balance or 0) + final_coin
    profile.updated_at = now
    db.add(profile)
    
    task.status = SpawnStatusEnum.CLAIMED
    task.completed_at = now
    db.add(task)
    
    try:
        log = HiddenSpawnLogs(
            user_id=target_user_id,
            action="CLAIM_CHEST", 
            target_id=task.target_id if isinstance(task.target_id, UUID) else UUID(str(task.target_id)),
            latitude=task.latitude,
            longitude=task.longitude
        )
        db.add(log)
    except Exception as log_error:
        print(f"⚠️ Warning: Không thể ghi log mở rương: {str(log_error)}")
    
    try:
        db.commit()
        db.refresh(profile)
    except Exception as db_error:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống khi cập nhật phần thưởng: {str(db_error)}")
    
    return {
        "status": "ok",
        "chest_title": chest.title,
        "rarity": task.rarity,
        "multiplier": multiplier,
        "reward_exp": final_exp,
        "reward_coin": final_coin,
        "total_points": profile.total_points,
        "points_balance": profile.points_balance
    }

@router.post("/api/v1/hidden/verify-quest")
def verify_quest(
    verify_data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Complete a dynamic hidden quest."""
    user = get_db_user(current_user, db)
    spawn_id = verify_data.get("spawn_id")
    player_lat = verify_data.get("latitude")
    player_lng = verify_data.get("longitude")
    
    if not spawn_id or player_lat is None or player_lng is None:
        raise HTTPException(status_code=400, detail="Thiếu thông tin xác thực")
        
    now = datetime.utcnow()
    target_user_id = user.user_id if isinstance(user.user_id, UUID) else UUID(str(user.user_id))
    
    task = db.get(PlayerHiddenTasks, UUID(spawn_id))
    if not task or task.user_id != target_user_id or task.task_type != "DYNAMIC_QUEST":
        raise HTTPException(status_code=404, detail="Sự kiện không tồn tại")
        
    if task.status != SpawnStatusEnum.ACTIVE:
        raise HTTPException(status_code=400, detail="Sự kiện này đã kết thúc hoặc hết hạn")
        
    if task.expires_at < now:
        task.status = SpawnStatusEnum.EXPIRED
        db.add(task)
        db.commit()
        raise HTTPException(status_code=400, detail="Sự kiện đã hết thời gian tồn tại")
        
    event = db.get(EnterpriseEvents, task.target_id)
    if not event or not event.is_active:
        raise HTTPException(status_code=404, detail="Sự kiện doanh nghiệp đã đóng cửa")
        
    dist = haversine_distance(float(player_lat), float(player_lng), float(event.latitude), float(event.longitude))
    if dist > float(event.radius_meters) + 20.0:
        raise HTTPException(status_code=400, detail=f"Bạn ở quá xa địa điểm diễn ra sự kiện ({int(dist)}m / Bán kính: {event.radius_meters}m)")
        
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
            raise HTTPException(status_code=400, detail="Số lượng phần quà sự kiện qua mã QR này đã đạt giới hạn tối đa")
            
        qr_entry.scanned_count += 1
        db.add(qr_entry)
        
    elif event.quest_type == QuestTypeEnum.QUIZ:
        user_answer = verify_data.get("answer")
        correct_answer = verify_data.get("correct_answer", "A")
        if not user_answer or user_answer.strip().upper() != correct_answer.strip().upper():
            raise HTTPException(status_code=400, detail="Đáp án câu hỏi sự kiện chưa chính xác")
            
    elif event.quest_type == QuestTypeEnum.PHOTO:
        image_url = verify_data.get("image_url")
        if not image_url:
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp ảnh chụp check-in")
            
    final_exp = event.reward_exp * event.multiplier
    final_coin = event.reward_coin * event.multiplier
    
    profile = db.exec(select(UserProfiles).where(UserProfiles.user_id == target_user_id)).first()
    if not profile:
        raise HTTPException(
            status_code=404, 
            detail="Hệ thống không tìm thấy hồ sơ cá nhân (user_profiles) tương ứng với tài khoản của bạn."
        )
        
    profile.total_points = (profile.total_points or 0) + final_exp
    profile.points_balance = (profile.points_balance or 0) + final_coin
    profile.updated_at = now
    db.add(profile)
    
    participation = HiddenEventParticipants(
        user_id=target_user_id,
        event_id=event.event_id,
        earned_exp=final_exp,
        earned_coin=final_coin,
        feedback_image_url=verify_data.get("image_url"),
        completed_at=now
    )
    db.add(participation)
    
    task.status = SpawnStatusEnum.CLAIMED
    task.completed_at = now
    db.add(task)
    
    log = HiddenSpawnLogs(
        user_id=target_user_id,
        action="CLAIM_QUEST",
        target_id=task.target_id,
        latitude=task.latitude,
        longitude=task.longitude
    )
    db.add(log)
    
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

# ============================================================
# DEBUG / TEST ENDPOINTS
# ============================================================

@router.post("/api/v1/hidden/debug-spawn")
def debug_spawn(
    spawn_params: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Force spawn an event or chest near the player (For Test/Demo)."""
    user = get_db_user(current_user, db)
    task_type = spawn_params.get("task_type", "CHEST")
    lat = spawn_params.get("latitude")
    lng = spawn_params.get("longitude")
    rarity = spawn_params.get("rarity", RarityEnum.COMMON)
    
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp tọa độ GPS hiện tại")
        
    now = datetime.utcnow()
    target_user_id = user.user_id if isinstance(user.user_id, UUID) else UUID(str(user.user_id))
    
    offset_lat = random.uniform(-0.0001, 0.0001)
    offset_lng = random.uniform(-0.0001, 0.0001)
    spawn_lat = Decimal(str(float(lat) + offset_lat))
    spawn_lng = Decimal(str(float(lng) + offset_lng))
    
    if task_type == "CHEST":
        chests = db.exec(select(HiddenChests).where(HiddenChests.rarity == rarity)).all()
        if not chests:
            chests = db.exec(select(HiddenChests)).all()
            
        if not chests:
            mock_chest = HiddenChests(
                title=f"Rương {rarity.value} (Debug)",
                description="Rương được tạo ra từ chế độ debug.",
                rarity=rarity,
                min_exp=20,
                max_exp=80,
                min_coin=10,
                max_coin=40
            )
            db.add(mock_chest)
            db.commit()
            db.refresh(mock_chest)
            target_id = mock_chest.chest_id
            title = mock_chest.title
        else:
            chest = random.choice(chests)
            target_id = chest.chest_id
            title = chest.title
            
        new_task = PlayerHiddenTasks(
            user_id=target_user_id,
            task_type="CHEST",
            target_id=target_id,
            latitude=spawn_lat,
            longitude=spawn_lng,
            status=SpawnStatusEnum.ACTIVE,
            rarity=rarity,
            expires_at=now + timedelta(minutes=10)
        )
        db.add(new_task)
    else:
        from models import EnterpriseProfiles
        enterprise = db.exec(select(EnterpriseProfiles)).first()
        if not enterprise:
            raise HTTPException(status_code=400, detail="Không tìm thấy Doanh nghiệp nào trong DB để liên kết Event. Hãy đăng ký doanh nghiệp trước.")
            
        mock_event = EnterpriseEvents(
            enterprise_id=enterprise.enterprise_id,
            title=f"Sự kiện {rarity.value} (Debug)",
            description="Sự kiện doanh nghiệp được tạo ra từ chế độ debug.",
            quest_type=QuestTypeEnum.CHECKIN,
            latitude=spawn_lat,
            longitude=spawn_lng,
            radius_meters=100,
            reward_exp=150,
            reward_coin=75,
            multiplier=1 if rarity == RarityEnum.COMMON else (2 if rarity == RarityEnum.RARE else (3 if rarity == RarityEnum.EPIC else 5)),
            rarity=rarity,
            start_time=now - timedelta(hours=1),
            end_time=now + timedelta(hours=2),
            is_active=True
        )
        db.add(mock_event)
        db.commit()
        db.refresh(mock_event)
        
        new_task = PlayerHiddenTasks(
            user_id=target_user_id,
            task_type="DYNAMIC_QUEST",
            target_id=mock_event.event_id,
            latitude=spawn_lat,
            longitude=spawn_lng,
            status=SpawnStatusEnum.ACTIVE,
            rarity=rarity,
            expires_at=now + timedelta(minutes=15)
        )
        db.add(new_task)
        title = mock_event.title
        
    db.commit()
    
    return {
        "status": "ok",
        "message": f"Successfully spawned mock {task_type} ({rarity})",
        "spawn_id": str(new_task.spawn_id),
        "title": title,
        "latitude": float(new_task.latitude),
        "longitude": float(new_task.longitude)
    }