import React from 'react';
import { useSocialQuest } from './SocialQuestProvider';

const SocialQuestOverlay = () => {
    const { 
        questState, currentQuest, questMessage, rendezvous, 
        acceptQuest, rejectQuest, interact, resetQuest 
    } = useSocialQuest();

    if (questState === 'IDLE') return null;

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                
                {/* TRẠNG THÁI 1: CHƯA XÁC NHẬN */}
                {questState === 'MATCHING' && (
                    <>
                        <div style={{fontSize: '45px', marginBottom: '10px'}}>🤝</div>
                        <h2 style={{color: '#f39c12'}}>{currentQuest?.title}</h2>
                        <p>{questMessage}</p>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={rejectQuest} style={btnStyle('#e74c3c')}>Từ chối</button>
                            <button onClick={acceptQuest} style={btnStyle('#2ecc71')}>Tham gia ngay</button>
                        </div>
                    </>
                )}

                {/* TRẠNG THÁI 2: ĐÃ XÁC NHẬN - CHỜ ĐỐI PHƯƠNG */}
                {questState === 'WAITING' && (
                    <>
                        <div style={{fontSize: '45px', marginBottom: '10px'}}>⏳</div>
                        <h2 style={{color: '#f39c12'}}>Đang kết nối...</h2>
                        <p>{questMessage}</p>
                    </>
                )}

                {/* TRẠNG THÁI 3: TRONG NHIỆM VỤ - TÌM NHAU */}
                {questState === 'IN_QUEST' && (
                    <>
                        <div style={{fontSize: '45px', marginBottom: '10px'}}>📍</div>
                        <h2 style={{color: '#3498db'}}>Điểm Hẹn Lữ Khách</h2>
                        
                        {/* Thông báo từ Server (sẽ đổi màu đỏ nếu bị báo đứng xa) */}
                        <p style={{color: questMessage.includes('cách nhau') ? '#ff7675' : '#dfe6e9', fontWeight: 'bold'}}>
                            {questMessage}
                        </p>
                        
                        {rendezvous && (
                            <div style={rendezvousBoxStyle}>
                                <strong>Tọa độ điểm hẹn:</strong><br/>
                                Lat: {rendezvous.lat.toFixed(5)}<br/>
                                Lng: {rendezvous.lng.toFixed(5)}
                            </div>
                        )}
                        
                        <p style={{fontSize: '13px', color: '#b2bec3'}}>
                            Hãy di chuyển đến gần nhau. Khi cả hai đã nhìn thấy nhau, hãy bấm nút dưới đây để hệ thống quét GPS xác thực!
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px', width: '100%' }}>
                            <button onClick={interact} style={btnStyle('#9b59b6', '100%')}>
                                👋 Đã gặp nhau - Quét GPS!
                            </button>
                            
                            <button onClick={rejectQuest} style={{...btnStyle('#636e72', '100%'), padding: '8px'}}>
                                Hủy nhiệm vụ (Bỏ cuộc)
                            </button>
                        </div>
                    </>
                )}

                {/* TRẠNG THÁI 4: THÀNH CÔNG */}
                {questState === 'SUCCESS' && (
                    <>
                        <div style={{fontSize: '45px', marginBottom: '10px'}}>🏆</div>
                        <h2 style={{color: '#f1c40f'}}>Tuyệt Vời!</h2>
                        <p>{questMessage}</p>
                        <div style={{background: 'rgba(46, 204, 113, 0.2)', padding: '10px', borderRadius: '10px', margin: '15px 0', border: '1px solid #2ecc71'}}>
                            <span style={{color: '#2ecc71', fontWeight: 'bold', fontSize: '18px'}}>+50 EXP</span>
                        </div>
                        <button onClick={resetQuest} style={btnStyle('#f39c12', '100%')}>
                            Nhận Thưởng & Đóng
                        </button>
                    </>
                )}
                
            </div>
        </div>
    );
};

// --- CSS Inline ---
const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
    display: 'flex', justifyContent: 'center', alignItems: 'center'
};
const modalStyle = {
    background: '#2d3436', color: 'white', padding: '30px', borderRadius: '20px',
    width: '85%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    border: '1px solid rgba(255,255,255,0.1)'
};
const btnStyle = (bg, width = 'auto') => ({
    padding: '14px', background: bg, color: 'white', border: 'none', 
    borderRadius: '12px', fontWeight: 'bold', fontSize: '15px', 
    flex: 1, width: width, cursor: 'pointer', transition: '0.2s'
});
const rendezvousBoxStyle = {
    background: '#1e272e', padding: '12px', borderRadius: '10px', 
    fontSize: '14px', margin: '15px 0', textAlign: 'left',
    borderLeft: '4px solid #3498db', color: '#81ecec'
};

export default SocialQuestOverlay;