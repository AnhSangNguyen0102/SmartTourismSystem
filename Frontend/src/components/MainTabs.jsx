// src/components/MainTabs.jsx

import React, { useState, useEffect, useRef } from 'react';
import { 
    MapPin, Users, Heart, User, Award, Trophy, 
    Coins, Star, Medal, Crown
} from 'lucide-react';

import './MainTabs.css';

// Tab 1 & Leaderboard imports
import Traveltrip from '../screens/Travel_trip';
import Leaderboard from './Leaderboard';

// Subcomponents imports
import GuestPlaceholder from './MainTabs/GuestPlaceholder';
import LocationScreen from './MainTabs/LocationScreen';
import FriendsScreen from './MainTabs/FriendsScreen';
import FavoritesScreen from './MainTabs/FavoritesScreen';
import ProfileScreen from './MainTabs/ProfileScreen';

// Modals imports
import QuestModal from './MainTabs/QuestModal';
import CampaignModal from './MainTabs/CampaignModal';
import RedeemSuccessModal from './MainTabs/RedeemSuccessModal';

// Import services and components for Hidden Quests
import { getActiveTasks, pingLocation, getActiveCampaigns } from '../services/hiddenQuestService';
import { useSocialQuest } from './SocialQuest/SocialQuestProvider';
import ChestOpeningAnimation from './HiddenQuest/ChestOpeningAnimation';
import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';
import { showAlert, showConfirm } from '../platform/dialog';
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

