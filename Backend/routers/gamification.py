import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlmodel import Session, select
from datetime import datetime, time as dtime
from decimal import Decimal

from database import get_session
from crud import crud_gamification as crud
from models import (
    PhotoTasks, 
    UserTaskProgress, 
    TaskSubmissions, 
    ItineraryExp, 
    Locations, 
    UserProfiles, 
    ProgressStatusEnum, 
    SubmissionStatusEnum,
    QATasks,
    QRTasks,
    UserTaskHistory
)
from core.gps import calculate_haversine_distance
from services.ai_verification import verify_image_with_gemini

router = APIRouter(
    prefix="/api/gamification",
    tags=["Gamification"],
)

class ClaimTreasureRequest(BaseModel):
    spawn_id: uuid.UUID
    item_id: Optional[int] = None

@router.post("/claim-newbie-gift/{user_id}")
def api_claim_newbie_gift(user_id: uuid.UUID, session: Session = Depends(get_session)):
    claimed = crud.check_newbie_gift(session, user_id)
    if claimed:
        raise HTTPException(status_code=400, detail="Newbie gift already claimed")
    
    success = crud.claim_newbie_gift(session, user_id)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to claim newbie gift")
    
    return {"status": "success", "message": "Newbie gift claimed successfully"}

@router.post("/daily-attendance/{user_id}")
def api_daily_attendance(user_id: uuid.UUID, session: Session = Depends(get_session)):
    result = crud.daily_attendance(session, user_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"status": "success", "data": result}

@router.get("/nearby-treasures/{user_id}")
def api_get_nearby_treasures(user_id: uuid.UUID, session: Session = Depends(get_session)):
    treasures = crud.get_nearby_treasures(session, user_id)
    return {"status": "success", "data": treasures}

