from datetime import datetime
from uuid import UUID
from fastapi import HTTPException, status
from sqlmodel import Session, select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from models import (
    Vouchers, VoucherLocations, UserVouchers, UserProfiles,
    VoucherStatusEnum, UserVoucherStatusEnum
)
import schemas
from core.redis_locks import acquire_voucher_lock, release_voucher_lock

def create_voucher(db: Session, voucher_data: schemas.VoucherCreate, business_id: UUID = None) -> Vouchers:
    """Tạo voucher mới và liên kết với các địa điểm"""
    new_voucher = Vouchers(
        business_id=business_id,
        voucher_type=voucher_data.voucher_type,
        code=voucher_data.code,
        title=voucher_data.title,
        description=voucher_data.description,
        image_url=voucher_data.image_url,
        brand_name=voucher_data.brand_name,
        discount_type=voucher_data.discount_type,
        discount_value=voucher_data.discount_value,
        start_date=voucher_data.start_date,
        end_date=voucher_data.end_date,
        quantity=voucher_data.quantity,
        remaining_quantity=voucher_data.quantity, # Khởi tạo bằng số lượng ban đầu
        max_per_user=voucher_data.max_per_user,
        point_cost=voucher_data.point_cost,
        status=VoucherStatusEnum.ACTIVE
    )
    
    db.add(new_voucher)
    db.flush() # Để lấy voucher_id
    
    # Tạo liên kết địa điểm
    for loc_id in voucher_data.location_ids:
        voucher_loc = VoucherLocations(
            voucher_id=new_voucher.voucher_id,
            location_id=loc_id
        )
        db.add(voucher_loc)
        
    try:
        db.commit()
        db.refresh(new_voucher)
        return new_voucher
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mã voucher đã tồn tại hoặc dữ liệu không hợp lệ."
        )

def get_voucher_by_id(db: Session, voucher_id: UUID) -> Vouchers:
    return db.get(Vouchers, voucher_id)

def get_vouchers_by_location(db: Session, location_id: UUID):
    """Lấy danh sách các voucher đang active tại một địa điểm"""
    statement = (
        select(Vouchers)
        .join(VoucherLocations)
        .where(VoucherLocations.location_id == location_id)
        .where(Vouchers.status == VoucherStatusEnum.ACTIVE)
        .where(Vouchers.remaining_quantity > 0)
    )
    return db.exec(statement).all()

def get_user_vouchers(db: Session, user_id: UUID):
    """Lấy danh sách kho voucher cá nhân của người dùng"""
    statement = (
        select(UserVouchers, Vouchers)
        .join(Vouchers)
        .where(UserVouchers.user_id == user_id)
        .order_by(UserVouchers.collected_at.desc())
    )
    results = db.exec(statement).all()
    
    # Format kết quả
    response_list = []
    for user_voucher, voucher in results:
        # Pydantic schemas will be constructed from dict easily
        item = schemas.UserVoucherResponse.model_validate(user_voucher)
        item.voucher = schemas.VoucherResponse.model_validate(voucher)
        response_list.append(item)
    return response_list

