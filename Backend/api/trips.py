from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, time
import math
from uuid import UUID
from sqlmodel import select
from database import get_session
from core.config import settings
import core.security as security
import crud.crud_user as crud_user
from schemas import (
    CreateItineraryRequest, ItineraryResponse,
    CheckInRequest, CheckInResponse, ItineraryDetailResponse,
    ItineraryHistoryItem, MessageResponse
)
from crud.crud_location import get_location_by_ids, increment_location_checkin_count
from crud.crud_trip import (
    create_itinerary, create_itinerary_day, create_itinerary_stop,
    get_itinerary_by_id
)
from crud.crud_tracking import (
    get_checkin_by_stop, create_checkin_progress, update_checkin_status,
    get_stop_with_ownership
)
from crud.crud_itinerary import update_itinerary_status, get_itinerary_history
from models import Locations, ItineraryDays, ItineraryStops, ItineraryStatus, StopStatus, Itineraries

from core.algorithms import check_within_radius

router = APIRouter(prefix="/api/trips", tags=["Trips - Chuyến đi & Check-in"])

def dev_log(message: str) -> None:
    if settings.ENVIRONMENT.lower() == "development":
        print(message)

def validate_coordinates(latitude, longitude) -> tuple[float, float]:
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Tọa độ GPS không hợp lệ")

    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise HTTPException(status_code=400, detail="Tọa độ GPS nằm ngoài phạm vi hợp lệ")
    return lat, lon

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
    
    # Tự động hủy các chuyến đi đã hết hạn của user này
    from crud.crud_itinerary import auto_cancel_expired_trips
    auto_cancel_expired_trips(db, user_id=user_id)
    
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
        
    # Nếu đã hoàn thành trước đó (do Auto-Complete), trả về dữ liệu an toàn luôn
    if trip.status == ItineraryStatus.COMPLETED:
        stmt_prof = select(UserProfiles).where(UserProfiles.user_id == user_id)
        profile = db.exec(stmt_prof).first()
        return MessageResponse(
            detail=f"Chuyến đi này đã được hoàn thành thành công trước đó!",
            completion_score=trip.score_earned or 0,
            earned_from_trip=trip.score_earned or 0,
            total_rewarded=trip.score_earned or 0,
            new_total_points=profile.total_points if profile else None,
            new_points_balance=profile.points_balance if profile else None,
        )
        
    # Kiểm tra xem có đi đủ 100% số trạm để phát quà thưởng Perfect danh giá không
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
    
    is_perfect = (completed_stops == total_stops and total_stops > 0)
    
    # Chỉ nhận thêm 100 điểm thưởng nếu đạt trạng thái đi đủ tất cả các điểm dừng
    completion_score = 100 if is_perfect else 0
    
    # Cập nhật trạng thái lộ trình
    trip.status = ItineraryStatus.COMPLETED
    trip.score_earned = completion_score
    trip.update_at = datetime.utcnow()
    db.add(trip)
    
    # --- ĐÃ SỬA LỖI: Đưa đoạn lấy dữ liệu profile lên TRƯỚC khi gọi câu lệnh "if profile:" ---
    stmt_prof = select(UserProfiles).where(UserProfiles.user_id == user_id)
    profile = db.exec(stmt_prof).first()

    current_points = profile.total_points if profile and profile.total_points else 0
    current_coins = profile.points_balance if profile and profile.points_balance else 0

    if profile:
        profile.total_points = current_points + completion_score
        profile.points_balance = current_coins + completion_score
        db.add(profile)
    # ------------------------------------------------------------------------------------
        
    # Kích hoạt kiểm tra thành tựu
    unlocked_msg = ""
    new_unlocks = check_and_update_achievements(db, user_id, "complete_itinerary", amount=1)
    if is_perfect:
        new_unlocks += check_and_update_achievements(db, user_id, "perfect_trip", amount=1)
        
    if new_unlocks:
        titles = ", ".join([f"[{ach['badge_icon']} {ach['title']}]" for ach in new_unlocks])
        unlocked_msg = f" 🎉 Bạn đã mở khóa thành tựu mới: {titles}!"
        
    db.commit()
    if profile:
        db.refresh(profile)

    if is_perfect:
        detail_msg = f"Chúc mừng bạn đã hoàn thành lộ trình xuất sắc! Bạn nhận được thêm +{completion_score} EXP và +{completion_score} xu thưởng hoàn hảo.{unlocked_msg}"
    else:
        detail_msg = f"Lộ trình du lịch đã được đóng lại thành công! Điểm của bạn đã được tích lũy đầy đủ qua từng trạm check-in trước đó.{unlocked_msg}"

    return MessageResponse(
        detail=detail_msg,
        completion_score=completion_score,
        earned_from_trip=trip.score_earned,
        total_rewarded=completion_score,
        new_total_points=profile.total_points if profile else None,
        new_points_balance=profile.points_balance if profile else None,
    )

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
    
    # Hủy chuyến đi - KHÔNG chuyển total_points sang points_balance
    db.commit()
    return MessageResponse(detail="Chuyến đi đã được hủy.")

