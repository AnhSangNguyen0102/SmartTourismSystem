import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';
import { ArrowLeft, Edit2, Award, Camera, Save } from 'lucide-react';
import { showAlert } from '../platform/dialog';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../utils/avatar';
import VoucherWallet from '../components/Voucher/VoucherWallet';
import './UserProfile.css';

const UserProfile = ({ user, onBack, onUpdateSuccess }) => {
    // 1. Kiểm tra vai trò người dùng (Bắt lỗi nếu user lồng nhau)
    const userInfo = user?.user || user;
    const isEnterprise = userInfo?.role === 'ENTERPRISE';

    const fileInputRef = useRef(null);

    // Biến kiểm soát chế độ Xem hay Sửa
    const [isEditing, setIsEditing] = useState(false);
    const [showWallet, setShowWallet] = useState(false);

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    useEffect(() => {
        if (userInfo) {
            setProfileData(isEnterprise ? {
                business_name: userInfo.business_name || userInfo.full_name || '',
                contact_person: userInfo.contact_person || '',
                contact_email: userInfo.contact_email || userInfo.email || '',
                contact_phone: userInfo.contact_phone || '',
                status: userInfo.status || 'PENDING'
            } : {
                full_name: userInfo.full_name || '',
                date_of_birth: userInfo.date_of_birth || '',
                gender: userInfo.gender || 'MALE',
                base_location: userInfo.base_location || '',
                travel_style: userInfo.travel_style || '',
                privacy_status: userInfo.privacy_status || 'PUBLIC',
                kyc_status: userInfo.kyc_status || 'UNVERIFIED',
                bio: userInfo.bio || '',
                avatar_url: userInfo.avatar_url || ''
            });
        }
    }, [userInfo, isEnterprise]);

    // 2. Khởi tạo state linh hoạt theo vai trò
    const [profileData, setProfileData] = useState(isEnterprise ? {
        business_name: userInfo?.full_name || '',
        contact_person: userInfo?.contact_person || '',
        contact_email: userInfo?.email || '',
        contact_phone: userInfo?.contact_phone || '',
        status: userInfo?.status || 'PENDING'
    } : {
        full_name: userInfo?.full_name || '',
        date_of_birth: userInfo?.date_of_birth || '',
        gender: userInfo?.gender || 'MALE',
        base_location: userInfo?.base_location || '',
        travel_style: userInfo?.travel_style || '',
        privacy_status: userInfo?.privacy_status || 'PUBLIC',
        kyc_status: userInfo?.kyc_status || 'UNVERIFIED',
        bio: userInfo?.bio || '',
        avatar_url: userInfo?.avatar_url || ''
    });

    const handleChange = (field, value) => {
        setProfileData({ ...profileData, [field]: value });
    };

    const handleAvatarClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleAvatarChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            setProfileData((prev) => ({
                ...prev,
                avatar_url: reader.result,
            }));
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();

        if (newPassword) {
            if (newPassword.length < 8) {
                void showAlert('Mật khẩu mới phải có ít nhất 8 ký tự.');
                return;
            }
            if (newPassword !== confirmNewPassword) {
                void showAlert('Xác nhận mật khẩu mới không khớp.');
                return;
            }
            if (userInfo?.has_password && !oldPassword) {
                void showAlert('Vui lòng nhập mật khẩu hiện tại.');
                return;
            }
        }

        try {
            const token = await storageGet('access_token');
            let passwordUpdated = false;

            // 1. Cập nhật mật khẩu trước nếu người dùng có điền mật khẩu mới
            if (newPassword) {
                const passResponse = await fetch(`${API_BASE}/api/auth/update-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        old_password: oldPassword || undefined,
                        new_password: newPassword
                    })
                });

                if (!passResponse.ok) {
                    const passError = await passResponse.json();
                    void showAlert('Lỗi cập nhật mật khẩu: ' + (passError.detail || 'Không xác định'));
                    return;
                }
                passwordUpdated = true;
            }

            // 2. Cập nhật thông tin profile
            const response = await fetch(`${API_BASE}/api/auth/update-profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData)
            });

            if (response.ok) {
                const resData = await response.json();
                void showAlert('Cập nhật hồ sơ thành công!');
                setIsEditing(false); // Thành công thì khóa form lại
                setOldPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
                if (onUpdateSuccess) {
                    onUpdateSuccess({
                        ...(resData.user || profileData),
                        has_password: userInfo?.has_password || passwordUpdated
                    });
                }
            } else {
                const errorData = await response.json();
                void showAlert('Lỗi: ' + (errorData.detail || 'Không thể cập nhật'));
            }
        } catch (error) {
            void showAlert('Không thể kết nối tới máy chủ.');
        }
    };

    // Hàm tiện ích để render một dòng dữ liệu (Tự động chuyển đổi giữa Text và Input)
    const renderRow = (label, value, field, type = "text", options = null) => (
        <div className="user-profile-field">
            <label>{label}</label>
            {isEditing ? (
                options ? (
                    <select
                        value={value}
                        onChange={(e) => handleChange(field, e.target.value)}
                    >
                        {options.map(opt => <option key={opt.val} value={opt.val}>{opt.label}</option>)}
                    </select>
                ) : type === "textarea" ? (
                    <textarea
                        rows="3" value={value} onChange={(e) => handleChange(field, e.target.value)}
                    />
                ) : (
                    <input
                        type={type} value={value} onChange={(e) => handleChange(field, e.target.value)}
                    />
                )
            ) : (
                <div className="view-value">
                    {value || "(Chưa cập nhật)"}
                </div>
            )}
        </div>
    );

    return (
        <div className="user-profile-screen">
            {/* Header & Back Button */}
            <div className="user-profile-header">
                <button onClick={onBack} className="user-profile-back-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <ArrowLeft size={16} /> Quay lại
                </button>

                {/* NÚT BẬT TẮT CHẾ ĐỘ SỬA */}
                {!isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="user-profile-edit-btn"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                        <Edit2 size={16} /> Sửa hồ sơ
                    </button>
                )}
            </div>

            <h2 className="user-profile-title">
                {isEnterprise ? "Cấu hình Doanh nghiệp" : "Hồ sơ của tôi"}
            </h2>

            {/* HIỂN THỊ ĐIỂM THƯỞNG VÀ VÍ VOUCHER (Nếu không phải doanh nghiệp) */}
            {!isEnterprise && !showWallet && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div className="user-profile-points-card">
                        <div className="user-profile-points-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Award size={20} style={{ color: '#f1c40f' }} />
                        </div>
                        <div>
                        <div className="user-profile-points-label">Điểm thưởng tích lũy</div>
                        <div className="user-profile-points-value">
                                {(userInfo?.points_balance || 0) + (userInfo?.total_points || 0)} <span className="user-profile-points-unit">điểm</span>
                        </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => setShowWallet(true)}
                        className="squishy-btn yellow"
                        style={{ margin: '0 20px', padding: '12px' }}
                        type="button"
                    >
                        Khám phá Ví Voucher
                    </button>
                </div>
            )}
            
            {showWallet && (
                <div style={{ padding: '0 20px' }}>
                    <button 
                        onClick={() => setShowWallet(false)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: '#64748b', fontWeight: 'bold', cursor: 'pointer', marginBottom: '10px' }}
                    >
                        <ArrowLeft size={16} /> Đóng Ví
                    </button>
                    <div style={{ background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <VoucherWallet />
                    </div>
                </div>
            )}

            {/* Avatar Section & Cập nhật Form */}
            {!showWallet && (
                <> 
                    <div className="user-profile-avatar-section">
                        <div className="user-profile-avatar-wrapper">
                            <img
                                src={getSafeAvatarSrc(profileData.avatar_url, profileData.full_name || profileData.business_name)}
                                alt="Avatar"
                                className="user-profile-avatar-img"
                                onError={(event) => {
                                    event.currentTarget.onerror = null;
                                    event.currentTarget.src = createInitialAvatarDataUrl(profileData.full_name || profileData.business_name);
                                }}
                            />
                            {isEditing && (
                                <>
                                    <button 
                                        type="button" 
                                        onClick={handleAvatarClick} 
                                        className="user-profile-avatar-edit-btn" 
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <Camera size={14} />
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleAvatarChange} 
                                        accept="image/*" 
                                        style={{ display: 'none' }} 
                                    />
                                </>
                            )}
                        </div>
                    </div>

                    <form onSubmit={handleSaveProfile} className="user-profile-form">
                        {isEnterprise ? (
                            /* --- TRƯỜNG CHO DOANH NGHIỆP --- */
                            <>
                                {renderRow("Tên Doanh nghiệp *", profileData.business_name, "business_name")}
                                {renderRow("Người đại diện liên hệ *", profileData.contact_person, "contact_person")}
                                {renderRow("Email liên hệ *", profileData.contact_email, "contact_email", "email")}
                                {renderRow("Số điện thoại liên hệ *", profileData.contact_phone, "contact_phone")}
                            </>
                        ) : (
                            /* --- TRƯỜNG CHO CÁ NHÂN --- */
                            <>
                                {renderRow("Họ và tên *", profileData.full_name, "full_name")}
                                <div className="user-profile-field-row">
                                    <div>{renderRow("Ngày sinh", profileData.date_of_birth, "date_of_birth", "date")}</div>
                                    <div>
                                        {renderRow("Giới tính", profileData.gender, "gender", "text", [
                                            { val: 'MALE', label: 'Nam' },
                                            { val: 'FEMALE', label: 'Nữ' }
                                        ])}
                                    </div>
                                </div>
                                {renderRow("Nơi sống", profileData.base_location, "base_location")}
                                <div className="user-profile-field-row">
                                    <div>
                                        {renderRow("Phong cách Du lịch", profileData.travel_style, "travel_style", "text", [
                                            { val: '', label: '-- Chưa chọn --' },
                                            { val: 'BACKPACKER', label: 'Phượt/Bụi' },
                                            { val: 'RESORT', label: 'Nghỉ dưỡng' },
                                            { val: 'CULTURAL', label: 'Văn hóa & Lịch sử' },
                                            { val: 'ECO', label: 'Sinh thái & Thiên nhiên' },
                                            { val: 'ADVENTURE', label: 'Mạo hiểm & Khám phá' },
                                            { val: 'FAMILY', label: 'Dành cho gia đình' },
                                            { val: 'FOODIE', label: 'Đam mê ẩm thực' },
                                            { val: 'LUXURY', label: 'Sang trọng & Cao cấp' },
                                            { val: 'WELLNESS', label: 'Chữa lành & Sức khỏe' }
                                        ])}
                                    </div>
                                    <div>
                                        {renderRow("Quyền riêng tư", profileData.privacy_status, "privacy_status", "text", [
                                            { val: 'PUBLIC', label: 'Công khai' },
                                            { val: 'PRIVATE', label: 'Cá nhân' }
                                        ])}
                                    </div>
                                </div>
                                {renderRow("Giới thiệu bản thân (Bio)", profileData.bio, "bio", "textarea")}
                            </>
                        )}

                        {/* --- PHẦN BẢO MẬT & MẬT KHẨU --- */}
                        <div className="user-profile-section-divider"></div>
                        <h3 className="user-profile-section-title">
                            {userInfo?.has_password ? "Thay đổi mật khẩu" : "Thiết lập mật khẩu đăng nhập"}
                        </h3>

                        {isEditing ? (
                            <div className="user-profile-password-fields" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {userInfo?.has_password && (
                                    <div className="user-profile-field">
                                        <label>Mật khẩu hiện tại</label>
                                        <input
                                            type="password"
                                            placeholder="Nhập mật khẩu hiện tại"
                                            value={oldPassword}
                                            onChange={(e) => setOldPassword(e.target.value)}
                                        />
                                    </div>
                                )}
                                <div className="user-profile-field">
                                    <label>{userInfo?.has_password ? "Mật khẩu mới" : "Mật khẩu"}</label>
                                    <input
                                        type="password"
                                        placeholder={userInfo?.has_password ? "Nhập mật khẩu mới" : "Thiết lập mật khẩu"}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                </div>
                                <div className="user-profile-field">
                                    <label>{userInfo?.has_password ? "Xác nhận mật khẩu mới" : "Xác nhận mật khẩu"}</label>
                                    <input
                                        type="password"
                                        placeholder={userInfo?.has_password ? "Xác nhận lại mật khẩu mới" : "Xác nhận lại mật khẩu"}
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="user-profile-field">
                                <label>Mật khẩu</label>
                                <div className="view-value" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
                                    <span>{userInfo?.has_password ? "•••••••• (Đã thiết lập)" : "Chưa thiết lập (Đăng nhập qua Google)"}</span>
                                    <button
                                        type="button"
                                        onClick={() => setIsEditing(true)}
                                        style={{
                                            background: '#1e90ff',
                                            color: '#ffffff',
                                            border: '1.5px solid #2c3e50',
                                            borderRadius: '8px',
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 0 #2c3e50',
                                            marginLeft: '10px'
                                        }}
                                    >
                                        {userInfo?.has_password ? "Đổi mật khẩu" : "Thêm mật khẩu"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Các nút bấm chỉ hiện khi ở chế độ Edit */}
                        {isEditing && (
                            <div className="user-profile-actions">
                                <button type="submit" className="user-profile-save-btn">
                                    <Save size={16} /> Lưu hồ sơ
                                </button>
                                <button type="button" onClick={() => setIsEditing(false)} className="user-profile-cancel-btn">
                                    Hủy
                                </button>
                            </div>
                        )}
                    </form>
                </>
            )}
        </div>
    );
};

export default UserProfile;