import React from 'react';
import { Gem, Gift } from 'lucide-react';
import './TreasureOverlay.css';

const TreasureOverlay = ({ data }) => {
    if (!data) return null;

    // Lấy thêm biến coins từ data truyền vào
    const { points, coins, locationName, stage } = data;

    return (
        <div className="treasure-overlay">
            <div className={`treasure-chest ${stage}`}>
                <div className="chest-emoji" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#f1c40f' }}>{stage === 'open' ? <Gem size={48} /> : <Gift size={48} />}</div>
            </div>
            
            {stage === 'open' && (
                <div className="reward-text show">
                    {/* Tùy chỉnh câu thông báo rương tại đây */}
                    <p>Tuyệt vời! Bạn đã khám phá thành công</p> 
                    <p className="location-name">{locationName}</p>
                    
                    {/* Hiển thị cả EXP và Xu */}
                    <div className="points-earned">
                        +{points} EXP {coins ? ` | +${coins} Xu` : ''}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TreasureOverlay;