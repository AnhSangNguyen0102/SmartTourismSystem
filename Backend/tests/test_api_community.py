import pytest
from datetime import date, datetime
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlmodel import Session

from models import (
    Users, UserProfiles, UserRole, UserStatus, RegisterType,
    SocialPosts, PostLikes, PostSaves, PostComments, UserFeedbacks, FeedbackType
)
from core.security import create_access_token

@pytest.fixture(name="community_setup")
def community_setup_fixture(db_session: Session):
    # 1. Tạo 2 User mẫu
    u1_id = uuid4()
    u1 = Users(
        user_id=u1_id,
        full_name="Nguyễn Văn Feed",
        email="feed.user1@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    p1 = UserProfiles(
        user_id=u1_id,
        full_name="Nguyễn Văn Feed",
        date_of_birth=date(1996, 6, 6),
        gender="MALE",
        points_balance=100,
        total_points=100
    )
    db_session.add(u1)
    db_session.add(p1)

    u2_id = uuid4()
    u2 = Users(
        user_id=u2_id,
        full_name="Trần Thị Comment",
        email="comment.user2@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    p2 = UserProfiles(
        user_id=u2_id,
        full_name="Trần Thị Comment",
        date_of_birth=date(1997, 7, 7),
        gender="FEMALE"
    )
    db_session.add(u2)
    db_session.add(p2)
    db_session.commit()

    return {
        "user1_id": u1_id,
        "user2_id": u2_id,
        "profile1": p1,
        "profile2": p2
    }

def test_create_and_get_posts(client: TestClient, db_session: Session, community_setup):
    u1_id = community_setup["user1_id"]
    token = create_access_token(data={"sub": str(u1_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Tạo bài đăng mới
    post_payload = {
        "caption": "Chuyến đi Đà Lạt tuyệt vời cùng gia đình!",
        "image_url": "http://img.com/dalat.png",
        "location_name": "Đà Lạt",
        "privacy_status": "PUBLIC"
    }
    response = client.post("/api/social/posts", json=post_payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["caption"] == "Chuyến đi Đà Lạt tuyệt vời cùng gia đình!"
    assert response.json()["location_name"] == "Đà Lạt"

    post_id = response.json()["post_id"]

    # 2. Lấy danh sách bài đăng cộng đồng (chưa đăng nhập / đăng nhập đều xem được PUBLIC)
    response_get = client.get("/api/social/posts")
    assert response_get.status_code == 200
    posts = response_get.json()
    assert len(posts) >= 1
    assert posts[0]["post_id"] == post_id
    assert posts[0]["profiles"]["full_name"] == "Nguyễn Văn Feed"

def test_like_and_save_post(client: TestClient, db_session: Session, community_setup):
    u1_id = community_setup["user1_id"]
    u2_id = community_setup["user2_id"]

    # Tạo sẵn 1 bài đăng của user 1
    post_id = uuid4()
    post = SocialPosts(
        post_id=post_id,
        user_id=u1_id,
        caption="Post mẫu để test Like & Save",
        likes_count=0,
        comments_count=0,
        privacy_status="PUBLIC"
    )
    db_session.add(post)
    db_session.commit()

    # Sinh token của user 2 thích bài viết
    u2_token = create_access_token(data={"sub": str(u2_id), "role": "USER"})
    u2_headers = {"Authorization": f"Bearer {u2_token}"}

    # 1. Thả tim (Like) lần đầu -> action: liked
    response_like = client.post(f"/api/social/like/{post_id}", headers=u2_headers)
    assert response_like.status_code == 200
    assert response_like.json()["action"] == "liked"
    assert response_like.json()["likes_count"] == 1

    # Thả tim lần hai -> action: unliked (Bỏ tim)
    response_unlike = client.post(f"/api/social/like/{post_id}", headers=u2_headers)
    assert response_unlike.status_code == 200
    assert response_unlike.json()["action"] == "unliked"
    assert response_unlike.json()["likes_count"] == 0

    # 2. Lưu bài viết (Save)
    response_save = client.post(f"/api/social/save/{post_id}", headers=u2_headers)
    assert response_save.status_code == 200
    assert response_save.json()["action"] == "saved"

    response_unsave = client.post(f"/api/social/save/{post_id}", headers=u2_headers)
    assert response_unsave.status_code == 200
    assert response_unsave.json()["action"] == "unsaved"

def test_comment_operations(client: TestClient, db_session: Session, community_setup):
    u1_id = community_setup["user1_id"]
    u2_id = community_setup["user2_id"]

    # Tạo sẵn bài đăng của user 1
    post_id = uuid4()
    post = SocialPosts(
        post_id=post_id,
        user_id=u1_id,
        caption="Post để test bình luận",
        likes_count=0,
        comments_count=0,
        privacy_status="PUBLIC"
    )
    db_session.add(post)
    db_session.commit()

    u2_token = create_access_token(data={"sub": str(u2_id), "role": "USER"})
    u2_headers = {"Authorization": f"Bearer {u2_token}"}

    # 1. Đăng bình luận mới
    payload_comment = {
        "post_id": str(post_id),
        "content": "Bài viết hay quá bạn ơi!"
    }
    response_comment = client.post("/api/social/comment", json=payload_comment, headers=u2_headers)
    assert response_comment.status_code == 200
    assert response_comment.json()["content"] == "Bài viết hay quá bạn ơi!"
    assert response_comment.json()["profiles"]["full_name"] == "Trần Thị Comment"

    comment_id = response_comment.json()["comment_id"]

    # Xác minh số lượng comment tăng lên trong SocialPosts
    db_session.refresh(post)
    assert post.comments_count == 1

    # 2. Lấy danh sách bình luận của bài đăng
    response_get = client.get(f"/api/social/comments/{post_id}")
    assert response_get.status_code == 200
    assert len(response_get.json()) == 1
    assert response_get.json()[0]["content"] == "Bài viết hay quá bạn ơi!"

    # 3. Xóa bình luận
    response_delete = client.delete(f"/api/social/comments/{comment_id}", headers=u2_headers)
    assert response_delete.status_code == 200
    assert "xóa bình luận thành công" in response_delete.json()["message"].lower()

    # Xác minh số lượng comment giảm xuống
    db_session.refresh(post)
    assert post.comments_count == 0

def test_report_post_api(client: TestClient, db_session: Session, community_setup):
    u2_id = community_setup["user2_id"]
    token = create_access_token(data={"sub": str(u2_id), "role": "USER"})
    headers = {"Authorization": f"Bearer {token}"}

    post_id = uuid4()
    report_payload = {
        "post_id": str(post_id),
        "reason": "Nội dung rác"
    }

    # Gọi API báo cáo bài viết vi phạm
    response = client.post("/api/social/report", json=report_payload, headers=headers)
    assert response.status_code == 200
    assert "Cảm ơn bạn đã báo cáo" in response.json()["message"]

    # Xác minh DB ghi nhận báo cáo trong Feedback (Report)
    report = db_session.query(UserFeedbacks).filter(UserFeedbacks.feedback_type == FeedbackType.REPORT).first()
    assert report is not None
    assert str(post_id) in report.content
    assert "Nội dung rác" in report.content