const MainTabs = ({ user, isGuest, onLogout, onRequireLogin, onOpenPlan, onOpenLocationRegister, onOpenProfileEdit, onOpenHistory, onOpenTripDetail, onOpenAdminModeration, refreshUser, onOpenLocationDetail }) => {
    const { sendLocation } = useSocialQuest();

    // State quản lý tab đang hiển thị
    const [activeTab, setActiveTab] = useState('home');
    const [userLocation, setUserLocation] = useState(null);
    
    // State quản lý Thành tựu
    const [achievements, setAchievements] = useState([]);
    const [achFilter, setAchFilter] = useState('all'); // 'all', 'unlocked', 'locked'

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

    // States for Public Campaigns
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [showCampaignModal, setShowCampaignModal] = useState(false);

    // Fetch active campaigns list
    const fetchActiveCampaigns = async (locationOverride = null, force = false) => {
        if (isGuest) return;

        const loc = locationOverride || userLocationRef.current;
        if (!loc || typeof loc.lat === 'undefined' || typeof loc.lng === 'undefined') {
            return;
        }

        const now = Date.now();
        const lastLoc = lastFetchedLocationRef.current;
        const lastTime = lastFetchedTimeRef.current;

        if (!force && lastLoc) {
            const timeElapsed = now - lastTime;
            
            // 1. Hard limit: never fetch more than once every 10 seconds unless forced
            if (timeElapsed < 10000) {
                return;
            }

            // 2. Soft limit: if less than 60 seconds, only fetch if moved >= 10 meters
            if (timeElapsed < 60000) {
                const lat1 = lastLoc.lat;
                const lon1 = lastLoc.lng;
                const lat2 = loc.lat;
                const lon2 = loc.lng;
                
                const R = 6371000; // meters
                const dLat = ((lat2 - lat1) * Math.PI) / 180;
                const dLon = ((lon2 - lon1) * Math.PI) / 180;
                const a =
                  Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos((lat1 * Math.PI) / 180) *
                    Math.cos((lat2 * Math.PI) / 180) *
                    Math.sin(dLon / 2) *
                    Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const distance = R * c;

                if (distance < 10) {
                    return;
                }
            }
        }

        try {
            const activeCampaigns = await getActiveCampaigns(loc);
            setCampaigns(activeCampaigns);
            lastFetchedLocationRef.current = loc;
            lastFetchedTimeRef.current = now;
        } catch (err) {
            console.error("Lỗi lấy danh sách chiến dịch hoạt động:", err);
        }
    };

    const handleCampaignClick = (campaign) => {
        setSelectedCampaign(campaign);
        setShowCampaignModal(true);
    };

    const userLocationRef = useRef(userLocation);
    const lastFetchedLocationRef = useRef(null);
    const lastFetchedTimeRef = useRef(0);

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

    // Handle map click events on hidden tasks
    const handleHiddenTaskClick = (task) => {
        setSelectedTask(task);
        if (task.task_type === 'CHEST') {
            setShowChestAnimation(true);
        } else if (task.task_type === 'DYNAMIC_QUEST') {
            setShowQuestModal(true);
        }
    };

    // Lắng nghe sự kiện Mock GPS thủ công
    useEffect(() => {
        const handleMockLocationUpdate = (e) => {
            const loc = e.detail;
            setUserLocation(loc);
            sendLocation(loc.lat, loc.lng);
            fetchActiveCampaigns(loc, true);
        };

        const handleMockLocationDisabled = () => {
            getCurrentPosition({
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 10000
            })
                .then((position) => {
                    const loc = {
                        lat: position.latitude,
                        lng: position.longitude
                    };
                    setUserLocation(loc);
                    sendLocation(loc.lat, loc.lng);
                    fetchActiveCampaigns(loc, true);
                })
                .catch((err) => console.warn("Lỗi khôi phục định vị thật:", err));
        };

        window.addEventListener('mock_location_update', handleMockLocationUpdate);
        window.addEventListener('mock_location_disabled', handleMockLocationDisabled);
        return () => {
            window.removeEventListener('mock_location_update', handleMockLocationUpdate);
            window.removeEventListener('mock_location_disabled', handleMockLocationDisabled);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lắng nghe chiến dịch mới toàn cục
    useEffect(() => {
        if (isGuest) return;

        const handleNewCampaignEvent = (event) => {
            const data = event.detail;
            void showAlert(`[Chiến dịch mới] "${data.title}" vừa được tạo gần bạn! Hãy mở Bản đồ để check-in và nhận quà nhé!`);
            fetchActiveCampaigns(null, true);
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
        fetchActiveCampaigns(null, true);

        const stopWatching = startWatchingPosition({
            onSuccess: (position) => {
                if (window.isMockGpsActive) return; // Skip updating if mock GPS is active
                const loc = {
                    lat: position.latitude,
                    lng: position.longitude
                };
                setUserLocation(loc);
                sendLocation(loc.lat, loc.lng);
                fetchActiveCampaigns(loc);
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
            if (window.isMockGpsActive && userLocation) {
                if (!isGuest) {
                    fetchActiveCampaigns(userLocation, true);
                    pingLocation(userLocation.lat, userLocation.lng)
                        .then((res) => {
                            if (res.spawned) {
                                void showAlert(`[Nhiệm vụ ẩn] Phát hiện nhiệm vụ ẩn mới: "${res.item.title}" (${res.item.rarity}) vừa xuất hiện!`);
                            }
                            fetchActiveTasks();
                        })
                        .catch((err) => console.error(err));
                }
                return;
            }

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
                    fetchActiveCampaigns(loc, true);
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
                    refreshUser={refreshUser}
                    onOpenLocationDetail={onOpenLocationDetail}
                />;
            case 'location':
                return isGuest ? (
                    <GuestPlaceholder 
                        title="Bản đồ & Lịch trình" 
                        icon={<MapPin size={48} />} 
                        onRequireLogin={onRequireLogin} 
                    />
                ) : (
                    <LocationScreen
                        userLocation={userLocation}
                        userInfo={userInfo}
                        hiddenTasks={hiddenTasks}
                        handleHiddenTaskClick={handleHiddenTaskClick}
                        campaigns={campaigns}
                        onCampaignClick={handleCampaignClick}
                        isGuest={isGuest}
                        fetchActiveTasks={fetchActiveTasks}
                    />
                );

            case 'leaderboard':
                return <Leaderboard />;

            case 'friends':
                return isGuest ? (
                    <GuestPlaceholder 
                        title="Cộng đồng Du lịch" 
                        icon={<Users size={48} />} 
                        onRequireLogin={onRequireLogin} 
                    />
                ) : (
                    <FriendsScreen
                        userInfo={userInfo}
                        onRequireLogin={onRequireLogin}
                        setActiveTab={setActiveTab}
                    />
                );

            case 'favorites':
                return isGuest ? (
                    <GuestPlaceholder 
                        title="Địa điểm Yêu thích" 
                        icon={<Heart size={48} style={{ color: '#e74c3c' }} />} 
                        onRequireLogin={onRequireLogin} 
                    />
                ) : (
                    <FavoritesScreen onOpenLocationDetail={onOpenLocationDetail} />
                );

            case 'profile':
                return isGuest ? (
                    <GuestPlaceholder 
                        title="Hồ sơ Cá nhân" 
                        icon={<User size={48} />} 
                        onRequireLogin={onRequireLogin} 
                    />
                ) : (
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
                        setLocalPointsBalance={setLocalPointsBalance}
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
                        if (typeof refreshUser === 'function') {
                            refreshUser();
                        }
                    }}
                />
            )}

            {showQuestModal && selectedTask && (
                <QuestModal
                    task={selectedTask}
                    userLocation={userLocation}
                    onClose={() => {
                        setShowQuestModal(false);
                        setSelectedTask(null);
                    }}
                    onSuccess={() => {
                        fetchActiveTasks();
                        if (typeof refreshUser === 'function') {
                            refreshUser();
                        }
                    }}
                />
            )}

            {/* --- Campaign Overlays --- */}
            {showCampaignModal && selectedCampaign && (
                <CampaignModal
                    campaign={selectedCampaign}
                    userLocation={userLocation}
                    onClose={() => {
                        setShowCampaignModal(false);
                        setSelectedCampaign(null);
                    }}
                    onSuccess={() => {
                        fetchActiveCampaigns(null, true);
                        if (typeof refreshUser === 'function') {
                            refreshUser();
                        }
                    }}
                />
            )}

            {/* --- Redeem Voucher Success Modal --- */}
            {showRedeemSuccessModal && redeemedVoucherInfo && (
                <RedeemSuccessModal
                    redeemedVoucherInfo={redeemedVoucherInfo}
                    onClose={() => setShowRedeemSuccessModal(false)}
                />
            )}
        </div>
    );
};

export default MainTabs;
