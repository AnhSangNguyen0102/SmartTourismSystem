from uuid import UUID
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, status, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel, Field as PydanticField

from database import get_session
from core.dependencies import require_enterprise_active
from core.security import verify_token
from schemas import LocationCreate, LocationRegisterResponse
from services.location_service import register_location
from models import (
    BusinessLocation,
    Categories,
    Cities,
    LocationCategories,
    LocationReviews,
    Locations,
    LocationsImage,
    UserProfiles,
    Users,
)
from services.external_image_service import (
    is_external_image_category_eligible,
    search_wikimedia_commons_images,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# POST /locations/register  –  Đăng ký địa điểm kinh doanh mới
# ---------------------------------------------------------------------------

@router.post(
    "/locations/register",
    response_model=LocationRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đăng ký địa điểm kinh doanh",
    tags=["Locations"],
)
def register_location_endpoint(
    data: LocationCreate,
    payload: dict = Depends(require_enterprise_active),
    db: Session = Depends(get_session),
) -> LocationRegisterResponse:
    user_id = UUID(str(payload.get("sub")))
    return register_location(db=db, user_id=user_id, data=data)


# ---------------------------------------------------------------------------
# GET /api/v1/locations/{location_id}/images
# ---------------------------------------------------------------------------

@router.get("/locations/{location_id}/images", tags=["Locations"])
def get_location_images(location_id: UUID, db: Session = Depends(get_session)):
    """Lấy danh sách ảnh của địa điểm theo thứ tự display_order."""
    images = db.exec(
        select(LocationsImage)
        .where(LocationsImage.location_id == location_id)
        .order_by(LocationsImage.display_order)
    ).all()
    return [{"image_id": img.image_id, "url": img.url, "display_order": img.display_order} for img in images]


# ---------------------------------------------------------------------------
# GET /api/v1/locations/{location_id}/external-images
# ---------------------------------------------------------------------------

@router.get("/locations/{location_id}/external-images", tags=["Locations"])
async def get_external_location_images(
    location_id: UUID,
    db: Session = Depends(get_session),
):
    """
    Search Wikimedia Commons only for eligible system-managed sightseeing locations
    without DB images.

    Enterprise locations must keep using images supplied by their owners.
    """
    location = db.get(Locations, location_id)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    has_database_image = db.exec(
        select(LocationsImage.image_id).where(LocationsImage.location_id == location_id)
    ).first()
    if has_database_image is not None:
        return {"eligible": False, "reason": "database_images_available", "images": []}

    business_location = db.exec(
        select(BusinessLocation).where(BusinessLocation.location_id == location_id)
    ).first()
    if business_location is not None:
        return {"eligible": False, "reason": "business_location", "images": []}

    category_names = db.exec(
        select(Categories.category_name)
        .join(LocationCategories, LocationCategories.category_id == Categories.category_id)
        .where(LocationCategories.location_id == location_id)
    ).all()
    if not is_external_image_category_eligible(category_names):
        return {"eligible": False, "reason": "unsupported_location_category", "images": []}

    city = db.get(Cities, location.city_id)
    query_parts = [location.location_name]
    if city is not None:
        query_parts.append(city.city_name)
    query_parts.append("Vietnam")

    images = await search_wikimedia_commons_images(" ".join(query_parts), limit=3)
    if not images:
        images = await search_wikimedia_commons_images(location.location_name, limit=3)
    return {
        "eligible": True,
        "reason": None if images else "no_results",
        "source": "Wikimedia Commons",
        "images": images,
    }


# ---------------------------------------------------------------------------
# GET /api/v1/locations/{location_id}/rating-summary
# ---------------------------------------------------------------------------

@router.get("/locations/{location_id}/rating-summary", tags=["Locations"])
def get_rating_summary(location_id: UUID, db: Session = Depends(get_session)):
    """Tóm tắt điểm trung bình và phân phối rating."""
    reviews = db.exec(
        select(LocationReviews).where(LocationReviews.location_id == location_id)
    ).all()
    if not reviews:
        return {
            "average_rating": None,
            "total_reviews": 0,
            "distribution": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        }
    total = len(reviews)
    avg = sum(r.rating for r in reviews) / total
    dist = {i: sum(1 for r in reviews if r.rating == i) for i in range(1, 6)}
    return {"average_rating": round(avg, 1), "total_reviews": total, "distribution": dist}


# ---------------------------------------------------------------------------
# GET /api/v1/locations/{location_id}/reviews
# ---------------------------------------------------------------------------

@router.get("/locations/{location_id}/reviews", tags=["Locations"])
def get_location_reviews(
    location_id: UUID,
    limit: int = 20,
    db: Session = Depends(get_session)
):
    """Danh sách review kèm thông tin user, sắp xếp mới nhất trước."""
    reviews = db.exec(
        select(LocationReviews)
        .where(LocationReviews.location_id == location_id)
        .order_by(LocationReviews.created_at.desc())
        .limit(limit)
    ).all()

    result = []
    for rev in reviews:
        user = db.get(Users, rev.user_id)
        profile = db.exec(
            select(UserProfiles).where(UserProfiles.user_id == rev.user_id)
        ).first()
        result.append({
            "review_id": str(rev.review_id),
            "rating": rev.rating,
            "comment": rev.comment,
            "created_at": rev.created_at.isoformat(),
            "user": {
                "user_id": str(rev.user_id),
                "full_name": (
                    profile.full_name if profile
                    else (user.full_name if user else "Ẩn danh")
                ),
                "avatar_url": profile.avatar_url if profile else None,
            }
        })
    return result


# ---------------------------------------------------------------------------
# POST /api/v1/locations/{location_id}/reviews  –  Upsert review
# ---------------------------------------------------------------------------

class ReviewCreate(BaseModel):
    rating: int = PydanticField(..., ge=1, le=5, description="Đánh giá 1–5 sao")
    comment: Optional[str] = PydanticField(default=None, max_length=1000)


@router.post("/locations/{location_id}/reviews", tags=["Locations"])
def upsert_review(
    location_id: UUID,
    data: ReviewCreate,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Tạo hoặc cập nhật review của user cho địa điểm (mỗi user 1 review)."""
    user_id = UUID(str(payload.get("sub")))

    existing = db.exec(
        select(LocationReviews)
        .where(LocationReviews.location_id == location_id)
        .where(LocationReviews.user_id == user_id)
    ).first()

    if existing:
        existing.rating = data.rating
        existing.comment = data.comment
        existing.updated_at = datetime.utcnow()
        db.add(existing)
    else:
        review = LocationReviews(
            location_id=location_id,
            user_id=user_id,
            rating=data.rating,
            comment=data.comment,
        )
        db.add(review)

    db.commit()
    return {"success": True, "message": "Đã lưu đánh giá thành công"}
