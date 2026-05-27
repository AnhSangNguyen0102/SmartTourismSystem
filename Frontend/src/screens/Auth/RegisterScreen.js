import React, { useState } from 'react';
import { authService } from '../../services/authService';
import { ArrowLeft, User, Building2, CheckCircle, Clock, LogIn, X } from 'lucide-react';
import './LoginScreen.css';

const RegisterScreen = ({ onBack, onSwitchToLogin }) => {
    // 1. Thêm trường 'role' vào formData, mặc định là 'USER' (Cá nhân)
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        role: 'USER',
        businessName: '',
        contactPerson: '',
        contactEmail: '',
        contactPhone: '',
    });
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [registerNotice, setRegisterNotice] = useState(null);
    const isEnterprise = formData.role === 'ENTERPRISE';

    const handleRegister = async (e) => {
        e.preventDefault();
        setMessage('');
        setRegisterNotice(null);
        try {
            const enterpriseProfile = isEnterprise ? {
                business_name: formData.businessName.trim(),
                contact_person: (formData.contactPerson || formData.fullName).trim(),
                contact_email: (formData.contactEmail || formData.email).trim(),
                contact_phone: formData.contactPhone.trim(),
            } : null;

            // 2. Truyền thêm formData.role vào hàm gọi API
            await authService.register(
                formData.fullName,
                formData.email,
                formData.password,
                formData.role,
                enterpriseProfile
            );
            setIsError(false);
            setRegisterNotice(isEnterprise ? {
                type: 'enterprise',
                title: 'Đã gửi yêu cầu phê duyệt',
                body: 'Hồ sơ doanh nghiệp của bạn đã được gửi tới Admin. Vui lòng đợi vài ngày để hệ thống kiểm tra và phê duyệt.',
            } : {
                type: 'user',
                title: 'Đăng ký thành công',
                body: 'Tài khoản cá nhân của bạn đã sẵn sàng. Bạn có thể đăng nhập để bắt đầu hành trình.',
            });
        } catch (error) {
            setIsError(true);
            setMessage("Lỗi: " + error.message);
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

            <h2 className="login-title">Đăng ký tài khoản</h2>

            {/* 3. NÚT CHỌN LOẠI TÀI KHOẢN */}
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
                <input className="login-input" placeholder="Mật khẩu" type="password" required
                    onChange={e => setFormData({...formData, password: e.target.value})} />
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
                <button className="login-button register-submit-btn" type="submit">
                    {isEnterprise ? 'Đăng ký tài khoản doanh nghiệp' : 'Đăng ký'}
                </button>
            </form>
            
            {message && <p className={`auth-register-message ${isError ? 'error' : 'success'}`}>{message}</p>}

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
                                <button type="button" className="auth-success-primary" onClick={onSwitchToLogin}>
                                    <LogIn size={16} /> Chuyển sang đăng nhập
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
