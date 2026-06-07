import React, { useState, useEffect } from 'react';
import { voucherService } from '../../services/voucherService';
import { showToast } from '../../platform/dialog';
import { Ticket, QrCode, Clock, WalletCards, CheckCircle2, Gift } from 'lucide-react';
import './VouchersList.css';

const VoucherWallet = () => {
    const [myVouchers, setMyVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // State quản lý popup chi tiết trong ví
    const [selectedMyVoucher, setSelectedMyVoucher] = useState(null);

    useEffect(() => {
        loadMyVouchers();
    }, []);

    const loadMyVouchers = async () => {
        try {
            setLoading(true);
            const data = await voucherService.getMyVouchers();
            setMyVouchers(data || []);
        } catch (err) {
            console.error('Failed to load my vouchers:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUse = async (userVoucherId) => {
        try {
            await voucherService.useVoucher(userVoucherId);
            showToast('Đã sử dụng voucher thành công.', 'success');
            setSelectedMyVoucher(null); // Đóng popup
            loadMyVouchers(); // Tải lại danh sách
        } catch (err) {
            showToast(err.message || 'Lỗi khi sử dụng voucher', 'error');
        }
    };

    if (loading) return <div className="voucher-state-card">Đang tải ví voucher...</div>;

    const activeVouchers = myVouchers.filter(v => v.status === 'COLLECTED');
    const usedVouchers = myVouchers.filter(v => v.status === 'USED');

    return (
        <div className="voucher-wallet">
            <div className="voucher-wallet-hero">
                <div className="voucher-wallet-hero-icon"><WalletCards size={28} /></div>
                <div>
                    <span>Ưu đãi của bạn</span>
                    <h2>Ví Voucher</h2>
                    <p>{activeVouchers.length} voucher sẵn sàng sử dụng</p>
                </div>
            </div>
            
            {activeVouchers.length === 0 && usedVouchers.length === 0 && (
                <div className="voucher-empty-state">
                    <Gift size={34} />
                    <strong>Ví đang trống</strong>
                    <span>Đổi ưu đãi trong cửa hàng để voucher xuất hiện tại đây.</span>
                </div>
            )}

            {/* VOUCHER SẴN SÀNG SỬ DỤNG */}
            {activeVouchers.length > 0 && (
                <div className="voucher-wallet-section">
                    <h3><Ticket size={16} /> Sẵn sàng sử dụng <span>{activeVouchers.length}</span></h3>
                    <div>
                        {activeVouchers.map((item) => (
                            <div 
                                key={item.user_voucher_id} 
                                className="voucher-item-card"
                                onClick={() => setSelectedMyVoucher(item)}
                            >
                                {/* 1. Phần Ảnh: Lấy ảnh từ Database, giữ nguyên màu sắc vì chưa sử dụng */}
                                <div className="voucher-item-img-container">
                                    {item.voucher.image_url ? (
                                        <img 
                                            src={item.voucher.image_url} 
                                            alt={item.voucher.title} 
                                        />
                                    ) : (
                                        <QrCode size={40} className="text-orange-600" />
                                    )}
                                </div>
                                
                                {/* 2. Phần Thông tin: Hiển thị Brand Name thay vì Mã */}
                                <div className="voucher-item-info">
                                    <div className="voucher-brand">
                                        {item.voucher.brand_name || 'VOUCHER TRẠM DỪNG'}
                                    </div>
                                    <div className="voucher-title">{item.voucher.title}</div>
                                    
                                    {/* Gom Mã (Code) và Hạn sử dụng xuống chung 1 dòng */}
                                    <div className="voucher-cost">
                                        Mã: <b style={{color: '#e67e22'}}>{item.voucher.code}</b> | HSD: <b>{new Date(item.voucher.end_date).toLocaleDateString('vi-VN')}</b>
                                    </div>
                                    
                                    {/* So sánh chuỗi ngày YYYY-MM-DD để xác định đã tới hạn chưa */}
                                    {new Date().toISOString().split('T')[0] < item.voucher.start_date ? (
                                        <button 
                                            className="squishy-btn bg-slate-400 voucher-btn"
                                            style={{ cursor: 'not-allowed' }}
                                            disabled
                                        >
                                            Chưa tới hạn
                                        </button>
                                    ) : (
                                        <button 
                                            className="squishy-btn yellow voucher-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedMyVoucher(item);
                                            }}
                                        >
                                            Sử dụng
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* VOUCHER ĐÃ SỬ DỤNG */}
            {usedVouchers.length > 0 && (
                <div className="voucher-wallet-section voucher-wallet-section--used">
                    <h3><CheckCircle2 size={16} /> Đã sử dụng <span>{usedVouchers.length}</span></h3>
                    <div>
                        {usedVouchers.map((item) => (
                            <div key={item.user_voucher_id} className="voucher-item-card disabled">
                                
                                {/* 1. Phần Ảnh: Lấy ảnh từ DB, làm mờ đen trắng để thể hiện đã sử dụng */}
                                <div className="voucher-item-img-container" style={{backgroundColor: '#dfe4ea', borderColor: '#a4b0be'}}>
                                    {item.voucher.image_url ? (
                                        <img 
                                            src={item.voucher.image_url} 
                                            alt={item.voucher.title} 
                                            style={{ filter: 'grayscale(100%)', opacity: 0.6 }} 
                                        />
                                    ) : (
                                        <Ticket size={40} className="text-slate-400" />
                                    )}
                                </div>
                                
                                {/* 2. Phần Thông tin: Hiển thị Brand Name thay vì Mã */}
                                <div className="voucher-item-info">
                                    <div className="voucher-brand">
                                        {item.voucher.brand_name || 'VOUCHER TRẠM DỪNG'}
                                    </div>
                                    
                                    <div className="voucher-title" style={{textDecoration: 'line-through'}}>
                                        {item.voucher.title}
                                    </div>
                                    
                                    {/* Chuyển Mã (Code) xuống dưới cùng với ngày đã dùng */}
                                    <div className="voucher-cost" style={{color: '#a4b0be'}}>
                                        Mã: <b style={{textDecoration: 'line-through'}}>{item.voucher.code}</b> | Đã dùng: {item.used_at ? new Date(item.used_at).toLocaleDateString('vi-VN') : ''}
                                    </div>
                                </div>

                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* === POPUP CHI TIẾT ĐỂ SỬ DỤNG VOUCHER === */}
            {selectedMyVoucher && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content" style={{maxWidth: '380px'}}>
                        <div className="quest-modal-header" style={{borderBottom: 'none', paddingBottom: '10px'}}>
                            <h3 style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: '900', textTransform: 'uppercase', color: '#000'}}>
                                <Ticket size={24} /> Voucher của bạn
                            </h3>
                            <button className="quest-close-btn" onClick={() => setSelectedMyVoucher(null)}>✕</button>
                        </div>
                        
                        <div className="quest-modal-body" style={{paddingTop: 0}}>
                            <div className="voucher-detail-box">
                                <div className="voucher-detail-title">{selectedMyVoucher.voucher.title}</div>
                                <div className="voucher-detail-desc">{selectedMyVoucher.voucher.description || 'Vui lòng đưa mã này cho nhân viên tại quầy để được áp dụng ưu đãi.'}</div>
                                
                                <div className="voucher-detail-discount" style={{color: '#e67e22'}}>
                                    <span className="voucher-code-label">Mã ưu đãi</span>
                                    {selectedMyVoucher.voucher.code}
                                </div>
                                
                                <div className="voucher-detail-meta">
                                    <Clock size={20} style={{ color: '#000' }} /> Hạn sử dụng: {new Date(selectedMyVoucher.voucher.end_date).toLocaleDateString('vi-VN')}
                                </div>

                                <div style={{textAlign: 'center', margin: '20px 0'}}>
                                    <QrCode size={120} style={{display: 'inline-block', color: '#2c3e50'}} />
                                </div>

                                <button 
                                    className="squishy-btn yellow"
                                    style={{ width: '100%', padding: '16px', fontSize: '18px', fontWeight: '900', textTransform: 'uppercase' }}
                                    onClick={() => handleUse(selectedMyVoucher.user_voucher_id)}
                                >
                                    SỬ DỤNG VOUCHER
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VoucherWallet;
