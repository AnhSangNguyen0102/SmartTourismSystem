import pytest
from uuid import uuid4
from sqlmodel import Session

from models import Users, UserFeedbacks, FeedbackType, FeedbackStatus, RegisterType, UserRole, UserStatus
from crud.crud_feedback import create_user_feedback, get_system_feedbacks

@pytest.fixture(name="user_setup")
def user_setup_fixture(db_session: Session):
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Người Dùng Phản Hồi",
        email="feedbacker@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()
    return user_id

def test_feedback_crud(db_session: Session, user_setup):
    user_id = user_setup

    # Create feedback
    feedback = create_user_feedback(
        db=db_session,
        user_id=user_id,
        feedback_type=FeedbackType.BUG,
        content="App bị lag khi mở bản đồ"
    )

    assert feedback.feedback_id is not None
    assert feedback.feedback_type == FeedbackType.BUG
    assert feedback.content == "App bị lag khi mở bản đồ"
    assert feedback.status == FeedbackStatus.PENDING

    # Get system feedbacks
    feedbacks = get_system_feedbacks(db_session)
    assert len(feedbacks) == 1
    assert feedbacks[0].feedback_id == feedback.feedback_id

    # Filter feedbacks by status
    feedbacks_pending = get_system_feedbacks(db_session, status_filter=FeedbackStatus.PENDING)
    assert len(feedbacks_pending) == 1

    feedbacks_resolved = get_system_feedbacks(db_session, status_filter=FeedbackStatus.RESOLVED)
    assert len(feedbacks_resolved) == 0
