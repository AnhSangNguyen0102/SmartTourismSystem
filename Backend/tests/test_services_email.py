import pytest
from unittest.mock import patch, MagicMock
from services.email_service import send_otp_email, send_reset_password_email
from core.config import settings

@pytest.fixture(name="smtp_settings")
def smtp_settings_fixture():
    # Keep track of old configurations
    old_host = settings.SMTP_HOST
    old_port = settings.SMTP_PORT
    old_sender = settings.SMTP_SENDER
    old_username = settings.SMTP_USERNAME
    old_password = settings.SMTP_PASSWORD

    # Force mock SMTP configuration
    settings.SMTP_HOST = "smtp.mockserver.com"
    settings.SMTP_PORT = 587
    settings.SMTP_SENDER = "noreply@mockserver.com"
    settings.SMTP_USERNAME = "user"
    settings.SMTP_PASSWORD = "password"

    yield

    # Restore old configurations
    settings.SMTP_HOST = old_host
    settings.SMTP_PORT = old_port
    settings.SMTP_SENDER = old_sender
    settings.SMTP_USERNAME = old_username
    settings.SMTP_PASSWORD = old_password

def test_send_otp_email_smtp_mode(smtp_settings):
    # Mock SMTP client
    mock_smtp_instance = MagicMock()
    
    with patch("smtplib.SMTP", return_value=mock_smtp_instance) as mock_smtp_class:
        # Mock file write for otp_debug.txt
        with patch("builtins.open", MagicMock()):
            success = send_otp_email(
                to_email="customer@example.com",
                otp_code="123456",
                client_ip="127.0.0.1"
            )
            assert success is True
            mock_smtp_class.assert_called_once_with("smtp.mockserver.com", 587, timeout=10)
            mock_smtp_instance.starttls.assert_called_once()
            mock_smtp_instance.login.assert_called_once_with("user", "password")
            mock_smtp_instance.sendmail.assert_called_once()
            mock_smtp_instance.quit.assert_called_once()

def test_send_reset_password_email_smtp_mode(smtp_settings):
    mock_smtp_instance = MagicMock()
    
    with patch("smtplib.SMTP", return_value=mock_smtp_instance) as mock_smtp_class:
        with patch("builtins.open", MagicMock()):
            success = send_reset_password_email(
                to_email="customer@example.com",
                otp_code="654321",
                client_ip="127.0.0.1"
            )
            assert success is True
            mock_smtp_class.assert_called_once_with("smtp.mockserver.com", 587, timeout=10)
            mock_smtp_instance.login.assert_called_once()

def test_send_email_fallback_mode():
    # Temporarily remove SMTP host to trigger console printing fallback
    old_host = settings.SMTP_HOST
    settings.SMTP_HOST = ""

    try:
        with patch("builtins.open", MagicMock()), patch("builtins.print") as mock_print:
            success = send_otp_email(
                to_email="customer@example.com",
                otp_code="111222"
            )
            assert success is True
            # Verify that DEVELOPMENT EMAIL MOCK is printed
            printed_args = [call[0][0] for call in mock_print.call_args_list if len(call[0]) > 0]
            assert any("DEVELOPMENT EMAIL MOCK" in str(arg) for arg in printed_args)
            assert any("111222" in str(arg) for arg in printed_args)
    finally:
        settings.SMTP_HOST = old_host
