// src/components/MainTabs/FriendsScreen.jsx
import React, { useState } from 'react';
import SocialFeedScreen from '../SocialFeedScreen';
import FindCompanionsScreen from '../FindCompanionsScreen';
import ChatScreen from '../ChatScreen';
import './FriendsScreen.css';

const FriendsScreen = ({
    userInfo,
    onRequireLogin,
    setActiveTab
}) => {
    const [friendsTab, setFriendsTab] = useState('feed'); // 'feed', 'matching', 'chat'

    return (
        <div className="friends-screen-wrapper" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Internal sub-navigation tabs */}
            <div className="friends-sub-tabs" style={{ display: 'flex', borderBottom: '2.5px solid var(--game-border-color)', backgroundColor: 'var(--st-surface)', padding: '8px 16px', gap: '8px', zIndex: 10 }}>
                <button 
                    onClick={() => setFriendsTab('feed')}
                    style={{
                        flex: 1,
                        padding: '8px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        border: '2.5px solid var(--game-border-color)',
                        borderRadius: '12px',
                        backgroundColor: friendsTab === 'feed' ? 'var(--game-yellow)' : 'var(--st-surface)',
                        color: friendsTab === 'feed' ? '#2c3e50' : 'var(--st-text)',
                        cursor: 'pointer',
                        boxShadow: friendsTab === 'feed' ? 'none' : '0 3px 0 var(--game-border-color)',
                        transform: friendsTab === 'feed' ? 'translateY(3px)' : 'none'
                    }}
                >
                    Bản Tin
                </button>
                <button 
                    onClick={() => setFriendsTab('matching')}
                    style={{
                        flex: 1,
                        padding: '8px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        border: '2.5px solid var(--game-border-color)',
                        borderRadius: '12px',
                        backgroundColor: friendsTab === 'matching' ? 'var(--game-yellow)' : 'var(--st-surface)',
                        color: friendsTab === 'matching' ? '#2c3e50' : 'var(--st-text)',
                        cursor: 'pointer',
                        boxShadow: friendsTab === 'matching' ? 'none' : '0 3px 0 var(--game-border-color)',
                        transform: friendsTab === 'matching' ? 'translateY(3px)' : 'none'
                    }}
                >
                    Ghép Đôi
                </button>
                <button 
                    onClick={() => setFriendsTab('chat')}
                    style={{
                        flex: 1,
                        padding: '8px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        border: '2.5px solid var(--game-border-color)',
                        borderRadius: '12px',
                        backgroundColor: friendsTab === 'chat' ? 'var(--game-yellow)' : 'var(--st-surface)',
                        color: friendsTab === 'chat' ? '#2c3e50' : 'var(--st-text)',
                        cursor: 'pointer',
                        boxShadow: friendsTab === 'chat' ? 'none' : '0 3px 0 var(--game-border-color)',
                        transform: friendsTab === 'chat' ? 'translateY(3px)' : 'none'
                    }}
                >
                    Trò Chuyện
                </button>
            </div>

            <div className="friends-screen-content" style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ display: friendsTab === 'feed' ? 'block' : 'none', height: '100%' }}>
                    <SocialFeedScreen 
                        user={userInfo} 
                        onRequireLogin={onRequireLogin} 
                        onOpenProfile={() => setActiveTab('profile')} 
                    />
                </div>
                <div style={{ display: friendsTab === 'matching' ? 'block' : 'none', height: '100%' }}>
                    <FindCompanionsScreen 
                        user={userInfo} 
                        onRequireLogin={onRequireLogin} 
                    />
                </div>
                <div style={{ display: friendsTab === 'chat' ? 'block' : 'none', height: '100%' }}>
                    <ChatScreen 
                        user={userInfo} 
                        onRequireLogin={onRequireLogin} 
                    />
                </div>
            </div>
        </div>
    );
};

export default FriendsScreen;
