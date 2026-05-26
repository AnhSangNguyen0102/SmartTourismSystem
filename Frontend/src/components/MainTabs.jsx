// src/components/MainTabs.jsx
import React, { useState, useEffect, useRef } from 'react';
import { 
    Map, 
    MapPin, 
    Users, 
    Heart, 
    User, 
    Compass, 
    Award, 
    Trophy, 
    Sparkles, 
    Coins, 
    Star,
    QrCode, 
    Camera, 
    CheckCircle2, 
    MessageCircle,
    LogOut,
    Settings,
    Medal,
    Crown,
    Globe,
    Activity,
    HelpCircle,
    AlertTriangle
} from 'lucide-react';
import './MainTabs.css';

// Tạm thời import file trang chủ cũ của bạn vào Tab 1
import Traveltrip from '../screens/Travel_trip';
import MapComponent from './Map/MapComponent';
import Leaderboard from './Leaderboard';

// Import services and components for Hidden Quests
import { getActiveTasks, pingLocation, verifyQuest } from '../services/hiddenQuestService';
import ChestOpeningAnimation from './HiddenQuest/ChestOpeningAnimation';
import HiddenQuestDebug from './HiddenQuest/HiddenQuestDebug';
import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';
import { showAlert } from '../platform/dialog';
import { getCurrentPosition, startWatchingPosition } from '../platform/location';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../utils/avatar';

const getTierMeta = (level) => {
    if (level <= 5) {
        return { label: 'Hạng Đồng', shortLabel: 'Đồng', icon: Medal };
    }
    if (level <= 15) {
        return { label: 'Hạng Bạc', shortLabel: 'Bạc', icon: Award };
    }
    if (level <= 30) {
        return { label: 'Hạng Vàng', shortLabel: 'Vàng', icon: Crown };
    }
    return { label: 'Bạch Kim', shortLabel: 'Bạch Kim', icon: Trophy };
};

