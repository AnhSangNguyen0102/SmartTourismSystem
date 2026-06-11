import React from 'react';
import { Gem, Gift } from 'lucide-react';
import './TreasureOverlay.css';

const TreasureOverlay = ({ data }) => {
    if (!data) return null;

    const { points, locationName, stage } = data;

    return (
        <div className="treasure-overlay">
            <div className={`treasure-chest ${stage}`}>
                <div className="chest-emoji" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#f1c40f' }}>{stage === 'open' ? <Gem size={48} /> : <Gift size={48} />}</div>
            </div>
            
            {stage === 'open' && (
                <div className="reward-text show">
                    <p>Chúc mừng bạn đã check-in thành công!</p>
                    <p className="location-name">{locationName}</p>
                    <div className="points-earned">+{points} EXP</div>
                </div>
            )}
        </div>
    );
};

export default TreasureOverlay;
