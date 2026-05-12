import React, { useState, useEffect } from 'react';
import { getTripDetail } from '../../services/tripService';
import './TripDetailScreen.css';

const HistoryDetail = ({ itineraryId, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tripDetail, setTripDetail] = useState(null);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                setLoading(true);
                const token = localStorage.getItem('access_token');
                const data = await getTripDetail(itineraryId, token);
                setTripDetail(data);
            } catch (err) {
                setError(err.message || "Không thể tải chi tiết lịch sử");
            } finally {
                setLoading(false);
            }
        };
        if (itineraryId) fetchDetail();
    }, [itineraryId]);

    if (loading) return (
        <div className="trip-detail-screen loading">
            <div className="spinner"></div>
            <p>Đang tải chi tiết...</p>
        </div>
    );

    if (error) return (
        <div className="trip-detail-screen error">
            <h3>Lỗi</h3>
            <p>{error}</p>
            <button className="btn-back" onClick={onBack}>Quay lại</button>
        </div>
    );

    if (!tripDetail) return null;

    // Nhóm các điểm dừng theo ngày
    const allStops = (tripDetail.stops || []);
    const stopsByDay = allStops.reduce((acc, stop) => {
        const day = stop.day_order;
        if (!acc[day]) acc[day] = [];
        acc[day].push(stop);
        return acc;
    }, {});

    const getStopColorClass = (stop) => {
        if (stop.status === 'COMPLETED') return 'stop-completed';
        return 'stop-skipped'; // Màu xám cho điểm bị bỏ qua
    };

    return (
        <div className="trip-detail-screen">
            <div className="detail-header">
                <button className="btn-back-icon" onClick={onBack}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2>{tripDetail.name || "Chi tiết hành trình"}</h2>
                <div className="status-badge-history">
                    {tripDetail.status === 'COMPLETED' ? '✅ Hoàn thành' : '⚠️ Chưa hoàn thành'}
                </div>
            </div>

            <div className="trip-summary">
                <div className="summary-item">
                    <span className="icon">💰</span>
                    <div>
                        <small>Tổng ngân sách</small>
                        <strong>{new Intl.NumberFormat('vi-VN').format(tripDetail.total_budget)} {tripDetail.currency}</strong>
                    </div>
                </div>
                <div className="summary-item">
                    <span className="icon">⏱️</span>
                    <div>
                        <small>Tổng thời gian</small>
                        <strong>{tripDetail.total_travel_time} phút</strong>
                    </div>
                </div>
                <div className="summary-item">
                    <span className="icon">📏</span>
                    <div>
                        <small>Quãng đường</small>
                        <strong>{tripDetail.total_distance} km</strong>
                    </div>
                </div>
            </div>

            <div className="trip-itinerary">
                <h3>Chi tiết các điểm dừng</h3>
                {Object.keys(stopsByDay).sort().map(day => (
                    <div key={day} className="day-group">
                        <div className="day-header">
                            Ngày {day}
                            <span className="day-date">({stopsByDay[day][0]?.travel_date})</span>
                        </div>
                        <div className="timeline">
                            {stopsByDay[day].sort((a, b) => a.stop_order - b.stop_order).map(stop => (
                                <div key={stop.stop_id} className="timeline-item">
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
                                            </div>
                                            <p>
                                                {stop.status === 'COMPLETED' ? '✅ Đã ghé thăm' : '⚪ Chưa ghé thăm'}
                                            </p>
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


export default HistoryDetail;
