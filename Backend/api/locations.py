# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from database import get_session
from schemas import SuggestionRequest, SuggestionResponse, LocationOut
from crud.crud_location import get_locations_by_city, get_location_tags
from core.algorithms import score_location
from typing import Optional
from core.security import verify_token_optional
from models import Itineraries, ItineraryDays, ItineraryStops, StopStatus

router = APIRouter(prefix="/api/suggestions", tags=["Suggestion - Gợi ý địa điểm"])

@router.post("/recommend", response_model=SuggestionResponse, summary="Gợi ý địa điểm phù hợp")
def recommend_locations(request: SuggestionRequest, db: Session = Depends(get_session), current_user: Optional[dict] = Depends(verify_token_optional)):
    # 0. Lấy danh sách địa điểm đã đi nếu có token
    visited_location_ids = set()
    if current_user:
        user_id = current_user.get("user_id")
        if user_id:
            completed_stops = db.query(ItineraryStops.location_id).join(
                ItineraryDays, ItineraryStops.day_id == ItineraryDays.day_id
            ).join(
                Itineraries, ItineraryDays.itinerary_id == Itineraries.itinerary_id
            ).filter(
                Itineraries.user_id == user_id,
                ItineraryStops.status == StopStatus.COMPLETED
            ).all()
            visited_location_ids = {str(stop.location_id) for stop in completed_stops}

    # 1. Lấy tất cả địa điểm của thành phố
    locations = get_locations_by_city(db, request.city_id)

    if not locations:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy địa điểm nào tại thành phố có ID {request.city_id}")

    # 2 & 3. Chấm điểm từng địa điểm
    scored_locations = []
    for loc in locations:
        # Gọi DB để lấy tag thay vì dùng property (vì models.py chưa khai báo Relationship)
        tags_db = get_location_tags(db, loc.location_id)
        loc_tags = [t.tag_name for t in tags_db]

        score = score_location(
            location_min_price=float(loc.min_price),
            location_max_price=float(loc.max_price),
            location_tags=loc_tags,
            user_budget=float(request.budget),
            user_preferred_tags=request.preferred_tags,
        )

        # None = bị loại bởi ràng buộc cứng
        if score is not None:
            # 3.5. Hạ độ ưu tiên nếu địa điểm đã đi qua
            if str(loc.location_id) in visited_location_ids:
                score -= 0.5
                
            # Pydantic sẽ tự động map các field nhờ từ khóa from_attributes=True
            loc_out = LocationOut.model_validate(loc)
            loc_out.tags = loc_tags
            loc_out.score = score
            scored_locations.append(loc_out)

    # 4. Sắp xếp theo score giảm dần
    scored_locations.sort(key=lambda x: x.score or 0, reverse=True)

    # 5. Giới hạn số lượng
    scored_locations = scored_locations[: request.max_results]

    return SuggestionResponse(
        total=len(scored_locations),
        locations=scored_locations,
    )