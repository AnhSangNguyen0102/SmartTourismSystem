from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, time
import math
from uuid import UUID
from sqlmodel import select
from database import get_session
import core.security as security
import crud.crud_user as crud_user
from schemas import (
    CreateItineraryRequest, ItineraryResponse, TrackingRequest,
    CheckInRequest, CheckInResponse, DeviationAlert, ItineraryDetailResponse,
    ItineraryHistoryItem, MessageResponse
)
from crud.crud_location import get_location_by_ids, increment_location_checkin_count
from crud.crud_trip import (
    create_itinerary, create_itinerary_day, create_itinerary_stop, create_itinerary_route,
    get_itinerary_by_id
)
from crud.crud_tracking import (
    get_stop_with_radius, get_checkin_by_stop, create_checkin_progress, 
    update_checkin_status, create_deviation_log, verify_stop_ownership, verify_stop_in_itinerary, create_gps_log,
    get_stop_with_ownership
)
from crud.crud_itinerary import update_itinerary_status, get_itinerary_history
from models import Locations, ItineraryDays, ItineraryStops, ItineraryRoutes, ItineraryStatus, StopStatus, DeviationLogs, Itineraries

from core.algorithms import check_within_radius, tsp_dp_bitmask
from core.google_maps import get_route_polyline

router = APIRouter(prefix="/api/trips", tags=["Trips - Lộ trình & Theo dõi"])

