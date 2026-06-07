// src/components/MainTabs/CampaignModal.jsx
import React, { useState } from 'react';
import { Sparkles, MapPin, Award, Coins, Camera, HelpCircle, QrCode, AlertTriangle, CheckCircle2 } from 'lucide-react';
import QuestQrScanner from '../QuestQrScanner';
import { verifyCampaign } from '../../services/hiddenQuestService';

const CampaignModal = ({ campaign, userLocation, onClose, onSuccess }) => {
    const [, setQrTokenInput] = useState('');
    const [quizAnswer, setQuizAnswer] = useState('');
    const [photoUploaded, setPhotoUploaded] = useState(false);
    const [photoUrl, setPhotoUrl] = useState('');
    const [questLoading, setQuestLoading] = useState(false);
    const [questError, setQuestError] = useState('');
    const [questSuccess, setQuestSuccess] = useState(null);

    const isMultiStepEvent = (item) => item?.event_mode === 'HIDDEN_MULTI_STEP' || item?.quest_type === 'MULTI_STEP';
    const getEventStep = (item, stepType) => item?.steps?.find((step) => step.step_type === stepType) || {};

    const handleVerifyCampaign = async (extraData = {}) => {
        if (!campaign || !userLocation) {
            setQuestError("Không xác định được vị trí GPS hiện tại!");
            return;
        }
        setQuestLoading(true);
        setQuestError('');
        try {
            const res = await verifyCampaign(
                campaign.event_id,
                userLocation.lat,
                userLocation.lng,
                campaign.quest_type,
                extraData
            );
            setQuestSuccess(res);
            if (typeof onSuccess === 'function') {
                onSuccess(res);
            }
        } catch (err) {
            setQuestError(err.message || "Xác thực thất bại");
        } finally {
            setQuestLoading(false);
        }
    };

    return (
        <div className="quest-modal-overlay">
            <div className="quest-modal-content">
                <div className="quest-modal-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={20} style={{ color: '#e67e22' }} /> {campaign.title || 'Chiến dịch Doanh nghiệp'}
                    </h3>
                    <button className="quest-close-btn" onClick={onClose}>✕</button>
                </div>
                
                <div className="quest-modal-body">
                    {!questSuccess ? (
                        <>
                            <p className="quest-desc">{campaign.description || 'Hoàn thành thử thách để nhận quà từ doanh nghiệp.'}</p>
                            
                            <div className="quest-meta-info" style={{ display: 'flex', gap: '15px' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Bán kính: {campaign.radius_meters}m</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Award size={14} style={{ color: '#f1c40f' }} /> Thưởng: {campaign.reward_exp} EXP | <Coins size={14} style={{ color: '#f1c40f', marginLeft: '4px' }} /> {campaign.reward_coin} Coin</span>
                            </div>

                            {isMultiStepEvent(campaign) && (
                                <div className="quest-action-area">
                                    <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Camera size={16} /> {getEventStep(campaign, 'PHOTO').prompt || 'Chụp ảnh check-in tại điểm sự kiện.'}
                                    </p>
                                    {photoUploaded ? (
                                        <div className="photo-preview-box">
                                            <img src={photoUrl} alt="Preview checkin" />
                                            <button className="photo-reset" onClick={() => { setPhotoUploaded(false); setPhotoUrl(''); }} type="button">✕ Xóa ảnh</button>
                                        </div>
                                    ) : (
                                        <div className="photo-upload-placeholder" onClick={() => {
                                            setPhotoUrl("/assets/island/map-dao.png");
                                            setPhotoUploaded(true);
                                        }}>
                                            <span className="photo-camera-icon" style={{ display: 'flex', justifyContent: 'center' }}><Camera size={28} /></span>
                                            <span>Chạm để tải lên / Chụp ảnh check-in</span>
                                        </div>
                                    )}

                                    <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '14px' }}>
                                        <HelpCircle size={16} /> {getEventStep(campaign, 'QUIZ').prompt || 'Trả lời câu hỏi sự kiện.'}
                                    </p>
                                    <div className="quiz-options-grid">
                                        {['A', 'B', 'C', 'D'].map((code) => {
                                            const step = getEventStep(campaign, 'QUIZ');
                                            const text = step[`option_${code.toLowerCase()}`];
                                            if (!text) return null;
                                            return (
                                                <button
                                                    key={code}
                                                    className={`quiz-option-card ${quizAnswer === code ? 'selected' : ''}`}
                                                    onClick={() => setQuizAnswer(code)}
                                                    type="button"
                                                >
                                                    <span className="option-code">{code}</span>
                                                    <span className="option-text">{text}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '14px' }}>
                                        <QrCode size={16} /> Quét mã QR do doanh nghiệp cung cấp để hoàn thành sự kiện.
                                    </p>
                                    <QuestQrScanner
                                        loading={questLoading}
                                        disabled={!photoUploaded || !quizAnswer}
                                        buttonLabel="Quét QR và hoàn thành sự kiện"
                                        onScan={(token) => {
                                            setQrTokenInput(token);
                                            handleVerifyCampaign({ image_url: photoUrl, answer: quizAnswer, qr_token: token });
                                        }}
                                    />
                                </div>
                            )}

                            {/* 1. CHECKIN QUEST */}
                            {!isMultiStepEvent(campaign) && campaign.quest_type === 'CHECKIN' && (
                                <div className="quest-action-area">
                                    <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} /> Hệ thống sẽ xác thực vị trí GPS của bạn so với địa điểm chiến dịch.</p>
                                    <button 
                                        className="quest-action-btn"
                                        onClick={() => handleVerifyCampaign()}
                                        disabled={questLoading}
                                        type="button"
                                    >
                                        {questLoading ? 'Đang xác thực...' : 'Đăng ký Check-in ngay'}
                                    </button>
                                </div>
                            )}

                            {/* 2. QR QUEST */}
                            {!isMultiStepEvent(campaign) && campaign.quest_type === 'QR' && (
                                <div className="quest-action-area">
                                    <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><QrCode size={16} /> Quét mã QR tại doanh nghiệp để xác thực.</p>
                                    <QuestQrScanner
                                        loading={questLoading}
                                        buttonLabel="Quét QR"
                                        onScan={(token) => {
                                            setQrTokenInput(token);
                                            handleVerifyCampaign({ qr_token: token });
                                        }}
                                    />
                                </div>
                            )}

                            {/* 3. QUIZ QUEST */}
                            {!isMultiStepEvent(campaign) && campaign.quest_type === 'QUIZ' && (
                                <div className="quest-action-area">
                                    <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><HelpCircle size={16} /> Trả lời câu hỏi trắc nghiệm dưới đây:</p>
                                    <div className="quest-quiz-question">
                                        <strong>Câu hỏi:</strong> Địa điểm/Doanh nghiệp này cung cấp loại dịch vụ du lịch nào đặc trưng nhất?
                                    </div>
                                    <div className="quiz-options-grid">
                                        {[
                                            { code: 'A', text: 'Dịch vụ lưu trú & Tour trọn gói' },
                                            { code: 'B', text: 'Cho thuê phương tiện di chuyển' },
                                            { code: 'C', text: 'Bán quà lưu niệm thủ công' },
                                            { code: 'D', text: 'Ăn uống & Ẩm thực đường phố' }
                                        ].map((opt) => (
                                            <button 
                                                key={opt.code}
                                                className={`quiz-option-card ${quizAnswer === opt.code ? 'selected' : ''}`}
                                                onClick={() => setQuizAnswer(opt.code)}
                                                type="button"
                                            >
                                                <span className="option-code">{opt.code}</span>
                                                <span className="option-text">{opt.text}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => handleVerifyCampaign({ answer: quizAnswer, correct_answer: 'A' })}
                                        disabled={questLoading || !quizAnswer}
                                        className="quest-action-btn with-top-margin"
                                        type="button"
                                    >
                                        {questLoading ? 'Đang gửi đáp án...' : 'Nộp đáp án'}
                                    </button>
                                </div>
                            )}

                            {/* 4. PHOTO QUEST */}
                            {!isMultiStepEvent(campaign) && campaign.quest_type === 'PHOTO' && (
                                <div className="quest-action-area">
                                    <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Camera size={16} /> Chụp ảnh hiện vật hoặc biển hiệu để xác nhận sự hiện diện:</p>
                                    
                                    {photoUploaded ? (
                                        <div className="photo-preview-box">
                                            <img src={photoUrl} alt="Preview checkin" />
                                            <button className="photo-reset" onClick={() => { setPhotoUploaded(false); setPhotoUrl(''); }} type="button">✕ Xóa ảnh</button>
                                        </div>
                                    ) : (
                                        <div className="photo-upload-placeholder" onClick={() => {
                                            setPhotoUrl("/assets/island/map-dao.png");
                                            setPhotoUploaded(true);
                                        }}>
                                            <span className="photo-camera-icon" style={{ display: 'flex', justifyContent: 'center' }}><Camera size={28} /></span>
                                            <span>Chạm để tải lên / Chụp ảnh check-in</span>
                                        </div>
                                    )}

                                    <button 
                                        onClick={() => handleVerifyCampaign({ image_url: photoUrl })}
                                        disabled={questLoading || !photoUploaded}
                                        className="quest-action-btn with-top-margin"
                                        type="button"
                                    >
                                        {questLoading ? 'Đang xác thực ảnh...' : 'Xác nhận ảnh chụp'}
                                    </button>
                                </div>
                            )}

                            {questError && (
                                <div className="quest-error-msg" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertTriangle size={16} /> Lỗi: {questError}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="quest-success-screen">
                            <div className="success-icon" style={{ display: 'flex', justifyContent: 'center', color: '#2ecc71', marginBottom: '10px' }}><CheckCircle2 size={48} /></div>
                            <h4>Chiến dịch hoàn thành!</h4>
                            <p>Chúc mừng bạn đã hoàn thành thử thách và nhận được phần thưởng:</p>
                            
                            <div className="success-reward-card">
                                <div className="success-reward-item">
                                    <span className="success-reward-icon" style={{ display: 'inline-flex', alignItems: 'center' }}><Sparkles size={16} style={{ color: '#e67e22' }} /></span>
                                    <span><strong>+{questSuccess.reward_exp}</strong> EXP</span>
                                </div>
                                <div className="success-reward-item">
                                    <span className="success-reward-icon" style={{ display: 'inline-flex', alignItems: 'center' }}><Coins size={16} style={{ color: '#f1c40f' }} /></span>
                                    <span><strong>+{questSuccess.reward_coin}</strong> Coin</span>
                                </div>
                            </div>

                            <button 
                                className="quest-close-success-btn"
                                onClick={onClose}
                                type="button"
                            >
                                Tuyệt vời! Tiếp tục hành trình
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CampaignModal;
