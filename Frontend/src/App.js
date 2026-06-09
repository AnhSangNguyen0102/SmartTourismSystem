import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import './App.css';
import SplashScreen from './screens/SplashScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import RegisterScreen from './screens/Auth/RegisterScreen';
import LoginScreen from './screens/Auth/LoginScreen';
import ForgotPasswordScreen from './screens/Auth/ForgotPasswordScreen';
import TutorialScreen from './screens/TutorialScreen';

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
import { storageGet, storageRemove, storageSet } from './platform/storage';
import { showConfirm } from './platform/dialog';

import { SocialQuestProvider } from './components/SocialQuest/SocialQuestProvider';
import SocialQuestOverlay from './components/SocialQuest/SocialQuestOverlay';
import AudioControl from './components/AudioControl/AudioControl';
import { playBGM, pauseBGM, playSound } from './utils/soundUtils';
// Bỏ comment nếu muốn test giả lập tương tác
import LocationSimulator from './components/SocialQuest/LocationSimulator';

const NativeApp = registerPlugin('App');
const EXIT_GUARD_SCREENS = new Set([
    'trip_detail',
    'plan_recommend',
    'location_detail',
    'profile_edit',
    'register_location',
]);

const parseHashParams = (hash) => {
    if (!hash) return {};
    const params = {};
    const hashString = hash.startsWith('#') ? hash.substring(1) : hash;
    const pairs = hashString.split('&');
    for (let pair of pairs) {
        const [key, value] = pair.split('=');
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
    return params;
};

function App() {
    const [currentScreen, setCurrentScreen] = useState('splash');
    const [isGuest, setIsGuest] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [planPayload, setPlanPayload] = useState(null);
    const [currentItineraryId, setCurrentItineraryId] = useState(null);
    const [currentLocationDetail, setCurrentLocationDetail] = useState(null);
    const [planCache, setPlanCache] = useState(null);
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
        const initTheme = async () => {
            const isDark = await storageGet('dark_mode');
            if (isDark === 'true') {
                document.body.classList.add('dark-theme');
            } else {
                document.body.classList.remove('dark-theme');
            }
        };
        initTheme();
    }, []);

    // Thiết lập thông báo hằng ngày lúc 0h
    useEffect(() => {
        const setupDailyNotifications = async () => {
            if (!Capacitor.isNativePlatform()) return;
            try {
                let permStatus = await LocalNotifications.checkPermissions();
                if (permStatus.display !== 'granted') {
                    permStatus = await LocalNotifications.requestPermissions();
                }
                
                if (permStatus.display === 'granted') {
                    // Huỷ bỏ lịch cũ để tránh trùng lặp
                    const pending = await LocalNotifications.getPending();
                    if (pending.notifications.find(n => n.id === 1)) {
                        await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
                    }
                    
                    // Lên lịch mới lúc 0h00
                    await LocalNotifications.schedule({
                        notifications: [
                            {
                                id: 1,
                                title: "Nhiệm vụ hằng ngày đã được làm mới!",
                                body: "Vào ứng dụng ngay để hoàn thành nhiệm vụ và nhận điểm thưởng nhé.",
                                schedule: { 
                                    on: { hour: 0, minute: 0 },
                                    allowWhileIdle: true
                                },
                            }
                        ]
                    });
                }
            } catch (error) {
                console.warn('Lỗi khi thiết lập thông báo:', error);
            }
        };
        setupDailyNotifications();
    }, []);

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
        const previousScreen = currentScreenRef.current;

        if (resetHistory) {
            screenHistoryRef.current = [];
        } else if (previousScreen !== nextScreen) {
            const history = screenHistoryRef.current;
            if (history[history.length - 1] !== previousScreen) {
                history.push(previousScreen);
            }
        }

        currentScreenRef.current = nextScreen;
        setCurrentScreen(nextScreen);
    }, []);

    const goBackFromHistory = useCallback((fallbackScreen = 'main') => {
        const activeScreen = currentScreenRef.current;
        let previousScreen = screenHistoryRef.current.pop();

        // Skip duplicate entries left by older navigation updates.
        while (previousScreen === activeScreen) {
            previousScreen = screenHistoryRef.current.pop();
        }

        if (previousScreen) {
            currentScreenRef.current = previousScreen;
            setCurrentScreen(previousScreen);
            return true;
        }

        if (activeScreen !== fallbackScreen) {
            currentScreenRef.current = fallbackScreen;
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
        const handleHashChange = async () => {
            const hash = window.location.hash;
            if (!hash) return;

            const params = parseHashParams(hash);

            // 1. Nếu là link khôi phục mật khẩu (chứa type=recovery)
            if (params.type === 'recovery' || hash.includes('type=recovery')) {
                navigateTo('forgot_password', { resetHistory: true });
                return;
            }

            // 2. Nếu là Google/OAuth redirect (chứa access_token và không có type=recovery)
            if (params.access_token) {
                const accessToken = params.access_token;
                const refreshToken = params.refresh_token;

                // Lưu token vào storage
                await Promise.all([
                    storageSet('access_token', accessToken),
                    storageSet('refresh_token', refreshToken),
                ]);

                // Xóa hash trên URL
                window.location.hash = '';

                // Gọi API /me để lấy thông tin chi tiết user
                try {
                    const res = await fetch(`${API_BASE}/api/auth/me`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (res.ok) {
                        const userData = await res.json();
                        setIsGuest(false);
                        setCurrentUser(userData);
                        // Nếu đăng ký/đăng nhập bằng Google mà chưa có mật khẩu,
                        // chuyển thẳng vào trang cá nhân để hiển thị tạo mật khẩu dễ dàng.
                        const hasPassword = userData?.user?.has_password;
                        if (hasPassword === false) {
                            navigateTo('profile_edit', { resetHistory: true });
                        } else {
                            navigateTo('main', { resetHistory: true });
                        }
                    } else {
                        console.error('Lỗi khi lấy thông tin user sau Google OAuth:', res.status);
                    }
                } catch (error) {
                    console.error('Lỗi kết nối khi lấy thông tin user:', error);
                }
            }
        };

        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [navigateTo, setIsGuest, setCurrentUser]);

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
                    <LocationSimulator />

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
                            onRegisterSuccess={() => navigateTo('tutorial')}
                        />
                    )}

                    {currentScreen === 'tutorial' && (
                        <TutorialScreen
                            onFinish={() => navigateTo('main', { resetHistory: true })}
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
                                    onOpenLocationDetail={(loc) => {
                                        setCurrentLocationDetail(loc);
                                        navigateTo('location_detail');
                                    }}
                                    refreshUser={refreshUser}
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

                    {/* Giữ plan_recommend + location_detail luôn mounted khi cần, dùng display:none để tránh reload */}
                    {(currentScreen === 'plan_recommend' || currentScreen === 'location_detail') && (
                        <>
                            <div style={{ display: currentScreen === 'plan_recommend' ? 'contents' : 'none' }}>
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
                                    planCache={planCache}
                                    onCacheUpdate={setPlanCache}
                                    refreshUser={refreshUser}
                                />
                            </div>
                            <div style={{ display: currentScreen === 'location_detail' ? 'contents' : 'none' }}>
                                <LocationDetailScreen
                                    location={currentLocationDetail}
                                    onBack={() => goBackFromHistory('main')}
                                />
                            </div>
                        </>
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