@router.post("/create", response_model=ItineraryResponse, summary="Tạo chuyến đi mới")
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
        # 3. Chia danh sách người dùng chọn theo số ngày
        num_days = 1
        if hasattr(request, 'end_date') and request.end_date:
            num_days = max(1, (request.end_date - request.start_date).days + 1)
        
        # Chia đều số lượng địa điểm ra các ngày
        chunk_size = math.ceil(len(request.location_ids) / num_days)
        chunks = [request.location_ids[i:i + chunk_size] for i in range(0, len(request.location_ids), chunk_size)]

        global_total_time = 0
        global_total_budget = 0.0

        # 4. Giữ nguyên thứ tự địa điểm do người dùng chọn
        for day_index, chunk_ids in enumerate(chunks):
            current_date = request.start_date + timedelta(days=day_index)

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

            for order, loc_id in enumerate(chunk_ids, start=1):
                loc = loc_map[loc_id]

                # Thời gian đến (Arrival)
                arrival_time = current_dt.time()

                # Giả định thời gian chơi mặc định tại 1 điểm là 90 phút
                play_duration_mins = 90
                current_dt += timedelta(minutes=play_duration_mins)
                departure_time = current_dt.time()

                # Lưu Stop vào DB kèm ngân sách đã phân bổ
                create_itinerary_stop(
                    db, day_id=day.day_id, location_id=loc_id, stop_order=order,
                    arrival_time=arrival_time, departure_time=departure_time, 
                    estimated_price=allocated_prices[loc_id], commit=False
                )
                daily_time += play_duration_mins

            global_total_time += daily_time
            dev_log(f"Ngay {day_index + 1}: Tong {daily_time} phut")

        # 5. Cập nhật tổng thời gian chuyến đi và ngân sách
        trip.total_travel_time = global_total_time
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


