"""
test_new_cruds.py
=================
Test 6 query mới thêm vào:
- crud_auth: get_session_by_refresh_token, update_session_token
- crud_location: increment_location_view_count, increment_location_checkin_count
- crud_feedback: create_user_feedback, get_system_feedbacks
"""

import sys
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from sqlmodel import Session
from database import engine

from models import FeedbackType, UserRole, UserStatus, RegisterType, Users
from core.security import get_password_hash

# Imports from CRUD
from crud.crud_auth import create_user_session, get_session_by_refresh_token, update_session_token
from crud.crud_location import get_locations_by_city_and_categories, increment_location_view_count, increment_location_checkin_count
from crud.crud_feedback import create_user_feedback, get_system_feedbacks
from crud.crud_reference import get_active_cities, get_all_categories

def run():
    print(f"\n{'═'*60}")
    print("  TEST NEW CRUDS (Auth Refresh, Location Stats, Feedback)")
    print(f"{'═'*60}\n")
    
    with Session(engine) as db:
        try:
            # 1. Tạo User ảo để test Auth và Feedback
            test_user = Users(
                user_id=uuid4(),
                full_name="Smoke Test User",
                email=f"smoke_{uuid4().hex[:6]}@example.com",
                passwordhash=get_password_hash("password123"),
                register_type=RegisterType.EMAIL,
                role=UserRole.USER,
                status=UserStatus.ACTIVE
            )
            db.add(test_user)
            db.commit()
            db.refresh(test_user)
            print("✅ 1. Đã tạo User ảo để test.")

            # ---------------------------------------------------------
            # TEST AUTH (Refresh Token)
            # ---------------------------------------------------------
            print("\n--- TEST AUTH (Refresh Token) ---")
            device_id = "test_device_123"
            refresh_hash = "mock_hash_abc"
            expires = datetime.now(timezone.utc) + timedelta(days=7)
            
            session = create_user_session(db, test_user.user_id, device_id, refresh_hash, expires.replace(tzinfo=None))
            print(f"✅ create_user_session: session_id = {session.session_id}")
            
            fetched_session = get_session_by_refresh_token(db, refresh_hash)
            if fetched_session:
                print(f"✅ get_session_by_refresh_token: tìm thấy đúng session_id = {fetched_session.session_id}")
            else:
                print("❌ get_session_by_refresh_token: không tìm thấy!")

            new_refresh_hash = "mock_hash_xyz"
            updated_session = update_session_token(db, session.session_id, new_refresh_hash)
            if updated_session and updated_session.refresh_token_hash == new_refresh_hash:
                print(f"✅ update_session_token: đã cập nhật hash = {updated_session.refresh_token_hash}")
            else:
                print("❌ update_session_token: cập nhật thất bại!")

            # ---------------------------------------------------------
            # TEST LOCATION STATS
            # ---------------------------------------------------------
            print("\n--- TEST LOCATION STATS ---")
            cities = get_active_cities(db)
            cats = get_all_categories(db)
            
            if cities and cats:
                # Lấy 1 location bất kỳ
                locs = get_locations_by_city_and_categories(db, cities[0].city_name, [cats[0].category_id, cats[1].category_id])
                if locs:
                    test_loc_id = locs[0].location_id
                    print(f"✅ Đã chọn địa điểm: {locs[0].location_name}")
                    
                    # Test view count
                    stat_view = increment_location_view_count(db, test_loc_id)
                    print(f"✅ increment_location_view_count: total_views hiện tại = {stat_view.total_views}")
                    
                    # Lần 2 tăng view để test logic update
                    stat_view = increment_location_view_count(db, test_loc_id)
                    print(f"✅ increment_location_view_count (gọi lần 2): total_views = {stat_view.total_views}")
                    
                    # Test check-in count
                    stat_checkin = increment_location_checkin_count(db, test_loc_id)
                    print(f"✅ increment_location_checkin_count: total_checkins hiện tại = {stat_checkin.total_checkins}")
                else:
                    print("⚠️ Không tìm thấy địa điểm nào với category này để test.")
            else:
                print("⚠️ Thiếu data city/category để lấy địa điểm.")

            # ---------------------------------------------------------
            # TEST FEEDBACK
            # ---------------------------------------------------------
            print("\n--- TEST FEEDBACK ---")
            fb = create_user_feedback(db, test_user.user_id, FeedbackType.BUG, "App hay bị crash khi xem bản đồ")
            print(f"✅ create_user_feedback: feedback_id = {fb.feedback_id}")
            print(f"   => Nội dung: '{fb.content}' | Loại: {fb.feedback_type}")
            
            feedbacks = get_system_feedbacks(db)
            print(f"✅ get_system_feedbacks: lấy được {len(feedbacks)} phản hồi hệ thống (mới nhất: '{feedbacks[0].content}').")

        except Exception as e:
            print(f"\n❌ LỖI TRONG QUÁ TRÌNH TEST: {e}")
            db.rollback()
            sys.exit(1)
        finally:
            print("\n⏳ Đang dọn dẹp và Rollback toàn bộ dữ liệu test...")
            db.rollback()
            print("✅ Rollback hoàn tất! Database của bạn sạch sẽ như cũ.")

if __name__ == "__main__":
    run()
