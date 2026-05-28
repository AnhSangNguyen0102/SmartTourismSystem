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
    AlertTriangle,
    ShieldAlert,
    Clock
} from 'lucide-react';
import './MainTabs.css';

// Tạm thời import file trang chủ cũ của bạn vào Tab 1
import Traveltrip from '../screens/Travel_trip';
import MapComponent from './Map/MapComponent';
import Leaderboard from './Leaderboard';
import SocialFeedScreen from './SocialFeedScreen';
import FindCompanionsScreen from './FindCompanionsScreen';
import ChatScreen from './ChatScreen';

// Import services and components for Hidden Quests
import { getActiveTasks, pingLocation, verifyQuest, getActiveCampaigns, verifyCampaign } from '../services/hiddenQuestService';
import { useSocialQuest } from './SocialQuest/SocialQuestProvider';
import ChestOpeningAnimation from './HiddenQuest/ChestOpeningAnimation';
import HiddenQuestDebug from './HiddenQuest/HiddenQuestDebug';
import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';
import { showAlert, showConfirm } from '../platform/dialog';
import { getCurrentPosition, startWatchingPosition } from '../platform/location';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../utils/avatar';
import { isBgmEnabled, isSfxEnabled, setBgmEnabled, setSfxEnabled, getBgmVolume, setBgmVolume } from '../utils/soundUtils';

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

