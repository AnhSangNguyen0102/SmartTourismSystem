// src/components/HiddenQuest/HiddenQuestDebug.jsx
import React, { useState } from 'react';
import { API_BASE } from '../../config/api';
import { storageGet } from '../../platform/storage';
import { Wrench, X, Package, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import './HiddenQuestDebug.css';

const HiddenQuestDebug = ({ userLocation, onSpawnSuccess, onTestClaim }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [rarity, setRarity] = useState('COMMON');
    const [statusMsg, setStatusMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastSpawnedChest, setLastSpawnedChest] = useState(null);

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; // meters
    };

    const togglePanel = () => setIsOpen(!isOpen);

    const handleSpawn = async (type) => {
        if (!userLocation) {
            setStatusMsg("Lỗi: Chưa xác định được vị trí GPS hiện tại!");
            return;
        }

        setLoading(true);
        setStatusMsg("Đang gửi yêu cầu sinh ảo...");

        try {
            const token = await storageGet('access_token');
            if (!token) {
                throw new Error("Vui lòng đăng nhập trước");
            }

            const response = await fetch(`${API_BASE}/api/v1/hidden/debug-spawn`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    task_type: type,
                    latitude: userLocation.lat,
                    longitude: userLocation.lng,
                    rarity: rarity
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "Sinh thất bại");
            }

            setStatusMsg(`Sinh thành công! Vị trí ${type}: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`);
            setLastSpawnedChest({
                lat: data.latitude,
                lng: data.longitude,
                type: type
            });
            
            if (onSpawnSuccess) {
                // Fetch list of active tasks from parent
                onSpawnSuccess();
            }
        } catch (err) {
            console.error(err);
            setStatusMsg(`Lỗi: ${err.message || 'Lỗi server'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleTestClaimClick = () => {
        if (onTestClaim) {
            onTestClaim({
                spawn_id: "00000000-0000-0000-0000-000000000000",
                task_type: "CHEST",
                target_id: "00000000-0000-0000-0000-000000000000",
                latitude: userLocation?.lat || 21.0285,
                longitude: userLocation?.lng || 105.8542,
                rarity: rarity,
                title: `Rương ${rarity} (Test Animation)`,
                description: `Một rương báu độ hiếm ${rarity} được dùng để kiểm thử hiệu ứng đồ họa.`
            });
        }
    };

    return (
        <>
            {/* Floating FAB */}
            <div className="debug-fab" onClick={togglePanel} title="Chế độ nhà phát triển" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Wrench size={20} />
            </div>

            {/* Debug Panel */}
            {isOpen && (
                <div className="debug-panel">
                    <div className="debug-header">
                        <h3>DEBUG GAMIFICATION</h3>
                        <button className="debug-close" onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={14} />
                        </button>
                    </div>

                    <div className="debug-section">
                        <label className="debug-label">1. CHỌN ĐỘ HIẾM (RARITY)</label>
                        <select 
                            className="debug-select" 
                            value={rarity} 
                            onChange={(e) => setRarity(e.target.value)}
                        >
                            <option value="COMMON">COMMON (Thường)</option>
                            <option value="RARE">RARE (Hiếm)</option>
                            <option value="EPIC">EPIC (Sử thi)</option>
                            <option value="LEGENDARY">LEGENDARY (Thần thoại)</option>
                        </select>
                    </div>

                    <div className="debug-section">
                        <label className="debug-label">2. ĐIỀU KHIỂN SINH MÃ</label>
                        <button 
                            className="debug-btn btn-primary" 
                            onClick={() => handleSpawn('CHEST')}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                            <Package size={16} /> Sinh Rương Kho Báu
                        </button>
                        <button 
                            className="debug-btn btn-secondary" 
                            onClick={() => handleSpawn('DYNAMIC_QUEST')}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                            <Sparkles size={16} /> Sinh Sự Kiện Doanh Nghiệp
                        </button>
                    </div>

                    <div className="debug-section">
                        <label className="debug-label">3. KIỂM THỬ GIAO DIỆN (UI)</label>
                        <button 
                            className="debug-btn btn-accent" 
                            onClick={handleTestClaimClick}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                            <Sparkles size={16} /> Chạy thử Animation Rương
                        </button>
                    </div>

                    {statusMsg && (
                        <div className="debug-status" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {statusMsg.toLowerCase().includes('lỗi') ? (
                                <AlertTriangle size={14} style={{ color: '#ff7675', flexShrink: 0 }} />
                            ) : statusMsg.toLowerCase().includes('thành công') ? (
                                <CheckCircle2 size={14} style={{ color: '#2ecc71', flexShrink: 0 }} />
                            ) : null}
                            <span>{statusMsg}</span>
                        </div>
                    )}

                    {lastSpawnedChest && userLocation && (
                        <div style={{ 
                            marginTop: '12px', 
                            padding: '10px', 
                            backgroundColor: 'rgba(10, 189, 227, 0.1)', 
                            borderRadius: '8px', 
                            fontSize: '11px',
                            border: '1px dashed #0abde3',
                            textAlign: 'left'
                        }}>
                            <div style={{ fontWeight: 'bold', color: '#0abde3', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Package size={14} /> Vị trí {lastSpawnedChest.type === 'CHEST' ? 'Rương' : 'Sự kiện'} vừa sinh:
                            </div>
                            <div>• Lat: <strong>{lastSpawnedChest.lat.toFixed(6)}</strong></div>
                            <div>• Lng: <strong>{lastSpawnedChest.lng.toFixed(6)}</strong></div>
                            <div style={{ marginTop: '5px', fontSize: '11px' }}>
                                <span>Khoảng cách hiện tại: </span>
                                <strong style={{ color: calculateDistance(userLocation.lat, userLocation.lng, lastSpawnedChest.lat, lastSpawnedChest.lng) <= 5.0 ? '#2ecc71' : '#ff7675', fontSize: '12px' }}>
                                    {calculateDistance(userLocation.lat, userLocation.lng, lastSpawnedChest.lat, lastSpawnedChest.lng).toFixed(1)}m
                                </strong>
                                {calculateDistance(userLocation.lat, userLocation.lng, lastSpawnedChest.lat, lastSpawnedChest.lng) <= 5.0 ? (
                                    <span style={{ color: '#2ecc71', marginLeft: '5px', fontWeight: 'bold' }}>(Hợp lệ &lt;= 5m)</span>
                                ) : (
                                    <span style={{ color: '#ff7675', marginLeft: '5px', fontWeight: 'bold' }}>(Quá xa &gt; 5m)</span>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {userLocation ? (
                        <div style={{ fontSize: '10px', color: '#747d8c', marginTop: '10px', textAlign: 'center' }}>
                            GPS: {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
                        </div>
                    ) : (
                        <div style={{ fontSize: '10px', color: '#ff7675', marginTop: '10px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <AlertTriangle size={12} /> Không tìm thấy toạ độ GPS
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

export default HiddenQuestDebug;