@router.post("/claim-treasure/{user_id}")
def api_claim_treasure(user_id: uuid.UUID, request: ClaimTreasureRequest, session: Session = Depends(get_session)):
    try:
        success = crud.claim_treasure(session, user_id, request.spawn_id, request.item_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to claim treasure")
        return {"status": "success", "message": "Treasure claimed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/leaderboard")
def api_get_leaderboard(city_id: int, period_type: str, period_value: str, session: Session = Depends(get_session)):
    leaderboard = crud.get_leaderboard(session, city_id, period_type, period_value)
    return {"status": "success", "data": leaderboard}

@router.get("/hot-locations")
def api_get_hot_locations(session: Session = Depends(get_session)):
    locations = crud.get_hot_locations(session)
    return {"status": "success", "data": locations}

@router.get("/locations/{location_id}/tasks")
def get_location_tasks(
    location_id: uuid.UUID, 
    itinerary_id: uuid.UUID,
    user_id: uuid.UUID,
    session: Session = Depends(get_session)
):
    """
    API Tích hợp: Lấy toàn bộ danh sách nhiệm vụ tại địa điểm (Gồm PHOTO, QA, QR)
    kèm theo trạng thái thực hiện của User.
    """
    # 1. Kiểm tra địa điểm tồn tại
    location = session.get(Locations, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Không tìm thấy địa điểm du lịch này.")

    result = []

    # 2. XỬ LÝ NHIỆM VỤ CHỤP ẢNH (PHOTO)
    photo_tasks = session.exec(
        select(PhotoTasks).where(PhotoTasks.location_id == location_id, PhotoTasks.is_active == True)
    ).all()
    
    if photo_tasks:
        task_ids = [t.task_id for t in photo_tasks]
        progress_list = session.exec(
            select(UserTaskProgress).where(
                UserTaskProgress.user_id == user_id,
                UserTaskProgress.itinerary_id == itinerary_id,
                UserTaskProgress.task_id.in_(task_ids)
            )
        ).all()
        progress_map = {p.task_id: p for p in progress_list}
        
        for task in photo_tasks:
            progress = progress_map.get(task.task_id)
            status = progress.status.value if progress else "NOT_STARTED"
            result.append({
                "task_id": task.task_id,
                "title": task.title,
                "description": task.description,
                "task_type": "PHOTO",
                "reward_exp": task.reward_exp,
                "difficulty": task.difficulty.value if hasattr(task.difficulty, 'value') else str(task.difficulty),
                "radius_meters": task.radius_meters,
                "status": status,
                "progress_id": progress.progress_id if progress else None,
                "target_latitude": float(task.latitude),
                "target_longitude": float(task.longitude),
                "reference_image_url": task.reference_image_url
            })

    # 3. LẤY LỊCH SỬ HOÀN THÀNH NHIỆM VỤ TĨNH TRONG NGÀY (Dành cho QA và QR)
    today = datetime.utcnow().date()
    history_records = session.exec(
        select(UserTaskHistory).where(
            UserTaskHistory.user_id == user_id,
            UserTaskHistory.location_id == location_id,
            UserTaskHistory.completed_at >= datetime.combine(today, dtime.min)
        )
    ).all()
    completed_task_ids = {h.task_id for h in history_records}

    # 4. XỬ LÝ NHIỆM VỤ HỎI ĐÁP (QA)
    qa_tasks = session.exec(select(QATasks).where(QATasks.location_id == location_id)).all()
    for qa in qa_tasks:
        is_completed = qa.task_id in completed_task_ids
        result.append({
            "task_id": qa.task_id,
            "title": f"❓ Thử thách kiến thức điểm đến",
            "description": qa.question,
            "task_type": "QA",
            "reward_exp": qa.reward_exp,
            "difficulty": qa.difficulty.upper() if qa.difficulty else "EASY",
            "radius_meters": 100,  # Bán kính mặc định bao phủ trạm dừng
            "status": "COMPLETED" if is_completed else "NOT_STARTED",
            "question": qa.question,
            "option_a": qa.option_a,
            "option_b": qa.option_b,
            "option_c": qa.option_c,
            "option_d": qa.option_d,
            "question_type": qa.question_type,
            "target_latitude": float(location.latitude),
            "target_longitude": float(location.longitude)
        })

    # 5. XỬ LÝ NHIỆM VỤ QUÉT MÃ QR TẠI ĐIỂM (QR)
    qr_tasks = session.exec(select(QRTasks).where(QRTasks.location_id == location_id, QRTasks.is_one_time == False)).all()
    for qr in qr_tasks:
        is_completed = qr.qr_task_id in completed_task_ids
        result.append({
            "task_id": qr.qr_task_id,
            "title": f"🔳 Tìm kiếm & Quét mã QR Di Sản",
            "description": "Tìm kiếm mã QR được ẩn giấu xung quanh khu vực này để quét mã xác thực sự hiện diện.",
            "task_type": "QR",
            "reward_exp": qr.reward_exp,
            "difficulty": "MEDIUM",
            "radius_meters": 100,
            "status": "COMPLETED" if is_completed else "NOT_STARTED",
            "target_latitude": float(location.latitude),
            "target_longitude": float(location.longitude)
        })

    return result

@router.post("/tasks/{task_id}/start")
def start_task(task_id: uuid.UUID, user_id: uuid.UUID, itinerary_id: uuid.UUID, session: Session = Depends(get_session)):
    task = session.get(PhotoTasks, task_id)
    if not task:
        return {"message": "Bỏ qua khởi tạo tuần tự cho QA/QR", "status": "IN_PROGRESS"}
    existing_progress = session.exec(select(UserTaskProgress).where(UserTaskProgress.user_id == user_id, UserTaskProgress.task_id == task_id, UserTaskProgress.itinerary_id == itinerary_id)).first()
    if existing_progress:
        return {"message": "Tiếp tục", "progress_id": existing_progress.progress_id, "status": "IN_PROGRESS"}
    new_progress = UserTaskProgress(user_id=user_id, task_id=task_id, itinerary_id=itinerary_id, location_id=task.location_id, status=ProgressStatusEnum.IN_PROGRESS)
    session.add(new_progress)
    session.commit()
    session.refresh(new_progress)
    return {"message": "Đã bắt đầu", "progress_id": new_progress.progress_id, "status": "IN_PROGRESS"}

@router.post("/tasks/{task_id}/cancel")
def cancel_task(task_id: uuid.UUID, user_id: uuid.UUID, itinerary_id: uuid.UUID, session: Session = Depends(get_session)):
    progress = session.exec(select(UserTaskProgress).where(UserTaskProgress.user_id == user_id, UserTaskProgress.task_id == task_id, UserTaskProgress.itinerary_id == itinerary_id)).first()
    if progress:
        progress.status = ProgressStatusEnum.CANCELLED
        session.add(progress)
        session.commit()
    return {"message": "Đã hủy thành công", "status": "CANCELLED"}

@router.post("/submissions/submit-photo")
async def submit_photo_task(progress_id: uuid.UUID = Form(...), latitude: float = Form(...), longitude: float = Form(...), photo: UploadFile = File(...), session: Session = Depends(get_session)):
    progress = session.get(UserTaskProgress, progress_id)
    if not progress or progress.status == ProgressStatusEnum.COMPLETED:
        raise HTTPException(status_code=400, detail="Tiến trình không hợp lệ hoặc đã hoàn thành.")
    task = session.get(PhotoTasks, progress.task_id)
    distance = calculate_haversine_distance(latitude, longitude, float(task.latitude), float(task.longitude))
    if distance > task.radius_meters:
        raise HTTPException(status_code=400, detail=f"Bạn ở ngoài phạm vi bán kính cho phép.")
    photo_bytes = await photo.read()
    ai_result = await verify_image_with_gemini(photo_bytes, task.reference_image_url)
    submission = TaskSubmissions(progress_id=progress.progress_id, submitted_image_url="https://demo.url", submitted_latitude=Decimal(str(latitude)), submitted_longitude=Decimal(str(longitude)), distance_meters=distance, confidence_score=ai_result["confidence_score"], status=SubmissionStatusEnum.APPROVED if ai_result["is_matched"] else SubmissionStatusEnum.REJECTED)
    session.add(submission)
    if not ai_result["is_matched"]:
        reason = ai_result.get("reason", "Ảnh chụp không khớp.")
        raise HTTPException(status_code=400, detail=f"AI kiểm định: {reason}")
    progress.status = ProgressStatusEnum.COMPLETED
    progress.completed_at = datetime.utcnow()
    iti_exp = session.get(ItineraryExp, progress.itinerary_id) or ItineraryExp(itinerary_id=progress.itinerary_id, total_exp=0, current_level=1)
    iti_exp.total_exp += task.reward_exp
    iti_exp.current_level = (iti_exp.total_exp // 1000) + 1
    session.add(progress)
    session.add(iti_exp)
    profile = session.exec(select(UserProfiles).where(UserProfiles.user_id == progress.user_id)).first()
    if profile:
        profile.total_points += task.reward_exp
        profile.points_balance += task.reward_exp
        session.add(profile)
    session.commit()
    return {"status": "SUCCESS", "message": "Hoàn thành nhiệm vụ!", "exp_rewarded": task.reward_exp, "new_itinerary_exp": iti_exp.total_exp, "new_level": iti_exp.current_level, "confidence_score": ai_result["confidence_score"]}