def claim_voucher(db: Session, user_id: UUID, voucher_id: UUID) -> schemas.ClaimVoucherResponse:
    """
    Logic Đổi / Nhận Voucher (Có chống Race Condition)
    Thực hiện trong 1 transaction: Lock row -> Check đk -> Trừ điểm -> Giảm số lượng -> Lưu ví
    """
    user_id_str = str(user_id)
    voucher_id_str = str(voucher_id)
    
    # Layer 1: Redis Lock - Tránh 1 user spam click liên tục
    lock_acquired = acquire_voucher_lock(voucher_id_str, user_id_str)
    if not lock_acquired:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Hệ thống đang xử lý yêu cầu trước đó của bạn. Vui lòng thử lại sau."
        )
        
    try:
        # Lấy profile user để kiểm tra điểm (Không cần lock FOR UPDATE vì chỉ có request này thay đổi điểm do Redis lock đã chặn spam)
        # Tuy nhiên để cẩn thận, lock UserProfiles luôn.
        profile_stmt = select(UserProfiles).where(UserProfiles.user_id == user_id).with_for_update()
        user_profile = db.exec(profile_stmt).first()
        
        if not user_profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy thông tin profile.")
            
        # Layer 2: SQL Row-level Lock (FOR UPDATE) trên Vouchers để tránh race condition về số lượng
        voucher_stmt = select(Vouchers).where(Vouchers.voucher_id == voucher_id).with_for_update()
        voucher = db.exec(voucher_stmt).first()
        
        if not voucher:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voucher không tồn tại.")
            
        if voucher.status != VoucherStatusEnum.ACTIVE:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher không còn hiệu lực.")
            
        # Kiểm tra remaining_quantity
        if voucher.remaining_quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher đã hết số lượng.")
            
        # Kiểm tra max_per_user
        claimed_count_stmt = select(UserVouchers).where(
            UserVouchers.user_id == user_id, 
            UserVouchers.voucher_id == voucher_id
        )
        claimed_count = len(db.exec(claimed_count_stmt).all())
        
        if claimed_count >= voucher.max_per_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"Bạn đã nhận tối đa {voucher.max_per_user} lần cho mã này."
            )
            
        # Kiểm tra số dư (points_balance)
        if user_profile.points_balance < voucher.point_cost:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bạn không đủ điểm EXP để đổi voucher này.")
            
        # --- BẮT ĐẦU XỬ LÝ LƯU DATABASE ---
        
        # 1. Trừ điểm
        user_profile.points_balance -= voucher.point_cost
        
        # 2. Giảm số lượng voucher
        voucher.remaining_quantity -= 1
        
        # 3. Tạo bản ghi UserVoucher
        new_user_voucher = UserVouchers(
            user_id=user_id,
            voucher_id=voucher_id,
            status=UserVoucherStatusEnum.COLLECTED
        )
        
        db.add(user_profile)
        db.add(voucher)
        db.add(new_user_voucher)
        
        db.commit()
        db.refresh(new_user_voucher)
        
        return schemas.ClaimVoucherResponse(
            success=True,
            message="Đổi voucher thành công!",
            user_voucher_id=new_user_voucher.user_voucher_id,
            new_point_balance=user_profile.points_balance
        )
        
    except Exception as e:
        db.rollback()
        raise e
    finally:
        # Giải phóng lock Redis luôn chạy dù thành công hay lỗi
        release_voucher_lock(voucher_id_str, user_id_str)


def use_voucher(db: Session, user_id: UUID, user_voucher_id: UUID):
    """Đánh dấu sử dụng voucher"""
    user_voucher = db.get(UserVouchers, user_voucher_id)
    
    if not user_voucher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy voucher trong ví.")
        
    voucher = db.get(Vouchers, user_voucher.voucher_id)
    if datetime.utcnow().date() < voucher.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Voucher chỉ được sử dụng từ ngày {voucher.start_date.strftime('%d/%m/%Y')}."
        )
    
    if user_voucher.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền truy cập.")
        
    if user_voucher.status == UserVoucherStatusEnum.USED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher đã được sử dụng.")
        
    if user_voucher.status == UserVoucherStatusEnum.EXPIRED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher đã hết hạn.")
        
    # Check if voucher itself is expired
    voucher = db.get(Vouchers, user_voucher.voucher_id)
    if voucher.status != VoucherStatusEnum.ACTIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voucher gốc không còn hiệu lực.")
        
    # Update status
    user_voucher.status = UserVoucherStatusEnum.USED
    user_voucher.used_at = datetime.utcnow()
    
    db.add(user_voucher)
    db.commit()
    db.refresh(user_voucher)
    
    return {"message": "Sử dụng voucher thành công!"}


def get_vouchers_by_enterprise(db: Session, enterprise_id: UUID):
    """Lấy danh sách voucher do một doanh nghiệp cụ thể tạo"""
    statement = select(Vouchers).where(Vouchers.business_id == enterprise_id).order_by(Vouchers.created_at.desc())
    return db.exec(statement).all()


def delete_voucher(db: Session, voucher_id: UUID, user_id: UUID):
    """Doanh nghiệp vô hiệu hóa voucher (Soft Delete)"""
    from models import EnterpriseProfiles
    from sqlmodel import select
    
    ent = db.exec(select(EnterpriseProfiles).where(EnterpriseProfiles.user_id == user_id)).first()
    if not ent:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền truy cập.")
        
    voucher = db.get(Vouchers, voucher_id)
    if not voucher or voucher.business_id != ent.enterprise_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy voucher.")
        
    # Chuyển trạng thái thành DISABLED để ẩn đi, nhưng không làm lỗi data những người đã nhận
    voucher.status = VoucherStatusEnum.DISABLED
    db.add(voucher)
    db.commit()
    return {"message": "Đã xóa voucher thành công."}