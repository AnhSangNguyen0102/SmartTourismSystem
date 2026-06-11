import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../config/api';
import { ArrowLeft, ArrowRight, Compass, Sparkles, Coins, MapPin } from 'lucide-react';
import { showAlert } from '../../platform/dialog';
import './TripInputForm.css';

const BUDGET_PRESETS = [
    { label: '350k', value: 350000 },
    { label: '500k', value: 500000 },
    { label: '1tr', value: 1000000 },
    { label: '2tr', value: 2000000 },
    { label: '5tr', value: 5000000 }
];

const TripInputForm = ({ onSubmitPlan, onCancel }) => {
    // State quản lý bước hiện tại 
    const [step, setStep] = useState(1);

    // Fetched from backend
    const [cities, setCities] = useState([]);
    const [tags, setTags] = useState([]);

    useEffect(() => {
        // Fetch cities
        fetch(`${API_BASE}/api/reference/cities`)
            .then(res => res.json())
            .then(data => {
                setCities(data);
                if (data.length > 0) {
                    setTripData(prev => ({ ...prev, city_id: data[0].city_id }));
                }
            })
            .catch(err => console.error("Lỗi khi lấy danh sách thành phố:", err));

        // Fetch tags
        fetch(`${API_BASE}/api/reference/tags`)
            .then(res => res.json())
            .then(data => setTags(data))
            .catch(err => console.error("Lỗi khi lấy danh sách tag:", err));
    }, []);

    const getTodayStr = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    // State tổng chứa toàn bộ DỮ LIỆU ĐẦU VÀO để giao cho Backend
    const [tripData, setTripData] = useState({
        city_id: '', 
        start_day: getTodayStr(),
        days: 1, 
        pax_adult: 1,
        pax_children: 0,
        budget: 0,
        tag_ids: [],
        accommodation_type: 'STANDARD'
    });

    const handleChange = (field, value) => {
        setTripData({ ...tripData, [field]: value });
    };

    const addBudget = (amount) => {
        setTripData(prev => ({ ...prev, budget: (Number(prev.budget) || 0) + amount }));
    };

    const setBudget = (amount) => {
        setTripData(prev => ({ ...prev, budget: amount }));
    };

    const togglePreference = (tagId) => {
        const currentPrefs = tripData.tag_ids;
        if (currentPrefs.includes(tagId)) {
            handleChange('tag_ids', currentPrefs.filter(id => id !== tagId));
        } else {
            handleChange('tag_ids', [...currentPrefs, tagId]);
        }
    };

    const handleFinalSubmit = () => {
        const start = new Date(tripData.start_day);
        const end = new Date(start);
        end.setDate(start.getDate() + tripData.days - 1);
        const end_day = end.toISOString().split('T')[0];

        const selectedCity = cities.find(c => c.city_id === tripData.city_id);

        const payload = {
            city_id: tripData.city_id,
            city_name: selectedCity ? selectedCity.city_name : '',
            start_day: tripData.start_day,
            end_day: end_day,
            budget: tripData.budget,
            currency: "VND",
            pax_adult: tripData.pax_adult,
            pax_children: tripData.pax_children,
            tag_ids: tripData.tag_ids,
            accommodation_type: tripData.accommodation_type
        };

        onSubmitPlan(payload);
    };

    const handleTopBack = () => {
        if (step > 1) {
            setStep(step - 1);
            return;
        }
        onCancel();
    };

    // Tính toán kinh phí tối thiểu
    // Tính toán kinh phí tối thiểu dựa vào hình thức lưu trú
    let minBudgetPerAdultDay = 300000;
    let minBudgetPerChildDay = 150000;
    if (tripData.accommodation_type === 'RELATIVE') {
        minBudgetPerAdultDay = 150000; // Chỉ tính tiền ăn uống cơ bản
        minBudgetPerChildDay = 75000;
    } else {
        // Lưu trú dịch vụ
        minBudgetPerAdultDay = 350000; 
        minBudgetPerChildDay = 200000;
    }
    const minTotalBudget = (tripData.pax_adult * minBudgetPerAdultDay + tripData.pax_children * minBudgetPerChildDay) * tripData.days;

    return (
        <div className="trip-plan-screen">
        <div className="wizard-container">
            <button
                onClick={handleTopBack}
                className="back-wizard-btn"
                title="Quay lại"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
                <ArrowLeft size={14} /> Quay lại
            </button>

            {/* 1: ĐỊA ĐIỂM & THỜI GIAN */}
            {step === 1 && (
                <div className="step-content">
                    <h3 className="wizard-title"><MapPin size={22} className="inline-icon" /> CHỌN BẢN ĐỒ MUỐN ĐI</h3>
                    
                    <div className="input-group">
                        <label>Điểm đến</label>
                        <select
                            value={tripData.city_id}
                            onChange={(e) => handleChange('city_id', parseInt(e.target.value))}
                            className="cartoon-input-select"
                        >
                            {cities.length === 0 && <option value="">Đang mở khóa bản đồ...</option>}
                            {cities.map(city => (
                                <option key={city.city_id} value={city.city_id}>{city.city_name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="input-group">
                        <label>Ngày cắm mốc xuất hành</label>
                        <input
                            type="date"
                            value={tripData.start_day}
                            min={getTodayStr()}
                            onChange={(e) => handleChange('start_day', e.target.value)}
                            className="cartoon-input"
                        />
                    </div>

                    <div className="input-row-grid">
                        <div className="input-group">
                            <label>Số ngày leo ải</label>
                            <input 
                                type="number" 
                                min="1" 
                                max="7"
                                value={tripData.days} 
                                onChange={(e) => handleChange('days', parseInt(e.target.value))} 
                                className="cartoon-input"
                            />
                        </div>
                    </div>

                    <div className="input-row-grid-2">
                        <div className="input-group">
                            <label>Chiến binh (Adult)</label>
                            <input 
                                type="number" 
                                min="1" 
                                value={tripData.pax_adult} 
                                onChange={(e) => handleChange('pax_adult', parseInt(e.target.value))} 
                                className="cartoon-input"
                            />
                        </div>
                        <div className="input-group">
                            <label>Đồng đội nhí (child)</label>
                            <input 
                                type="number" 
                                min="0" 
                                value={tripData.pax_children} 
                                onChange={(e) => handleChange('pax_children', parseInt(e.target.value))} 
                                className="cartoon-input"
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Hình thức lưu trú</label>
                        <select
                            value={tripData.accommodation_type}
                            onChange={(e) => handleChange('accommodation_type', e.target.value)}
                            className="cartoon-input-select"
                        >
                            <option value="RELATIVE">Tự túc (Ở nhà người thân, không tốn phí lưu trú)</option>
                            <option value="STANDARD">Sử dụng dịch vụ lưu trú (Khách sạn, Resort, Homestay...)</option>
                        </select>
                    </div>

                    <div className="btn-row">
                        <div style={{ flex: 1 }}></div>
                        <button className="btn-next squishy-btn green" onClick={async () => {
                            if (!tripData.start_day) {
                                await showAlert("Vui lòng chọn ngày cắm mốc xuất hành.");
                                return;
                            }
                            if (!tripData.days || tripData.days < 1) {
                                await showAlert("Số ngày leo ải phải từ 1 ngày trở lên.");
                                return;
                            }
                            if (tripData.days > 7) {
                                await showAlert("Số ngày leo ải tối đa là 7 ngày để đảm bảo lộ trình tốt nhất.");
                                return;
                            }
                            if (!tripData.pax_adult || tripData.pax_adult < 1) {
                                await showAlert("Cần ít nhất 1 chiến binh (người lớn) để bắt đầu hành trình.");
                                return;
                            }
                            if (tripData.pax_children < 0) {
                                await showAlert("Đồng đội nhí không được là số âm.");
                                return;
                            }
                            if (tripData.pax_children > 0 && tripData.pax_adult < 1) {
                                await showAlert("Phải có ít nhất 1 chiến binh (người lớn) đi kèm để bảo vệ đồng đội nhí.");
                                return;
                            }
                            setStep(2);
                        }}>
                            Tiếp tục <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* 2: NGÂN SÁCH */}
            {step === 2 && (
                <div className="step-content">
                    <h3 className="wizard-title"><Coins size={22} className="inline-icon" /> QUỸ TÀI NGUYÊN VIỄN CHINH</h3>
                    <div className="input-group">
                        <label>Tài nguyên dự chi tối đa (VNĐ)</label>
                        <input
                            type="number"
                            step="100000"
                            placeholder="VD: 5000000"
                            value={tripData.budget}
                            onChange={(e) => handleChange('budget', parseInt(e.target.value) || 0)}
                            className="cartoon-input"
                        />
                        <div className="budget-preset-group">
                            <span className="budget-preset-label">Cộng thêm</span>
                            <div className="budget-preset-buttons">
                                {BUDGET_PRESETS.map(preset => (
                                    <button
                                        key={`add-${preset.value}`}
                                        type="button"
                                        className="budget-preset-btn add"
                                        onClick={() => addBudget(preset.value)}
                                    >
                                        +{preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="budget-preset-group">
                            <span className="budget-preset-label">Đặt nhanh</span>
                            <div className="budget-preset-buttons">
                                {BUDGET_PRESETS.map(preset => (
                                    <button
                                        key={`set-${preset.value}`}
                                        type="button"
                                        className={`budget-preset-btn set ${tripData.budget === preset.value ? 'selected' : ''}`}
                                        onClick={() => setBudget(preset.value)}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <small className="cartoon-helper-text">
                            Kinh phí tối thiểu cần nhập là {minTotalBudget.toLocaleString('vi-VN')} VNĐ (chưa bao gồm chi phí liên tỉnh).
                        </small>
                    </div>
                    <div className="btn-row">
                        <div style={{ flex: 1 }}></div>
                        <button className="btn-next squishy-btn green" onClick={async () => {
                            if (!tripData.budget || tripData.budget < minTotalBudget) {
                                await showAlert(`Kinh phí tối thiểu cần nhập là ${minTotalBudget.toLocaleString('vi-VN')} VNĐ để đảm bảo đủ chi trả các nhu cầu cơ bản của chuyến đi. Vui lòng nhập lại.`);
                                return;
                            }
                            setStep(3);
                        }}>
                            Tiếp tục <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* 3: SỞ THÍCH */}
            {step === 3 && (
                <div className="step-content">
                    <h3 className="wizard-title"><Sparkles size={22} className="inline-icon" /> CHỌN THIÊN HƯỚNG THÁM HIỂM</h3>
                    <div className="tags-container">
                        {tags.length === 0 && <p className="loading-tags">Đang nạp kỹ năng...</p>}
                        {tags.map(tag => (
                            <button
                                key={tag.tag_id}
                                className={`tag-btn-cartoon ${tripData.tag_ids.includes(tag.tag_id) ? 'selected' : ''}`}
                                onClick={() => togglePreference(tag.tag_id)}
                            >
                                {tag.tag_name}
                            </button>
                        ))}
                    </div>
                    <div className="btn-row">
                        <div style={{ flex: 1 }}></div>
                        <button
                            className="btn-next squishy-btn green"
                            onClick={handleFinalSubmit}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Compass size={18} /> KHỞI HÀNH
                        </button>
                    </div>
                </div>
            )}
        </div>
        </div>
    );
};

export default TripInputForm;