const getAchievementIcon = (achievement) => {
    const category = String(achievement?.category || '').toLowerCase();
    const type = String(achievement?.type || '').toLowerCase();
    const title = String(achievement?.title || '').toLowerCase();
    const key = `${category} ${type} ${title}`;

    if (key.includes('check') || key.includes('gps') || key.includes('địa điểm')) return <MapPin size={18} className="achievement-icon-svg" />;
    if (key.includes('ảnh') || key.includes('photo')) return <Camera size={18} className="achievement-icon-svg" />;
    if (key.includes('thưởng') || key.includes('rank') || key.includes('top')) return <Trophy size={18} className="achievement-icon-svg" />;
    if (key.includes('chuỗi') || key.includes('streak')) return <Star size={18} className="achievement-icon-svg" />;
    return <Award size={18} className="achievement-icon-svg" />;
};

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
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/achievements`, {
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
    const mapComponentRef = useRef(null);
    const [showMapSearch, setShowMapSearch] = useState(false);
    const [showMapMenu, setShowMapMenu] = useState(false);
    const [mapStyle, setMapStyle] = useState('voyager');
    const [showHiddenTasks, setShowHiddenTasks] = useState(true);
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

        const stopWatching = startWatchingPosition({
            onSuccess: (position) => {
                setUserLocation({
                    lat: position.latitude,
                    lng: position.longitude
                });
            },
            onError: (geoError) => console.warn("Watch position error:", geoError),
            options: { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
        });

        const pingInterval = setInterval(async () => {
            const currentLoc = userLocationRef.current;
            if (currentLoc && currentLoc.lat && currentLoc.lng) {
                try {
                    const res = await pingLocation(currentLoc.lat, currentLoc.lng);
                    if (res.spawned) {
                        void showAlert(`[Nhiệm vụ ẩn] Phát hiện nhiệm vụ ẩn mới: "${res.item.title}" (${res.item.rarity}) vừa xuất hiện gần bạn!`);
                        fetchActiveTasks();
                    }
                } catch (err) {
                    console.error("Lỗi ping vị trí:", err);
                }
            }
        }, 30000);

        return () => {
            if (typeof stopWatching === 'function') {
                stopWatching();
            }
            clearInterval(pingInterval);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, isGuest]);

    // Lấy vị trí khi chuyển sang tab Location
    const handleTabChange = async (tab) => {
        setActiveTab(tab);
        if (tab === 'location') {
            try {
                const position = await getCurrentPosition({
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 10000
                });

                const loc = {
                    lat: position.latitude,
                    lng: position.longitude
                };
                setUserLocation(loc);

                if (!isGuest) {
                    pingLocation(loc.lat, loc.lng)
                        .then((res) => {
                            if (res.spawned) {
                                void showAlert(`[Nhiệm vụ ẩn] Phát hiện nhiệm vụ ẩn mới: "${res.item.title}" (${res.item.rarity}) vừa xuất hiện!`);
                            }
                            fetchActiveTasks();
                        })
                        .catch((err) => console.error(err));
                }
            } catch (geoError) {
                console.warn("Lỗi lấy vị trí:", geoError);
            }
        }
    };

    // Các trang giả định (Placeholder) cho các tab chưa code
    const LocationScreen = () => (
        <div className="location-screen-full">
            <MapComponent 
                ref={mapComponentRef}
                userLocation={userLocation} 
                user={userInfo}
                stops={[]} 
                hiddenTasks={hiddenTasks} 
                onHiddenTaskClick={handleHiddenTaskClick}
                fullScreen={true}
                mapStyle={mapStyle}
                showHiddenTasks={showHiddenTasks}
            />

            {/* Overlays on top of the map */}
            <div className="map-overlay-top">
                <div className="map-title-box">
                    <h1 className="map-title-main">Hành trình</h1>
                    <div className="map-title-sub">
                        <span className="dot-blue"></span> BẢN ĐỒ TRỰC TUYẾN
                    </div>
                </div>
                <div className="map-top-actions">
                    <button className="map-circle-btn" onClick={() => setShowMapSearch(!showMapSearch)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </button>
                    <button className="map-circle-btn" onClick={() => setShowMapMenu(!showMapMenu)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                </div>
            </div>

            {/* Quick Search Overlay */}
            {showMapSearch && (
                <div className="map-search-overlay" style={{ position: 'absolute', top: '100px', left: '20px', right: '20px', background: '#fff', borderRadius: '16px', padding: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', zIndex: 20 }}>
                    <input type="text" placeholder="Tìm kiếm trên bản đồ..." style={{ width: '100%', border: 'none', outline: 'none', fontSize: '15px' }} autoFocus />
                </div>
            )}

            {/* Map Menu Overlay */}
            {showMapMenu && (
                <div className="map-menu-overlay" style={{ position: 'absolute', top: '100px', right: '20px', background: '#fff', borderRadius: '16px', padding: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '180px' }}>
                    <button onClick={() => { setMapStyle('voyager'); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', color: '#3b82f6', fontWeight: mapStyle === 'voyager' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Map size={16} /> Bản đồ gốc
                    </button>
                    <button onClick={() => { setMapStyle('satellite'); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', fontWeight: mapStyle === 'satellite' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Globe size={16} /> Bản đồ Vệ tinh
                    </button>
                    <button onClick={() => { setMapStyle('traffic'); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', fontWeight: mapStyle === 'traffic' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Activity size={16} /> Bản đồ Tối (Giao thông)
                    </button>
                    <button onClick={() => { setShowHiddenTasks(!showHiddenTasks); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', color: '#8e44ad', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={16} /> {showHiddenTasks ? 'Ẩn nhiệm vụ' : 'Hiện nhiệm vụ ẩn'}
                    </button>
                </div>
            )}

            <button className="map-my-location-btn" onClick={() => {
                mapComponentRef.current?.flyToUserLocation();
            }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
            </button>

            {/* Keep debug tool hidden in UI but available in DOM if needed */}
            <div style={{display: 'none'}}>
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
            </div>
        </div>
    );
    const FriendsScreen = () => (
        <div className="placeholder-screen">
            <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Users size={24} /> Bạn bè & Cộng đồng
            </h2>
            <p>Ghép đôi và danh sách bạn bè...</p>
        </div>
    );
    const FavoritesScreen = () => (
        <div className="placeholder-screen">
            <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Heart size={24} style={{ color: '#e74c3c' }} /> Yêu thích
            </h2>
            <p>Các địa điểm, bài đăng đã lưu...</p>
        </div>
    );
    const GuestPlaceholder = ({ title, icon }) => (
        <div className="guest-placeholder">
            <div className="guest-placeholder-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: '#636e72' }}>{icon}</div>
            <h2>{title}</h2>
            <p>
                Tính năng này yêu cầu đăng nhập. Hãy tạo tài khoản để lưu lại hành trình của riêng bạn nhé!
            </p>
            <button
                onClick={onRequireLogin}
                className="guest-login-btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
            >
                Đăng nhập ngay <Compass size={18} />
            </button>
        </div>
    );

    // Màn hình Cá nhân (Profile) - Game Style
    const ProfileScreen = () => {
        const profileName = userInfo?.full_name || 'Khách du lịch';
        const profileAvatarFallback = createInitialAvatarDataUrl(profileName);
        const TierIcon = tierMeta.icon;

        return (
        <div className="profile-screen">
            {/* === PLAYER CARD === */}
            <div className="profile-player-card">
                {/* Avatar Frame có viền game */}
                <div className="profile-avatar-frame">
                    <img
                        src={getSafeAvatarSrc(userInfo?.avatar_url, profileName)}
                        alt="Avatar"
                        className="profile-avatar"
                        onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = profileAvatarFallback;
                        }}
                    />
                    <div className="profile-level-badge">Lv.{level}</div>
                </div>
                <h3 className="profile-player-name">{profileName}</h3>
                <span className="profile-player-tier profile-tier-row">
                    <TierIcon size={13} /> {tierMeta.label}
                </span>

                {/* EXP Bar lớn */}
                <div className="profile-exp-section">
                    <div className="profile-exp-label">
                        <span className="profile-exp-title"><Star size={13} /> EXP</span>
                        <span>{currentExp}/1000</span>
                    </div>
                    <div className="profile-exp-bar">
                        <div className="profile-exp-fill" style={{ width: `${expPercentage}%` }}></div>
                    </div>
                </div>
            </div>

            {/* === STATS ROW (3 cột) === */}
            <div className="profile-stats-row">
                <div className="profile-stat-box">
                    <div className="stat-box-icon"><Coins size={18} /></div>
                    <div className="stat-box-value">{totalPoints}</div>
                    <div className="stat-box-label">Xu vàng</div>
                </div>
                <div className="profile-stat-box">
                    <div className="stat-box-icon"><Trophy size={18} /></div>
                    <div className="stat-box-value">{achievements.filter(a => a.is_unlocked).length}</div>
                    <div className="stat-box-label">Huy hiệu</div>
                </div>
                <div className="profile-stat-box">
                    <div className="stat-box-icon">
                        {userInfo?.kyc_status === 'APPROVED' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    </div>
                    <div className="stat-box-value" style={{ fontSize: '12px' }}>
                        {userInfo?.kyc_status === 'APPROVED' ? 'Đã xác minh' : 'Chưa xác minh'}
                    </div>
                    <div className="stat-box-label">Bảo mật</div>
                </div>
            </div>

            {/* === THÀNH TỰU & HUY HIỆU === */}
            <div className="achievements-card">
                <h4 className="achievements-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Trophy size={18} style={{ color: '#f1c40f' }} /> Huy hiệu thám hiểm ({achievements.filter(a => a.is_unlocked).length}/{achievements.length})
                </h4>
                
                {/* Thanh bộ lọc thành tựu */}
                <div className="achievements-filter-row">
                    {['all', 'unlocked', 'locked'].map((f) => {
                        const isActive = achFilter === f;
                        return (
                            <button
                                key={f}
                                onClick={() => setAchFilter(f)}
                                className={`achievements-filter-btn ${isActive ? 'active' : 'inactive'}`}
                            >
                                {f === 'unlocked' ? `Đã đạt (${achievements.filter(a => a.is_unlocked).length})` : f === 'locked' ? `Đang làm (${achievements.filter(a => !a.is_unlocked).length})` : 'Tất cả'}
                            </button>
                        );
                    })}
                </div>
                
                {loadingAch ? (
                    <div className="profile-loading" style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                        <Sparkles size={16} /> Đang tải thành tựu...
                    </div>
                ) : achievements.length === 0 ? (
                    <div className="profile-empty">
                        Chưa có dữ liệu thành tựu.
                    </div>
                ) : (
                    <div className="achievements-list">
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
                                    className={`achievement-item ${ach.is_unlocked ? 'unlocked' : 'locked'}`}
                                >
                                    {/* Icon Huy hiệu */}
                                    <div className={`achievement-icon ${ach.is_unlocked ? 'unlocked' : 'locked'}`}>
                                        {getAchievementIcon(ach)}
                                    </div>
                                    
                                    {/* Chi tiết thành tựu */}
                                    <div className="achievement-details">
                                        <div className="achievement-header">
                                            <strong className="achievement-name">{ach.title}</strong>
                                            <span className={`achievement-badge ${ach.is_unlocked ? 'unlocked' : 'locked'}`}>
                                                {ach.is_unlocked ? `+${ach.points_reward} điểm` : 'Đang khóa'}
                                            </span>
                                        </div>
                                        
                                        <span className="achievement-desc">{ach.description}</span>
                                        
                                        {/* Tiến trình bar */}
                                        {!ach.is_unlocked && (
                                            <div className="achievement-progress">
                                                <div className="achievement-progress-header">
                                                    <span>Tiến trình</span>
                                                    <span>{ach.current_progress}/{ach.condition_value}</span>
                                                </div>
                                                <div className="achievement-progress-bar">
                                                    <div className="achievement-progress-fill" style={{ width: `${percent}%` }}></div>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {ach.is_unlocked && ach.unlocked_at && (
                                            <span className="achievement-unlock-date" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Sparkles size={14} style={{ color: '#f1c40f' }} /> Đạt được ngày {new Date(ach.unlocked_at).toLocaleDateString('vi-VN')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* === MENU ACTIONS (style game buttons) === */}
            <div className="profile-menu-list">
                <button className="profile-menu-btn" onClick={onOpenProfileEdit}>
                    <span className="menu-btn-icon"><Settings size={18} /></span>
                    <span className="profile-menu-label">Cài đặt quyền riêng tư</span>
                    <span className="menu-btn-arrow">›</span>
                </button>
                <button className="profile-menu-btn">
                    <span className="menu-btn-icon"><HelpCircle size={18} /></span>
                    <span className="profile-menu-label">Trợ giúp và hỗ trợ</span>
                    <span className="menu-btn-arrow">›</span>
                </button>
                <button className="profile-menu-btn">
                    <span className="menu-btn-icon"><MessageCircle size={18} /></span>
                    <span className="profile-menu-label">Đóng góp ý kiến</span>
                    <span className="menu-btn-arrow">›</span>
                </button>
                <button onClick={onLogout} className="profile-menu-btn profile-logout-btn">
                    <span className="menu-btn-icon"><LogOut size={18} /></span>
                    <span className="logout-text">Đăng xuất</span>
                    <span className="menu-btn-arrow">›</span>
                </button>
            </div>
        </div>
    );
    };
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
                return isGuest ? <GuestPlaceholder title="Bản đồ & Lịch trình" icon={<MapPin size={48} />} /> : <LocationScreen />;

            case 'leaderboard':
                return <Leaderboard />;

            case 'friends':
                return isGuest ? <GuestPlaceholder title="Cộng đồng Du lịch" icon={<Users size={48} />} /> : <FriendsScreen />;

            case 'favorites':
                return isGuest ? <GuestPlaceholder title="Địa điểm Yêu thích" icon={<Heart size={48} style={{ color: '#e74c3c' }} />} /> : <FavoritesScreen />;

            case 'profile':
                return isGuest ? <GuestPlaceholder title="Hồ sơ Cá nhân" icon={<User size={48} />} /> : <ProfileScreen />;

            default:
                return <Traveltrip />;
        }
    };
 
    const userInfo = user?.user || user;
    const totalPoints = isGuest ? 0 : ((userInfo?.points_balance || 0) + (userInfo?.total_points || 0));
    const level = isGuest ? 1 : (Math.floor(totalPoints / 1000) + 1);
    const currentExp = isGuest ? 0 : (totalPoints % 1000);
    const expPercentage = (currentExp / 1000) * 100;
    const tierMeta = getTierMeta(level);
    const HudTierIcon = tierMeta.icon;

    const handleHudClick = () => {
        if (isGuest) {
            onRequireLogin();
        } else {
            if (onOpenProfileEdit) {
                onOpenProfileEdit();
            } else {
                setActiveTab('profile');
            }
        }
    };

    return (
        <div className="main-layout">
            {/* Cartoon Game HUD Bar */}
            <div className="game-hud-header" onClick={handleHudClick}>
                <div className="hud-player-info">
                    <div className="hud-avatar-wrapper">
                        <img
                            src={getSafeAvatarSrc(userInfo?.avatar_url, userInfo?.full_name)}
                            alt="Avatar"
                            className="hud-avatar-img"
                            onError={(event) => {
                                event.currentTarget.onerror = null;
                                event.currentTarget.src = createInitialAvatarDataUrl(userInfo?.full_name);
                            }}
                        />
                        <div className="hud-level-badge">{level}</div>
                    </div>
                    <div className="hud-name-container">
                        <span className="hud-player-name">{isGuest ? 'Khách chơi' : (userInfo?.full_name || 'Chiến binh')}</span>
                        <span className="hud-player-tier hud-tier-row">
                            <HudTierIcon size={11} /> {tierMeta.shortLabel}
                        </span>
                    </div>
                </div>

                <div className="hud-stats-group">
                    {/* Coin Counter Pill */}
                    <div className="hud-stat-pill coin-pill" title="Xu vàng tích lũy">
                        <div className="pill-icon"><Coins size={15} /></div>
                        <div className="pill-value">{totalPoints}</div>
                    </div>

                    {/* EXP Counter Pill */}
                    <div className="hud-stat-pill exp-pill" title="Kinh nghiệm cấp">
                        <div className="pill-icon"><Star size={15} /></div>
                        <div className="pill-value-container">
                            <div className="pill-value">{currentExp}/1000</div>
                            <div className="hud-exp-progress-bar">
                                <div className="hud-exp-progress-fill" style={{ width: `${expPercentage}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Vùng hiển thị nội dung của từng tab */}
            <div className="content-area">
                {renderContent()}
            </div>

            {/* Thanh menu dưới đáy */}
            <div className="bottom-nav">
                <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => handleTabChange('home')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                </div>

                <div className={`nav-item ${activeTab === 'location' ? 'active' : ''}`} onClick={() => handleTabChange('location')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill={activeTab === 'location' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </div>

                <div className={`nav-item ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => handleTabChange('friends')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>

                <div className={`nav-item ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => handleTabChange('leaderboard')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                        <path d="M4 22h16"></path>
                        <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path>
                        <path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"></path>
                    </svg>
                </div>

                <div className={`nav-item ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => handleTabChange('favorites')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                </div>

                <div className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => handleTabChange('profile')}>
                    <svg className="nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
                    </svg>
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
                        void showAlert(`Chúc mừng! Bạn nhận được +${rewards.reward_exp} EXP và +${rewards.reward_coin} Coin!`);
                        fetchActiveTasks();
                    }}
                />
            )}

            {showQuestModal && selectedTask && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content">
                        <div className="quest-modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={20} style={{ color: '#8e44ad' }} /> {selectedTask.title || 'Sự kiện Doanh nghiệp'}</h3>
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
                                    
                                    <div className="quest-meta-info" style={{ display: 'flex', gap: '15px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Bán kính: {selectedTask.radius_meters}m</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Award size={14} style={{ color: '#f1c40f' }} /> Thưởng: {selectedTask.reward_exp} EXP | <Coins size={14} style={{ color: '#f1c40f', marginLeft: '4px' }} /> {selectedTask.reward_coin} Coin</span>
                                    </div>

                                    {/* 1. CHECKIN QUEST */}
                                    {selectedTask.quest_type === 'CHECKIN' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} /> Hệ thống sẽ xác thực vị trí GPS của bạn so với địa điểm sự kiện.</p>
                                            <button 
                                                className="quest-action-btn"
                                                onClick={() => handleVerifyQuest()}
                                                disabled={questLoading}
                                            >
                                                {questLoading ? 'Đang xác thực...' : 'Đăng ký Check-in ngay'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 2. QR QUEST */}
                                    {selectedTask.quest_type === 'QR' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><QrCode size={16} /> Vui lòng nhập mã token nhận được từ doanh nghiệp hoặc quét QR:</p>
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
                                                {questLoading ? 'Đang xác thực...' : 'Xác nhận mã QR'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 3. QUIZ QUEST */}
                                    {selectedTask.quest_type === 'QUIZ' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><HelpCircle size={16} /> Trả lời câu hỏi trắc nghiệm dưới đây:</p>
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
                                                onClick={() => handleVerifyQuest({ answer: quizAnswer, correct_answer: 'A' })}
                                                disabled={questLoading || !quizAnswer}
                                                className="quest-action-btn with-top-margin"
                                            >
                                                {questLoading ? 'Đang gửi đáp án...' : 'Nộp đáp án'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 4. PHOTO QUEST */}
                                    {selectedTask.quest_type === 'PHOTO' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Camera size={16} /> Chụp ảnh hiện vật hoặc biển hiệu để xác nhận sự hiện diện:</p>
                                            
                                            {photoUploaded ? (
                                                <div className="photo-preview-box">
                                                    <img src={photoUrl} alt="Preview checkin" />
                                                    <button className="photo-reset" onClick={() => { setPhotoUploaded(false); setPhotoUrl(''); }}>✕ Xóa ảnh</button>
                                                </div>
                                            ) : (
                                                <div className="photo-upload-placeholder" onClick={() => {
                                                    setPhotoUrl("/assets/island/map-dao.png");
                                                    setPhotoUploaded(true);
                                                }}>
                                                    <span className="photo-camera-icon" style={{ display: 'flex', justifyContent: 'center' }}><Camera size={28} /></span>
                                                    <span>Chạm để tải lên / Chụp ảnh check-in</span>
                                                    <small className="photo-helper-text">(Mô phỏng tự động chọn ảnh chất lượng cao)</small>
                                                </div>
                                            )}

                                            <button 
                                                onClick={() => handleVerifyQuest({ image_url: photoUrl })}
                                                disabled={questLoading || !photoUploaded}
                                                className="quest-action-btn with-top-margin"
                                            >
                                                {questLoading ? 'Đang xác thực ảnh...' : 'Xác nhận ảnh chụp'}
                                            </button>
                                        </div>
                                    )}

                                    {questError && (
                                        <div className="quest-error-msg" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <AlertTriangle size={16} /> Lỗi: {questError}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="quest-success-screen">
                                    <div className="success-icon" style={{ display: 'flex', justifyContent: 'center', color: '#2ecc71', marginBottom: '10px' }}><CheckCircle2 size={48} /></div>
                                    <h4>Thử thách hoàn thành!</h4>
                                    <p>Chúc mừng bạn đã hoàn thành nhiệm vụ và nhận được phần thưởng:</p>
                                    
                                    <div className="success-reward-card">
                                        <div className="success-reward-item">
                                            <span className="success-reward-icon" style={{ display: 'inline-flex', alignItems: 'center' }}><Sparkles size={16} style={{ color: '#e67e22' }} /></span>
                                            <span><strong>+{questSuccess.reward_exp}</strong> EXP</span>
                                        </div>
                                        <div className="success-reward-item">
                                            <span className="success-reward-icon" style={{ display: 'inline-flex', alignItems: 'center' }}><Coins size={16} style={{ color: '#f1c40f' }} /></span>
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
