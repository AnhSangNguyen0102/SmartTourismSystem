import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { API_BASE } from '../../config/api';
import axios from 'axios';
import { ArrowLeft, User, Building2, CheckCircle, Clock, X, Eye, EyeOff } from 'lucide-react';
import { showAlert, showConfirm } from '../../platform/dialog';
import './LoginScreen.css';

const RegisterScreen = ({ onBack, onSwitchToLogin, onRegisterSuccess }) => {
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'USER',
        businessName: '',
        contactPerson: '',
        contactEmail: '',
        contactPhone: '',
    });
    const [registerNotice, setRegisterNotice] = useState(null);
    const [isPrivacyAccepted, setIsPrivacyAccepted] = useState(false);
    const [showPolicyModal, setShowPolicyModal] = useState(null); // 'privacy' | 'terms' | null
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const isEnterprise = formData.role === 'ENTERPRISE';

    useEffect(() => {
        let timer;
        if (countdown > 0) {
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [countdown]);

    const translateError = (msg) => {
        if (!msg) return '';
        const m = msg.toLowerCase();
        if (m.includes('invalid login credentials')) return 'Email hoặc mật khẩu không chính xác.';
        if (m.includes('user already registered') || m.includes('already been registered') || m.includes('đã được đăng ký')) return 'Email này đã được đăng ký bởi người khác.';
        if (m.includes('password should be at least 6 characters') || m.includes('at least 8 characters') || m.includes('tối thiểu 8 ký tự')) return 'Mật khẩu phải có ít nhất 8 ký tự.';
        if (m.includes('email not confirmed')) return 'Vui lòng xác thực email của bạn trước khi đăng nhập.';
        if (m.includes('signup disabled')) return 'Tính năng đăng ký hiện đang tạm đóng.';
        if (m.includes('too many requests') || m.includes('rate limit')) return 'Yêu cầu quá nhanh, vui lòng thử lại sau ít phút.';
        if (m.includes('for security purposes, you can only request this once every')) return 'Vui lòng đợi một lát trước khi yêu cầu lại email mới.';
        if (m.includes('network error') || m.includes('failed to fetch') || m.includes('err_connection_refused')) return 'Không thể kết nối đến máy chủ Backend (Port 8000). Vui lòng kiểm tra lại.';
        if (m.includes('user not found')) return 'Không tìm thấy người dùng với email này.';
        if ((m.includes('invalid') && m.includes('email')) || m.includes('không tồn tại hoặc không thể nhận thư')) return 'Địa chỉ email không tồn tại hoặc định dạng không hợp lệ.';
        
        // OTP translations
        if (m.includes('không tìm thấy yêu cầu xác thực') || m.includes('phiên đã hết hạn')) return 'Phiên xác thực đã hết hạn hoặc không tồn tại. Vui lòng đăng ký lại.';
        if (m.includes('mã otp không chính xác')) return 'Mã OTP không chính xác. Vui lòng nhập lại.';
        if (m.includes('mã otp đã hết hạn')) return 'Mã OTP đã hết hạn. Vui lòng nhấn "Gửi lại mã OTP".';
        if (m.includes('đã được xác thực hoạt động')) return 'Tài khoản này đã được kích hoạt thành công từ trước.';
        return msg;
    };

    const handleSocialRegister = async (provider) => {
        try {
            const { error: oAuthError } = await supabase.auth.signInWithOAuth({
                provider,
                options: { redirectTo: window.location.origin }
            });
            if (oAuthError) throw oAuthError;
        } catch (err) {
            const errMsg = translateError(err.message || 'Lỗi đăng ký Google/Facebook');
            void showAlert(errMsg, { title: 'Lỗi đăng ký' });
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setRegisterNotice(null);

        const emailTrimmed = formData.email.trim();
        const fullNameTrimmed = formData.fullName.trim();
        const passwordTrimmed = formData.password.trim();

        // 1. Validations
        if (!fullNameTrimmed) {
            void showAlert("Vui lòng nhập họ và tên.", { title: 'Thông báo' });
            return;
        }
        if (!emailTrimmed) {
            void showAlert("Vui lòng nhập email.", { title: 'Thông báo' });
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailTrimmed)) {
            void showAlert("Định dạng email không hợp lệ.", { title: 'Thông báo' });
            return;
        }
        if (!passwordTrimmed) {
            void showAlert("Vui lòng nhập mật khẩu.", { title: 'Thông báo' });
            return;
        }
        if (passwordTrimmed.length < 8) {
            void showAlert("Mật khẩu phải có ít nhất 8 ký tự.", { title: 'Thông báo' });
            return;
        }
        const confirmPasswordTrimmed = (formData.confirmPassword || '').trim();
        if (!confirmPasswordTrimmed) {
            void showAlert("Vui lòng xác nhận mật khẩu.", { title: 'Thông báo' });
            return;
        }
        if (passwordTrimmed !== confirmPasswordTrimmed) {
            void showAlert("Mật khẩu xác nhận không khớp.", { title: 'Thông báo' });
            return;
        }

        try {
            // 2. Kiểm tra email đã tồn tại trong Backend chưa
            try {
                const checkRes = await axios.get(`${API_BASE}/api/auth/check-email?email=${emailTrimmed}`);
                if (checkRes.data.exists) {
                    if (checkRes.data.is_pending) {
                        const confirmVerify = await showConfirm(
                            "Tài khoản của bạn đã được đăng ký nhưng chưa xác thực email. Bạn có muốn nhận mã OTP mới để kích hoạt ngay bây giờ không?",
                            { title: 'Tài khoản chưa xác thực' }
                        );
                        if (confirmVerify) {
                            // Gửi lại OTP và mở màn hình xác thực
                            await axios.post(`${API_BASE}/api/auth/resend-register-otp`, { email: emailTrimmed });
                            setFormData({
                                ...formData,
                                email: emailTrimmed
                            });
                            setIsVerifyingOtp(true);
                            setCountdown(60);
                            return;
                        }
                        return;
                    }
                    throw new Error('Email này đã được đăng ký bởi người khác.');
                }
            } catch (err) {
                if (err.response?.data?.detail) {
                    throw new Error(err.response.data.detail);
                } else if (err.message.includes('đăng ký bởi người khác') || err.message.includes('xác thực email')) {
                    throw err;
                } else {
                    throw new Error("Không thể kết nối đến máy chủ Backend (Port 8000). Vui lòng kiểm tra lại.");
                }
            }

            // 3. Tiến hành đăng ký bằng Supabase Auth
            const { data, error: signupError } = await supabase.auth.signUp({
                email: emailTrimmed,
                password: passwordTrimmed,
                options: {
                    emailRedirectTo: window.location.origin,
                    data: {
                        full_name: fullNameTrimmed,
                        role: formData.role
                    }
                }
            });

            if (signupError) throw signupError;
            if (!data.user) throw new Error("Đăng ký Supabase thất bại");

            // 4. Đồng bộ dữ liệu sang Backend thông qua API /register
            const enterpriseProfile = isEnterprise ? {
                business_name: formData.businessName.trim(),
                contact_person: (formData.contactPerson || fullNameTrimmed).trim(),
                contact_email: (formData.contactEmail || emailTrimmed).trim(),
                contact_phone: formData.contactPhone.trim(),
            } : null;

            const backendPayload = {
                email: emailTrimmed,
                password: passwordTrimmed,
                full_name: fullNameTrimmed,
                role: formData.role,
                user_id: data.user.id,
                ...(enterpriseProfile || {})
            };

            const response = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(backendPayload)
            });

            const responseData = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(responseData.detail || "Không thể đồng bộ thông tin đăng ký với máy chủ Backend.");
            }

            if (responseData.status === 'verification_pending') {
                setIsVerifyingOtp(true);
                setCountdown(60);
            } else {
                setRegisterNotice(isEnterprise ? {
                    type: 'enterprise',
                    title: 'Đã gửi yêu cầu phê duyệt',
                    body: 'Hồ sơ doanh nghiệp của bạn đã được gửi tới Admin. Vui lòng đợi vài ngày để hệ thống kiểm tra và phê duyệt.',
                } : {
                    type: 'user',
                    title: 'Đăng ký thành công',
                    body: 'Tài khoản cá nhân của bạn đã sẵn sàng. Vui lòng kiểm tra email để kích hoạt tài khoản.',
                });
            }
        } catch (error) {
            const errMsg = translateError(error.message || 'Đăng ký thất bại');
            void showAlert(errMsg, { title: 'Lỗi đăng ký' });
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        const otpTrimmed = otpCode.trim();
        if (otpTrimmed.length !== 6) {
            void showAlert("Mã OTP phải có đúng 6 chữ số.", { title: 'Thông báo' });
            return;
        }

        setOtpLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/api/auth/verify-registration`, {
                email: formData.email.trim(),
                otp: otpTrimmed
            });

            if (res.data.status === 'success') {
                setRegisterNotice(isEnterprise ? {
                    type: 'enterprise',
                    title: 'Đã xác thực thành công',
                    body: 'Email doanh nghiệp đã được xác thực thành công. Hồ sơ của bạn hiện đang chờ Admin kiểm tra và phê duyệt trước khi có thể đăng nhập.',
                } : {
                    type: 'user',
                    title: 'Đăng ký thành công',
                    body: 'Tài khoản cá nhân của bạn đã được kích hoạt thành công. Bạn hiện có thể đăng nhập ngay bây giờ.',
                });
            } else {
                throw new Error(res.data.message || "Xác thực thất bại");
            }
        } catch (err) {
            const errMsg = translateError(err.response?.data?.detail || err.message || 'Xác thực OTP thất bại');
            void showAlert(errMsg, { title: 'Lỗi xác thực' });
        } finally {
            setOtpLoading(false);
        }
    };

    const handleResendOtp = async () => {
        try {
            const res = await axios.post(`${API_BASE}/api/auth/resend-register-otp`, {
                email: formData.email.trim()
            });
            void showAlert(res.data.message || "Đã gửi lại mã OTP vào email của bạn.", { title: 'Thông báo' });
            setCountdown(60);
        } catch (err) {
            const errMsg = translateError(err.response?.data?.detail || err.message || 'Gửi lại OTP thất bại');
            void showAlert(errMsg, { title: 'Lỗi' });
        }
    };

    if (isVerifyingOtp) {
        return (
            <div className="login-container">
                <div 
                    className="auth-back"
                    onClick={() => setIsVerifyingOtp(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <ArrowLeft size={16} /> Quay lại
                </div>

                <h2 className="login-title">Xác thực OTP</h2>
                <p style={{ fontSize: '14px', color: '#555', marginBottom: '20px', lineHeight: '1.6', textAlign: 'center' }}>
                    Một mã OTP gồm 6 chữ số đã được gửi đến email <strong>{formData.email}</strong>. Vui lòng nhập mã để kích hoạt tài khoản của bạn.
                </p>
                <p style={{ fontSize: '12px', color: '#e74c3c', marginTop: '-15px', marginBottom: '20px', textAlign: 'center', fontStyle: 'italic' }}>
                    * Lưu ý: Nếu không nhận được mã, vui lòng kiểm tra kỹ cả trong hộp thư rác (Spam).
                </p>

                <form onSubmit={handleVerifyOtp}>
                    <input 
                        className="login-input" 
                        placeholder="Nhập 6 chữ số" 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '4px', fontWeight: 'bold' }}
                    />
                    
                    <button 
                        className="login-button" 
                        type="submit" 
                        disabled={otpLoading || otpCode.length !== 6}
                        style={{ opacity: otpCode.length === 6 ? 1 : 0.5, cursor: otpCode.length === 6 ? 'pointer' : 'not-allowed', marginTop: '10px' }}
                    >
                        {otpLoading ? 'Đang xác thực...' : 'Xác nhận kích hoạt'}
                    </button>
                </form>

                <div className="auth-center-link-row" style={{ marginTop: '20px', fontSize: '14px' }}>
                    {countdown > 0 ? (
                        <span style={{ color: '#7f8c8d' }}>Gửi lại mã sau {countdown} giây</span>
                    ) : (
                        <span 
                            className="auth-link"
                            onClick={handleResendOtp}
                            style={{ fontWeight: 'bold' }}
                        >
                            Gửi lại mã OTP
                        </span>
                    )}
                </div>
                
                {registerNotice && (
                    <div className="auth-success-overlay" role="dialog" aria-modal="true" aria-labelledby="register-success-title">
                        <div className={`auth-success-dialog ${registerNotice.type}`}>
                            <button
                                type="button"
                                className="auth-success-close"
                                onClick={() => setRegisterNotice(null)}
                                aria-label="Đóng thông báo"
                            >
                                <X size={18} />
                            </button>
                            <div className="auth-success-icon">
                                {registerNotice.type === 'enterprise' ? <Clock size={34} /> : <CheckCircle size={34} />}
                            </div>
                            <h3 id="register-success-title">{registerNotice.title}</h3>
                            <p>{registerNotice.body}</p>
                            <div className="auth-success-actions">
                                {registerNotice.type === 'user' ? (
                                    <button type="button" className="auth-success-primary" onClick={onRegisterSuccess}>
                                        <CheckCircle size={16} /> Xem hướng dẫn sử dụng
                                    </button>
                                ) : (
                                    <button type="button" className="auth-success-primary enterprise" onClick={() => setRegisterNotice(null)}>
                                        Đã hiểu
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

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

            <h2 className="login-title">Đăng ký tài khoản</h2>

            {/* NÚT CHỌN LOẠI TÀI KHOẢN */}
            <div className="role-toggle-row">
                <button 
                    type="button"
                    onClick={() => setFormData({...formData, role: 'USER'})}
                    className={`role-toggle-btn ${formData.role === 'USER' ? 'user-active' : 'inactive'}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                    <User size={16} /> Cá nhân
                </button>
                <button 
                    type="button"
                    onClick={() => setFormData({...formData, role: 'ENTERPRISE'})}
                    className={`role-toggle-btn ${formData.role === 'ENTERPRISE' ? 'enterprise-active' : 'inactive'}`}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                    <Building2 size={16} /> Doanh nghiệp
                </button>
            </div>

            <form onSubmit={handleRegister}>
                <input className="login-input" placeholder={isEnterprise ? "Người đại diện" : "Họ và Tên"} type="text" required
                    onChange={e => setFormData({...formData, fullName: e.target.value})} />
                <input className="login-input" placeholder="Email" type="email" required
                    onChange={e => setFormData({...formData, email: e.target.value})} />
                
                <div className="password-input-container">
                    <input 
                        className="login-input" 
                        placeholder="Mật khẩu" 
                        type={showPassword ? 'text' : 'password'} 
                        required
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})} 
                    />
                    <button 
                        type="button" 
                        className="password-toggle-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex="-1"
                        aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>

                <div className="password-input-container">
                    <input 
                        className="login-input" 
                        placeholder="Xác nhận mật khẩu" 
                        type={showConfirmPassword ? 'text' : 'password'} 
                        required
                        value={formData.confirmPassword}
                        onChange={e => setFormData({...formData, confirmPassword: e.target.value})} 
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
                {isEnterprise && (
                    <div className="enterprise-profile-fields">
                        <h3>Hồ sơ doanh nghiệp</h3>
                        <input
                            className="login-input"
                            placeholder="Tên doanh nghiệp"
                            type="text"
                            required
                            value={formData.businessName}
                            onChange={e => setFormData({...formData, businessName: e.target.value})}
                        />
                        <input
                            className="login-input"
                            placeholder="Người đại diện liên hệ"
                            type="text"
                            value={formData.contactPerson}
                            onChange={e => setFormData({...formData, contactPerson: e.target.value})}
                        />
                        <input
                            className="login-input"
                            placeholder="Email liên hệ"
                            type="email"
                            value={formData.contactEmail}
                            onChange={e => setFormData({...formData, contactEmail: e.target.value})}
                        />
                        <input
                            className="login-input"
                            placeholder="Số điện thoại 10 chữ số"
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]{10}"
                            required
                            value={formData.contactPhone}
                            onChange={e => setFormData({...formData, contactPhone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                        />
                    </div>
                )}
                <div className="privacy-checkbox-container" style={{ margin: '15px 0', display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: '#555', textAlign: 'left' }}>
                    <input 
                        type="checkbox" 
                        id="privacyPolicy"
                        checked={isPrivacyAccepted}
                        onChange={(e) => setIsPrivacyAccepted(e.target.checked)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px', marginTop: '3px', flexShrink: 0 }}
                    />
                    <label htmlFor="privacyPolicy" style={{ cursor: 'pointer', lineHeight: '1.5' }}>
                        <div style={{ marginBottom: '4px' }}>
                            Tôi đồng ý với <button type="button" onClick={() => setShowPolicyModal('privacy')} style={{ background: 'none', border: 'none', padding: 0, color: '#4facfe', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Chính sách quyền riêng tư</button>
                        </div>
                        <div>
                            và <button type="button" onClick={() => setShowPolicyModal('terms')} style={{ background: 'none', border: 'none', padding: 0, color: '#4facfe', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Điều khoản sử dụng</button>
                        </div>
                    </label>
                </div>
                
                <button className="login-button register-submit-btn" type="submit" disabled={!isPrivacyAccepted} style={{ opacity: isPrivacyAccepted ? 1 : 0.5, cursor: isPrivacyAccepted ? 'pointer' : 'not-allowed' }}>
                    {isEnterprise ? 'Đăng ký tài khoản doanh nghiệp' : 'Đăng ký'}
                </button>
                
                {!isEnterprise && (
                    <div className="auth-google-row" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                        <button
                            type="button"
                            onClick={() => handleSocialRegister('google')}
                            className="login-button"
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
                )}
            </form>

            {registerNotice && (
                <div className="auth-success-overlay" role="dialog" aria-modal="true" aria-labelledby="register-success-title">
                    <div className={`auth-success-dialog ${registerNotice.type}`}>
                        <button
                            type="button"
                            className="auth-success-close"
                            onClick={() => setRegisterNotice(null)}
                            aria-label="Đóng thông báo"
                        >
                            <X size={18} />
                        </button>
                        <div className="auth-success-icon">
                            {registerNotice.type === 'enterprise' ? <Clock size={34} /> : <CheckCircle size={34} />}
                        </div>
                        <h3 id="register-success-title">{registerNotice.title}</h3>
                        <p>{registerNotice.body}</p>
                        <div className="auth-success-actions">
                            {registerNotice.type === 'user' ? (
                                <button type="button" className="auth-success-primary" onClick={onRegisterSuccess}>
                                    <CheckCircle size={16} /> Xem hướng dẫn sử dụng
                                </button>
                            ) : (
                                <button type="button" className="auth-success-primary enterprise" onClick={() => setRegisterNotice(null)}>
                                    Đã hiểu
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showPolicyModal && (
                <div className="auth-success-overlay" style={{ zIndex: 9999 }} role="dialog">
                    <div className="auth-success-dialog" style={{ textAlign: 'left', maxWidth: '500px', width: '90%', padding: '25px' }}>
                        <button
                            type="button"
                            className="auth-success-close"
                            onClick={() => setShowPolicyModal(null)}
                        >
                            <X size={18} />
                        </button>
                        <h3 style={{ marginTop: 0, color: '#1a2980', fontSize: '20px', paddingRight: '20px' }}>
                            {showPolicyModal === 'privacy' ? 'Chính sách quyền riêng tư' : 'Điều khoản sử dụng'}
                        </h3>
                        <div style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '14px', color: '#555', lineHeight: '1.6', marginTop: '15px', paddingRight: '10px' }}>
                            {showPolicyModal === 'privacy' ? (
                                <>
                                    <p><strong>1. Thu thập thông tin:</strong> Chúng tôi thu thập thông tin cá nhân của bạn như tên, email khi bạn đăng ký tài khoản.</p>
                                    <p><strong>2. Sử dụng thông tin:</strong> Thông tin của bạn được sử dụng để tối ưu hóa trải nghiệm du lịch, cá nhân hóa lịch trình và gửi thông báo quan trọng.</p>
                                    <p><strong>3. Bảo mật:</strong> Chúng tôi cam kết bảo mật thông tin của bạn và không chia sẻ cho bên thứ 3 khi chưa có sự đồng ý, ngoại trừ các trường hợp bắt buộc theo pháp luật.</p>
                                    <p><strong>4. Quyền lợi của bạn:</strong> Bạn có quyền yêu cầu xóa tài khoản và mọi dữ liệu liên quan bất cứ lúc nào thông qua phần hỗ trợ trong ứng dụng.</p>
                                </>
                            ) : (
                                <>
                                    <p><strong>1. Chấp thuận điều khoản:</strong> Bằng việc sử dụng Smart Tourism, bạn đồng ý với các điều khoản dưới đây.</p>
                                    <p><strong>2. Hành vi cấm:</strong> Nghiêm cấm mọi hành vi spam, phá hoại hệ thống, đăng tải nội dung không phù hợp hoặc vi phạm pháp luật.</p>
                                    <p><strong>3. Dữ liệu địa điểm:</strong> Thông tin về các địa điểm du lịch trên ứng dụng mang tính chất tham khảo. Chúng tôi không chịu trách nhiệm nếu có sai lệch nhỏ về giá vé, giờ mở cửa thực tế tại thời điểm bạn đến tham quan.</p>
                                    <p><strong>4. Tích điểm và Phần thưởng:</strong> Hệ thống có quyền thu hồi điểm thưởng hoặc khóa tài khoản nếu phát hiện hành vi gian lận (ví dụ: sử dụng phần mềm giả mạo vị trí GPS) để hoàn thành nhiệm vụ và nhận điểm.</p>
                                </>
                            )}
                        </div>
                        <div style={{ marginTop: '20px', textAlign: 'right' }}>
                            <button type="button" className="auth-success-primary" onClick={() => setShowPolicyModal(null)} style={{ padding: '10px 24px', width: 'auto', display: 'inline-block' }}>
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chuyển sang đăng nhập */}
            <div className="auth-center-link-row">
                <span 
                    className="auth-link"
                    onClick={onSwitchToLogin}
                >
                    Đã có tài khoản? Đăng nhập ngay
                </span>
            </div>
        </div>
    );
};

export default RegisterScreen;
