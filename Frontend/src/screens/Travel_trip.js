import React, { useState, useEffect, useRef } from 'react';
import { getTripHistory } from '../services/tripService';
import { storageGet } from '../platform/storage';
import { API_BASE } from '../config/api';
import {
    Clock,
    Gamepad2,
    ArrowRight,
    Map,
    Coins,
    Star,
    MapPin,
    Camera,
    HelpCircle,
    ListChecks,
    Trophy,
    Medal,
    History,
    Calendar,
    Gift,
    Check
} from 'lucide-react';
import Mascot from '../components/Mascot/Mascot';
import { isMascotEnabled } from '../config/uiFlags';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../utils/avatar';
import { showAlert } from '../platform/dialog';
import './Travel_trip.css';

const HomeTravel = ({ isGuest, onRequireLogin, user, onOpenPlan, onOpenHistory, onOpenTripDetail, refreshUser, onOpenLocationDetail }) => {
    const [ongoingTrips, setOngoingTrips] = useState([]);
    const [loadingTrips, setLoadingTrips] = useState(false);
    const [topPlayers, setTopPlayers] = useState([]);
    const [loadingPlayers, setLoadingPlayers] = useState(false);
    const scrollerRef = useRef(null);
    const dragStateRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

    const [mascotMessage] = useState([
        'Chào mừng nhà thám hiểm! Sẵn sàng vượt ải chưa?',
        "Nhấn vào nút 'BẮT ĐẦU' bên dưới để mở bản đồ thám hiểm mới!",
        'Check-in bằng định vị GPS và chụp ảnh gửi AI để nhận rương báu nhé!'
    ]);

    // Trạng thái Gamification thực tế từ Backend
    const [dailyQuests, setDailyQuests] = useState([]);
    const [chestClaimed, setChestClaimed] = useState(false);
    const [attendanceInfo, setAttendanceInfo] = useState(null);
    const [loadingCheckIn, setLoadingCheckIn] = useState(false);
    const [loadingChest, setLoadingChest] = useState(false);
    const [loadingQuests, setLoadingQuests] = useState(false);
    const [showMascot, setShowMascot] = useState(isMascotEnabled());

    useEffect(() => {
        const handleMascotChange = () => {
            setShowMascot(isMascotEnabled());
        };
        window.addEventListener('mascotSettingsChanged', handleMascotChange);
        return () => window.removeEventListener('mascotSettingsChanged', handleMascotChange);
    }, []);

    // Lấy icon tương ứng với loại nhiệm vụ
    const getQuestIcon = (type) => {
        switch (type) {
            case 'GPS': return MapPin;
            case 'AI_PHOTO': return Camera;
            case 'QUIZ': return HelpCircle;
            case 'DISTANCE': return Map;
            case 'EXPLORE': return Star;
            case 'SOCIAL': return Gamepad2;
            case 'FRIEND': return Trophy;
            default: return ListChecks;
        }
    };

    // Tải dữ liệu nhiệm vụ hằng ngày và điểm danh
    const fetchDailyData = async () => {
        if (isGuest || !user) return;
        const token = await storageGet('access_token');
        if (!token) return;

        setLoadingQuests(true);
        const userId = user.user_id || user.id;

        try {
            // 1. Lấy danh sách nhiệm vụ hằng ngày
            const questRes = await fetch(`${API_BASE}/api/gamification/daily-quests/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (questRes.ok) {
                const questData = await questRes.json();
                if (questData.status === 'success') {
                    setDailyQuests(questData.data || []);
                    setChestClaimed(questData.chest_claimed || false);
                }
            }

            // 2. Lấy thông tin điểm danh
            const attRes = await fetch(`${API_BASE}/api/gamification/daily-attendance-info/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (attRes.ok) {
                const attData = await attRes.json();
                if (attData.status === 'success') {
                    setAttendanceInfo(attData.data);
                }
            }
        } catch (err) {
            console.error('Lỗi lấy dữ liệu Gamification:', err);
        } finally {
            setLoadingQuests(false);
        }
    };

    // Điểm danh hằng ngày
    const handleCheckIn = async () => {
        if (isGuest) {
            onRequireLogin();
            return;
        }
        if (!user) return;
        const userId = user.user_id || user.id;
        const token = await storageGet('access_token');
        if (!token) return;

        setLoadingCheckIn(true);
        try {
            const res = await fetch(`${API_BASE}/api/gamification/daily-attendance/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                const bonusInfo = data.data;
                let msg = `Điểm danh thành công!\nBạn nhận được +${bonusInfo.exp_reward} EXP và +${bonusInfo.coin_reward} Xu.`;
                if (bonusInfo.is_streak_bonus) {
                    msg += `\n🎉 Chúc mừng đạt cột mốc! Bạn được thưởng thêm chuỗi điểm danh.`;
                }
                void showAlert(msg);
                if (refreshUser) refreshUser();
                fetchDailyData();
            } else {
                void showAlert(data.detail || 'Điểm danh thất bại. Vui lòng thử lại sau.');
            }
        } catch (err) {
            console.error('Lỗi điểm danh:', err);
            void showAlert('Lỗi hệ thống khi điểm danh.');
        } finally {
            setLoadingCheckIn(false);
        }
    };

    const handleCompleteQuest = async (quest) => {
        if (quest.is_completed) return;

        let instruction = "Hãy thực hiện các hoạt động tương ứng trên bản đồ để hoàn thành nhiệm vụ này.";
        if (quest.quest_type === 'GPS') {
            instruction = "Hãy di chuyển đến các địa điểm du lịch trên bản đồ và nhấn nút 'Check-in GPS' để xác thực tọa độ và hoàn thành nhiệm vụ.";
        } else if (quest.quest_type === 'AI_PHOTO') {
            instruction = "Hãy thực hiện nhiệm vụ chụp ảnh tại các địa danh du lịch và gửi ảnh để AI kiểm định thành công để hoàn thành nhiệm vụ.";
        } else if (quest.quest_type === 'QUIZ') {
            instruction = "Hãy trả lời chính xác câu hỏi thử thách kiến thức lịch sử/văn hóa tại các trạm dừng du lịch để hoàn thành nhiệm vụ.";
        } else if (quest.quest_type === 'QR') {
            instruction = "Hãy tìm kiếm và quét mã QR Di sản tại các địa điểm du lịch để tự động hoàn thành nhiệm vụ.";
        } else if (quest.quest_type === 'DISTANCE') {
            instruction = "Hãy di chuyển quãng đường tối thiểu 5km trên bản đồ để hoàn thành nhiệm vụ này.";
        } else if (quest.quest_type === 'SOCIAL') {
            instruction = "Hãy tương tác, đăng bài viết hoặc chia sẻ hình ảnh lên diễn đàn cộng đồng du lịch để hoàn thành.";
        } else if (quest.quest_type === 'FRIEND') {
            instruction = "Hãy gửi lời mời kết bạn và kết nối thêm một người bạn đồng hành mới để hoàn thành nhiệm vụ.";
        }

        void showAlert(`💡 HƯỚNG DẪN NHIỆM VỤ\n\nNhiệm vụ: "${quest.text}"\n\nCách hoàn thành: ${instruction}\n\n🎁 Phần thưởng: +${quest.reward_exp} EXP | +${quest.reward_coin} Xu`);
    };

    const handleClaimChest = async () => {
        if (isGuest) {
            onRequireLogin();
            return;
        }
        if (!user) return;
        const userId = user.user_id || user.id;
        const token = await storageGet('access_token');
        if (!token) return;

        setLoadingChest(true);
        try {
            const res = await fetch(`${API_BASE}/api/gamification/daily-quests/${userId}/claim-chest`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                void showAlert(`🎁 RƯƠNG BÁU ĐÃ MỞ!\nChúc mừng bạn nhận được phần thưởng đặc biệt:\n+${data.exp_reward} EXP\n+${data.coin_reward} Xu`);
                if (refreshUser) refreshUser();
                fetchDailyData();
            } else {
                void showAlert(data.detail || 'Mở rương thất bại.');
            }
        } catch (err) {
            console.error('Lỗi mở rương báu:', err);
            void showAlert('Lỗi hệ thống khi mở rương báu.');
        } finally {
            setLoadingChest(false);
        }
    };

    useEffect(() => {
        const fetchOngoingTrips = async () => {
            if (isGuest || !user) return;
            const token = await storageGet('access_token');
            if (!token) return;

            setLoadingTrips(true);
            try {
                const data = await getTripHistory(token);
                const ongoing = data.filter((item) => item.status === 'DRAFT' || item.status === 'CONFIRMED');
                setOngoingTrips(ongoing);
            } catch (err) {
                console.error('Lỗi lấy lịch trình:', err);
            } finally {
                setLoadingTrips(false);
            }
        };

        const fetchTopPlayers = async () => {
            setLoadingPlayers(true);
            try {
                const response = await fetch(`${API_BASE}/api/leaderboard?category=global`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'success' && data.leaderboard) {
                        setTopPlayers(data.leaderboard.slice(0, 3));
                    }
                }
            } catch (err) {
                console.error('Lỗi lấy top BXH:', err);
            } finally {
                setLoadingPlayers(false);
            }
        };

        fetchOngoingTrips();
        fetchTopPlayers();
        fetchDailyData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGuest, user]);

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const handleScrollerWheel = (event) => {
        const el = scrollerRef.current;
        if (!el) return;
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.preventDefault();
            el.scrollLeft += event.deltaY;
        }
    };

    const handleScrollerMouseDown = (event) => {
        const el = scrollerRef.current;
        if (!el) return;
        dragStateRef.current = {
            isDown: true,
            startX: event.pageX - el.offsetLeft,
            scrollLeft: el.scrollLeft
        };
    };

    const handleScrollerMouseMove = (event) => {
        const el = scrollerRef.current;
        if (!el || !dragStateRef.current.isDown) return;
        event.preventDefault();
        const x = event.pageX - el.offsetLeft;
        const walk = (x - dragStateRef.current.startX) * 1.2;
        el.scrollLeft = dragStateRef.current.scrollLeft - walk;
    };

    const stopScrollerDrag = () => {
        dragStateRef.current.isDown = false;
    };

    const adventureZones = [
        {
            id: 1,
            title: 'Vịnh Hạ Long',
            difficultyTone: 'easy',
            difficultyText: 'Dễ',
            xp: '+500 EXP',
            coins: '+200 Xu',
            rating: '4.8',
            image: 'https://images.unsplash.com/photo-1528127269322-539801943592?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 2,
            title: 'Ruộng Bậc Thang',
            difficultyTone: 'medium',
            difficultyText: 'Trung bình',
            xp: '+750 EXP',
            coins: '+350 Xu',
            rating: '4.9',
            image: 'https://images.unsplash.com/photo-1576485290814-1c72aa4bbb8e?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80'
        },
        {
            id: 3,
            title: 'Phố Cổ Hội An',
            difficultyTone: 'easy',
            difficultyText: 'Dễ',
            xp: '+400 EXP',
            coins: '+150 Xu',
            rating: '4.7',
            image: 'https://images.unsplash.com/photo-1555921015-5532091f6026?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80'
        }
    ];

    const allQuestsDone = dailyQuests.length > 0 && dailyQuests.every(q => q.is_completed);

    return (
        <div className="home-container">
            <div className="home-scroll-content">
                <div className="plan-banner">
                    <div className="banner-left">
                        <h3>CHIẾN DỊCH MỚI</h3>
                        <p>Thiết lập lộ trình thám hiểm và làm nhiệm vụ ngay!</p>
                    </div>
                    <button onClick={isGuest ? onRequireLogin : onOpenPlan} className="plan-banner-btn squishy-btn">
                        BẮT ĐẦU <ArrowRight size={14} />
                    </button>
                </div>

                {!isGuest && loadingTrips && (
                    <div className="inline-loading">
                        <Clock size={16} className="animate-spin" /> Đang kiểm tra lịch trình...
                    </div>
                )}

                {!isGuest && (
                    <div className="ongoing-section">
                        <div className="section-title">
                            <span>Ải Đang Chinh Phục</span>
                            <button className="history-link-btn" onClick={(event) => { event.stopPropagation(); onOpenHistory && onOpenHistory(); }}>
                                <History size={13} className="inline-icon" /> Lịch sử
                            </button>
                        </div>
                        {ongoingTrips.length > 0 ? (
                            <div className="ongoing-trips-list">
                                {ongoingTrips.map((trip) => (
                                    <div
                                        key={trip.itinerary_id}
                                        className="ongoing-trip-card"
                                        onClick={() => onOpenTripDetail && onOpenTripDetail(trip.itinerary_id)}
                                    >
                                        <div className="card-info">
                                            <h3 className="ongoing-trip-title">{trip.name || 'Hành trình không tên'}</h3>
                                            <p className="ongoing-trip-meta">Ngày kích hoạt: {formatDate(trip.create_at)}</p>
                                            <div className="ongoing-trip-stats">
                                                <span className="ongoing-stat-item">
                                                    <Coins size={13} className="stat-icon" /> {new Intl.NumberFormat('vi-VN').format(trip.total_budget)} đ
                                                </span>
                                            </div>
                                        </div>
                                        <div className="enter-dungeon-action">
                                            <button className="enter-btn squishy-btn green">
                                                Vào ải <Gamepad2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="ongoing-empty-card" style={{ 
                                padding: '24px 16px', 
                                textAlign: 'center', 
                                background: 'var(--st-surface-muted)', 
                                border: '2.5px dashed var(--game-border-color)', 
                                borderRadius: '16px', 
                                color: 'var(--st-text-muted)',
                                fontWeight: 'bold',
                                fontSize: '13px',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                            }}>
                                Bạn chưa có hành trình nào đang diễn ra.<br/>
                                <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#95a5a6', marginTop: '4px', display: 'inline-block' }}>
                                    Nhấn "BẮT ĐẦU" ở trên để thiết lập lộ trình mới!
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* ==================== ĐIỂM DANH HẰNG NGÀY ==================== */}
                <div className="daily-attendance-card">
                    <h3 className="board-title">
                        <Calendar size={16} className="inline-icon" /> ĐIỂM DANH HẰNG NGÀY
                    </h3>
                    {isGuest ? (
                        <div className="attendance-guest-state">
                            <p>Đăng nhập để nhận chuỗi điểm danh và quà tặng hằng ngày!</p>
                            <button onClick={onRequireLogin} className="explore-zone-btn squishy-btn yellow" style={{ width: '100%', padding: '10px' }}>
                                ĐĂNG NHẬP NGAY
                            </button>
                        </div>
                    ) : (
                        <div className="attendance-content">
                            <div className="attendance-streak-header">
                                Chuỗi liên tiếp: <strong>{attendanceInfo?.attendance_streak || 0} ngày</strong>
                            </div>
                            
                            <div className="attendance-days-grid">
                                {[1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
                                    // Xác định ô này có được đánh dấu điểm danh hay không
                                    const currentStreakUnit = (attendanceInfo?.attendance_streak || 0) % 7;
                                    
                                    let isChecked = false;
                                    let isToday = false;
                                    
                                    if (attendanceInfo?.can_check_in) {
                                        // Nếu hôm nay CÓ THỂ điểm danh
                                        isChecked = dayNum <= currentStreakUnit;
                                        isToday = dayNum === currentStreakUnit + 1;
                                    } else {
                                        // Nếu hôm nay ĐÃ điểm danh xong
                                        isChecked = dayNum <= (currentStreakUnit === 0 && attendanceInfo?.attendance_streak > 0 ? 7 : currentStreakUnit);
                                        isToday = dayNum === (currentStreakUnit === 0 && attendanceInfo?.attendance_streak > 0 ? 7 : currentStreakUnit);
                                    }

                                    return (
                                        <div 
                                            key={dayNum} 
                                            className={`attendance-day-box ${isChecked ? 'checked' : ''} ${isToday ? 'today' : ''} ${dayNum === 7 ? 'milestone' : ''}`}
                                        >
                                            <span className="day-name">Ngày {dayNum}</span>
                                            <div className="day-status-icon">
                                                {isChecked ? <Check size={14} /> : (dayNum === 7 ? <Gift size={14} /> : <Star size={10} />)}
                                            </div>
                                            <span className="day-bonus">{dayNum === 7 ? '+400 EXP / 200 Xu' : '+100 EXP / 50 Xu'}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            <button 
                                onClick={handleCheckIn}
                                disabled={!attendanceInfo?.can_check_in || loadingCheckIn}
                                className={`attendance-action-btn squishy-btn ${attendanceInfo?.can_check_in ? 'green' : 'disabled'}`}
                            >
                                {loadingCheckIn ? 'Đang xử lý...' : (attendanceInfo?.can_check_in ? 'ĐIỂM DANH NGAY' : 'ĐÃ ĐIỂM DANH HÔM NAY')}
                            </button>
                        </div>
                    )}
                </div>

                {/* ==================== NHIỆM VỤ HẰNG NGÀY ==================== */}
                <div className="daily-quests-card">
                    <h3 className="board-title">
                        <ListChecks size={16} className="inline-icon" /> NHIỆM VỤ HẰNG NGÀY
                    </h3>
                    
                    {isGuest ? (
                        <div className="attendance-guest-state" style={{ textAlign: 'center', padding: '12px' }}>
                            <p>Đăng nhập để nhận danh sách nhiệm vụ hằng ngày!</p>
                        </div>
                    ) : loadingQuests ? (
                        <div className="inline-loading">Đang tải nhiệm vụ...</div>
                    ) : dailyQuests.length === 0 ? (
                        <div className="inline-loading">Không có nhiệm vụ nào được phân bổ hôm nay.</div>
                    ) : (
                        <div className="quests-list">
                            <p style={{ fontSize: '10px', color: '#7f8c8d', margin: '-4px 0 8px 4px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                💡 Nhấn vào nhiệm vụ chưa hoàn thành để xem hướng dẫn thực hiện.
                            </p>
                            {dailyQuests.map((quest) => {
                                const QuestIcon = getQuestIcon(quest.quest_type);
                                return (
                                    <div
                                        key={quest.id}
                                        className={`quest-item-row ${quest.is_completed ? 'quest-done' : ''}`}
                                        onClick={() => handleCompleteQuest(quest)}
                                    >
                                        <div className="checkbox-cartoon">{quest.is_completed ? '✓' : ''}</div>
                                        <div className="quest-text-content">
                                            <span className="quest-label">
                                                <QuestIcon size={13} className="inline-icon" /> {quest.text}
                                            </span>
                                            <span className="quest-reward">
                                                +{quest.reward_exp} EXP | +{quest.reward_coin} Xu
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* ==================== RƯƠNG THƯỞNG HOÀN THÀNH CẢ 3 ==================== */}
                            <div className="chest-rewards-container">
                                {allQuestsDone ? (
                                    chestClaimed ? (
                                        <div className="chest-rewards-section claimed">
                                            <div className="chest-icon-wrapper opened">
                                                <Gift size={36} className="chest-icon" />
                                            </div>
                                            <div className="chest-info-meta">
                                                <h4>RƯƠNG ĐÃ NHẬN</h4>
                                                <p>Đã nhận +300 EXP & +200 Xu thành công hôm nay!</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="chest-rewards-section ready-to-claim">
                                            <div className="chest-icon-wrapper glowing shaking">
                                                <Gift size={36} className="chest-icon" />
                                                <div className="chest-halo"></div>
                                            </div>
                                            <div className="chest-info-meta">
                                                <h4>NHẬN RƯƠNG THẦN KỲ</h4>
                                                <p>Nhận quà đặc biệt khi hoàn thành toàn bộ nhiệm vụ.</p>
                                                <button 
                                                    onClick={handleClaimChest} 
                                                    disabled={loadingChest} 
                                                    className="claim-chest-btn squishy-btn gold animate-bounce"
                                                >
                                                    {loadingChest ? 'Đang mở...' : 'MỞ RƯƠNG NGAY'}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="chest-rewards-section locked">
                                        <div className="chest-icon-wrapper locked">
                                            <Gift size={32} className="chest-icon" />
                                        </div>
                                        <div className="chest-info-meta">
                                            <h4>RƯƠNG THƯỞNG HẰNG NGÀY</h4>
                                            <p>Hoàn thành cả 3 nhiệm vụ để mở khóa (Đã xong {dailyQuests.filter(q => q.is_completed).length}/3)</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mini-leaderboard-card">
                    <div className="section-title">
                        <span>
                            <Trophy size={15} className="inline-icon" /> BẢNG VINH DANH
                        </span>
                    </div>
                    {loadingPlayers ? (
                        <div className="inline-loading">Đang cập nhật thứ hạng...</div>
                    ) : topPlayers.length === 0 ? (
                        <div className="empty-players">Đang đợi các nhà thám hiểm đột phá...</div>
                    ) : (
                        <div className="podium-preview">
                            {topPlayers.map((player, idx) => {
                                const rankLabel = idx + 1;
                                const fallbackAvatar = createInitialAvatarDataUrl(player.full_name);
                                return (
                                    <div key={player.user_id || idx} className={`podium-row place-${idx + 1}`}>
                                        <div className="place-medal">
                                            <Medal size={14} />
                                            <span>{rankLabel}</span>
                                        </div>
                                        <img
                                            src={getSafeAvatarSrc(player.avatar_url, player.full_name)}
                                            alt={player.full_name}
                                            className="player-podium-avatar"
                                            onError={(e) => {
                                                e.currentTarget.onerror = null;
                                                e.currentTarget.src = fallbackAvatar;
                                            }}
                                        />
                                        <div className="player-podium-name">{player.full_name}</div>
                                        <div className="player-podium-points">{player.total_points} xu</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="section-title">Vùng Đất Thám Hiểm</div>
                <div
                    ref={scrollerRef}
                    className="card-scroller"
                    onWheel={handleScrollerWheel}
                    onMouseDown={handleScrollerMouseDown}
                    onMouseMove={handleScrollerMouseMove}
                    onMouseLeave={stopScrollerDrag}
                    onMouseUp={stopScrollerDrag}
                >
                    {adventureZones.map((zone) => (
                        <div 
                            className="tour-card cartoon-card" 
                            key={zone.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                                if (isGuest) {
                                    onRequireLogin();
                                } else if (onOpenLocationDetail) {
                                    onOpenLocationDetail({
                                        location_id: zone.location_id || null,
                                        location_name: zone.title,
                                        image_url: zone.image,
                                        address: zone.address || null,
                                        description: zone.description || null,
                                    });
                                }
                            }}
                        >
                            <div className={`zone-difficulty-badge ${zone.difficultyTone}`}>
                                <span className={`difficulty-dot ${zone.difficultyTone}`}></span>
                                {zone.difficultyText}
                            </div>
                            <img src={zone.image} alt={zone.title} className="tour-image" />
                            <h3 className="tour-title">{zone.title}</h3>

                            <div className="zone-rewards-row">
                                <span className="reward-item-badge star">
                                    <Star size={12} className="inline-icon" /> {zone.xp}
                                </span>
                                <span className="reward-item-badge coin">
                                    <Coins size={12} className="inline-icon" /> {zone.coins}
                                </span>
                            </div>

                            <div className="tour-footer">
                                <div className="tour-rating">
                                    <Star size={11} className="inline-icon" /> {zone.rating}
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (isGuest) {
                                            onRequireLogin();
                                        } else if (onOpenLocationDetail) {
                                            onOpenLocationDetail({
                                                location_id: zone.location_id || null,
                                                location_name: zone.title,
                                                image_url: zone.image,
                                                address: zone.address || null,
                                                description: zone.description || null,
                                            });
                                        }
                                    }}
                                    className="explore-zone-btn squishy-btn yellow"
                                >
                                    Đi <ArrowRight size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showMascot && <Mascot message={mascotMessage} />}
        </div>
    );
};

export default HomeTravel;
