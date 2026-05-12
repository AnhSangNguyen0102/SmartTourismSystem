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
    update_checkin_status, create_deviation_log, verify_stop_ownership, verify_stop_in_itinerary, create_gps_log
)
from crud.crud_itinerary import update_itinerary_status, get_itinerary_history
from models import Locations, ItineraryDays, ItineraryStops, ItineraryStatus, DeviationLogs

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
    user_id = get_current_user_id(db, current_user)
    
    trip = get_itinerary_by_id(db, itinerary_id)
    if not trip or trip.user_id != user_id:
        raise HTTPException(status_code=403, detail="Lộ trình không tồn tại hoặc không thuộc về bạn")
        
    if trip.status == ItineraryStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Chuyến đi này đã được hoàn thành")
        
    update_itinerary_status(db, itinerary_id=itinerary_id, new_status=ItineraryStatus.COMPLETED)
    
    return MessageResponse(detail="Chúc mừng bạn đã hoàn thành chuyến đi!")

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
    
    try:
        # 2. Tạo bản ghi Itinerary (Lộ trình tổng)
        trip = create_itinerary(db, session_id=request.session_id, user_id=user_id, name=request.name, total_travel_time=0, commit=False)
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

            # Gọi thuật toán tối ưu của team để lấy thứ tự đi chuẩn nhất
            optimized_ids, daily_dist = tsp_dp_bitmask(tsp_input)

            # Tính toán ngân sách dự kiến cho ngày này dựa trên min_price của các địa điểm
            day_budget = sum(float(loc_map[lid].min_price) for lid in chunk_ids)
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
                    # Gọi Google Maps Directions
                    route_info = get_route_polyline(
                        float(prev_loc.latitude), float(prev_loc.longitude),
                        float(loc.latitude), float(loc.longitude)
                    )
                    
                    # Cộng thời gian di chuyển vào current_dt
                    if route_info is not None:
                        current_dt += timedelta(minutes=route_info.travel_time_min)
                        daily_time += route_info.travel_time_min
                else:
                    route_info = None

                # Thời gian đến (Arrival)
                arrival_time = current_dt.time()

                # Giả định thời gian chơi mặc định tại 1 điểm là 90 phút (có thể lấy từ DB sau)
                play_duration_mins = 90
                current_dt += timedelta(minutes=play_duration_mins)
                departure_time = current_dt.time()

                # Lưu Stop vào DB
                new_stop = create_itinerary_stop(
                    db, day_id=day.day_id, location_id=loc_id, stop_order=order,
                    arrival_time=arrival_time, departure_time=departure_time, commit=False
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
        return ItineraryResponse.model_validate(full_trip)

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống khi tạo lộ trình: {str(e)}")


@router.get("/{itinerary_id}", response_model=ItineraryDetailResponse, summary="Xem chi tiết lộ trình")
def get_trip_detail(itinerary_id: UUID, db: Session = Depends(get_session)):
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
    
    # 2. Biến SQLModel object thành Dictionary
    trip_data = trip.model_dump() 
    
    # 3. Nhét thêm danh sách stops vào dictionary
    stop_dicts = []
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
        
        stop_dicts.append(stop_dict)
        
    trip_data["stops"] = stop_dicts
    
    # 3. Đưa dictionary vào khuôn Pydantic
    return ItineraryDetailResponse(**trip_data)


@router.post("/{stop_id}/checkin", response_model=CheckInResponse, summary="Check-in tại trạm")
def checkin_stop(
    stop_id: int, 
    request: CheckInRequest, 
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    user_id = get_current_user_id(db, current_user)
    
    # Lớp 0: Kiểm tra quyền sở hữu (IDOR protection)
    if not verify_stop_ownership(db, user_id, stop_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền check-in tại trạm này (không thuộc lộ trình của bạn).")
    
    stop_data = get_stop_with_radius(db, stop_id)
    if not stop_data:
        raise HTTPException(status_code=404, detail="Không tìm thấy trạm dừng")
        
    # Lớp 3: Kiểm tra không gian (bán kính)
    is_within, distance = check_within_radius(
        request.latitude, request.longitude,
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
        # Xử lý check-in (Tạo progress -> Đổi trạng thái)
        progress = create_checkin_progress(db, user_id=user_id, stop_id=stop_id, latitude=request.latitude, longitude=request.longitude)
        progress_id = progress.progress_id

    update_checkin_status(db, progress_id=progress_id, stop_id=stop_id, latitude=request.latitude, longitude=request.longitude)
    
    # Tăng lượt checkin tại địa điểm
    increment_location_checkin_count(db, stop_data.location_id)

    # CỘNG ĐIỂM THƯỞNG CHO USER
    earned_points = getattr(stop_data, 'reward', 0)
    if earned_points > 0:
        from models import UserProfiles
        statement = select(UserProfiles).where(UserProfiles.user_id == user_id)
        profile = db.exec(statement).first()
        if profile:
            profile.total_points += earned_points
            db.add(profile)
            db.commit()

    return CheckInResponse(
        success=True,
        message=f"✅ Check-in thành công! Bạn nhận được {earned_points} điểm thưởng.",
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