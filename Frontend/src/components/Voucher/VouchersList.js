import React, { useState, useEffect } from 'react';
import { voucherService } from '../../services/voucherService';
import './VouchersList.css';
import { Ticket, Star, Clock } from 'lucide-react';

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
            alert(`Thành công! Điểm hiện tại: ${res.new_exp_balance} điểm`);
            
            setVouchers(vouchers.map(v => 
                v.voucher_id === voucherId 
                    ? { ...v, remaining_quantity: v.remaining_quantity - 1 } 
                    : v
            ));

            if (onVoucherClaimed) onVoucherClaimed(res);
            setSelectedVoucher(null); // Đóng modal sau khi đổi thành công
        } catch (err) {
            alert(err.message || 'Có lỗi xảy ra khi đổi voucher');
        } finally {
            setClaiming(null);
        }
    };

    if (loading) return <div className="p-4 text-center">Đang tải voucher...</div>;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;
    if (vouchers.length === 0) return null;

    return (
        <div className="vouchers-list mt-2">
            {vouchers.map(voucher => (
                <div 
                    key={voucher.voucher_id} 
                    className={`voucher-item-card ${voucher.remaining_quantity <= 0 ? 'disabled' : ''}`}
                    onClick={() => voucher.remaining_quantity > 0 && setSelectedVoucher(voucher)}
                >
                    <div className="voucher-item-img-container">
                        {/* Lấy link ảnh từ database, kèm ảnh dự phòng (fallback) nếu DB chưa có */}
                        <img 
                            src={voucher.image_url || 'https://via.placeholder.com/100?text=Voucher'} 
                            alt={voucher.title} 
                        />
                    </div>
                    
                    <div className="voucher-item-info">
                        <div className="voucher-brand">
                            {voucher.brand_name || (voucher.voucher_type === 'SYSTEM' ? 'HỆ THỐNG ĐỘC QUYỀN' : 'ĐỐI TÁC DOANH NGHIỆP')}
                        </div>
                        <div className="voucher-title">{voucher.title}</div>
                        <div className="voucher-cost">
                            Giá trị quy đổi: <b>{voucher.point_cost > 0 ? `${voucher.point_cost} xu` : 'Miễn phí'}</b>
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
                            <h3 style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: '900', textTransform: 'uppercase', color: '#000'}}>
                                <Ticket size={28} /> VOUCHER TRẠM DỪNG
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
                                    <Clock size={20} style={{ color: '#000' }} /> Còn lại: {selectedVoucher.remaining_quantity}
                                </div>
                                <div className="voucher-detail-meta">
                                    <Star size={20} style={{ color: '#000' }} /> {selectedVoucher.point_cost} điểm
                                </div>

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