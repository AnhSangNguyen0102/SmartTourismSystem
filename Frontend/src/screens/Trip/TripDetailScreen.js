import React, { useState, useEffect, useRef } from 'react';
import { getTripDetail, checkinStop, completeTrip, cancelTrip } from '../../services/tripService';
import IslandMap from '../../components/IslandMap/IslandMap';
import LocationTasks from './LocationTasks';
import TaskDetail from './TaskDetail';
import './TripDetailScreen.css';
import LocationDetailMap from '../../components/LocationDetailMap/LocationDetailMap';
import Mascot from '../../components/Mascot/Mascot';
import TreasureOverlay from '../../components/TreasureOverlay/TreasureOverlay';
// Hidden Quest imports
import { getActiveTasks, pingLocation, verifyQuest, getActiveCampaigns, verifyCampaign } from '../../services/hiddenQuestService';
import { useSocialQuest } from '../../components/SocialQuest/SocialQuestProvider';
import ChestOpeningAnimation from '../../components/HiddenQuest/ChestOpeningAnimation';
import QuestQrScanner from '../../components/QuestQrScanner';
import { storageGet } from '../../platform/storage';
import { API_BASE } from '../../config/api';
import { showAlert, showConfirm, showToast } from '../../platform/dialog';
import { getCurrentPosition, startWatchingPosition } from '../../platform/location';
import { isMascotEnabled } from '../../config/uiFlags';
import { playSound } from '../../utils/soundUtils';
import { 
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, 
  MapPin, Sparkles, Coins, Star, Clock, Ticket, X, Check, Flame, Award, HelpCircle,
  QrCode, Camera
} from 'lucide-react';

