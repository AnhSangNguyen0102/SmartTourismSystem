"""
================================================================================
 routers/location_router.py  │  Endpoint đăng ký địa điểm kinh doanh
================================================================================

Endpoints:
  POST /locations/register
    - Dependency: verify_token → require_enterprise_active
    - Body: LocationCreate
    - Response: LocationRegisterResponse

Middleware / Dependency kiểm tra quyền:
  require_enterprise_active(payload, db):
    1. Kiểm tra role = ENTERPRISE (lấy từ JWT payload)
    2. Kiểm tra enterprise_profiles.status = ACTIVE
    3. Raise 403 nếu không đủ điều kiện
================================================================================
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from database import get_session
from core.security import verify_token
from models import EnterpriseProfiles, EnterpriseStatus, UserRole
from schemas import LocationCreate, LocationRegisterResponse
from services.location_service import register_location


router = APIRouter()


# ---------------------------------------------------------------------------
# Dependency – Kiểm tra quyền ENTERPRISE + ACTIVE
# ---------------------------------------------------------------------------

def require_enterprise_active(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_session),
) -> dict:
    """
    FastAPI dependency đảm bảo request đến từ user có role=ENTERPRISE
    và hồ sơ doanh nghiệp đang ở trạng thái ACTIVE.

    Raises
    ------
    HTTPException 403
        - Khi role không phải ENTERPRISE
        - Khi enterprise_profiles.status != ACTIVE (PENDING / REJECTED)
    HTTPException 404
        Khi user_id không có hồ sơ doanh nghiệp nào.

    Returns
    -------
    dict
        JWT payload (chứa ``sub`` = user_id, ``role``, v.v.)
    """
    # 1. Kiểm tra role từ JWT payload
    role = payload.get("role")
    if role != UserRole.ENTERPRISE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ tài khoản doanh nghiệp (ENTERPRISE) mới được thực hiện hành động này.",
        )

    # 2. Lấy user_id từ JWT claim "sub"
    try:
        user_id = UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không chứa user_id hợp lệ.",
        )

    # 3. Kiểm tra enterprise_profiles.status = ACTIVE
    statement = select(EnterpriseProfiles).where(
        EnterpriseProfiles.user_id == user_id
    )
    enterprise = db.exec(statement).first()

    if enterprise is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy hồ sơ doanh nghiệp. Vui lòng đăng ký doanh nghiệp trước.",
        )

    if enterprise.status != EnterpriseStatus.ACTIVE:
        status_map = {
            EnterpriseStatus.PENDING: "đang chờ Admin duyệt",
            EnterpriseStatus.REJECTED: "đã bị từ chối",
        }
        detail_msg = status_map.get(enterprise.status, "không hợp lệ")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Tài khoản doanh nghiệp của bạn {detail_msg}. "
                "Chỉ doanh nghiệp đã được duyệt (ACTIVE) mới có thể đăng ký địa điểm."
            ),
        )

    return payload


# ---------------------------------------------------------------------------
# POST /locations/register  –  Đăng ký địa điểm kinh doanh mới
# ---------------------------------------------------------------------------

@router.post(
    "/locations/register",
    response_model=LocationRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Đăng ký địa điểm kinh doanh",
    description=(
        "Doanh nghiệp đã được duyệt (ENTERPRISE + ACTIVE) đăng ký một địa điểm "
        "kinh doanh mới. Địa chỉ sẽ được Geocode tự động qua Google Maps API. "
        "Địa điểm sau khi tạo ở trạng thái PENDING — chờ Admin xét duyệt."
    ),
    tags=["Locations"],
)
def register_location_endpoint(
    data: LocationCreate,
    payload: dict = Depends(require_enterprise_active),
    db: Session = Depends(get_session),
) -> LocationRegisterResponse:
    """
    **Yêu cầu:**
    - Header `Authorization: Bearer <access_token>`
    - User phải có `role = ENTERPRISE` và `enterprise_profiles.status = ACTIVE`

    **Luồng xử lý:**
    1. Dependency `require_enterprise_active` xác thực JWT + kiểm tra quyền
    2. `location_service.register_location()` xử lý toàn bộ nghiệp vụ:
       - Geocode địa chỉ → tọa độ
       - Validate trùng tên, giờ, giá
       - Transaction: INSERT 4 bảng
    3. Trả về thông tin địa điểm + thông báo chờ duyệt
    """
    user_id = UUID(str(payload.get("sub")))
    return register_location(db=db, user_id=user_id, data=data)
