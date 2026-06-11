from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from database import get_session
from uuid import UUID, uuid4
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import or_, and_, func
from collections import defaultdict
from sqlalchemy.exc import IntegrityError
from fastapi.security import HTTPBearer
from jose import jwt, JWTError

import models
from core.security import verify_token
from core.config import settings
from crud.crud_feedback import create_user_feedback
from core.algorithms import calculate_hybrid_score
from services.social_post_service import delete_social_post_with_dependencies
from routers.gamification import auto_complete_daily_quest

router = APIRouter(prefix="/api/social", tags=["Social & Community - Mạng xã hội & Ghép đôi"])

security_scheme = HTTPBearer(auto_error=False)

def get_optional_token(credentials=Depends(security_scheme)):
    if not credentials:
        return None
    try:
        token = credentials.credentials
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except Exception:
        return None


# Helper to get user UUID from payload
def get_user_uuid(payload: dict) -> UUID:
    user_id_str = payload.get("user_id") or payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Không tìm thấy thông tin user trong Token")
    try:
        return UUID(user_id_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="User ID trong Token không đúng định dạng UUID")


# ==============================================================================
# 0. USER PROFILES
# ==============================================================================

@router.get("/profile/{user_id}")
def get_public_profile(user_id: UUID, db: Session = Depends(get_session)):
    """Lấy thông tin hồ sơ công khai của một người dùng"""
    user = db.exec(select(models.Users).where(models.Users.user_id == user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại")
        
    profile = db.exec(select(models.UserProfiles).where(models.UserProfiles.user_id == user_id)).first()
    
    # Lấy thống kê bạn bè
    friends_count = db.query(models.Friendships).filter(
        or_(
            and_(models.Friendships.user_id == user_id, models.Friendships.status == "ACCEPTED"),
            and_(models.Friendships.friend_id == user_id, models.Friendships.status == "ACCEPTED")
        )
    ).count()
    
    # Lấy danh sách bài đăng công khai
    posts_stmt = select(models.SocialPosts).where(
        models.SocialPosts.user_id == user_id,
        models.SocialPosts.privacy_status == "PUBLIC"
    ).order_by(models.SocialPosts.created_at.desc())
    posts = db.exec(posts_stmt).all()
    
    return {
        "user_id": str(user.user_id),
        "full_name": user.full_name,
        "role": user.role,
        "avatar": profile.avatar_url if profile else None,
        "bio": profile.bio if profile else "",
        "location": profile.base_location if profile else "",
        "travel_style": profile.travel_style if profile else "",
        "points": profile.points_balance if profile else 0,
        "total_points": profile.total_points if profile else 0,
        "rank": profile.status if profile else "Tân binh",
        "stats": {
            "friends": friends_count,
            "posts": len(posts),
            "badges": 0
        },
        "posts": posts
    }


# ==============================================================================
# 1. SOCIAL FEED (Bài viết)
# ==============================================================================

@router.get("/posts")
def get_posts(
    current_user: Optional[dict] = Depends(get_optional_token),
    db: Session = Depends(get_session)
):
    """Lấy bài viết từ cộng đồng kèm thông tin tác giả và lọc theo quyền riêng tư.
    Trả thêm user_liked / user_saved để frontend không cần gọi API riêng."""
    me = None
    if current_user:
        me = get_user_uuid(current_user)

    # Query join SocialPosts, Users, UserProfiles (outer join)
    query_stmt = select(models.SocialPosts, models.Users, models.UserProfiles).join(
        models.Users, models.SocialPosts.user_id == models.Users.user_id
    ).join(
        models.UserProfiles, models.Users.user_id == models.UserProfiles.user_id, isouter=True
    )
    
    if me:
        # Lấy danh sách ID bạn bè để lọc bài viết FRIENDS
        friendships = db.exec(
            select(models.Friendships).where(
                or_(
                    and_(models.Friendships.user_id == me, models.Friendships.status == "ACCEPTED"),
                    and_(models.Friendships.friend_id == me, models.Friendships.status == "ACCEPTED")
                )
            )
        ).all()
        
        friend_ids = [f.friend_id if f.user_id == me else f.user_id for f in friendships]
        
        # Lọc: PUBLIC hoặc Tự viết hoặc BẠN BÈ (nếu là FRIENDS)
        query_stmt = query_stmt.where(
            or_(
                models.SocialPosts.privacy_status == "PUBLIC",
                models.SocialPosts.user_id == me,
                and_(
                    models.SocialPosts.privacy_status == "FRIENDS",
                    models.SocialPosts.user_id.in_(friend_ids)
                )
            )
        )
    else:
        # Chưa đăng nhập chỉ xem PUBLIC
        query_stmt = query_stmt.where(models.SocialPosts.privacy_status == "PUBLIC")

    results = db.exec(query_stmt.order_by(models.SocialPosts.created_at.desc())).all()

    # Batch-load liked & saved status for the current user (2 queries total)
    liked_post_ids = set()
    saved_post_ids = set()
    if me:
        post_ids = [r[0].post_id for r in results]
        if post_ids:
            liked_post_ids = set(db.exec(
                select(models.PostLikes.post_id).where(
                    models.PostLikes.user_id == me,
                    models.PostLikes.post_id.in_(post_ids)
                )
            ).all())
            saved_post_ids = set(db.exec(
                select(models.PostSaves.post_id).where(
                    models.PostSaves.user_id == me,
                    models.PostSaves.post_id.in_(post_ids)
                )
            ).all())

    return [
        {
            "post_id": str(post.post_id),
            "user_id": str(post.user_id),
            "itinerary_id": str(post.itinerary_id) if post.itinerary_id else None,
            "caption": post.caption,
            "image_url": post.image_url,
            "location_name": post.location_name,
            "likes_count": post.likes_count,
            "comments_count": post.comments_count,
            "privacy_status": post.privacy_status,
            "created_at": post.created_at,
            "user_liked": post.post_id in liked_post_ids,
            "user_saved": post.post_id in saved_post_ids,
            "profiles": {
                "full_name": profile.full_name if profile else (user.full_name if user else "Thám hiểm gia"),
                "avatar_url": profile.avatar_url if profile else None,
                "total_points": profile.total_points if profile else 0
            }
        } for post, user, profile in results
    ]


@router.post("/posts")
def create_post(
    post_data: dict, 
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Tạo bài viết mới"""
    user_id = get_user_uuid(current_user)
    itinerary_id = post_data.get("itinerary_id")
    if itinerary_id:
        itinerary_id = UUID(itinerary_id)
        
    new_post = models.SocialPosts(
        user_id=user_id,
        itinerary_id=itinerary_id,
        caption=post_data.get("caption"),
        image_url=post_data.get("image_url", ""),
        location_name=post_data.get("location_name"),
        privacy_status=post_data.get("privacy_status", "PUBLIC")
    )
    db.add(new_post)
    db.commit()
    db.refresh(new_post)

    # Tự động hoàn thành nhiệm vụ hằng ngày loại SOCIAL
    try:
        auto_complete_daily_quest(db, user_id, "SOCIAL")
    except Exception as e:
        print(f"[Daily Quest] Lỗi tự động hoàn thành: {e}")

    return new_post


@router.get("/comments/{post_id}")
def get_comments(post_id: UUID, db: Session = Depends(get_session)):
    """Lấy danh sách bình luận kèm avatar và tên người dùng"""
    stmt = select(models.PostComments, models.Users, models.UserProfiles).join(
        models.Users, models.PostComments.user_id == models.Users.user_id
    ).join(
        models.UserProfiles, models.Users.user_id == models.UserProfiles.user_id, isouter=True
    ).where(models.PostComments.post_id == post_id).order_by(models.PostComments.created_at.desc())
    
    results = db.exec(stmt).all()
    
    return [
        {
            "comment_id": r[0].comment_id,
            "user_id": str(r[0].user_id),
            "content": r[0].content,
            "created_at": r[0].created_at,
            "profiles": {
                "full_name": r[2].full_name if r[2] else (r[1].full_name if r[1] else "Thám hiểm gia"),
                "avatar_url": r[2].avatar_url if r[2] else None,
                "total_points": r[2].total_points if r[2] else 0
            }
        } for r in results
    ]


@router.post("/comment")
def create_comment(
    comment_data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Create comment and update post comment count."""
    user_id = get_user_uuid(current_user)
    post_id_raw = comment_data.get("post_id")
    content = (comment_data.get("content") or "").strip()

    if not post_id_raw:
        raise HTTPException(status_code=400, detail="Missing post_id")
    if not content:
        raise HTTPException(status_code=400, detail="Comment content cannot be empty")

    try:
        post_id = UUID(str(post_id_raw))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid post_id")

    post = db.exec(select(models.SocialPosts).where(models.SocialPosts.post_id == post_id)).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    new_comment = models.PostComments(
        user_id=user_id,
        post_id=post_id,
        content=content
    )
    db.add(new_comment)

    # Update denormalized comment counter on post
    post.comments_count = (post.comments_count or 0) + 1
    db.add(post)

    db.commit()
    db.refresh(new_comment)

    author = db.exec(select(models.Users).where(models.Users.user_id == user_id)).first()
    author_profile = db.exec(
        select(models.UserProfiles).where(models.UserProfiles.user_id == user_id)
    ).first()

    return {
        "comment_id": new_comment.comment_id,
        "user_id": str(new_comment.user_id),
        "content": new_comment.content,
        "created_at": new_comment.created_at,
        "profiles": {
            "full_name": author_profile.full_name if author_profile else (author.full_name if author else "Traveler"),
            "avatar_url": author_profile.avatar_url if author_profile else None,
            "total_points": author_profile.total_points if author_profile else 0
        }
    }


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Xóa bình luận nếu là tác giả bình luận hoặc tác giả bài viết"""
    user_id = get_user_uuid(current_user)
    
    comment = db.exec(select(models.PostComments).where(models.PostComments.comment_id == comment_id)).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Bình luận không tồn tại")
        
    post = db.exec(select(models.SocialPosts).where(models.SocialPosts.post_id == comment.post_id)).first()
    
    is_comment_owner = comment.user_id == user_id
    is_post_owner = post is not None and post.user_id == user_id
    
    if not (is_comment_owner or is_post_owner):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa bình luận này")
        
    if post:
        post.comments_count = max(0, (post.comments_count or 0) - 1)
        db.add(post)
        
    db.delete(comment)
    db.commit()
    
    return {"message": "Đã xóa bình luận thành công"}


@router.post("/like/{post_id}")
def toggle_like(
    post_id: UUID,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Thích/Bỏ thích bài viết"""
    user_id = get_user_uuid(current_user)
    
    existing_like = db.exec(
        select(models.PostLikes).where(
            models.PostLikes.user_id == user_id,
            models.PostLikes.post_id == post_id
        )
    ).first()
    
    post = db.exec(select(models.SocialPosts).where(models.SocialPosts.post_id == post_id)).first()
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")

    if existing_like:
        db.delete(existing_like)
        post.likes_count = max(0, (post.likes_count or 0) - 1)
        action = "unliked"
    else:
        new_like = models.PostLikes(user_id=user_id, post_id=post_id)
        db.add(new_like)
        post.likes_count = (post.likes_count or 0) + 1
        action = "liked"
        
    db.add(post)
    db.commit()
    return {"action": action, "likes_count": post.likes_count}


@router.post("/save/{post_id}")
def toggle_save(
    post_id: UUID,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Lưu/Bỏ lưu bài viết"""
    user_id = get_user_uuid(current_user)
    
    existing_save = db.exec(
        select(models.PostSaves).where(
            models.PostSaves.user_id == user_id,
            models.PostSaves.post_id == post_id
        )
    ).first()
    
    if existing_save:
        db.delete(existing_save)
        action = "unsaved"
    else:
        new_save = models.PostSaves(user_id=user_id, post_id=post_id)
        db.add(new_save)
        action = "saved"
        
    db.commit()
    return {"action": action}


@router.post("/report")
def report_post(
    report_data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Báo cáo bài viết vi phạm"""
    user_id = get_user_uuid(current_user)
    post_id = report_data.get("post_id")
    reason = report_data.get("reason", "")
    
    new_report = models.UserFeedbacks(
        feedback_id=uuid4(),
        user_id=user_id,
        feedback_type=models.FeedbackType.REPORT,
        content=f"Post ID: {post_id} | Reason: {reason}",
        status=models.FeedbackStatus.PENDING
    )
    db.add(new_report)
    db.commit()
    return {"message": "Cảm ơn bạn đã báo cáo. Chúng tôi sẽ xem xét sớm nhất có thể."}


@router.post("/feedback")
def submit_feedback(
    feedback_data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Gửi ý kiến đóng góp hoặc báo lỗi hệ thống"""
    user_id = get_user_uuid(current_user)
    feedback_type = feedback_data.get("feedback_type", "SUGGESTION")
    content = feedback_data.get("content", "").strip()
    
    if not content:
        raise HTTPException(status_code=400, detail="Nội dung đóng góp không được để trống")
        
    try:
        fb_type = models.FeedbackType(feedback_type)
    except ValueError:
        fb_type = models.FeedbackType.SUGGESTION

    feedback = create_user_feedback(db, user_id, fb_type, content)
    return {
        "message": "Cảm ơn ý kiến đóng góp của bạn. Chúng tôi sẽ ghi nhận và phản hồi sớm nhất có thể.",
        "feedback_id": str(feedback.feedback_id)
    }


# ==============================================================================
# 2. MATCHING (Ghép đôi)
# ==============================================================================

@router.get("/companions")
def get_companions(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Lấy danh sách người dùng để gợi ý ghép đôi (Companion Finder).
    Đã tối ưu: batch query Itineraries 1 lần thay vì N+1."""
    user_id = get_user_uuid(current_user)
    
    # 1. Tìm thông tin của tôi
    me_profile = db.exec(select(models.UserProfiles).where(models.UserProfiles.user_id == user_id)).first()
    if not me_profile:
        # Nếu chưa có profile (do vừa đăng ký bằng email/pass), tự động tạo một profile trống mặc định để tránh lỗi 404
        user_record = db.exec(select(models.Users).where(models.Users.user_id == user_id)).first()
        me_profile = models.UserProfiles(
            user_id=user_id,
            full_name=user_record.full_name if user_record else "Thám hiểm gia",
            date_of_birth=date(1990, 1, 1),
            gender=models.GenderEnum.OTHER,
            travel_style=models.TravelStyle.BACKPACKER,
            base_location="Việt Nam",
            points_balance=0,
            total_points=0,
            kyc_status=models.KycStatus.UNVERIFIED,
            privacy_status=models.PrivacyStatus.PUBLIC
        )
        db.add(me_profile)
        db.commit()
        db.refresh(me_profile)

    # 2. Lấy danh sách ID đã có mối quan hệ (bạn bè hoặc đang chờ phản hồi)
    friendships = db.exec(
        select(models.Friendships).where(
            or_(
                models.Friendships.user_id == user_id,
                models.Friendships.friend_id == user_id
            )
        )
    ).all()
    exclude_user_ids = {f.friend_id if f.user_id == user_id else f.user_id for f in friendships}

    # 3. Lấy tất cả user khác có profile mà chưa có mối quan hệ
    query_stmt = select(models.Users, models.UserProfiles).join(
        models.UserProfiles, models.Users.user_id == models.UserProfiles.user_id
    ).where(models.Users.user_id != user_id)
    
    if exclude_user_ids:
        query_stmt = query_stmt.where(~models.Users.user_id.in_(list(exclude_user_ids)))
        
    others = db.exec(query_stmt).all()

    # 3. Batch load ALL itineraries cho tất cả users (kể cả tôi) — 1 query duy nhất
    all_user_ids = [user_id] + [u.user_id for u, _ in others]
    all_itineraries = db.exec(
        select(models.Itineraries).where(models.Itineraries.user_id.in_(all_user_ids))
    ).all()

    # Group destinations by user_id trong Python
    dest_map = defaultdict(list)
    for iti in all_itineraries:
        if iti.name:
            dest_map[iti.user_id].append(iti.name)

    me_data = {
        "travel_style": me_profile.travel_style.value if me_profile.travel_style else "",
        "interests": [],
        "planned_destinations": dest_map.get(user_id, [])
    }

    companions = []
    for user, profile in others:
        u_data = {
            "travel_style": profile.travel_style.value if profile.travel_style else "",
            "interests": [],
            "planned_destinations": dest_map.get(user.user_id, [])
        }
        
        # Tính toán điểm ghép đôi dựa trên sở thích, lộ trình du lịch
        match_pct = calculate_hybrid_score(me_data, u_data)
        
        companions.append({
            "id": str(user.user_id),
            "name": profile.full_name,
            "avatar": profile.avatar_url or f"https://api.dicebear.com/7.x/avataaars/svg?seed={user.full_name}",
            "age": 22, # Mặc định hoặc tính từ date_of_birth
            "location": profile.base_location or "Việt Nam",
            "interests": [],
            "matchPercentage": match_pct,
            "bio": profile.bio or "Sẵn sàng cho những hành trình mới!"
        })
        
    companions.sort(key=lambda x: x["matchPercentage"], reverse=True)
    return companions


# ==============================================================================
# 3. LEADERBOARD & REWARDS
# ==============================================================================

@router.get("/leaderboard")
def get_leaderboard(db: Session = Depends(get_session)):
    """Lấy danh sách bảng xếp hạng người dùng có điểm cao nhất"""
    top_profiles = db.exec(
        select(models.UserProfiles).order_by(models.UserProfiles.total_points.desc()).limit(10)
    ).all()
    
    leaderboard = []
    for i, p in enumerate(top_profiles):
        leaderboard.append({
            "rank": i + 1,
            "user_id": str(p.user_id),
            "name": p.full_name,
            "points": p.points_balance,
            "total_points": p.total_points,
            "avatar": p.avatar_url or f"https://api.dicebear.com/7.x/avataaars/svg?seed={p.full_name}",
            "trend": "up" if i < 3 else "stable",
            "isMe": False
        })
    return leaderboard


@router.get("/rewards")
def get_rewards(
    current_user: Optional[dict] = Depends(get_optional_token),
    db: Session = Depends(get_session)
):
    """Lấy danh sách thành tựu (badges), voucher (privileges) và nhiệm vụ tĩnh từ DB"""
    user_id = None
    if current_user:
        try:
            user_id = get_user_uuid(current_user)
        except Exception:
            pass

    # 1. Badges / Milestones
    milestones = db.exec(select(models.Milestones)).all()
    unlocked_milestone_ids = set()
    if user_id:
        user_milestones = db.exec(
            select(models.UserMilestones.milestone_id)
            .where(models.UserMilestones.user_id == user_id)
        ).all()
        unlocked_milestone_ids = set(user_milestones)
        
    badge_list = [{
        "id": m.milestone_id,
        "name": m.milestone_name,
        "category": m.vibe_tag,
        "description": m.description,
        "requirement": m.requirement or f"Yêu cầu mở khóa mốc {m.milestone_name}",
        "icon": m.icon_url or "🏆",
        "points": m.credit_reward,
        "unlocked": m.milestone_id in unlocked_milestone_ids
    } for m in milestones]

    # 2. Vouchers / Privileges
    privileges = db.exec(select(models.Privileges).where(models.Privileges.is_active == True)).all()
    vouchers = [{
        "id": p.privilege_id,
        "brand": p.brand_name,
        "discount": p.title,
        "cost": p.credit_cost,
        "image": p.image_url
    } for p in privileges]

    # 3. Quests / DiscoveryPrompts
    prompts = db.exec(select(models.DiscoveryPrompts)).all()
    user_prompts_map = {}
    if user_id:
        user_prompts = db.exec(
            select(models.UserPrompts)
            .where(models.UserPrompts.user_id == user_id)
        ).all()
        user_prompts_map = {up.prompt_id: up for up in user_prompts}
        
    color_map = {"Dễ": "emerald", "Trung bình": "blue", "Khó": "rose"}
    
    quests = []
    for q in prompts:
        up = user_prompts_map.get(q.prompt_id)
        progress = up.current_progress if up else 0
        completed = up.is_completed if up else False
        
        quests.append({
            "id": q.prompt_id,
            "title": q.title,
            "description": q.description,
            "difficulty": q.difficulty or "Dễ",
            "reward": q.footprint_reward,
            "max": q.target_count,
            "progress": min(progress, q.target_count),
            "completed": completed,
            "color": color_map.get(q.difficulty, "blue")
        })

    return {
        "badges": badge_list,
        "vouchers": vouchers,
        "quests": quests
    }


@router.post("/redeem-voucher/{privilege_id}")
def redeem_voucher(
    privilege_id: int,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Đổi voucher từ điểm tích lũy của user"""
    import random
    import string
    
    user_id = get_user_uuid(current_user)
    
    # Lấy thông tin user profile
    profile = db.exec(select(models.UserProfiles).where(models.UserProfiles.user_id == user_id)).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ người dùng")
        
    # Lấy thông tin voucher/privilege
    privilege = db.get(models.Privileges, privilege_id)
    if not privilege:
        raise HTTPException(status_code=404, detail="Voucher không tồn tại")
        
    if not privilege.is_active:
        raise HTTPException(status_code=400, detail="Voucher này hiện đã dừng hoạt động")
        
    # Kiểm tra số dư điểm
    if profile.points_balance < privilege.credit_cost:
        raise HTTPException(status_code=400, detail="Số dư xu không đủ để đổi voucher này")
        
    # Trừ điểm
    profile.points_balance -= privilege.credit_cost
    db.add(profile)
    
    # Tạo mã voucher code ngẫu nhiên dạng: BRAND_INIT-XXXXXX (e.g. STB-129481)
    brand_prefix = "".join([w[0] for w in privilege.brand_name.split() if w]).upper()[:3]
    if not brand_prefix:
        brand_prefix = "VOU"
    random_str = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    voucher_code = f"{brand_prefix}-{random_str}"
    
    # Đăng ký coupon đã đổi
    user_privilege = models.UserPrivileges(
        user_id=user_id,
        privilege_id=privilege_id,
        redeemed_at=datetime.utcnow(),
        code=voucher_code,
        is_used=False
    )
    db.add(user_privilege)
    db.commit()
    
    return {
        "status": "success",
        "message": "Đổi voucher thành công!",
        "code": voucher_code,
        "points_balance": profile.points_balance
    }


@router.get("/locations/{location_id}/ambassador")
def get_location_ambassadors(
    location_id: UUID,
    db: Session = Depends(get_session)
):
    """Lấy danh sách Đại sứ địa phương dựa trên số lượng check-in tại địa điểm"""
    from sqlalchemy import func
    
    # Truy vấn lượt check-in từ bảng CheckinProgress join với ItineraryStops
    stmt = (
        select(
            models.CheckinProgress.user_id,
            models.UserProfiles.full_name,
            models.UserProfiles.avatar_url,
            func.count(models.CheckinProgress.progress_id).label("checkin_count")
        )
        .join(models.ItineraryStops, models.CheckinProgress.stop_id == models.ItineraryStops.stop_id)
        .join(models.UserProfiles, models.CheckinProgress.user_id == models.UserProfiles.user_id)
        .where(models.ItineraryStops.location_id == location_id)
        .group_by(models.CheckinProgress.user_id, models.UserProfiles.full_name, models.UserProfiles.avatar_url)
        .order_by(func.count(models.CheckinProgress.progress_id).desc())
        .limit(5)
    )
    
    results = db.exec(stmt).all()
    
    ambassador_list = []
    for r in results:
        ambassador_list.append({
            "user_id": str(r[0]),
            "name": r[1],
            "avatar": r[2] or f"https://api.dicebear.com/7.x/avataaars/svg?seed={r[1]}",
            "checkin_count": r[3]
        })
        
    return ambassador_list


# ==============================================================================
# 4. SOCIAL INTERACTION (Friend, Chat)
# ==============================================================================

@router.get("/friends")
def get_friends(current_user: dict = Depends(verify_token), db: Session = Depends(get_session)):
    """Lấy danh sách bạn bè đã kết nối (ACCEPTED).
    Đã tối ưu: batch query last messages thay vì N+1."""
    user_id = get_user_uuid(current_user)
    
    friendships = db.exec(
        select(models.Friendships).where(
            and_(
                or_(models.Friendships.user_id == user_id, models.Friendships.friend_id == user_id),
                models.Friendships.status == "ACCEPTED"
            )
        )
    ).all()
    
    friend_ids = []
    for f in friendships:
        if f.user_id == user_id:
            friend_ids.append(f.friend_id)
        else:
            friend_ids.append(f.user_id)
            
    if not friend_ids:
        return []
        
    results = db.exec(
        select(models.Users, models.UserProfiles).join(
            models.UserProfiles, models.Users.user_id == models.UserProfiles.user_id, isouter=True
        ).where(models.Users.user_id.in_(friend_ids))
    ).all()

    # Batch-load last messages for ALL friends in 1 query (fix N+1)
    all_messages = db.exec(
        select(models.ChatMessages).where(
            or_(
                and_(models.ChatMessages.sender_id == user_id, models.ChatMessages.receiver_id.in_(friend_ids)),
                and_(models.ChatMessages.sender_id.in_(friend_ids), models.ChatMessages.receiver_id == user_id)
            )
        ).order_by(models.ChatMessages.created_at.desc())
    ).all()

    # Group by friend and pick last message per friend
    last_msg_map = {}
    for msg in all_messages:
        friend_id = msg.receiver_id if msg.sender_id == user_id else msg.sender_id
        if friend_id not in last_msg_map:
            last_msg_map[friend_id] = msg
    
    friend_list = []
    for u, p in results:
        last_msg = last_msg_map.get(u.user_id)
        
        last_msg_data = None
        if last_msg:
            last_msg_data = {
                "content": last_msg.content,
                "created_at": last_msg.created_at.isoformat() if last_msg.created_at else None,
                "sender_id": str(last_msg.sender_id),
                "is_read": last_msg.is_read
            }
            
        friend_list.append({
            "id": str(u.user_id),
            "name": p.full_name if p else u.full_name,
            "avatar": (p.avatar_url if p else None) or f"https://api.dicebear.com/7.x/avataaars/svg?seed={u.full_name}",
            "bio": (p.bio if p else None) or "Sẵn sàng cho những hành trình mới!",
            "location": (p.base_location if p else None) or "Việt Nam",
            "points": p.points_balance if p else 0,
            "rank": p.status if p else "Tân binh",
            "last_message": last_msg_data
        })
        
    def get_sort_key(item):
        last_msg = item.get("last_message")
        if last_msg and last_msg.get("created_at"):
            return (1, last_msg.get("created_at"))
        return (0, "")
        
    friend_list.sort(key=get_sort_key, reverse=True)
    return friend_list


@router.post("/friend-request")
def send_friend_request(data: dict, current_user: dict = Depends(verify_token), db: Session = Depends(get_session)):
    """Gửi lời mời kết bạn"""
    user_id = get_user_uuid(current_user)
    friend_id = UUID(data.get("friend_id"))
    
    if user_id == friend_id:
        raise HTTPException(status_code=400, detail="Không thể kết bạn với chính mình")
        
    existing = db.exec(
        select(models.Friendships).where(
            or_(
                and_(models.Friendships.user_id == user_id, models.Friendships.friend_id == friend_id),
                and_(models.Friendships.user_id == friend_id, models.Friendships.friend_id == user_id)
            )
        )
    ).first()
    
    if existing:
        if existing.status == "PENDING" and existing.friend_id == user_id:
            # Đối phương đã gửi lời mời trước đó, mình thích lại -> Tự động chấp nhận (Mutual Match)
            existing.status = "ACCEPTED"
            db.add(existing)
            
            # Tự động hoàn thành nhiệm vụ hằng ngày loại FRIEND cho cả 2
            try:
                auto_complete_daily_quest(db, user_id, "FRIEND")
                auto_complete_daily_quest(db, existing.user_id, "FRIEND")
            except Exception as e:
                print(f"[Daily Quest] Lỗi tự động hoàn thành: {e}")
                
            db.commit()
            return {"message": "Đã ghép đôi thành công!", "status": "ACCEPTED"}
        elif existing.status == "ACCEPTED":
            return {"message": "Đã là bạn bè", "status": "ACCEPTED"}
        else:
            return {"message": "Đã gửi lời mời kết bạn trước đó", "status": "PENDING"}
        
    new_friendship = models.Friendships(
        friendship_id=uuid4(),
        user_id=user_id,
        friend_id=friend_id,
        status="PENDING"
    )
    db.add(new_friendship)
    db.commit()
    return {"message": "Đã gửi lời mời kết bạn", "status": "PENDING"}


@router.get("/friend-requests/pending")
def get_pending_friend_requests(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Lấy danh sách lời mời kết bạn đang chờ phản hồi"""
    user_id = get_user_uuid(current_user)
    
    requests = db.exec(
        select(models.Friendships, models.Users, models.UserProfiles).join(
            models.Users, models.Friendships.user_id == models.Users.user_id
        ).join(
            models.UserProfiles, models.Friendships.user_id == models.UserProfiles.user_id, isouter=True
        ).where(
            models.Friendships.friend_id == user_id,
            models.Friendships.status == "PENDING"
        )
    ).all()
    
    return [
        {
            "friendship_id": str(f.friendship_id),
            "user_id": str(f.user_id),
            "name": p.full_name if p else (u.full_name if u else "Thám hiểm gia"),
            "avatar": (p.avatar_url if p else None) or f"https://api.dicebear.com/7.x/avataaars/svg?seed={u.full_name if u else 'Traveler'}",
            "created_at": f.created_at
        } for f, u, p in requests
    ]


@router.post("/friend-requests/respond")
def respond_friend_request(
    data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Chấp nhận hoặc từ chối kết bạn"""
    user_id = get_user_uuid(current_user)
    friendship_id = UUID(data.get("friendship_id"))
    action = data.get("action") # ACCEPT or REJECT
    
    friendship = db.exec(
        select(models.Friendships).where(
            models.Friendships.friendship_id == friendship_id,
            models.Friendships.friend_id == user_id
        )
    ).first()
    
    if not friendship:
        raise HTTPException(status_code=404, detail="Không tìm thấy lời mời kết bạn")
        
    if action == "ACCEPT":
        friendship.status = "ACCEPTED"
        db.add(friendship)
        
        # Tự động hoàn thành nhiệm vụ hằng ngày loại FRIEND cho cả 2
        try:
            auto_complete_daily_quest(db, user_id, "FRIEND")
            auto_complete_daily_quest(db, friendship.user_id, "FRIEND")
        except Exception as e:
            print(f"[Daily Quest] Lỗi tự động hoàn thành: {e}")
    else:
        db.delete(friendship)
        
    db.commit()
    return {"message": f"Đã {action} lời mời thành công"}


@router.get("/messages/{target_user_id}")
def get_messages(
    target_user_id: UUID,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Lấy lịch sử cuộc trò chuyện (tin nhắn chat)"""
    user_id = get_user_uuid(current_user)
    
    # Kiểm tra xem có phải bạn bè không
    friendship = db.exec(
        select(models.Friendships).where(
            and_(
                or_(
                    and_(models.Friendships.user_id == user_id, models.Friendships.friend_id == target_user_id),
                    and_(models.Friendships.user_id == target_user_id, models.Friendships.friend_id == user_id)
                ),
                models.Friendships.status == "ACCEPTED"
            )
        )
    ).first()
    if not friendship:
        raise HTTPException(status_code=403, detail="Chỉ bạn bè mới có thể xem tin nhắn của nhau")
        
    messages = db.exec(
        select(models.ChatMessages).where(
            or_(
                and_(models.ChatMessages.sender_id == user_id, models.ChatMessages.receiver_id == target_user_id),
                and_(models.ChatMessages.sender_id == target_user_id, models.ChatMessages.receiver_id == user_id)
            )
        ).order_by(models.ChatMessages.created_at.asc())
    ).all()
    
    # Đánh dấu đã đọc
    unread_messages = db.exec(
        select(models.ChatMessages).where(
            models.ChatMessages.sender_id == target_user_id,
            models.ChatMessages.receiver_id == user_id,
            models.ChatMessages.is_read == False
        )
    ).all()
    for m in unread_messages:
        m.is_read = True
        db.add(m)
    db.commit()
    
    return [
        {
            "id": str(m.message_id),
            "sender_id": str(m.sender_id),
            "receiver_id": str(m.receiver_id),
            "content": m.content,
            "type": m.message_type,
            "is_read": m.is_read,
            "created_at": m.created_at
        } for m in messages
    ]


@router.post("/messages")
def send_message(data: dict, current_user: dict = Depends(verify_token), db: Session = Depends(get_session)):
    """Gửi tin nhắn mới"""
    user_id = get_user_uuid(current_user)
    receiver_id = UUID(data.get("receiver_id"))
    
    # Kiểm tra xem có phải bạn bè không
    friendship = db.exec(
        select(models.Friendships).where(
            and_(
                or_(
                    and_(models.Friendships.user_id == user_id, models.Friendships.friend_id == receiver_id),
                    and_(models.Friendships.user_id == receiver_id, models.Friendships.friend_id == user_id)
                ),
                models.Friendships.status == "ACCEPTED"
            )
        )
    ).first()
    if not friendship:
        raise HTTPException(status_code=403, detail="Chỉ bạn bè mới có thể nhắn tin cho nhau")
        
    new_msg = models.ChatMessages(
        message_id=uuid4(),
        sender_id=user_id,
        receiver_id=receiver_id,
        content=data.get("content", ""),
        message_type=data.get("type", "TEXT")
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    return new_msg


@router.delete("/messages/{target_user_id}")
def clear_messages(target_user_id: UUID, current_user: dict = Depends(verify_token), db: Session = Depends(get_session)):
    """Xóa lịch sử cuộc trò chuyện"""
    user_id = get_user_uuid(current_user)
    db.query(models.ChatMessages).filter(
        or_(
            and_(models.ChatMessages.sender_id == user_id, models.ChatMessages.receiver_id == target_user_id),
            and_(models.ChatMessages.sender_id == target_user_id, models.ChatMessages.receiver_id == user_id)
        )
    ).delete()
    db.commit()
    return {"message": "Đã xóa toàn bộ lịch sử trò chuyện thành công"}


@router.get("/my-posts")
def get_my_posts(current_user: dict = Depends(verify_token), db: Session = Depends(get_session)):
    """Lấy danh sách các bài đăng của bản thân"""
    user_id = get_user_uuid(current_user)
    posts = db.exec(
        select(models.SocialPosts).where(models.SocialPosts.user_id == user_id).order_by(models.SocialPosts.created_at.desc())
    ).all()
    return posts


@router.get("/saved-posts")
def get_saved_posts(
    filter_type: str = "saved",
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Lấy danh sách các bài đăng đã lưu, đã tim hoặc đã bình luận"""
    user_id = get_user_uuid(current_user)
    
    if filter_type == "liked":
        results = db.exec(
            select(models.SocialPosts, models.Users, models.UserProfiles).join(
                models.PostLikes, models.SocialPosts.post_id == models.PostLikes.post_id
            ).join(
                models.Users, models.SocialPosts.user_id == models.Users.user_id
            ).join(
                models.UserProfiles, models.SocialPosts.user_id == models.UserProfiles.user_id, isouter=True
            ).where(models.PostLikes.user_id == user_id).order_by(models.PostLikes.created_at.desc())
        ).all()
    elif filter_type == "commented":
        subquery = select(
            models.PostComments.post_id,
            func.max(models.PostComments.created_at).label("latest_comment")
        ).where(
            models.PostComments.user_id == user_id
        ).group_by(
            models.PostComments.post_id
        ).subquery()

        results = db.exec(
            select(models.SocialPosts, models.Users, models.UserProfiles).join(
                subquery, models.SocialPosts.post_id == subquery.c.post_id
            ).join(
                models.Users, models.SocialPosts.user_id == models.Users.user_id
            ).join(
                models.UserProfiles, models.SocialPosts.user_id == models.UserProfiles.user_id, isouter=True
            ).order_by(subquery.c.latest_comment.desc())
        ).all()
    else: # default is "saved"
        results = db.exec(
            select(models.SocialPosts, models.Users, models.UserProfiles).join(
                models.PostSaves, models.SocialPosts.post_id == models.PostSaves.post_id
            ).join(
                models.Users, models.SocialPosts.user_id == models.Users.user_id
            ).join(
                models.UserProfiles, models.SocialPosts.user_id == models.UserProfiles.user_id, isouter=True
            ).where(models.PostSaves.user_id == user_id).order_by(models.PostSaves.created_at.desc())
        ).all()
    
    return [
        {
            "post_id": str(post.post_id),
            "user_id": str(post.user_id),
            "caption": post.caption,
            "image_url": post.image_url,
            "location_name": post.location_name,
            "created_at": post.created_at,
            "profiles": {
                "full_name": profile.full_name if profile else (user.full_name if user else "Thám hiểm gia"),
                "avatar_url": profile.avatar_url if profile else None
            }
        } for post, user, profile in results
    ]


@router.delete("/posts/{post_id}")
def delete_post(post_id: UUID, current_user: dict = Depends(verify_token), db: Session = Depends(get_session)):
    """Xóa bài đăng của chính mình"""
    user_id = get_user_uuid(current_user)

    try:
        deleted = delete_social_post_with_dependencies(db, post_id, owner_user_id=user_id)
        if deleted is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết hoặc bạn không có quyền xóa")

        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Không thể xóa bài viết vì còn dữ liệu liên kết chưa được xử lý.",
        )
    
    return {
        "message": "Đã xóa bài viết thành công",
        "deleted_counts": {
            "likes": deleted.likes_deleted,
            "comments": deleted.comments_deleted,
            "saves": deleted.saves_deleted,
        },
    }


@router.patch("/posts/{post_id}/privacy")
def update_post_privacy(
    post_id: UUID,
    data: dict,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_session)
):
    """Cập nhật quyền riêng tư cho bài viết"""
    user_id = get_user_uuid(current_user)
    post = db.exec(
        select(models.SocialPosts).where(
            models.SocialPosts.post_id == post_id,
            models.SocialPosts.user_id == user_id
        )
    ).first()
    
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài viết hoặc bạn không có quyền chỉnh sửa")
        
    new_privacy = data.get("privacy_status")
    if new_privacy not in ["PUBLIC", "FRIENDS", "PRIVATE"]:
        raise HTTPException(status_code=400, detail="Trạng thái không hợp lệ (PUBLIC, FRIENDS, PRIVATE)")
        
    post.privacy_status = new_privacy
    db.add(post)
    db.commit()
    return {"message": "Đã cập nhật quyền riêng tư", "privacy_status": new_privacy}
