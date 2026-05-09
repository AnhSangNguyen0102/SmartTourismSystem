"""
================================================================================
 crud/crud_system.py  │  USE CASE: System Settings & Exports
================================================================================
 Q   Op      Table(s)                                        Function
 ──  ──────  ──────────────────────────────────────────────  ────────────────────────────────────
 Q1  SELECT  SYSTEM_SETTINGS                                 get_system_setting
 Q2  INSERT  EXPORT_HISTORIES                                create_export_history
 Q3  UPDATE  EXPORT_HISTORIES                                update_export_status
================================================================================
"""

from typing import Optional
from uuid import UUID

from sqlmodel import Session, select
from models import SystemSettings, ExportHistories, ExportStatus, ExportFormat

# ---------------------------------------------------------------------------
# Q1 – Lấy cấu hình hệ thống (SELECT system_settings)
# ---------------------------------------------------------------------------

def get_system_setting(db: Session, config_key: str) -> Optional[SystemSettings]:
    """
    Lấy giá trị cấu hình hệ thống theo khoá (key).
    """
    statement = select(SystemSettings).where(SystemSettings.config_key == config_key)
    return db.exec(statement).first()

# ---------------------------------------------------------------------------
# Q2 – Tạo lịch sử xuất file (INSERT export_histories)
# ---------------------------------------------------------------------------

def create_export_history(
    db: Session,
    user_id: UUID,
    export_format: ExportFormat,
    file_url: str
) -> ExportHistories:
    """
    Tạo bản ghi theo dõi quá trình xuất dữ liệu (PDF, CSV).
    """
    export_log = ExportHistories(
        user_id=user_id,
        format=export_format,
        file_url=file_url,
        status=ExportStatus.PROCESSING
    )
    db.add(export_log)
    db.commit()
    db.refresh(export_log)
    return export_log

# ---------------------------------------------------------------------------
# Q3 – Cập nhật trạng thái xuất file (UPDATE export_histories)
# ---------------------------------------------------------------------------

def update_export_status(
    db: Session,
    export_id: UUID,
    new_status: ExportStatus
) -> Optional[ExportHistories]:
    """
    Cập nhật trạng thái file xuất (thành công / thất bại).
    """
    export_log = db.get(ExportHistories, export_id)
    if export_log:
        export_log.status = new_status
        db.add(export_log)
        db.commit()
        db.refresh(export_log)
    return export_log
