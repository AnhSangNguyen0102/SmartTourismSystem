import React, { useState, useEffect } from 'react';
import { getTripDetail, getDeviationStatus, checkinStop } from '../../services/tripService';
import './TripDetailScreen.css';

const TripDetailScreen = ({ itineraryId, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tripDetail, setTripDetail] = useState(null);

    // Deviation state — updated by click (demo) OR by fetching from backend (real)
    const [isDeviated, setIsDeviated] = useState(false);
    const [checkinLoading, setCheckinLoading] = useState(false);
    const [checkinMsg, setCheckinMsg] = useState('');

    const fetchDetail = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('access_token');
            const data = await getTripDetail(itineraryId, token);
            setTripDetail(data);
        } catch (err) {
            setError(err.message || "Không thể tải chi tiết chuyến đi");
        } finally {
            setLoading(false);
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

    const handleRefresh = () => {
        fetchDetail();
        fetchDeviationStatus();
    };

    useEffect(() => {
        if (itineraryId) {
            fetchDetail();
            fetchDeviationStatus();
        }
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
        if (!nextStop) return;
        setCheckinLoading(true);
        setCheckinMsg('');
        try {
            const token = localStorage.getItem('access_token');
            // Use the stop's own coordinates so it passes the radius check (demo)
            const result = await checkinStop(nextStop.stop_id, {
                latitude: parseFloat(nextStop.latitude),
                longitude: parseFloat(nextStop.longitude)
            }, token);
            setCheckinMsg(result.message);
            // Auto refresh to update colors
            setTimeout(() => {
                handleRefresh();
                setCheckinMsg('');
            }, 1500);
        } catch (err) {
            setCheckinMsg(`❌ ${err.message}`);
            setTimeout(() => setCheckinMsg(''), 4000);
        } finally {
            setCheckinLoading(false);
        }
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
                            {stopsByDay[day].sort((a,b) => a.stop_order - b.stop_order).map(stop => (
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
        </div>
    );
};

export default TripDetailScreen;