const MainTabs = ({ user, isGuest, onLogout, onRequireLogin, onOpenPlan, onOpenLocationRegister, onOpenProfileEdit, onOpenHistory, onOpenTripDetail, onOpenAdminModeration }) => {
    const { sendLocation } = useSocialQuest();
    // State quản lý tab đang hiển thị
    const [activeTab, setActiveTab] = useState('home');
    const [userLocation, setUserLocation] = useState(null);
    
    // State quản lý Thành tựu
    const [achievements, setAchievements] = useState([]);
    const [achFilter, setAchFilter] = useState('all'); // 'all', 'unlocked', 'locked'

    // Map search, weather, and style states have been relocated to LocationScreen component

    // States for Rewards Shop & Quests
    const [rewardsTab, setRewardsTab] = useState('badges'); // 'badges', 'quests', 'shop'
    const [rewardsData, setRewardsData] = useState({ badges: [], vouchers: [], quests: [] });
    const [loadingRewards, setLoadingRewards] = useState(false);
    const [localPointsBalance, setLocalPointsBalance] = useState(null);
    const [showRedeemSuccessModal, setShowRedeemSuccessModal] = useState(false);
    const [redeemedVoucherInfo, setRedeemedVoucherInfo] = useState(null);

    const userInfo = user?.user || user;
    const pointsBalance = localPointsBalance !== null ? localPointsBalance : (userInfo?.points_balance || 0);
    const totalPoints = isGuest ? 0 : (pointsBalance + (userInfo?.total_points || 0));
    const level = isGuest ? 1 : (Math.floor(totalPoints / 1000) + 1);
    const currentExp = isGuest ? 0 : (totalPoints % 1000);
    const expPercentage = (currentExp / 1000) * 100;
    const tierMeta = getTierMeta(level);
    const HudTierIcon = tierMeta.icon;

    const fetchRewards = async () => {
        if (isGuest) return;
        setLoadingRewards(true);
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/rewards`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRewardsData(data);
                if (data.badges) {
                    setAchievements(data.badges);
                }
            }
        } catch (error) {
            console.error("Lỗi khi tải phần thưởng & nhiệm vụ:", error);
        } finally {
            setLoadingRewards(false);
        }
    };

    // Weather and search fetching logic moved to LocationScreen component

    const handleRedeemVoucher = async (voucher) => {
        const confirmRedeem = await showConfirm(`Bạn có chắc chắn muốn dùng ${voucher.cost} xu để đổi lấy voucher "${voucher.discount}" không?`);
        if (!confirmRedeem) return;

        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/redeem-voucher/${voucher.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    setLocalPointsBalance(data.points_balance);
                    setRedeemedVoucherInfo({
                        code: data.code,
                        brand: voucher.brand,
                        title: voucher.discount
                    });
                    setShowRedeemSuccessModal(true);
                    fetchRewards();
                } else {
                    await showAlert(data.message || "Đổi quà thất bại.");
                }
            } else {
                const errData = await res.json();
                await showAlert(errData.detail || "Đổi quà thất bại.");
            }
        } catch (error) {
            console.error("Lỗi khi đổi voucher:", error);
            await showAlert("Có lỗi kết nối hệ thống. Vui lòng thử lại!");
        }
    };

    // Map side-effects moved to LocationScreen component

    useEffect(() => {
        if (activeTab === 'profile') {
            fetchRewards();
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

    // States for Public Campaigns
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [showCampaignModal, setShowCampaignModal] = useState(false);

    // Fetch active campaigns list
    const fetchActiveCampaigns = async () => {
        if (isGuest) return;
        try {
            const activeCampaigns = await getActiveCampaigns();
            setCampaigns(activeCampaigns);
        } catch (err) {
            console.error("Lỗi lấy danh sách chiến dịch hoạt động:", err);
        }
    };

    // Verify / Complete campaign endpoint trigger
    const handleVerifyCampaign = async (extraData = {}) => {
        if (!selectedCampaign || !userLocation) {
            setQuestError("Không xác định được vị trí GPS hiện tại!");
            return;
        }
        setQuestLoading(true);
        setQuestError('');
        try {
            const res = await verifyCampaign(
                selectedCampaign.event_id,
                userLocation.lat,
                userLocation.lng,
                selectedCampaign.quest_type,
                extraData
            );
            setQuestSuccess(res);
            fetchActiveCampaigns();
        } catch (err) {
            setQuestError(err.message || "Xác thực thất bại");
        } finally {
            setQuestLoading(false);
        }
    };

    const handleCampaignClick = (campaign) => {
        setSelectedCampaign(campaign);
        setShowCampaignModal(true);
    };

    const userLocationRef = useRef(userLocation);
    // Map component states and ref moved to LocationScreen component
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

    // Lắng nghe chiến dịch mới toàn cục
    useEffect(() => {
        if (isGuest) return;

        const handleNewCampaignEvent = (event) => {
            const data = event.detail;
            void showAlert(`[Chiến dịch mới] "${data.title}" vừa được tạo gần bạn! Hãy mở Bản đồ để check-in và nhận quà nhé!`);
            fetchActiveCampaigns();
        };

        window.addEventListener('new_campaign', handleNewCampaignEvent);
        return () => {
            window.removeEventListener('new_campaign', handleNewCampaignEvent);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGuest]);

    // Geolocation watching and periodic spawn pinging (every 30s)
    useEffect(() => {
        if (isGuest || activeTab !== 'location') return;

        // Initial fetch of active items on tab switch
        fetchActiveTasks();
        fetchActiveCampaigns();

        const stopWatching = startWatchingPosition({
            onSuccess: (position) => {
                const loc = {
                    lat: position.latitude,
                    lng: position.longitude
                };
                setUserLocation(loc);
                sendLocation(loc.lat, loc.lng);
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
                sendLocation(loc.lat, loc.lng);

                if (!isGuest) {
                    fetchActiveCampaigns();
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
                return isGuest ? <GuestPlaceholder title="Bản đồ & Lịch trình" icon={<MapPin size={48} />} onRequireLogin={onRequireLogin} /> : (
                    <LocationScreen
                        userLocation={userLocation}
                        userInfo={userInfo}
                        hiddenTasks={hiddenTasks}
                        handleHiddenTaskClick={handleHiddenTaskClick}
                        campaigns={campaigns}
                        onCampaignClick={handleCampaignClick}
                        isGuest={isGuest}
                        fetchActiveTasks={fetchActiveTasks}
                        onTestClaim={(testTask) => {
                            setSelectedTask(testTask);
                            setShowChestAnimation(true);
                        }}
                    />
                );

            case 'leaderboard':
                return <Leaderboard />;

            case 'friends':
                return isGuest ? <GuestPlaceholder title="Cộng đồng Du lịch" icon={<Users size={48} />} onRequireLogin={onRequireLogin} /> : (
                    <FriendsScreen
                        userInfo={userInfo}
                        onRequireLogin={onRequireLogin}
                        setActiveTab={setActiveTab}
                    />
                );

            case 'favorites':
                return isGuest ? <GuestPlaceholder title="Địa điểm Yêu thích" icon={<Heart size={48} style={{ color: '#e74c3c' }} />} onRequireLogin={onRequireLogin} /> : <FavoritesScreen />;

            case 'profile':
                return isGuest ? <GuestPlaceholder title="Hồ sơ Cá nhân" icon={<User size={48} />} onRequireLogin={onRequireLogin} /> : (
                    <ProfileScreen
                        userInfo={userInfo}
                        level={level}
                        tierMeta={tierMeta}
                        expPercentage={expPercentage}
                        currentExp={currentExp}
                        pointsBalance={pointsBalance}
                        achievements={achievements}
                        achFilter={achFilter}
                        setAchFilter={setAchFilter}
                        loadingRewards={loadingRewards}
                        rewardsTab={rewardsTab}
                        setRewardsTab={setRewardsTab}
                        rewardsData={rewardsData}
                        handleRedeemVoucher={handleRedeemVoucher}
                        onOpenAdminModeration={onOpenAdminModeration}
                        onOpenHistory={onOpenHistory}
                        onOpenProfileEdit={onOpenProfileEdit}
                        onLogout={onLogout}
                    />
                );

            default:
                return <Traveltrip />;
        }
    };


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

            {/* --- Campaign Overlays --- */}
            {showCampaignModal && selectedCampaign && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content">
                        <div className="quest-modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={20} style={{ color: '#e67e22' }} /> {selectedCampaign.title || 'Chiến dịch Doanh nghiệp'}</h3>
                            <button className="quest-close-btn" onClick={() => {
                                setShowCampaignModal(false);
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
                                    <p className="quest-desc">{selectedCampaign.description || 'Hoàn thành thử thách để nhận quà từ doanh nghiệp.'}</p>
                                    
                                    <div className="quest-meta-info" style={{ display: 'flex', gap: '15px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Bán kính: {selectedCampaign.radius_meters}m</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Award size={14} style={{ color: '#f1c40f' }} /> Thưởng: {selectedCampaign.reward_exp} EXP | <Coins size={14} style={{ color: '#f1c40f', marginLeft: '4px' }} /> {selectedCampaign.reward_coin} Coin</span>
                                    </div>

                                    {/* 1. CHECKIN QUEST */}
                                    {selectedCampaign.quest_type === 'CHECKIN' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} /> Hệ thống sẽ xác thực vị trí GPS của bạn so với địa điểm chiến dịch.</p>
                                            <button 
                                                className="quest-action-btn"
                                                onClick={() => handleVerifyCampaign()}
                                                disabled={questLoading}
                                                type="button"
                                            >
                                                {questLoading ? 'Đang xác thực...' : 'Đăng ký Check-in ngay'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 2. QR QUEST */}
                                    {selectedCampaign.quest_type === 'QR' && (
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
                                                onClick={() => handleVerifyCampaign({ qr_token: qrTokenInput })}
                                                disabled={questLoading || !qrTokenInput.trim()}
                                                type="button"
                                            >
                                                {questLoading ? 'Đang xác thực...' : 'Xác nhận mã QR'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 3. QUIZ QUEST */}
                                    {selectedCampaign.quest_type === 'QUIZ' && (
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
                                                        type="button"
                                                    >
                                                        <span className="option-code">{opt.code}</span>
                                                        <span className="option-text">{opt.text}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <button 
                                                onClick={() => handleVerifyCampaign({ answer: quizAnswer, correct_answer: 'A' })}
                                                disabled={questLoading || !quizAnswer}
                                                className="quest-action-btn with-top-margin"
                                                type="button"
                                            >
                                                {questLoading ? 'Đang gửi đáp án...' : 'Nộp đáp án'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 4. PHOTO QUEST */}
                                    {selectedCampaign.quest_type === 'PHOTO' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Camera size={16} /> Chụp ảnh hiện vật hoặc biển hiệu để xác nhận sự hiện diện:</p>
                                            
                                            {photoUploaded ? (
                                                <div className="photo-preview-box">
                                                    <img src={photoUrl} alt="Preview checkin" />
                                                    <button className="photo-reset" onClick={() => { setPhotoUploaded(false); setPhotoUrl(''); }} type="button">✕ Xóa ảnh</button>
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
                                                onClick={() => handleVerifyCampaign({ image_url: photoUrl })}
                                                disabled={questLoading || !photoUploaded}
                                                className="quest-action-btn with-top-margin"
                                                type="button"
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
                                    <h4>Chiến dịch hoàn thành!</h4>
                                    <p>Chúc mừng bạn đã hoàn thành thử thách và nhận được phần thưởng:</p>
                                    
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
                                            setShowCampaignModal(false);
                                            setQuestSuccess(null);
                                            setQrTokenInput('');
                                            setQuizAnswer('');
                                            setPhotoUploaded(false);
                                            setPhotoUrl('');
                                        }}
                                        type="button"
                                    >
                                        Tuyệt vời! Tiếp tục hành trình
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- Redeem Voucher Success Modal --- */}
            {showRedeemSuccessModal && redeemedVoucherInfo && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content" style={{ textAlign: 'center', maxWidth: '400px' }}>
                        <div className="quest-modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={20} style={{ color: '#ffd32d' }} /> Đổi voucher thành công!</h3>
                            <button className="quest-close-btn" onClick={() => setShowRedeemSuccessModal(false)}>✕</button>
                        </div>
                        <div className="quest-modal-body" style={{ padding: '20px' }}>
                            <div style={{ fontSize: '50px', marginBottom: '15px' }}>🎉</div>
                            <h4 style={{ fontSize: '18px', fontWeight: 'bold', color: '#2c3e50', marginBottom: '10px' }}>
                                {redeemedVoucherInfo.brand}
                            </h4>
                            <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#2ecc71', marginBottom: '15px' }}>
                                {redeemedVoucherInfo.title}
                            </p>
                            <p style={{ fontSize: '13px', color: '#747d8c', marginBottom: '10px' }}>
                                Mã ưu đãi của bạn là:
                            </p>
                            <div style={{
                                background: '#ffd32d',
                                border: '3.5px solid #2c3e50',
                                borderRadius: '12px',
                                padding: '10px 20px',
                                fontSize: '20px',
                                fontWeight: '900',
                                color: '#2c3e50',
                                letterSpacing: '1px',
                                display: 'inline-block',
                                marginBottom: '20px',
                                boxShadow: '0 4px 0 #2c3e50'
                            }}>
                                {redeemedVoucherInfo.code}
                            </div>
                            <p style={{ fontSize: '11px', color: '#95a5a6' }}>
                                *Vui lòng chụp màn hình hoặc sao chép mã trên để sử dụng trực tiếp tại cửa hàng.
                            </p>
                            <button 
                                className="quest-close-success-btn"
                                onClick={() => setShowRedeemSuccessModal(false)}
                                style={{ width: '100%', marginTop: '15px' }}
                            >
                                Tuyệt vời!
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const getWeatherEmoji = (code) => {
    if (code === 0) return '☀️';
    if (code >= 1 && code <= 3) return '🌤️';
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 55) return '🌦️';
    if (code >= 61 && code <= 65) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌧️';
    if (code >= 95 && code <= 99) return '⛈️';
    return '🌡️';
};

const GuestPlaceholder = ({ title, icon, onRequireLogin }) => (
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

const LocationScreen = ({
    userLocation,
    userInfo,
    hiddenTasks,
    handleHiddenTaskClick,
    campaigns = [],
    onCampaignClick = null,
    isGuest,
    fetchActiveTasks,
    onTestClaim
}) => {
    const mapComponentRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [weatherInfo, setWeatherInfo] = useState(null);
    const [showMapSearch, setShowMapSearch] = useState(false);
    const [showMapMenu, setShowMapMenu] = useState(false);
    const [mapStyle, setMapStyle] = useState('voyager');
    const [showHiddenTasks, setShowHiddenTasks] = useState(true);

    const fetchWeather = async (lat, lon) => {
        try {
            const res = await fetch(`${API_BASE}/api/discovery/weather?lat=${lat}&lon=${lon}`);
            if (res.ok) {
                const data = await res.json();
                setWeatherInfo(data);
            }
        } catch (err) {
            console.error("Weather fetch failed", err);
        }
    };

    const fetchSearchResults = async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        setSearchLoading(true);
        try {
            const coordsParam = userLocation ? `&lat=${userLocation.lat}&lon=${userLocation.lng}` : '';
            const res = await fetch(`${API_BASE}/api/discovery/geocode/search?q=${encodeURIComponent(query)}${coordsParam}`);
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data);
            }
        } catch (err) {
            console.error("Geocoding search failed", err);
        } finally {
            setSearchLoading(false);
        }
    };

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (searchQuery.trim()) {
                fetchSearchResults(searchQuery);
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    useEffect(() => {
        if (userLocation?.lat && userLocation?.lng) {
            fetchWeather(userLocation.lat, userLocation.lng);
        }
    }, [userLocation]);

    return (
        <div className="location-screen-full">
            <MapComponent 
                ref={mapComponentRef}
                userLocation={userLocation} 
                user={userInfo}
                stops={[]} 
                hiddenTasks={hiddenTasks} 
                onHiddenTaskClick={handleHiddenTaskClick}
                campaigns={campaigns}
                onCampaignClick={onCampaignClick}
                fullScreen={true}
                mapStyle={mapStyle}
                showHiddenTasks={showHiddenTasks}
            />

            {/* Overlays on top of the map */}
            <div className="map-overlay-top" style={{ alignItems: 'center' }}>
                <div className="map-title-box">
                    <h1 className="map-title-main">Hành trình</h1>
                    <div className="map-title-sub">
                        <span className="dot-blue"></span> BẢN ĐỒ TRỰC TUYẾN
                    </div>
                </div>
                <div className="map-top-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {weatherInfo && (
                        <div className="weather-hud-pill" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#ffffff',
                            border: '2.5px solid #2c3e50',
                            borderRadius: '20px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: '#2c3e50',
                            boxShadow: '0 3px 0 #2c3e50',
                        }} title={`Thời tiết: ${weatherInfo.condition || 'Bình thường'}`}>
                            <span>{getWeatherEmoji(weatherInfo.weathercode)}</span>
                            <span>{Math.round(weatherInfo.temp)}°C</span>
                        </div>
                    )}
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
                <div className="map-search-overlay" style={{
                    position: 'absolute',
                    top: '150px',
                    left: '20px',
                    right: '20px',
                    background: '#fff',
                    border: '3px solid #2c3e50',
                    borderRadius: '16px',
                    padding: '12px',
                    boxShadow: '0 5px 0 #2c3e50',
                    zIndex: 20
                }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Gõ địa điểm tìm kiếm..."
                            style={{
                                flex: 1,
                                border: '2.5px solid #2c3e50',
                                borderRadius: '10px',
                                padding: '8px 12px',
                                outline: 'none',
                                fontSize: '14px',
                                fontWeight: 'bold'
                            }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        <button
                            onClick={() => fetchSearchResults(searchQuery)}
                            style={{
                                background: '#ffd32d',
                                border: '2.5px solid #2c3e50',
                                borderRadius: '10px',
                                padding: '8px 14px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                boxShadow: '0 3px 0 #2c3e50'
                            }}
                        >
                            Tìm
                        </button>
                    </div>
                    
                    {/* Search results list */}
                    {(searchResults.length > 0 || searchLoading) && (
                        <div style={{
                            marginTop: '10px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                        }}>
                            {searchLoading ? (
                                <div style={{ textAlign: 'center', padding: '10px', fontWeight: 'bold', color: '#7f8c8d' }}>Đang tìm kiếm...</div>
                            ) : (
                                searchResults.map((item) => (
                                    <div
                                        key={item.place_id}
                                        onClick={() => {
                                            if (item.lat && item.lon) {
                                                mapComponentRef.current?.flyToLocation(item.lat, item.lon, item.display_name.split(',')[0]);
                                                setShowMapSearch(false);
                                                setSearchResults([]);
                                            }
                                        }}
                                        style={{
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            border: '1.5px solid #e2e8f0',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#2c3e50',
                                            backgroundColor: '#f8fafc',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffd32d'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                    >
                                        📍 {item.display_name}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Map Menu Overlay */}
            {showMapMenu && (
                <div className="map-menu-overlay" style={{ position: 'absolute', top: '150px', right: '20px', background: '#fff', borderRadius: '16px', padding: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '180px' }}>
                    <button onClick={() => { setMapStyle('voyager'); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', color: '#3b82f6', fontWeight: mapStyle === 'voyager' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Map size={16} /> Bản đồ game
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
                        onTestClaim={onTestClaim}
                    />
                )}
            </div>
        </div>
    );
};

const FriendsScreen = ({
    userInfo,
    onRequireLogin,
    setActiveTab
}) => {
    const [friendsTab, setFriendsTab] = useState('feed'); // 'feed', 'matching', 'chat'

    return (
        <div className="friends-screen-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Internal sub-navigation tabs */}
            <div className="friends-sub-tabs" style={{ display: 'flex', borderBottom: '2.5px solid #2c3e50', backgroundColor: '#ffffff', padding: '8px 16px', gap: '8px', zIndex: 10 }}>
                <button 
                    onClick={() => setFriendsTab('feed')}
                    style={{
                        flex: 1,
                        padding: '8px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        border: '2.5px solid #2c3e50',
                        borderRadius: '12px',
                        backgroundColor: friendsTab === 'feed' ? '#ffd32d' : '#ffffff',
                        cursor: 'pointer',
                        boxShadow: friendsTab === 'feed' ? 'none' : '0 3px 0 #2c3e50',
                        transform: friendsTab === 'feed' ? 'translateY(3px)' : 'none'
                    }}
                >
                    Bản Tin
                </button>
                <button 
                    onClick={() => setFriendsTab('matching')}
                    style={{
                        flex: 1,
                        padding: '8px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        border: '2.5px solid #2c3e50',
                        borderRadius: '12px',
                        backgroundColor: friendsTab === 'matching' ? '#ffd32d' : '#ffffff',
                        cursor: 'pointer',
                        boxShadow: friendsTab === 'matching' ? 'none' : '0 3px 0 #2c3e50',
                        transform: friendsTab === 'matching' ? 'translateY(3px)' : 'none'
                    }}
                >
                    Ghép Đôi
                </button>
                <button 
                    onClick={() => setFriendsTab('chat')}
                    style={{
                        flex: 1,
                        padding: '8px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        border: '2.5px solid #2c3e50',
                        borderRadius: '12px',
                        backgroundColor: friendsTab === 'chat' ? '#ffd32d' : '#ffffff',
                        cursor: 'pointer',
                        boxShadow: friendsTab === 'chat' ? 'none' : '0 3px 0 #2c3e50',
                        transform: friendsTab === 'chat' ? 'translateY(3px)' : 'none'
                    }}
                >
                    Trò Chuyện
                </button>
            </div>

            <div className="friends-screen-content" style={{ flex: 1, overflowY: 'auto' }}>
                {friendsTab === 'feed' && (
                    <SocialFeedScreen 
                        user={userInfo} 
                        onRequireLogin={onRequireLogin} 
                        onOpenProfile={() => setActiveTab('profile')} 
                    />
                )}
                {friendsTab === 'matching' && (
                    <FindCompanionsScreen 
                        user={userInfo} 
                        onRequireLogin={onRequireLogin} 
                    />
                )}
                {friendsTab === 'chat' && (
                    <ChatScreen 
                        user={userInfo} 
                        onRequireLogin={onRequireLogin} 
                    />
                )}
            </div>
        </div>
    );
};

const FavoritesScreen = () => {
    const [savedList, setSavedList] = useState([]);
    const [loadingSaved, setLoadingSaved] = useState(true);

    const fetchSavedPosts = async () => {
        setLoadingSaved(true);
        try {
            const token = await storageGet('access_token');
            if (!token) return;
            const res = await fetch(`${API_BASE}/api/social/saved-posts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSavedList(data);
            }
        } catch (error) {
            console.error('Error fetching saved posts:', error);
        } finally {
            setLoadingSaved(false);
        }
    };

    useEffect(() => {
        fetchSavedPosts();
    }, []);

    return (
        <div className="favorites-screen-wrapper" style={{ padding: '16px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '950', color: '#2c3e50', marginBottom: '16px', textShadow: '1.5px 1.5px 0 #fff' }}>Yêu Thích Đã Lưu</h2>
            {loadingSaved ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="loader-hud" style={{ margin: '0 auto 12px' }}></div>
                    <p style={{ fontWeight: 'bold', color: '#747d8c' }}>Đang tải danh mục đã lưu...</p>
                </div>
            ) : savedList.length === 0 ? (
                <div className="cartoon-card" style={{ padding: '32px', textAlign: 'center', backgroundColor: '#ffffff', color: '#747d8c', fontWeight: 'bold' }}>
                    <Heart size={48} style={{ color: '#ff4757', marginBottom: '12px' }} />
                    <p>Danh sách trống!</p>
                    <p style={{ fontSize: '11px', fontWeight: 'normal', marginTop: '4px' }}>Hãy lưu các địa điểm và bài đăng thú vị để xem lại tại đây.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '80px' }}>
                    {savedList.map(post => (
                        <div key={post.post_id} className="cartoon-card" style={{ padding: '16px', backgroundColor: '#ffffff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <img 
                                    src={post.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.profiles?.full_name}`} 
                                    alt="avatar" 
                                    style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid #2c3e50' }} 
                                />
                                <div>
                                    <h4 style={{ fontSize: '12px', fontWeight: '800', color: '#2c3e50' }}>{post.profiles?.full_name}</h4>
                                    {post.location_name && (
                                        <span style={{ fontSize: '9px', color: '#747d8c', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                            <MapPin size={8} /> {post.location_name}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <p style={{ fontSize: '12px', fontWeight: '600', color: '#2c3e50', lineHeight: '1.4' }}>{post.caption}</p>
                            {post.image_url && (
                                <img 
                                    src={post.image_url.includes('|') ? post.image_url.split('|')[0] : (post.image_url.startsWith('data:image') ? post.image_url : post.image_url.split(',')[0])} 
                                    alt="preview" 
                                    style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '12px', border: '2px solid #2c3e50', marginTop: '10px' }} 
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ProfileScreen = ({
    userInfo,
    level,
    tierMeta,
    expPercentage,
    currentExp,
    pointsBalance,
    achievements,
    achFilter,
    setAchFilter,
    loadingRewards,
    rewardsTab,
    setRewardsTab,
    rewardsData,
    handleRedeemVoucher,
    onOpenAdminModeration,
    onOpenHistory,
    onOpenProfileEdit,
    onLogout
}) => {
    const profileName = userInfo?.full_name || 'Khách du lịch';
    const profileAvatarFallback = createInitialAvatarDataUrl(profileName);
    const TierIcon = tierMeta.icon;

    const [bgmOn, setBgmOn] = useState(isBgmEnabled());
    const [sfxOn, setSfxOn] = useState(isSfxEnabled());
    const [bgmVol, setBgmVol] = useState(getBgmVolume());
    
    useEffect(() => {
        const syncAudioSettings = () => {
            setBgmOn(isBgmEnabled());
            setSfxOn(isSfxEnabled());
            setBgmVol(getBgmVolume());
        };
        window.addEventListener('audioSettingsChanged', syncAudioSettings);
        return () => window.removeEventListener('audioSettingsChanged', syncAudioSettings);
    }, []);

    const toggleBgm = () => {
        const newState = !bgmOn;
        setBgmEnabled(newState);
        setBgmOn(newState);
        window.dispatchEvent(new Event('audioSettingsChanged'));
    };

    const toggleSfx = () => {
        const newState = !sfxOn;
        setSfxEnabled(newState);
        setSfxOn(newState);
    };

    const handleVolumeChange = (e) => {
        const val = parseFloat(e.target.value);
        setBgmVol(val);
        setBgmVolume(val);
    };

    return (
        <div className="profile-screen">
            <div className="profile-player-card">
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

            <div className="profile-stats-row">
                <div className="profile-stat-box">
                    <div className="stat-box-icon"><Coins size={18} /></div>
                    <div className="stat-box-value">{pointsBalance}</div>
                    <div className="stat-box-label">Xu vàng</div>
                </div>
                <div className="profile-stat-box">
                    <div className="stat-box-icon"><Trophy size={18} /></div>
                    <div className="stat-box-value">{achievements.filter(a => a.unlocked).length}</div>
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

            <div className="achievements-card">
                <div style={{
                    display: 'flex',
                    borderBottom: '3.5px solid #2c3e50',
                    marginBottom: '15px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '14px 14px 0 0',
                    overflow: 'hidden'
                }}>
                    {[
                        { id: 'badges', label: '🏆 Huy hiệu' },
                        { id: 'quests', label: '⚡ Nhiệm vụ' },
                        { id: 'shop', label: '🎁 Cửa hàng' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setRewardsTab(tab.id)}
                            style={{
                                flex: 1,
                                padding: '12px 8px',
                                fontWeight: 'bold',
                                fontSize: '13px',
                                border: 'none',
                                borderRight: tab.id !== 'shop' ? '2.5px solid #2c3e50' : 'none',
                                backgroundColor: rewardsTab === tab.id ? '#ffd32d' : 'transparent',
                                color: '#2c3e50',
                                cursor: 'pointer',
                                transition: 'all 0.1s ease',
                                outline: 'none'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {rewardsTab === 'badges' && (
                    <>
                        <h4 className="achievements-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 10px 0' }}>
                            <Trophy size={18} style={{ color: '#f1c40f' }} /> Huy hiệu thám hiểm ({achievements.filter(a => a.unlocked).length}/{achievements.length})
                        </h4>
                        
                        <div className="achievements-filter-row">
                            {['all', 'unlocked', 'locked'].map((f) => {
                                const isActive = achFilter === f;
                                return (
                                    <button
                                        key={f}
                                        onClick={() => setAchFilter(f)}
                                        className={`achievements-filter-btn ${isActive ? 'active' : 'inactive'}`}
                                    >
                                        {f === 'unlocked' ? `Đã đạt (${achievements.filter(a => a.unlocked).length})` : f === 'locked' ? `Đang làm (${achievements.filter(a => !a.unlocked).length})` : 'Tất cả'}
                                    </button>
                                );
                            })}
                        </div>
                        
                        {loadingRewards ? (
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
                                        if (achFilter === 'unlocked') return ach.unlocked;
                                        if (achFilter === 'locked') return !ach.unlocked;
                                        return true;
                                    })
                                    .map((ach) => {
                                        const isUnlocked = ach.unlocked;
                                    return (
                                        <div 
                                            key={ach.id}
                                            className={`achievement-item ${isUnlocked ? 'unlocked' : 'locked'}`}
                                        >
                                            <div className={`achievement-icon ${isUnlocked ? 'unlocked' : 'locked'}`} style={{ fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {ach.icon || '🏆'}
                                            </div>
                                            
                                            <div className="achievement-details">
                                                <div className="achievement-header">
                                                    <strong className="achievement-name">{ach.name}</strong>
                                                    <span className={`achievement-badge ${isUnlocked ? 'unlocked' : 'locked'}`}>
                                                        {isUnlocked ? `+${ach.points} xu` : 'Đang khóa'}
                                                    </span>
                                                </div>
                                                <span className="achievement-desc">{ach.description}</span>
                                                <span style={{ fontSize: '11px', color: '#747d8c', display: 'block', marginTop: '2px' }}>
                                                    Yêu cầu: {ach.requirement}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {rewardsTab === 'quests' && (
                    <div className="achievements-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 className="achievements-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 10px 0' }}>
                            <Sparkles size={18} style={{ color: '#8e44ad' }} /> Nhiệm vụ thám hiểm tuần
                        </h4>
                        {loadingRewards ? (
                            <div className="profile-loading" style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                <Sparkles size={16} /> Đang tải nhiệm vụ...
                            </div>
                        ) : rewardsData.quests.length === 0 ? (
                            <div className="profile-empty">Hiện không có nhiệm vụ tuần nào.</div>
                        ) : (
                            rewardsData.quests.map((quest) => {
                                const percent = (quest.progress / quest.max) * 100;
                                const diffColors = {
                                    "Dễ": { bg: "#e8f5e9", text: "#2e7d32", border: "#c8e6c9" },
                                    "Trung bình": { bg: "#e1f5fe", text: "#039be5", border: "#b3e5fc" },
                                    "Khó": { bg: "#ffebee", text: "#c62828", border: "#ffcdd2" }
                                };
                                const styleMeta = diffColors[quest.difficulty] || diffColors["Dễ"];
                                
                                return (
                                    <div 
                                        key={quest.id}
                                        className={`achievement-item ${quest.completed ? 'unlocked' : 'locked'}`}
                                        style={{ padding: '14px', border: '2.5px solid #2c3e50', borderRadius: '14px', boxShadow: '0 4px 0 #2c3e50', marginBottom: '8px' }}
                                    >
                                        <div className="achievement-details" style={{ width: '100%' }}>
                                            <div className="achievement-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span style={{
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    backgroundColor: styleMeta.bg,
                                                    color: styleMeta.text,
                                                    border: `1.5px solid ${styleMeta.border}`
                                                }}>
                                                    Độ khó: {quest.difficulty}
                                                </span>
                                                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#ffd32d', textShadow: '1px 1px 0 #2c3e50', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                    🎁 +{quest.reward} EXP
                                                </span>
                                            </div>
                                            <strong style={{ fontSize: '14px', color: '#2c3e50', display: 'block', marginBottom: '4px' }}>{quest.title}</strong>
                                            <span style={{ fontSize: '11px', color: '#747d8c', display: 'block', marginBottom: '10px' }}>{quest.description}</span>
                                            
                                            <div className="achievement-progress">
                                                <div className="achievement-progress-header" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>
                                                    <span>Tiến độ</span>
                                                    <span>{quest.progress}/{quest.max}</span>
                                                </div>
                                                <div className="achievement-progress-bar" style={{ height: '10px', background: '#eceff1', borderRadius: '5px', overflow: 'hidden', border: '1.5px solid #2c3e50' }}>
                                                    <div className="achievement-progress-fill" style={{ height: '100%', width: `${percent}%`, background: '#2ecc71' }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {rewardsTab === 'shop' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <h4 className="achievements-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 10px 0' }}>
                            <Coins size={18} style={{ color: '#ffd32d' }} /> Cửa hàng đổi quà ưu đãi
                        </h4>
                        {loadingRewards ? (
                            <div className="profile-loading" style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                <Sparkles size={16} /> Đang tải cửa hàng...
                            </div>
                        ) : rewardsData.vouchers.length === 0 ? (
                            <div className="profile-empty">Cửa hàng hiện đang bảo trì, vui lòng quay lại sau!</div>
                        ) : (
                            rewardsData.vouchers.map((voucher) => {
                                const canAfford = pointsBalance >= voucher.cost;
                                return (
                                    <div 
                                        key={voucher.id}
                                        style={{
                                            border: '2.5px solid #2c3e50',
                                            borderRadius: '16px',
                                            padding: '12px',
                                            backgroundColor: '#ffffff',
                                            boxShadow: '0 4px 0 #2c3e50',
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <img 
                                            src={voucher.image || 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=100'} 
                                            alt={voucher.brand} 
                                            style={{
                                                width: '60px',
                                                height: '60px',
                                                borderRadius: '12px',
                                                border: '2px solid #2c3e50',
                                                objectFit: 'cover'
                                            }}
                                        />
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#747d8c', textTransform: 'uppercase' }}>{voucher.brand}</span>
                                            <strong style={{ fontSize: '13px', color: '#2c3e50' }}>{voucher.discount}</strong>
                                            <span style={{ fontSize: '11px', color: '#747d8c', marginBottom: '4px' }}>Giá trị quy đổi: <b style={{ color: '#e67e22' }}>{voucher.cost} xu</b></span>
                                            
                                            <button
                                                onClick={() => handleRedeemVoucher(voucher)}
                                                disabled={!canAfford}
                                                style={{
                                                    alignSelf: 'flex-start',
                                                    background: canAfford ? '#ffd32d' : '#bdc3c7',
                                                    border: '2.5px solid #2c3e50',
                                                    borderRadius: '8px',
                                                    padding: '4px 12px',
                                                    fontSize: '11px',
                                                    fontWeight: 'bold',
                                                    color: '#2c3e50',
                                                    cursor: canAfford ? 'pointer' : 'not-allowed',
                                                    boxShadow: canAfford ? '0 2px 0 #2c3e50' : 'none',
                                                    transform: 'none',
                                                    transition: 'all 0.1s'
                                                }}
                                            >
                                                {canAfford ? 'Đổi Quà' : 'Không đủ xu'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            <div className="achievements-card profile-settings-section" style={{ marginTop: '16px', padding: '16px', border: '2.5px solid #2c3e50', borderRadius: '16px', backgroundColor: '#ffffff', boxShadow: '0 4px 0 #2c3e50' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 16px 0', color: '#2c3e50', fontSize: '15px', fontWeight: '800' }}>
                    <Settings size={18} /> Cài đặt Trò chơi
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1.5px dashed #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <strong style={{ fontSize: '14px', color: '#2c3e50' }}>Nhạc nền (BGM)</strong>
                            <span style={{ fontSize: '11px', color: '#747d8c' }}>Phát nhạc nền khi mở app</span>
                        </div>
                        <button 
                            onClick={toggleBgm}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '20px',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                border: '2px solid #2c3e50',
                                backgroundColor: bgmOn ? '#2ed573' : '#ff4757',
                                color: '#fff',
                                cursor: 'pointer',
                                boxShadow: '0 3px 0 #2c3e50',
                                transition: 'all 0.1s'
                            }}
                        >
                            {bgmOn ? 'BẬT' : 'TẮT'}
                        </button>
                    </div>
                    {bgmOn && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#747d8c' }}>Âm lượng:</span>
                            <input 
                                type="range" 
                                min="0" max="1" step="0.05" 
                                value={bgmVol}
                                onChange={handleVolumeChange}
                                style={{ flex: 1, accentColor: '#2563eb' }}
                            />
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#2563eb', minWidth: '32px', textAlign: 'right' }}>
                                {Math.round(bgmVol * 100)}%
                            </span>
                        </div>
                    )}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <strong style={{ fontSize: '14px', color: '#2c3e50' }}>Âm thanh hiệu ứng (SFX)</strong>
                        <span style={{ fontSize: '11px', color: '#747d8c' }}>Tiếng click, nhận thưởng</span>
                    </div>
                    <button 
                        onClick={toggleSfx}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            border: '2px solid #2c3e50',
                            backgroundColor: sfxOn ? '#2ed573' : '#ff4757',
                            color: '#fff',
                            cursor: 'pointer',
                            boxShadow: '0 3px 0 #2c3e50',
                            transition: 'all 0.1s'
                        }}
                    >
                        {sfxOn ? 'BẬT' : 'TẮT'}
                    </button>
                </div>
            </div>

            <div className="profile-menu-list">
                {userInfo?.role === 'ADMIN' && (
                    <button className="profile-menu-btn profile-admin-dashboard-btn" onClick={onOpenAdminModeration}>
                        <span className="menu-btn-icon"><ShieldAlert size={18} /></span>
                        <span className="profile-menu-label">Admin Dashboard</span>
                        <span className="menu-btn-arrow">›</span>
                    </button>
                )}
                <button className="profile-menu-btn" onClick={onOpenHistory}>
                    <span className="menu-btn-icon"><Clock size={18} /></span>
                    <span className="profile-menu-label">Lịch sử hành trình</span>
                    <span className="menu-btn-arrow">›</span>
                </button>
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


export default MainTabs;
