import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { WS_BASE } from '../../config/api';
import { startWatchingPosition } from '../../platform/location';
import { showAlert } from '../../platform/dialog';

const SocialQuestContext = createContext();

export const useSocialQuest = () => useContext(SocialQuestContext);

export const SocialQuestProvider = ({ children, user }) => {
    const [questState, setQuestState] = useState('IDLE'); 
    const [currentQuest, setCurrentQuest] = useState(null);
    const [questMessage, setQuestMessage] = useState('');
    const [rendezvous, setRendezvous] = useState(null); 
    
    const wsRef = useRef(null);
    const userId = user?.user_id || user?.id;
    const userRole = user?.role?.value || user?.role;
    const isEnterprise = userRole === 'ENTERPRISE';

    useEffect(() => {
        if (!userId || isEnterprise) return;

        let ws;
        let stopWatchingFn; // Lưu hàm dừng theo dõi GPS

        try {
            ws = new WebSocket(`${WS_BASE}/ws/social_quest/${userId}`);
            wsRef.current = ws;
        } catch (e) {
            console.error('❌ Failed to construct WebSocket:', e);
            setQuestMessage('Không thể kết nối đến máy chủ Social Quest.');
            return;
        }

        ws.onopen = () => {
            console.log('🟢 Social Quest Radar: ONLINE');
            
            // Gửi tọa độ mặc định ban đầu ngay khi connect thành công
            const defaultLat = 10.762622;
            const defaultLng = 106.660172;
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ 
                    action: 'update_location', 
                    payload: { lat: defaultLat, lng: defaultLng } 
                }));
                console.log(`📍 Đang đăng ký GPS mặc định ban đầu: ${defaultLat}, ${defaultLng}`);
            }
            
            // 🚀 BẮT ĐẦU THEO DÕI GPS THẬT KHI WEBSOCKET ĐÃ MỞ
            stopWatchingFn = startWatchingPosition({
                onSuccess: (position) => {
                    const { latitude, longitude } = position;
                    // Tự động bắn tọa độ lên Server mỗi khi người dùng di chuyển
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ 
                            action: 'update_location', 
                            payload: { lat: latitude, lng: longitude } 
                        }));
                        console.log(`📍 Đang cập nhật GPS lên radar: ${latitude}, ${longitude}`);
                    }
                },
                onError: (error) => {
                    console.warn("⚠️ Không thể lấy GPS thật, sử dụng mặc định:", error.message);
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(JSON.stringify({ 
                            action: 'update_location', 
                            payload: { lat: defaultLat, lng: defaultLng } 
                        }));
                    }
                },
                options: {
                    enableHighAccuracy: true, // BẮT BUỘC TRUE để lấy sai số thấp (<15m)
                    timeout: 10000,
                    maximumAge: 5000 // Cập nhật tối đa mỗi 5 giây
                }
            });
        };

        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                const { event: eventName, data, message, reason } = payload;
                
                if (eventName === 'quest_spawn_request') {
                    setCurrentQuest(data);
                    setQuestState('MATCHING');
                    setQuestMessage(data.message || 'Có người chơi đang ở gần!');
                } 
                else if (eventName === 'waiting_for_partner') {
                    setQuestState('WAITING');
                    setQuestMessage('Đang chờ đối phương xác nhận...');
                } 
                else if (eventName === 'quest_start') {
                    setQuestState('IN_QUEST');
                    setRendezvous({ lat: data.rendezvous_lat, lng: data.rendezvous_lng });
                    setQuestMessage(data.message || 'Hãy di chuyển đến điểm hẹn!');
                } 
                else if (eventName === 'quest_success') {
                    setQuestState('SUCCESS');
                    setQuestMessage(message || 'Hoàn thành xuất sắc!');
                } 
                else if (eventName === 'quest_cancelled') {
                    void showAlert(`Nhiệm vụ bị hủy: ${reason}`);
                    resetQuest();
                } 
                else if (eventName === 'new_campaign') {

                    window.dispatchEvent(new CustomEvent('new_campaign', { detail: data }));

                }

                else if (eventName === 'error') {
                    setQuestMessage(message);
                }
            } catch (err) {
                console.error("Lỗi parse dữ liệu WebSocket:", err);
            }
        };

        ws.onclose = () => console.log('🔴 Social Quest Radar: OFFLINE');

        // Dọn dẹp cả WebSocket lẫn GPS Watcher khi Component Unmount
        return () => {
            if (stopWatchingFn) stopWatchingFn();
            if (ws) ws.close();
        };
    }, [userId]);

    const resetQuest = () => {
        setQuestState('IDLE');
        setCurrentQuest(null);
        setRendezvous(null);
        setQuestMessage('');
    };

    // Hàm sendLocation thủ công vẫn giữ lại phòng trường hợp bạn muốn test
    const sendLocation = (lat, lng) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'update_location', payload: { lat, lng } }));
        }
    };

    const acceptQuest = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'accept_quest' }));
        }
    };

    const rejectQuest = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'reject_quest' }));
        }
        resetQuest();
    };

    const interact = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'social_interact' }));
        }
    };

    return (
        <SocialQuestContext.Provider value={{
            questState, currentQuest, questMessage, rendezvous,
            sendLocation, acceptQuest, rejectQuest, interact, resetQuest
        }}>
            {children}
        </SocialQuestContext.Provider>
    );
};
