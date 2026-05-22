// src/components/MainTabs.jsx
import React, { useState, useEffect, useRef } from 'react';
import './MainTabs.css';

// Tạm thời import file trang chủ cũ của bạn vào Tab 1
import Traveltrip from '../screens/Travel_trip';
import MapComponent from './Map/MapComponent';

// Import services and components for Hidden Quests
import { getActiveTasks, pingLocation, verifyQuest } from '../services/hiddenQuestService';
import ChestOpeningAnimation from './HiddenQuest/ChestOpeningAnimation';
import HiddenQuestDebug from './HiddenQuest/HiddenQuestDebug';

const MainTabs = ({ user, isGuest, onLogout, onRequireLogin, onOpenPlan, onOpenLocationRegister, onOpenProfileEdit, onOpenHistory, onOpenTripDetail }) => {
    // State quản lý tab đang hiển thị
    const [activeTab, setActiveTab] = useState('home');
    const [userLocation, setUserLocation] = useState(null);
    
    // State quản lý Thành tựu
    const [achievements, setAchievements] = useState([]);
    const [loadingAch, setLoadingAch] = useState(false);
    const [achFilter, setAchFilter] = useState('all'); // 'all', 'unlocked', 'locked'

    const fetchAchievements = async () => {
        if (isGuest) return;
        setLoadingAch(true);
        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('http://127.0.0.1:8000/api/achievements', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    setAchievements(data.achievements || []);
                }
            }
        } catch (error) {
            console.error("Lỗi khi tải thành tựu:", error);
        } finally {
            setLoadingAch(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'profile') {
            fetchAchievements();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // States for Hidden Quests
    const [hiddenTasks, setHiddenTasks] = useState([]);
    const [selectedTask, setSelectedTask] = useState(null);
    const [showChestAnimation, setShowChestAnimation] = useState(false);
    const [showQuestModal, setShowQuestModal] = useState(false);
    const [qrTokenInput, setQrTokenInput] = useState('');
    const [quizAnswer, setQuizAnswer] = useState('');
    const [photoUploaded, setPhotoUploaded] = useState(false);
    const [photoUrl, setPhotoUrl] = useState('');
    const [questLoading, setQuestLoading] = useState(false);
    const [questError, setQuestError] = useState('');
    const [questSuccess, setQuestSuccess] = useState(null);

    const userLocationRef = useRef(userLocation);

    // Update location ref
    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);

    // Fetch active hidden tasks list
    const fetchActiveTasks = async () => {
        if (isGuest) return;
        try {
            const tasks = await getActiveTasks();
            setHiddenTasks(tasks);
        } catch (err) {
            console.error("Lỗi lấy danh sách nhiệm vụ ẩn:", err);
        }
    };

    // Verify / Complete quest endpoint trigger
    const handleVerifyQuest = async (extraData = {}) => {
        if (!selectedTask || !userLocation) {
            setQuestError("Không xác định được vị trí GPS hiện tại!");
            return;
        }
        setQuestLoading(true);
        setQuestError('');
        try {
            const res = await verifyQuest(
                selectedTask.spawn_id,
                userLocation.lat,
                userLocation.lng,
                selectedTask.quest_type,
                extraData
            );
            setQuestSuccess(res);
            fetchActiveTasks();
        } catch (err) {
            setQuestError(err.message || "Xác thực thất bại");
        } finally {
            setQuestLoading(false);
        }
    };

    // Handle map click events on hidden tasks
    const handleHiddenTaskClick = (task) => {
        setSelectedTask(task);
        if (task.task_type === 'CHEST') {
            setShowChestAnimation(true);
        } else if (task.task_type === 'DYNAMIC_QUEST') {
            setShowQuestModal(true);
        }
    };

    // Geolocation watching and periodic spawn pinging (every 30s)
    useEffect(() => {
        if (isGuest || activeTab !== 'location') return;

        // Initial fetch of active items on tab switch
        fetchActiveTasks();

        let watchId = null;
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const newLoc = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };
                    setUserLocation(newLoc);
                },
                (err) => console.warn("Watch position error:", err),
                { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
            );
        }

        const pingInterval = setInterval(async () => {
            const currentLoc = userLocationRef.current;
            if (currentLoc && currentLoc.lat && currentLoc.lng) {
                try {
                    const res = await pingLocation(currentLoc.lat, currentLoc.lng);
                    if (res.spawned) {
                        alert(`🔮 Phát hiện nhiệm vụ ẩn mới: "${res.item.title}" (${res.item.rarity}) vừa xuất hiện gần bạn!`);
                        fetchActiveTasks();
                    }
                } catch (err) {
                    console.error("Lỗi ping vị trí:", err);
                }
            }
        }, 30000);

        return () => {
            if (watchId !== null && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchId);
            }
            clearInterval(pingInterval);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, isGuest]);

    // Lấy vị trí khi chuyển sang tab Location
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === 'location') {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const loc = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude
                    };
                    setUserLocation(loc);
                    
                    if (!isGuest) {
                        pingLocation(loc.lat, loc.lng)
                            .then((res) => {
                                if (res.spawned) {
                                    alert(`🔮 Phát hiện nhiệm vụ ẩn mới: "${res.item.title}" (${res.item.rarity}) vừa xuất hiện!`);
                                }
                                fetchActiveTasks();
                            })
                            .catch((err) => console.error(err));
                    }
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

            <MapComponent 
                userLocation={userLocation} 
                stops={[]} 
                hiddenTasks={hiddenTasks} 
                onHiddenTaskClick={handleHiddenTaskClick} 
            />

            {!isGuest && (
                <HiddenQuestDebug 
                    userLocation={userLocation} 
                    onSpawnSuccess={fetchActiveTasks}
                    onTestClaim={(testTask) => {
                        setSelectedTask(testTask);
                        setShowChestAnimation(true);
                    }}
                />
            )}

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
                            {(user?.points_balance || 0) + (user?.total_points || 0)} <span style={{ fontSize: '12px', color: '#b2bec3', fontWeight: '500' }}>pts</span>
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

            {/* THÀNH TỰU & HUY HIỆU */}
            <div style={{
                backgroundColor: '#fff', padding: '20px', borderRadius: '16px',
                marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
            }}>
                <h4 style={{ margin: '0 0 15px 0', color: '#2d3436', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🏆 Huy hiệu thám hiểm ({achievements.filter(a => a.is_unlocked).length}/{achievements.length})
                </h4>
                
                {/* Thanh bộ lọc thành tựu */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    {['all', 'unlocked', 'locked'].map((f) => {
                        const label = f === 'all' ? 'Tất cả' : f === 'unlocked' ? 'Đã đạt ✨' : 'Đang làm 🏃';
                        const isActive = achFilter === f;
                        return (
                            <button
                                key={f}
                                onClick={() => setAchFilter(f)}
                                style={{
                                    flex: 1, padding: '10px 6px', borderRadius: '12px', border: 'none',
                                    fontWeight: 'bold', fontSize: '12px', cursor: 'pointer',
                                    backgroundColor: isActive ? '#0abde3' : '#f1f2f6',
                                    color: isActive ? '#fff' : '#576574',
                                    boxShadow: isActive ? '0 4px 10px rgba(10, 189, 227, 0.2)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {f === 'unlocked' ? `Đã đạt (${achievements.filter(a => a.is_unlocked).length})` : f === 'locked' ? `Đang làm (${achievements.filter(a => !a.is_unlocked).length})` : 'Tất cả'}
                            </button>
                        );
                    })}
                </div>
                
                {loadingAch ? (
                    <div style={{ textAlign: 'center', padding: '10px', color: '#747d8c' }}>
                        🔄 Đang tải thành tựu...
                    </div>
                ) : achievements.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '10px', color: '#747d8c' }}>
                        Chưa có dữ liệu thành tựu.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {achievements
                            .filter((ach) => {
                                if (achFilter === 'unlocked') return ach.is_unlocked;
                                if (achFilter === 'locked') return !ach.is_unlocked;
                                return true;
                            })
                            .map((ach) => {
                                const percent = (ach.current_progress / ach.condition_value) * 100;
                            return (
                                <div 
                                    key={ach.achievement_id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '15px',
                                        padding: '12px', borderRadius: '12px',
                                        backgroundColor: ach.is_unlocked ? '#f1fcf4' : '#fafafa',
                                        border: ach.is_unlocked ? '1px solid #d4edda' : '1px solid #f1f2f6',
                                        opacity: ach.is_unlocked ? 1 : 0.85
                                    }}
                                >
                                    {/* Icon Huy hiệu */}
                                    <div style={{
                                        fontSize: '28px', width: '48px', height: '48px',
                                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        backgroundColor: ach.is_unlocked ? '#e8f8f5' : '#e4e5e6',
                                        boxShadow: ach.is_unlocked ? '0 4px 8px rgba(46, 204, 113, 0.15)' : 'none'
                                    }}>
                                        {ach.badge_icon}
                                    </div>
                                    
                                    {/* Chi tiết thành tựu */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ color: '#2d3436', fontSize: '14px' }}>{ach.title}</strong>
                                            <span style={{
                                                fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '20px',
                                                backgroundColor: ach.is_unlocked ? '#2ecc71' : '#ffeaa7',
                                                color: ach.is_unlocked ? '#fff' : '#d63031'
                                            }}>
                                                {ach.is_unlocked ? `+${ach.points_reward} pts` : `Đang khóa`}
                                            </span>
                                        </div>
                                        
                                        <span style={{ fontSize: '12px', color: '#636e72', textAlign: 'left' }}>{ach.description}</span>
                                        
                                        {/* Tiến trình bar */}
                                        {!ach.is_unlocked && (
                                            <div style={{ marginTop: '5px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#b2bec3', marginBottom: '2px' }}>
                                                    <span>Tiến trình</span>
                                                    <span>{ach.current_progress}/{ach.condition_value}</span>
                                                </div>
                                                <div style={{ width: '100%', height: '6px', backgroundColor: '#dfe6e9', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${percent}%`, height: '100%', backgroundColor: '#0abde3', borderRadius: '3px' }}></div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {ach.is_unlocked && ach.unlocked_at && (
                                            <span style={{ fontSize: '11px', color: '#2ecc71', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                ✨ Đạt được ngày {new Date(ach.unlocked_at).toLocaleDateString('vi-VN')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
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

            {/* --- Hidden Quest Overlays --- */}
            {showChestAnimation && selectedTask && (
                <ChestOpeningAnimation 
                    task={selectedTask} 
                    userLocation={userLocation}
                    onClose={() => {
                        setShowChestAnimation(false);
                        setSelectedTask(null);
                    }}
                    onClaim={(rewards) => {
                        alert(`🎉 Chúc mừng! Bạn nhận được +${rewards.reward_exp} EXP và +${rewards.reward_coin} Coin!`);
                        fetchActiveTasks();
                    }}
                />
            )}

            {showQuestModal && selectedTask && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content">
                        <div className="quest-modal-header">
                            <h3>🔮 {selectedTask.title || 'Sự kiện Doanh nghiệp'}</h3>
                            <button className="quest-close-btn" onClick={() => {
                                setShowQuestModal(false);
                                setQuestError('');
                                setQuestSuccess(null);
                                setQrTokenInput('');
                                setQuizAnswer('');
                                setPhotoUploaded(false);
                                setPhotoUrl('');
                            }}>✕</button>
                        </div>
                        
                        <div className="quest-modal-body">
                            {!questSuccess ? (
                                <>
                                    <p className="quest-desc">{selectedTask.description || 'Hoàn thành thử thách để nhận quà từ doanh nghiệp.'}</p>
                                    
                                    <div className="quest-meta-info">
                                        <span>📍 Bán kính: {selectedTask.radius_meters}m</span>
                                        <span>⭐ Thưởng: {selectedTask.reward_exp} EXP | 🪙 {selectedTask.reward_coin} Coin</span>
                                    </div>

                                    {/* 1. CHECKIN QUEST */}
                                    {selectedTask.quest_type === 'CHECKIN' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction">📍 Hệ thống sẽ xác thực vị trí GPS của bạn so với địa điểm sự kiện.</p>
                                            <button 
                                                className="quest-action-btn"
                                                onClick={() => handleVerifyQuest()}
                                                disabled={questLoading}
                                            >
                                                {questLoading ? 'Đang xác thực...' : '📍 Đăng ký Check-in ngay'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 2. QR QUEST */}
                                    {selectedTask.quest_type === 'QR' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction">🔳 Vui lòng nhập mã token nhận được từ doanh nghiệp hoặc quét QR:</p>
                                            <input 
                                                type="text" 
                                                className="quest-input"
                                                placeholder="Ví dụ: QR_EVENT_TOKEN_123"
                                                value={qrTokenInput}
                                                onChange={(e) => setQrTokenInput(e.target.value)}
                                            />
                                            <button 
                                                className="quest-action-btn"
                                                onClick={() => handleVerifyQuest({ qr_token: qrTokenInput })}
                                                disabled={questLoading || !qrTokenInput.trim()}
                                            >
                                                {questLoading ? 'Đang xác thực...' : '✔️ Xác nhận mã QR'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 3. QUIZ QUEST */}
                                    {selectedTask.quest_type === 'QUIZ' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction">❓ Trả lời câu hỏi trắc nghiệm dưới đây:</p>
                                            <div className="quest-quiz-question">
                                                <strong>Câu hỏi:</strong> Địa điểm/Doanh nghiệp này cung cấp loại dịch vụ du lịch nào đặc trưng nhất?
                                            </div>
                                            <div className="quiz-options-grid">
                                                {[
                                                    { code: 'A', text: 'Dịch vụ lưu trú & Tour trọn gói' },
                                                    { code: 'B', text: 'Cho thuê phương tiện di chuyển' },
                                                    { code: 'C', text: 'Bán quà lưu niệm thủ công' },
                                                    { code: 'D', text: 'Ăn uống & Ẩm thực đường phố' }
                                                ].map((opt) => (
                                                    <button 
                                                        key={opt.code}
                                                        className={`quiz-option-card ${quizAnswer === opt.code ? 'selected' : ''}`}
                                                        onClick={() => setQuizAnswer(opt.code)}
                                                    >
                                                        <span className="option-code">{opt.code}</span>
                                                        <span className="option-text">{opt.text}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <button 
                                                className="quest-action-btn"
                                                onClick={() => handleVerifyQuest({ answer: quizAnswer, correct_answer: 'A' })}
                                                disabled={questLoading || !quizAnswer}
                                                style={{ marginTop: '15px' }}
                                            >
                                                {questLoading ? 'Đang gửi đáp án...' : '✔️ Nộp đáp án'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 4. PHOTO QUEST */}
                                    {selectedTask.quest_type === 'PHOTO' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction">📷 Chụp ảnh hiện vật hoặc biển hiệu để xác nhận sự hiện diện:</p>
                                            
                                            {photoUploaded ? (
                                                <div className="photo-preview-box">
                                                    <img src={photoUrl} alt="Preview checkin" />
                                                    <button className="photo-reset" onClick={() => { setPhotoUploaded(false); setPhotoUrl(''); }}>✕ Xóa ảnh</button>
                                                </div>
                                            ) : (
                                                <div className="photo-upload-placeholder" onClick={() => {
                                                    setPhotoUrl("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500");
                                                    setPhotoUploaded(true);
                                                }}>
                                                    <span style={{ fontSize: '32px' }}>📷</span>
                                                    <span>Chạm để tải lên / Chụp ảnh check-in</span>
                                                    <small style={{ color: '#a4b0be' }}>(Mô phỏng tự động chọn ảnh chất lượng cao)</small>
                                                </div>
                                            )}

                                            <button 
                                                className="quest-action-btn"
                                                onClick={() => handleVerifyQuest({ image_url: photoUrl })}
                                                disabled={questLoading || !photoUploaded}
                                                style={{ marginTop: '15px' }}
                                            >
                                                {questLoading ? 'Đang xác thực ảnh...' : '✔️ Xác nhận ảnh chụp'}
                                            </button>
                                        </div>
                                    )}

                                    {questError && (
                                        <div className="quest-error-msg">
                                            ⚠️ Lỗi: {questError}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="quest-success-screen">
                                    <div className="success-icon">🎉</div>
                                    <h4>Thử thách hoàn thành!</h4>
                                    <p>Chúc mừng bạn đã hoàn thành nhiệm vụ và nhận được phần thưởng:</p>
                                    
                                    <div className="success-reward-card">
                                        <div className="success-reward-item">
                                            <span style={{ fontSize: '24px' }}>🔥</span>
                                            <span><strong>+{questSuccess.reward_exp}</strong> EXP</span>
                                        </div>
                                        <div className="success-reward-item">
                                            <span style={{ fontSize: '24px' }}>🪙</span>
                                            <span><strong>+{questSuccess.reward_coin}</strong> Coin</span>
                                        </div>
                                    </div>

                                    <button 
                                        className="quest-close-success-btn"
                                        onClick={() => {
                                            setShowQuestModal(false);
                                            setQuestSuccess(null);
                                            setQrTokenInput('');
                                            setQuizAnswer('');
                                            setPhotoUploaded(false);
                                            setPhotoUrl('');
                                        }}
                                    >
                                        Tuyệt vời! Tiếp tục hành trình
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MainTabs;