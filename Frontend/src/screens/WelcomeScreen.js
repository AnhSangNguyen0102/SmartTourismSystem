import React from 'react';
import './WelcomeScreen.css';

const WelcomeScreen = ({ onSignIn, onCreateAccount, onSkip }) => {
    return (
        <div className="welcome-container">
            {/* Cloud Background Layer */}
            <div className="game-cloud cloud-1"></div>
            <div className="game-cloud cloud-2"></div>
            <div className="game-cloud cloud-3"></div>

            <button className="skip-btn squishy-btn yellow" onClick={onSkip}>
                Bỏ qua
            </button>

            {/* Character Lobby Card */}
            <div className="character-lobby-card">
                <div className="character-avatar-wrapper">
                    <img 
                        src="https://api.dicebear.com/7.x/adventurer/svg?seed=tan-thu-viet-nam" 
                        alt="Hero Character" 
                        className="lobby-mascot-img"
                        onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = 'https://api.dicebear.com/7.x/adventurer/svg?seed=smart-tourism';
                        }}
                    />
                    <div className="level-badge-float">LV.1</div>
                </div>
                <div className="character-stats-row">
                    <span className="stat-pill">Tân thủ</span>
                    <span className="stat-pill">0 EXP</span>
                </div>
            </div>

            {/* Khối chữ phong cách hoạt hình */}
            <div className="text-section">
                <h1 className="title-line text-yellow">VIỄN CHINH</h1>
                <h1 className="title-line text-blue">
                    VIỆT NAM
                    <svg className="sparkle-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#ffd32d" stroke="#2c3e50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </h1>
                <p className="sub-text">
                    Chào mừng bạn đến với chuyến phiêu lưu kỳ thú! Hãy vượt qua các thử thách GPS, quét mã QR và săn tìm kho báu ẩn giấu để thăng cấp nhé!
                </p>
            </div>

            {/* Khối Nút bấm Game */}
            <div className="btn-group">
                <button className="btn-primary squishy-btn" onClick={onSignIn}>
                    BẮT ĐẦU CHƠI
                </button>
                <button className="btn-outline squishy-btn yellow" onClick={onCreateAccount}>
                    TẠO TÀI KHOẢN
                </button>
            </div>
        </div>
    );
};

export default WelcomeScreen;
