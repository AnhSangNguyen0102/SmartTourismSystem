"""
================================================================================
 services/location_service.py  │  USE CASE: Đăng ký địa điểm kinh doanh
================================================================================

Luồng xử lý ``register_location``:
  1. Lấy enterprise_id từ user_id (bảng ENTERPRISE_PROFILES)
  2. Gọi Google Maps Geocoding API với address → latitude, longitude
  3. Validate nghiệp vụ:
       - Trùng tên địa điểm trong cùng thành phố
       - close_time > open_time
       - max_price >= min_price
  4. Transaction: INSERT LOCATIONS → BUSINESS_LOCATION
                           → LOCATION_CATEGORIES → LOCATION_TAGS
  5. Trả về LocationRegisterResponse kèm thông báo chờ duyệt

Biến môi trường cần có:
  GOOGLE_API_KEY  — Google Maps Geocoding API key
================================================================================
"""

from __future__ import annotations

import os
import httpx

from uuid import UUID
from sqlmodel import Session, select

from models import EnterpriseProfiles, EnterpriseStatus
from schemas import LocationCreate, LocationRegisterResponse, LocationResponse

from crud.crud_location import (
    check_location_exists,
    create_location,
    create_business_location,
    create_location_categories,
    create_location_tags,
)

from fastapi import HTTPException, status


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_enterprise_by_user(db: Session, user_id: UUID) -> EnterpriseProfiles:
    """
    Lấy hồ sơ doanh nghiệp từ user_id.
    Raise 404 nếu không tìm thấy.
    """
    statement = select(EnterpriseProfiles).where(
        EnterpriseProfiles.user_id == user_id
    )
    enterprise = db.exec(statement).first()
    if enterprise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy hồ sơ doanh nghiệp cho user này.",
        )
    return enterprise

'''
def _geocode_address(address: str) -> tuple[float, float]:
    """
    Gọi Google Maps Geocoding API để lấy (latitude, longitude) từ *address*.

    Raises
    ------
    HTTPException 400
        Khi API không tìm được tọa độ hoặc API key không hợp lệ.
    HTTPException 503
        Khi không thể kết nối tới Google Maps API.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_API_KEY chưa được cấu hình trên server.",
        )

    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": address, "key": api_key, "language": "vi"}

    try:
        response = httpx.get(url, params=params, timeout=10.0)
        response.raise_for_status()
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Không thể kết nối Google Maps API: {exc}",
        )

    data = response.json()
    results = data.get("results", [])

    if not results or data.get("status") not in ("OK",):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Google Maps không tìm được tọa độ cho địa chỉ: '{address}'. "
                f"API status: {data.get('status', 'UNKNOWN')}"
            ),
        )

    location_geo = results[0]["geometry"]["location"]
    return location_geo["lat"], location_geo["lng"]

'''
def _geocode_address(address: str) -> tuple[float, float]:
    """
    TẠM BYPASS Google Maps API cho POC.
    Trả về tọa độ mặc định theo thành phố trong địa chỉ.
    """
    address_lower = address.lower()
    
    if "hà nội" in address_lower or "hanoi" in address_lower:
        return 21.027764, 105.834160
    elif "đà nẵng" in address_lower or "da nang" in address_lower:
        return 16.054407, 108.202167
    else:
        # Mặc định Hồ Chí Minh
        return 10.776797, 106.700981
# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------

def register_location(
    db: Session,
    user_id: UUID,
    data: LocationCreate,
) -> LocationRegisterResponse:
    """
    Đăng ký địa điểm kinh doanh mới cho doanh nghiệp.

    Parameters
    ----------
    db : Session
        SQLModel session (được inject từ FastAPI Depends).
    user_id : UUID
        ID user đang đăng nhập (đã xác thực là ENTERPRISE + ACTIVE).
    data : LocationCreate
        Payload request body từ client.

    Returns
    -------
    LocationRegisterResponse
        Thông tin địa điểm vừa tạo + thông báo chờ Admin duyệt.

    Raises
    ------
    HTTPException 400
        - Địa điểm trùng tên trong cùng thành phố
        - close_time <= open_time
        - max_price < min_price
        - Google Maps không trả về tọa độ
    HTTPException 404
        Không tìm thấy hồ sơ doanh nghiệp
    """

    # ------------------------------------------------------------------ #
    # 1. Lấy enterprise_id từ user_id
    # ------------------------------------------------------------------ #
    enterprise = _get_enterprise_by_user(db, user_id)

    # ------------------------------------------------------------------ #
    # 2. Validate nghiệp vụ (trước khi gọi API để tiết kiệm quota)
    # ------------------------------------------------------------------ #
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

    existing = check_location_exists(db, data.location_name, data.city_id)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Địa điểm '{data.location_name}' đã tồn tại trong thành phố này "
                f"(location_id={existing.location_id}). Vui lòng chọn tên khác."
            ),
        )

    # ------------------------------------------------------------------ #
    # 3. Gọi Google Maps Geocoding API
    # ------------------------------------------------------------------ #
    latitude, longitude = _geocode_address(data.address)

    # ------------------------------------------------------------------ #
    # 4. Transaction: INSERT 4 bảng, rollback toàn bộ nếu bất kỳ bước nào lỗi
    # ------------------------------------------------------------------ #
    try:
        # INSERT LOCATIONS
        location = create_location(
            db,
            location_name=data.location_name,
            latitude=latitude,
            longitude=longitude,
            city_id=data.city_id,
            open_time=data.open_time,
            close_time=data.close_time,
            min_price=data.min_price,
            max_price=data.max_price,
            currency=data.currency,
            address=data.address,
        )

        # INSERT BUSINESS_LOCATION
        create_business_location(
            db,
            business_id=enterprise.enterprise_id,
            location_id=location.location_id,
        )

        # INSERT LOCATION_CATEGORIES (bỏ qua nếu danh sách rỗng)
        if data.category_ids:
            create_location_categories(
                db,
                location_id=location.location_id,
                category_ids=data.category_ids,
            )

        # INSERT LOCATION_TAGS (bỏ qua nếu danh sách rỗng)
        if data.tag_ids:
            create_location_tags(
                db,
                location_id=location.location_id,
                tag_ids=data.tag_ids,
            )

        # Commit toàn bộ transaction một lần
        db.commit()
        db.refresh(location)

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lưu địa điểm vào cơ sở dữ liệu: {exc}",
        ) from exc

    # ------------------------------------------------------------------ #
    # 5. Trả về response
    # ------------------------------------------------------------------ #
    location_resp = LocationResponse(
        location_id=location.location_id,
        location_name=location.location_name,
        latitude=location.latitude,
        longitude=location.longitude,
        city_id=location.city_id,
        min_price=location.min_price,
        max_price=location.max_price,
        currency=location.currency,
        open_time=location.open_time,
        close_time=location.close_time,
    )

    return LocationRegisterResponse(
        location=location_resp,
        message="Địa điểm đang chờ Admin duyệt. Chúng tôi sẽ thông báo khi có kết quả.",
    )
