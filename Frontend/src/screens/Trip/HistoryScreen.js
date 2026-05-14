import React, { useEffect, useState } from 'react';
import { getTripHistory } from '../../services/tripService';
import HistoryDetail from './HistoryDetail';
import './HistoryScreen.css';

const HistoryScreen = ({ onBack }) => {
    const [history, setHistory] = useState([]);
    const [filteredHistory, setFilteredHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTripId, setSelectedTripId] = useState(null);

    // States cho bộ lọc
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterDate, setFilterDate] = useState('');

    useEffect(() => {
        const fetchHistory = async () => {
            const token = localStorage.getItem('access_token');
            if (token) {
                const data = await getTripHistory(token);
                setHistory(data);
                setFilteredHistory(data);
            }
            setLoading(false);
        };
        fetchHistory();
    }, []);

    // Logic lọc dữ liệu
    useEffect(() => {
        let result = [...history];

        if (filterStatus !== 'ALL') {
            if (filterStatus === 'ONGOING') {
                result = result.filter(item => item.status === 'DRAFT' || item.status === 'CONFIRMED');
            } else {
                result = result.filter(item => item.status === filterStatus);
            }
        }

        if (filterDate) {
            result = result.filter(item => {
                const itemDate = new Date(item.create_at).toISOString().split('T')[0];
                return itemDate === filterDate;
            });
        }

        setFilteredHistory(result);
    }, [filterStatus, filterDate, history]);

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    if (selectedTripId) {
        return <HistoryDetail
            itineraryId={selectedTripId}
            onBack={() => setSelectedTripId(null)}
        />;
    }

    return (
        <div className="history-container">
            <div className="history-header">
                <button className="back-btn" onClick={onBack}>
                    <i className="fas fa-arrow-left"></i> Quay lại
                </button>
                <h1>Lịch sử hành trình</h1>
            </div>

            {/* Thanh bộ lọc mới */}
            <div className="filter-bar">
                <div className="filter-group">
                    <label><i className="fas fa-filter"></i> Trạng thái</label>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="filter-select"
                    >
                        <option value="ALL">Tất cả</option>
                        <option value="ONGOING">Đang diễn ra</option>
                        <option value="COMPLETED">Hoàn thành</option>
                        <option value="CANCELLED">Đã hủy</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label><i className="fas fa-calendar-alt"></i> Chọn ngày</label>
                    <div className="date-input-wrapper">
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="filter-date"
                        />
                        {filterDate && (
                            <button className="clear-date" onClick={() => setFilterDate('')}>&times;</button>
                        )}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Đang tải lịch sử...</p>
                </div>
            ) : filteredHistory.length === 0 ? (
                <div className="empty-state">
                    <i className="fas fa-search"></i>
                    <p>Không tìm thấy hành trình nào khớp với bộ lọc.</p>
                    {(filterStatus !== 'ALL' || filterDate !== '') && (
                        <button className="reset-filter-btn" onClick={() => { setFilterStatus('ALL'); setFilterDate(''); }}>
                            Xóa bộ lọc
                        </button>
                    )}
                </div>
            ) : (
                <div className="history-list">
                    {filteredHistory.map((item) => (
                        <div
                            key={item.itinerary_id}
                            className="history-card"
                            onClick={() => setSelectedTripId(item.itinerary_id)}
                        >
                            <div className="card-status" data-status={item.status === 'DRAFT' || item.status === 'CONFIRMED' ? 'ONGOING' : item.status}>
                                {item.status === 'COMPLETED' ? '✅ Hoàn thành' : item.status === 'CANCELLED' ? '❌ Đã hủy' : '🔄 Đang diễn ra'}
                            </div>
                            <div className="card-info">
                                <h3>{item.name || 'Hành trình không tên'}</h3>
                                <p className="card-date">
                                    <i className="far fa-calendar-alt"></i> {formatDate(item.create_at)}
                                </p>
                                <div className="card-stats">
                                    <span>
                                        <i className="fas fa-map-marker-alt"></i> {item.total_distance} km
                                    </span>
                                    <span>
                                        <i className="fas fa-wallet"></i> {new Intl.NumberFormat('vi-VN').format(item.total_budget)} đ
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default HistoryScreen;

