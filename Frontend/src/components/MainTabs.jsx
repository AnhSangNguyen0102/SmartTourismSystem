// src/components/MainTabs.jsx
import React, { useState } from 'react';
import './MainTabs.css';

// Tạm thời import file trang chủ cũ của bạn vào Tab 1
import Traveltrip from '../screens/Travel_trip';
import MapComponent from './Map/MapComponent';

const MainTabs = ({ user, isGuest, onLogout, onRequireLogin, onOpenPlan, onOpenLocationRegister, onOpenProfileEdit, onOpenHistory, onOpenTripDetail }) => {
    // State quản lý tab đang hiển thị
    const [activeTab, setActiveTab] = useState('home');
    const [userLocation, setUserLocation] = useState(null);

    // Lấy vị trí khi chuyển sang tab Location
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === 'location') {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    });
                },
                (err) => console.warn("Lỗi lấy vị trí:", err),
                { enableHighAccuracy: false, timeout: 10000 }
            );
        }
    };

    // Các trang giả định (Placeholder) cho các tab chưa code
    const LocationScreen = () => (
        <div style={{ padding: '20px', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
            <h2 style={{ marginBottom: '20px', color: '#2f3542' }}>📍 Vị trí hiện tại</h2>

            <MapComponent userLocation={userLocation} stops={[]} />

            {userLocation ? (
                <div style={{
                    backgroundColor: 'white', padding: '15px', borderRadius: '12px',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.05)', marginTop: '10px'
                }}>
                    <p style={{ margin: '0 0 5px 0', color: '#747d8c', fontSize: '14px' }}>Tọa độ của bạn:</p>
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <div><small>Vĩ độ:</small> <strong>{userLocation.lat.toFixed(6)}</strong></div>
                        <div><small>Kinh độ:</small> <strong>{userLocation.lng.toFixed(6)}</strong></div>
                    </div>
                </div>
            ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#747d8c' }}>
                    🛰️ Đang xác định vị trí của bạn...
                </div>
            )}

            <div style={{ marginTop: '25px', padding: '15px', background: '#e1f5fe', borderRadius: '12px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#01579b' }}>💡 Mẹo nhỏ</h4>
                <p style={{ margin: 0, fontSize: '14px', color: '#0277bd', lineHeight: '1.5' }}>
                    Bản đồ này sẽ giúp bạn theo dõi vị trí của mình trong suốt hành trình. Khi bạn bắt đầu một chuyến đi, lịch trình sẽ hiển thị trực tiếp tại đây!
                </p>
            </div>
        </div>
    );
    const FriendsScreen = () => <div style={{ padding: '20px' }}><h2>👥 Bạn bè & Cộng đồng</h2><p>Ghép đôi và danh sách bạn bè...</p></div>;
    const FavoritesScreen = () => <div style={{ padding: '20px' }}><h2>❤️ Yêu thích</h2><p>Các địa điểm, bài đăng đã lưu...</p></div>;
    const GuestPlaceholder = ({ title, icon }) => (
        <div style={{ padding: '40px 20px', textAlign: 'center', marginTop: '10vh' }}>
            <div style={{ fontSize: '60px', marginBottom: '20px' }}>{icon}</div>
            <h2 style={{ color: '#2f3542', marginBottom: '10px' }}>{title}</h2>
            <p style={{ color: '#747d8c', marginBottom: '30px', lineHeight: '1.6' }}>
                Tính năng này yêu cầu đăng nhập. Hãy tạo tài khoản để lưu lại hành trình của riêng bạn nhé!
            </p>
            <button
                onClick={onRequireLogin} // Gọi hàm quay về trang đăng nhập
                style={{
                    background: 'linear-gradient(135deg, #0abde3 0%, #22a6b3 100%)',
                    color: 'white', padding: '14px 30px', borderRadius: '16px',
                    border: 'none', fontWeight: 'bold', fontSize: '16px',
                    cursor: 'pointer', boxShadow: '0 8px 20px rgba(10, 189, 227, 0.3)'
                }}
            >
                Đăng nhập ngay 🚀
            </button>
        </div>
    );
    const menuBtnStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        width: '100%',
        padding: '16px 20px',
        backgroundColor: '#ffffff',
        border: '1px solid #f1f2f6',
        borderRadius: '14px',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
        transition: 'all 0.2s ease',
        marginBottom: '12px'
    };

    // Màn hình Cá nhân (Profile) đã được lột xác
    const ProfileScreen = () => (
        <div style={{ padding: '20px', backgroundColor: '#f8f9fa', minHeight: '100vh', paddingBottom: '100px' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '25px', color: '#2f3542' }}>Hồ sơ cá nhân</h2>

            {/* Khu vực hiển thị Avatar và Tên */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', backgroundColor: '#fff', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                <img
                    src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"
                    alt="Avatar"
                    style={{ width: '65px', height: '65px', borderRadius: '50%', objectFit: 'cover', marginRight: '15px' }}
                />
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#2f3542' }}>{user?.full_name || 'Khách du lịch'}</h3>
                    <p style={{ margin: '5px 0 0', color: '#747d8c', fontSize: '14px' }}>{user?.email || 'Chưa cập nhật email'}</p>
                </div>
            </div>

            {/* Thống kê & Bảo mật (Layout chuyên nghiệp giống TripSummary) */}
            <div style={{
                display: 'flex', justifyContent: 'space-around', alignItems: 'center',
                backgroundColor: '#fff', padding: '20px 15px', borderRadius: '16px',
                marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
            }}>
                {/* Điểm thưởng */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        fontSize: '24px', background: '#fff4e6', padding: '10px',
                        borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        ⭐
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <small style={{ color: '#636e72', fontSize: '12px', fontWeight: '500' }}>Điểm thưởng</small>
                        <strong style={{ color: '#f39c12', fontSize: '18px' }}>
                            {user?.total_points || 0} <span style={{ fontSize: '12px', color: '#b2bec3', fontWeight: '500' }}>pts</span>
                        </strong>
                    </div>
                </div>

                <div style={{ width: '1px', height: '40px', backgroundColor: '#dfe6e9' }}></div>

                {/* Trạng thái bảo mật */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        fontSize: '24px',
                        background: user?.kyc_status === 'APPROVED' ? '#e8f8f5' : '#fdf2e9',
                        padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {user?.kyc_status === 'APPROVED' ? '🛡️' : '⚠️'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <small style={{ color: '#636e72', fontSize: '12px', fontWeight: '500' }}>Trạng thái</small>
                        <strong style={{ color: user?.kyc_status === 'APPROVED' ? '#2ecc71' : '#e67e22', fontSize: '15px' }}>
                            {user?.kyc_status === 'APPROVED' ? 'Đã bảo mật' : 'Chưa bảo mật'}
                        </strong>
                    </div>
                </div>
            </div>

            {/* Mạng xã hội liên kết */}
            <div style={{
                backgroundColor: '#fff', padding: '20px', borderRadius: '16px',
                marginBottom: '30px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h4 style={{ margin: '0 0 4px 0', color: '#2d3436', fontSize: '16px', fontWeight: 'bold' }}>Tài khoản liên kết</h4>
                    <span style={{ fontSize: '12px', color: '#636e72' }}>Kết nối để đăng nhập nhanh</span>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    {/* Facebook (Đã liên kết giả định) */}
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#e7f0fd',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        color: '#1877f2', fontSize: '18px', border: '1px solid #d1e3fb'
                    }} title="Đã liên kết Facebook">
                        <i className="fab fa-facebook-f"></i>
                    </div>
                    {/* Instagram (Chưa liên kết) */}
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#f1f2f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        color: '#a4b0be', fontSize: '20px'
                    }} title="Chưa liên kết Instagram">
                        <i className="fab fa-instagram"></i>
                    </div>
                    {/* Twitter (Chưa liên kết) */}
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#f1f2f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        color: '#a4b0be', fontSize: '20px'
                    }} title="Chưa liên kết Twitter">
                        <i className="fab fa-twitter"></i>
                    </div>
                </div>
            </div>

            {/* Danh sách các nút chức năng */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                    className="menu-btn"
                    onClick={onOpenProfileEdit} // Khi nhấn sẽ đổi currentScreen sang 'profile_edit'
                >
                    <span style={{ color: '#a29bfe' }}>⚙️</span> Cài đặt quyền riêng tư
                </button>

                <button style={menuBtnStyle}>
                    <span style={{ fontSize: '20px' }}>❓</span>
                    <span style={{ fontSize: '16px', fontWeight: '500', color: '#4b4b4b' }}>Trợ giúp và hỗ trợ</span>
                </button>

                <button style={menuBtnStyle}>
                    <span style={{ fontSize: '20px' }}>💬</span>
                    <span style={{ fontSize: '16px', fontWeight: '500', color: '#4b4b4b' }}>Đóng góp ý kiến</span>
                </button>

                {/* Nút Đăng xuất nổi bật */}
                <button
                    onClick={onLogout}
                    style={{
                        ...menuBtnStyle,
                        backgroundColor: '#fff0f0', // Nền đỏ nhạt
                        border: '1px solid #ffcccc', // Viền đỏ nhạt
                        marginTop: '10px'
                    }}
                >
                    <span style={{ fontSize: '20px' }}>🚪</span>
                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#e84118' }}>Đăng xuất</span>
                </button>
            </div>
        </div>
    );
    // Render nội dung tương ứng với tab được chọn
    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return <Traveltrip
                    user={user} isGuest={isGuest}
                    onLogout={onLogout} onRequireLogin={onRequireLogin}
                    onOpenPlan={onOpenPlan} onOpenLocationRegister={onOpenLocationRegister}
                    onOpenProfileEdit={onOpenProfileEdit}
                    onOpenHistory={onOpenHistory}
                    onOpenTripDetail={onOpenTripDetail}
                />;
            case 'location':
                return isGuest ? <GuestPlaceholder title="Bản đồ & Lịch trình" icon="📍" /> : <LocationScreen />;

            case 'friends':
                return isGuest ? <GuestPlaceholder title="Cộng đồng Du lịch" icon="👥" /> : <FriendsScreen />;

            case 'favorites':
                return isGuest ? <GuestPlaceholder title="Địa điểm Yêu thích" icon="❤️" /> : <FavoritesScreen />;

            case 'profile':
                return isGuest ? <GuestPlaceholder title="Hồ sơ Cá nhân" icon="👤" /> : <ProfileScreen />;

            default:
                return <Traveltrip />;
        }
    };

    return (
        <div className="main-layout">
            {/* Vùng hiển thị nội dung của từng tab */}
            <div className="content-area">
                {renderContent()}
            </div>

            {/* Thanh menu dưới đáy */}
            <div className="bottom-nav">
                <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => handleTabChange('home')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill={activeTab === 'home' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span className="nav-label">Trang chủ</span>
                </div>

                <div className={`nav-item ${activeTab === 'location' ? 'active' : ''}`} onClick={() => handleTabChange('location')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill={activeTab === 'location' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span className="nav-label">Vị trí</span>
                </div>

                <div className={`nav-item ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => handleTabChange('friends')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill={activeTab === 'friends' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span className="nav-label">Bạn bè</span>
                </div>

                <div className={`nav-item ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => handleTabChange('favorites')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill={activeTab === 'favorites' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span className="nav-label">Yêu thích</span>
                </div>

                <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => handleTabChange('profile')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill={activeTab === 'profile' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span className="nav-label">Cá nhân</span>
                </div>
            </div>
        </div>
    );
};

export default MainTabs;