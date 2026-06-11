// src/components/MainTabs/ProfileScreen.jsx
import React, { useState, useEffect } from 'react';
import { 
    Coins, Trophy, CheckCircle2, AlertTriangle, Star, Settings, 
    ShieldAlert, Clock, HelpCircle, MessageCircle, LogOut, Sparkles, X 
} from 'lucide-react';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../../utils/avatar';
import { 
    isBgmEnabled, isSfxEnabled, setBgmEnabled, setSfxEnabled, 
    getBgmVolume, setBgmVolume 
} from '../../utils/soundUtils';
import { isMascotEnabled, setMascotEnabled } from '../../config/uiFlags';
import { storageGet, storageSet } from '../../platform/storage';
import { API_BASE } from '../../config/api';
import { showAlert } from '../../platform/dialog';
import VouchersList from '../Voucher/VouchersList';
import './ProfileScreen.css';

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
    onLogout,
    setLocalPointsBalance
}) => {
    const profileName = userInfo?.full_name || 'Khách du lịch';
    const profileAvatarFallback = createInitialAvatarDataUrl(profileName);
    const TierIcon = tierMeta.icon;

    const [bgmOn, setBgmOn] = useState(isBgmEnabled());
    const [sfxOn, setSfxOn] = useState(isSfxEnabled());
    const [bgmVol, setBgmVol] = useState(getBgmVolume());
    const [mascotOn, setMascotOn] = useState(isMascotEnabled());
    const [darkMode, setDarkMode] = useState(false);
    
    // Feedback states
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [feedbackType, setFeedbackType] = useState('SUGGESTION');
    const [feedbackContent, setFeedbackContent] = useState('');
    const [submittingFeedback, setSubmittingFeedback] = useState(false);
    const [showThankYou, setShowThankYou] = useState(false);

    useEffect(() => {
        const loadTheme = async () => {
            const isDark = await storageGet('dark_mode');
            setDarkMode(isDark === 'true');
        };
        loadTheme();
    }, []);

    const handleToggleDarkMode = async () => {
        const newMode = !darkMode;
        setDarkMode(newMode);
        await storageSet('dark_mode', newMode ? 'true' : 'false');
        
        if (newMode) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    };

    useEffect(() => {
        const syncAudioSettings = () => {
            setBgmOn(isBgmEnabled());
            setSfxOn(isSfxEnabled());
            setBgmVol(getBgmVolume());
        };
        const syncMascotSettings = () => {
            setMascotOn(isMascotEnabled());
        };
        window.addEventListener('audioSettingsChanged', syncAudioSettings);
        window.addEventListener('mascotSettingsChanged', syncMascotSettings);
        return () => {
            window.removeEventListener('audioSettingsChanged', syncAudioSettings);
            window.removeEventListener('mascotSettingsChanged', syncMascotSettings);
        };
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

    const toggleMascot = () => {
        const newState = !mascotOn;
        setMascotEnabled(newState);
        setMascotOn(newState);
    };

    const handleVolumeChange = (e) => {
        const val = parseFloat(e.target.value);
        setBgmVol(val);
        setBgmVolume(val);
    };

    const handleSubmitFeedback = async (e) => {
        e.preventDefault();
        const content = feedbackContent.trim();
        if (!content) return;

        setSubmittingFeedback(true);
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    feedback_type: feedbackType,
                    content: content
                })
            });

            if (res.ok) {
                setIsFeedbackOpen(false);
                setFeedbackContent('');
                setFeedbackType('SUGGESTION');
                setShowThankYou(true);
            } else {
                const errData = await res.json().catch(() => ({}));
                void showAlert(errData.detail || 'Gửi đóng góp ý kiến thất bại.');
            }
        } catch (err) {
            console.error('Error submitting feedback:', err);
            void showAlert('Không thể kết nối tới máy chủ. Vui lòng thử lại sau.');
        } finally {
            setSubmittingFeedback(false);
        }
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
                    borderBottom: '3.5px solid var(--game-border-color)',
                    marginBottom: '15px',
                    backgroundColor: 'var(--st-surface-muted)',
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
                                borderRight: tab.id !== 'shop' ? '2.5px solid var(--game-border-color)' : 'none',
                                backgroundColor: rewardsTab === tab.id ? 'var(--game-yellow)' : 'transparent',
                                color: rewardsTab === tab.id ? '#2c3e50' : 'var(--st-text)',
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
                                                     <span style={{ fontSize: '11px', color: 'var(--st-text-muted)', display: 'block', marginTop: '2px' }}>
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
                                        style={{ padding: '14px', border: '2.5px solid var(--game-border-color)', borderRadius: '14px', boxShadow: '0 4px 0 var(--game-border-color)', marginBottom: '8px' }}
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
                                                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--game-yellow)', textShadow: '1px 1px 0 var(--game-border-color)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                    🎁 +{quest.reward} EXP
                                                </span>
                                            </div>
                                            <strong style={{ fontSize: '14px', color: 'var(--st-text)', display: 'block', marginBottom: '4px' }}>{quest.title}</strong>
                                            <span style={{ fontSize: '11px', color: 'var(--st-text-muted)', display: 'block', marginBottom: '10px' }}>{quest.description}</span>
                                            
                                            <div className="achievement-progress">
                                                <div className="achievement-progress-header" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', marginBottom: '3px' }}>
                                                    <span>Tiến độ</span>
                                                    <span>{quest.progress}/{quest.max}</span>
                                                </div>
                                                <div className="achievement-progress-bar" style={{ height: '10px', background: 'var(--st-surface-muted)', borderRadius: '5px', overflow: 'hidden', border: '1.5px solid var(--game-border-color)' }}>
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
                        <VouchersList onVoucherClaimed={(res) => {
                            const newBalance = res?.new_point_balance ?? res?.new_points_balance ?? res?.new_exp_balance;
                            if (newBalance !== undefined && setLocalPointsBalance) {
                                setLocalPointsBalance(newBalance);
                            }
                        }} />
                    </div>
                )}
            </div>

            <div className="achievements-card profile-settings-section" style={{ marginTop: '16px', padding: '16px', border: '2.5px solid var(--game-border-color)', borderRadius: '16px', backgroundColor: 'var(--st-surface)', boxShadow: '0 4px 0 var(--game-border-color)' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 16px 0', color: 'var(--st-text)', fontSize: '15px', fontWeight: '800' }}>
                    <Settings size={18} /> Cài đặt Trò chơi
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1.5px dashed var(--st-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--st-text)' }}>Nhạc nền (BGM)</strong>
                            <span style={{ fontSize: '11px', color: 'var(--st-text-muted)' }}>Phát nhạc nền khi mở app</span>
                        </div>
                        <button 
                            onClick={toggleBgm}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '20px',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                border: '2px solid var(--game-border-color)',
                                backgroundColor: bgmOn ? '#2ed573' : '#ff4757',
                                color: '#fff',
                                cursor: 'pointer',
                                boxShadow: '0 3px 0 var(--game-border-color)',
                                transition: 'all 0.1s'
                            }}
                        >
                            {bgmOn ? 'BẬT' : 'TẮT'}
                        </button>
                    </div>
                    {bgmOn && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--st-text-muted)' }}>Âm lượng:</span>
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
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1.5px dashed var(--st-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--st-text)' }}>Âm thanh hiệu ứng (SFX)</strong>
                            <span style={{ fontSize: '11px', color: 'var(--st-text-muted)' }}>Tiếng click, nhận thưởng</span>
                        </div>
                        <button 
                            onClick={toggleSfx}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '20px',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                border: '2px solid var(--game-border-color)',
                                backgroundColor: sfxOn ? '#2ed573' : '#ff4757',
                                color: '#fff',
                                cursor: 'pointer',
                                boxShadow: '0 3px 0 var(--game-border-color)',
                                transition: 'all 0.1s'
                            }}
                        >
                            {sfxOn ? 'BẬT' : 'TẮT'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1.5px dashed var(--st-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--st-text)' }}>Trợ lý Mascot</strong>
                            <span style={{ fontSize: '11px', color: 'var(--st-text-muted)' }}>Bật/tắt Mascot hướng dẫn hành trình</span>
                        </div>
                        <button 
                            onClick={toggleMascot}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '20px',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                border: '2px solid var(--game-border-color)',
                                backgroundColor: mascotOn ? '#2ed573' : '#ff4757',
                                color: '#fff',
                                cursor: 'pointer',
                                boxShadow: '0 3px 0 var(--game-border-color)',
                                transition: 'all 0.1s'
                            }}
                        >
                            {mascotOn ? 'BẬT' : 'TẮT'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--st-text)' }}>Chế độ tối (Dark Mode)</strong>
                        <span style={{ fontSize: '11px', color: 'var(--st-text-muted)' }}>Giao diện tối giúp dịu mắt</span>
                    </div>
                    <button 
                        onClick={handleToggleDarkMode}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            border: '2px solid var(--game-border-color)',
                            backgroundColor: darkMode ? '#2ed573' : '#ff4757',
                            color: '#fff',
                            cursor: 'pointer',
                            boxShadow: '0 3px 0 var(--game-border-color)',
                            transition: 'all 0.1s'
                        }}
                    >
                        {darkMode ? 'BẬT' : 'TẮT'}
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
                <button className="profile-menu-btn" onClick={() => setIsFeedbackOpen(true)}>
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

            {/* Feedback Modal */}
            {isFeedbackOpen && (
                <div className="modal-overlay" style={{ display: 'flex' }}>
                    <div className="modal-content cartoon-card" style={{ maxWidth: '420px', width: '90%', padding: '24px', borderRadius: '24px', position: 'relative' }}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--st-text)' }}>Đóng Góp Ý Kiến</h3>
                            <button 
                                className="btn-close" 
                                onClick={() => setIsFeedbackOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--st-text)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmitFeedback}>
                            <div className="feedback-field" style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--st-text)' }}>Loại đóng góp:</label>
                                <select 
                                    value={feedbackType} 
                                    onChange={(e) => setFeedbackType(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '10px',
                                        border: '2.5px solid var(--game-border-color)',
                                        backgroundColor: 'var(--st-surface)',
                                        color: 'var(--st-text)',
                                        fontWeight: 'bold',
                                        outline: 'none'
                                    }}
                                >
                                    <option value="SUGGESTION">💡 Góp ý / Đề xuất tính năng</option>
                                    <option value="BUG">🐛 Báo lỗi hệ thống (Bug)</option>
                                </select>
                            </div>

                            <div className="feedback-field" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                                <label style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--st-text)' }}>Nội dung chi tiết:</label>
                                <textarea
                                    value={feedbackContent}
                                    onChange={(e) => setFeedbackContent(e.target.value)}
                                    placeholder="Vui lòng mô tả chi tiết ý kiến hoặc lỗi bạn gặp phải để chúng tôi cải thiện ứng dụng..."
                                    rows="5"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        border: '2.5px solid var(--game-border-color)',
                                        backgroundColor: 'var(--st-surface)',
                                        color: 'var(--st-text)',
                                        outline: 'none',
                                        resize: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div className="modal-actions-row" style={{ display: 'flex', gap: '10px' }}>
                                <button 
                                    type="button" 
                                    className="squishy-btn red" 
                                    onClick={() => setIsFeedbackOpen(false)}
                                    style={{ flex: 1, padding: '10px', fontWeight: 'bold' }}
                                >
                                    Hủy
                                </button>
                                <button 
                                    type="submit" 
                                    className="squishy-btn green" 
                                    disabled={submittingFeedback}
                                    style={{ flex: 1, padding: '10px', fontWeight: 'bold' }}
                                >
                                    {submittingFeedback ? 'Đang gửi...' : 'Gửi góp ý'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Thank You Modal */}
            {showThankYou && (
                <div className="modal-overlay" style={{ display: 'flex' }}>
                    <div className="modal-content cartoon-card text-center" style={{ maxWidth: '380px', width: '90%', padding: '24px', borderRadius: '24px' }}>
                        <div className="badge-3d-hexagon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px auto', width: '70px', height: '70px', background: 'var(--game-yellow)', borderRadius: '50%', border: '3px solid var(--game-border-color)', boxShadow: '0 4px 0 var(--game-border-color)' }}>
                            <Sparkles size={36} style={{ color: '#2c3e50' }} />
                        </div>
                        <h2 style={{ fontSize: '20px', fontWeight: '800', marginBottom: '10px', color: 'var(--st-text)' }}>CẢM ƠN BẠN!</h2>
                        <p style={{ fontSize: '14px', color: 'var(--st-text-muted)', lineHeight: '1.5', marginBottom: '20px' }}>
                            Ý kiến đóng góp quý báu của bạn đã được ghi nhận. Chúng tôi sẽ nghiên cứu để hoàn thiện ứng dụng tốt hơn!
                        </p>
                        <button 
                            className="squishy-btn green" 
                            onClick={() => setShowThankYou(false)}
                            style={{ width: '100%', padding: '12px', fontWeight: 'bold' }}
                        >
                            Đồng ý & Đóng
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileScreen;