def get_current_user_id(db: Session, current_user_dict: dict) -> UUID:
    """Lấy user_id thực tế từ database dựa trên token sub."""
    user_id_str = current_user_dict.get("sub")
    try:
        user_id = UUID(user_id_str)
    except Exception:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")
        
    user = db.get(crud_user.Users, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User không tồn tại")
    return user.user_id

@router.get("/history", response_model=list[ItineraryHistoryItem], summary="Xem lịch sử chuyến đi")
def get_trip_history(
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    user_id = get_current_user_id(db, current_user)
    history = get_itinerary_history(db, user_id=user_id)
    return history

@router.put("/{itinerary_id}/complete", response_model=MessageResponse, summary="Hoàn thành chuyến đi")
def complete_trip(
    itinerary_id: UUID,
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    from sqlmodel import func, select
    from api.achievements import check_and_update_achievements
    from models import UserProfiles, ItineraryStops, ItineraryDays, Itineraries
    
    user_id = get_current_user_id(db, current_user)
    
    trip = get_itinerary_by_id(db, itinerary_id)
    if not trip or trip.user_id != user_id:
        raise HTTPException(status_code=403, detail="Lộ trình không tồn tại hoặc không thuộc về bạn")
        
    if trip.status == ItineraryStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Chuyến đi này đã được hoàn thành")
        
    # Tính số trạm đã check-in
    stmt_completed = (
        select(func.count(ItineraryStops.stop_id))
        .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
        .where(ItineraryDays.itinerary_id == itinerary_id)
        .where(ItineraryStops.status == StopStatus.COMPLETED)
    )
    completed_stops = db.exec(stmt_completed).one()
    
    stmt_total = (
        select(func.count(ItineraryStops.stop_id))
        .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
        .where(ItineraryDays.itinerary_id == itinerary_id)
    )
    total_stops = db.exec(stmt_total).one()
    
    # Tính điểm
    distance_km = float(trip.total_distance)
    is_perfect = (completed_stops == total_stops and total_stops > 0)
    
    completion_score = int(
        (completed_stops * 20) + 
        (distance_km * 5) + 
        (100 if is_perfect else 0)
    )
    
    # Cập nhật trạng thái
    trip.status = ItineraryStatus.COMPLETED
    trip.score_earned = completion_score
    trip.update_at = datetime.utcnow()
    db.add(trip)
    
    # Cộng điểm thưởng lộ trình cho user profile
    stmt_prof = select(UserProfiles).where(UserProfiles.user_id == user_id)
    profile = db.exec(stmt_prof).first()
    if profile:
        profile.total_points += completion_score
        profile.points_balance += completion_score
        db.add(profile)
        
    # Kích hoạt kiểm tra thành tựu
    unlocked_msg = ""
    new_unlocks = check_and_update_achievements(db, user_id, "complete_itinerary", amount=1)
    if distance_km > 0:
        new_unlocks += check_and_update_achievements(db, user_id, "distance", amount=int(distance_km))
    if is_perfect:
        new_unlocks += check_and_update_achievements(db, user_id, "perfect_trip", amount=1)
        
    if new_unlocks:
        titles = ", ".join([f"[{ach['badge_icon']} {ach['title']}]" for ach in new_unlocks])
        unlocked_msg = f" 🎉 Bạn đã mở khóa thành tựu mới: {titles}!"
        
    db.commit()
    return MessageResponse(detail=f"Chúc mừng bạn đã hoàn thành chuyến đi! Bạn nhận được {completion_score} điểm tích lũy.{unlocked_msg}")

@router.put("/{itinerary_id}/cancel", response_model=MessageResponse, summary="Hủy chuyến đi")
def cancel_trip(
    itinerary_id: UUID,
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    user_id = get_current_user_id(db, current_user)
    
    trip = get_itinerary_by_id(db, itinerary_id)
    if not trip or trip.user_id != user_id:
        raise HTTPException(status_code=403, detail="Lộ trình không tồn tại hoặc không thuộc về bạn")
        
    if trip.status == ItineraryStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Chuyến đi này đã bị hủy")
    
    if trip.status == ItineraryStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Không thể hủy chuyến đi đã hoàn thành")
        
    update_itinerary_status(db, itinerary_id=itinerary_id, new_status=ItineraryStatus.CANCELLED)
    
    return MessageResponse(detail="Chuyến đi đã được hủy.")

@router.get("/{itinerary_id}/deviation-status", response_model=DeviationAlert, summary="Kiểm tra trạng thái lệch hướng")
def get_deviation_status(
    itinerary_id: UUID,
    db: Session = Depends(get_session),
):
    """
    Kiểm tra xem lộ trình có bản ghi lệch hướng gần đây (trong 5 phút) không.
    Frontend gọi endpoint này khi nhấn Refresh.
    """
    from datetime import timezone
    five_min_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
    
    statement = (
        select(DeviationLogs)
        .where(DeviationLogs.itinerary_id == itinerary_id)
        .where(DeviationLogs.alert_time >= five_min_ago)
        .order_by(DeviationLogs.alert_time.desc())
    )
    recent = db.exec(statement).first()
    
    if recent:
        return DeviationAlert(
            is_deviated=True,
            distance_to_target=0,
            message="Cảnh báo: Bạn đang đi lệch khỏi lộ trình!"
        )
    return DeviationAlert(
        is_deviated=False,
        distance_to_target=0,
        message="Bạn đang đi đúng hướng"
    )

@router.post("/create", response_model=ItineraryResponse, summary="Tạo lộ trình mới")
def create_new_itinerary(
    request: CreateItineraryRequest, 
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    user_id = get_current_user_id(db, current_user)

    # 1. Validate locations
    if not request.location_ids:
        raise HTTPException(status_code=400, detail="Vui lòng chọn ít nhất 1 địa điểm để tạo lộ trình.")

    locations = get_location_by_ids(db, request.location_ids)
    found_ids = {loc.location_id for loc in locations}
    missing = [lid for lid in request.location_ids if lid not in found_ids]
    if missing:
        raise HTTPException(status_code=400, detail=f"Không tìm thấy địa điểm: {missing}")

    loc_map = {loc.location_id: loc for loc in locations}
    
    # 1.1 Lấy ngân sách từ PlanningSession
    from models import PlanningSessions
    session_plan = db.get(PlanningSessions, request.session_id)
    if not session_plan:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên lập kế hoạch.")
    
    total_user_budget = float(session_plan.budget)
    
    # 1.2 Tính toán tổng min_price và max_price để phân bổ
    total_min = sum(float(loc.min_price) for loc in locations)
    total_max = sum(float(loc.max_price) for loc in locations)
    total_range = total_max - total_min

    # 1.3 Thuật toán phân bổ ngân sách cho từng địa điểm
    allocated_prices = {}
    budget_category = "MEDIUM"
    warning_message = None

    if total_user_budget < total_min:
        # Ngân sách thấp hơn cả mức tối thiểu -> Phân bổ tỷ lệ thuận theo giá sàn và ép vào budget
        budget_category = "LOW"
        warning_message = f"Cảnh báo: Ngân sách của bạn ({total_user_budget:,.0f}đ) thấp hơn mức tối thiểu tổng cộng ({total_min:,.0f}đ). Hệ thống sẽ cố gắng phân bổ trong giới hạn."
        for loc in locations:
            # Tỷ lệ của địa điểm này trong tổng giá sàn
            share_ratio = float(loc.min_price) / total_min if total_min > 0 else 0
            # Cấp phát theo tỷ lệ của budget người dùng, làm tròn xuống hàng nghìn
            allocated_prices[loc.location_id] = math.floor((share_ratio * total_user_budget) / 1000) * 1000
    elif total_user_budget >= total_max:
        # Ngân sách dồi dào -> dùng max_price
        budget_category = "HIGH"
        for loc in locations:
            allocated_prices[loc.location_id] = float(loc.max_price)
    else:
        # Ngân sách nằm giữa min và max -> phân bổ tỷ lệ thuận theo thặng dư
        budget_category = "MEDIUM"
        surplus = total_user_budget - total_min
        for loc in locations:
            loc_range = float(loc.max_price) - float(loc.min_price)
            if total_range > 0:
                share = (loc_range / total_range) * surplus
                raw_price = float(loc.min_price) + share
                # Dùng math.floor để không bao giờ vượt quá ngân sách
                allocated_prices[loc.location_id] = math.floor(raw_price / 1000) * 1000
            else:
                raw_price = float(loc.min_price) + (surplus / len(locations))
                allocated_prices[loc.location_id] = math.floor(raw_price / 1000) * 1000

    
    try:
        # 2. Tạo bản ghi Itinerary (Lộ trình tổng)
        trip = create_itinerary(
            db, session_id=request.session_id, user_id=user_id, name=request.name, 
            total_travel_time=0, budget_category=budget_category, commit=False
        )
        # 3. Phân bổ ngày (Day Clustering)
        # Giả sử request có truyền end_date, nếu không mặc định là 1 ngày
        num_days = 1
        if hasattr(request, 'end_date') and request.end_date:
            num_days = max(1, (request.end_date - request.start_date).days + 1)
        
        # Chia đều số lượng địa điểm ra các ngày
        chunk_size = math.ceil(len(request.location_ids) / num_days)
        chunks = [request.location_ids[i:i + chunk_size] for i in range(0, len(request.location_ids), chunk_size)]

        global_total_time = 0
        global_total_distance = 0.0
        global_total_budget = 0.0

        # 4. Tối ưu TSP & Tính thời gian từng ngày
        for day_index, chunk_ids in enumerate(chunks):
            current_date = request.start_date + timedelta(days=day_index)

            # Chuẩn bị data cho TSP: List[(id, lat, lon)]
            tsp_input = [(lid, float(loc_map[lid].latitude), float(loc_map[lid].longitude)) for lid in chunk_ids]

            # MỚI: Nếu là ngày đầu tiên và có GPS người dùng, chèn GPS vào đầu danh sách để làm điểm xuất phát
            if day_index == 0 and request.start_lat is not None and request.start_lon is not None:
                # Dùng một UUID ảo hoặc None cho ID của điểm xuất phát
                tsp_input.insert(0, ("START_POINT", float(request.start_lat), float(request.start_lon)))

            # Gọi thuật toán tối ưu của team để lấy thứ tự đi chuẩn nhất
            optimized_ids, daily_dist = tsp_dp_bitmask(tsp_input)

            # Nếu có điểm xuất phát ảo, loại bỏ nó khỏi danh sách ID kết quả (vì nó không phải địa điểm tham quan)
            if "START_POINT" in optimized_ids:
                optimized_ids.remove("START_POINT")

            # Tính toán ngân sách dự kiến cho ngày này dựa trên allocated_prices đã tính
            day_budget = sum(allocated_prices[lid] for lid in chunk_ids)
            global_total_budget += day_budget
            
            # Tạo bản ghi Day
            day = create_itinerary_day(
                db, itinerary_id=trip.itinerary_id, day_order=day_index + 1,
                travel_date=current_date.isoformat(), total_time=0, estimated_budget=day_budget, commit=False
            )

            # Setup thời gian bắt đầu đi chơi (VD: 8:00 AM)
            current_dt = datetime.combine(current_date, time(8, 0))
            daily_time = 0

            # Biến tạm để giữ ID của trạm trước đó (phục vụ vẽ Route)
            prev_stop_id = None

            for order, loc_id in enumerate(optimized_ids, start=1):
                loc = loc_map[loc_id]

                # Vẽ Route từ trạm trước đến trạm này và cộng thời gian di chuyển TRƯỚC KHI tính thời gian đến
                if prev_stop_id is not None:
                    prev_loc = loc_map[optimized_ids[order - 2]]
                    route_info = get_route_polyline(
                        float(prev_loc.latitude), float(prev_loc.longitude),
                        float(loc.latitude), float(loc.longitude)
                    )
                    
                    # === DEBUG: Log nguồn tính toán ===
                    print(f"Route: {prev_loc.location_name} -> {loc.location_name}")
                    print(f"   Source: {route_info.source.upper()}")
                    print(f"   Distance: {route_info.distance_km} km")
                    print(f"   Time: {route_info.travel_time_min} phut")
                    print(f"   Polyline: {route_info.polyline_data[:40]}...")
                    
                    # Cộng thời gian di chuyển vào current_dt
                    if route_info is not None:
                        current_dt += timedelta(minutes=route_info.travel_time_min)
                        daily_time += route_info.travel_time_min
                else:
                    route_info = None
                    print(f"Diem xuat phat: {loc.location_name} (Ngay {day_index + 1})")

                # Thời gian đến (Arrival)
                arrival_time = current_dt.time()

                # Giả định thời gian chơi mặc định tại 1 điểm là 90 phút (có thể lấy từ DB sau)
                play_duration_mins = 90
                current_dt += timedelta(minutes=play_duration_mins)
                departure_time = current_dt.time()

                # Lưu Stop vào DB kèm ngân sách đã phân bổ
                new_stop = create_itinerary_stop(
                    db, day_id=day.day_id, location_id=loc_id, stop_order=order,
                    arrival_time=arrival_time, departure_time=departure_time, 
                    estimated_price=allocated_prices[loc_id], commit=False
                )
                daily_time += play_duration_mins

                # Bây giờ mới tạo Route vì đã có new_stop.stop_id
                if prev_stop_id is not None and route_info is not None:
                    create_itinerary_route(
                        db, from_stop_id=prev_stop_id, to_stop_id=new_stop.stop_id,
                        travel_time=route_info.travel_time_min, distance=route_info.distance_km, polyline=route_info.polyline_data, commit=False
                    )
                    global_total_distance += route_info.distance_km
                    
                prev_stop_id = new_stop.stop_id

            global_total_time += daily_time
            print(f"Ngay {day_index + 1}: Tong {daily_time} phut")

        # 5. Cập nhật tổng thời gian chuyến đi và ngân sách
        trip.total_travel_time = global_total_time
        trip.total_distance = round(global_total_distance, 2)
        trip.total_budget = global_total_budget
        db.add(trip)
        
        # 6. Commit toàn bộ Transaction
        db.commit()
        db.refresh(trip)

        # Reload
        full_trip = get_itinerary_by_id(db, trip.itinerary_id)
        resp = ItineraryResponse.model_validate(full_trip)
        resp.warning_message = warning_message
        return resp
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống khi tạo lộ trình: {str(e)}")


@router.get("/{itinerary_id}", response_model=ItineraryDetailResponse, summary="Xem chi tiết lộ trình")
def get_trip_detail(itinerary_id: UUID, db: Session = Depends(get_session)):
    from models import ItineraryRoutes
    
    trip = get_itinerary_by_id(db, itinerary_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Không tìm thấy chuyến đi")
    
    # 1. Viết câu SQL nối bảng (JOIN) để gom toàn bộ Stops, Days và Locations của Lộ trình này
    statement = (
        select(ItineraryStops, ItineraryDays, Locations)
        .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
        .join(Locations, ItineraryStops.location_id == Locations.location_id)
        .where(ItineraryDays.itinerary_id == itinerary_id)
        .order_by(ItineraryDays.day_order, ItineraryStops.stop_order) # Sắp xếp theo thứ tự đi
    )
    
    stops_data = db.exec(statement).all()
    
    # Lấy categories cho các location
    from models import LocationCategories, Categories
    location_ids = [loc.location_id for _, _, loc in stops_data]
    cat_map = {}
    if location_ids:
        cat_statement = (
            select(LocationCategories.location_id, Categories.category_name)
            .join(Categories, LocationCategories.category_id == Categories.category_id)
            .where(LocationCategories.location_id.in_(location_ids))
        )
        cat_results = db.exec(cat_statement).all()
        for loc_id, cat_name in cat_results:
            cat_map[loc_id] = cat_name  # Lấy 1 category
            
    # 2. Biến SQLModel object thành Dictionary
    trip_data = trip.model_dump() 
    
    # 3. Nhét thêm danh sách stops vào dictionary
    stop_dicts = []
    all_stop_ids = []
    for idx, (stop, day, loc) in enumerate(stops_data, start=1):
        stop_dict = stop.model_dump()
        stop_dict["stop_order"] = idx
        
        # Bổ sung thông tin từ bảng ItineraryDays
        stop_dict["day_order"] = day.day_order
        stop_dict["travel_date"] = day.travel_date
        
        # Bổ sung thông tin từ bảng Locations
        stop_dict["location_name"] = loc.location_name
        stop_dict["latitude"] = loc.latitude
        stop_dict["longitude"] = loc.longitude
        stop_dict["open_time"] = loc.open_time
        stop_dict["close_time"] = loc.close_time
        stop_dict["min_price"] = loc.min_price
        stop_dict["max_price"] = loc.max_price
        stop_dict["estimated_price"] = stop.estimated_price
        stop_dict["category_name"] = cat_map.get(loc.location_id)
        
        stop_dicts.append(stop_dict)
        all_stop_ids.append(stop.stop_id)
        
    trip_data["stops"] = stop_dicts
    
    # 4. Lấy routes (polyline) giữa các trạm dừng
    routes_data = []
    if all_stop_ids:
        route_statement = (
            select(ItineraryRoutes)
            .where(ItineraryRoutes.from_stop_id.in_(all_stop_ids))
            .order_by(ItineraryRoutes.route_id)
        )
        routes = db.exec(route_statement).all()
        routes_data = [r.model_dump() for r in routes]
    
    trip_data["routes"] = routes_data
    
    # 5. Đưa dictionary vào khuôn Pydantic
    return ItineraryDetailResponse(**trip_data)


@router.post("/{stop_id}/checkin", response_model=CheckInResponse, summary="Check-in tại trạm")
def checkin_stop(
    stop_id: int, 
    request: CheckInRequest, 
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    from sqlalchemy.exc import IntegrityError
    
    user_id = get_current_user_id(db, current_user)
    
    # Lớp 0+1 GỘP: Kiểm tra quyền sở hữu + Lấy dữ liệu trạm trong 1 query duy nhất
    stop_data = get_stop_with_ownership(db, user_id, stop_id)
    if not stop_data:
        raise HTTPException(status_code=403, detail="Trạm không tồn tại hoặc không thuộc lộ trình của bạn.")
        
    # Lớp 3: Kiểm tra không gian (bán kính)
    is_within, distance = check_within_radius(
        request.latitude, request.longitude,
        float(stop_data.latitude), float(stop_data.longitude),
        radius_m=stop_data.checkin_radius
    )

    # --- HACK FOR DEMO ---
    # Luôn cho phép check-in bất chấp khoảng cách
    is_within = True  
    # ---------------------

    if not is_within:
        raise HTTPException(
            status_code=400,
            detail=f"Bạn cách trạm {distance:.0f}m. Cần ở trong phạm vi {stop_data.checkin_radius}m để check-in."
        )

    # Lớp 2: Kiểm tra lịch sử check-in tránh click đúp hoặc fake API
    existing_checkin = get_checkin_by_stop(db, user_id, stop_id)
    if existing_checkin:
        if existing_checkin.is_completed:
            raise HTTPException(status_code=409, detail="Bạn đã check-in trạm này rồi!")
        else:
            progress_id = existing_checkin.progress_id
    else:
        # Xử lý check-in (Tạo progress)
        try:
            progress = create_checkin_progress(db, user_id=user_id, stop_id=stop_id, latitude=request.latitude, longitude=request.longitude)
            progress_id = progress.progress_id
        except IntegrityError:
            # Race condition: request khác đã tạo rồi → rollback và query lại
            db.rollback()
            existing_checkin = get_checkin_by_stop(db, user_id, stop_id)
            if not existing_checkin:
                raise HTTPException(status_code=500, detail="Lỗi hệ thống khi tạo tiến trình check-in.")
            if existing_checkin.is_completed:
                raise HTTPException(status_code=409, detail="Bạn đã check-in trạm này rồi!")
            progress_id = existing_checkin.progress_id

    # Cập nhật trạng thái
    _, _, is_new_completion = update_checkin_status(db, progress_id=progress_id, stop_id=stop_id, latitude=request.latitude, longitude=request.longitude)
    
    if not is_new_completion:
        raise HTTPException(status_code=409, detail="Trạm này vừa được check-in thành công!")

    # Tăng lượt checkin tại địa điểm
    increment_location_checkin_count(db, stop_data.location_id)

    # TÍNH ĐIỂM THƯỞNG — dựa trên khoảng cách giữa các trạm
    # Tra cứu route đến trạm này (đã tính sẵn khi tạo lộ trình, KHÔNG gọi thêm API)
    route_to_stop = db.exec(
        select(ItineraryRoutes).where(ItineraryRoutes.to_stop_id == stop_id)
    ).first()
    
    if route_to_stop is not None:
        distance_km = float(route_to_stop.distance)
        # Custom rounding: phần thập phân >= 0.8 làm tròn lên, < 0.8 làm tròn xuống
        frac = distance_km - math.floor(distance_km)
        earned_points = math.ceil(distance_km) if frac >= 0.8 else math.floor(distance_km)
        earned_points = max(1, earned_points)  # Tối thiểu 1 điểm
    else:
        # Trạm đầu tiên (không có route đến) → 10 điểm mặc định
        earned_points = 10
    
    # Lưu điểm thưởng vào stop để frontend hiển thị được — dùng UPDATE trực tiếp
    from sqlalchemy import update as sa_update
    db.execute(
        sa_update(ItineraryStops)
        .where(ItineraryStops.stop_id == stop_id)
        .values(reward=earned_points)
    )
    
    # Cộng điểm vào total_points và points_balance lập tức (Tạo mới profile nếu chưa tồn tại)
    from models import UserProfiles
    statement = select(UserProfiles).where(UserProfiles.user_id == user_id)
    profile = db.exec(statement).first()
    if not profile:
        from models import Users, GenderEnum
        from datetime import date
        user_record = db.exec(select(Users).where(Users.user_id == user_id)).first()
        full_name = user_record.full_name if user_record else "Khách du lịch"
        profile = UserProfiles(
            user_id=user_id,
            full_name=full_name,
            date_of_birth=date(2000, 1, 1),
            gender=GenderEnum.OTHER,
            total_points=0,
            points_balance=0
        )
    profile.total_points += earned_points
    profile.points_balance += earned_points
    db.add(profile)

    # Kích hoạt kiểm tra thành tựu Check-in
    location_name_lower = stop_data.location_name.lower()
    is_cafe = any(kw in location_name_lower for kw in ["cafe", "cà phê", "coffee", "trà", "tea"])
    
    from api.achievements import check_and_update_achievements
    new_unlocks = []
    if is_cafe:
        new_unlocks += check_and_update_achievements(db, user_id, "cafe_checkin", amount=1)

    # AUTO-COMPLETE: Nếu tất cả trạm đã check-in → tự động hoàn thành chuyến đi
    itinerary_id = stop_data.itinerary_id
    pending_stop = db.exec(
        select(ItineraryStops.stop_id)
        .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
        .where(
            ItineraryDays.itinerary_id == itinerary_id,
            ItineraryStops.status != StopStatus.COMPLETED
        )
    ).first()
    
    auto_completed = False
    completion_score = 0
    if pending_stop is None:
        # Tất cả trạm đã hoàn thành → auto-complete trip
        trip = db.exec(select(Itineraries).where(Itineraries.itinerary_id == itinerary_id)).first()
        if trip and trip.status not in (ItineraryStatus.COMPLETED, ItineraryStatus.CANCELLED):
            from sqlmodel import func
            
            # Tính số trạm đã check-in
            stmt_completed = (
                select(func.count(ItineraryStops.stop_id))
                .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
                .where(ItineraryDays.itinerary_id == itinerary_id)
                .where(ItineraryStops.status == StopStatus.COMPLETED)
            )
            completed_stops = db.exec(stmt_completed).one()
            
            stmt_total = (
                select(func.count(ItineraryStops.stop_id))
                .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
                .where(ItineraryDays.itinerary_id == itinerary_id)
            )
            total_stops = db.exec(stmt_total).one()
            
            distance_km = float(trip.total_distance)
            is_perfect = (completed_stops == total_stops and total_stops > 0)
            
            completion_score = int(
                (completed_stops * 20) + 
                (distance_km * 5) + 
                (100 if is_perfect else 0)
            )
            
            trip.status = ItineraryStatus.COMPLETED
            trip.score_earned = completion_score
            trip.update_at = datetime.utcnow()
            db.add(trip)
            
            # Cộng điểm thưởng lộ trình vào profile
            if profile:
                profile.total_points += completion_score
                profile.points_balance += completion_score
                db.add(profile)
                
            # Kích hoạt các thành tựu hoàn thành lộ trình
            new_unlocks += check_and_update_achievements(db, user_id, "complete_itinerary", amount=1)
            if distance_km > 0:
                new_unlocks += check_and_update_achievements(db, user_id, "distance", amount=int(distance_km))
            if is_perfect:
                new_unlocks += check_and_update_achievements(db, user_id, "perfect_trip", amount=1)
                
            auto_completed = True

    # KHÔNG cần db.commit() — get_session() tự commit khi request thành công
    # KHÔNG cần db.rollback() — get_session() tự rollback khi có exception

    unlocked_msg = ""
    if new_unlocks:
        titles = ", ".join([f"[{ach['badge_icon']} {ach['title']}]" for ach in new_unlocks])
        unlocked_msg = f" 🎉 Thành tựu mới: {titles}!"

    if auto_completed:
        return CheckInResponse(
            success=True,
            message=f"✅ Check-in thành công! +{earned_points} điểm. 🎉 Lộ trình hoàn thành! Bạn nhận thêm +{completion_score} điểm tích lũy.{unlocked_msg}",
            stop_id=stop_id,
            progress_id=progress_id,
            earned_points=earned_points
        )

    return CheckInResponse(
        success=True,
        message=f"✅ Check-in thành công! Bạn nhận được {earned_points} điểm thưởng.{unlocked_msg}",
        stop_id=stop_id,
        progress_id=progress_id,
        earned_points=earned_points
    )


@router.post("/tracking", response_model=DeviationAlert, summary="Gửi tọa độ GPS & Kiểm tra chệch hướng")
def track_user_location(
    request: TrackingRequest,
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    """
    Bắt tọa độ GPS từ Mobile. 
    Nếu User cách xa đường đi mặc định > 5km -> Trả về cảnh báo chệch hướng.
    """
    user_id = get_current_user_id(db, current_user)
    
    # 0. Kiểm tra quyền sở hữu lộ trình
    trip = get_itinerary_by_id(db, request.itinerary_id)
    if not trip or trip.user_id != user_id:
        raise HTTPException(status_code=403, detail="Lộ trình không tồn tại hoặc không thuộc về bạn")
        
    # 0.1 Kiểm tra trạm có thuộc lộ trình không
    if not verify_stop_in_itinerary(db, request.itinerary_id, request.current_stop_id):
        raise HTTPException(status_code=400, detail="Trạm không thuộc lộ trình này")

    # 1. Lấy thông tin Stop hiện tại User đang hướng tới
    stop_data = get_stop_with_radius(db, request.current_stop_id)
    if not stop_data:
        raise HTTPException(status_code=404, detail="Không tìm thấy trạm dừng")
    

    # 2. Tính khoảng cách tới trạm đó
    from core.algorithms import haversine
    dist_km = haversine(
        request.latitude, request.longitude,
        float(stop_data.latitude), float(stop_data.longitude)
    )

    # 3. Lấy hoặc tạo CheckinProgress để lưu tracking GPS
    progress = get_checkin_by_stop(db, user_id, request.current_stop_id)
    if not progress:
        progress = create_checkin_progress(
            db, user_id=user_id, stop_id=request.current_stop_id,
            latitude=request.latitude, longitude=request.longitude
        )
        
    create_gps_log(
        db, progress_id=progress.progress_id,
        latitude=request.latitude, longitude=request.longitude
    )

    # Logic cảnh báo: Nếu cách trạm > 5km (tùy chỉnh) khi đang trong hành trình
    is_deviated = dist_km > 5.0
    # Ghi log lịch sử nếu bị lệch để sau này admin/hệ thống phân tích
    if is_deviated:
        create_deviation_log(
            db, 
            itinerary_id=request.itinerary_id, 
            latitude=request.latitude, 
            longitude=request.longitude
        ) 
    
    return DeviationAlert(
        is_deviated=is_deviated,
        distance_to_target=round(dist_km * 1000, 2),
        message="Bạn đang đi đúng hướng" if not is_deviated else "Cảnh báo: Bạn đang đi lệch khỏi lộ trình!"
    )