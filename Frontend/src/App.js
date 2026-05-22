import React, { useState, useEffect } from 'react';
import SplashScreen from './screens/SplashScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import RegisterScreen from './screens/Auth/RegisterScreen';
import LoginScreen from './screens/Auth/LoginScreen';
import ForgotPasswordScreen from './screens/Auth/ForgotPasswordScreen';

import TripInputForm from './components/TripInput/TripInputForm';
import LocationRegister from './components/LocationRegister/LocationRegister';
import MainTabs from './components/MainTabs';
import EnterpriseTabs from './components/EnterpriseTabs';

import UserProfile from './screens/UserProfile';
import HistoryScreen from './screens/Trip/HistoryScreen';
import PlanRecommendScreen from './screens/Trip/PlanRecommendScreen';
import TripDetailScreen from './screens/Trip/TripDetailScreen';
import LocationDetailScreen from './screens/Trip/LocationDetailScreen';

// Import Context và Overlay của Social Quest
import { SocialQuestProvider } from './components/SocialQuest/SocialQuestProvider';
import SocialQuestOverlay from './components/SocialQuest/SocialQuestOverlay';
import LocationSimulator from './components/SocialQuest/LocationSimulator';

function App() {
    const [currentScreen, setCurrentScreen] = useState('splash');
    const [isGuest, setIsGuest] = useState(false);

    const [currentUser, setCurrentUser] = useState(null);
    const [planPayload, setPlanPayload] = useState(null);
    const [currentItineraryId, setCurrentItineraryId] = useState(null);
    const [currentLocationDetail, setCurrentLocationDetail] = useState(null);

    const refreshUser = async () => {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
            const res = await fetch('http://127.0.0.1:8000/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentUser(data);
            }
        } catch (error) {
            console.error("Lỗi cập nhật user:", error);
        }
    };

    // =========================================================================
    // 1. TỰ ĐỘNG ĐĂNG NHẬP VÀ LẤY FULL DATA KHI MỞ APP (F5 KHÔNG BỊ MẤT)
    // =========================================================================
    useEffect(() => {
        const fetchUserData = async () => {
            const token = localStorage.getItem('access_token');
            if (token) {
                try {
                    const res = await fetch('http://127.0.0.1:8000/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setCurrentUser(data);
                        setCurrentScreen('main'); 
                    }
                } catch (error) {
                    console.error("Lỗi xác thực:", error);
                }
            }
        };

        if (currentScreen === 'welcome') {
            fetchUserData();
        }
    }, [currentScreen]);

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setCurrentUser(null);
        setIsGuest(false);
        setCurrentScreen('welcome');
    };

    const userRole = currentUser?.user?.role || currentUser?.role;

    // =========================================================================
    // GIAO DIỆN CHÍNH (Đã được bọc bởi SocialQuestProvider)
    // =========================================================================
    return (
        <SocialQuestProvider user={currentUser?.user || currentUser}>
            <div style={{ backgroundColor: '#e4e5e6', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div className="app-container" style={{
                    width: '390px',
                    height: '844px',
                    backgroundColor: '#fff',
                    borderRadius: '40px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                    overflow: 'hidden',
                    position: 'relative',
                    overflowY: 'auto',
                    transform: 'scale(0.8)',
                    transformOrigin: 'center',
                    msOverflowStyle: 'none', scrollbarWidth: 'none'
                }}>
                    
                    {/* Overlay sẽ luôn chạy ngầm và hiển thị Popup đè lên trên cùng khi có Quest */}
                    <SocialQuestOverlay />
                    <LocationSimulator />

                    {currentScreen === 'splash' && <SplashScreen onFinish={() => setCurrentScreen('welcome')} />}

                    {currentScreen === 'welcome' && (
                        <WelcomeScreen
                            onSignIn={() => setCurrentScreen('login')}
                            onCreateAccount={() => setCurrentScreen('register')}
                            onSkip={() => {
                                setIsGuest(true);
                                setCurrentScreen('main');
                            }}
                        />
                    )}

                    {currentScreen === 'login' && (
                        <LoginScreen
                            onBack={() => setCurrentScreen('welcome')}
                            onSwitchToRegister={() => setCurrentScreen('register')}
                            onForgotPassword={() => setCurrentScreen('forgot_password')}
                            onLoginSuccess={(userData) => {
                                setIsGuest(false);
                                setCurrentUser(userData);
                                setCurrentScreen('main');
                            }}
                        />
                    )}

                    {currentScreen === 'forgot_password' && (
                        <ForgotPasswordScreen
                            onBack={() => setCurrentScreen('login')}
                            onSwitchToLogin={() => setCurrentScreen('login')}
                        />
                    )}

                    {currentScreen === 'register' && (
                        <RegisterScreen
                            onBack={() => setCurrentScreen('welcome')}
                            onSwitchToLogin={() => setCurrentScreen('login')}
                        />
                    )}

                    {currentScreen === 'main' && (
                        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                            {userRole === 'ENTERPRISE' ? (
                                <EnterpriseTabs
                                    user={currentUser?.user || currentUser}
                                    onLogout={handleLogout}
                                    onOpenLocationRegister={() => setCurrentScreen('register_location')}
                                    onOpenProfileEdit={() => setCurrentScreen('profile_edit')}
                                />
                            ) : (
                                <MainTabs
                                    user={currentUser?.user || currentUser}
                                    isGuest={isGuest}
                                    onRequireLogin={() => setCurrentScreen('login')}
                                    onLogout={handleLogout}
                                    onOpenPlan={() => setCurrentScreen('plan')}
                                    onOpenProfileEdit={() => setCurrentScreen('profile_edit')}
                                    onOpenHistory={() => setCurrentScreen('history')}
                                    onOpenTripDetail={(id) => {
                                        setCurrentItineraryId(id);
                                        setCurrentScreen('trip_detail');
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {currentScreen === 'history' && (
                        <HistoryScreen onBack={() => setCurrentScreen('main')} />
                    )}

                    {currentScreen === 'profile_edit' && (
                        <UserProfile
                            user={currentUser?.user || currentUser}
                            onBack={() => setCurrentScreen('main')}
                            onUpdateSuccess={(updatedData) => {
                                setCurrentUser(prev => {
                                    const oldUserData = prev?.user || prev || {};
                                    return {
                                        ...prev,
                                        user: { ...oldUserData, ...updatedData }
                                    };
                                });
                            }}
                        />
                    )}

                    {currentScreen === 'plan' && (
                        isGuest || !currentUser ? (
                            (() => { setCurrentScreen('login'); return null; })()
                        ) : (
                            <TripInputForm
                                onSubmitPlan={(collectedData) => {
                                    setPlanPayload(collectedData);
                                    setCurrentScreen('plan_recommend');
                                }}
                                onCancel={() => setCurrentScreen('main')}
                            />
                        )
                    )}

                {currentScreen === 'plan_recommend' && (
                    <PlanRecommendScreen
                        planPayload={planPayload}
                        onBack={() => setCurrentScreen('plan')}
                        onTripCreated={(itineraryId) => {
                            setCurrentItineraryId(itineraryId);
                            setCurrentScreen('trip_detail');
                        }}
                        onOpenLocationDetail={(loc) => {
                            setCurrentLocationDetail(loc);
                            setCurrentScreen('location_detail');
                        }}
                        onSessionExpired={() => {
                            localStorage.removeItem('access_token');
                            localStorage.removeItem('refresh_token');
                            setCurrentScreen('login');
                        }}
                        refreshUser={refreshUser}
                    />
                )}

                {currentScreen === 'location_detail' && (
                    <LocationDetailScreen
                        location={currentLocationDetail}
                        onBack={() => setCurrentScreen('plan_recommend')}
                    />
                )}

                {currentScreen === 'trip_detail' && (
                    <TripDetailScreen
                        itineraryId={currentItineraryId}
                        onBack={() => setCurrentScreen('main')}
                        refreshUser={refreshUser}
                        onPointsUpdate={refreshUser}
                        user={currentUser?.user || currentUser}
                    />
                )}

                {currentScreen === 'register_location' && (
                    <LocationRegister onBack={() => setCurrentScreen('main')} />
                )}

                </div>
            </div>
        </SocialQuestProvider>
    );
}

export default App;