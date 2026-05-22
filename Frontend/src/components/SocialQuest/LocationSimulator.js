import React, { useState } from 'react';
import { useSocialQuest } from './SocialQuestProvider';

const LocationSimulator = () => {
    const { sendLocation, questState } = useSocialQuest();
    
    // Trạng thái quản lý đóng/mở bảng điều khiển
    const [isOpen, setIsOpen] = useState(false);

    // Tọa độ mặc định
    const [lat, setLat] = useState(10.772461);
    const [lng, setLng] = useState(106.698055);

    const handleSend = () => {
        if (sendLocation) {
            sendLocation(lat, lng);
            console.log(`📍 Đã bắn tọa độ lên Server: ${lat}, ${lng}`);
        }
    };

    // ==========================================
    // GIAO DIỆN 1: KHI ĐANG ĐÓNG (NÚT THU GỌN NẰM BÊN TRÁI)
    // ==========================================
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'absolute',
                    bottom: '100px',
                    left: '20px',  /* Đã chuyển từ right sang left */
                    zIndex: 9999,
                    background: '#2c3e50',
                    color: 'white',
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderRadius: '50%',
                    width: '45px',
                    height: '45px',
                    fontSize: '20px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'transform 0.2s'
                }}
                title="Mở Mock GPS"
            >
                🛰️
            </button>
        );
    }

    // ==========================================
    // GIAO DIỆN 2: KHI BẤM MỞ BẢNG ĐIỀU KHIỂN (NẰM BÊN TRÁI)
    // ==========================================
    return (
        <div style={{
            position: 'absolute', 
            bottom: '100px', 
            left: '20px',  /* Đã chuyển từ right sang left */
            zIndex: 9999,
            background: 'rgba(0,0,0,0.85)', color: 'white', padding: '15px', borderRadius: '12px',
            width: '180px', fontSize: '13px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)'
        }}>
            {/* Header có nút Tắt (X) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: '#2ecc71', fontSize: '14px' }}>🛰️ MOCK GPS</h4>
                <button 
                    onClick={() => setIsOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#ff7675', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                >
                    ✕
                </button>
            </div>
            
            <div style={{ marginBottom: '8px' }}>
                <label style={{color: '#aaa', fontSize: '11px'}}>Vĩ độ (Latitude):</label>
                <input 
                    type="number" step="0.0001" value={lat} 
                    onChange={e => setLat(parseFloat(e.target.value))} 
                    style={inputStyle} 
                />
            </div>
            
            <div style={{ marginBottom: '12px' }}>
                <label style={{color: '#aaa', fontSize: '11px'}}>Kinh độ (Longitude):</label>
                <input 
                    type="number" step="0.0001" value={lng} 
                    onChange={e => setLng(parseFloat(e.target.value))} 
                    style={inputStyle} 
                />
            </div>
            
            <button 
                onClick={handleSend} 
                style={{
                    ...btnStyle, 
                    background: '#e74c3c',
                    cursor: 'pointer'
                }} 
            >
                🚀 Phát Tín Hiệu
            </button>
        </div>
    );
};

// CSS tĩnh
const inputStyle = { 
    width: '100%', padding: '6px', boxSizing: 'border-box', 
    background: '#2c3e50', color: 'white', border: '1px solid #34495e', 
    borderRadius: '4px', marginTop: '4px', outline: 'none'
};
const btnStyle = { 
    width: '100%', padding: '8px', color: 'white', border: 'none', 
    borderRadius: '6px', fontWeight: 'bold', transition: '0.2s' 
};

export default LocationSimulator;