import asyncio
import os
import sys
from pathlib import Path

import httpx
import pytest
from unittest.mock import patch

# Force a test-only database before importing any project module. Environment
# variables take precedence over values from Backend/.env.
TEST_DATABASE_URL = "sqlite:///:memory:"
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test_secret_key_12345678901234567890_test_key"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["DB_ECHO"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["REDIS_URL"] = "redis://127.0.0.1:1/15"

from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy import event
from sqlalchemy.pool import StaticPool

# Keep imports stable whether pytest is launched from Backend/ or the repo root.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import database
from main import app
from database import get_session


class SyncASGITestClient:
    """Synchronous wrapper around httpx's in-process ASGI transport."""

    def __init__(self, asgi_app):
        self.app = asgi_app

    def request(self, method, url, **kwargs):
        async def send_request():
            transport = httpx.ASGITransport(app=self.app, raise_app_exceptions=True)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://testserver",
                follow_redirects=True,
            ) as client:
                return await client.request(method, url, **kwargs)

        return asyncio.run(send_request())

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def put(self, url, **kwargs):
        return self.request("PUT", url, **kwargs)

    def patch(self, url, **kwargs):
        return self.request("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self.request("DELETE", url, **kwargs)

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# A hard guard against accidentally running the suite against Backend/.env.
assert test_engine.url.get_backend_name() == "sqlite"
assert database.engine.url.get_backend_name() == "sqlite"
database.engine = test_engine


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    SQLModel.metadata.create_all(test_engine)
    yield
    SQLModel.metadata.drop_all(test_engine)


@pytest.fixture(name="db_session")
def db_session_fixture():
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()


@pytest.fixture(name="client")
def client_fixture(db_session):
    def get_session_override():
        yield db_session

    app.dependency_overrides[get_session] = get_session_override
    yield SyncASGITestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(scope="session", autouse=True)
def mock_email_services():
    with patch("services.email_service.send_otp_email", return_value=True) as mock_otp, \
         patch("services.email_service.send_reset_password_email", return_value=True) as mock_reset:
        yield mock_otp, mock_reset


@pytest.fixture(scope="session", autouse=True)
def mock_google_auth():
    mock_payload = {
        "email": "test_google@example.com",
        "name": "Google Tester",
        "sub": "google-oauth-id-123456"
    }
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload) as mock_verify:
        yield mock_verify


@pytest.fixture(autouse=True)
def isolate_external_services(monkeypatch):
    """Prevent backend tests from reaching Redis, SMTP, or HTTP services."""
    from email_validator import validate_email as real_validate_email

    def validate_email_offline(email, **kwargs):
        kwargs["check_deliverability"] = False
        return real_validate_email(email, **kwargs)

    def block_http(*args, **kwargs):
        raise AssertionError("External HTTP calls are forbidden in backend tests")

    monkeypatch.setattr("routers.auth.validate_email", validate_email_offline)
    monkeypatch.setattr("requests.sessions.Session.request", block_http)
    monkeypatch.setattr("crud.crud_voucher.acquire_voucher_lock", lambda *args, **kwargs: True)
    monkeypatch.setattr("crud.crud_voucher.release_voucher_lock", lambda *args, **kwargs: None)


@pytest.fixture(autouse=True)
def clean_auth_memory_stores():
    from routers.auth import otp_storage, rate_limit_storage, register_otp_storage

    otp_storage.clear()
    rate_limit_storage.clear()
    register_otp_storage.clear()
    yield
    otp_storage.clear()
    rate_limit_storage.clear()
    register_otp_storage.clear()
