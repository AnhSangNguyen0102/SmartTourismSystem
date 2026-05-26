import React, { useState, useEffect } from 'react';
import { createPlanningSession, getRecommendations } from '../../services/planService';
import { createTrip } from '../../services/tripService';
import { API_BASE } from '../../config/api';
import { getCurrentPosition } from '../../platform/location';
import { showAlert } from '../../platform/dialog';
import { storageGet } from '../../platform/storage';
import { ArrowLeft, ArrowRight, CheckCircle, Circle, AlertCircle } from 'lucide-react';
import './PlanRecommendScreen.css';

const PlanRecommendScreen = ({ planPayload, onBack, onTripCreated, onOpenLocationDetail, onSessionExpired }) => {
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
                const token = await storageGet('access_token');

                const sessionRes = await createPlanningSession(planPayload, token);
                setSessionData(sessionRes);

                let preferredTags = [];
                try {
                    const tagsRes = await fetch(`${API_BASE}/api/reference/tags`);
                    const tagsData = await tagsRes.json();
                    const tagMap = {};
                    tagsData.forEach((tag) => {
                        tagMap[tag.tag_id] = tag.tag_name;
                    });
                    preferredTags = (planPayload.tag_ids || []).map((id) => tagMap[id]).filter(Boolean);
                } catch (tagError) {
                    console.warn('Không thể tải danh sách tags, bỏ qua preferred_tags.');
                }

                const suggestPayload = {
                    city_id: planPayload.city_id,
                    budget: planPayload.budget,
                    preferred_tags: preferredTags,
                    max_results: 15,
                };
                const suggestRes = await getRecommendations(suggestPayload);

                setRecommendations(suggestRes.locations || []);
                const top5 = (suggestRes.locations || []).slice(0, 5).map((loc) => loc.location_id);
                setSelectedLocations(top5);
            } catch (err) {
                setError(err.message || 'Có lỗi xảy ra khi tải dữ liệu.');
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
            setSelectedLocations(selectedLocations.filter((id) => id !== locationId));
        } else {
            setSelectedLocations([...selectedLocations, locationId]);
        }
    };

    const handleCreateTrip = async () => {
        if (selectedLocations.length === 0) {
            await showAlert('Vui lòng chọn ít nhất 1 địa điểm.');
            return;
        }

        setCreatingTrip(true);
        try {
            const token = await storageGet('access_token');
            const basePayload = {
                session_id: sessionData.session_id,
                name: planPayload.city_name ? `Lộ trình ${planPayload.city_name}` : `Lộ trình ${planPayload.start_day || 'mới'}`,
                location_ids: selectedLocations,
                start_date: planPayload.start_day,
                end_date: planPayload.end_day,
            };

            let tripPayload = basePayload;
            try {
                const position = await getCurrentPosition({
                    enableHighAccuracy: false,
                    timeout: 5000,
                    maximumAge: 10000,
                });

                tripPayload = {
                    ...basePayload,
                    start_lat: position.latitude,
                    start_lon: position.longitude,
                };
            } catch (geoError) {
                console.warn('Không lấy được GPS, tiếp tục tạo lộ trình không có điểm xuất phát:', geoError);
            }

            const result = await createTrip(tripPayload, token);
            onTripCreated(result.itinerary_id);
            return;
        } catch (err) {
            const msg = typeof err.message === 'string' ? err.message : JSON.stringify(err.message);
            await showAlert(`Lỗi hệ thống: ${msg}`);
        } finally {
            setCreatingTrip(false);
        }
    };

    if (loading) {
        return (
            <div className="recommend-screen">
                <div className="loading-state">
                    <div className="plan-loader-spinner"></div>
                    <h2>Đang AI hóa lộ trình...</h2>
                    <p>Vui lòng đợi giây lát</p>
                </div>
            </div>
        );
    }

    if (error) {
        const normalized = error.toLowerCase();
        const isTokenExpired =
            normalized.includes('hết hạn') ||
            normalized.includes('expired') ||
            normalized.includes('unauthorized') ||
            error.includes('401');

        return (
            <div className="recommend-screen">
                <div className="error-state">
                    {isTokenExpired ? (
                        <>
                            <h2 style={{ fontSize: '20px', color: '#de350b', marginBottom: '10px' }}>
                                Phiên đăng nhập đã hết hạn
                            </h2>
                            <p style={{ color: '#636e72', marginBottom: '20px' }}>
                                Vui lòng đăng nhập lại để tiếp tục.
                            </p>
                            <button
                                onClick={onSessionExpired || onBack}
                                className="btn-back"
                                style={{ background: '#0abde3', color: '#fff', padding: '10px 20px', borderRadius: '20px', border: 'none', fontWeight: 'bold' }}
                            >
                                Đăng nhập lại
                            </button>
                        </>
                    ) : (
                        <>
                            <h2>Lỗi</h2>
                            <p>{error}</p>
                            <button onClick={onBack} className="btn-back">Quay lại</button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    const totalBudgetUsed = recommendations
        .filter((loc) => selectedLocations.includes(loc.location_id))
        .reduce((sum, loc) => sum + parseFloat(loc.min_price || 0), 0);

    const budgetLimit = Number(planPayload.budget) || 0;
    const isOverBudget = totalBudgetUsed > budgetLimit;
    const budgetPercentage = budgetLimit > 0 ? Math.min(100, (totalBudgetUsed / budgetLimit) * 100) : 0;

    return (
        <div className="recommend-screen">
            <div className="recommend-header">
                <button onClick={onBack} className="btn-back-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowLeft size={20} />
                </button>
                <h2>Gợi ý địa điểm</h2>
            </div>

            <p className="recommend-subtitle">
                Chúng tôi tìm thấy {recommendations.length} địa điểm phù hợp. Hãy chọn những nơi bạn thích!
            </p>

            <div className="locations-list">
                {recommendations.map((loc) => (
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
                            <div
                                className="loc-view-detail"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenLocationDetail(loc);
                                }}
                            >
                                Xem chi tiết <ArrowRight size={14} />
                            </div>
                        </div>
                        <div className="loc-checkbox" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {selectedLocations.includes(loc.location_id) ? (
                                <CheckCircle size={20} style={{ color: '#2ed573' }} />
                            ) : (
                                <Circle size={20} style={{ color: '#a4b0be' }} />
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="recommend-footer">
                <div className="budget-tracker">
                    <div className="budget-info">
                        <span>Ngân sách sử dụng: <strong>{new Intl.NumberFormat('vi-VN').format(totalBudgetUsed)}đ</strong> / {new Intl.NumberFormat('vi-VN').format(budgetLimit)}đ</span>
                        <span className={`budget-status ${isOverBudget ? 'status-over' : 'status-ok'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {isOverBudget ? (
                                <><AlertCircle size={14} /> Vượt ngân sách</>
                            ) : (
                                <><CheckCircle size={14} /> Trong tầm giá</>
                            )}
                        </span>
                    </div>
                    <div className="budget-bar-container">
                        <div
                            className={`budget-bar ${isOverBudget ? 'bar-over' : 'bar-ok'}`}
                            style={{ width: `${budgetPercentage}%` }}
                        />
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

            {creatingTrip && (
                <div className="plan-creating-overlay">
                    <div className="plan-creating-card">
                        <div className="plan-loader-spinner"></div>
                        <h3>Đang tạo lộ trình</h3>
                        <p>Hệ thống đang sắp xếp các điểm dừng tối ưu cho bạn...</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlanRecommendScreen;
