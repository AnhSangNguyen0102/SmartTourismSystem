from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID
from sqlmodel import Session
from database import get_session
from crud.crud_task import crud_task
from schemas import QATaskResponse, QASubmissionRequest, QRScanRequest, TaskCompletionResponse
# Cần import thêm:
from schemas import TaskListResponse, CompleteStopResponse
from crud.crud_tracking import complete_itinerary_stop
import core.security as security
import crud.crud_user as crud_user

router = APIRouter()

def get_current_user_id(db: Session, current_user_dict: dict) -> UUID:
    """Lấy user_id thực tế từ database dựa trên JWT token sub."""
    user_id_str = current_user_dict.get("sub")
    try:
        user_id = UUID(user_id_str)
    except Exception:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")
        
    user = db.get(crud_user.Users, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User không tồn tại")
    return user.user_id

@router.get("/locations/{location_id}/qa-tasks", response_model=list[QATaskResponse], tags=["Gamified Tasks"])
def get_location_qa_tasks(
    location_id: UUID, 
    db: Session = Depends(get_session)
):
    """Lấy toàn bộ danh sách câu hỏi Q&A thuộc một địa điểm du lịch"""
    return crud_task.get_qa_tasks_by_location(db=db, location_id=location_id)

@router.post("/tasks/qa/submit", response_model=TaskCompletionResponse, tags=["Gamified Tasks"])
def submit_qa_task(
    payload: QASubmissionRequest, 
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    """Player nộp đáp án trắc nghiệm câu hỏi Q&A để nhận thưởng"""
    user_id = get_current_user_id(db, current_user)
    return crud_task.submit_qa_answer(db=db, user_id=user_id, payload=payload)

@router.post("/tasks/qr/scan", response_model=TaskCompletionResponse, tags=["Gamified Tasks"])
def scan_qr_task(
    payload: QRScanRequest, 
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    """Player thực hiện quét mã QR (QR Tĩnh tại điểm hoặc QR in trên hóa đơn của NPC)"""
    user_id = get_current_user_id(db, current_user)
    return crud_task.scan_qr_task(db=db, user_id=user_id, payload=payload)

@router.get("/locations/{location_id}/tasks/aggregated", response_model=TaskListResponse, tags=["Gamified Tasks"])
def get_all_tasks_for_location(
    location_id: UUID, 
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    """API Gom toàn bộ Task tại một điểm (Có trạng thái đã hoàn thành hay chưa)"""
    user_id = get_current_user_id(db, current_user)
    tasks = crud_task.get_aggregated_tasks(db=db, user_id=user_id, location_id=location_id)
    return TaskListResponse(location_id=location_id, tasks=tasks)

@router.post("/stops/{stop_id}/complete", response_model=CompleteStopResponse, tags=["Gamified Tasks"])
def finalize_stop_checkin(
    stop_id: int, 
    db: Session = Depends(get_session),
    current_user: dict = Depends(security.verify_token)
):
    """API Chốt hoàn thành địa điểm (Cắm cờ) sau khi thực hiện xong chuỗi task"""
    user_id = get_current_user_id(db, current_user)
    success = complete_itinerary_stop(db=db, user_id=user_id, stop_id=stop_id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Không thể hoàn thành địa điểm này. Vui lòng thử lại!")
        
    return CompleteStopResponse(
        success=True, 
        message="Chúc mừng! Bạn đã hoàn thành địa điểm và check-in thành công.",
        stop_id=stop_id
    )