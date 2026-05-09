"""
test_system_cruds.py
====================
Test các query vừa bổ sung:
- crud_auth: create_activity_log
- crud_location: get_location_stats
- crud_planning: create_request_history_log
- crud_enterprise: get_business_locations
- crud_system: get_system_setting, create_export_history, update_export_status
"""

import sys
from uuid import uuid4
from datetime import datetime, date, timezone
from decimal import Decimal
import json

# pyrefly: ignore [missing-import]
from sqlmodel import Session
from database import engine

# Import Models
from models import (
    Users, UserRole, UserStatus, RegisterType, 
    EnterpriseProfiles, EnterpriseStatus, BusinessLocation,
    SystemSettings, ExportFormat, ExportStatus,
    PlanningSessions, PlanningStatus, CurrencyEnum,
    RequestActionType,
)
from core.security import get_password_hash

# Import CRUD
from crud.crud_auth import create_activity_log
from crud.crud_location import get_location_stats, increment_location_view_count, get_locations_by_city_and_categories
from crud.crud_planning import create_request_history_log
from crud.crud_enterprise import get_business_locations
from crud.crud_system import get_system_setting, create_export_history, update_export_status
from crud.crud_reference import get_active_cities, get_all_categories

def run():
    print(f"\n{'═'*60}")
    print("  TEST NEWEST CRUDS (Activity, RequestLog, System, Enterprise)")
    print(f"{'═'*60}\n")
    
    with Session(engine) as db:
        # Thu thập các object đã tạo để cleanup cuối cùng
        cleanup_ids = {
            "user_id": None,
            "enterprise_id": None,
            "setting_key": None,
            "export_id": None,
        }

        try:
            # 1. Tạo User ảo
            test_user = Users(
                user_id=uuid4(),
                full_name="Audit Test User",
                email=f"audit_{uuid4().hex[:6]}@example.com",
                passwordhash=get_password_hash("password123"),
                register_type=RegisterType.EMAIL,
                role=UserRole.USER,
                status=UserStatus.ACTIVE
            )
            db.add(test_user)
            db.commit()
            db.refresh(test_user)
            cleanup_ids["user_id"] = test_user.user_id
            print("✅ Đã tạo User ảo để test.")

            # ---------------------------------------------------------
            # 1. TEST AUTH (Activity Log)
            # ---------------------------------------------------------
            print("\n--- TEST AUTH (Activity Log) ---")
            act_log = create_activity_log(
                db, 
                user_id=test_user.user_id, 
                action="LOGIN", 
                ip_address="192.168.1.1", 
                user_agent="Mozilla/5.0 Chrome"
            )
            print(f"✅ create_activity_log: log_id = {act_log.log_id}, action = {act_log.action}")

            # ---------------------------------------------------------
            # 2. TEST LOCATION STATS (Select)
            # ---------------------------------------------------------
            print("\n--- TEST LOCATION STATS ---")
            cities = get_active_cities(db)
            cats = get_all_categories(db)
            locs = []
            if cities and cats:
                locs = get_locations_by_city_and_categories(db, cities[0].city_name, [cats[0].category_id])
                if locs:
                    test_loc_id = locs[0].location_id
                    # Tạo/Tăng view count để đảm bảo có record
                    increment_location_view_count(db, test_loc_id)
                    # Lấy stats
                    stats = get_location_stats(db, test_loc_id)
                    if stats:
                        print(f"✅ get_location_stats: total_views = {stats.total_views}, total_checkins = {stats.total_checkins}")
                    else:
                        print("❌ get_location_stats: Lỗi, không tìm thấy stats sau khi tạo!")
                else:
                    print("⚠️ Bỏ qua test Location (chưa có địa điểm).")
            else:
                print("⚠️ Bỏ qua test Location (chưa có city/category).")

            # ---------------------------------------------------------
            # 3. TEST PLANNING (Request History Log)
            # ---------------------------------------------------------
            print("\n--- TEST PLANNING (Request History Log) ---")
            
            # Tạo PlanningSessions ảo trước (RequestHistoryLogs cần FK session_id)
            test_session = PlanningSessions(
                session_id=uuid4(),
                user_id=test_user.user_id,
                city_id=cities[0].city_id if cities else 1,
                pax_adult=2,
                pax_children=0,
                budget=Decimal("5000000"),
                currency=CurrencyEnum.VND,
                start_day=date.today(),
                end_day=date.today(),
                status=PlanningStatus.PENDING,
            )
            db.add(test_session)
            db.commit()
            db.refresh(test_session)
            print(f"   ↳ Đã tạo PlanningSession ảo: session_id = {test_session.session_id}")

            # Tạo Request History Log
            req_log = create_request_history_log(
                db,
                session_id=test_session.session_id,
                action_type=RequestActionType.CREATE,
                state_before=json.dumps({"budget": 5000000, "days": 3}),
            )
            print(f"✅ create_request_history_log: log_id = {req_log.log_id}, action_type = {req_log.action_type}")

            # ---------------------------------------------------------
            # 4. TEST ENTERPRISE (Business Locations)
            # ---------------------------------------------------------
            print("\n--- TEST ENTERPRISE (Business Locations) ---")
            # Tạo Doanh nghiệp ảo (đủ các trường bắt buộc)
            test_enterprise = EnterpriseProfiles(
                enterprise_id=uuid4(),
                user_id=test_user.user_id,
                business_name="Test Enterprise Co.",
                contact_person="Test Person",
                contact_email="test@example.com",
                contact_phone="0901234567",
                status=EnterpriseStatus.ACTIVE
            )
            db.add(test_enterprise)
            db.commit()
            cleanup_ids["enterprise_id"] = test_enterprise.enterprise_id
            
            # Gắn Location cho Doanh nghiệp
            if cities and cats and locs:
                biz_loc = BusinessLocation(
                    business_id=test_enterprise.enterprise_id,
                    location_id=locs[0].location_id
                )
                db.add(biz_loc)
                db.commit()
                
                # Fetch query
                b_locs = get_business_locations(db, test_enterprise.enterprise_id)
                print(f"✅ get_business_locations: tìm thấy {len(b_locs)} địa điểm quản lý bởi '{test_enterprise.business_name}'")
            else:
                print("⚠️ Bỏ qua test BusinessLocation (chưa có location data).")

            # ---------------------------------------------------------
            # 5. TEST SYSTEM (Settings & Export)
            # ---------------------------------------------------------
            print("\n--- TEST SYSTEM (Settings & Export) ---")
            
            # Test Settings
            test_setting = SystemSettings(
                config_key="TEST_MAX_API_LIMIT",
                config_value="1000",
                updated_by=test_user.user_id
            )
            db.add(test_setting)
            db.commit()
            cleanup_ids["setting_key"] = "TEST_MAX_API_LIMIT"
            
            fetched_setting = get_system_setting(db, "TEST_MAX_API_LIMIT")
            if fetched_setting:
                print(f"✅ get_system_setting: key = {fetched_setting.config_key}, value = {fetched_setting.config_value}")
            
            # Test Export Histories
            export_log = create_export_history(db, test_user.user_id, ExportFormat.PDF, "https://s3.example.com/file.pdf")
            cleanup_ids["export_id"] = export_log.export_id
            print(f"✅ create_export_history: export_id = {export_log.export_id}, status = {export_log.status}")
            
            updated_export = update_export_status(db, export_log.export_id, ExportStatus.COMPLETED)
            print(f"✅ update_export_status: status chuyển thành {updated_export.status}")

        except Exception as e:
            print(f"\n❌ LỖI: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
        finally:
            # Cleanup: xoá dữ liệu test bằng DELETE (rollback không undo được commit)
            print("\n⏳ Đang xoá dữ liệu test (cleanup)...")
            try:
                from sqlmodel import delete
                from models import ActivityLog, ExportHistories, RequestHistoryLogs

                # Xoá theo thứ tự FK (con trước, cha sau)
                if cleanup_ids["user_id"]:
                    db.exec(delete(ActivityLog).where(ActivityLog.user_id == cleanup_ids["user_id"]))
                    db.exec(delete(RequestHistoryLogs))  # xoá log vừa tạo
                    
                if cleanup_ids["export_id"]:
                    db.exec(delete(ExportHistories).where(ExportHistories.export_id == cleanup_ids["export_id"]))

                if cleanup_ids["setting_key"]:
                    db.exec(delete(SystemSettings).where(SystemSettings.config_key == cleanup_ids["setting_key"]))

                if cleanup_ids["enterprise_id"]:
                    db.exec(delete(BusinessLocation).where(BusinessLocation.business_id == cleanup_ids["enterprise_id"]))
                    db.exec(delete(EnterpriseProfiles).where(EnterpriseProfiles.enterprise_id == cleanup_ids["enterprise_id"]))

                if cleanup_ids["user_id"]:
                    # Xoá planning session ảo
                    db.exec(delete(PlanningSessions).where(PlanningSessions.user_id == cleanup_ids["user_id"]))
                    # Xoá user cuối cùng
                    db.exec(delete(Users).where(Users.user_id == cleanup_ids["user_id"]))

                db.commit()
                print("✅ Cleanup hoàn tất — DB sạch!")
            except Exception as cleanup_err:
                print(f"⚠️ Cleanup lỗi (có thể cần xoá tay): {cleanup_err}")
                db.rollback()

if __name__ == "__main__":
    run()
