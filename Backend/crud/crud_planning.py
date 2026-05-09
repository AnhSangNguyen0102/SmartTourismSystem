"""
================================================================================
 crud/crud_planning.py  │  USE CASE: Quản lý phiên lập kế hoạch
================================================================================
 Q   Op      Table(s)                        Function
 ──  ──────  ──────────────────────────────  ───────────────────────────
 Q1  INSERT  PLANNING_SESSIONS               create_planning_session
 Q2  INSERT  TRAVEL_REQUEST_PREFERENCES      create_session_preferences
 Q3  SELECT  PLANNING_SESSIONS               get_planning_session
 Q4  UPDATE  PLANNING_SESSIONS               update_session_status
================================================================================
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

# pyrefly: ignore [missing-import]
from sqlmodel import Session, select

from models import (
    PlanningSessions,
    PlanningStatus,
    TravelRequestPreferences,
    CurrencyEnum,
    RequestHistoryLogs,
    RequestActionType,
)


# ---------------------------------------------------------------------------
# Q1 – Tạo phiên lập kế hoạch mới  (INSERT INTO planning_sessions)
# ---------------------------------------------------------------------------

def create_planning_session(
    db: Session,
    *,
    user_id: UUID,
    city_id: int,
    pax_adult: int,
    pax_children: int,
    budget: Decimal,
    currency: CurrencyEnum = CurrencyEnum.VND,
    start_day: date,
    end_day: date,
    status: PlanningStatus = PlanningStatus.PENDING,
) -> PlanningSessions:
    """
    Tạo bản ghi mới trong ``planning_sessions`` khi user nhập nhu cầu.

    Tự động sinh ``session_id`` (UUID v4) và ``create_at``.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session = PlanningSessions(
        session_id=uuid4(),
        user_id=user_id,
        city_id=city_id,
        pax_adult=pax_adult,
        pax_children=pax_children,
        budget=budget,
        currency=currency,
        start_day=start_day,
        end_day=end_day,
        status=status,
        create_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


# ---------------------------------------------------------------------------
# Q2 – Lưu tag sở thích của phiên  (INSERT INTO travel_request_preferences)
# ---------------------------------------------------------------------------

def create_session_preferences(
    db: Session,
    session_id: UUID,
    tag_ids: list[int],
) -> list[TravelRequestPreferences]:
    """
    Lưu danh sách tag sở thích cho một phiên lập kế hoạch.

    Parameters
    ----------
    tag_ids : list[int]
        Danh sách ``tag_id`` mà user chọn cho chuyến đi này.

    Returns
    -------
    list[TravelRequestPreferences]
        Các bản ghi vừa được tạo.
    """
    rows: list[TravelRequestPreferences] = []
    for tag_id in tag_ids:
        row = TravelRequestPreferences(session_id=session_id, tag_id=tag_id)
        db.add(row)
        rows.append(row)
    db.commit()
    return rows


# ---------------------------------------------------------------------------
# Q3 – Lấy thông tin phiên lập kế hoạch  (SELECT planning_sessions WHERE session_id = ?)
# ---------------------------------------------------------------------------

def get_planning_session(
    db: Session, session_id: UUID
) -> Optional[PlanningSessions]:
    """
    Lấy thông tin phiên lập kế hoạch để gửi sang Itinerary Management.

    Columns trả về: session_id, user_id, city_id, budget, start_day, end_day, status.
    Trả về ``None`` nếu không tìm thấy.
    """
    statement = (
        select(
            PlanningSessions.session_id,
            PlanningSessions.user_id,
            PlanningSessions.city_id,
            PlanningSessions.budget,
            PlanningSessions.start_day,
            PlanningSessions.end_day,
            PlanningSessions.status,
        )
        .where(PlanningSessions.session_id == session_id)
    )
    return db.exec(statement).first()


# ---------------------------------------------------------------------------
# Q4 – Cập nhật trạng thái phiên  (UPDATE planning_sessions SET status WHERE session_id = ?)
# ---------------------------------------------------------------------------

def update_session_status(
    db: Session,
    session_id: UUID,
    new_status: PlanningStatus,
) -> Optional[PlanningSessions]:
    """
    Cập nhật ``status`` của phiên lập kế hoạch.

    Trả về bản ghi sau khi cập nhật, hoặc ``None`` nếu không tìm thấy.
    """
    statement = select(PlanningSessions).where(
        PlanningSessions.session_id == session_id
    )
    row = db.exec(statement).first()
    if row is None:
        return None

    row.status = new_status
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Q5 – Tạo log request history (INSERT request_history_logs)
# ---------------------------------------------------------------------------

def create_request_history_log(
    db: Session,
    session_id: UUID,
    action_type: "RequestActionType",
    state_before: Optional[str] = None,
) -> RequestHistoryLogs:
    """
    Ghi lại lịch sử thay đổi của phiên lập kế hoạch (CREATE / RE_INPUT / CANCEL).

    Parameters
    ----------
    session_id : UUID
        Phiên lập kế hoạch liên quan.
    action_type : RequestActionType
        Loại hành động (CREATE, RE_INPUT, CANCEL).
    state_before : str | None
        Trạng thái trước khi thay đổi (JSON snapshot), tuỳ chọn.
    """
    log = RequestHistoryLogs(
        session_id=session_id,
        action_type=action_type,
        state_before=state_before,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
