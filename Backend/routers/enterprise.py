from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from database import get_session
from core.security import verify_token
from core.dependencies import require_admin # File bạn vừa tạo ở trên
from models import EnterpriseStatus, VerificationAction, UserRole, Users
import schemas

import crud.crud_enterprise as crud_enterprise

router = APIRouter(prefix="/enterprise", tags=["Enterprise Accounts"])

# ---------------------------------------------------------------------------
# API 1: Người dùng (Role: USER) nộp hồ sơ đăng ký doanh nghiệp
# ---------------------------------------------------------------------------
@router.post("/register-profile", response_model=schemas.EnterpriseProfileResponse)
def submit_enterprise_profile(
    profile_data: schemas.EnterpriseProfileCreate,
    db: Session = Depends(get_session),
    current_user: dict = Depends(verify_token) # Yêu cầu đã đăng nhập
):
    """
    Doanh nghiệp (B2B) gửi yêu cầu đăng ký hồ sơ doanh nghiệp.
    Trạng thái mặc định sẽ là PENDING[cite: 638, 659].
    """
    # Payload token của bạn lưu user_id ở key 'sub'
    user_id_str = current_user.get("sub")
    if not user_id_str:
         raise HTTPException(status_code=401, detail="Token không hợp lệ")
    
    user_id = UUID(user_id_str)

    try:
        profile = crud_enterprise.create_enterprise_profile(
            db=db,
            user_id=user_id,
            business_name=profile_data.business_name,
            contact_person=profile_data.contact_person,
            contact_email=profile_data.contact_email,
            contact_phone=profile_data.contact_phone
        )
        return profile
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản này đã có hồ sơ hoặc dữ liệu không hợp lệ."
        )


# ---------------------------------------------------------------------------
# API 2: Admin duyệt/từ chối hồ sơ & Cấp quyền
# ---------------------------------------------------------------------------
@router.put("/{enterprise_id}/verify", response_model=schemas.EnterpriseProfileResponse)
def verify_enterprise_profile(
    enterprise_id: UUID,
    action_data: schemas.EnterpriseStatusUpdate,
    db: Session = Depends(get_session),
    current_admin: dict = Depends(require_admin) # BẮT BUỘC ROLE ADMIN
):
    """
    Admin kiểm tra và xác nhận 'Phê duyệt' hoặc 'Từ chối' hồ sơ[cite: 643, 665].
    Nâng cấp role lên ENTERPRISE nếu được duyệt[cite: 645].
    """
    admin_id = UUID(current_admin.get("sub"))

    # 1. Cập nhật trạng thái Profile (PENDING -> ACTIVE/REJECTED)
    updated_profile = crud_enterprise.update_enterprise_status(
        db=db,
        enterprise_id=enterprise_id,
        new_status=action_data.status
    )
    
    if not updated_profile:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ doanh nghiệp")

    # 2. Map trạng thái để ghi Verification Log
    if action_data.status == EnterpriseStatus.ACTIVE:
        action_type = VerificationAction.APPROVE
    elif action_data.status == EnterpriseStatus.REJECTED:
        action_type = VerificationAction.REJECT
    else:
        raise HTTPException(status_code=400, detail="Trạng thái cập nhật không hợp lệ")

    # Ghi log hành động của Admin
    crud_enterprise.create_verification_log(
        db=db,
        enterprise_id=enterprise_id,
        admin_id=admin_id,
        action=action_type,
        reason=action_data.reason
    )

    # 3. Nâng cấp Role cho User nếu hồ sơ được duyệt (ACTIVE)
    if action_data.status == EnterpriseStatus.ACTIVE:
        # Fetch user trực tiếp bằng SQLModel
        user = db.get(Users, updated_profile.user_id)
        if user and user.role != UserRole.ENTERPRISE:
            user.role = UserRole.ENTERPRISE
            db.add(user)
            db.commit()

    return updated_profile