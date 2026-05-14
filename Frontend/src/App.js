import React, { useState, useEffect } from 'react'; // NHỚ IMPORT THÊM useEffect
import SplashScreen from './screens/SplashScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import RegisterScreen from './screens/Auth/RegisterScreen';
import LoginScreen from './screens/Auth/LoginScreen';
import ForgotPasswordScreen from './screens/Auth/ForgotPasswordScreen';

import TripInputForm from './components/TripInput/TripInputForm';
import LocationRegister from './components/LocationRegister/LocationRegister';
import MainTabs from './components/MainTabs';
import EnterpriseTabs from './components/EnterpriseTabs'; // Import tab doanh nghiệp

import UserProfile from './screens/UserProfile';
import HistoryScreen from './screens/Trip/HistoryScreen';
import PlanRecommendScreen from './screens/Trip/PlanRecommendScreen';
import TripDetailScreen from './screens/Trip/TripDetailScreen';

function App() {
    const [currentScreen, setCurrentScreen] = useState('splash');
    const [isGuest, setIsGuest] = useState(false);

    const [currentUser, setCurrentUser] = useState(null);
    const [planPayload, setPlanPayload] = useState(null);
    const [currentItineraryId, setCurrentItineraryId] = useState(null);

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
                        setCurrentUser(data); // data này chứa đầy đủ user, bio, location...
                        setCurrentScreen('main'); // Bỏ qua Welcome, vào thẳng App
                    }
                } catch (error) {
                    console.error("Lỗi xác thực:", error);
                }
            }
        };

        // Chỉ chạy sau khi SplashScreen kết thúc
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

    // Xác định Role một cách an toàn
    const userRole = currentUser?.user?.role || currentUser?.role;

    return (
        <div style={{ backgroundColor: '#e4e5e6', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{
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

                {/* =========================================================================
            2. CỔNG CHUYỂN MẠCH: CHIA NHÁNH ENTERPRISE VÀ USER BÌNH THƯỜNG
        ========================================================================= */}
                {currentScreen === 'main' && (
                    userRole === 'ENTERPRISE' ? (
                        <EnterpriseTabs
                            // Truyền thẳng cục user bên trong để EnterpriseTabs dễ đọc dữ liệu
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
                    )
                )}

                {currentScreen === 'history' && (
                    <HistoryScreen onBack={() => setCurrentScreen('main')} />
                )}

                {currentScreen === 'profile_edit' && (
                    <UserProfile
                        user={currentUser?.user || currentUser}
                        onBack={() => setCurrentScreen('main')}
                        onUpdateSuccess={(updatedData) => {
                            // Cập nhật lại toàn bộ state currentUser
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
                    />
                )}

                {currentScreen === 'trip_detail' && (
                    <TripDetailScreen
                        itineraryId={currentItineraryId}
                        onBack={() => setCurrentScreen('main')}
                    />
                )}

                {currentScreen === 'register_location' && (
                    <LocationRegister onBack={() => setCurrentScreen('main')} />
                )}

            </div>
        </div>
    );
}

export default App;