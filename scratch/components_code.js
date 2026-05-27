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
