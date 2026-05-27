from uuid import UUID
from fastapi import Depends, HTTPException, status
from sqlmodel import Session, select

from database import get_session
from core.security import verify_token
from models import UserRole, EnterpriseProfiles, EnterpriseStatus

def require_roles(allowed_roles: list[UserRole]):
    """
    Dependency kiểm tra role của user từ JWT Token.
    """
    def role_checker(current_user: dict = Depends(verify_token)):
        user_role = current_user.get("role")
        # So sánh value của Enum nếu JWT lưu string
        allowed_roles_values = [role.value for role in allowed_roles]
        
        if user_role not in allowed_roles_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập vào tài nguyên này."
            )
        return current_user
    return role_checker

# Tạo sẵn các alias cơ bản
require_admin = require_roles([UserRole.ADMIN])
require_enterprise = require_roles([UserRole.ENTERPRISE])

# ---------------------------------------------------------------------------
# Dependency Nâng Cao – Kiểm tra quyền ENTERPRISE + Database Status ACTIVE
# ---------------------------------------------------------------------------
def require_enterprise_active(
    payload: dict = Depends(require_enterprise), # Kế thừa kiểm tra Role ở trên
    db: Session = Depends(get_session),
) -> dict:
    """
    Đảm bảo user có role=ENTERPRISE VÀ hồ sơ trong DB đang ở trạng thái ACTIVE.
    """
    # 1. Lấy user_id từ JWT claim "sub"
    try:
        user_id = UUID(str(payload.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không chứa user_id hợp lệ.",
        )

    # 2. Kiểm tra enterprise_profiles.status = ACTIVE
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

    enriched_payload = dict(payload)
    enriched_payload["enterprise_id"] = str(enterprise.enterprise_id)
    enriched_payload["enterprise_profile"] = enterprise
    return enriched_payload
