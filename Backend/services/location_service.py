"""
services/location_service.py - Enterprise location registration workflow.

Enterprise submissions are moderated: this service validates and geocodes the
payload, then stores a PENDING LocationSubmissions row. Admin approval is the
only path that creates/updates real Locations rows.
"""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session, select

from crud.crud_location import check_location_exists
from models import EnterpriseProfiles, EnterpriseStatus, LocationSubmissions
from schemas import LocationCreate, LocationRegisterResponse


def _get_enterprise_by_user(db: Session, user_id: UUID) -> EnterpriseProfiles:
    enterprise = db.exec(
        select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user_id)
    ).first()
    if enterprise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy hồ sơ doanh nghiệp cho user này.",
        )
    if enterprise.status != EnterpriseStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hồ sơ doanh nghiệp chưa được duyệt nên chưa thể đăng ký địa điểm.",
        )
    return enterprise


def _geocode_address(address: str) -> tuple[float, float]:
    """
    Temporary local geocoder for the current POC environment.
    Replace with Google Maps in production once GOOGLE_API_KEY is configured.
    """
    import random
    
    address_lower = address.lower()
    
    # Thêm độ lệch ngẫu nhiên nhỏ (khoảng 10-20m) để tránh trùng lặp tọa độ tuyệt đối
    offset_lat = (random.random() - 0.5) * 0.0002
    offset_lon = (random.random() - 0.5) * 0.0002

    if "hà nội" in address_lower or "hanoi" in address_lower:
        return 21.027764 + offset_lat, 105.834160 + offset_lon
    if "đà nẵng" in address_lower or "da nang" in address_lower:
        return 16.054407 + offset_lat, 108.202167 + offset_lon
    return 10.776797 + offset_lat, 106.700981 + offset_lon


def register_location(
    db: Session,
    user_id: UUID,
    data: LocationCreate,
) -> LocationRegisterResponse:
    enterprise = _get_enterprise_by_user(db, user_id)

    if data.close_time <= data.open_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="close_time phải lớn hơn open_time.",
        )

    if data.max_price < data.min_price:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="max_price phải lớn hơn hoặc bằng min_price.",
        )

    from models import Cities
    city = db.exec(select(Cities).where(Cities.city_id == data.city_id)).first()
    if city is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Thành phố có ID {data.city_id} không tồn tại. Vui lòng chọn thành phố khác.",
        )

    existing = check_location_exists(db, data.location_name, data.city_id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Địa điểm '{data.location_name}' đã tồn tại trong thành phố này "
                f"(location_id={existing.location_id}). Vui lòng chọn tên khác."
            ),
        )

    latitude, longitude = _geocode_address(data.address)
    pending_data = {
        "location_name": data.location_name,
        "address": data.address,
        "latitude": latitude,
        "longitude": longitude,
        "city_id": data.city_id,
        "open_time": data.open_time.strftime("%H:%M:%S"),
        "close_time": data.close_time.strftime("%H:%M:%S"),
        "min_price": str(data.min_price),
        "max_price": str(data.max_price),
        "currency": getattr(data.currency, "value", data.currency),
        "category_ids": data.category_ids,
        "tag_ids": data.tag_ids,
        "images": [],
    }

    try:
        submission = LocationSubmissions(
            enterprise_id=enterprise.enterprise_id,
            type="CREATE",
            status="PENDING",
            data_json=json.dumps(pending_data, ensure_ascii=False),
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lưu yêu cầu đăng ký địa điểm: {exc}",
        ) from exc

    return LocationRegisterResponse(
        submission_id=submission.submission_id,
        status=submission.status,
        pending_data=pending_data,
        message="Đã gửi yêu cầu đăng ký địa điểm. Địa điểm sẽ hiển thị sau khi Admin duyệt.",
    )
