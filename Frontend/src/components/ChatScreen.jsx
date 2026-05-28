import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, ArrowLeft, Trash2, ShieldAlert, Image as ImageIcon, Smile, Clock } from 'lucide-react';
import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';
import { showConfirm } from '../platform/dialog';
import './ChatScreen.css';

const formatLastMessageTime = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const now = new Date();
        
        // Hôm nay: hiển thị giờ
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        
        // Hôm qua
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Hôm qua';
        }
        
        // Cũ hơn
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch (e) {
        return '';
    }
};

export default function ChatScreen({ user, onRequireLogin }) {
    const [friends, setFriends] = useState([]);
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageText, setMessageText] = useState('');
    const [loadingFriends, setLoadingFriends] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sending, setSending] = useState(false);
    const chatEndRef = useRef(null);
    const pollIntervalRef = useRef(null);
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (!user) {
            onRequireLogin();
            return;
        }
        fetchFriends();
        return () => {
            stopPolling();
        };
    }, [user]);

    useEffect(() => {
        if (selectedFriend) {
            fetchMessages(selectedFriend.id);
            startPolling(selectedFriend.id);
        } else {
            stopPolling();
            if (!isFirstRender.current) {
                fetchFriends();
            } else {
                isFirstRender.current = false;
            }
        }
    }, [selectedFriend]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const fetchFriends = async () => {
        setLoadingFriends(true);
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/friends`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFriends(data);
            }
        } catch (error) {
            console.error('Error fetching friends:', error);
        } finally {
            setLoadingFriends(false);
        }
    };

    const fetchMessages = async (friendId) => {
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/messages/${friendId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    };

    const startPolling = (friendId) => {
        stopPolling();
        pollIntervalRef.current = setInterval(() => {
            fetchMessages(friendId);
        }, 3000); // Poll every 3 seconds
    };

    const stopPolling = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!messageText.trim() || !selectedFriend) return;

        setSending(true);
        const text = messageText;
        setMessageText('');

        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    receiver_id: selectedFriend.id,
                    content: text,
                    type: 'TEXT'
                })
            });

            if (res.ok) {
                const newMsg = await res.json();
                setMessages(prev => [...prev, {
                    id: newMsg.message_id,
                    sender_id: user.user_id || user.id,
                    receiver_id: selectedFriend.id,
                    content: text,
                    type: 'TEXT',
                    created_at: new Date().toISOString()
                }]);
            }
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setSending(false);
        }
    };

    const handleClearChat = async () => {
        const confirmed = await showConfirm(`Bạn có muốn xóa cuộc trò chuyện với ${selectedFriend.name}?`);
        if (!confirmed) return;
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/messages/${selectedFriend.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setMessages([]);
            }
        } catch (error) {
            console.error('Error clearing chat:', error);
        }
    };

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="chat-container">
            {!selectedFriend ? (
                // Friends List View
                <div className="chat-friends-view">
                    <div className="chat-header">
                        <h1 className="chat-title">Hộp Thư Chat</h1>
                        <p className="chat-subtitle">Kết nối trực tiếp với bạn đồng hành của bạn</p>
                    </div>

                    {loadingFriends ? (
                        <div className="chat-loading">
                            <div className="loader-hud"></div>
                            <p>Đang tìm danh sách đồng hành...</p>
                        </div>
                    ) : friends.length === 0 ? (
                        <div className="empty-friends cartoon-card text-center">
                            <MessageSquare size={48} className="empty-icon" />
                            <h2>Chưa có bạn bè!</h2>
                            <p>Hãy sang mục "Ghép Đôi" để kết nối với những người bạn mới nhé.</p>
                        </div>
                    ) : (
                        <div className="friends-list">
                            {friends.map(friend => (
                                <div 
                                    key={friend.id} 
                                    className="friend-item-card cartoon-card"
                                    onClick={() => setSelectedFriend(friend)}
                                >
                                    <img src={friend.avatar} alt={friend.name} className="friend-avatar" />
                                    <div className="friend-info">
                                        <div className="friend-info-header">
                                            <h4 className="friend-name">{friend.name}</h4>
                                            <span className="friend-rank-badge">{friend.rank}</span>
                                        </div>
                                        {friend.last_message ? (
                                            <p className={`friend-last-message truncate ${(!friend.last_message.is_read && friend.last_message.sender_id === friend.id) ? 'unread-bold' : ''}`}>
                                                {friend.last_message.sender_id === (user.user_id || user.id) ? 'Bạn: ' : ''}
                                                {friend.last_message.content}
                                            </p>
                                        ) : (
                                            <p className="friend-bio truncate">{friend.bio}</p>
                                        )}
                                    </div>
                                    <div className="friend-time-col">
                                        {friend.last_message && (
                                            <span className="friend-time">
                                                {formatLastMessageTime(friend.last_message.created_at)}
                                            </span>
                                        )}
                                        {friend.last_message && !friend.last_message.is_read && friend.last_message.sender_id === friend.id && (
                                            <span className="unread-badge"></span>
                                        )}
                                    </div>
                                    <span className="chat-arrow">›</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                // Active Chat Screen
                <div className="active-chat-view">
                    {/* Chat Header */}
                    <div className="active-chat-header cartoon-card">
                        <button className="chat-back-btn" onClick={() => setSelectedFriend(null)}>
                            <ArrowLeft size={18} />
                        </button>
                        <div className="active-friend-info">
                            <img src={selectedFriend.avatar} alt={selectedFriend.name} className="active-friend-avatar" />
                            <div>
                                <h4 className="active-friend-name">{selectedFriend.name}</h4>
                                <span className="active-friend-status">Đang hoạt động</span>
                            </div>
                        </div>
                        <button className="chat-clear-btn" onClick={handleClearChat} title="Xóa lịch sử">
                            <Trash2 size={18} />
                        </button>
                    </div>

                    {/* Chat Messages */}
                    <div className="chat-messages-area">
                        {messages.length === 0 ? (
                            <div className="chat-empty-history text-center">
                                <Smile size={32} style={{ color: '#a4b0be', marginBottom: '8px' }} />
                                <p>Hãy bắt đầu câu chuyện thú vị với {selectedFriend.name} ngay!</p>
                            </div>
                        ) : (
                            <div className="messages-list">
                                {messages.map((msg, i) => {
                                    const isMe = msg.sender_id === (user.user_id || user.id);
                                    return (
                                        <div key={msg.id || i} className={`message-bubble-row ${isMe ? 'me' : 'them'}`}>
                                            {!isMe && (
                                                <img src={selectedFriend.avatar} alt="avatar" className="bubble-avatar" />
                                            )}
                                            <div className={`message-bubble cartoon-card ${isMe ? 'blue' : ''}`}>
                                                <p className="message-content-text">{msg.content}</p>
                                                <span className="message-time">
                                                    <Clock size={8} style={{ marginRight: '2px' }} />
                                                    {new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={chatEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSendMessage} className="chat-input-row cartoon-card">
                        <input 
                            type="text" 
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder="Nhập tin nhắn thám hiểm..."
                            className="chat-input-box"
                            required
                        />
                        <button type="submit" className="squishy-btn blue send-msg-btn" disabled={sending}>
                            <Send size={16} />
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
