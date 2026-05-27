import React, { useState, useEffect, useRef } from 'react';
import { getTripDetail, getDeviationStatus, checkinStop, completeTrip, cancelTrip } from '../../services/tripService';
import IslandMap from '../../components/IslandMap/IslandMap';
import LocationTasks from './LocationTasks';
import TaskDetail from './TaskDetail';
import './TripDetailScreen.css';
import RouteMap from '../../components/RouteMap/RouteMap';
import Mascot from '../../components/Mascot/Mascot';
import TreasureOverlay from '../../components/TreasureOverlay/TreasureOverlay';
// Hidden Quest imports
import { getActiveTasks, pingLocation, verifyQuest } from '../../services/hiddenQuestService';
import ChestOpeningAnimation from '../../components/HiddenQuest/ChestOpeningAnimation';
import HiddenQuestDebug from '../../components/HiddenQuest/HiddenQuestDebug';
import { storageGet } from '../../platform/storage';
import { showAlert, showConfirm } from '../../platform/dialog';
import { getCurrentPosition, startWatchingPosition } from '../../platform/location';
import { SHOW_MASCOT } from '../../config/uiFlags';
import { playSound } from '../../utils/soundUtils';
import { 
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, 
  MapPin, Sparkles, Coins, Star, Clock, Ticket, Gamepad2, X, Check, Flame, Award, HelpCircle,
  QrCode, Camera
} from 'lucide-react';

