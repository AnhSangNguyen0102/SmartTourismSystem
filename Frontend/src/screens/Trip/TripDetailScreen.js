import React, { useState, useEffect, useRef } from 'react';
import { getTripDetail, getDeviationStatus, checkinStop } from '../../services/tripService';
import RouteMap from '../../components/RouteMap/RouteMap';
import './TripDetailScreen.css';

const TripDetailScreen = ({ itineraryId, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tripDetail, setTripDetail] = useState(null);
    const [userLocation, setUserLocation] = useState(null);

    // Deviation state — updated by click (demo) OR by fetching from backend (real)
    const [isDeviated, setIsDeviated] = useState(false);
    const [checkinLoading, setCheckinLoading] = useState(false);
    const [checkinMsg, setCheckinMsg] = useState('');
    const checkinInProgress = useRef(false);

    const fetchDetail = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const token = localStorage.getItem('access_token');
            const data = await getTripDetail(itineraryId, token);
            setTripDetail(data);
        } catch (err) {
            if (!silent) setError(err.message || "Không thể tải chi tiết chuyến đi");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchDeviationStatus = async () => {
        try {
            const token = localStorage.getItem('access_token');
            const result = await getDeviationStatus(itineraryId, token);
            setIsDeviated(result.is_deviated);
        } catch (err) {
            console.error("Lỗi khi lấy trạng thái lệch hướng:", err);
        }
    };

    const handleRefresh = async (silent = false) => {
        await Promise.all([fetchDetail(silent), fetchDeviationStatus()]);
    };

    useEffect(() => {
        // Reset trạng thái check-in khi chuyển trip (tránh khóa nút từ trip cũ)
        checkinInProgress.current = false;
        setCheckinLoading(false);
        setCheckinMsg('');

        if (itineraryId) {
            fetchDetail();
            fetchDeviationStatus();
        }

        // Theo dõi vị trí hiện tại của người dùng
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                setUserLocation({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                });
            },
            (err) => console.warn("Không thể lấy vị trí:", err),
            {
                enableHighAccuracy: false,
                timeout: 20000,
                maximumAge: 60000
            }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [itineraryId]);

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

    const handleCheckin = async () => {
        // Guard: nếu đang xử lý thì không cho bấm nữa (tránh click đúp)
        if (!nextStop || checkinInProgress.current) return;
        checkinInProgress.current = true;
        setCheckinLoading(true);
        setCheckinMsg('');

        // Safety timeout: tự reset sau 12 giây nếu mọi thứ bị treo
        const safetyTimer = setTimeout(() => {
            if (checkinInProgress.current) {
                checkinInProgress.current = false;
                setCheckinLoading(false);
                setCheckinMsg('❌ Hết thời gian chờ. Vui lòng thử lại.');
            }
        }, 12000);

        // 1. Lấy vị trí thực tế
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ lat: latitude, lng: longitude });

                try {
                    const token = localStorage.getItem('access_token');
                    const checkedStopId = nextStop.stop_id;

                    // 2. Gửi tọa độ THỰC lên Backend để so sánh
                    const result = await checkinStop(checkedStopId, {
                        latitude: latitude,
                        longitude: longitude
                    }, token);

                    clearTimeout(safetyTimer);
                    setCheckinMsg(result.message);
                    
                    // 3. OPTIMISTIC UPDATE: Cập nhật state local ngay lập tức
                    //    → Không cần đợi refetch từ backend → nút check-in sẵn sàng ngay
                    setTripDetail(prev => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            stops: prev.stops.map(s => 
                                s.stop_id === checkedStopId 
                                    ? { ...s, status: 'COMPLETED' } 
                                    : s
                            )
                        };
                    });

                    // 4. Mở khóa nút ngay sau khi update local
                    checkinInProgress.current = false;
                    setCheckinLoading(false);

                    // 5. Xóa thông báo sau 2 giây
                    setTimeout(() => setCheckinMsg(''), 2000);

                    // 6. Background refresh (không block UI, chỉ đồng bộ data)
                    handleRefresh(true).catch(err => 
                        console.warn('Background refresh failed:', err)
                    );

                } catch (err) {
                    clearTimeout(safetyTimer);
                    setCheckinMsg(`❌ ${err.message}`);
                    checkinInProgress.current = false;
                    setCheckinLoading(false);
                }
            },
            (error) => {
                clearTimeout(safetyTimer);
                checkinInProgress.current = false;
                setCheckinMsg('❌ Lỗi lấy vị trí: ' + error.message);
                setCheckinLoading(false);
            },
            {
                enableHighAccuracy: false,
                timeout: 8000,
                maximumAge: 10000
            }
        );
    };

    return (
        <div className="trip-detail-screen">
            <div className="detail-header">
                <button className="btn-back-icon" onClick={onBack}>⬅️</button>
                <h2>{tripDetail.name || "Chi tiết chuyến đi"}</h2>
                <button className="btn-refresh" onClick={handleRefresh} title="Tải lại dữ liệu">🔄</button>
                {/* Deviation status badge — click to toggle for demo */}
                <div
                    className={`deviation-badge ${isDeviated ? 'deviated' : 'on-track'}`}
                    onClick={() => setIsDeviated(!isDeviated)}
                    title="Nhấn để chuyển trạng thái (demo)"
                >
                    <span className="badge-dot"></span>
                    <span className="badge-text">{isDeviated ? 'Lệch hướng' : 'Đúng hướng'}</span>
                </div>
            </div>

            <div className="trip-summary">
                <div className="summary-item">
                    <span className="icon">💰</span>
                    <div>
                        <small>Ngân sách</small>
                        <strong>{new Intl.NumberFormat('vi-VN').format(tripDetail.total_budget)} {tripDetail.currency}</strong>
                    </div>
                </div>
                <div className="summary-item">
                    <span className="icon">⏱️</span>
                    <div>
                        <small>Thời gian</small>
                        <strong>{tripDetail.total_travel_time} phút</strong>
                    </div>
                </div>
                <div className="summary-item">
                    <span className="icon">📏</span>
                    <div>
                        <small>Khoảng cách</small>
                        <strong>{tripDetail.total_distance} km</strong>
                    </div>
                </div>
                <div className="summary-item points-summary">
                    <span className="icon">⭐</span>
                    <div>
                        <small>Điểm thưởng</small>
                        <strong>{(tripDetail.stops || []).reduce((acc, s) => acc + (s.reward || 0), 0)} pts</strong>
                    </div>
                </div>
            </div>

            {/* Color legend */}
            <div className="color-legend">
                <div className="legend-item"><span className="legend-dot legend-blue"></span> Chưa đến</div>
                <div className="legend-item"><span className="legend-dot legend-orange"></span> Điểm tiếp theo</div>
                <div className="legend-item"><span className="legend-dot legend-green"></span> Đã check-in</div>
            </div>

            {/* Check-in button for next stop */}
            {nextStop && (
                <div className="checkin-section">
                    <div className="checkin-info">
                        <span>📍</span>
                        <div>
                            <small>Điểm tiếp theo</small>
                            <strong>{nextStop.location_name}</strong>
                            {userLocation && (
                                <div className="gps-indicator">
                                    🛰️ GPS của bạn: {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
                                </div>
                            )}
                        </div>
                    </div>
                    <button
                        className="btn-checkin-main"
                        onClick={handleCheckin}
                        disabled={checkinLoading}
                    >
                        {checkinLoading ? 'Đang xử lý...' : '✅ Check-in'}
                    </button>
                </div>
            )}

            {checkinMsg && (
                <div className="checkin-toast">{checkinMsg}</div>
            )}



            <div className="trip-itinerary">
                <h3>Lịch trình chi tiết</h3>
                {Object.keys(stopsByDay).sort().map(day => (
                    <div key={day} className="day-group">
                        <div className="day-header">
                            Ngày {day}
                            <span className="day-date">({stopsByDay[day][0]?.travel_date})</span>
                            {stopsByDay[day][0]?.estimated_budget && (
                                <span className="day-budget">
                                    💰 {new Intl.NumberFormat('vi-VN').format(stopsByDay[day][0].estimated_budget)}đ
                                </span>
                            )}
                        </div>
                        <div className="timeline">
                            {stopsByDay[day].sort((a, b) => a.stop_order - b.stop_order).map(stop => (
                                <div key={stop.stop_id} className={`timeline-item`}>
                                    <div className="time-col">
                                        <div className="time">{stop.arrival_time?.slice(0, 5)}</div>
                                        <div className="line"></div>
                                    </div>
                                    <div className="content-col">
                                        <div className={`stop-card ${getStopColorClass(stop)}`}>
                                            <div className="stop-card-header">
                                                <h4>{stop.location_name}</h4>
                                                {stop.min_price && (
                                                    <span className="stop-price-tag">
                                                        {new Intl.NumberFormat('vi-VN').format(stop.min_price)}đ
                                                    </span>
                                                )}
                                                {stop.reward > 0 && (
                                                    <span className="stop-reward-tag">
                                                        +{stop.reward} ⭐
                                                    </span>
                                                )}
                                            </div>
                                            <p>Khởi hành: {stop.departure_time?.slice(0, 5)}</p>
                                            {stop.min_price && (
                                                <p className="stop-price-range">
                                                    Dự kiến: {new Intl.NumberFormat('vi-VN').format(stop.min_price)}đ - {new Intl.NumberFormat('vi-VN').format(stop.max_price)}đ
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* 🗺️ Bản đồ lộ trình với đường đi thực tế từ OSRM */}
            <RouteMap 
                stops={allStops} 
                routes={tripDetail.routes || []} 
                userLocation={userLocation}
            />
        </div>
    );
};

export default TripDetailScreen;
