import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../config/api';
import { ArrowLeft, ArrowRight, Compass, Sparkles, Coins, MapPin } from 'lucide-react';
import './TripInputForm.css';

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
        tag_ids: []
    });

    const handleChange = (field, value) => {
        setTripData({ ...tripData, [field]: value });
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
            tag_ids: tripData.tag_ids
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

                    <div className="btn-row">
                        <div style={{ flex: 1 }}></div>
                        <button className="btn-next squishy-btn green" onClick={() => setStep(2)}>
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
                        <small className="cartoon-helper-text">
                            Đại bản doanh sẽ tối ưu hóa lộ trình ải dựa trên lượng tài nguyên này.
                        </small>
                    </div>
                    <div className="btn-row">
                        <div style={{ flex: 1 }}></div>
                        <button className="btn-next squishy-btn green" onClick={() => {
                            if (!tripData.budget || tripData.budget <= 0) {
                                alert("Vui lòng thiết lập lượng tài nguyên viễn chinh dự kiến.");
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
