"""
================================================================================
 crud/crud_feedback.py  │  USE CASE: Thu thập Feedback / Đánh giá
================================================================================
 Q   Op      Table(s)                                        Function
 ──  ──────  ──────────────────────────────────────────────  ────────────────────────────────────
 Q1  INSERT  USER_FEEDBACKS                                  create_user_feedback
 Q2  SELECT  USER_FEEDBACKS                                  get_system_feedbacks
================================================================================
"""

from uuid import UUID
from sqlmodel import Session, select
from models import UserFeedbacks, FeedbackType, FeedbackStatus

# ---------------------------------------------------------------------------
# Q1 – Tạo Feedback hệ thống (INSERT user_feedbacks)
# ---------------------------------------------------------------------------

def create_user_feedback(
    db: Session,
    user_id: UUID,
    feedback_type: FeedbackType,
    content: str
) -> UserFeedbacks:
    """
    Lưu phản hồi của người dùng lên hệ thống.
    LƯU Ý: Bảng USER_FEEDBACKS hiện tại chỉ dùng để báo lỗi (BUG), 
    góp ý (SUGGESTION), hoặc báo cáo (REPORT) toàn hệ thống.
    Không có trường location_id để đánh giá từng địa điểm.
    """
    feedback = UserFeedbacks(
        user_id=user_id,
        feedback_type=feedback_type,
        content=content,
        status=FeedbackStatus.PENDING
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


# ---------------------------------------------------------------------------
# Q2 – Lấy danh sách Feedback (SELECT user_feedbacks)
# ---------------------------------------------------------------------------

def get_system_feedbacks(
    db: Session,
    status_filter: FeedbackStatus | None = None
) -> list[UserFeedbacks]:
    """
    Lấy danh sách feedback toàn hệ thống (dành cho Admin).
    """
    statement = select(UserFeedbacks)
    if status_filter:
        statement = statement.where(UserFeedbacks.status == status_filter)
    
    statement = statement.order_by(UserFeedbacks.created_at.desc())
    return db.exec(statement).all()
