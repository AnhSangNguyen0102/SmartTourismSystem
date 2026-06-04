import React, { useState, useEffect } from 'react';
import { authService } from '../../services/authService';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, LogIn, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import './LoginScreen.css'; 

// Thêm các hàm điều hướng vào tham số
const LoginScreen = ({ onBack, onSwitchToRegister, onLoginSuccess, onForgotPassword }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);

    useEffect(() => {
        let timer;
        if (isVerifyingOtp && resendCountdown > 0) {
            timer = setInterval(() => {
                setResendCountdown(prev => prev - 1);
            }, 1000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [isVerifyingOtp, resendCountdown]);

    const handleLogin = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setError('');
        setLoading(true);
        try {
            // Hứng toàn bộ cục data (chứa access_token, full_name, role...) từ API
            const userData = await authService.login(email, password); 
            
            // Gửi cục data đó lên cho App.js
            onLoginSuccess(userData); 
        } catch (err) {
            const errMsg = err.message || '';
            if (errMsg.includes('chưa được kích hoạt') || errMsg.includes('kích hoạt bằng mã OTP')) {
                setIsVerifyingOtp(true);
                setResendCountdown(60); // Khởi chạy bộ đếm ngược 60 giây gửi lại
                
                // Tự động kích hoạt gửi mã OTP mới trong nền để người dùng có mã ngay lập tức
                try {
                    await axios.post(`${API_BASE}/api/auth/resend-register-otp`, {
                        email: email.trim()
                    });
                } catch (resendErr) {
                    console.log("Auto resend OTP status:", resendErr.response?.data?.detail || resendErr.message);
                }
            } else {
                setError(errMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const otpTrimmed = otp.trim();
        if (!otpTrimmed || otpTrimmed.length !== 6) {
            setError('Vui lòng nhập mã OTP 6 chữ số.');
            setLoading(false);
            return;
        }

        try {
            // 1. Gọi xác thực OTP kích hoạt tài khoản
            await axios.post(`${API_BASE}/api/auth/verify-registration`, {
                email: email.trim(),
                otp: otpTrimmed
            });

            // 2. Tự động đăng nhập bằng tài khoản vừa kích hoạt
            const userData = await authService.login(email, password);
            onLoginSuccess(userData);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Kích hoạt tài khoản thất bại.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOtp = async () => {
        setError('');
        setLoading(true);
        try {
            await axios.post(`${API_BASE}/api/auth/resend-register-otp`, {
                email: email.trim()
            });
            setResendCountdown(60);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Không thể gửi lại mã OTP.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            const { error: oAuthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin }
            });
            if (oAuthError) throw oAuthError;
        } catch (err) {
            setError(err.message || 'Đăng nhập Google thất bại');
        }
    };

    return (
        <div className="login-container">
            {/* Nút Quay lại */}
            <div 
                className="auth-back"
                onClick={onBack}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
                <ArrowLeft size={16} /> Quay lại
            </div>

            {isVerifyingOtp ? (
                <form onSubmit={handleVerifyAndLogin} className="auth-form-stack">
                    <h2 className="login-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        Kích hoạt tài khoản
                    </h2>
                    <p className="auth-helper-text" style={{ fontSize: '11px', color: '#7f8c8d', marginBottom: '14px', textAlign: 'center' }}>
                        Tài khoản <strong>{email}</strong> chưa được xác thực. Vui lòng nhập mã OTP đã gửi đến hòm thư của bạn để đăng nhập.
                    </p>
                    {error && (
                        <div className="login-error-alert animate-shake">
                            <div className="alert-content">
                                <AlertTriangle className="alert-icon" size={16} />
                                <span className="alert-text">{error}</span>
                            </div>
                            <button type="button" className="alert-close-btn" onClick={() => setError('')}>
                                ✕
                            </button>
                        </div>
                    )}

                    <input 
                        className="login-input" 
                        placeholder="Nhập 6 chữ số OTP" 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={loading}
                        style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '2px', fontWeight: 'bold' }}
                    />

                    <button className="login-button" type="submit" disabled={loading || otp.length !== 6}>
                        {loading ? 'Đang kích hoạt...' : 'Kích hoạt & Đăng nhập'}
                    </button>

                    <div className="auth-link-row">
                        {resendCountdown > 0 ? (
                            <span style={{ color: '#95a5a6', cursor: 'not-allowed', opacity: 0.8 }}>
                                Gửi lại mã OTP ({resendCountdown}s)
                            </span>
                        ) : (
                            <span 
                                className="auth-link"
                                onClick={handleResendOtp}
                            >
                                Gửi lại mã OTP
                            </span>
                        )}

                        <span 
                            className="auth-link"
                            onClick={() => {
                                setIsVerifyingOtp(false);
                                setError('');
                                setOtp('');
                            }}
                        >
                            Quay lại đăng nhập
                        </span>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleLogin}>
                    <h2 className="login-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <LogIn size={24} /> Đăng nhập
                    </h2>
                    {error && (
                        <div className="login-error-alert animate-shake">
                            <div className="alert-content">
                                <AlertTriangle className="alert-icon" size={16} />
                                <span className="alert-text">{error}</span>
                            </div>
                            <button type="button" className="alert-close-btn" onClick={() => setError('')}>
                                ✕
                            </button>
                        </div>
                    )}

                    <input 
                        className="login-input" 
                        placeholder="Email" type="email" required
                        value={email}
                        onChange={e => { setEmail(e.target.value); if (error) setError(''); }} 
                        disabled={loading}
                    />
                    
                    <div className="password-input-container">
                        <input 
                            className="login-input" 
                            placeholder="Mật khẩu" 
                            type={showPassword ? 'text' : 'password'} 
                            required
                            value={password}
                            onChange={e => { setPassword(e.target.value); if (error) setError(''); }} 
                            disabled={loading}
                        />
                        <button 
                            type="button" 
                            className="password-toggle-btn"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex="-1"
                            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                            disabled={loading}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    <button className="login-button" type="submit" disabled={loading}>
                        {loading ? 'Đang kết nối...' : 'Khởi hành'}
                    </button>
                    
                    <div className="auth-google-row" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                        <button
                            type="button"
                            onClick={handleGoogleLogin}
                            className="login-button"
                            disabled={loading}
                            style={{ background: '#ffffff', color: '#2c3e50', border: '3px solid #2c3e50', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ width: '18px', height: '18px' }} fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Đồng hành với Google
                        </button>
                    </div>

                    {/* Các liên kết hỗ trợ */}
                    <div className="auth-link-row">
                        <span className="auth-link" onClick={onForgotPassword}>
                            Quên mật khẩu?
                        </span>

                        <span className="auth-link" onClick={onSwitchToRegister}>
                            Chưa có tài khoản?
                        </span>
                    </div>
                </form>
            )}
        </div>
    );
};

export default LoginScreen;

