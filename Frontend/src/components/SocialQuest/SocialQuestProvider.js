import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const SocialQuestContext = createContext();

export const useSocialQuest = () => useContext(SocialQuestContext);

export const SocialQuestProvider = ({ children, user }) => {
    // Các trạng thái: IDLE, MATCHING, WAITING, IN_QUEST, SUCCESS
    const [questState, setQuestState] = useState('IDLE'); 
    const [currentQuest, setCurrentQuest] = useState(null);
    const [questMessage, setQuestMessage] = useState('');
    const [rendezvous, setRendezvous] = useState(null); // Lưu tọa độ điểm hẹn chung
    
    const wsRef = useRef(null);
    const userId = user?.user_id || user?.id;

    useEffect(() => {
        if (!userId) return;

        const ws = new WebSocket(`ws://127.0.0.1:8000/ws/social_quest/${userId}`);
        wsRef.current = ws;

        ws.onopen = () => console.log('🟢 Social Quest Radar: ONLINE');

        ws.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            const { event: eventName, data, message, reason } = payload;
            
            // 1. Nhận lời mời ghép cặp
            if (eventName === 'quest_spawn_request') {
                setCurrentQuest(data);
                setQuestState('MATCHING');
                setQuestMessage(data.message || 'Có người chơi đang ở gần!');
            } 
            // 2. Chờ đối phương xác nhận
            else if (eventName === 'waiting_for_partner') {
                setQuestState('WAITING');
                setQuestMessage('Đang chờ đối phương xác nhận...');
            } 
            // 3. Cả 2 đã đồng ý -> Bắt đầu di chuyển đến điểm hẹn
            else if (eventName === 'quest_start') {
                setQuestState('IN_QUEST');
                setRendezvous({ lat: data.rendezvous_lat, lng: data.rendezvous_lng });
                setQuestMessage(data.message || 'Hãy di chuyển đến điểm hẹn!');
            } 
            // 4. Tương tác thành công (đứng đủ gần)
            else if (eventName === 'quest_success') {
                setQuestState('SUCCESS');
                setQuestMessage(message || 'Hoàn thành xuất sắc!');
            } 
            // 5. Nhiệm vụ bị hủy (đối phương từ chối hoặc mất kết nối)
            else if (eventName === 'quest_cancelled') {
                alert(`Nhiệm vụ bị hủy: ${reason}`);
                resetQuest();
            } 
            // 6. Lỗi khi tương tác (đứng quá xa)
            else if (eventName === 'error') {
                setQuestMessage(message); // Hiển thị lỗi "Các bạn đang cách nhau X mét..."
            }
        };

        ws.onclose = () => console.log('🔴 Social Quest Radar: OFFLINE');

        return () => ws.close();
    }, [userId]);

    const resetQuest = () => {
        setQuestState('IDLE');
        setCurrentQuest(null);
        setRendezvous(null);
        setQuestMessage('');
    };

    const sendLocation = (lat, lng) => {
        if (wsRef.current) {
            wsRef.current.send(JSON.stringify({ action: 'update_location', payload: { lat, lng } }));
        }
    };

    const acceptQuest = () => {
        if (wsRef.current) wsRef.current.send(JSON.stringify({ action: 'accept_quest' }));
    };

    const rejectQuest = () => {
        if (wsRef.current) wsRef.current.send(JSON.stringify({ action: 'reject_quest' }));
        resetQuest();
    };

    const interact = () => {
        // Gửi lệnh tương tác để Server đo khoảng cách
        if (wsRef.current) wsRef.current.send(JSON.stringify({ action: 'social_interact' }));
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