const TripDetailScreen = ({ itineraryId, onBack, refreshUser, onPointsUpdate, user }) => {
    const { sendLocation } = useSocialQuest();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tripDetail, setTripDetail] = useState(null);
    const [userLocation, setUserLocation] = useState(null);

    // Gamification state variables
    const [selectedLocationForTasks, setSelectedLocationForTasks] = useState(null);
    const [locationTasksMap, setLocationTasksMap] = useState({});
    const [tasksLoadingMap, setTasksLoadingMap] = useState({});

    // Hidden Quest states
    const [, setHiddenTasks] = useState([]);
    const [selectedHiddenTask, setSelectedHiddenTask] = useState(null);
    const [showChestAnimation, setShowChestAnimation] = useState(false);
    const [showQuestModal, setShowQuestModal] = useState(false);
    const [, setQrTokenInput] = useState('');
    const [quizAnswer, setQuizAnswer] = useState('');
    const [photoUploaded, setPhotoUploaded] = useState(false);
    const [photoUrl, setPhotoUrl] = useState('');
    const [questLoading, setQuestLoading] = useState(false);
    const [questError, setQuestError] = useState('');
    const [questSuccess, setQuestSuccess] = useState(null);
    const [showMascot, setShowMascot] = useState(isMascotEnabled());

    useEffect(() => {
        const handleMascotChange = () => {
            setShowMascot(isMascotEnabled());
        };
        window.addEventListener('mascotSettingsChanged', handleMascotChange);
        return () => window.removeEventListener('mascotSettingsChanged', handleMascotChange);
    }, []);

    // States for Public Campaigns
    const [, setCampaigns] = useState([]);
    const [selectedCampaign] = useState(null);
    const [showCampaignModal, setShowCampaignModal] = useState(false);

    // Fetch active campaigns list
    const fetchActiveCampaigns = async (locationOverride = null, force = false) => {
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
            console.error('Lỗi lấy chiến dịch hoạt động:', err);
        }
    };

    const isMultiStepEvent = (item) => item?.event_mode === 'HIDDEN_MULTI_STEP' || item?.quest_type === 'MULTI_STEP';
    const getEventStep = (item, stepType) => item?.steps?.find((step) => step.step_type === stepType) || {};

    // Verify / Complete campaign endpoint trigger
    const handleVerifyCampaign = async (extraData = {}) => {
        if (!selectedCampaign || !userLocation) {
            setQuestError('Không xác định được vị trí GPS hiện tại!');
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
            playSound('success.mp3');
            setQuestSuccess(res);
            fetchActiveCampaigns(null, true);
        } catch (err) {
            playSound('error.mp3');
            setQuestError(err.message || 'Xác thực thất bại');
        } finally {
            setQuestLoading(false);
        }
    };
    const [selectedTaskForExecution, setSelectedTaskForExecution] = useState(null);

    const userId = user?.user_id || user?.id || '296be4b0-9556-42bb-9be1-fdb1277a06c2';

    const [selectedStop, setSelectedStop] = useState(null);
    const [checkinLoading, setCheckinLoading] = useState(false);
    const checkinInProgress = useRef(false);

    // Trip action states
    const [actionLoading, setActionLoading] = useState(false);

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

        const match = String(result?.detail || '').match(/(\d+)\s+điểm EXP thưởng lộ trình/);
        return match ? Number(match[1]) : null;
    };

    useEffect(() => {
        if (!tripDetail) return;
        if (tripDetail.status === 'COMPLETED') {
            setMascotMessage(["Chúc mừng bạn đã hoàn thành trọn vẹn hành trình tuyệt vời này!"]);
        } else {
            const introSequence = [
                "Chào mừng bạn đến với kỷ nguyên du lịch! Hãy cùng tôi khám phá mọi miền trên khắp đất nước Việt Nam.",
                "Trên bản đồ đảo này, mỗi tòa nhà tượng trưng cho một địa điểm thú vị mà bạn sẽ đi qua.",
                "Bạn có thể nhấn vào từng công trình để xem chi tiết và thực hiện check-in khi đến nơi.",
                "Chúc bạn có một chuyến đi thật vui vẻ! Nếu cần trợ giúp, hãy nhấn vào tôi nhé!"
            ];
            // Truyền toàn bộ chuỗi để Mascot phát lần lượt
            setMascotMessage(introSequence);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const fetchTasksForLocation = async (locId, silent = false) => {
        if (!locId || !itineraryId || !userId) return;
        try {
            if (!silent) {
                setTasksLoadingMap(prev => ({ ...prev, [locId]: true }));
            }
            const token = await storageGet('access_token');
            const response = await fetch(
                `${API_BASE}/api/gamification/locations/${locId}/tasks?itinerary_id=${itineraryId}&user_id=${userId}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );
            if (response.ok) {
                const data = await response.json();
                setLocationTasksMap(prev => ({ ...prev, [locId]: data }));
            }
        } catch (err) {
            console.error('Lỗi lấy nhiệm vụ của địa điểm:', err);
        } finally {
            if (!silent) {
                setTasksLoadingMap(prev => ({ ...prev, [locId]: false }));
            }
        }
    };

    useEffect(() => {
        if (selectedLocationForTasks && selectedLocationForTasks.location_id) {
            const locId = selectedLocationForTasks.location_id;
            const hasCached = !!locationTasksMap[locId];
            fetchTasksForLocation(locId, hasCached);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLocationForTasks?.location_id]);

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

    const handleRefresh = async (silent = false) => {
        await fetchDetail(silent);
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
    const lastFetchedLocationRef = useRef(null);
    const lastFetchedTimeRef = useRef(0);
    useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

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

    useEffect(() => {
        // Reset trạng thái check-in khi chuyển trip (tránh khóa nút từ trip cũ)
        checkinInProgress.current = false;
        setCheckinLoading(false);

        if (itineraryId) {
            fetchDetail();
            fetchHiddenTasks();
            fetchActiveCampaigns(null, true);
        }

        // Lắng nghe sự kiện chiến dịch mới từ doanh nghiệp
        const handleNewCampaignEvent = (event) => {
            const data = event.detail;
            void showAlert(`[Chiến dịch mới] "${data.title}" vừa được tạo gần bạn! Hãy khám phá trên bản đồ để check-in và nhận quà nhé!`);
            fetchActiveCampaigns(null, true);
        };

        window.addEventListener('new_campaign', handleNewCampaignEvent);

        // Theo dõi vị trí hiện tại của người dùng
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
            window.removeEventListener('new_campaign', handleNewCampaignEvent);
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
            title: 'Hoàn thành chuyến đi',
            okButtonTitle: 'Xác nhận',
            cancelButtonTitle: 'Hủy'
        });
        if (!confirmed) return;

        setActionLoading(true);
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
            showToast(result.detail || 'Chuyến đi đã được hoàn thành. Điểm thưởng đã được cộng vào tài khoản.', 'success');
            await Promise.all([fetchDetail(true), syncUserPoints()]);
        } catch (err) {
            showToast(err.message || 'Lỗi khi hoàn thành chuyến đi', 'error');
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
        try {
            const token = await storageGet('access_token');
            const result = await cancelTrip(itineraryId, token);
            showToast(result.detail || 'Chuyến đi đã được hủy.', 'success');
            // Refresh trip detail to get updated status
            await Promise.all([fetchDetail(true), syncUserPoints()]);
        } catch (err) {
            showToast(err.message || 'Lỗi khi hủy chuyến đi', 'error');
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

    const allStops = (tripDetail.stops || []);

    const handleCheckin = async (targetStop) => {
        // Guard: nếu đang xử lý thì không cho bấm nữa (tránh click đúp)
        if (!targetStop || checkinInProgress.current) return;
        checkinInProgress.current = true;
        setCheckinLoading(true);

        // Safety timeout: tự reset sau 12 giây nếu mọi thứ bị treo
        const safetyTimer = setTimeout(() => {
            if (checkinInProgress.current) {
                checkinInProgress.current = false;
                setCheckinLoading(false);
                showToast('Hết thời gian chờ. Vui lòng thử lại.', 'warning');
            }
        }, 12000);

        const executeCheckinAPI = async (lat, lng) => {
            try {
                const token = await storageGet('access_token');
                const checkedStopId = targetStop.stop_id;

                // Tự động nhận diện xem đây có phải trạm cuối cùng chưa check-in không
                const isLastStop = tripDetail.stops.filter(s => s.status !== 'COMPLETED').length === 1;

                // Gửi tọa độ lên Backend
                const result = await checkinStop(checkedStopId, {
                    latitude: lat,
                    longitude: lng
                }, token);

                clearTimeout(safetyTimer);

                const isCompleted = result.is_itinerary_completed || isLastStop;
                
                // 1. BÓC TÁCH RÕ RÀNG 2 LOẠI ĐIỂM
                // Điểm check-in trạm (hiển thị bay ra từ rương nhỏ)
                const earnedPoints = result.reward_points ?? result.earned_points ?? targetStop.reward ?? 10;
                
                // Điểm thưởng hoàn thành lộ trình (EXP và Xu)
                let compScore = result.completion_score;
                if (!compScore && result.message) {
                    const match = result.message.match(/nhận thêm \+(\d+)\s*EXP/i);
                    if (match) compScore = parseInt(match[1], 10);
                }
                const completionScore = compScore || 0;

                // 2. BẮT ĐẦU HIỆU ỨNG RƯƠNG CHO TRẠM (Luôn chạy dù là trạm nào)
                playSound('chest_shake.mp3');
                setRewardData({ 
                    points: earnedPoints,
                    coins: 20,
                    locationName: targetStop.location_name, 
                    stage: 'shaking' 
                });

                checkinInProgress.current = false;
                setCheckinLoading(false);

                // Mở rương sau 1.5 giây
                setTimeout(() => {
                    playSound('chest_open.mp3');
                    setRewardData(prev => prev ? { ...prev, stage: 'open' } : null);
                }, 1500);

                // 3. XỬ LÝ KẾT THÚC SAU KHI RƯƠNG BIẾN MẤT (4.5 giây)
                // 3. XỬ LÝ KẾT THÚC SAU KHI RƯƠNG BIẾN MẤT (4.5 giây)
                setTimeout(() => {
                    setRewardData(null);
                    setSelectedStop(null); 

                    // Cập nhật trạng thái cấu trúc state local
                    setTripDetail(prev => {
                        if (!prev) return prev;
                        const updatedStops = prev.stops.map(s =>
                            s.stop_id === checkedStopId ? { ...s, status: 'COMPLETED' } : s
                        );
                        return { 
                            ...prev, 
                            stops: updatedStops,
                            status: isCompleted ? 'COMPLETED' : prev.status,
                            score_earned: isCompleted ? completionScore : prev.score_earned
                        };
                    });
                    
                    if (isCompleted) {
                        // NẾU HOÀN THÀNH LỘ TRÌNH (Trạm cuối cùng được check-in xong)
                        playSound('victory.mp3');
                        
                        showToast(
                            `🎉 Lộ trình hoàn thành! Bạn nhận +${earnedPoints} EXP & +20 Xu (tại trạm này), cùng gói thưởng hoàn thành +${completionScore} EXP & Xu!`, 
                            'success'
                        );
                        
                        setMascotMessage(["Chúc mừng bạn đã hoàn thành trọn vẹn hành trình tuyệt vời này!"]);
                        
                        fetchDetail(true);
                        syncUserPoints();
                    } else {
                        // NẾU CHỈ LÀ TRẠM CHECK-IN THÔNG THƯỜNG TRÊN ĐƯỜNG ĐI
                        showToast(`✅ Khám phá thành công! Bạn nhận +${earnedPoints} EXP và +20 Xu thưởng trạm.`, 'success');
                        setMascotMessage(`Chúc mừng bạn đã khám phá được địa điểm ${targetStop.location_name}!`);
                        syncUserPoints();
                    }

                }, 4500);

            } catch (err) {
                clearTimeout(safetyTimer);
                showToast(err.message || 'Có lỗi xảy ra khi check-in.', 'error');
                checkinInProgress.current = false;
                setCheckinLoading(false);
            }
        };

        // 1. Lấy vị trí thực tế
        (async () => {
            try {
                let checkinLat = null;
                let checkinLng = null;

                if (window.isMockGpsActive && userLocation) {
                    checkinLat = userLocation.lat;
                    checkinLng = userLocation.lng;
                } else {
                    const position = await getCurrentPosition({
                        enableHighAccuracy: false,
                        timeout: 8000,
                        maximumAge: 10000
                    });
                    checkinLat = position.latitude;
                    checkinLng = position.longitude;
                    setUserLocation({ lat: checkinLat, lng: checkinLng });
                    sendLocation(checkinLat, checkinLng);
                }

                executeCheckinAPI(checkinLat, checkinLng);
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
                }
            }
        })();
    };

    const renderContent = () => {
        if (selectedStop) {
            const stopInDetail = tripDetail.stops?.find(s => s.stop_id === selectedStop.stop_id) || selectedStop;
            const isCheckedIn = stopInDetail.status === 'COMPLETED';

            return (
                <div className="trip-detail-screen location-detail-mode">
                    <div className="location-detail-content" style={{ marginTop: 0 }}>
                        {/* Ảnh bìa địa điểm — ưu tiên ảnh thực từ API, fallback về ảnh bản đồ */}
                        <div className="location-cover-image" style={{ 
                            backgroundImage: `url(${stopInDetail.image_url || stopInDetail.cover_image || '/assets/island/map-dao.png'})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            position: 'relative'
                        }}>
                            <button 
                                onClick={handleCloseDetail} 
                                style={{
                                    position: 'absolute',
                                    top: '16px',
                                    left: '16px',
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                    border: '1.5px solid #2c3e50',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#2c3e50',
                                    zIndex: 10
                                }}
                            >
                                <ArrowLeft size={20} />
                            </button>
                            {isCheckedIn && (
                                <div className="status-badge checked-in-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle2 size={14} /> Đã Check-in
                                </div>
                            )}
                        </div>

                        <div className="location-info-card">
                            <div className="location-title-row">
                                <h3>{stopInDetail.location_name}</h3>
                                {stopInDetail.score != null && (
                                    <div className="rating-mock" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Star size={14} fill="#f1c40f" color="#f1c40f" />
                                        {Number(stopInDetail.score).toFixed(1)}
                                    </div>
                                )}
                            </div>

                            {/* Mô tả địa điểm — dùng data thực nếu có, không thì ẩn */}
                            {stopInDetail.description ? (
                                <p className="location-desc-mock">{stopInDetail.description}</p>
                            ) : stopInDetail.category_name ? (
                                <p className="location-desc-mock" style={{ fontStyle: 'italic', color: '#a0aab4' }}>
                                    📍 Loại hình: {stopInDetail.category_name}
                                </p>
                            ) : null}

                            <div className="location-meta">
                                {/* Giờ mở cửa từ dữ liệu thực */}
                                {(stopInDetail.open_time || stopInDetail.close_time) ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={14} /> Mở cửa: {stopInDetail.open_time
                                            ? stopInDetail.open_time.substring(0, 5)
                                            : '?'}
                                        {' - '}
                                        {stopInDetail.close_time
                                            ? stopInDetail.close_time.substring(0, 5)
                                            : '?'}
                                    </span>
                                ) : null}
                                {/* Giá vé từ dữ liệu thực */}
                                {stopInDetail.min_price != null ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Ticket size={14} />
                                        {Number(stopInDetail.min_price) === 0 && Number(stopInDetail.max_price) === 0
                                            ? 'Vé: Miễn phí'
                                            : `Giá: ${Number(stopInDetail.min_price).toLocaleString('vi-VN')}đ${stopInDetail.max_price && Number(stopInDetail.max_price) > 0 ? ` - ${Number(stopInDetail.max_price).toLocaleString('vi-VN')}đ` : ''}`
                                        }
                                    </span>
                                ) : null}
                                {/* Địa chỉ nếu có */}
                                {stopInDetail.address && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <MapPin size={14} /> {stopInDetail.address}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="location-map-section">
                            <h4>Bản đồ địa điểm</h4>
                            <LocationDetailMap
                                stop={stopInDetail}
                                userLocation={userLocation}
                            />
                        </div>
                        
                        <div className="location-action-bar" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                                {isCheckedIn ? (
                                    <button disabled style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'not-allowed', opacity: 0.6, flex: 1, display: 'flex', justifyContent: 'center', boxShadow: 'none', outline: 'none' }}>
                                        <img src="/assets/island/btn_checkin.png" alt="Đã Check-in" style={{ width: '100%', maxWidth: '160px', objectFit: 'contain', filter: 'grayscale(100%)' }} />
                                    </button>
                                ) : isTripOngoing ? (
                                    <button 
                                        className="image-btn-effect"
                                        onClick={() => handleCheckin(stopInDetail)}
                                        disabled={checkinLoading}
                                        style={{ background: 'transparent', border: 'none', padding: 0, cursor: checkinLoading ? 'not-allowed' : 'pointer', flex: 1, opacity: checkinLoading ? 0.7 : 1, display: 'flex', justifyContent: 'center', boxShadow: 'none', outline: 'none' }}
                                    >
                                        <img src="/assets/island/btn_checkin.png" alt="Xác nhận Check-in" style={{ width: '100%', maxWidth: '160px', objectFit: 'contain' }} />
                                    </button>
                                ) : (
                                    <button disabled style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'not-allowed', opacity: 0.5, flex: 1, display: 'flex', justifyContent: 'center', boxShadow: 'none', outline: 'none' }}>
                                        <img src="/assets/island/btn_checkin.png" alt="Không thể Check-in" style={{ width: '100%', maxWidth: '160px', objectFit: 'contain', filter: 'grayscale(100%)' }} />
                                    </button>
                                )}
                                <button
                                    className="image-btn-effect"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedLocationForTasks({
                                            location_id: stopInDetail.location_id,
                                            location_name: stopInDetail.location_name
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
                        </div>
                    </div>
                </div>
            );
        }

    return (
        <div className="trip-detail-screen">
            <div className="trip-overview-header">
                <button className="trip-overview-back-btn" onClick={onBack} aria-label="Quay lại" title="Quay lại">
                    <ArrowLeft size={20} />
                </button>
                <h2>{tripDetail.name || "Chi tiết chuyến đi"}</h2>
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

            {/* Bản đồ đảo dùng để chọn địa điểm trong chuyến đi */}
            <div className="island-map-section" style={{ position: 'relative' }}>
                <IslandMap
                    stops={allStops}
                    onBuildingClick={handleBuildingClick}
                />
                
                {/* Mascot Layer */}
                {showMascot && <Mascot message={mascotMessage} />}
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



            {/* GAMIFICATION OVERLAYS */}
            {selectedLocationForTasks && (
                <LocationTasks
                    locationId={selectedLocationForTasks.location_id}
                    locationName={selectedLocationForTasks.location_name}
                    itineraryId={itineraryId}
                    userId={userId}
                    tasks={locationTasksMap[selectedLocationForTasks.location_id] || []}
                    loading={
                        tasksLoadingMap[selectedLocationForTasks.location_id]
                        ?? !locationTasksMap[selectedLocationForTasks.location_id]
                    }
                    onClose={() => setSelectedLocationForTasks(null)}
                    onSelectTask={(task) => {
                        setSelectedTaskForExecution({
                            ...task,
                            location_id: task.location_id || selectedLocationForTasks.location_id,
                            location_name: task.location_name || selectedLocationForTasks.location_name
                        });
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
                        const taskId = selectedTaskForExecution.task_id;
                        const locId = selectedTaskForExecution.location_id;
                        
                        // Optimistically update status to COMPLETED
                        setLocationTasksMap(prev => {
                            const tasks = prev[locId] || [];
                            return {
                                ...prev,
                                [locId]: tasks.map(t =>
                                    t.task_id === taskId ? { ...t, status: 'COMPLETED' } : t
                                )
                            };
                        });

                        setSelectedTaskForExecution(null);
                        setSelectedLocationForTasks({
                            location_id: locId,
                            location_name: selectedTaskForExecution.location_name || 'Địa điểm'
                        });
                        // Refresh details to update points/levels in UI
                        handleRefresh(true);
                        fetchTasksForLocation(locId, true);
                    }}
                />
            )}

            {/* --- Campaign Overlays --- */}
            {showCampaignModal && selectedCampaign && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content">
                        <div className="quest-modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={18} style={{ color: '#e67e22' }} /> {selectedCampaign.title || 'Chiến dịch Doanh nghiệp'}</h3>
                            <button className="quest-close-btn" onClick={() => {
                                setShowCampaignModal(false);
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
                                    <p className="quest-desc">{selectedCampaign.description || 'Hoàn thành thử thách để nhận quà từ doanh nghiệp.'}</p>
                                    
                                    <div className="quest-meta-info">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Bán kính: {selectedCampaign.radius_meters}m</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={14} /> {selectedCampaign.reward_exp} EXP | <Coins size={14} /> {selectedCampaign.reward_coin} xu</span>
                                    </div>

                                    {isMultiStepEvent(selectedCampaign) && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Camera size={14} /> {getEventStep(selectedCampaign, 'PHOTO').prompt || 'Chụp ảnh check-in tại điểm sự kiện.'}</p>
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

                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '14px' }}><HelpCircle size={14} /> {getEventStep(selectedCampaign, 'QUIZ').prompt || 'Trả lời câu hỏi sự kiện.'}</p>
                                            <div className="quiz-options-grid">
                                                {['A', 'B', 'C', 'D'].map((code) => {
                                                    const step = getEventStep(selectedCampaign, 'QUIZ');
                                                    const text = step[`option_${code.toLowerCase()}`];
                                                    if (!text) return null;
                                                    return (
                                                        <button key={code} className={`quiz-option-card ${quizAnswer === code ? 'selected' : ''}`} onClick={() => setQuizAnswer(code)}>
                                                            <span className="option-code">{code}</span>
                                                            <span className="option-text">{text}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '14px' }}><QrCode size={14} /> Quét mã QR do doanh nghiệp cung cấp để hoàn thành sự kiện.</p>
                                            <QuestQrScanner
                                                loading={questLoading}
                                                disabled={!photoUploaded || !quizAnswer}
                                                buttonLabel="Quét QR và hoàn thành sự kiện"
                                                onScan={(token) => {
                                                    setQrTokenInput(token);
                                                    handleVerifyCampaign({ image_url: photoUrl, answer: quizAnswer, qr_token: token });
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* CHECKIN */}
                                    {!isMultiStepEvent(selectedCampaign) && selectedCampaign.quest_type === 'CHECKIN' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Hệ thống sẽ xác thực vị trí GPS của bạn.</p>
                                            <button className="quest-action-btn" onClick={() => handleVerifyCampaign()} disabled={questLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><MapPin size={16} /> Check-in ngay</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* QR */}
                                    {!isMultiStepEvent(selectedCampaign) && selectedCampaign.quest_type === 'QR' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><QrCode size={14} /> Quét mã QR tại doanh nghiệp để xác thực.</p>
                                            <QuestQrScanner
                                                loading={questLoading}
                                                buttonLabel="Quét QR"
                                                onScan={(token) => {
                                                    setQrTokenInput(token);
                                                    handleVerifyCampaign({ qr_token: token });
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* QUIZ */}
                                    {!isMultiStepEvent(selectedCampaign) && selectedCampaign.quest_type === 'QUIZ' && (
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
                                            <button className="quest-action-btn" onClick={() => handleVerifyCampaign({ answer: quizAnswer, correct_answer: 'A' })} disabled={questLoading || !quizAnswer} style={{ marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang gửi...' : <><Check size={16} /> Nộp đáp án</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* PHOTO */}
                                    {!isMultiStepEvent(selectedCampaign) && selectedCampaign.quest_type === 'PHOTO' && (
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
                                            <button className="quest-action-btn" onClick={() => handleVerifyCampaign({ image_url: photoUrl })} disabled={questLoading || !photoUploaded} style={{ marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><Check size={16} /> Xác nhận ảnh</>}
                                            </button>
                                        </div>
                                    )}

                                    {questError && <div className="quest-error-msg" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {questError}</div>}
                                </>
                            ) : (
                                <div className="quest-success-screen">
                                    <div className="success-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={48} style={{ color: '#2ed573' }} /></div>
                                    <h4>Chiến dịch hoàn thành!</h4>
                                    <p>Chúc mừng bạn đã nhận được phần thưởng:</p>
                                    <div className="success-reward-card">
                                        <div className="success-reward-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Flame size={20} style={{ color: '#ff7f50' }} /><span><strong>+{questSuccess.reward_exp}</strong> EXP</span></div>
                                        <div className="success-reward-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Coins size={20} style={{ color: '#fbc531' }} /><span><strong>+{questSuccess.reward_coin}</strong> xu</span></div>
                                    </div>
                                    <button className="quest-close-success-btn" onClick={() => {
                                        setShowCampaignModal(false);
                                        setQuestSuccess(null);
                                        setQrTokenInput('');
                                        setQuizAnswer('');
                                        setPhotoUploaded(false);
                                        setPhotoUrl('');
                                        syncUserPoints();
                                    }}>Tuyệt vời! Tiếp tục hành trình</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
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
                        syncUserPoints();
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

                                    {isMultiStepEvent(selectedHiddenTask) && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Camera size={14} /> {getEventStep(selectedHiddenTask, 'PHOTO').prompt || 'Chụp ảnh check-in tại điểm sự kiện.'}</p>
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
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '14px' }}><HelpCircle size={14} /> {getEventStep(selectedHiddenTask, 'QUIZ').prompt || 'Trả lời câu hỏi sự kiện.'}</p>
                                            <div className="quiz-options-grid">
                                                {['A', 'B', 'C', 'D'].map((code) => {
                                                    const step = getEventStep(selectedHiddenTask, 'QUIZ');
                                                    const text = step[`option_${code.toLowerCase()}`];
                                                    if (!text) return null;
                                                    return (
                                                        <button key={code} className={`quiz-option-card ${quizAnswer === code ? 'selected' : ''}`} onClick={() => setQuizAnswer(code)}>
                                                            <span className="option-code">{code}</span>
                                                            <span className="option-text">{text}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '14px' }}><QrCode size={14} /> Quét mã QR do doanh nghiệp cung cấp để hoàn thành sự kiện.</p>
                                            <QuestQrScanner
                                                loading={questLoading}
                                                disabled={!photoUploaded || !quizAnswer}
                                                buttonLabel="Quét QR và hoàn thành sự kiện"
                                                onScan={(token) => {
                                                    setQrTokenInput(token);
                                                    handleVerifyQuest({ image_url: photoUrl, answer: quizAnswer, qr_token: token });
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* CHECKIN */}
                                    {!isMultiStepEvent(selectedHiddenTask) && selectedHiddenTask.quest_type === 'CHECKIN' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Hệ thống sẽ xác thực vị trí GPS của bạn.</p>
                                            <button className="quest-action-btn" onClick={() => handleVerifyQuest()} disabled={questLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><MapPin size={16} /> Check-in ngay</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* QR */}
                                    {!isMultiStepEvent(selectedHiddenTask) && selectedHiddenTask.quest_type === 'QR' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><QrCode size={14} /> Quét mã QR tại doanh nghiệp để xác thực.</p>
                                            <QuestQrScanner
                                                loading={questLoading}
                                                buttonLabel="Quét QR"
                                                onScan={(token) => {
                                                    setQrTokenInput(token);
                                                    handleVerifyQuest({ qr_token: token });
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* QUIZ */}
                                    {!isMultiStepEvent(selectedHiddenTask) && selectedHiddenTask.quest_type === 'QUIZ' && (
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
                                    {!isMultiStepEvent(selectedHiddenTask) && selectedHiddenTask.quest_type === 'PHOTO' && (
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
                                    <button className="quest-close-success-btn" onClick={() => { setShowQuestModal(false); setQuestSuccess(null); setQrTokenInput(''); setQuizAnswer(''); setPhotoUploaded(false); setPhotoUrl(''); syncUserPoints(); }}>
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
