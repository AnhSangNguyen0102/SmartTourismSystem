import React, { useState } from 'react';
import { API_BASE } from '../../config/api';
import { ArrowLeft } from 'lucide-react';
import { showAlert } from '../../platform/dialog';
import './LoginScreen.css';

const ForgotPasswordScreen = ({ onBack, onSwitchToLogin }) => {
    const [step, setStep] = useState(1); // Bước 1: Nhập Email | Bước 2: Nhập OTP + Pass mới
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState('');

    const handleSendOTP = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.detail || "Lỗi khi gửi OTP");

            setMessage(data.message);
            setStep(2); // Chuyển sang bước nhập OTP
        } catch (error) {
            await showAlert(error.message);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: email, 
                    otp: otp, 
                    new_password: newPassword 
                })
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.detail || "Lỗi xác nhận OTP");

            await showAlert(data.message);
            onSwitchToLogin(); // Thành công thì đẩy về màn hình đăng nhập
        } catch (error) {
            await showAlert(error.message);
        }
    };

    return (
        <div className="login-container">
            <div className="auth-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowLeft size={16} /> Quay lại
            </div>

            <h2 className="login-title">Khôi phục mật khẩu</h2>

            {step === 1 && (
                <form onSubmit={handleSendOTP} className="auth-form-stack">
                    <p className="auth-helper-text">
                        Nhập email bạn đã đăng ký, chúng tôi sẽ gửi mã xác nhận cho bạn.
                     </p>
                    <input 
                        type="email" placeholder="Nhập Email của bạn" required
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        className="login-input"
                    />
                    <button type="submit" className="login-button forgot-submit-btn">
                        Gửi mã xác nhận
                    </button>
                </form>
            )}

            {step === 2 && (
                <form onSubmit={handleResetPassword} className="auth-form-stack">
                    <p className="auth-success-msg">{message}</p>
                    <input 
                        type="text" placeholder="Nhập mã OTP 6 số" required
                        value={otp} onChange={(e) => setOtp(e.target.value)}
                        className="login-input"
                    />
                    <input 
                        type="password" placeholder="Mật khẩu mới" required
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                        className="login-input"
                    />
                    <button type="submit" className="login-button reset-submit-btn">
                        Cập nhật mật khẩu
                    </button>
                </form>
            )}
        </div>
    );
};

export default ForgotPasswordScreen;