const TripDetailScreen = ({ itineraryId, onBack, refreshUser, onPointsUpdate, user }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tripDetail, setTripDetail] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [mapViewMode, setMapViewMode] = useState('island'); // 'island' | 'route'

    // Gamification state variables
    const [selectedLocationForTasks, setSelectedLocationForTasks] = useState(null);

    // Hidden Quest states
    const [hiddenTasks, setHiddenTasks] = useState([]);
    const [selectedHiddenTask, setSelectedHiddenTask] = useState(null);
    const [showChestAnimation, setShowChestAnimation] = useState(false);
    const [showQuestModal, setShowQuestModal] = useState(false);
    const [qrTokenInput, setQrTokenInput] = useState('');
    const [quizAnswer, setQuizAnswer] = useState('');
    const [photoUploaded, setPhotoUploaded] = useState(false);
    const [photoUrl, setPhotoUrl] = useState('');
    const [questLoading, setQuestLoading] = useState(false);
    const [questError, setQuestError] = useState('');
    const [questSuccess, setQuestSuccess] = useState(null);
    const [selectedTaskForExecution, setSelectedTaskForExecution] = useState(null);

    const userId = user?.user_id || user?.id || '296be4b0-9556-42bb-9be1-fdb1277a06c2';

    // Deviation state — updated by click (demo) OR by fetching from backend (real)
    const [selectedStop, setSelectedStop] = useState(null);
    const [isDeviated, setIsDeviated] = useState(false);
    const [checkinLoading, setCheckinLoading] = useState(false);
    const [checkinMsg, setCheckinMsg] = useState('');
    const checkinInProgress = useRef(false);

    // Trip action states
    const [actionLoading, setActionLoading] = useState(false);
    const [actionMsg, setActionMsg] = useState('');

    const [cloudState, setCloudState] = useState('idle');
    const [mascotMessage, setMascotMessage] = useState('');
    const [rewardData, setRewardData] = useState(null);

    const syncUserPoints = async () => {
        const callbacks = [onPointsUpdate, refreshUser]
            .filter(callback => typeof callback === 'function');
        await Promise.all([...new Set(callbacks)].map(callback => callback()));
    };

    const extractCompletionScore = (result) => {
        const directScore = Number(result?.completion_score ?? result?.score_earned);
        if (Number.isFinite(directScore)) return directScore;

        const match = String(result?.detail || '').match(/(\d+)\s+điểm thưởng lộ trình/);
        return match ? Number(match[1]) : null;
    };

    useEffect(() => {
        if (!tripDetail) return;
        if (tripDetail.status === 'COMPLETED') {
            setMascotMessage(["Chúc mừng bạn đã hoàn thành trọn vẹn hành trình tuyệt vời này!"]);
        } else {
            const introSequence = [
                " Chào mừng bạn đến với kỷ nguyên du lịch! Hãy cùng tôi khám phá mọi miền trên khắp đất nước Việt Nam.",
                " Trên bản đồ đảo này, mỗi tòa nhà tượng trưng cho một địa điểm thú vị mà bạn sẽ đi qua.",
                " Bạn có thể nhấn vào từng công trình để xem chi tiết và thực hiện check-in khi đến nơi.",
                " Chúc bạn có một chuyến đi thật vui vẻ! Nếu cần trợ giúp, hãy nhấn vào tôi nhé!"
            ];
            // Truyền toàn bộ chuỗi để Mascot phát lần lượt
            setMascotMessage(introSequence);
        }
    }, [tripDetail?.itinerary_id, tripDetail?.status]);

    const handleBuildingClick = (stop) => {
        if (cloudState !== 'idle') return;
        setCloudState('in');
        setTimeout(() => {
            setSelectedStop(stop);
            setCloudState('out');
            setTimeout(() => setCloudState('idle'), 600);
        }, 500);
    };

    const handleCloseDetail = () => {
        if (cloudState !== 'idle') return;
        setCloudState('in');
        setTimeout(() => {
            setSelectedStop(null);
            setCloudState('out');
            setTimeout(() => setCloudState('idle'), 600);
        }, 500);
    };

    const fetchDetail = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const token = await storageGet('access_token');
            const data = await getTripDetail(itineraryId, token);
            setTripDetail(prev => {
                if (!prev || prev.itinerary_id !== data.itinerary_id) return data;
                return {
                    ...data,
                    score_earned: data.score_earned ?? prev.score_earned
                };
            });
        } catch (err) {
            if (!silent) setError(err.message || "Không thể tải chi tiết chuyến đi");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchDeviationStatus = async () => {
        try {
            const token = await storageGet('access_token');
            const result = await getDeviationStatus(itineraryId, token);
            setIsDeviated(result.is_deviated);
        } catch (err) {
            console.error("Lỗi khi lấy trạng thái lệch hướng:", err);
        }
    };

    const handleRefresh = async (silent = false) => {
        await Promise.all([fetchDetail(silent), fetchDeviationStatus()]);
    };

    // Fetch active hidden tasks
    const fetchHiddenTasks = async () => {
        try {
            const tasks = await getActiveTasks();
            setHiddenTasks(tasks);
        } catch (err) {
            console.error('Lỗi lấy nhiệm vụ ẩn:', err);
        }
    };

    // Handle hidden task click from map marker
    const handleHiddenTaskClick = (task) => {
        setSelectedHiddenTask(task);
        if (task.task_type === 'CHEST') {
            setShowChestAnimation(true);
        } else if (task.task_type === 'DYNAMIC_QUEST') {
            setShowQuestModal(true);
        }
    };

    // Verify / Complete a dynamic quest
    const handleVerifyQuest = async (extraData = {}) => {
        if (!selectedHiddenTask || !userLocation) {
            setQuestError('Không xác định được vị trí GPS hiện tại!');
            return;
        }
        setQuestLoading(true);
        setQuestError('');
        try {
            const res = await verifyQuest(
                selectedHiddenTask.spawn_id,
                userLocation.lat,
                userLocation.lng,
                selectedHiddenTask.quest_type,
                extraData
            );
            playSound('success.mp3');
            setQuestSuccess(res);
            fetchHiddenTasks();
        } catch (err) {
            playSound('error.mp3');
            setQuestError(err.message || 'Xác thực thất bại');
        } finally {
            setQuestLoading(false);
        }
    };

    const userLocationRef = useRef(userLocation);
    useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

    useEffect(() => {
        // Reset trạng thái check-in khi chuyển trip (tránh khóa nút từ trip cũ)
        checkinInProgress.current = false;
        setCheckinLoading(false);
        setCheckinMsg('');
        setActionMsg('');

        if (itineraryId) {
            fetchDetail();
            fetchDeviationStatus();
            fetchHiddenTasks();
        }

        // Theo dõi vị trí hiện tại của người dùng
        const stopWatching = startWatchingPosition({
            onSuccess: (position) => {
                setUserLocation({
                    lat: position.latitude,
                    lng: position.longitude
                });
            },
            onError: (geoError) => console.warn("Không thể lấy vị trí:", geoError),
            options: {
                enableHighAccuracy: false,
                timeout: 20000,
                maximumAge: 60000
            }
        });

        // Ping GPS định kỳ mỗi 30 giây để kích hoạt spawn
        const pingInterval = setInterval(async () => {
            const currentLoc = userLocationRef.current;
            if (currentLoc && currentLoc.lat && currentLoc.lng) {
                try {
                    const res = await pingLocation(currentLoc.lat, currentLoc.lng);
                    if (res.spawned) {
                        fetchHiddenTasks();
                    }
                } catch (err) {
                    console.error('Lỗi ping vị trí:', err);
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
    }, [itineraryId]);

    // Determine if trip is ongoing (can be completed/cancelled)
    const isTripOngoing = tripDetail && (tripDetail.status === 'DRAFT' || tripDetail.status === 'CONFIRMED');
    const isTripCompleted = tripDetail && tripDetail.status === 'COMPLETED';
    const isTripCancelled = tripDetail && tripDetail.status === 'CANCELLED';

    const getStatusLabel = () => { // eslint-disable-line no-unused-vars
        if (isTripCompleted) return { text: 'Hoàn thành', className: 'status-completed' };
        if (isTripCancelled) return { text: 'Đã hủy', className: 'status-cancelled' };
        return { text: 'Đang diễn ra', className: 'status-ongoing' };
    };

    const handleCompleteTrip = async () => {
        const confirmed = await showConfirm('Bạn có chắc chắn muốn hoàn thành chuyến đi này không?', {
            title: 'Hoàn thành lịch trình',
            okButtonTitle: 'Xác nhận',
            cancelButtonTitle: 'Huỷ'
        });
        if (!confirmed) return;

        setActionLoading(true);
        setActionMsg('');
        try {
            const token = await storageGet('access_token');
            const result = await completeTrip(itineraryId, token);
            const completionScore = extractCompletionScore(result);

            setTripDetail(prev => prev ? {
                ...prev,
                status: 'COMPLETED',
                score_earned: completionScore ?? prev.score_earned
            } : prev);
            playSound('victory.mp3');
            setActionMsg(result.detail || 'Chuyến đi đã được hoàn thành. Điểm thưởng đã được cộng vào tài khoản.');
            await Promise.all([fetchDetail(true), syncUserPoints()]);
        } catch (err) {
            setActionMsg(err.message || 'Lỗi khi hoàn thành chuyến đi');
            setTimeout(() => setActionMsg(''), 5000);
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelTrip = async () => {
        const confirmed = await showConfirm('Bạn có chắc chắn muốn hủy chuyến đi này không? Hành động này không thể hoàn tác.', {
            title: 'Huỷ chuyến đi',
            okButtonTitle: 'Xác nhận',
            cancelButtonTitle: 'Huỷ'
        });
        if (!confirmed) return;

        setActionLoading(true);
        setActionMsg('');
        try {
            const token = await storageGet('access_token');
            const result = await cancelTrip(itineraryId, token);
            setActionMsg(result.detail || 'Chuyến đi đã được hủy.');
            // Refresh trip detail to get updated status
            await Promise.all([fetchDetail(true), syncUserPoints()]);
        } catch (err) {
            setActionMsg(err.message || 'Lỗi khi hủy chuyến đi');
            setTimeout(() => setActionMsg(''), 5000);
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="trip-detail-screen loading">
                <div className="spinner"></div>
                <p>Đang tải chi tiết chuyến đi...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="trip-detail-screen error">
                <h3>Lỗi</h3>
                <p>{error}</p>
                <button className="btn-back" onClick={onBack}>Quay lại</button>
            </div>
        );
    }

    if (!tripDetail) return null;

    // Nhóm các điểm dừng theo ngày
    const allStops = (tripDetail.stops || []);
    const stopsByDay = allStops.reduce((acc, stop) => {
        const day = stop.day_order;
        if (!acc[day]) acc[day] = [];
        acc[day].push(stop);
        return acc;
    }, {});

    // Find the first PENDING stop = "next" stop
    const sortedStops = [...allStops].sort((a, b) => a.stop_order - b.stop_order);
    const nextStop = sortedStops.find(s => s.status === 'PENDING' || s.status === 'VISITING');

    // Determine stop card color class
    const getStopColorClass = (stop) => {
        if (stop.status === 'COMPLETED') return 'stop-completed';    // green
        if (nextStop && stop.stop_id === nextStop.stop_id) return 'stop-next';  // orange
        return 'stop-default'; // blue
    };

    const handleCheckin = async (targetStop) => {
        // Guard: nếu đang xử lý thì không cho bấm nữa (tránh click đúp)
        if (!targetStop || checkinInProgress.current) return;
        checkinInProgress.current = true;
        setCheckinLoading(true);
        setCheckinMsg('');

        // Safety timeout: tự reset sau 12 giây nếu mọi thứ bị treo
        const safetyTimer = setTimeout(() => {
            if (checkinInProgress.current) {
                checkinInProgress.current = false;
                setCheckinLoading(false);
                setCheckinMsg('Hết thời gian chờ. Vui lòng thử lại.');
            }
        }, 12000);

        const executeCheckinAPI = async (lat, lng) => {
            try {
                const token = await storageGet('access_token');
                const checkedStopId = targetStop.stop_id;

                // Gửi tọa độ lên Backend (có thể null nếu fallback)
                const result = await checkinStop(checkedStopId, {
                    latitude: lat,
                    longitude: lng
                }, token);

                clearTimeout(safetyTimer);
                
                // Lấy điểm thưởng từ API (nếu có) hoặc từ thông tin trạm
                const earnedPoints = result.reward_points ?? result.earned_points ?? targetStop.reward ?? 50;

                playSound('chest_shake.mp3');
                // Hiển thị hiệu ứng rương kho báu đang rung
                setRewardData({ 
                    points: earnedPoints, 
                    locationName: targetStop.location_name, 
                    stage: 'shaking' 
                });

// Mở rương sau 1.5 giây
                checkinInProgress.current = false;
                setCheckinLoading(false);

                setTimeout(() => setCheckinMsg(''), 2000);

                setTimeout(() => {
                    playSound('chest_open.mp3');
                    setRewardData(prev => prev ? { ...prev, stage: 'open' } : null);
                }, 1500);

                // Đóng hiệu ứng sau 4.5 giây và trở về bản đồ
                setTimeout(() => {
                    setRewardData(null);
                    setCheckinMsg(''); // Xóa tin nhắn toast (nếu có)
                    
                    setSelectedStop(null); // Trở về map

                    // OPTIMISTIC UPDATE: Cập nhật state local ngay lập tức
                    setTripDetail(prev => {
                        if (!prev) return prev;
                        const updatedStops = prev.stops.map(s =>
                            s.stop_id === checkedStopId
                                ? { ...s, status: 'COMPLETED' }
                                : s
                        );
                        const allDone = updatedStops.every(s => s.status === 'COMPLETED');
                        return {
                            ...prev,
                            stops: updatedStops,
                            status: allDone ? 'COMPLETED' : prev.status
                        };
                    });
                    
                    // Mascot chúc mừng
                    setMascotMessage(`Chúc mừng bạn đã khám phá được địa điểm ${targetStop.location_name} trong hành trình du lịch của mình!`);

                    checkinInProgress.current = false;
                    setCheckinLoading(false);
                    syncUserPoints();
                }, 4500);

            } catch (err) {
                clearTimeout(safetyTimer);
                setCheckinMsg(err.message);
                checkinInProgress.current = false;
                setCheckinLoading(false);
            }
        };

        // 1. Lấy vị trí thực tế
        (async () => {
            try {
                const position = await getCurrentPosition({
                    enableHighAccuracy: false,
                    timeout: 8000,
                    maximumAge: 10000
                });

                setUserLocation({ lat: position.latitude, lng: position.longitude });
                executeCheckinAPI(position.latitude, position.longitude);
            } catch (error) {
                // FALLBACK: Khi lỗi vị trí (như timeout trên máy tính), cho phép check-in không cần tọa độ
                console.warn("Lỗi lấy vị trí:", error?.message || error);
                const confirmed = await showConfirm(
                    `Không thể lấy vị trí tự động (${error?.message || 'Unknown error'}). Bạn có muốn tiếp tục Check-in bỏ qua xác thực vị trí không?`,
                    {
                        title: 'Xác thực vị trí',
                        okButtonTitle: 'Tiếp tục',
                        cancelButtonTitle: 'Huỷ'
                    }
                );

                if (confirmed) {
                    executeCheckinAPI(parseFloat(targetStop.latitude) || 0, parseFloat(targetStop.longitude) || 0);
                } else {
                    clearTimeout(safetyTimer);
                    checkinInProgress.current = false;
                    setCheckinLoading(false);
                    setCheckinMsg('Đã hủy check-in');
                }
            }
        })();
    };

    const renderContent = () => {
        if (selectedStop) {
            const isCheckedIn = selectedStop.status === 'COMPLETED';

            return (
                <div className="trip-detail-screen location-detail-mode">
                    <div className="detail-header">
                        <button className="btn-back-icon" onClick={handleCloseDetail} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ArrowLeft size={18} />
                        </button>
                        <h2>{selectedStop.location_name}</h2>
                    </div>
                    
                    <div className="location-detail-content">
                        {/* Ảnh minh họa giả lập (mock image) */}
                        <div className="location-cover-image" style={{ 
                            backgroundImage: `url('/assets/island/map-dao.png')` 
                        }}>
                            {isCheckedIn && (
                                <div className="status-badge checked-in-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle2 size={14} /> Đã Check-in
                                </div>
                            )}
                        </div>

                        <div className="location-info-card">
                            <div className="location-title-row">
                                <h3>{selectedStop.location_name}</h3>
                                <div className="rating-mock" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Star size={14} fill="#f1c40f" color="#f1c40f" /> 4.8 <span>(124 đánh giá)</span>
                                </div>
                            </div>
                            
                            <p className="location-desc-mock">
                                Một địa điểm tuyệt vời không thể bỏ qua trong hành trình của bạn. Nơi đây mang đậm dấu ấn văn hóa và lịch sử, hứa hẹn đem lại những trải nghiệm thú vị.
                            </p>

                            <div className="location-meta">
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> Mở cửa: 08:00 - 17:00</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Ticket size={14} /> Vé: Miễn phí</span>
                            </div>
                        </div>

                        <div className="location-map-section">
                            <h4>Bản đồ & Chỉ đường</h4>
                            <RouteMap 
                                stops={[selectedStop]} 
                                routes={[]} 
                                hiddenTasks={hiddenTasks}
                                userLocation={userLocation}
                                user={user}
                                nextStop={selectedStop}
                                onStopClick={setSelectedStop}
                                onHiddenTaskClick={(task) => {
                                setSelectedHiddenTask(task);
                                setShowChestAnimation(true);
                            }}
                            />
                        </div>
                        
                        <div className="location-action-bar" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                                {isCheckedIn ? (
                                    <button disabled style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'not-allowed', opacity: 0.6, flex: 1, display: 'flex', justifyContent: 'center', boxShadow: 'none', outline: 'none' }}>
                                        <img src="/assets/island/btn_checkin.png" alt="Đã Check-in" style={{ width: '100%', maxWidth: '160px', objectFit: 'contain' }} />
                                    </button>
                                ) : (
                                    isTripOngoing && (
                                        <button 
                                            className="image-btn-effect"
                                            onClick={() => handleCheckin(selectedStop)}
                                            disabled={checkinLoading}
                                            style={{ background: 'transparent', border: 'none', padding: 0, cursor: checkinLoading ? 'not-allowed' : 'pointer', flex: 1, opacity: checkinLoading ? 0.7 : 1, display: 'flex', justifyContent: 'center', boxShadow: 'none', outline: 'none' }}
                                        >
                                            <img src="/assets/island/btn_checkin.png" alt="Xác nhận Check-in" style={{ width: '100%', maxWidth: '160px', objectFit: 'contain' }} />
                                        </button>
                                    )
                                )}
                                <button
                                    className="image-btn-effect"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedLocationForTasks({
                                            location_id: selectedStop.location_id,
                                            location_name: selectedStop.location_name
                                        });
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        flex: 1,
                                        display: 'flex',
                                        justifyContent: 'center',
                                        boxShadow: 'none',
                                        outline: 'none'
                                    }}
                                >
                                    <img src="/assets/island/btn_mission.png" alt="Nhiệm vụ địa điểm" style={{ width: '100%', maxWidth: '160px', objectFit: 'contain' }} />
                                </button>
                            </div>
                            {checkinMsg && (
                                <div className="checkin-toast">{checkinMsg}</div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

    return (
        <div className="trip-detail-screen">
            <div className="detail-header">
                <button className="btn-back-icon" onClick={onBack} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowLeft size={20} />
                </button>
                <h2>{tripDetail.name || "Chi tiết chuyến đi"}</h2>
                {/* Deviation status badge — click to toggle for demo */}
                {isTripOngoing && (
                    <div
                        className={`deviation-badge ${isDeviated ? 'deviated' : 'on-track'}`}
                        onClick={() => setIsDeviated(!isDeviated)}
                        title="Nhấn để chuyển trạng thái (demo)"
                    >
                        <span className="badge-dot"></span>
                        <span className="badge-text">{isDeviated ? 'Lệch hướng' : 'Đúng hướng'}</span>
                    </div>
                )}
            </div>

            {/* Trip action buttons — Hoàn thành / Hủy */}
            {isTripOngoing && (
                <div className="trip-action-section">
                    <button
                        className="btn-complete-trip"
                        onClick={handleCompleteTrip}
                        disabled={actionLoading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                        {actionLoading ? 'Đang xử lý...' : <><CheckCircle2 size={16} /> Hoàn thành lịch trình</>}
                    </button>
                    <button
                        className="btn-cancel-trip"
                        onClick={handleCancelTrip}
                        disabled={actionLoading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                        {actionLoading ? 'Đang xử lý...' : <><XCircle size={16} /> Hủy chuyến đi</>}
                    </button>
                </div>
            )}

            {actionMsg && (
                <div className="action-toast">{actionMsg}</div>
            )}

            {!actionMsg && isTripCompleted && (
                <div className="action-toast">
                    {tripDetail.score_earned
                        ? `Chuyến đi đã hoàn thành. Bạn nhận được ${tripDetail.score_earned} điểm thưởng lộ trình.`
                        : 'Chuyến đi đã hoàn thành. Điểm thưởng đã được cộng vào tài khoản.'}
                </div>
            )}
            
            {checkinMsg && (
                <div className="checkin-toast">{checkinMsg}</div>
            )}

            {/* Bản đồ Đảo (Island Map) thay thế RouteMap */}
            <div className="island-map-section" style={{ position: 'relative' }}>
                <IslandMap
                    stops={allStops}
                    onBuildingClick={handleBuildingClick}
                />
                
                {/* Mascot Layer */}
                {SHOW_MASCOT && <Mascot message={mascotMessage} />}
            </div>
        </div>
        );
    };

    return (
        <>
            {renderContent()}
            <div className={`cloud-transition-container ${cloudState}`}>
                <div className="cloud cloud-left"></div>
                <div className="cloud cloud-right"></div>
            </div>
            
            {/* Treasure Overlay */}
            <TreasureOverlay data={rewardData} />

            <HiddenQuestDebug
                userLocation={userLocation}
                onSpawnSuccess={fetchHiddenTasks}
                onTestClaim={(testTask) => {
                    setSelectedHiddenTask(testTask);
                    setShowChestAnimation(true);
                }}
            />

            {/* GAMIFICATION OVERLAYS */}
            {selectedLocationForTasks && (
                <LocationTasks
                    locationId={selectedLocationForTasks.location_id}
                    locationName={selectedLocationForTasks.location_name}
                    itineraryId={itineraryId}
                    userId={userId}
                    onClose={() => setSelectedLocationForTasks(null)}
                    onSelectTask={(task) => {
                        setSelectedTaskForExecution(task);
                        setSelectedLocationForTasks(null); // Close task drawer when opening detail
                    }}
                />
            )}

            {selectedTaskForExecution && (
                <TaskDetail
                    task={selectedTaskForExecution}
                    userId={userId}
                    itineraryId={itineraryId}
                    onBack={() => {
                        setSelectedTaskForExecution(null);
                        // Re-open location tasks drawer when backing out
                        setSelectedLocationForTasks({
                            location_id: selectedTaskForExecution.location_id,
                            location_name: selectedTaskForExecution.location_name || 'Địa điểm'
                        });
                    }}
                    onCompleteSuccess={() => {
                        setSelectedTaskForExecution(null);
                        setSelectedLocationForTasks({
                            location_id: selectedTaskForExecution.location_id,
                            location_name: selectedTaskForExecution.location_name || 'Địa điểm'
                        });
                        // Refresh details to update points/levels in UI
                        handleRefresh(true);
                    }}
                />
            )}

            {/* --- Hidden Quest Overlays --- */}
            {showChestAnimation && selectedHiddenTask && (
                <ChestOpeningAnimation 
                    task={selectedHiddenTask} 
                    userLocation={userLocation}
                    onClose={() => {
                        setShowChestAnimation(false);
                        setSelectedHiddenTask(null);
                    }}
                    onClaim={(rewards) => {
                        void showAlert(`Chúc mừng! Bạn nhận được +${rewards.reward_exp} EXP và +${rewards.reward_coin} xu!`);
                        fetchHiddenTasks();
                    }}
                />
            )}

            {showQuestModal && selectedHiddenTask && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content">
                        <div className="quest-modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={18} style={{ color: '#fbc531' }} /> {selectedHiddenTask.title || 'Sự kiện Doanh nghiệp'}</h3>
                            <button className="quest-close-btn" onClick={() => {
                                setShowQuestModal(false);
                                setQuestError('');
                                setQuestSuccess(null);
                                setQrTokenInput('');
                                setQuizAnswer('');
                                setPhotoUploaded(false);
                                setPhotoUrl('');
                            }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
                        </div>
                        
                        <div className="quest-modal-body">
                            {!questSuccess ? (
                                <>
                                    <p className="quest-desc">{selectedHiddenTask.description || 'Hoàn thành thử thách để nhận quà từ doanh nghiệp.'}</p>
                                    
                                    <div className="quest-meta-info">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Bán kính: {selectedHiddenTask.radius_meters}m</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={14} /> {selectedHiddenTask.reward_exp} EXP | <Coins size={14} /> {selectedHiddenTask.reward_coin} xu</span>
                                    </div>

                                    {/* CHECKIN */}
                                    {selectedHiddenTask.quest_type === 'CHECKIN' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Hệ thống sẽ xác thực vị trí GPS của bạn.</p>
                                            <button className="quest-action-btn" onClick={() => handleVerifyQuest()} disabled={questLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><MapPin size={16} /> Check-in ngay</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* QR */}
                                    {selectedHiddenTask.quest_type === 'QR' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><QrCode size={14} /> Nhập mã token hoặc quét QR:</p>
                                            <input type="text" className="quest-input" placeholder="QR_EVENT_TOKEN_123" value={qrTokenInput} onChange={(e) => setQrTokenInput(e.target.value)} />
                                            <button className="quest-action-btn" onClick={() => handleVerifyQuest({ qr_token: qrTokenInput })} disabled={questLoading || !qrTokenInput.trim()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><Check size={16} /> Xác nhận mã QR</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* QUIZ */}
                                    {selectedHiddenTask.quest_type === 'QUIZ' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><HelpCircle size={14} /> Trả lời câu hỏi:</p>
                                            <div className="quiz-options-grid">
                                                {[
                                                    { code: 'A', text: 'Dịch vụ lưu trú & Tour trọn gói' },
                                                    { code: 'B', text: 'Cho thuê phương tiện di chuyển' },
                                                    { code: 'C', text: 'Bán quà lưu niệm thủ công' },
                                                    { code: 'D', text: 'Ăn uống & Ẩm thực đường phố' }
                                                ].map((opt) => (
                                                    <button key={opt.code} className={`quiz-option-card ${quizAnswer === opt.code ? 'selected' : ''}`} onClick={() => setQuizAnswer(opt.code)}>
                                                        <span className="option-code">{opt.code}</span>
                                                        <span className="option-text">{opt.text}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <button className="quest-action-btn" onClick={() => handleVerifyQuest({ answer: quizAnswer, correct_answer: 'A' })} disabled={questLoading || !quizAnswer} style={{ marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang gửi...' : <><Check size={16} /> Nộp đáp án</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* PHOTO */}
                                    {selectedHiddenTask.quest_type === 'PHOTO' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Camera size={14} /> Chụp ảnh check-in:</p>
                                            {photoUploaded ? (
                                                <div className="photo-preview-box">
                                                    <img src={photoUrl} alt="Preview" />
                                                    <button className="photo-reset" onClick={() => { setPhotoUploaded(false); setPhotoUrl(''); }} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><X size={12} /> Xóa</button>
                                                </div>
                                            ) : (
                                                <div className="photo-upload-placeholder" onClick={() => { setPhotoUrl('/assets/island/map-dao.png'); setPhotoUploaded(true); }}>
                                                    <Camera size={32} style={{ color: '#a4b0be' }} />
                                                    <span>Chạm để tải lên / Chụp ảnh</span>
                                                </div>
                                            )}
                                            <button className="quest-action-btn" onClick={() => handleVerifyQuest({ image_url: photoUrl })} disabled={questLoading || !photoUploaded} style={{ marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><Check size={16} /> Xác nhận ảnh</>}
                                            </button>
                                        </div>
                                    )}

                                    {questError && <div className="quest-error-msg" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {questError}</div>}
                                </>
                            ) : (
                                <div className="quest-success-screen">
                                    <div className="success-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={48} style={{ color: '#2ed573' }} /></div>
                                    <h4>Thử thách hoàn thành!</h4>
                                    <p>Chúc mừng bạn đã nhận được phần thưởng:</p>
                                    <div className="success-reward-card">
                                        <div className="success-reward-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Flame size={20} style={{ color: '#ff7f50' }} /><span><strong>+{questSuccess.reward_exp}</strong> EXP</span></div>
                                        <div className="success-reward-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Coins size={20} style={{ color: '#fbc531' }} /><span><strong>+{questSuccess.reward_coin}</strong> Coin</span></div>
                                    </div>
                                    <button className="quest-close-success-btn" onClick={() => { setShowQuestModal(false); setQuestSuccess(null); setQrTokenInput(''); setQuizAnswer(''); setPhotoUploaded(false); setPhotoUrl(''); }}>
                                        Tuyệt vời! Tiếp tục hành trình
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>    );
};

export default TripDetailScreen;
