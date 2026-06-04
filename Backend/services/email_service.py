import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from core.config import settings
from datetime import datetime

def _send_email_smtp_base(to_email: str, subject: str, plain_body: str, html_body: str, otp_code: str) -> bool:
    """
    Base helper function to send email via SMTP, with a fallback to console print.
    """
    # Ghi log bắt đầu gửi vào otp_debug.txt
    try:
        with open("otp_debug.txt", "a", encoding="utf-8") as f:
            f.write(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [Email Service] Đang tiến hành gửi email đến {to_email}...")
    except Exception as debug_err:
        print(f"[Debug SMTP] Lỗi ghi file debug: {debug_err}")

    # Check if SMTP configuration is provided
    if settings.SMTP_HOST:
        try:
            msg = MIMEMultipart("alternative")
            msg["From"] = settings.SMTP_SENDER
            msg["To"] = to_email
            msg["Subject"] = subject
            
            # Attach both plain text and HTML versions
            msg.attach(MIMEText(plain_body, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))

            # Kết nối SMTP có timeout
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            server.ehlo()
            server.starttls()
            server.ehlo()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_SENDER, to_email, msg.as_string())
            server.quit()
            
            print(f"[Email Service] Email sent successfully to {to_email}")
            
            try:
                with open("otp_debug.txt", "a", encoding="utf-8") as f:
                    f.write(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [Email Service] GỬI THÀNH CÔNG đến {to_email} qua SMTP.\n")
            except Exception:
                pass
            return True
        except Exception as e:
            print(f"[Email Service] Failed to send email to {to_email} via SMTP: {e}")
            try:
                with open("otp_debug.txt", "a", encoding="utf-8") as f:
                    f.write(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [Email Service] GỬI THẤT BẠI đến {to_email} qua SMTP: {e}\n")
            except Exception:
                pass
            # Fallback to console print
            
    # Fallback to console print
    print("\n" + "="*80)
    print(f"  [DEVELOPMENT EMAIL MOCK]")
    print(f"  To: {to_email}")
    print(f"  Subject: {subject}")
    print(f"  Mã OTP của bạn là: {otp_code}")
    print("="*80 + "\n")
    return True


def send_otp_email(to_email: str, otp_code: str, client_ip: str = "Không xác định") -> bool:
    """
    Sends a 6-digit OTP verification email to the user.
    """
    subject = "[Smart Tourism] Mã OTP Xác Thực Tài Khoản Đăng Ký"
    
    plain_body = f"""
    Chào bạn,
    
    Cảm ơn bạn đã đăng ký tài khoản tại Smart Tourism.
    Mã xác thực OTP của bạn là: {otp_code}
    
    Mã này có hiệu lực trong vòng 10 phút.
    
    [CẢNH BÁO BẢO MẬT]
    - Yêu cầu này được thực hiện từ địa chỉ IP: {client_ip}
    - Tuyệt đối KHÔNG chia sẻ mã OTP này với bất kỳ ai để tránh nguy cơ bị đánh cắp tài khoản.
    - Đội ngũ Smart Tourism không bao giờ yêu cầu bạn cung cấp mã này.
    
    Trân trọng,
    Nhóm 7.
    """

    html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Mã OTP Xác Thực Tài Khoản Đăng Ký</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #334155;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
        <!-- Header -->
        <tr>
            <td style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 35px 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">SMART TOURISM</h1>
                <p style="color: #93c5fd; margin: 5px 0 0 0; font-size: 13px; font-weight: 500; letter-spacing: 0.5px;">Hành trình du lịch thông minh thế hệ mới</p>
            </td>
        </tr>
        
        <!-- Body -->
        <tr>
            <td style="padding: 40px 35px;">
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Chào bạn,</h2>
                <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                    Cảm ơn bạn đã đăng ký tài khoản tại <strong>Smart Tourism</strong>. Vui lòng nhập mã OTP bên dưới để kích hoạt tài khoản của bạn:
                </p>
                
                <!-- OTP Display Box -->
                <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 30px auto; background-color: #f0f7ff; border: 1.5px dashed #3b82f6; border-radius: 10px;">
                    <tr>
                        <td style="padding: 16px 45px; text-align: center;">
                            <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #2563eb; font-weight: 700; margin-bottom: 6px;">Mã xác thực OTP</span>
                            <span style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8; font-family: 'Courier New', Courier, monospace; display: inline-block; padding-left: 8px;">{otp_code}</span>
                        </td>
                    </tr>
                </table>
                
                <p style="margin: 0 0 28px 0; font-size: 13px; color: #64748b; text-align: center; font-weight: 500;">
                    Hiệu lực của mã xác thực là <strong>10 phút</strong> kể từ thời điểm gửi.
                </p>
                
                <!-- Security Warning Box -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fff5f5; border-left: 4px solid #f56565; border-radius: 6px; margin-bottom: 30px;">
                    <tr>
                        <td style="padding: 16px 20px;">
                            <strong style="color: #c53030; font-size: 13.5px; display: block; margin-bottom: 6px;">🛡️ CẢNH BÁO BẢO MẬT:</strong>
                            <ul style="margin: 0; padding-left: 20px; color: #9b2c2c; font-size: 12.5px; line-height: 1.6;">
                                <li>Địa chỉ IP thực hiện yêu cầu này: <strong>{client_ip}</strong></li>
                                <li>Tuyệt đối <strong>KHÔNG</strong> chia sẻ mã OTP này với bất kỳ ai để tránh nguy cơ mất tài khoản.</li>
                                <li>Nhân viên hỗ trợ của chúng tôi không bao giờ yêu cầu mã này của bạn.</li>
                            </ul>
                        </td>
                    </tr>
                </table>
                
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #475569;">
                    Trân trọng,<br>
                    <strong style="color: #1e293b; font-size: 15px;">Nhóm 7.</strong>
                </p>
            </td>
        </tr>
        
        <!-- Footer -->
        <tr>
            <td style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                    Đây là email gửi tự động từ máy chủ Smart Tourism. Vui lòng không trả lời trực tiếp email này.<br>
                    &copy; 2026 Smart Tourism. Bảo lưu mọi quyền.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return _send_email_smtp_base(to_email, subject, plain_body, html_body, otp_code)


def send_reset_password_email(to_email: str, otp_code: str, client_ip: str = "Không xác định") -> bool:
    """
    Sends a 6-digit OTP verification email for resetting password.
    """
    subject = "[Smart Tourism] Mã OTP Khôi Phục Mật Khẩu"
    
    plain_body = f"""
    Chào bạn,
    
    Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản Smart Tourism của bạn.
    Mã xác thực OTP của bạn là: {otp_code}
    
    Mã này có hiệu lực trong vòng 5 phút.
    
    [CẢNH BÁO BẢO MẬT]
    - Yêu cầu này được thực hiện từ địa chỉ IP: {client_ip}
    - Tuyệt đối KHÔNG chia sẻ mã OTP này với bất kỳ ai. Nếu bạn chia sẻ mã này, kẻ xấu có thể đổi mật khẩu và chiếm đoạt tài khoản của bạn.
    - Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.
    
    Trân trọng,
    Nhóm 7.
    """

    html_body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Mã OTP Khôi Phục Mật Khẩu</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #334155;">
    <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
        <!-- Header -->
        <tr>
            <td style="background: linear-gradient(135deg, #ef4444, #b91c1c); padding: 35px 20px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">SMART TOURISM</h1>
                <p style="color: #fecaca; margin: 5px 0 0 0; font-size: 13px; font-weight: 500; letter-spacing: 0.5px;">Yêu cầu khôi phục mật khẩu tài khoản</p>
            </td>
        </tr>
        
        <!-- Body -->
        <tr>
            <td style="padding: 40px 35px;">
                <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">Chào bạn,</h2>
                <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                    Chúng tôi đã nhận được yêu cầu khôi phục mật khẩu từ bạn. Vui lòng nhập mã OTP dưới đây tại giao diện để thiết lập mật khẩu mới:
                </p>
                
                <!-- OTP Display Box -->
                <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 30px auto; background-color: #fef2f2; border: 1.5px dashed #ef4444; border-radius: 10px;">
                    <tr>
                        <td style="padding: 16px 45px; text-align: center;">
                            <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #dc2626; font-weight: 700; margin-bottom: 6px;">Mã khôi phục OTP</span>
                            <span style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #b91c1c; font-family: 'Courier New', Courier, monospace; display: inline-block; padding-left: 8px;">{otp_code}</span>
                        </td>
                    </tr>
                </table>
                
                <p style="margin: 0 0 28px 0; font-size: 13px; color: #64748b; text-align: center; font-weight: 500;">
                    Mã khôi phục mật khẩu này chỉ có hiệu lực trong vòng <strong>5 phút</strong>.
                </p>
                
                <!-- Security Warning Box -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fff5f5; border-left: 4px solid #f56565; border-radius: 6px; margin-bottom: 30px;">
                    <tr>
                        <td style="padding: 16px 20px;">
                            <strong style="color: #c53030; font-size: 13.5px; display: block; margin-bottom: 6px;">⚠️ CẢNH BÁO AN TOÀN:</strong>
                            <ul style="margin: 0; padding-left: 20px; color: #9b2c2c; font-size: 12.5px; line-height: 1.6;">
                                <li>Địa chỉ IP thực hiện yêu cầu này: <strong>{client_ip}</strong></li>
                                <li>Tuyệt đối <strong>KHÔNG</strong> chia sẻ mã OTP này với bất kỳ ai để tránh bị kẻ xấu chiếm đoạt tài khoản.</li>
                                <li>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email và đổi mật khẩu hiện tại để tăng bảo mật.</li>
                            </ul>
                        </td>
                    </tr>
                </table>
                
                <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #475569;">
                    Trân trọng,<br>
                    <strong style="color: #1e293b; font-size: 15px;">Nhóm 7.</strong>
                </p>
            </td>
        </tr>
        
        <!-- Footer -->
        <tr>
            <td style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                    Đây là email gửi tự động từ máy chủ Smart Tourism. Vui lòng không trả lời trực tiếp email này.<br>
                    &copy; 2026 Smart Tourism. Bảo lưu mọi quyền.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
"""
    return _send_email_smtp_base(to_email, subject, plain_body, html_body, otp_code)

