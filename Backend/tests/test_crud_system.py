import pytest
from uuid import uuid4
from sqlmodel import Session

from models import Users, SystemSettings, ExportHistories, ExportStatus, ExportFormat, RegisterType, UserRole, UserStatus
from crud.crud_system import get_system_setting, create_export_history, update_export_status

@pytest.fixture(name="system_setup")
def system_setup_fixture(db_session: Session):
    # Create user
    user_id = uuid4()
    user = Users(
        user_id=user_id,
        full_name="Nhân viên xuất dữ liệu",
        email="exporter@gmail.com",
        register_type=RegisterType.EMAIL,
        role=UserRole.USER,
        status=UserStatus.ACTIVE
    )
    db_session.add(user)
    db_session.commit()

    # Create system setting
    setting = SystemSettings(
        config_key="maintenance_mode",
        config_value="false",
        updated_by=user_id
    )
    db_session.add(setting)
    db_session.commit()

    return {
        "user_id": user_id
    }

def test_get_system_setting(db_session: Session, system_setup):
    setting = get_system_setting(db_session, "maintenance_mode")
    assert setting is not None
    assert setting.config_value == "false"

    not_exist = get_system_setting(db_session, "unknown_key")
    assert not_exist is None

def test_export_history_crud(db_session: Session, system_setup):
    user_id = system_setup["user_id"]

    # Create export log
    log = create_export_history(
        db=db_session,
        user_id=user_id,
        export_format=ExportFormat.pdf,
        file_url="https://storage.smarttourism.vn/exports/file1.pdf"
    )

    assert log.export_id is not None
    assert log.format == ExportFormat.pdf
    assert log.status == ExportStatus.PROCESSING

    # Update status to COMPLETED
    updated = update_export_status(db_session, log.export_id, ExportStatus.COMPLETED)
    assert updated is not None
    assert updated.status == ExportStatus.COMPLETED

    # Update status for non-existent log
    non_existent = update_export_status(db_session, uuid4(), ExportStatus.FAILED)
    assert non_existent is None
