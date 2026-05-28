from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import delete
from sqlmodel import Session, select

import models


@dataclass(frozen=True)
class DeletedSocialPostSummary:
    post_id: UUID
    likes_deleted: int
    comments_deleted: int
    saves_deleted: int


def _result_rowcount(result) -> int:
    rowcount = getattr(result, "rowcount", 0)
    return max(rowcount or 0, 0)


def delete_social_post_with_dependencies(
    db: Session,
    post_id: UUID,
    owner_user_id: UUID | None = None,
) -> DeletedSocialPostSummary | None:
    """
    Delete a social post and all rows that reference it in one transaction.

    The parent row is locked first so a concurrent like/comment/save cannot be
    inserted between the cleanup queries and the final post delete.
    """
    statement = select(models.SocialPosts).where(models.SocialPosts.post_id == post_id)
    if owner_user_id is not None:
        statement = statement.where(models.SocialPosts.user_id == owner_user_id)

    post = db.exec(statement.with_for_update()).first()
    if post is None:
        return None

    likes_result = db.exec(
        delete(models.PostLikes).where(models.PostLikes.post_id == post_id)
    )
    comments_result = db.exec(
        delete(models.PostComments).where(models.PostComments.post_id == post_id)
    )
    saves_result = db.exec(
        delete(models.PostSaves).where(models.PostSaves.post_id == post_id)
    )

    db.delete(post)

    return DeletedSocialPostSummary(
        post_id=post_id,
        likes_deleted=_result_rowcount(likes_result),
        comments_deleted=_result_rowcount(comments_result),
        saves_deleted=_result_rowcount(saves_result),
    )
