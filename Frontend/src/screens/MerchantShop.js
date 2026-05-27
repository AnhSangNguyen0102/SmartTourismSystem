import React, { useState } from 'react';
import { Coffee, Landmark, Hotel, Puzzle, Coins, ArrowLeft } from 'lucide-react';
import { showAlert, showConfirm } from '../platform/dialog';

const MerchantShop = ({ user, onBack }) => {
    const [purchased, setPurchased] = useState([]);
    
    // Voucher configurations with Lucide icons
    const vouchers = [
        { id: 1, title: 'Voucher -20% Highland Coffee', cost: 150, IconComponent: Coffee },
        { id: 2, title: 'Vé vào cổng Dinh Độc Lập', cost: 300, IconComponent: Landmark },
        { id: 3, title: 'Buffet Khách sạn 5 sao', cost: 1500, IconComponent: Hotel },
        { id: 4, title: 'Mảnh ghép Áo choàng phiêu lưu', cost: 50, IconComponent: Puzzle },
    ];

    const handleBuy = async (item) => {
        if (user.points_balance < item.cost) {
            await showAlert('Bạn không đủ xu để đổi vật phẩm này!');
            return;
        }
        
        const confirmed = await showConfirm(`Bạn có chắc muốn đổi ${item.cost} xu lấy ${item.title} không?`);
        if (confirmed) {
            // Deduct points locally for demo
            user.points_balance -= item.cost;
            setPurchased([...purchased, item.id]);
            await showAlert(`Chúc mừng! Bạn đã nhận được ${item.title}`);
        }
    };

    return (
        <div style={{ padding: '20px', backgroundColor: '#2f3542', minHeight: '100vh', color: '#f1f2f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                <button 
                    onClick={onBack}
                    style={{ background: 'none', border: 'none', color: '#fbc531', fontSize: '24px', cursor: 'pointer', marginRight: '15px', display: 'flex', alignItems: 'center' }}
                >
                    <ArrowLeft size={24} />
                </button>
                <h2 style={{ margin: 0, color: '#fbc531' }}>Quầy Thương Nhân (NPC)</h2>
            </div>
            
            <div style={{ 
                backgroundColor: '#1e272e', 
                padding: '15px', 
                borderRadius: '12px', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '25px',
                border: '1px solid #57606f'
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#a4b0be' }}>Túi đồ của bạn</h3>
                    <p style={{ margin: '5px 0 0', fontSize: '14px' }}>Số dư hiện tại:</p>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f39c12', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Coins size={24} style={{ color: '#fbc531' }} /> {user?.points_balance || 0}
                </div>
            </div>
            
            <h3 style={{ borderBottom: '2px solid #57606f', paddingBottom: '10px', marginBottom: '20px' }}>Vật phẩm có sẵn</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
                {vouchers.map(item => {
                    const isPurchased = purchased.includes(item.id);
                    const Icon = item.IconComponent;
                    return (
                        <div key={item.id} style={{ 
                            backgroundColor: '#57606f', 
                            padding: '15px', 
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <div style={{ background: '#2f3542', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbc531' }}>
                                    <Icon size={32} />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '15px', color: '#ffffff' }}>{item.title}</h4>
                                    <p style={{ margin: '5px 0 0', color: '#ffa502', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {item.cost} <Coins size={16} style={{ color: '#fbc531' }} />
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => handleBuy(item)}
                                disabled={isPurchased}
                                style={{ 
                                    background: isPurchased ? '#2f3542' : '#2ed573', 
                                    color: 'white', 
                                    border: 'none', 
                                    padding: '8px 16px', 
                                    borderRadius: '8px',
                                    fontWeight: 'bold',
                                    cursor: isPurchased ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isPurchased ? 'Đã đổi' : 'Đổi ngay'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MerchantShop;
