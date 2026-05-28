// src/components/HiddenQuest/EnterpriseEventForm.jsx
import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getEnterpriseEvents, createEnterpriseEvent, deleteEnterpriseEvent } from '../../services/hiddenQuestService';
import { showAlert, showConfirm } from '../../platform/dialog';
import { 
  Sparkles, Plus, MapPin, QrCode, HelpCircle, Camera, 
  Gem, Award, Coins, Globe, Calendar, X, AlertCircle, 
  CheckCircle2, Send 
} from 'lucide-react';
import './EnterpriseEventForm.css';

const formatDateTimeLocal = (date) => {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
};

export const EnterpriseEventForm = ({ onClose }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    
    // Form states
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [questType, setQuestType] = useState('CHECKIN'); // CHECKIN, QR, QUIZ, PHOTO
    const [latitude, setLatitude] = useState(21.0285); // Default Hanoi
    const [longitude, setLongitude] = useState(105.8542);
    const [radiusMeters, setRadiusMeters] = useState(100);
    const [rewardExp, setRewardExp] = useState(100);
    const [rewardCoin, setRewardCoin] = useState(50);
    const [rarity, setRarity] = useState('COMMON'); // COMMON, RARE, EPIC, LEGENDARY
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [maxScans, setMaxScans] = useState(100);

    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [createdQrData, setCreatedQrData] = useState(null);

    // Map ref
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);

    const createPickerIcon = () =>
        L.divIcon({
            className: 'enterprise-map-pin',
            html: `
                <div style="
                    width: 26px;
                    height: 26px;
                    border-radius: 50%;
                    background: #6c5ce7;
                    border: 3px solid #ffffff;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.35);
                    position: relative;
                ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                </div>
            `,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });

    // Load active events
    const fetchEvents = async () => {
        setEventsLoading(true);
        try {
            const data = await getEnterpriseEvents();
            setEvents(data);
        } catch (err) {
            console.error('Error fetching enterprise events:', err);
        } finally {
            setEventsLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
        
        // Set default start/end times
        const now = new Date();
        const startIso = formatDateTimeLocal(now);
        
        const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const endIso = formatDateTimeLocal(inOneDay);
        
        setStartTime(startIso);
        setEndTime(endIso);
    }, []);

    // Leaflet map setup for coordinates selection
    useEffect(() => {
        if (!isFormOpen || !mapContainerRef.current) return;

        // Initialize Map
        if (!mapInstanceRef.current) {
            mapInstanceRef.current = L.map(mapContainerRef.current).setView([latitude, longitude], 14);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(mapInstanceRef.current);

            // Add marker
            markerRef.current = L.marker([latitude, longitude], {
                draggable: true,
                icon: createPickerIcon()
            }).addTo(mapInstanceRef.current);

            // Update state on marker drag end
            markerRef.current.on('dragend', () => {
                const position = markerRef.current.getLatLng();
                setLatitude(parseFloat(position.lat.toFixed(6)));
                setLongitude(parseFloat(position.lng.toFixed(6)));
            });

            // Update marker and state on map click
            mapInstanceRef.current.on('click', (e) => {
                const { lat, lng } = e.latlng;
                setLatitude(parseFloat(lat.toFixed(6)));
                setLongitude(parseFloat(lng.toFixed(6)));
                markerRef.current.setLatLng([lat, lng]);
            });

            // Adjust size to render correctly in sheet
            setTimeout(() => {
                mapInstanceRef.current.invalidateSize();
            }, 300);
        } else {
            // Update center and marker if already exists
            mapInstanceRef.current.setView([latitude, longitude], 14);
            markerRef.current.setLatLng([latitude, longitude]);
            setTimeout(() => {
                mapInstanceRef.current.invalidateSize();
            }, 300);
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                markerRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFormOpen]);

    // Handle lat/lng changes from numeric text inputs
    const handleCoordChange = (latVal, lngVal) => {
        const lat = parseFloat(latVal) || 0;
        const lng = parseFloat(lngVal) || 0;
        setLatitude(lat);
        setLongitude(lng);

        if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
        }
        if (mapInstanceRef.current) {
            mapInstanceRef.current.panTo([lat, lng]);
        }
    };

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        setCreatedQrData(null);

        // Validation
        if (!title.trim() || !description.trim() || !startTime || !endTime) {
            setErrorMsg('Vui lòng nhập đầy đủ thông tin bắt buộc');
            setLoading(false);
            return;
        }

        try {
            // Convert local datetime input value to ISO UTC string
            const startDate = new Date(startTime);
            const endDate = new Date(endTime);
            if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
                setErrorMsg('Thời gian bắt đầu/kết thúc không hợp lệ');
                setLoading(false);
                return;
            }
            if (startDate >= endDate) {
                setErrorMsg('Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc');
                setLoading(false);
                return;
            }

            const startUtc = startDate.toISOString();
            const endUtc = endDate.toISOString();

            const payload = {
                title,
                description,
                quest_type: questType,
                latitude,
                longitude,
                radius_meters: parseInt(radiusMeters),
                reward_exp: parseInt(rewardExp),
                reward_coin: parseInt(rewardCoin),
                rarity,
                start_time: startUtc,
                end_time: endUtc,
                max_scans: questType === 'QR' ? parseInt(maxScans) : undefined
            };

            const result = await createEnterpriseEvent(payload);
            setSuccessMsg('Đã tạo sự kiện động ẩn thành công!');
            
            if (result.qr) {
                setCreatedQrData(result.qr);
            }

            // Reset form fields
            setTitle('');
            setDescription('');
            setQuestType('CHECKIN');
            setRarity('COMMON');

            // Refresh events
            fetchEvents();
        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || 'Lỗi khi tạo sự kiện');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteEvent = async (eventId) => {
        const confirmed = await showConfirm('Bạn có chắc chắn muốn hủy kích hoạt sự kiện này không? Người chơi sẽ không thể thấy hay claim nó nữa.', {
            title: 'Hủy sự kiện',
            okButtonTitle: 'Xác nhận',
            cancelButtonTitle: 'Không'
        });
        if (!confirmed) return;
        try {
            await deleteEnterpriseEvent(eventId);
            fetchEvents();
        } catch (err) {
            await showAlert(err.message || 'Lỗi khi hủy sự kiện');
        }
    };

    const closeFormSheet = () => {
        // Destroy map instance to recreate it properly next time
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
            markerRef.current = null;
        }
        setIsFormOpen(false);
        setErrorMsg('');
        setSuccessMsg('');
        setCreatedQrData(null);
    };

    return (
        <div className="enterprise-event-root">
            
            {/* Header */}
            <div className="enterprise-event-header">
                <div>
                    <h2 className="enterprise-event-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Sự kiện Động ẩn <Sparkles size={24} style={{ color: '#a29bfe' }} />
                    </h2>
                    <p className="enterprise-event-subtitle">
                        Tạo rương báu hoặc sự kiện để thu hút khách ghé thăm cửa hàng của bạn.
                    </p>
                </div>
                {onClose && (
                    <button onClick={onClose} className="enterprise-event-back-btn">
                        Quay lại
                    </button>
                )}
            </div>

            {/* Dashboard Action Button */}
            <button onClick={() => setIsFormOpen(true)} className="enterprise-event-create-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Plus size={18} /> Tạo Sự Kiện Động / Rương Báu Mới
            </button>

            {/* Active Events List */}
            <h3 className="enterprise-event-section-title">
                Danh sách sự kiện đang mở ({events.length})
            </h3>

            {eventsLoading ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#a4b0be' }}>
                    <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#a29bfe', borderRadius: '50%', animation: 'spin 1s infinite linear' }} />
                    <p style={{ fontSize: '13px', marginTop: '10px' }}>Đang tải danh sách sự kiện...</p>
                </div>
            ) : events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={40} style={{ color: '#a29bfe', marginBottom: '10px' }} />
                    <h4 style={{ margin: '0 0 5px', color: '#ffffff' }}>Chưa có sự kiện nào</h4>
                    <p style={{ margin: 0, fontSize: '13px', color: '#a4b0be' }}>Hãy nhấn nút phía trên để tạo sự kiện quảng bá đầu tiên của bạn!</p>
                </div>
            ) : (
                <div className="enterprise-event-list">
                    {events.map((ev) => (
                        <div key={ev.event_id} className="event-card">
                            {ev.is_active ? (
                                <button className="event-delete-btn" onClick={() => handleDeleteEvent(ev.event_id)}>
                                    Hủy sự kiện
                                </button>
                            ) : (
                                <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '11px', color: '#a4b0be', background: 'rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                                    ĐÃ ĐÓNG
                                </span>
                            )}

                            <h4 className="event-card-title">{ev.title}</h4>
                            <p style={{ fontSize: '13px', color: '#dcdde1', margin: '6px 0 12px', lineHeight: '1.4' }}>{ev.description}</p>
                            
                            <div className="event-card-meta">
                                <span className={`event-card-badge ${ev.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                    {ev.is_active ? 'Đang hoạt động' : 'Hết hiệu lực'}
                                </span>
                                <span style={{ background: 'rgba(162,155,254,0.15)', color: '#a29bfe', display: 'inline-flex', alignItems: 'center', gap: '4px' }} className="event-card-badge">
                                    {ev.quest_type === 'CHECKIN' ? (
                                        <><MapPin size={12} /> Check-in</>
                                    ) : ev.quest_type === 'QR' ? (
                                        <><QrCode size={12} /> Quét QR</>
                                    ) : ev.quest_type === 'QUIZ' ? (
                                        <><HelpCircle size={12} /> Trắc nghiệm</>
                                    ) : (
                                        <><Camera size={12} /> Ảnh chụp</>
                                    )}
                                </span>
                                <span style={{ 
                                    background: ev.rarity === 'LEGENDARY' ? 'rgba(241,196,15,0.15)' : ev.rarity === 'EPIC' ? 'rgba(142,68,173,0.15)' : ev.rarity === 'RARE' ? 'rgba(41,128,185,0.15)' : 'rgba(255,255,255,0.08)',
                                    color: ev.rarity === 'LEGENDARY' ? '#f1c40f' : ev.rarity === 'EPIC' ? '#bb8fce' : ev.rarity === 'RARE' ? '#5dade2' : '#bdc3c7',
                                    display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }} className="event-card-badge">
                                    <Gem size={12} /> Rarity: {ev.rarity}
                                </span>
                                <span style={{ background: 'rgba(255,255,255,0.05)', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '4px' }} className="event-card-badge">
                                    <Award size={12} /> +{ev.reward_exp * ev.multiplier} EXP | <Coins size={12} /> +{ev.reward_coin * ev.multiplier} xu
                                </span>
                            </div>

                            <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', fontSize: '11px', color: '#a4b0be', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Globe size={12} /> Vị trí: <strong>{ev.latitude.toFixed(5)}, {ev.longitude.toFixed(5)}</strong> (Bán kính {ev.radius_meters}m)</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> Diễn ra: <strong>{new Date(ev.start_time).toLocaleString()}</strong> đến <strong>{new Date(ev.end_time).toLocaleString()}</strong></div>
                                
                                {ev.quest_type === 'QR' && ev.qr_token && (
                                    <div style={{ marginTop: '8px', background: 'rgba(253, 203, 110, 0.1)', border: '1px solid rgba(253, 203, 110, 0.2)', padding: '8px 12px', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><QrCode size={12} /> Mã Token quét QR: <strong style={{ color: '#fdcb6e', fontFamily: 'monospace', fontSize: '13px' }}>{ev.qr_token}</strong></span>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(ev.qr_token);
                                                    void showAlert('Đã sao chép mã QR token vào Clipboard!');
                                                }}
                                                style={{ background: '#fdcb6e', color: '#000', border: 'none', borderRadius: '4px', fontSize: '9px', fontWeight: 'bold', padding: '3px 6px', cursor: 'pointer' }}
                                            >
                                                Sao chép
                                            </button>
                                        </div>
                                        <div style={{ marginTop: '4px', fontSize: '10px' }}>Số lượt đã quét nhận thưởng: <strong>{ev.scanned_count} / {ev.max_scans}</strong></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* FORM CREATION SHEET MODAL */}
            {isFormOpen && (
                <div className="event-form-overlay">
                    <div className="event-form-sheet">
                        <div className="form-handle" />

                        <div className="form-header">
                            <div>
                                <h2>TẠO SỰ KIỆN ĐỘNG ẨN MỚI</h2>
                                <p>Thiết lập rương kho báu hoặc thử thách check-in, QR, Quiz.</p>
                            </div>
                            <button className="form-close-btn" onClick={closeFormSheet} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
                        </div>

                        <form onSubmit={handleCreateEvent}>
                            <div className="form-group">
                                <label className="form-label">Tên sự kiện / Tên rương báu *</label>
                                <input 
                                    type="text" 
                                    className="form-input" 
                                    placeholder="Ví dụ: Rương Thần Thoại Quán Cafe MTP, Khuyến mãi quét mã giảm giá..."
                                    value={title} 
                                    onChange={(e) => setTitle(e.target.value)} 
                                    required 
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Mô tả sự kiện / Hướng dẫn thử thách *</label>
                                <textarea 
                                    className="form-textarea" 
                                    placeholder="Mô tả cho người chơi biết cách tìm kiếm hoặc phần thưởng..."
                                    value={description} 
                                    onChange={(e) => setDescription(e.target.value)} 
                                    required 
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Loại thử thách</label>
                                    <select 
                                        className="form-select" 
                                        value={questType} 
                                        onChange={(e) => setQuestType(e.target.value)}
                                    >
                                        <option value="CHECKIN">GPS Check-in (Có mặt)</option>
                                        <option value="QR">Quét mã QR</option>
                                        <option value="QUIZ">Trả lời câu hỏi (Quiz)</option>
                                        <option value="PHOTO">Chụp ảnh hiện vật</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Bán kính quét (m)</label>
                                    <input 
                                        type="number" 
                                        className="form-input" 
                                        value={radiusMeters} 
                                        onChange={(e) => setRadiusMeters(Math.max(10, parseInt(e.target.value) || 100))} 
                                    />
                                </div>
                            </div>

                            {/* GPS Picker Map */}
                            <div className="form-group">
                                <label className="form-label">Chọn Vị trí toạ độ địa bàn diễn ra sự kiện</label>
                                <div ref={mapContainerRef} className="map-picker">
                                    <div className="map-picker-hint">Kéo thả Marker hoặc click bản đồ để chọn toạ độ</div>
                                </div>
                                <div className="coord-display">
                                    <div className="coord-chip">
                                        Vĩ độ (Lat): <input type="number" step="0.000001" style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', width: '70px', outline: 'none' }} value={latitude} onChange={(e) => handleCoordChange(e.target.value, longitude)} />
                                    </div>
                                    <div className="coord-chip">
                                        Kinh độ (Lng): <input type="number" step="0.000001" style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', width: '70px', outline: 'none' }} value={longitude} onChange={(e) => handleCoordChange(latitude, e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Rarity Grid Selection */}
                            <div className="form-group">
                                <label className="form-label">Độ hiếm sự kiện (RARITY)</label>
                                <div className="rarity-grid">
                                    {['COMMON', 'RARE', 'EPIC', 'LEGENDARY'].map((r) => (
                                        <div 
                                            key={r} 
                                            className={`rarity-option rarity-${r} ${rarity === r ? 'selected' : ''}`}
                                            onClick={() => setRarity(r)}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        >
                                            {r === 'COMMON' && <><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2ed573', display: 'inline-block' }}></span> Thường</>}
                                            {r === 'RARE' && <><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#5dade2', display: 'inline-block' }}></span> Hiếm</>}
                                            {r === 'EPIC' && <><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#bb8fce', display: 'inline-block' }}></span> Sử thi</>}
                                            {r === 'LEGENDARY' && <><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f1c40f', display: 'inline-block' }}></span> Gold</>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">EXP Cơ Bản</label>
                                    <input 
                                        type="number" 
                                        className="form-input" 
                                        value={rewardExp} 
                                        onChange={(e) => setRewardExp(Math.max(10, parseInt(e.target.value) || 100))} 
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Coin Cơ Bản</label>
                                    <input 
                                        type="number" 
                                        className="form-input" 
                                        value={rewardCoin} 
                                        onChange={(e) => setRewardCoin(Math.max(5, parseInt(e.target.value) || 50))} 
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Thời gian bắt đầu *</label>
                                    <input 
                                        type="datetime-local" 
                                        className="form-input" 
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        required 
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Thời gian kết thúc *</label>
                                    <input 
                                        type="datetime-local" 
                                        className="form-input" 
                                        value={endTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        required 
                                    />
                                </div>
                            </div>

                            {questType === 'QR' && (
                                <div className="form-group">
                                    <label className="form-label">Số lượt tối đa có thể quét nhận quà *</label>
                                    <input 
                                        type="number" 
                                        className="form-input" 
                                        value={maxScans} 
                                        onChange={(e) => setMaxScans(Math.max(1, parseInt(e.target.value) || 100))} 
                                        required
                                    />
                                </div>
                            )}

                            {errorMsg && <div className="form-error" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={14} /> {errorMsg}</div>}
                            {successMsg && <div className="form-success" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} /> {successMsg}</div>}

                            {/* Show QR result to copy token if QR quest type */}
                            {createdQrData && (
                                <div className="qr-result">
                                    <div style={{ fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}><QrCode size={14} /> TOKEN QUÉT QR CHO SỰ KIỆN:</div>
                                    <div className="qr-token-text">{createdQrData.qr_token}</div>
                                    <div style={{ fontSize: '11px', color: '#a4b0be', marginBottom: '8px' }}>
                                        Hãy dán mã token này vào máy sinh QR hoặc in cho khách hàng quét.
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(createdQrData.qr_token);
                                            void showAlert('Đã sao chép mã QR token vào Clipboard!');
                                        }}
                                        style={{ background: '#6c5ce7', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        Sao chép mã QR token
                                    </button>
                                </div>
                            )}

                            <button type="submit" className="submit-btn" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                {loading ? 'Đang gửi thông tin...' : <><Send size={18} /> XÁC NHẬN ĐĂNG KÝ SỰ KIỆN</>}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EnterpriseEventForm;
