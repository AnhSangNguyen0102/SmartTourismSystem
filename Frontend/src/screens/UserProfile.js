import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';
import { ArrowLeft, Edit2, Award, Camera, Save } from 'lucide-react';
import { showAlert } from '../platform/dialog';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../utils/avatar';
import './UserProfile.css';

const UserProfile = ({ user, onBack, onUpdateSuccess }) => {
    // 1. Kiểm tra vai trò người dùng (Bắt lỗi nếu user lồng nhau)
    const userInfo = user?.user || user;
    const isEnterprise = userInfo?.role === 'ENTERPRISE';

    // Biến kiểm soát chế độ Xem hay Sửa
    const [isEditing, setIsEditing] = useState(false);

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

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        try {
            const token = await storageGet('access_token');
            const response = await fetch(`${API_BASE}/api/auth/update-profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData)
            });

            if (response.ok) {
                void showAlert('Cập nhật hồ sơ thành công!');
                setIsEditing(false); // Thành công thì khóa form lại (Chế độ xem)
                // const newName = isEnterprise ? profileData.business_name : profileData.full_name;
                // if (onUpdateSuccess) onUpdateSuccess(newName);
                if (onUpdateSuccess) {
                    onUpdateSuccess(profileData);
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

            {/* HIỂN THỊ ĐIỂM THƯỞNG (Nếu không phải doanh nghiệp) */}
            {!isEnterprise && (
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
            )}

            {/* Avatar Section - Giữ nguyên cho cả 2 hoặc bạn có thể tách ra */}
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
                        <button className="user-profile-avatar-edit-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Camera size={14} />
                        </button>
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

                {/* Các nút bấm chỉ hiện khi ở chế độ Edit */}
                {isEditing && (
                    <div className="user-profile-actions">
                        <button type="submit" className="user-profile-save-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Save size={16} /> Lưu hồ sơ
                        </button>
                        <button type="button" onClick={() => setIsEditing(false)} className="user-profile-cancel-btn">
                            Hủy
                        </button>
                    </div>
                )}
            </form>
        </div>
    );
};

export default UserProfile;
