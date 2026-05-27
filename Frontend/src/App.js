import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import './App.css';
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
import AdminModerationScreen from './screens/AdminModerationScreen';
import { API_BASE } from './config/api';
import { storageGet, storageRemove } from './platform/storage';
import { showConfirm } from './platform/dialog';

import { SocialQuestProvider } from './components/SocialQuest/SocialQuestProvider';
import SocialQuestOverlay from './components/SocialQuest/SocialQuestOverlay';
import AudioControl from './components/AudioControl/AudioControl';
import { playBGM, pauseBGM, playSound } from './utils/soundUtils';
// Bỏ comment nếu muốn test giả lập tương tác
//import LocationSimulator from './components/SocialQuest/LocationSimulator';

const NativeApp = registerPlugin('App');
const EXIT_GUARD_SCREENS = new Set([
    'trip_detail',
    'plan_recommend',
    'location_detail',
    'profile_edit',
    'register_location',
]);

function App() {
    const [currentScreen, setCurrentScreen] = useState('splash');
    const [isGuest, setIsGuest] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [planPayload, setPlanPayload] = useState(null);
    const [currentItineraryId, setCurrentItineraryId] = useState(null);
    const [currentLocationDetail, setCurrentLocationDetail] = useState(null);
    const userRole = currentUser?.user?.role || currentUser?.role;
    const isAdminMode = currentScreen === 'admin_moderation';
    const isWorkMode = isAdminMode || (currentScreen === 'main' && userRole === 'ENTERPRISE');

    const screenHistoryRef = useRef([]);
    const currentScreenRef = useRef(currentScreen);
    const workModeRef = useRef(isWorkMode);

    useEffect(() => {
        currentScreenRef.current = currentScreen;
        workModeRef.current = isWorkMode;
    }, [currentScreen, isWorkMode]);

    useEffect(() => {
        if (isWorkMode) {
            pauseBGM();
        } else {
            if (window._bgmStarted) {
                playBGM();
            }
        }
    }, [isWorkMode]);

    useEffect(() => {
        const handleGlobalClick = (e) => {
            if (workModeRef.current) return;

            // Kích hoạt BGM ở lần tương tác đầu tiên
            if (!window._bgmStarted) {
                window._bgmStarted = true;
                playBGM();
            }

            // Phát âm thanh click nếu nhấn vào button hoặc phần tử có thể click (ngoại trừ nút tắt/mở loa tổng)
            const isClickableTag = e.target.closest('button, a, [role="button"], input[type="button"], input[type="submit"]');
            const style = window.getComputedStyle(e.target);
            const isPointer = style.cursor === 'pointer';

            if ((isClickableTag || isPointer) && !e.target.closest('.audio-control-btn')) {
                playSound('click.mp3');
            }
        };
        
        document.addEventListener('click', handleGlobalClick);
        return () => document.removeEventListener('click', handleGlobalClick);
    }, []);

    const navigateTo = useCallback((nextScreen, options = {}) => {
        const { resetHistory = false } = options;
        setCurrentScreen((prevScreen) => {
            if (resetHistory) {
                screenHistoryRef.current = [];
                return nextScreen;
            }

            if (prevScreen !== nextScreen) {
                screenHistoryRef.current.push(prevScreen);
            }

            return nextScreen;
        });
    }, []);

    const goBackFromHistory = useCallback((fallbackScreen = 'main') => {
        const previousScreen = screenHistoryRef.current.pop();

        if (previousScreen) {
            setCurrentScreen(previousScreen);
            return true;
        }

        if (currentScreenRef.current !== fallbackScreen) {
            setCurrentScreen(fallbackScreen);
            return true;
        }

        return false;
    }, []);

    const clearAuthSession = useCallback(async () => {
        await Promise.all([
            storageRemove('access_token'),
            storageRemove('refresh_token'),
        ]);
    }, []);

    const refreshUser = useCallback(async () => {
        const token = await storageGet('access_token');
        if (!token) return;

        try {
            const res = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentUser(data);
            }
        } catch (error) {
            console.error('Lỗi cập nhật user:', error);
        }
    }, []);

    useEffect(() => {
        const fetchUserData = async () => {
            const token = await storageGet('access_token');
            if (!token) return;

            try {
                const res = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setCurrentUser(data);
                    navigateTo('main', { resetHistory: true });
                }
            } catch (error) {
                console.error('Lỗi xác thực:', error);
            }
        };

        if (currentScreen === 'welcome') {
            fetchUserData();
        }
    }, [currentScreen, navigateTo]);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return undefined;

        let backListener = null;

        const attachBackHandler = async () => {
            try {
                backListener = await NativeApp.addListener('backButton', async () => {
                    const activeScreen = currentScreenRef.current;

                    if (activeScreen === 'main') {
                        const shouldExit = await showConfirm('Bạn có muốn thoát ứng dụng?', {
                            title: 'Thoát ứng dụng',
                            okButtonTitle: 'Thoát',
                            cancelButtonTitle: 'Ở lại',
                        });
                        if (shouldExit) {
                            await NativeApp.exitApp();
                        }
                        return;
                    }

                    const movedBack = goBackFromHistory();
                    if (movedBack) return;

                    if (EXIT_GUARD_SCREENS.has(activeScreen)) {
                        navigateTo('main', { resetHistory: true });
                        return;
                    }

                    const shouldExit = await showConfirm('Bạn có muốn thoát ứng dụng?', {
                        title: 'Thoát ứng dụng',
                        okButtonTitle: 'Thoát',
                        cancelButtonTitle: 'Ở lại',
                    });
                    if (shouldExit) {
                        await NativeApp.exitApp();
                    }
                });
            } catch (error) {
                console.warn('Không thể đăng ký Android back button listener:', error);
            }
        };

        attachBackHandler();

        return () => {
            if (backListener) {
                backListener.remove();
            }
        };
    }, [goBackFromHistory, navigateTo]);

    const handleLogout = async () => {
        await clearAuthSession();
        setCurrentUser(null);
        setIsGuest(false);
        navigateTo('welcome', { resetHistory: true });
    };

    return (
        <SocialQuestProvider user={currentUser?.user || currentUser}>
            <div className="app-outer">
                <div className={`app-container ${isWorkMode ? 'app-container-workmode' : ''} ${isAdminMode ? 'app-container-adminmode' : ''}`}>
                    {['splash', 'welcome'].includes(currentScreen) && (
                        <AudioControl />
                    )}
                    {!isWorkMode && <SocialQuestOverlay />}
                    {/* ❌ XÓA HOẶC COMMENT DÒNG NÀY ĐỂ ẨN BẢNG GIẢ LẬP: */}
                    {/* <LocationSimulator /> */}

                    {currentScreen === 'splash' && (
                        <SplashScreen onFinish={() => navigateTo('welcome', { resetHistory: true })} />
                    )}

                    {currentScreen === 'welcome' && (
                        <WelcomeScreen
                            onSignIn={() => navigateTo('login')}
                            onCreateAccount={() => navigateTo('register')}
                            onSkip={() => {
                                setIsGuest(true);
                                navigateTo('main', { resetHistory: true });
                            }}
                        />
                    )}

                    {currentScreen === 'login' && (
                        <LoginScreen
                            onBack={() => goBackFromHistory('welcome')}
                            onSwitchToRegister={() => navigateTo('register')}
                            onForgotPassword={() => navigateTo('forgot_password')}
                            onLoginSuccess={(userData) => {
                                setIsGuest(false);
                                setCurrentUser(userData);
                                navigateTo('main', { resetHistory: true });
                            }}
                        />
                    )}

                    {currentScreen === 'forgot_password' && (
                        <ForgotPasswordScreen
                            onBack={() => goBackFromHistory('login')}
                            onSwitchToLogin={() => navigateTo('login')}
                        />
                    )}

                    {currentScreen === 'register' && (
                        <RegisterScreen
                            onBack={() => goBackFromHistory('welcome')}
                            onSwitchToLogin={() => navigateTo('login')}
                        />
                    )}

                    {currentScreen === 'main' && (
                        <div className="app-main-screen">
                            {userRole === 'ENTERPRISE' ? (
                                <EnterpriseTabs
                                    user={currentUser?.user || currentUser}
                                    onLogout={handleLogout}
                                    onOpenLocationRegister={() => navigateTo('register_location')}
                                    onOpenProfileEdit={() => navigateTo('profile_edit')}
                                />
                            ) : (
                                <MainTabs
                                    user={currentUser?.user || currentUser}
                                    isGuest={isGuest}
                                    onRequireLogin={() => navigateTo('login')}
                                    onLogout={handleLogout}
                                    onOpenPlan={() => navigateTo('plan')}
                                    onOpenProfileEdit={() => navigateTo('profile_edit')}
                                    onOpenHistory={() => navigateTo('history')}
                                    onOpenAdminModeration={() => navigateTo('admin_moderation')}
                                    onOpenTripDetail={(id) => {
                                        setCurrentItineraryId(id);
                                        navigateTo('trip_detail');
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {currentScreen === 'history' && (
                        <HistoryScreen onBack={() => goBackFromHistory('main')} />
                    )}

                    {currentScreen === 'admin_moderation' && (
                        userRole === 'ADMIN' ? (
                            <AdminModerationScreen
                                user={currentUser?.user || currentUser}
                                onBack={() => navigateTo('main')}
                            />
                        ) : (
                            <div className="app-forbidden-screen">
                                <h2>Không có quyền truy cập</h2>
                                <p>Khu vực quản trị chỉ dành cho tài khoản ADMIN.</p>
                                <button type="button" onClick={() => navigateTo('main', { resetHistory: true })}>
                                    Quay lại
                                </button>
                            </div>
                        )
                    )}

                    {currentScreen === 'profile_edit' && (
                        <UserProfile
                            user={currentUser?.user || currentUser}
                            onBack={() => goBackFromHistory('main')}
                            onUpdateSuccess={(updatedData) => {
                                setCurrentUser((prev) => {
                                    const oldUserData = prev?.user || prev || {};
                                    return {
                                        ...prev,
                                        user: { ...oldUserData, ...updatedData },
                                    };
                                });
                            }}
                        />
                    )}

                    {currentScreen === 'plan' && (
                        isGuest || !currentUser ? (
                            (() => {
                                navigateTo('login');
                                return null;
                            })()
                        ) : (
                            <TripInputForm
                                onSubmitPlan={(collectedData) => {
                                    setPlanPayload(collectedData);
                                    navigateTo('plan_recommend');
                                }}
                                onCancel={() => goBackFromHistory('main')}
                            />
                        )
                    )}

                    {currentScreen === 'plan_recommend' && (
                        <PlanRecommendScreen
                            planPayload={planPayload}
                            onBack={() => goBackFromHistory('plan')}
                            onTripCreated={(itineraryId) => {
                                setCurrentItineraryId(itineraryId);
                                navigateTo('trip_detail');
                            }}
                            onOpenLocationDetail={(loc) => {
                                setCurrentLocationDetail(loc);
                                navigateTo('location_detail');
                            }}
                            onSessionExpired={async () => {
                                await clearAuthSession();
                                navigateTo('login', { resetHistory: true });
                            }}
                            refreshUser={refreshUser}
                        />
                    )}

                    {currentScreen === 'location_detail' && (
                        <LocationDetailScreen
                            location={currentLocationDetail}
                            onBack={() => goBackFromHistory('plan_recommend')}
                        />
                    )}

                    {currentScreen === 'trip_detail' && (
                        <TripDetailScreen
                            itineraryId={currentItineraryId}
                            onBack={() => navigateTo('main', { resetHistory: true })}
                            refreshUser={refreshUser}
                            onPointsUpdate={refreshUser}
                            user={currentUser?.user || currentUser}
                        />
                    )}

                    {currentScreen === 'register_location' && (
                        <LocationRegister onBack={() => goBackFromHistory('main')} />
                    )}
                </div>
            </div>
        </SocialQuestProvider>
    );
}

export default App;
