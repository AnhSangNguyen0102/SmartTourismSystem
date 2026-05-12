import React, { useState, useEffect } from 'react';
import { createPlanningSession, getRecommendations } from '../../services/planService';
import { createTrip } from '../../services/tripService';
import './PlanRecommendScreen.css';

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

const PlanRecommendScreen = ({ planPayload, onBack, onTripCreated }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [selectedLocations, setSelectedLocations] = useState([]);
    const [creatingTrip, setCreatingTrip] = useState(false);

    useEffect(() => {
        const fetchPlanAndRecommendations = async () => {
            try {
                setLoading(true);
                const token = localStorage.getItem('access_token');
                
                // 1. Khởi tạo phiên
                const sessionRes = await createPlanningSession(planPayload, token);
                setSessionData(sessionRes);

                // 2. Lấy tag names từ backend để map tag_ids -> tag_names
                let preferred_tags = [];
                try {
                    const tagsRes = await fetch(`${API_BASE}/api/reference/tags`);
                    const tagsData = await tagsRes.json();
                    const tagMap = {};
                    tagsData.forEach(t => { tagMap[t.tag_id] = t.tag_name; });
                    preferred_tags = (planPayload.tag_ids || []).map(id => tagMap[id]).filter(Boolean);
                } catch (e) {
                    console.warn("Không thể lấy danh sách tags, bỏ qua preferred_tags");
                }
                const suggestPayload = {
                    city_id: planPayload.city_id,
                    budget: planPayload.budget,
                    preferred_tags: preferred_tags,
                    max_results: 15
                };
                const suggestRes = await getRecommendations(suggestPayload);
                
                setRecommendations(suggestRes.locations || []);
                // Mặc định chọn 5 địa điểm điểm cao nhất
                const top5 = (suggestRes.locations || []).slice(0, 5).map(loc => loc.location_id);
                setSelectedLocations(top5);

            } catch (err) {
                setError(err.message || "Có lỗi xảy ra khi tải dữ liệu.");
            } finally {
                setLoading(false);
            }
        };

        if (planPayload) {
            fetchPlanAndRecommendations();
        }
    }, [planPayload]);

    const toggleSelection = (locationId) => {
        if (selectedLocations.includes(locationId)) {
            setSelectedLocations(selectedLocations.filter(id => id !== locationId));
        } else {
            setSelectedLocations([...selectedLocations, locationId]);
        }
    };

    const handleCreateTrip = async () => {
        if (selectedLocations.length === 0) {
            alert("Vui lòng chọn ít nhất 1 địa điểm.");
            return;
        }

        try {
            setCreatingTrip(true);
            const token = localStorage.getItem('access_token');
            const tripPayload = {
                session_id: sessionData.session_id,
                name: "Chuyến đi tuyệt vời", // Có thể cho người dùng nhập
                location_ids: selectedLocations
            };

            const result = await createTrip(tripPayload, token);
            onTripCreated(result.itinerary_id);
        } catch (err) {
            alert("Lỗi khi tạo lộ trình: " + err.message);
        } finally {
            setCreatingTrip(false);
        }
    };

    if (loading) {
        return (
            <div className="recommend-screen">
                <div className="loading-state">
                    <h2>Đang AI hóa lộ trình...</h2>
                    <p>Vui lòng đợi giây lát</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="recommend-screen">
                <div className="error-state">
                    <h2>Lỗi</h2>
                    <p>{error}</p>
                    <button onClick={onBack} className="btn-back">Quay lại</button>
                </div>
            </div>
        );
    }

    const totalBudgetUsed = recommendations
        .filter(loc => selectedLocations.includes(loc.location_id))
        .reduce((sum, loc) => sum + parseFloat(loc.min_price || 0), 0);

    const budgetLimit = planPayload.budget || 0;
    const isOverBudget = totalBudgetUsed > budgetLimit;
    const budgetPercentage = Math.min(100, (totalBudgetUsed / budgetLimit) * 100);

    return (
        <div className="recommend-screen">
            <div className="recommend-header">
                <button onClick={onBack} className="btn-back-icon">⬅️</button>
                <h2>Gợi ý địa điểm</h2>
            </div>
            
            <p className="recommend-subtitle">
                Chúng tôi tìm thấy {recommendations.length} địa điểm phù hợp. Hãy chọn những nơi bạn thích!
            </p>

            <div className="locations-list">
                {recommendations.map(loc => (
                    <div 
                        key={loc.location_id} 
                        className={`location-card ${selectedLocations.includes(loc.location_id) ? 'selected' : ''}`}
                        onClick={() => toggleSelection(loc.location_id)}
                    >
                        <div className="loc-info">
                            <h4>{loc.location_name}</h4>
                            <p className="loc-tags">{(loc.tags || []).join(', ')}</p>
                            <p className="loc-price">{new Intl.NumberFormat('vi-VN').format(loc.min_price)}đ - {new Intl.NumberFormat('vi-VN').format(loc.max_price)}đ</p>
                            {loc.score && <div className="loc-score">Điểm phù hợp: {Number(loc.score).toFixed(1)}</div>}
                        </div>
                        <div className="loc-checkbox">
                            {selectedLocations.includes(loc.location_id) ? '✅' : '⚪'}
                        </div>
                    </div>
                ))}
            </div>

            <div className="recommend-footer">
                <div className="budget-tracker">
                    <div className="budget-info">
                        <span>Ngân sách sử dụng: <strong>{new Intl.NumberFormat('vi-VN').format(totalBudgetUsed)}đ</strong> / {new Intl.NumberFormat('vi-VN').format(budgetLimit)}đ</span>
                        <span className={`budget-status ${isOverBudget ? 'status-over' : 'status-ok'}`}>
                            {isOverBudget ? '⚠️ Vượt ngân sách' : '✅ Trong tầm giá'}
                        </span>
                    </div>
                    <div className="budget-bar-container">
                        <div 
                            className={`budget-bar ${isOverBudget ? 'bar-over' : 'bar-ok'}`} 
                            style={{ width: `${budgetPercentage}%` }}
                        ></div>
                    </div>
                </div>

                <div className="action-bar">
                    <div className="selected-count">
                        Đã chọn: <strong>{selectedLocations.length}</strong> điểm
                    </div>
                    <button 
                        className="btn-create-trip" 
                        onClick={handleCreateTrip}
                        disabled={creatingTrip || selectedLocations.length === 0}
                    >
                        {creatingTrip ? 'Đang tạo...' : 'Tạo Lộ Trình Ngay'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlanRecommendScreen;
