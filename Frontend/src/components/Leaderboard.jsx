import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';
import { Trophy, Crown, AlertTriangle, MapPin, Compass, Star } from 'lucide-react';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../utils/avatar';
import './Leaderboard.css';

const Leaderboard = () => {
    const [category, setCategory] = useState('global');
    const [selectedRegion, setSelectedRegion] = useState('');
    const [selectedTier, setSelectedTier] = useState('Gold');

    const [leaderboardData, setLeaderboardData] = useState([]);
    const [myRank, setMyRank] = useState(null);
    const [availableRegions, setAvailableRegions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const availableTiers = [
        { name: 'Bronze', label: 'Đồng (Cấp 1 - 5)' },
        { name: 'Silver', label: 'Bạc (Cấp 6 - 15)' },
        { name: 'Gold', label: 'Vàng (Cấp 16 - 30)' },
        { name: 'Platinum', label: 'Bạch Kim (Cấp 31 - 50)' },
        { name: 'Diamond', label: 'Kim Cương (Cấp 51+)' }
    ];

    const fetchLeaderboard = async () => {
        setLoading(true);
        setError(null);

        try {
            let url = `${API_BASE}/api/leaderboard?category=${category}`;
            if (category === 'region' && selectedRegion) {
                url += `&region_name=${encodeURIComponent(selectedRegion)}`;
            } else if (category === 'tier') {
                url += `&tier_name=${selectedTier}`;
            }

            const token = await storageGet('access_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : {};

            const response = await fetch(url, { headers });
            if (!response.ok) {
                throw new Error('Không thể tải dữ liệu bảng xếp hạng');
            }

            const data = await response.json();
            if (data.status !== 'success') {
                throw new Error(data.message || 'Lỗi không xác định');
            }

            setLeaderboardData(data.leaderboard || []);
            setMyRank(data.my_rank);
            setAvailableRegions(data.available_regions || []);

            if (category === 'region' && !selectedRegion && data.region_name) {
                setSelectedRegion(data.region_name);
            }
        } catch (err) {
            console.error('Lỗi khi tải bảng xếp hạng:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeaderboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, selectedRegion, selectedTier]);

    const topThree = leaderboardData.slice(0, 3);
    const remainingUsers = leaderboardData.slice(3);

    const firstPlace = topThree.find((u) => u.rank === 1);
    const secondPlace = topThree.find((u) => u.rank === 2);
    const thirdPlace = topThree.find((u) => u.rank === 3);

    const getAvatarSrc = (rankUser) => getSafeAvatarSrc(rankUser?.avatar_url, rankUser?.full_name);

    const handleAvatarError = (event, name) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = createInitialAvatarDataUrl(name);
    };

    const renderPodiumItem = (player, place, crown = false) => {
        if (!player) return <div className="podium-placeholder" />;

        return (
            <div className={`podium-item place-${place}`}>
                <div className="podium-avatar-wrapper">
                    {crown && <Crown size={16} className="podium-crown" />}
                    <img
                        src={getAvatarSrc(player)}
                        alt={player.full_name}
                        className="podium-avatar"
                        onError={(event) => handleAvatarError(event, player.full_name)}
                    />
                    <span className="podium-rank-badge">{place}</span>
                </div>
                <span className="podium-name" title={player.full_name}>{player.full_name}</span>
                <span className="podium-pts">{player.total_points} điểm</span>
            </div>
        );
    };

    return (
        <div className="leaderboard-container">
            <div className="leaderboard-header">
                <h2 className="leaderboard-title">
                    <Trophy size={20} /> Bảng xếp hạng check-in
                </h2>
                <p className="leaderboard-subtitle">Theo dõi thứ hạng điểm thưởng của cộng đồng du lịch</p>

                <div className="category-tabs">
                    <button
                        className={`tab-btn ${category === 'global' ? 'active' : ''}`}
                        onClick={() => {
                            setCategory('global');
                            setSelectedRegion('');
                        }}
                    >
                        Toàn quốc
                    </button>
                    <button
                        className={`tab-btn ${category === 'region' ? 'active' : ''}`}
                        onClick={() => setCategory('region')}
                    >
                        Khu vực
                    </button>
                    <button
                        className={`tab-btn ${category === 'tier' ? 'active' : ''}`}
                        onClick={() => setCategory('tier')}
                    >
                        Phân hạng
                    </button>
                </div>
            </div>

            {category === 'region' && (
                <div className="filter-container">
                    <span className="filter-label">Khu vực:</span>
                    <select className="filter-select" value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
                        {availableRegions.map((reg) => (
                            <option key={reg} value={reg}>{reg}</option>
                        ))}
                    </select>
                </div>
            )}

            {category === 'tier' && (
                <div className="filter-container">
                    <span className="filter-label">Phân hạng:</span>
                    <select className="filter-select" value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)}>
                        {availableTiers.map((tier) => (
                            <option key={tier.name} value={tier.name}>{tier.label}</option>
                        ))}
                    </select>
                </div>
            )}

            {loading && (
                <div className="loaderboard-loading">
                    <div className="spinner"></div>
                    <p>Đang cập nhật bảng xếp hạng...</p>
                </div>
            )}

            {error && !loading && (
                <div className="leaderboard-empty">
                    <AlertTriangle size={28} />
                    <p>{error}</p>
                    <button className="retry-btn" onClick={fetchLeaderboard}>Thử lại</button>
                </div>
            )}

            {!loading && !error && (
                <>
                    {leaderboardData.length === 0 ? (
                        <div className="leaderboard-empty">
                            <Compass size={36} />
                            <p>Chưa có dữ liệu ở danh mục này.</p>
                        </div>
                    ) : (
                        <>
                            <div className="podium-container">
                                {renderPodiumItem(secondPlace, 2)}
                                {renderPodiumItem(firstPlace, 1, true)}
                                {renderPodiumItem(thirdPlace, 3)}
                            </div>

                            {remainingUsers.length > 0 && (
                                <div className="leaderboard-list">
                                    {remainingUsers.map((item) => (
                                        <div className="leaderboard-item" key={item.user_id}>
                                            <div className="item-rank">#{item.rank}</div>
                                            <img
                                                src={getAvatarSrc(item)}
                                                alt={item.full_name}
                                                className="item-avatar"
                                                onError={(event) => handleAvatarError(event, item.full_name)}
                                            />
                                            <div className="item-details">
                                                <span className="item-name" title={item.full_name}>{item.full_name}</span>
                                                <div className="item-meta">
                                                    <span className="tier-badge" style={{ backgroundColor: `${item.tier_color}20`, color: item.tier_color, borderColor: `${item.tier_color}50` }}>
                                                        {item.tier_vi}
                                                    </span>
                                                    <span className="meta-pill"><Star size={11} /> Cấp {item.level}</span>
                                                    <span className="meta-pill"><MapPin size={11} /> {item.base_location || 'Chưa cập nhật'}</span>
                                                </div>
                                            </div>
                                            <div className="item-points">
                                                <span className="pts-value">{item.total_points}</span>
                                                <span className="pts-label">điểm</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {!loading && myRank && (
                <div className="my-rank-sticky-card">
                    <div className="my-rank-left">
                        <div className="my-rank-number">#{myRank.rank}</div>
                        <img
                            src={getAvatarSrc(myRank)}
                            alt="Ảnh đại diện của bạn"
                            className="my-rank-avatar"
                            onError={(event) => handleAvatarError(event, myRank.full_name)}
                        />
                        <div className="my-rank-info">
                            <h4 className="my-rank-name">{myRank.full_name} (Bạn)</h4>
                            <div className="my-rank-tier">
                                <span>{myRank.tier_vi}</span>
                                <span className="meta-sep">•</span>
                                <span className="meta-pill"><Star size={11} /> Cấp {myRank.level}</span>
                                <span className="meta-sep">•</span>
                                <span className="meta-pill"><MapPin size={11} /> {myRank.base_location || 'Chưa cập nhật'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="my-rank-points">
                        <div className="my-rank-pts-value">{myRank.total_points}</div>
                        <div className="my-rank-pts-lbl">điểm</div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Leaderboard;
