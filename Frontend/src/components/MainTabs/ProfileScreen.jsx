// src/components/MainTabs/ProfileScreen.jsx
import React, { useState, useEffect } from 'react';
import { 
    Coins, Trophy, CheckCircle2, AlertTriangle, Star, Settings, 
    ShieldAlert, Clock, HelpCircle, MessageCircle, LogOut, Sparkles 
} from 'lucide-react';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../../utils/avatar';
import { 
    isBgmEnabled, isSfxEnabled, setBgmEnabled, setSfxEnabled, 
    getBgmVolume, setBgmVolume 
} from '../../utils/soundUtils';
import { isMascotEnabled, setMascotEnabled } from '../../config/uiFlags';
import { storageGet, storageSet } from '../../platform/storage';
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

export default ProfileScreen;