@router.get("/{itinerary_id}", response_model=ItineraryDetailResponse, summary="Xem chi tiết chuyến đi")
def get_trip_detail(itinerary_id: UUID, db: Session = Depends(get_session)):
    from models import ItineraryRoutes, LocationsImage

    trip = get_itinerary_by_id(db, itinerary_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Không tìm thấy chuyến đi")
        
    # Tự động hủy nếu chuyến đi này (hoặc các chuyến đi khác của user) đã hết hạn
    from crud.crud_itinerary import auto_cancel_expired_trips
    auto_cancel_expired_trips(db, user_id=trip.user_id)
    db.refresh(trip)
    
    # 1. Viết câu SQL nối bảng (JOIN) để gom toàn bộ Stops, Days và Locations của Lộ trình này
    image_subquery = (
        select(LocationsImage.url)
        .where(LocationsImage.location_id == Locations.location_id)
        .order_by(LocationsImage.display_order.asc())
        .limit(1)
        .scalar_subquery()
    )

    statement = (
        select(ItineraryStops, ItineraryDays, Locations, image_subquery.label("image_url"))
        .join(ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id)
        .join(Locations, ItineraryStops.location_id == Locations.location_id)
        .where(ItineraryDays.itinerary_id == itinerary_id)
        .order_by(ItineraryDays.day_order, ItineraryStops.stop_order) # Sắp xếp theo thứ tự đi
    )
    
    stops_data = db.exec(statement).all()
    
    # Lấy categories cho các location
    from models import LocationCategories, Categories
    location_ids = [loc.location_id for _, _, loc, _ in stops_data]
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
    for idx, (stop, day, loc, image_url) in enumerate(stops_data, start=1):
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
        stop_dict["image_url"] = image_url
        
        stop_dicts.append(stop_dict)
        
    trip_data["stops"] = stop_dicts

    # 4. Đưa dictionary vào khuôn Pydantic
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

    checkin_lat, checkin_lon = validate_coordinates(request.latitude, request.longitude)
        
    # Lớp 3: Kiểm tra không gian (bán kính)
    is_within, distance = check_within_radius(
        checkin_lat, checkin_lon,
        float(stop_data.latitude), float(stop_data.longitude),
        radius_m=stop_data.checkin_radius
    )

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

    # Thay đổi định mức phần thưởng: 10 EXP gốc + 20 EXP thưởng trạm = 30 EXP
    earned_points = 30
    earned_coins = 20  # Cộng thẳng 20 xu của trạm vào đây thay vì đợi hoàn thành lộ trình
    
    # Lưu điểm thưởng vào stop để hệ thống ghi nhận — dùng UPDATE trực tiếp
    from sqlalchemy import update as sa_update
    db.execute(
        sa_update(ItineraryStops)
        .where(ItineraryStops.stop_id == stop_id)
        .values(reward=earned_points)
    )
    
    # Tích lũy điểm và xu thẳng vào hồ sơ tài khoản ngay khi hành động xảy ra
    from models import UserProfiles
    statement = select(UserProfiles).where(UserProfiles.user_id == user_id)
    profile = db.exec(statement).first()
    if profile:
        profile.total_points += earned_points
        profile.points_balance += earned_coins
        db.add(profile)

    # Kích hoạt kiểm tra thành tựu Check-in
    location_name_lower = stop_data.location_name.lower()
    is_cafe = any(kw in location_name_lower for kw in ["cafe", "cà phê", "coffee", "trà", "tea"])
    
    from api.achievements import check_and_update_achievements
    new_unlocks = []
    if is_cafe:
        new_unlocks += check_and_update_achievements(db, user_id, "cafe_checkin", amount=1)

    # AUTO-COMPLETE: Quét xem đã đi hết tất cả các trạm trong lộ trình chưa
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
        trip = db.exec(select(Itineraries).where(Itineraries.itinerary_id == itinerary_id)).first()
        if trip and trip.status not in (ItineraryStatus.COMPLETED, ItineraryStatus.CANCELLED):
            
            # GIỮ NGUYÊN: Thưởng thêm 100 EXP & 100 Xu độc quyền cho chuỗi Perfect Trip hoàn hảo
            completion_score = 100
            
            trip.status = ItineraryStatus.COMPLETED
            trip.score_earned = completion_score
            trip.update_at = datetime.utcnow()
            db.add(trip)
            
            if profile:
                profile.total_points = (profile.total_points or 0) + completion_score
                profile.points_balance = (profile.points_balance or 0) + completion_score
                db.add(profile)
                
            new_unlocks += check_and_update_achievements(db, user_id, "complete_itinerary", amount=1)
            new_unlocks += check_and_update_achievements(db, user_id, "perfect_trip", amount=1)
            auto_completed = True

    unlocked_msg = ""
    if new_unlocks:
        titles = ", ".join([f"[{ach['badge_icon']} {ach['title']}]" for ach in new_unlocks])
        unlocked_msg = f" 🎉 Thành tựu mới: {titles}!"

    if auto_completed:
        # Cập nhật trạng thái của trạm cuối cùng thành COMPLETED trước khi nộp response dữ liệu
        db.execute(
            sa_update(ItineraryStops)
            .where(ItineraryStops.stop_id == stop_id)
            .values(reward=earned_points, status=StopStatus.COMPLETED)
        )

        return CheckInResponse(
            success=True,
            message=f"✅ Check-in thành công! +{earned_points} EXP và +{earned_coins} Xu. 🎉 Lộ trình hoàn thành xuất sắc! Bạn nhận thêm +{completion_score} EXP vinh quang!{unlocked_msg}",
            stop_id=stop_id,
            progress_id=progress_id,
            earned_points=earned_points,
            is_itinerary_completed=True,
            completion_score=completion_score,
            total_rewarded=completion_score,
            new_total_points=profile.total_points if profile else None,
            new_points_balance=profile.points_balance if profile else None,
        )

    return CheckInResponse(
        success=True,
        message=f"✅ Check-in thành công! Bạn nhận được {earned_points} EXP và {earned_coins} xu.{unlocked_msg}",
        stop_id=stop_id,
        progress_id=progress_id,
        earned_points=earned_points
    )
