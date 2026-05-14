import React, { useState } from 'react';
import EnterpriseDashboard from './EnterpriseDashboard';

const EnterpriseTabs = ({ user, onLogout, onOpenLocationRegister, onOpenProfileEdit }) => {
    const [activeTab, setActiveTab] = useState('dashboard');

    // Dữ liệu mockup để Doanh nghiệp thấy trực quan
    const mockServices = [
        { id: 1, name: 'Khách sạn MTP Luxury', status: 'ACTIVE', views: 850 },
        { id: 2, name: 'Tour Dĩ An - Bình Dương', status: 'PENDING', views: 0 }
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f4f6f8' }}>

            {/* 1. KHU VỰC NỘI DUNG CHÍNH */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>

                {/* ========================================== */}
                {/* TAB 1: TỔNG QUAN (DASHBOARD)                 */}
                {/* ========================================== */}
                {activeTab === 'dashboard' && (
                    <EnterpriseDashboard user={user} />  // <-- Gọi Component ở đây
                )}

                {/* ========================================== */}
                {/* TAB 2: QUẢN LÝ DỊCH VỤ                       */}
                {/* ========================================== */}
                {activeTab === 'services' && (
                    <div style={{ padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '22px' }}>Dịch vụ của bạn</h2>
                            <button
                                onClick={onOpenLocationRegister}
                                style={{ padding: '10px 15px', background: '#e67e22', color: 'white', borderRadius: '10px', border: 'none', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(230, 126, 34, 0.3)' }}
                            >
                                + Đăng mới
                            </button>
                        </div>

                        {/* Danh sách Dịch vụ (Mockup) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {mockServices.map(service => (
                                <div key={service.id} style={{ background: '#fff', borderRadius: '15px', padding: '15px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h3 style={{ margin: 0, fontSize: '16px', color: '#2c3e50' }}>{service.name}</h3>
                                        <span style={{
                                            padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold',
                                            backgroundColor: service.status === 'ACTIVE' ? '#e8f8f5' : '#fff3cd',
                                            color: service.status === 'ACTIVE' ? '#27ae60' : '#856404'
                                        }}>
                                            {service.status === 'ACTIVE' ? 'ĐANG HIỂN THỊ' : 'CHỜ DUYỆT'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                                        <span style={{ fontSize: '13px', color: '#7f8c8d' }}>👁️ {service.views} lượt xem</span>
                                        <button style={{ background: 'none', border: '1px solid #bdc3c7', padding: '5px 10px', borderRadius: '6px', color: '#2c3e50', fontSize: '12px', cursor: 'pointer' }}>
                                            ✏️ Sửa
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* 2. THANH MENU ĐIỀU HƯỚNG DƯỚI ĐÁY (Bottom Navigation) */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-around',
                padding: '15px 10px 25px 10px', // Đệm thêm phía dưới cho giống màn hình điện thoại
                backgroundColor: '#ffffff',
                borderTop: '1px solid #ecf0f1',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.02)'
            }}>
                <button
                    onClick={() => setActiveTab('dashboard')}
                    style={{
                        color: activeTab === 'dashboard' ? '#e67e22' : '#95a5a6',
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: activeTab === 'dashboard' ? 'bold' : 'normal', cursor: 'pointer'
                    }}
                >
                    <span style={{ fontSize: '20px' }}>📊</span> Tổng quan
                </button>
                <button
                    onClick={() => setActiveTab('services')}
                    style={{
                        color: activeTab === 'services' ? '#e67e22' : '#95a5a6',
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: activeTab === 'services' ? 'bold' : 'normal', cursor: 'pointer'
                    }}
                >
                    <span style={{ fontSize: '20px' }}>🛍️</span> Quản lý
                </button>
                <button
                    onClick={onOpenProfileEdit}
                    style={{
                        color: '#95a5a6',
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer'
                    }}
                >
                    <span style={{ fontSize: '20px' }}>⚙️</span> Cài đặt
                </button>
                <button
                    onClick={onLogout}
                    style={{
                        color: '#e74c3c',
                        background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer'
                    }}
                >
                    <span style={{ fontSize: '20px' }}>🚪</span> Đăng xuất
                </button>
            </div>
        </div>
    );
};

export default EnterpriseTabs;