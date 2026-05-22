import math
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from fastapi import HTTPException, status
from sqlmodel import Session, select
from models import QATasks, QRTasks, UserTaskHistory, UserProfiles, Locations, TaskTypeEnum
from schemas import QASubmissionRequest, QRScanRequest, TaskCompletionResponse

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Tính khoảng cách giữa 2 tọa độ GPS bằng công thức Haversine (Đơn vị: mét)"""
    R = 6371000  # Bán kính Trái Đất theo mét
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class CRUDTask:
    def get_qa_tasks_by_location(self, db: Session, location_id: UUID) -> list[QATasks]:
        return db.exec(select(QATasks).where(QATasks.location_id == location_id)).all()

    def submit_qa_answer(self, db: Session, user_id: UUID, payload: QASubmissionRequest) -> TaskCompletionResponse:
        # 1. Tìm task câu hỏi
        task = db.get(QATasks, payload.task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Không tìm thấy nhiệm vụ Q&A này.")

        # 2. Anti-cheat: Kiểm tra xem hôm nay user đã làm task này chưa
        today = datetime.utcnow().date()
        existing_history = db.exec(
            select(UserTaskHistory).where(
                UserTaskHistory.user_id == user_id,
                UserTaskHistory.task_id == task.task_id,
                UserTaskHistory.completed_at >= datetime.combine(today, datetime.min.time())
            )
        ).first()
        if existing_history:
            raise HTTPException(status_code=400, detail="Bạn đã hoàn thành nhiệm vụ này trong ngày hôm nay rồi.")

        # 3. Kiểm tra đáp án công tâm (Normalize chuỗi ký tự)
        is_correct = payload.selected_option.strip().upper() == task.correct_answer.strip().upper()
        
        if not is_correct:
            return TaskCompletionResponse(
                success=False,
                message="Đáp án chưa chính xác! Hãy thử lại.",
                reward_exp=0,
                reward_coin=0,
                new_total_points=0
            )

        # 4. Cộng thưởng vào User Profile
        profile = db.exec(select(UserProfiles).where(UserProfiles.user_id == user_id)).first()
        if profile:
            profile.total_points += task.reward_exp
            profile.points_balance += task.reward_coin
            profile.updated_at = datetime.utcnow()
            db.add(profile)

        # 5. Lưu lịch sử
        history = UserTaskHistory(
            user_id=user_id,
            location_id=task.location_id,
            task_type=TaskTypeEnum.QA,
            task_id=task.task_id,
            earned_exp=task.reward_exp,
            earned_coin=task.reward_coin
        )
        db.add(history)
        db.commit()

        return TaskCompletionResponse(
            success=True,
            message="Chính xác! Bạn nhận được điểm thưởng.",
            reward_exp=task.reward_exp,
            reward_coin=task.reward_coin,
            new_total_points=profile.total_points if profile else 0
        )

    def scan_qr_task(self, db: Session, user_id: UUID, payload: QRScanRequest) -> TaskCompletionResponse:
        # 1. Kiểm tra Token QR có tồn tại và còn hạn không
        qr_task = db.exec(select(QRTasks).where(QRTasks.qr_token == payload.qr_token)).first()
        if not qr_task:
            raise HTTPException(status_code=404, detail="Mã QR không hợp lệ hoặc không thuộc hệ thống.")
        
        if qr_task.expired_at < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Mã QR này đã hết hạn sử dụng.")

        # 2. Xử lý logic LUỒNG NPC / HÓA ĐƠN
        if qr_task.is_one_time and qr_task.is_used:
            raise HTTPException(status_code=400, detail="Mã QR trên hóa đơn này đã được sử dụng trước đó.")
        
        if qr_task.assigned_user_id and qr_task.assigned_user_id != user_id:
            raise HTTPException(status_code=403, detail="Mã QR này được cấp cho tài khoản khác, bạn không thể quét.")

        # 3. Anti-cheat vị trí GPS: Check xem vị trí quét có cách địa điểm < 100m không
        location = db.get(Locations, qr_task.location_id)
        if not location:
            raise HTTPException(status_code=404, detail="Không tìm thấy địa điểm gắn liền với QR này.")
        
        distance = calculate_haversine_distance(
            float(payload.latitude), float(payload.longitude),
            float(location.latitude), float(location.longitude)
        )
        if distance > 100: # Giới hạn 100m
            raise HTTPException(
                status_code=400, 
                detail=f"Xác thực thất bại. Bạn đang ở quá xa địa điểm thực tế ({round(distance)}m). Hãy tới gần hơn!"
            )

        # 4. Cập nhật trạng thái nếu là mã một lần (Hóa đơn NPC)
        if qr_task.is_one_time:
            qr_task.is_used = True
            db.add(qr_task)

        # 5. Cộng thưởng vào User Profile
        profile = db.exec(select(UserProfiles).where(UserProfiles.user_id == user_id)).first()
        if profile:
            profile.total_points += qr_task.reward_exp
            profile.points_balance += qr_task.reward_coin
            profile.updated_at = datetime.utcnow()
            db.add(profile)

        # 6. Ghi nhận lịch sử
        history = UserTaskHistory(
            user_id=user_id,
            location_id=qr_task.location_id,
            task_type=TaskTypeEnum.QR,
            task_id=qr_task.qr_task_id,
            earned_exp=qr_task.reward_exp,
            earned_coin=qr_task.reward_coin
        )
        db.add(history)
        db.commit()

        return TaskCompletionResponse(
            success=True,
            message="Quét mã QR thành công! Nhiệm vụ từ NPC đã được hoàn thành.",
            reward_exp=qr_task.reward_exp,
            reward_coin=qr_task.reward_coin,
            new_total_points=profile.total_points if profile else 0
        )
    
    def get_aggregated_tasks(self, db: Session, user_id: UUID, location_id: UUID) -> list[dict]:
        # 1. Lấy tất cả QA Task của địa điểm
        qa_tasks = db.exec(select(QATasks).where(QATasks.location_id == location_id)).all()
        
        # 2. Lấy tất cả QR tĩnh của địa điểm (bỏ qua mã QR in trên hóa đơn của NPC)
        qr_tasks = db.exec(select(QRTasks).where(QRTasks.location_id == location_id, QRTasks.is_one_time == False)).all()
        
        # 3. Lấy lịch sử hoàn thành task trong ngày của user
        today = datetime.utcnow().date()
        history = db.exec(select(UserTaskHistory).where(
            UserTaskHistory.user_id == user_id,
            UserTaskHistory.location_id == location_id,
            UserTaskHistory.completed_at >= datetime.combine(today, datetime.min.time())
        )).all()
        completed_task_ids = {h.task_id for h in history}

        # 4. Gom dữ liệu
        result = []
        for qa in qa_tasks:
            result.append({
                "task_id": qa.task_id,
                "task_type": "QA",
                "title": f"Hỏi đáp: {qa.question[:20]}...",
                "is_completed": qa.task_id in completed_task_ids,
                "reward_exp": qa.reward_exp,
                "reward_coin": qa.reward_coin
            })
            
        for qr in qr_tasks:
            result.append({
                "task_id": qr.qr_task_id,
                "task_type": "QR",
                "title": "Nhiệm vụ quét mã QR tại điểm",
                "is_completed": qr.qr_task_id in completed_task_ids,
                "reward_exp": qr.reward_exp,
                "reward_coin": qr.reward_coin
            })
            
        return result

crud_task = CRUDTask()