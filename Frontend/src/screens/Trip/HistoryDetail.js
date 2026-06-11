import React, { useState, useEffect } from 'react';
import { getTripDetail } from '../../services/tripService';
import { storageGet } from '../../platform/storage';
import { 
    ArrowLeft, CheckCircle2, XCircle, RefreshCw, 
    Circle
} from 'lucide-react';
import './HistoryDetail.css';

const HistoryDetail = ({ itineraryId, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tripDetail, setTripDetail] = useState(null);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                setLoading(true);
                const token = await storageGet('access_token');
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
        <div className="history-detail-screen loading">
            <div className="history-detail-spinner"></div>
            <p>Đang tải chi tiết...</p>
        </div>
    );

    if (error) return (
        <div className="history-detail-screen error">
            <h3>Lỗi</h3>
            <p>{error}</p>
            <button className="history-detail-back-btn" onClick={onBack} aria-label="Quay lại" title="Quay lại">
                <ArrowLeft size={20} />
            </button>
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
        <div className="history-detail-screen">
            <div className="history-detail-header">
                <button className="history-detail-back-btn" onClick={onBack} aria-label="Quay lại" title="Quay lại">
                    <ArrowLeft size={20} />
                </button>
                <div className="history-detail-title-group">
                    <h2>{tripDetail.name || "Chi tiết hành trình"}</h2>
                    <div className="status-badge-history" data-status={tripDetail.status}>
                        {tripDetail.status === 'COMPLETED' ? (
                            <><CheckCircle2 size={14} /> Hoàn thành</>
                        ) : tripDetail.status === 'CANCELLED' ? (
                            <><XCircle size={14} /> Đã hủy</>
                        ) : (
                            <><RefreshCw size={14} /> Đang diễn ra</>
                        )}
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
                                            </div>
                                            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', margin: '5px 0 0' }}>
                                                {stop.status === 'COMPLETED' ? (
                                                    <><CheckCircle2 size={14} style={{ color: '#2ed573' }} /> Đã ghé thăm</>
                                                ) : (
                                                    <><Circle size={14} style={{ color: '#a4b0be' }} /> Chưa ghé thăm</>
                                                )}
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
