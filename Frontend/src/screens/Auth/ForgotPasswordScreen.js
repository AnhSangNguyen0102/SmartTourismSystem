import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../config/api';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import './LoginScreen.css';

const ForgotPasswordScreen = ({ onBack, onSwitchToLogin }) => {
    const [step, setStep] = useState(1); // 1: Nhập email, 2: Nhập OTP, 3: Nhập mật khẩu mới
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [resendCountdown, setResendCountdown] = useState(0);

    useEffect(() => {
        // Nếu URL chứa type=recovery (từ bản cũ, ta chuyển về trang mặc định)
        if (window.location.hash.includes('type=recovery')) {
            window.location.hash = '';
            setStep(1);
        }
    }, []);

    useEffect(() => {
        let timer;
        if (step === 2 && resendCountdown > 0) {
            timer = setInterval(() => {
                setResendCountdown(prev => prev - 1);
            }, 1000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [step, resendCountdown]);

    const translateError = (msg) => {
        if (!msg) return '';
        const m = msg.toLowerCase();
        if (m.includes('invalid login credentials')) return 'Email hoặc mật khẩu không chính xác.';
        if (m.includes('password should be at least 6 characters') || m.includes('tối thiểu 8 ký tự') || m.includes('ít nhất 8 ký tự')) return 'Mật khẩu phải có ít nhất 8 ký tự.';
        if (m.includes('too many requests') || m.includes('rate limit')) return 'Yêu cầu quá nhanh, vui lòng thử lại sau ít phút.';
        if (m.includes('access_denied') || m.includes('otp_expired') || m.includes('expired') || m.includes('hết hạn')) return 'Mã OTP đã hết hạn hoặc không còn hiệu lực. Vui lòng gửi lại yêu cầu mới.';
        if (m.includes('network error') || m.includes('failed to fetch') || m.includes('err_connection_refused')) return 'Không thể kết nối đến máy chủ Backend (Port 8000). Vui lòng kiểm tra lại.';
        if (m.includes('user not found') || m.includes('chưa có trong hệ thống')) return 'Email này chưa có trong hệ thống. Vui lòng đăng ký tài khoản mới.';
        if (m.includes('invalid email')) return 'Địa chỉ email không hợp lệ.';
        if (m.includes('chưa gửi yêu cầu') || m.includes('không tìm thấy')) return 'Phiên khôi phục không hợp lệ. Vui lòng gửi lại OTP.';
        if (m.includes('mã otp không chính xác')) return 'Mã OTP không chính xác. Vui lòng nhập lại.';
        return msg;
    };

    const handleSendResetOtp = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        const emailTrimmed = email.trim();
        if (!emailTrimmed) {
            setError('Vui lòng nhập địa chỉ email.');
            setLoading(false);
            return;
        }

        try {
            // 1. Kiểm tra email có tồn tại trên Backend (Port 8000) không
            try {
                const checkRes = await axios.get(`${API_BASE}/api/auth/check-email?email=${emailTrimmed}`);
                if (!checkRes.data.exists) {
                    throw new Error('Email này chưa có trong hệ thống. Vui lòng đăng ký tài khoản mới.');
                }
            } catch (err) {
                if (err.response?.data?.detail) {
                    throw new Error(err.response.data.detail);
                } else if (err.message.includes('chưa có trong hệ thống')) {
                    throw err;
                } else {
                    throw new Error("Lỗi kết nối Backend (Port 8000). Vui lòng thử lại.");
                }
            }

            // 2. Gửi yêu cầu quên mật khẩu lên Backend để nhận OTP
            await axios.post(`${API_BASE}/api/auth/forgot-password`, { email: emailTrimmed });
            
            setSuccess('Đã gửi mã OTP khôi phục! Vui lòng kiểm tra hộp thư của bạn.');
            setResendCountdown(60); // Đặt lại bộ đếm ngược 60 giây
            if (step !== 2) {
                setTimeout(() => {
                    setError('');
                    setSuccess('');
                    setStep(2); // Chuyển sang nhập OTP
                }, 1000);
            }
        } catch (err) {
            setError(translateError(err.response?.data?.detail || err.message || 'Lỗi gửi yêu cầu khôi phục.'));
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        const otpTrimmed = otp.trim();
        if (!otpTrimmed || otpTrimmed.length !== 6) {
            setError('Vui lòng nhập mã OTP 6 chữ số.');
            setLoading(false);
            return;
        }

        try {
            await axios.post(`${API_BASE}/api/auth/verify-reset-otp`, {
                email: email.trim(),
                otp: otpTrimmed
            });
            
            setSuccess('Xác thực mã OTP thành công! Vui lòng thiết lập mật khẩu mới.');
            setTimeout(() => {
                setError('');
                setSuccess('');
                setStep(3); // Chuyển sang nhập mật khẩu mới
            }, 1000);
        } catch (err) {
            setError(translateError(err.response?.data?.detail || err.message || 'Mã OTP không chính xác hoặc đã hết hạn.'));
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        const newPass = newPassword.trim();
        const confPass = confirmPassword.trim();
        const otpTrimmed = otp.trim();

        if (!otpTrimmed || otpTrimmed.length !== 6) {
            setError('Mã OTP không còn tồn tại trong phiên. Vui lòng quay lại từ đầu.');
            setLoading(false);
            return;
        }
        if (!newPass) {
            setError('Vui lòng nhập mật khẩu mới.');
            setLoading(false);
            return;
        }
        if (newPass.length < 8) {
            setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
            setLoading(false);
            return;
        }
        if (newPass !== confPass) {
            setError('Mật khẩu xác nhận không khớp.');
            setLoading(false);
            return;
        }

        try {
            await axios.post(`${API_BASE}/api/auth/reset-password`, {
                email: email.trim(),
                otp: otpTrimmed,
                new_password: newPass
            });

            setSuccess('Đổi mật khẩu thành công! Đang quay lại trang đăng nhập...');
            setTimeout(() => {
                window.location.hash = ''; // Clear recovery hash fragment
                onSwitchToLogin();
            }, 3000);
        } catch (err) {
            setError(translateError(err.response?.data?.detail || err.message || 'Lỗi đặt lại mật khẩu.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div 
                className="auth-back" 
                onClick={() => {
                    window.location.hash = '';
                    onBack();
                }} 
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
                <ArrowLeft size={16} /> Quay lại
            </div>

            <h2 className="login-title">Khôi phục mật khẩu</h2>

            {step === 1 && (
                <form onSubmit={handleSendResetOtp} className="auth-form-stack">
                    <p className="auth-helper-text" style={{ fontSize: '11px', color: '#7f8c8d', marginBottom: '14px', textAlign: 'center' }}>
                        Nhập email bạn đã đăng ký để nhận mã OTP khôi phục mật khẩu.
                    </p>
                    <input 
                        type="email" 
                        placeholder="Nhập Email của bạn" 
                        required
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)}
                        className="login-input"
                        disabled={loading}
                    />
                    <button type="submit" className="login-button forgot-submit-btn" disabled={loading}>
                        {loading ? 'Đang gửi mã OTP...' : 'Gửi mã OTP'}
                    </button>
                    {error && <p className="error-msg" style={{ marginTop: '12px', color: '#e74c3c', fontSize: '12px', textAlign: 'center' }}>{error}</p>}
                    {success && <p className="auth-success-msg" style={{ color: '#2ecc71', fontSize: '12px', fontWeight: 'bold', marginTop: '12px', textAlign: 'center' }}>{success}</p>}
                </form>
            )}

            {step === 2 && (
                <form onSubmit={handleVerifyOtp} className="auth-form-stack">
                    <p className="auth-helper-text" style={{ fontSize: '11px', color: '#7f8c8d', marginBottom: '14px', textAlign: 'center' }}>
                        Mã OTP đã được gửi đến <strong>{email}</strong>. Vui lòng nhập mã bên dưới để tiếp tục.
                    </p>
                    <p style={{ fontSize: '12px', color: '#e74c3c', marginTop: '-8px', marginBottom: '14px', textAlign: 'center', fontStyle: 'italic' }}>
                        * Lưu ý: Nếu không nhận được mã, vui lòng kiểm tra kỹ cả trong hộp thư rác (Spam).
                    </p>
                    <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        placeholder="Nhập 6 chữ số OTP" 
                        required
                        value={otp} 
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="login-input"
                        disabled={loading}
                        style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '2px', fontWeight: 'bold' }}
                    />
                    
                    <button type="submit" className="login-button verify-otp-submit-btn" disabled={loading || otp.length !== 6}>
                        {loading ? 'Đang xác thực...' : 'Xác nhận mã OTP'}
                    </button>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', fontSize: '14px' }}>
                        {resendCountdown > 0 ? (
                            <span 
                                style={{ color: '#95a5a6', cursor: 'not-allowed', opacity: 0.8 }}
                            >
                                Gửi lại mã OTP ({resendCountdown}s)
                            </span>
                        ) : (
                            <span 
                                className="auth-link"
                                onClick={handleSendResetOtp}
                                style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
                            >
                                Gửi lại mã OTP
                            </span>
                        )}
                        <span 
                            className="auth-link"
                            onClick={() => {
                                setError('');
                                setSuccess('');
                                setStep(1);
                            }}
                            style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
                        >
                            Đổi email khác
                        </span>
                    </div>

                    {success && <p className="auth-success-msg" style={{ color: '#2ecc71', fontSize: '12px', fontWeight: 'bold', marginTop: '12px', textAlign: 'center' }}>{success}</p>}
                    {error && <p className="error-msg" style={{ marginTop: '12px', color: '#e74c3c', fontSize: '12px', textAlign: 'center' }}>{error}</p>}
                </form>
            )}

            {step === 3 && (
                <form onSubmit={handleResetPassword} className="auth-form-stack">
                    <p className="auth-helper-text" style={{ fontSize: '11px', color: '#7f8c8d', marginBottom: '14px', textAlign: 'center' }}>
                        Đặt lại mật khẩu mới cho tài khoản của bạn.
                    </p>
                    
                    <div className="password-input-container">
                        <input 
                            type={showNewPassword ? 'text' : 'password'} 
                            placeholder="Mật khẩu mới (tối thiểu 8 ký tự)" 
                            required
                            value={newPassword} 
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="login-input"
                            disabled={loading}
                        />
                        <button 
                            type="button" 
                            className="password-toggle-btn"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            tabIndex="-1"
                            aria-label={showNewPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                        >
                            {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    <div className="password-input-container">
                        <input 
                            type={showConfirmPassword ? 'text' : 'password'} 
                            placeholder="Xác nhận mật khẩu mới" 
                            required
                            value={confirmPassword} 
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="login-input"
                            disabled={loading}
                        />
                        <button 
                            type="button" 
                            className="password-toggle-btn"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            tabIndex="-1"
                            aria-label={showConfirmPassword ? "Ẩn xác nhận mật khẩu" : "Hiển thị xác nhận mật khẩu"}
                        >
                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                    
                    <button type="submit" className="login-button reset-submit-btn" disabled={loading}>
                        {loading ? 'Đang cập nhật...' : 'Xác nhận khôi phục'}
                    </button>
                    
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px', fontSize: '14px' }}>
                        <span 
                            className="auth-link"
                            onClick={() => {
                                setError('');
                                setSuccess('');
                                setStep(1);
                            }}
                            style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
                        >
                            Quay lại từ đầu
                        </span>
                    </div>

                    {success && <p className="auth-success-msg" style={{ color: '#2ecc71', fontSize: '12px', fontWeight: 'bold', marginTop: '12px', textAlign: 'center' }}>{success}</p>}
                    {error && <p className="error-msg" style={{ marginTop: '12px', color: '#e74c3c', fontSize: '12px', textAlign: 'center' }}>{error}</p>}
                </form>
            )}
        </div>
    );
};

export default ForgotPasswordScreen;
