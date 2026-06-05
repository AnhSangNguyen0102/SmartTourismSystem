"""
crud_gamification.py
====================
Module này chứa các hàm thao tác với cơ sở dữ liệu (CRUD) phục vụ cho hệ thống Gamification.
Bao gồm: điểm danh hằng ngày, nhận quà tân thủ, tìm kiếm rương kho báu trên bản đồ, nhặt rương,
hiển thị bảng xếp hạng thám hiểm tuần/tháng, và các địa điểm đang có sự kiện ưu đãi từ doanh nghiệp.
"""

import uuid
from typing import List, Dict, Any, Optional
from sqlmodel import Session, select
from sqlalchemy import text
from datetime import date, datetime, timedelta
from models import UserProfiles

def check_newbie_gift(session: Session, user_id: uuid.UUID) -> bool:
    """Kiểm tra người dùng đã nhận quà tân thủ chưa"""
    query = text("SELECT IS_NEWBIE_GIFT_CLAIMED FROM USER_PROFILES WHERE USER_ID = :user_id")
    result = session.exec(query, params={"user_id": str(user_id)}).first()
    return result[0] if result else False

def claim_newbie_gift(session: Session, user_id: uuid.UUID) -> bool:
    """Thực hiện nhận quà tân thủ (Cộng 500 EXP, 1000 Xu)"""
    query = text("""
        UPDATE USER_PROFILES 
        SET IS_NEWBIE_GIFT_CLAIMED = TRUE, 
            TOTAL_EXP = TOTAL_EXP + 500, 
            COIN_BALANCE = COIN_BALANCE + 1000 
        WHERE USER_ID = :user_id AND IS_NEWBIE_GIFT_CLAIMED = FALSE
        RETURNING USER_ID
    """)
    result = session.exec(query, params={"user_id": str(user_id)}).first()
    return bool(result)

def daily_attendance(session: Session, user_id: uuid.UUID) -> Dict[str, Any]:
    """Thực hiện điểm danh hằng ngày"""
    profile = session.exec(
        select(UserProfiles).where(UserProfiles.user_id == user_id)
    ).first()
    
    if not profile:
        return {"error": "Không tìm thấy hồ sơ người dùng"}

    today = date.today()
    
    # Kiểm tra xem hôm nay đã điểm danh chưa
    if profile.last_attendance_date == today:
        return {"error": "Hôm nay bạn đã điểm danh rồi!"}

    # Tính toán streak
    yesterday = today - timedelta(days=1)
    if profile.last_attendance_date == yesterday:
        profile.attendance_streak += 1
    else:
        profile.attendance_streak = 1

    # Điểm thưởng
    exp_reward = 100
    coin_reward = 50

    is_streak_bonus = False
    if profile.attendance_streak > 0 and profile.attendance_streak % 7 == 0:
        exp_reward += 300
        coin_reward += 150
        is_streak_bonus = True

    # Cập nhật thông tin
    profile.last_attendance_date = today
    profile.total_points += exp_reward
    profile.points_balance += coin_reward
    profile.updated_at = datetime.utcnow()

    session.add(profile)
    session.commit()

    return {
        "status": "success",
        "new_streak": profile.attendance_streak,
        "exp_reward": exp_reward,
        "coin_reward": coin_reward,
        "is_streak_bonus": is_streak_bonus
    }

def get_nearby_treasures(session: Session, user_id: uuid.UUID) -> List[Dict[str, Any]]:
    """Lấy danh sách rương báu xung quanh (Bỏ qua các rương đã nhặt)"""
    query = text("""
        SELECT MT.SPAWN_ID, MT.LATITUDE, MT.LONGITUDE, MT.CHECKIN_RADIUS, 
               MT.REWARD_EXP, MT.REWARD_COIN, MT.IS_HIDDEN_QUEST,
               VI.NAME AS ITEM_NAME, VI.ICON_URL AS ITEM_ICON 
        FROM MAP_TREASURES MT
        LEFT JOIN VIRTUAL_ITEMS VI ON MT.REWARD_ITEM_ID = VI.ITEM_ID
        WHERE (MT.EXPIRES_AT > NOW() OR MT.EXPIRES_AT IS NULL)
          AND NOT EXISTS (
              SELECT 1 FROM USER_TREASURE_CLAIMS UTC 
              WHERE UTC.SPAWN_ID = MT.SPAWN_ID 
                AND UTC.USER_ID = :user_id
          )
    """)
    results = session.exec(query, params={"user_id": str(user_id)}).all()
    return [dict(row._mapping) for row in results]

def claim_treasure(session: Session, user_id: uuid.UUID, spawn_id: uuid.UUID, item_id: Optional[int] = None) -> bool:
    """Xử lý nhặt rương / Nhận vật phẩm"""
    # Đánh dấu đã nhặt
    claim_query = text("""
        INSERT INTO USER_TREASURE_CLAIMS (USER_ID, SPAWN_ID) 
        VALUES (:user_id, :spawn_id)
    """)
    session.exec(claim_query, params={"user_id": str(user_id), "spawn_id": str(spawn_id)})
    
    # Cộng vật phẩm vào túi đồ nếu rương có chứa Item
    if item_id:
        inv_query = text("""
            INSERT INTO USER_INVENTORY (USER_ID, ITEM_ID, QUANTITY) 
            VALUES (:user_id, :item_id, 1)
            ON CONFLICT (USER_ID, ITEM_ID) 
            DO UPDATE SET QUANTITY = USER_INVENTORY.QUANTITY + 1
        """)
        session.exec(inv_query, params={"user_id": str(user_id), "item_id": item_id})
        
    return True

def get_leaderboard(session: Session, city_id: int, period_type: str, period_value: str) -> List[Dict[str, Any]]:
    """Lấy bảng xếp hạng thám hiểm theo thành phố"""
    query = text("""
        SELECT UP.FULL_NAME, UP.AVATAR_URL, 
               LR.SCORE_EXP, LR.SCORE_COIN, LR.SCORE_DISTANCE, LR.RANKING
        FROM LEADERBOARD_RECORDS LR
        INNER JOIN USER_PROFILES UP ON LR.USER_ID = UP.USER_ID
        WHERE LR.CITY_ID = :city_id 
          AND LR.PERIOD_TYPE = :period_type 
          AND LR.PERIOD_VALUE = :period_value
        ORDER BY LR.SCORE_EXP DESC
        LIMIT 10
    """)
    results = session.exec(query, params={
        "city_id": city_id,
        "period_type": period_type,
        "period_value": period_value
    }).all()
    return [dict(row._mapping) for row in results]

def get_hot_locations(session: Session) -> List[Dict[str, Any]]:
    """Lấy các điểm hot có sự kiện x2 EXP hoặc Voucher"""
    query = text("""
        SELECT L.LOCATION_ID, L.LOCATION_NAME, L.LATITUDE, L.LONGITUDE,
               BC.CAMPAIGN_NAME, BC.EXP_MULTIPLIER, BC.COIN_MULTIPLIER,
               V.VOUCHER_ID, V.DISCOUNT_AMOUNT
        FROM LOCATIONS L
        INNER JOIN BUSINESS_CAMPAIGNS BC ON L.LOCATION_ID = BC.LOCATION_ID
        LEFT JOIN VOUCHERS V ON BC.CAMPAIGN_ID = V.CAMPAIGN_ID AND V.REMAINING_QUANTITY > 0
        WHERE BC.IS_ACTIVE = TRUE 
          AND NOW() BETWEEN BC.START_TIME AND BC.END_TIME
    """)
    results = session.exec(query).all()
    return [dict(row._mapping) for row in results]
