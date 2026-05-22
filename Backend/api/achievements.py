from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from jose import jwt

from database import get_session
from models import Users, UserProfiles, Achievements, UserAchievements
from core.config import settings
import core.security as security

router = APIRouter(prefix="/api/achievements", tags=["Achievements - Thành tựu & Huy hiệu"])

def get_current_user_id(db: Session, current_user_dict: dict) -> UUID:
    """Lấy user_id thực tế từ database dựa trên token sub."""
    user_id_str = current_user_dict.get("sub")
    try:
        user_id = UUID(user_id_str)
    except Exception:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")
        
    user = db.get(Users, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User không tồn tại")
    return user.user_id

def seed_default_achievements(db: Session):
    """Seed danh sách các thành tựu mặc định vào database nếu chưa có."""
    default_achievements = [
        Achievements(
            achievement_id="first_itinerary",
            title="Khởi Đầu Hành Trình",
            description="Hoàn thành lộ trình đầu tiên của bạn",
            points_reward=20,
            badge_icon="🗺️",
            condition_type="complete_itinerary",
            condition_value=1
        ),
        Achievements(
            achievement_id="walk_10k",
            title="Đôi Chân Không Mỏi",
            description="Đi bộ/di chuyển hành trình tổng cộng 10km",
            points_reward=50,
            badge_icon="🏃",
            condition_type="distance",
            condition_value=10
        ),
        Achievements(
            achievement_id="checkin_20_cafes",
            title="Chúa Tể Check-in",
            description="Check-in thành công tại 20 địa điểm ăn uống hoặc cafe",
            points_reward=100,
            badge_icon="☕",
            condition_type="cafe_checkin",
            condition_value=20
        ),
        Achievements(
            achievement_id="perfect_trip",
            title="Nhà Khám Phá Hoàn Hảo",
            description="Hoàn thành 100% tất cả các trạm trong một lộ trình",
            points_reward=80,
            badge_icon="✨",
            condition_type="perfect_trip",
            condition_value=1
        )
    ]
    
    for ach in default_achievements:
        existing = db.exec(select(Achievements).where(Achievements.achievement_id == ach.achievement_id)).first()
        if not existing:
            db.add(ach)
    db.commit()

def check_and_update_achievements(
    db: Session, 
    user_id: UUID, 
    action_type: str, 
    amount: int = 1,
    detail_context: Optional[dict] = None
) -> List[dict]:
    """
    Engine kiểm tra và cập nhật tiến trình thành tựu của User.
    Trả về danh sách các thành tựu vừa được mở khóa thành công.
    """
    unlocked_list = []
    
    # 1. Tìm tất cả thành tựu phù hợp với loại hành động
    statement = select(Achievements).where(Achievements.condition_type == action_type)
    achievements = db.exec(statement).all()
    
    for ach in achievements:
        # 2. Kiểm tra xem user đã mở khóa thành tựu này chưa
        stmt_ua = select(UserAchievements).where(
            UserAchievements.user_id == user_id,
            UserAchievements.achievement_id == ach.achievement_id
        )
        ua = db.exec(stmt_ua).first()
        
        if ua and ua.is_unlocked:
            continue
            
        if not ua:
            ua = UserAchievements(
                user_id=user_id,
                achievement_id=ach.achievement_id,
                current_progress=0,
                is_unlocked=False
            )
            db.add(ua)
            
        # 3. Cập nhật tiến trình tùy theo loại hành động
        if action_type == "distance":
            ua.current_progress += amount
        elif action_type == "cafe_checkin":
            ua.current_progress += amount
        elif action_type == "complete_itinerary":
            ua.current_progress += amount
        elif action_type == "perfect_trip":
            ua.current_progress += amount
            
        # 4. Kiểm tra điều kiện mở khóa
        if ua.current_progress >= ach.condition_value:
            ua.is_unlocked = True
            ua.unlocked_at = datetime.utcnow()
            
            # Cộng điểm thưởng thành tựu cho user profile
            stmt_prof = select(UserProfiles).where(UserProfiles.user_id == user_id)
            profile = db.exec(stmt_prof).first()
            if profile:
                profile.total_points += ach.points_reward
                profile.points_balance += ach.points_reward
                db.add(profile)
                
            unlocked_list.append({
                "achievement_id": ach.achievement_id,
                "title": ach.title,
                "badge_icon": ach.badge_icon,
                "points_reward": ach.points_reward,
                "description": ach.description
            })
            
        db.add(ua)
        
    db.commit()
    return unlocked_list

@router.get("", summary="Lấy danh sách thành tựu và tiến trình của user")
def get_user_achievements(
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    user_id = get_current_user_id(db, current_user)
    
    # Đảm bảo có thành tựu mặc định
    seed_default_achievements(db)
    
    # Lấy toàn bộ thành tựu
    all_ach = db.exec(select(Achievements)).all()
    
    # Lấy tiến trình của user
    stmt_ua = select(UserAchievements).where(UserAchievements.user_id == user_id)
    user_progress = {p.achievement_id: p for p in db.exec(stmt_ua).all()}
    
    result = []
    for ach in all_ach:
        prog = user_progress.get(ach.achievement_id)
        current = prog.current_progress if prog else 0
        unlocked = prog.is_unlocked if prog else False
        unlocked_at = prog.unlocked_at if prog else None
        
        result.append({
            "achievement_id": ach.achievement_id,
            "title": ach.title,
            "description": ach.description,
            "points_reward": ach.points_reward,
            "badge_icon": ach.badge_icon,
            "condition_type": ach.condition_type,
            "condition_value": ach.condition_value,
            "current_progress": min(current, ach.condition_value), # Giới hạn hiển thị tối đa bằng target
            "is_unlocked": unlocked,
            "unlocked_at": unlocked_at
        })
        
    return {
        "status": "success",
        "achievements": result
    }

@router.get("/badges", summary="Lấy danh sách các huy hiệu đã mở khóa của user")
def get_user_badges(
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    user_id = get_current_user_id(db, current_user)
    
    statement = (
        select(Achievements, UserAchievements)
        .join(UserAchievements, Achievements.achievement_id == UserAchievements.achievement_id)
        .where(UserAchievements.user_id == user_id)
        .where(UserAchievements.is_unlocked == True)
        .order_by(UserAchievements.unlocked_at.desc())
    )
    
    results = db.exec(statement).all()
    
    badges = []
    for ach, ua in results:
        badges.append({
            "achievement_id": ach.achievement_id,
            "title": ach.title,
            "badge_icon": ach.badge_icon,
            "points_reward": ach.points_reward,
            "description": ach.description,
            "unlocked_at": ua.unlocked_at
        })
        
    return {
        "status": "success",
        "badges": badges
    }
