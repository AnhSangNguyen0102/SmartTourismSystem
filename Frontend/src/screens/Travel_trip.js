import React, { useState, useEffect } from 'react';
import { getTripHistory } from '../services/tripService';
import './Travel_trip.css';

const HomeTravel = ({ isGuest, onRequireLogin, user, onLogout, onOpenPlan, onOpenLocationRegister, onOpenProfileEdit, onOpenHistory, onOpenTripDetail }) => {

    const [showMenu, setShowMenu] = useState(false);
    const [ongoingTrips, setOngoingTrips] = useState([]);
    const [loadingTrips, setLoadingTrips] = useState(false);

    useEffect(() => {
        const fetchOngoingTrips = async () => {
            if (isGuest || !user) return;
            const token = localStorage.getItem('access_token');
            if (!token) return;

            setLoadingTrips(true);
            const data = await getTripHistory(token);
            // Lọc ra các chuyến đi chưa hoàn thành (DRAFT hoặc CONFIRMED)
            const ongoing = data.filter(item => item.status === 'DRAFT' || item.status === 'CONFIRMED');
            setOngoingTrips(ongoing);
            setLoadingTrips(false);
        };
        fetchOngoingTrips();
    }, [isGuest, user]);

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const getGreeting = () => {
        const currentHour = new Date().getHours();
        if (currentHour < 12) return 'Chào buổi sáng,';
        if (currentHour < 18) return 'Chào buổi chiều,';
        return 'Chào buổi tối,';
    };

    const featuredTours = [
        {
            id: 1, title: "Vịnh Hạ Long", location: "Quảng Ninh, Việt Nam", price: "$120", rating: "⭐ 4.8",
            image: "https://images.unsplash.com/photo-1528127269322-539801943592?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
        },
        {
            id: 2, title: "Ruộng Bậc Thang", location: "Mù Cang Chải", price: "$85", rating: "⭐ 4.9",
            image: "https://images.unsplash.com/photo-1576485290814-1c72aa4bbb8e?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
        },
        {
            id: 3, title: "Phố Cổ Hội An", location: "Quảng Nam, Việt Nam", price: "$50", rating: "⭐ 4.7",
            image: "https://images.unsplash.com/photo-1555921015-5532091f6026?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80"
        }
    ];

    return (
        <div className="home-container" style={{ position: 'relative' }}>

            {/* =========================================================
                KHU VỰC ĐƯỢC GHIM CỐ ĐỊNH Ở TRÊN CÙNG (STICKY HEADER) 
            ============================================================= */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                backgroundColor: '#ffffff',
                paddingTop: '20px',
                paddingBottom: '2px',
                marginTop: '-20px',
                marginLeft: '-20px',
                marginRight: '-20px',
                paddingLeft: '20px',
                paddingRight: '10px',
            }}>
                <div className="header">
                    <div className="greeting">
                        <p>{isGuest ? 'Chào bạn mới,' : getGreeting()}</p>
                        <h2>{isGuest ? 'Khách du lịch 🎒' : `${user?.user?.full_name || user?.full_name || 'Bạn'} 🎒`}</h2>
                    </div>

                    <div style={{ position: 'relative' }}>
                        {isGuest ? (
                            <button onClick={onRequireLogin} className="login-btn-guest">Đăng nhập</button>
                        ) : (
                            <img
                                src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"
                                alt="Avatar"
                                className="avatar"
                                onClick={() => setShowMenu(!showMenu)}
                                style={{ cursor: 'pointer' }}
                            />
                        )}

                        {/* Khung Menu Tác vụ */}
                        {showMenu && !isGuest && (
                            <div className="user-menu">
                                <button className="menu-btn" onClick={onOpenHistory}>
                                    <span>📜</span> Lịch sử chuyến đi
                                </button>
                                <button className="menu-btn" onClick={() => {
                                    if (onOpenProfileEdit) {
                                        onOpenProfileEdit();
                                    } else {
                                        alert("❌ Lỗi: Chưa truyền onOpenProfileEdit!");
                                    }
                                }}>
                                    <span>⚙️</span> Cài đặt quyền riêng tư
                                </button>
                                <button className="menu-btn"><span>❓</span> Trợ giúp và hỗ trợ</button>
                                <button className="menu-btn"><span>💬</span> Đóng góp ý kiến</button>
                                <button className="menu-btn logout-btn" onClick={onLogout}>
                                    <span>🚪</span> Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Thanh Tìm Kiếm */}
                <div className="search-bar" style={{ marginTop: '1px' }}>
                    <span>🔍</span>
                    <input type="text" placeholder="Bạn muốn đi đâu hôm nay?" style={{ backgroundColor: '#f1f2f6' }} />
                </div>
            </div>
            {/* ============ KẾT THÚC KHU VỰC GHIM CỐ ĐỊNH ============ */}


            {/* CÁC PHẦN BÊN DƯỚI NÀY SẼ TỰ DO CUỘN (SCROLL) */}
            <div style={{ paddingTop: '10px' }}>

                {/* Banner tạo lộ trình DUY NHẤT */}
                <div style={{
                    background: 'linear-gradient(135deg, #0abde3 0%, #22a6b3 100%)',
                    padding: '20px',
                    borderRadius: '20px',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    boxShadow: '0 8px 20px rgba(10, 189, 227, 0.3)'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Chưa biết đi đâu?</h3>
                        <p style={{ margin: '5px 0 0', fontSize: '14px', opacity: 0.9 }}>Để hệ thống tạo lộ trình riêng</p>
                    </div>
                    <button
                        onClick={isGuest ? onRequireLogin : onOpenPlan}
                        style={{ background: 'white', color: '#0abde3', border: 'none', padding: '12px 18px', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                    >
                        Bắt đầu 🚀
                    </button>
                </div>

                {/* Lộ trình đang diễn ra */}
                {!isGuest && loadingTrips && (
                    <div style={{ textAlign: 'center', margin: '20px 0', color: '#8395a7', fontSize: '14px' }}>
                        ⏳ Đang tải lộ trình...
                    </div>
                )}
                {!isGuest && ongoingTrips.length > 0 && (
                    <div style={{ marginBottom: '25px' }}>
                        <div className="section-title">Hành trình đang diễn ra</div>
                        <div className="ongoing-trips-list">
                            {ongoingTrips.map(trip => (
                                <div
                                    key={trip.itinerary_id}
                                    className="ongoing-trip-card"
                                    onClick={() => onOpenTripDetail && onOpenTripDetail(trip.itinerary_id)}
                                >
                                    <div className="card-status ongoing">
                                        🔄 Đang diễn ra
                                    </div>
                                    <div className="card-info">
                                        <h3 style={{ margin: '0 0 5px', fontSize: '16px', color: '#2f3542' }}>{trip.name || 'Hành trình không tên'}</h3>
                                        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#747d8c' }}>
                                            Ngày tạo: {formatDate(trip.create_at)}
                                        </p>
                                        <div style={{ display: 'flex', gap: '15px', fontSize: '13px', color: '#57606f', fontWeight: '500' }}>
                                            <span>🛣️ {trip.total_distance} km</span>
                                            <span>💰 {new Intl.NumberFormat('vi-VN').format(trip.total_budget)} đ</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Banner Doanh Nghiệp */}
                {!isGuest && user?.role === 'ENTERPRISE' && (
                    <div style={{
                        background: 'linear-gradient(135deg, #f0932b 0%, #ffbe76 100%)',
                        padding: '20px',
                        borderRadius: '20px',
                        color: 'white',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '25px',
                        boxShadow: '0 8px 20px rgba(240, 147, 43, 0.3)'
                    }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Kênh Doanh Nghiệp</h3>
                            <p style={{ margin: '5px 0 0', fontSize: '14px', opacity: 0.9 }}>Thêm địa điểm kinh doanh mới</p>
                        </div>
                        <button
                            onClick={onOpenLocationRegister}
                            style={{ background: 'white', color: '#f0932b', border: 'none', padding: '12px 18px', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}
                        >
                            + Thêm Mới
                        </button>
                    </div>
                )}

                {/* Danh sách Tour */}
                <div className="section-title">Khám phá địa điểm <span>Xem tất cả</span></div>
                <div className="card-scroller">
                    {featuredTours.map((tour) => (
                        <div className="tour-card" key={tour.id}>
                            <img src={tour.image} alt={tour.title} className="tour-image" />
                            <h3 className="tour-title">{tour.title}</h3>
                            <p className="tour-location">📍 {tour.location}</p>
                            <div className="tour-footer">
                                <div className="tour-price">{tour.price} <span>/người</span></div>
                                <div className="tour-rating">{tour.rating}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default HomeTravel;