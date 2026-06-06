import os
import sys
import pytest
from unittest.mock import patch

# Cấu hình biến môi trường trước khi import bất kỳ module nào của dự án
os.environ["ENVIRONMENT"] = "development"
os.environ["SECRET_KEY"] = "test_secret_key_12345678901234567890_test_key"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from sqlmodel import SQLModel, create_engine, Session
from fastapi.testclient import TestClient

# Import các file database và main của hệ thống
import database
from main import app
from database import get_session

# Thiết lập engine SQLite cho môi trường test
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False}
)

# Gán đè engine trong file database.py bằng engine SQLite test
database.engine = test_engine

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """
    Tự động khởi tạo tất cả các bảng dựa trên định nghĩa trong models.py.
    """
    SQLModel.metadata.create_all(test_engine)
    yield
    SQLModel.metadata.drop_all(test_engine)

@pytest.fixture(name="db_session")
def db_session_fixture():
    """
    Tạo một Session cô lập cho từng test case và rollback mọi thay đổi sau khi chạy xong.
    """
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(name="client")
def client_fixture(db_session):
    """
    Tạo FastAPI TestClient và gán đè session DB thực tế bằng session SQLite test cô lập.
    """
    def get_session_override():
        yield db_session
        
    app.dependency_overrides[get_session] = get_session_override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()

@pytest.fixture(scope="session", autouse=True)
def mock_email_services():
    """
    Tự động mock các hàm gửi email để không thực hiện cuộc gọi mạng thực tế hoặc ghi log rác.
    """
    with patch("services.email_service.send_otp_email", return_value=True) as mock_otp, \
         patch("services.email_service.send_reset_password_email", return_value=True) as mock_reset:
        yield mock_otp, mock_reset

@pytest.fixture(scope="session", autouse=True)
def mock_google_auth():
    """
    Mock hàm verify id token của Google OAuth.
    """
    mock_payload = {
        "email": "test_google@example.com",
        "name": "Google Tester",
        "sub": "google-oauth-id-123456"
    }
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload) as mock_verify:
        yield mock_verify
