// src/components/MainTabs/RedeemSuccessModal.jsx
import React from 'react';
import { Sparkles } from 'lucide-react';

const RedeemSuccessModal = ({ redeemedVoucherInfo, onClose }) => {
    return (
        <div className="quest-modal-overlay">
            <div className="quest-modal-content" style={{ textAlign: 'center', maxWidth: '400px' }}>
                <div className="quest-modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={20} style={{ color: '#ffd32d' }} /> Đổi voucher thành công!
                    </h3>
                    <button className="quest-close-btn" onClick={onClose}>✕</button>
                </div>
                <div className="quest-modal-body" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '50px', marginBottom: '15px' }}>🎉</div>
                    <h4 style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff', marginBottom: '10px' }}>
                        {redeemedVoucherInfo.brand}
                    </h4>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', color: '#2ecc71', marginBottom: '15px' }}>
                        {redeemedVoucherInfo.title}
                    </p>
                    <p style={{ fontSize: '13px', color: '#747d8c', marginBottom: '10px' }}>
                        Mã ưu đãi của bạn là:
                    </p>
                    <div style={{
                        background: '#ffd32d',
                        border: '3.5px solid #2c3e50',
                        borderRadius: '12px',
                        padding: '10px 20px',
                        fontSize: '20px',
                        fontWeight: '900',
                        color: '#2c3e50',
                        letterSpacing: '1px',
                        display: 'inline-block',
                        marginBottom: '20px',
                        boxShadow: '0 4px 0 #2c3e50'
                    }}>
                        {redeemedVoucherInfo.code}
                    </div>
                    <p style={{ fontSize: '11px', color: '#95a5a6' }}>
                        *Vui lòng chụp màn hình hoặc sao chép mã trên để sử dụng trực tiếp tại cửa hàng.
                    </p>
                    <button 
                        className="quest-close-success-btn"
                        onClick={onClose}
                        style={{ width: '100%', marginTop: '15px' }}
                    >
                        Tuyệt vời!
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RedeemSuccessModal;
