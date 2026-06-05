from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session
from uuid import UUID
from typing import List

import schemas
from database import get_session
from core.security import verify_token
from core.dependencies import require_enterprise_active
from crud import crud_voucher
from models import UserRole

router = APIRouter(prefix="/vouchers", tags=["Vouchers"])

def get_user_id_from_token(current_user: dict = Depends(verify_token)) -> UUID:
    try:
        return UUID(str(current_user.get("sub")))
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Token không hợp lệ")


@router.post("/", response_model=schemas.VoucherResponse)
def create_voucher(
    voucher_data: schemas.VoucherCreate,
    db: Session = Depends(get_session),
    current_user: dict = Depends(verify_token)
):
    """
    Tạo voucher mới. 
    Nếu là ENTERPRISE, business_id sẽ được lấy tự động (hoặc yêu cầu require_enterprise_active).
    Ở đây đơn giản hóa: Admin tạo SYSTEM voucher, Enterprise tạo BUSINESS voucher.
    """
    role = current_user.get("role")
    business_id = None
    
    if role == UserRole.ENTERPRISE:
        # Cần check trạng thái enterprise
        # Tạm thời mock logic lấy enterprise_id
        # Trong thực tế, nên dùng Depend(require_enterprise_active)
        from models import EnterpriseProfiles
        from sqlmodel import select
        user_id = UUID(str(current_user.get("sub")))
        ent = db.exec(select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user_id)).first()
        if not ent or ent.status != "ACTIVE":
            raise HTTPException(status_code=403, detail="Tài khoản doanh nghiệp chưa được duyệt.")
        business_id = ent.enterprise_id
        voucher_data.voucher_type = "BUSINESS"
    elif role == UserRole.ADMIN:
        voucher_data.voucher_type = "SYSTEM"
    else:
        raise HTTPException(status_code=403, detail="Bạn không có quyền tạo voucher.")
        
    return crud_voucher.create_voucher(db, voucher_data, business_id=business_id)


@router.get("/manage/me", response_model=List[schemas.VoucherResponse])
def get_enterprise_created_vouchers(
    db: Session = Depends(get_session),
    current_user: dict = Depends(verify_token)
):
    """(Doanh nghiệp) Lấy danh sách các voucher mình đã tạo"""
    if current_user.get("role") != UserRole.ENTERPRISE:
        raise HTTPException(status_code=403, detail="Chỉ doanh nghiệp mới có quyền truy cập.")
        
    from models import EnterpriseProfiles
    from sqlmodel import select
    user_id = UUID(str(current_user.get("sub")))
    ent = db.exec(select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user_id)).first()
    
    if not ent:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ doanh nghiệp.")
        
    return crud_voucher.get_vouchers_by_enterprise(db, ent.enterprise_id)


@router.get("/my-vouchers", response_model=List[schemas.UserVoucherResponse])
def get_my_vouchers(
    db: Session = Depends(get_session),
    user_id: UUID = Depends(get_user_id_from_token)
):
    """Lấy danh sách kho voucher cá nhân của người dùng"""
    return crud_voucher.get_user_vouchers(db, user_id)


@router.get("/location/{location_id}", response_model=List[schemas.VoucherResponse])
def get_location_vouchers(
    location_id: UUID,
    db: Session = Depends(get_session)
):
    """Lấy danh sách các voucher đang active tại một địa điểm"""
    return crud_voucher.get_vouchers_by_location(db, location_id)


@router.get("/active", response_model=List[schemas.VoucherResponse])
def get_all_active_vouchers(db: Session = Depends(get_session)):
    from models import Vouchers, VoucherStatusEnum
    from sqlmodel import select
    statement = select(Vouchers).where(Vouchers.status == VoucherStatusEnum.ACTIVE).where(Vouchers.remaining_quantity > 0)
    return db.exec(statement).all()


@router.get("/{voucher_id}", response_model=schemas.VoucherResponse)
def get_voucher_detail(
    voucher_id: UUID,
    db: Session = Depends(get_session)
):
    """Lấy chi tiết một voucher"""
    voucher = crud_voucher.get_voucher_by_id(db, voucher_id)
    if not voucher:
        raise HTTPException(status_code=404, detail="Không tìm thấy voucher.")
    return voucher


@router.post("/{voucher_id}/claim", response_model=schemas.ClaimVoucherResponse)
def claim_voucher_endpoint(
    voucher_id: UUID,
    db: Session = Depends(get_session),
    user_id: UUID = Depends(get_user_id_from_token)
):
    """Nhận/Đổi voucher. Cần có đủ EXP/Coin nếu voucher có phí."""
    return crud_voucher.claim_voucher(db, user_id, voucher_id)


@router.post("/{user_voucher_id}/use")
def use_voucher_endpoint(
    user_voucher_id: UUID,
    db: Session = Depends(get_session),
    user_id: UUID = Depends(get_user_id_from_token)
):
    """Sử dụng voucher trong ví"""
    return crud_voucher.use_voucher(db, user_id, user_voucher_id)


@router.delete("/{voucher_id}")
def delete_voucher_endpoint(
    voucher_id: UUID,
    db: Session = Depends(get_session),
    current_user: dict = Depends(verify_token)
):
    """Xóa (vô hiệu hóa) voucher của doanh nghiệp"""
    user_id = UUID(str(current_user.get("sub")))
    return crud_voucher.delete_voucher(db, voucher_id, user_id)