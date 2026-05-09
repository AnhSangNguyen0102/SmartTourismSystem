"""
test_crud.py
============
Chạy smoke-test cho tất cả CRUD modules kết nối Supabase.
Chiến lược:
  - READ queries: chạy thật, in kết quả.
  - WRITE queries: tạo record → verify → rollback (dùng db.rollback() sau mỗi block).
  - Không thay đổi data seed vĩnh viễn.

Chạy:
    python test_crud.py
"""

import sys
import traceback
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlmodel import Session

from database import engine

# ── Import tất cả CRUD modules ───────────────────────────────────────────────
from crud.crud_reference   import get_active_cities, get_all_categories, get_all_tags
from crud.crud_user        import (
    get_user_by_email, create_user, get_user_tag_weights,
    get_user_category_history, get_user_avg_budget,
    update_user_status, create_user_profile, update_user_role,
    update_user_profile, update_user_kyc_status,
)
from crud.crud_planning    import (
    create_planning_session, create_session_preferences,
    get_planning_session, update_session_status,
)
from crud.crud_location    import (
    get_locations_by_city_and_categories, get_location_tags,
    get_location_by_ids, get_location_images,
)
from crud.crud_itinerary   import (
    create_itinerary, create_itinerary_days, create_itinerary_stops,
    create_itinerary_routes, get_itinerary_full, update_itinerary_status,
    get_itinerary_history, get_itinerary_stops_with_locations,
)
from crud.crud_tracking    import (
    create_checkin_progress, update_checkin_status,
    create_gps_log, create_deviation_log,
    verify_stop_in_itinerary, get_checkin_by_stop, get_stop_with_radius,
)
from crud.crud_enterprise  import (
    create_enterprise_profile, get_pending_enterprise_profiles,
    update_enterprise_status, create_verification_log,
)
from models import (
    UserStatus, UserRole, GenderEnum, PrivacyStatus, KycStatus,
    PlanningStatus, CurrencyEnum, ItineraryStatus, StopStatus,
    EnterpriseStatus, VerificationAction,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

PASS = "✅ PASS"
FAIL = "❌ FAIL"
SKIP = "⚠️  SKIP"

results: list[tuple[str, str, str]] = []   # (module, test, status)

def ok(module: str, test: str, info: str = ""):
    tag = f"  {info}" if info else ""
    print(f"  {PASS}  [{module}] {test}{tag}")
    results.append((module, test, "PASS"))

def fail(module: str, test: str, err: str):
    print(f"  {FAIL}  [{module}] {test}")
    print(f"          {err}")
    results.append((module, test, "FAIL"))

def skip(module: str, test: str, reason: str):
    print(f"  {SKIP}  [{module}] {test}  → {reason}")
    results.append((module, test, "SKIP"))

def section(title: str):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}")


# ═════════════════════════════════════════════════════════════
# TEST SUITE
# ═════════════════════════════════════════════════════════════

