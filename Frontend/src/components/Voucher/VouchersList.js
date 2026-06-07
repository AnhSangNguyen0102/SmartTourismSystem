import React, { useState, useEffect } from 'react';
import { voucherService } from '../../services/voucherService';
import { showToast } from '../../platform/dialog';
import './VouchersList.css';
import { Ticket, Coins, Clock, Gift, PackageOpen, Store } from 'lucide-react';

const VouchersList = ({ locationId, onVoucherClaimed }) => {
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(null);
    const [error, setError] = useState(null);
    
    // State lưu voucher đang được bấm vào để hiện chi tiết
    const [selectedVoucher, setSelectedVoucher] = useState(null);

    useEffect(() => {
        loadVouchers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locationId]);

    const loadVouchers = async () => {
        try {
            setLoading(true);
            const data = locationId 
                ? await voucherService.getVouchersByLocation(locationId)
                : await voucherService.getAllActiveVouchers();
            setVouchers(data || []);
        } catch (err) {
            console.error('Failed to load vouchers:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClaim = async (voucherId) => {
        try {
            setClaiming(voucherId);
            const res = await voucherService.claimVoucher(voucherId);
            const newBalance = res?.new_point_balance ?? res?.new_points_balance ?? res?.new_exp_balance;
            showToast(
                newBalance != null
                    ? `Đổi voucher thành công. Số dư còn ${newBalance} xu.`
                    : 'Đổi voucher thành công. Voucher đã được thêm vào ví.',
                'success'
            );
            
            setVouchers(vouchers.map(v => 
                v.voucher_id === voucherId 
                    ? { ...v, remaining_quantity: v.remaining_quantity - 1 } 
                    : v
            ));

            if (onVoucherClaimed) onVoucherClaimed(res);
            setSelectedVoucher(null); // Đóng modal sau khi đổi thành công
        } catch (err) {
            showToast(err.message || 'Có lỗi xảy ra khi đổi voucher', 'error');
        } finally {
            setClaiming(null);
        }
    };

    if (loading) return <div className="voucher-state-card">Đang tải ưu đãi...</div>;
    if (error) return <div className="voucher-state-card voucher-state-card--error">{error}</div>;
    if (vouchers.length === 0) return (
        <div className="voucher-state-card">
            <PackageOpen size={28} />
            <strong>Chưa có ưu đãi mới</strong>
            <span>Quay lại sau để khám phá voucher mới.</span>
        </div>
    );

    return (
        <div className="vouchers-list">
            {vouchers.map(voucher => (
                <div 
                    key={voucher.voucher_id} 
                    className={`voucher-item-card ${voucher.remaining_quantity <= 0 ? 'disabled' : ''}`}
                    onClick={() => voucher.remaining_quantity > 0 && setSelectedVoucher(voucher)}
                >
                    <div className="voucher-item-img-container">
                        {voucher.image_url ? (
                            <img src={voucher.image_url} alt={voucher.title} />
                        ) : (
                            <Gift size={34} />
                        )}
                    </div>
                    
                    <div className="voucher-item-info">
                        <div className="voucher-brand">
                            {voucher.brand_name || (voucher.voucher_type === 'SYSTEM' ? 'HỆ THỐNG ĐỘC QUYỀN' : 'ĐỐI TÁC DOANH NGHIỆP')}
                        </div>
                        <div className="voucher-title">{voucher.title}</div>
                        <div className="voucher-cost">
                            <Coins size={14} /> <b>{voucher.point_cost > 0 ? `${voucher.point_cost} xu` : 'Miễn phí'}</b>
                            <span className="voucher-stock">Còn {voucher.remaining_quantity}</span>
                        </div>
                        <button 
                            className={`squishy-btn ${voucher.remaining_quantity <= 0 ? 'bg-slate-400' : 'yellow'} voucher-btn`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if(voucher.remaining_quantity > 0) setSelectedVoucher(voucher);
                            }}
                            disabled={voucher.remaining_quantity <= 0}
                        >
                            {voucher.remaining_quantity <= 0 ? 'Hết hàng' : 'Đổi Quà'}
                        </button>
                    </div>
                </div>
            ))}

            {/* === POPUP CHI TIẾT VOUCHER (MODAL) === */}
            {selectedVoucher && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content" style={{maxWidth: '380px'}}>
                        <div className="quest-modal-header" style={{borderBottom: 'none', paddingBottom: '10px'}}>
                            <h3 style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: '900', textTransform: 'uppercase', color: '#ffffff'}}>
                                <Ticket size={24} /> Chi tiết ưu đãi
                            </h3>
                            <button className="quest-close-btn" onClick={() => setSelectedVoucher(null)}>✕</button>
                        </div>
                        
                        <div className="quest-modal-body" style={{paddingTop: 0}}>
                            <div className="voucher-detail-box">
                                <div className="voucher-detail-title">{selectedVoucher.title}</div>
                                <div className="voucher-detail-desc">{selectedVoucher.description || 'Voucher độc quyền từ hệ thống. Tối đa 1 lần/người.'}</div>
                                
                                <div className="voucher-detail-discount">
                                    {/* Ẩn mức giảm nếu là 0 (BOGO/CUSTOM), thay bằng chữ */}
                                    {selectedVoucher.discount_value > 0 ? (
                                        <div className="voucher-detail-discount">
                                            -{selectedVoucher.discount_value}{selectedVoucher.discount_type === 'PERCENT' ? '%' : 'đ'}
                                        </div>
                                    ) : (
                                        <div className="voucher-detail-discount" style={{ color: '#e67e22' }}>
                                            {selectedVoucher.discount_type === 'BOGO' ? 'MUA 1 TẶNG 1' : 'ƯU ĐÃI ĐẶC BIỆT'}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="voucher-detail-meta">
                                    <PackageOpen size={18} /> Còn lại: {selectedVoucher.remaining_quantity}
                                </div>
                                <div className="voucher-detail-meta">
                                    <Coins size={18} /> {selectedVoucher.point_cost > 0 ? `${selectedVoucher.point_cost} xu` : 'Miễn phí'}
                                </div>
                                <div className="voucher-detail-meta">
                                    <Store size={18} /> {selectedVoucher.brand_name || 'Smart Tourism'}
                                </div>
                                {selectedVoucher.end_date && (
                                    <div className="voucher-detail-meta">
                                        <Clock size={18} /> Hạn dùng: {new Date(selectedVoucher.end_date).toLocaleDateString('vi-VN')}
                                    </div>
                                )}

                                <button 
                                    className={`squishy-btn ${selectedVoucher.remaining_quantity <= 0 ? 'bg-slate-400' : 'yellow'}`}
                                    style={{ width: '100%', marginTop: '20px', padding: '16px', fontSize: '18px', fontWeight: '900', textTransform: 'uppercase' }}
                                    onClick={() => handleClaim(selectedVoucher.voucher_id)}
                                    disabled={claiming === selectedVoucher.voucher_id || selectedVoucher.remaining_quantity <= 0}
                                >
                                    {claiming === selectedVoucher.voucher_id ? 'ĐANG ĐỔI...' : 'ĐỔI VOUCHER'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VouchersList;
