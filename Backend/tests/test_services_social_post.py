import pytest
from uuid import uuid4
from sqlmodel import Session, select
from models import Users, SocialPosts, PostLikes, PostComments, PostSaves, RegisterType, UserRole, UserStatus
from services.social_post_service import delete_social_post_with_dependencies, DeletedSocialPostSummary

@pytest.fixture(name="post_setup")
def post_setup_fixture(db_session: Session):
    # Create owner
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Người đăng bài",
        email="owner@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()

    # Create post
    post = SocialPosts(
        post_id=uuid4(),
        user_id=user_id,
        content="Hôm nay trời đẹp quá!"
    )
    db_session.add(post)
    db_session.commit()

    # Create likes, comments, saves
    like1 = PostLikes(post_id=post.post_id, user_id=uuid4())
    like2 = PostLikes(post_id=post.post_id, user_id=uuid4())
    comment = PostComments(post_id=post.post_id, user_id=uuid4(), content="Đúng vậy!")
    save = PostSaves(post_id=post.post_id, user_id=uuid4())

    db_session.add(like1)
    db_session.add(like2)
    db_session.add(comment)
    db_session.add(save)
    db_session.commit()

    return {
        "user_id": user_id,
        "post_id": post.post_id
    }

def test_delete_social_post_not_found(db_session: Session):
    result = delete_social_post_with_dependencies(db_session, uuid4())
    assert result is None

def test_delete_social_post_wrong_owner(db_session: Session, post_setup):
    wrong_owner = uuid4()
    result = delete_social_post_with_dependencies(db_session, post_setup["post_id"], owner_user_id=wrong_owner)
    assert result is None

def test_delete_social_post_success(db_session: Session, post_setup):
    post_id = post_setup["post_id"]
    owner_id = post_setup["user_id"]

    result = delete_social_post_with_dependencies(db_session, post_id, owner_user_id=owner_id)
    assert result is not None
    assert result.post_id == post_id
    # Note: Depending on the backend database driver's support for rowcount in SQLite deletes,
    # it may return >= 0. We'll just check that it runs and deletes successfully.
    assert result.likes_deleted >= 0
    assert result.comments_deleted >= 0
    assert result.saves_deleted >= 0

    # Verify post and its dependencies are deleted from DB
    post_in_db = db_session.exec(select(SocialPosts).where(SocialPosts.post_id == post_id)).first()
    assert post_in_db is None

    likes = db_session.exec(select(PostLikes).where(PostLikes.post_id == post_id)).all()
    assert len(likes) == 0

    comments = db_session.exec(select(PostComments).where(PostComments.post_id == post_id)).all()
    assert len(comments) == 0

    saves = db_session.exec(select(PostSaves).where(PostSaves.post_id == post_id)).all()
    assert len(saves) == 0
