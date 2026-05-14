import React, { useState, useEffect } from 'react';

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
            const token = localStorage.getItem('access_token');
            const response = await fetch('http://127.0.0.1:8000/api/auth/update-profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData)
            });

            if (response.ok) {
                alert("Cập nhật hồ sơ thành công! ✨");
                setIsEditing(false); // Thành công thì khóa form lại (Chế độ xem)
                // const newName = isEnterprise ? profileData.business_name : profileData.full_name;
                // if (onUpdateSuccess) onUpdateSuccess(newName);
                if (onUpdateSuccess) {
                    onUpdateSuccess(profileData);
                }
            } else {
                const errorData = await response.json();
                alert("Lỗi: " + (errorData.detail || "Không thể cập nhật"));
            }
        } catch (error) {
            alert("Không thể kết nối tới máy chủ.");
        }
    };

    // Hàm tiện ích để render một dòng dữ liệu (Tự động chuyển đổi giữa Text và Input)
    const renderRow = (label, value, field, type = "text", options = null) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
            <label style={{ fontSize: '14px', fontWeight: 600, color: '#576574' }}>{label}</label>
            {isEditing ? (
                options ? (
                    <select
                        value={value}
                        onChange={(e) => handleChange(field, e.target.value)}
                        style={{ padding: '12px', borderRadius: '12px', border: '1px solid #c8d6e5' }}
                    >
                        {options.map(opt => <option key={opt.val} value={opt.val}>{opt.label}</option>)}
                    </select>
                ) : type === "textarea" ? (
                    <textarea
                        rows="3" value={value} onChange={(e) => handleChange(field, e.target.value)}
                        style={{ padding: '12px', borderRadius: '12px', border: '1px solid #c8d6e5', resize: 'none' }}
                    />
                ) : (
                    <input
                        type={type} value={value} onChange={(e) => handleChange(field, e.target.value)}
                        style={{ padding: '12px', borderRadius: '12px', border: '1px solid #c8d6e5' }}
                    />
                )
            ) : (
                <div style={{ padding: '12px', backgroundColor: '#f1f2f6', borderRadius: '12px', color: '#2d3436', minHeight: '20px' }}>
                    {value || "(Chưa cập nhật)"}
                </div>
            )}
        </div>
    );

    return (
        <div style={{ padding: '24px', backgroundColor: '#fafbfc', minHeight: '100vh' }}>
            {/* Header & Back Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '16px', color: '#576574', cursor: 'pointer' }}>
                    ⬅️ Quay lại
                </button>

                {/* NÚT BẬT TẮT CHẾ ĐỘ SỬA */}
                {!isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        style={{ background: '#0abde3', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        ✏️ Sửa hồ sơ
                    </button>
                )}
            </div>

            <h2 style={{ color: '#222f3e', marginBottom: '20px', fontSize: '24px', fontWeight: 800 }}>
                {isEnterprise ? "Cấu hình Doanh nghiệp" : "Hồ sơ của tôi"}
            </h2>

            {/* Avatar Section - Giữ nguyên cho cả 2 hoặc bạn có thể tách ra */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '30px' }}>
                <div style={{ position: 'relative' }}>
                    <img
                        src={profileData.avatar_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"}
                        alt="Avatar"
                        style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #0abde3' }}
                    />
                    {isEditing && (
                        <button style={{ position: 'absolute', bottom: 0, right: 0, background: '#0abde3', color: 'white', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer' }}>📷</button>
                    )}
                </div>
            </div>

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column' }}>

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
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1 }}>{renderRow("Ngày sinh", profileData.date_of_birth, "date_of_birth", "date")}</div>
                            <div style={{ flex: 1 }}>
                                {renderRow("Giới tính", profileData.gender, "gender", "text", [
                                    { val: 'MALE', label: 'Nam' },
                                    { val: 'FEMALE', label: 'Nữ' }
                                ])}
                            </div>
                        </div>
                        {renderRow("Nơi sống (Base Location)", profileData.base_location, "base_location")}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
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
                            <div style={{ flex: 1 }}>
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
                    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                        <button type="submit" style={{ flex: 1, background: '#22a6b3', color: 'white', padding: '14px', borderRadius: '12px', border: 'none', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>
                            💾 Lưu hồ sơ
                        </button>
                        <button type="button" onClick={() => setIsEditing(false)} style={{ flex: 1, background: '#ee5253', color: 'white', padding: '14px', borderRadius: '12px', border: 'none', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>
                            Hủy
                        </button>
                    </div>
                )}
            </form>
        </div>
    );
};

export default UserProfile;