def run():
    with Session(engine) as db:

        # ── seed references that we'll discover at runtime ──────────────────
        seed_city_name: str | None = None
        seed_category_ids: list[int] = []
        seed_tag_ids: list[int] = []
        seed_user_id = None
        seed_session_id = None
        seed_itinerary_id = None
        seed_stop_id = None
        seed_location_id = None

        # ════════════════════════════════════════════════════
        # 1. REFERENCE DATA
        # ════════════════════════════════════════════════════
        section("1. crud_reference  –  Reference / Master Data")

        try:
            cities = get_active_cities(db)
            if cities:
                seed_city_name = cities[0].city_name
            ok("reference", "get_active_cities",
               f"{len(cities)} thành phố{f', first={seed_city_name!r}' if seed_city_name else ''}")
        except Exception as e:
            fail("reference", "get_active_cities", str(e))

        try:
            cats = get_all_categories(db)
            seed_category_ids = [c.category_id for c in cats[:3]]
            ok("reference", "get_all_categories", f"{len(cats)} danh mục")
        except Exception as e:
            fail("reference", "get_all_categories", str(e))

        try:
            tags = get_all_tags(db)
            seed_tag_ids = [t.tag_id for t in tags[:3]]
            ok("reference", "get_all_tags", f"{len(tags)} tag")
        except Exception as e:
            fail("reference", "get_all_tags", str(e))

        # ════════════════════════════════════════════════════
        # 2. USER
        # ════════════════════════════════════════════════════
        section("2. crud_user  –  Quản lý User, Sở thích & KYC")

        TEST_EMAIL = f"test_smoke_{uuid4().hex[:6]}@example.com"
        TEST_PASSWORD = "TestPass123!"

        # Q1 – get_user_by_email (email chưa tồn tại → None)
        try:
            u = get_user_by_email(db, TEST_EMAIL)
            ok("user", "get_user_by_email (miss)", f"result={u}")
        except Exception as e:
            fail("user", "get_user_by_email", str(e))

        # Q2 – create_user (sẽ rollback)
        new_user = None
        try:
            new_user = create_user(
                db,
                full_name="Smoke Test",
                email=TEST_EMAIL,
                password=TEST_PASSWORD,
            )
            seed_user_id = new_user.user_id
            ok("user", "create_user", f"user_id={new_user.user_id}")
        except Exception as e:
            fail("user", "create_user", str(e))

        # Q8 – update_user_status
        if new_user:
            try:
                updated = update_user_status(db, new_user.user_id, UserStatus.ACTIVE)
                ok("user", "update_user_status", f"status={updated.status if updated else 'None'}")
            except Exception as e:
                fail("user", "update_user_status", str(e))

        # Q9 – create_user_profile
        if new_user:
            try:
                profile = create_user_profile(
                    db,
                    user_id=new_user.user_id,
                    full_name="Smoke Test",
                    date_of_birth=date(1999, 1, 1),
                    gender=GenderEnum.OTHER,
                )
                ok("user", "create_user_profile", f"profile_id={profile.profile_id}")

                # Q11 – update_user_profile
                try:
                    up = update_user_profile(db, new_user.user_id, bio="Test bio")
                    ok("user", "update_user_profile", f"bio={up.bio if up else 'None'}")
                except Exception as e:
                    fail("user", "update_user_profile", str(e))

                # Q12 – update_user_kyc_status
                try:
                    kp = update_user_kyc_status(db, new_user.user_id, KycStatus.PENDING)
                    ok("user", "update_user_kyc_status", f"kyc={kp.kyc_status if kp else 'None'}")
                except Exception as e:
                    fail("user", "update_user_kyc_status", str(e))

            except Exception as e:
                fail("user", "create_user_profile", str(e))

        # Q10 – update_user_role
        if new_user:
            try:
                ur = update_user_role(db, new_user.user_id, UserRole.ENTERPRISE)
                ok("user", "update_user_role", f"role={ur.role if ur else 'None'}")
            except Exception as e:
                fail("user", "update_user_role", str(e))

        # Q3/Q5/Q7 – read preferences (dùng user_id thật nếu có seed, else None)
        if seed_user_id:
            try:
                tw = get_user_tag_weights(db, seed_user_id)
                ok("user", "get_user_tag_weights", f"{len(tw)} bản ghi")
            except Exception as e:
                fail("user", "get_user_tag_weights", str(e))

            try:
                ch = get_user_category_history(db, seed_user_id)
                ok("user", "get_user_category_history", f"{len(ch)} bản ghi")
            except Exception as e:
                fail("user", "get_user_category_history", str(e))

            try:
                avg = get_user_avg_budget(db, seed_user_id)
                ok("user", "get_user_avg_budget", f"avg={avg}")
            except Exception as e:
                fail("user", "get_user_avg_budget", str(e))

        # ROLLBACK toàn bộ user write test
        db.rollback()
        print("  ↩  Rolled back user write operations")

        # ════════════════════════════════════════════════════
        # 3. ENTERPRISE
        # ════════════════════════════════════════════════════
        section("3. crud_enterprise  –  Doanh nghiệp & Duyệt hồ sơ")

        # Cần user_id thật để FK không lỗi → tạo temp user trước
        temp_user = None
        try:
            temp_user = create_user(
                db,
                full_name="Enterprise Test",
                email=f"ent_{uuid4().hex[:6]}@example.com",
                password="TestPass123!",
            )
        except Exception:
            pass

        if temp_user:
            try:
                ent = create_enterprise_profile(
                    db,
                    user_id=temp_user.user_id,
                    business_name="Smoke Corp",
                    contact_person="Nguyen Van A",
                    contact_email="corp@example.com",
                    contact_phone="0123456789",
                )
                ok("enterprise", "create_enterprise_profile", f"enterprise_id={ent.enterprise_id}")

                try:
                    updated_ent = update_enterprise_status(db, ent.enterprise_id, EnterpriseStatus.ACTIVE)
                    ok("enterprise", "update_enterprise_status", f"status={updated_ent.status if updated_ent else 'None'}")
                except Exception as e:
                    fail("enterprise", "update_enterprise_status", str(e))

                try:
                    log = create_verification_log(
                        db,
                        enterprise_id=ent.enterprise_id,
                        admin_id=temp_user.user_id,
                        action=VerificationAction.APPROVE,
                    )
                    ok("enterprise", "create_verification_log", f"log_id={log.log_id}")
                except Exception as e:
                    fail("enterprise", "create_verification_log", str(e))

            except Exception as e:
                fail("enterprise", "create_enterprise_profile", str(e))
        else:
            skip("enterprise", "create_enterprise_profile", "Không tạo được temp_user")

        try:
            pending = get_pending_enterprise_profiles(db)
            ok("enterprise", "get_pending_enterprise_profiles", f"{len(pending)} hồ sơ pending")
        except Exception as e:
            fail("enterprise", "get_pending_enterprise_profiles", str(e))

        db.rollback()
        print("  ↩  Rolled back enterprise write operations")

        # ════════════════════════════════════════════════════
        # 4. LOCATION
        # ════════════════════════════════════════════════════
        section("4. crud_location  –  Địa điểm & Gợi ý")

        if seed_city_name and seed_category_ids:
            try:
                locs = get_locations_by_city_and_categories(db, seed_city_name, seed_category_ids)
                ok("location", "get_locations_by_city_and_categories",
                   f"{len(locs)} địa điểm (city={seed_city_name!r})")
                if locs:
                    seed_location_id = locs[0].location_id
            except Exception as e:
                fail("location", "get_locations_by_city_and_categories", str(e))
        else:
            skip("location", "get_locations_by_city_and_categories", "Thiếu seed city/category")

        if seed_location_id:
            try:
                lt = get_location_tags(db, seed_location_id)
                ok("location", "get_location_tags", f"{len(lt)} tag")
            except Exception as e:
                fail("location", "get_location_tags", str(e))

            try:
                detail = get_location_by_ids(db, [seed_location_id])
                ok("location", "get_location_by_ids", f"{len(detail)} địa điểm")
            except Exception as e:
                fail("location", "get_location_by_ids", str(e))

            try:
                imgs = get_location_images(db, seed_location_id)
                ok("location", "get_location_images", f"{len(imgs)} ảnh")
            except Exception as e:
                fail("location", "get_location_images", str(e))
        else:
            skip("location", "get_location_tags / get_location_by_ids / get_location_images",
                 "Không có seed location_id")

        # ════════════════════════════════════════════════════
        # 5. PLANNING
        # ════════════════════════════════════════════════════
        section("5. crud_planning  –  Phiên lập kế hoạch")

        # Lấy city_id từ seed
        seed_city_id: int | None = None
        try:
            cities2 = get_active_cities(db)
            if cities2:
                seed_city_id = cities2[0].city_id
        except Exception:
            pass

        temp_plan_user = None
        try:
            temp_plan_user = create_user(
                db,
                full_name="Plan Test",
                email=f"plan_{uuid4().hex[:6]}@example.com",
                password="TestPass123!",
            )
        except Exception:
            pass

        new_session = None
        if temp_plan_user and seed_city_id:
            try:
                new_session = create_planning_session(
                    db,
                    user_id=temp_plan_user.user_id,
                    city_id=seed_city_id,
                    pax_adult=2,
                    pax_children=0,
                    budget=Decimal("2000000"),
                    start_day=date(2025, 7, 1),
                    end_day=date(2025, 7, 3),
                )
                seed_session_id = new_session.session_id
                ok("planning", "create_planning_session", f"session_id={new_session.session_id}")
            except Exception as e:
                fail("planning", "create_planning_session", str(e))

            if new_session and seed_tag_ids:
                try:
                    prefs = create_session_preferences(db, new_session.session_id, seed_tag_ids)
                    ok("planning", "create_session_preferences", f"{len(prefs)} preferences")
                except Exception as e:
                    fail("planning", "create_session_preferences", str(e))

            if new_session:
                try:
                    fetched = get_planning_session(db, new_session.session_id)
                    ok("planning", "get_planning_session", f"status={fetched.status if fetched else 'None'}")
                except Exception as e:
                    fail("planning", "get_planning_session", str(e))

                try:
                    updated_ps = update_session_status(db, new_session.session_id, PlanningStatus.CONFIRMED)
                    ok("planning", "update_session_status", f"status={updated_ps.status if updated_ps else 'None'}")
                except Exception as e:
                    fail("planning", "update_session_status", str(e))
        else:
            skip("planning", "all write tests", "Thiếu temp_plan_user hoặc seed_city_id")

        db.rollback()
        print("  ↩  Rolled back planning write operations")

        # ════════════════════════════════════════════════════
        # 6. ITINERARY
        # ════════════════════════════════════════════════════
        section("6. crud_itinerary  –  Lộ trình")

        # Tạo chain: user → planning_session → itinerary → days → stops
        temp_itin_user = None
        try:
            temp_itin_user = create_user(
                db,
                full_name="Itin Test",
                email=f"itin_{uuid4().hex[:6]}@example.com",
                password="TestPass123!",
            )
        except Exception:
            pass

        new_itin_session = None
        if temp_itin_user and seed_city_id:
            try:
                new_itin_session = create_planning_session(
                    db,
                    user_id=temp_itin_user.user_id,
                    city_id=seed_city_id,
                    pax_adult=1,
                    pax_children=0,
                    budget=Decimal("1500000"),
                    start_day=date(2025, 8, 1),
                    end_day=date(2025, 8, 2),
                )
            except Exception as e:
                fail("itinerary", "create_planning_session (setup)", str(e))

        new_itin = None
        if new_itin_session:
            try:
                new_itin = create_itinerary(
                    db,
                    session_id=new_itin_session.session_id,
                    user_id=temp_itin_user.user_id,
                    name="Smoke Trip",
                    total_budget=Decimal("1500000"),
                    total_travel_time=300,
                    total_distance=Decimal("25.5"),
                )
                seed_itinerary_id = new_itin.itinerary_id
                ok("itinerary", "create_itinerary", f"itinerary_id={new_itin.itinerary_id}")
            except Exception as e:
                fail("itinerary", "create_itinerary", str(e))

        new_days = []
        if new_itin:
            try:
                new_days = create_itinerary_days(db, [
                    {
                        "itinerary_id": new_itin.itinerary_id,
                        "day_order": 1,
                        "travel_date": date(2025, 8, 1),
                        "estimated_budget": Decimal("750000"),
                        "total_time": 300,
                    }
                ])
                ok("itinerary", "create_itinerary_days", f"{len(new_days)} ngày")
            except Exception as e:
                fail("itinerary", "create_itinerary_days", str(e))

        new_stops = []
        if new_days and seed_location_id:
            from datetime import time as dtime
            try:
                new_stops = create_itinerary_stops(db, [
                    {
                        "day_id": new_days[0].day_id,
                        "location_id": seed_location_id,
                        "stop_order": 1,
                        "arrival_time": dtime(9, 0),
                        "departure_time": dtime(11, 0),
                    }
                ])
                seed_stop_id = new_stops[0].stop_id
                ok("itinerary", "create_itinerary_stops", f"{len(new_stops)} trạm")
            except Exception as e:
                fail("itinerary", "create_itinerary_stops", str(e))
        elif not seed_location_id:
            skip("itinerary", "create_itinerary_stops", "Thiếu seed_location_id")

        if len(new_stops) >= 2:
            try:
                routes = create_itinerary_routes(db, [
                    {
                        "from_stop_id": new_stops[0].stop_id,
                        "to_stop_id": new_stops[1].stop_id,
                        "travel_time": 20,
                        "distance": Decimal("3.2"),
                        "polyline_data": "encoded_polyline_here",
                    }
                ])
                ok("itinerary", "create_itinerary_routes", f"{len(routes)} route")
            except Exception as e:
                fail("itinerary", "create_itinerary_routes", str(e))
        else:
            skip("itinerary", "create_itinerary_routes", "Cần >= 2 stops")

        if new_itin:
            try:
                full = get_itinerary_full(db, new_itin.itinerary_id)
                ok("itinerary", "get_itinerary_full", f"{len(full)} rows")
            except Exception as e:
                fail("itinerary", "get_itinerary_full", str(e))

            try:
                with_locs = get_itinerary_stops_with_locations(db, new_itin.itinerary_id)
                ok("itinerary", "get_itinerary_stops_with_locations", f"{len(with_locs)} rows")
            except Exception as e:
                fail("itinerary", "get_itinerary_stops_with_locations", str(e))

            try:
                hist = get_itinerary_history(db, temp_itin_user.user_id)
                ok("itinerary", "get_itinerary_history", f"{len(hist)} lộ trình")
            except Exception as e:
                fail("itinerary", "get_itinerary_history", str(e))

            try:
                upd_it = update_itinerary_status(db, new_itin.itinerary_id, ItineraryStatus.CONFIRMED)
                ok("itinerary", "update_itinerary_status", f"status={upd_it.status if upd_it else 'None'}")
            except Exception as e:
                fail("itinerary", "update_itinerary_status", str(e))

        db.rollback()
        print("  ↩  Rolled back itinerary write operations")

        # ════════════════════════════════════════════════════
        # 7. TRACKING & CHECK-IN
        # ════════════════════════════════════════════════════
        section("7. crud_tracking  –  Tracking & Check-in")

        # verify_stop_in_itinerary / get_checkin_by_stop / get_stop_with_radius
        # cần stop_id thật — nếu không có seed thì skip
        if seed_stop_id and seed_itinerary_id:
            try:
                ok_val = verify_stop_in_itinerary(db, seed_itinerary_id, seed_stop_id)
                ok("tracking", "verify_stop_in_itinerary", f"result={ok_val}")
            except Exception as e:
                fail("tracking", "verify_stop_in_itinerary", str(e))

            try:
                radius_info = get_stop_with_radius(db, seed_stop_id)
                ok("tracking", "get_stop_with_radius",
                   f"radius={radius_info.checkin_radius if radius_info else 'None'}")
            except Exception as e:
                fail("tracking", "get_stop_with_radius", str(e))
        else:
            skip("tracking", "verify_stop_in_itinerary / get_stop_with_radius",
                 "Thiếu seed_stop_id (cần seed location để create stops)")

        # Write tests cho tracking cần user + stop thật → tạo chain lại
        temp_track_user = None
        try:
            temp_track_user = create_user(
                db,
                full_name="Track Test",
                email=f"track_{uuid4().hex[:6]}@example.com",
                password="TestPass123!",
            )
        except Exception:
            pass

        if temp_track_user and seed_stop_id:
            try:
                prog = create_checkin_progress(
                    db,
                    user_id=temp_track_user.user_id,
                    stop_id=seed_stop_id,
                    latitude=Decimal("10.762622"),
                    longitude=Decimal("106.660172"),
                )
                ok("tracking", "create_checkin_progress", f"progress_id={prog.progress_id}")

                try:
                    chk = get_checkin_by_stop(db, temp_track_user.user_id, seed_stop_id)
                    ok("tracking", "get_checkin_by_stop", f"found={chk is not None}")
                except Exception as e:
                    fail("tracking", "get_checkin_by_stop", str(e))

                try:
                    gps = create_gps_log(
                        db,
                        progress_id=prog.progress_id,
                        latitude=Decimal("10.762622"),
                        longitude=Decimal("106.660172"),
                    )
                    ok("tracking", "create_gps_log", f"log_id={gps.log_id}")
                except Exception as e:
                    fail("tracking", "create_gps_log", str(e))

                try:
                    upd_chk, upd_stop = update_checkin_status(db, prog.progress_id, seed_stop_id)
                    ok("tracking", "update_checkin_status",
                       f"completed={upd_chk.is_completed if upd_chk else '?'}, "
                       f"stop_status={upd_stop.status if upd_stop else '?'}")
                except Exception as e:
                    fail("tracking", "update_checkin_status", str(e))

            except Exception as e:
                fail("tracking", "create_checkin_progress", str(e))
        else:
            skip("tracking", "create_checkin_progress / gps_log / update_checkin_status",
                 "Thiếu temp_track_user hoặc seed_stop_id")

        if seed_itinerary_id:
            try:
                dev = create_deviation_log(
                    db,
                    itinerary_id=seed_itinerary_id,
                    latitude=Decimal("10.770000"),
                    longitude=Decimal("106.670000"),
                )
                ok("tracking", "create_deviation_log", f"alert_id={dev.alert_id}")
            except Exception as e:
                fail("tracking", "create_deviation_log", str(e))
        else:
            skip("tracking", "create_deviation_log", "Thiếu seed_itinerary_id")

        db.rollback()
        print("  ↩  Rolled back tracking write operations")

    # ════════════════════════════════════════════════════════
    # SUMMARY
    # ════════════════════════════════════════════════════════
    total  = len(results)
    passed = sum(1 for _, _, s in results if s == "PASS")
    failed = sum(1 for _, _, s in results if s == "FAIL")
    skipped= sum(1 for _, _, s in results if s == "SKIP")

    print(f"\n{'═'*60}")
    print(f"  KẾT QUẢ: {passed}/{total} PASS  |  {failed} FAIL  |  {skipped} SKIP")
    print(f"{'═'*60}")

    if failed:
        print("\n  CÁC TEST THẤT BẠI:")
        for mod, test, status in results:
            if status == "FAIL":
                print(f"    ❌  [{mod}] {test}")
        sys.exit(1)


if __name__ == "__main__":
    print(f"\n{'═'*60}")
    print("  CRUD SMOKE TEST  –  Supabase")
    print(f"{'═'*60}")
    try:
        run()
    except KeyboardInterrupt:
        print("\n  Interrupted.")
    except Exception as e:
        print(f"\n  FATAL ERROR: {e}")
        traceback.print_exc()
        sys.exit(1)
