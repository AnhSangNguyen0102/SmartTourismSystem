# update_main_tabs_v2.py
import re

path = r"c:\Users\Hieu\Desktop\SmartTourismSystem\Frontend\src\components\MainTabs.jsx"
with open(path, "r", encoding="utf-8", newline="") as f:
    content = f.read()

# Normalize CRLF to LF for manipulation
content_lf = content.replace("\r\n", "\n")

# 1. Update import
old_import = "import { getActiveTasks, pingLocation, verifyQuest, getActiveCampaigns, verifyCampaign } from '../services/hiddenQuestService';"
if old_import not in content_lf:
    content_lf = content_lf.replace(
        "import { getActiveTasks, pingLocation, verifyQuest } from '../services/hiddenQuestService';",
        old_import
    )

# 2. Inject campaigns states and functions right after questSuccess state
# Let's locate 'const [questSuccess, setQuestSuccess] = useState(null);'
target_state_line = "    const [questSuccess, setQuestSuccess] = useState(null);"
new_states = """    const [questSuccess, setQuestSuccess] = useState(null);

    // States for Public Campaigns
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [showCampaignModal, setShowCampaignModal] = useState(false);

    // Fetch active campaigns list
    const fetchActiveCampaigns = async () => {
        if (isGuest) return;
        try {
            const activeCampaigns = await getActiveCampaigns();
            setCampaigns(activeCampaigns);
        } catch (err) {
            console.error("Lỗi lấy danh sách chiến dịch hoạt động:", err);
        }
    };

    // Verify / Complete campaign endpoint trigger
    const handleVerifyCampaign = async (extraData = {}) => {
        if (!selectedCampaign || !userLocation) {
            setQuestError("Không xác định được vị trí GPS hiện tại!");
            return;
        }
        setQuestLoading(true);
        setQuestError('');
        try {
            const res = await verifyCampaign(
                selectedCampaign.event_id,
                userLocation.lat,
                userLocation.lng,
                selectedCampaign.quest_type,
                extraData
            );
            setQuestSuccess(res);
            fetchActiveCampaigns();
        } catch (err) {
            setQuestError(err.message || "Xác thực thất bại");
        } finally {
            setQuestLoading(false);
        }
    };

    const handleCampaignClick = (campaign) => {
        setSelectedCampaign(campaign);
        setShowCampaignModal(true);
    };"""

if target_state_line in content_lf:
    content_lf = content_lf.replace(target_state_line, new_states)
else:
    print("ERROR: Target state line not found!")

# 3. Add fetchActiveCampaigns call inside useEffect that calls fetchActiveTasks
old_watch_block = """        // Initial fetch of active items on tab switch
        fetchActiveTasks();"""
new_watch_block = """        // Initial fetch of active items on tab switch
        fetchActiveTasks();
        fetchActiveCampaigns();"""
content_lf = content_lf.replace(old_watch_block, new_watch_block)

# 4. Add fetchActiveCampaigns call inside handleTabChange
old_tab_block = """                            fetchActiveTasks();
                        })"""
new_tab_block = """                            fetchActiveTasks();
                        })
                    fetchActiveCampaigns();"""
content_lf = content_lf.replace(old_tab_block, new_tab_block)

# 5. Add window event listener for new_campaign in useEffect
old_watch_effect = "        const stopWatching = startWatchingPosition({"
new_watch_effect = """        const handleNewCampaignEvent = (event) => {
            const data = event.detail;
            void showAlert(`[Chiến dịch mới] "${data.title}" vừa được tạo gần bạn! Hãy mở Bản đồ để check-in và nhận quà nhé!`);
            fetchActiveCampaigns();
        };

        window.addEventListener('new_campaign', handleNewCampaignEvent);

        const stopWatching = startWatchingPosition({"""

content_lf = content_lf.replace(old_watch_effect, new_watch_effect)

# Also clean up the listener on unmount
old_unmount_block = """        return () => {
            if (typeof stopWatching === 'function') {
                stopWatching();
            }
            clearInterval(pingInterval);
        };"""
new_unmount_block = """        return () => {
            window.removeEventListener('new_campaign', handleNewCampaignEvent);
            if (typeof stopWatching === 'function') {
                stopWatching();
            }
            clearInterval(pingInterval);
        };"""
content_lf = content_lf.replace(old_unmount_block, new_unmount_block)

# 6. Pass props to LocationScreen render
old_location_screen_call = """                    <LocationScreen
                        userLocation={userLocation}
                        userInfo={userInfo}
                        hiddenTasks={hiddenTasks}
                        handleHiddenTaskClick={handleHiddenTaskClick}
                        isGuest={isGuest}
                        fetchActiveTasks={fetchActiveTasks}"""
new_location_screen_call = """                    <LocationScreen
                        userLocation={userLocation}
                        userInfo={userInfo}
                        hiddenTasks={hiddenTasks}
                        handleHiddenTaskClick={handleHiddenTaskClick}
                        campaigns={campaigns}
                        onCampaignClick={handleCampaignClick}
                        isGuest={isGuest}
                        fetchActiveTasks={fetchActiveTasks}"""
content_lf = content_lf.replace(old_location_screen_call, new_location_screen_call)

# 7. Update LocationScreen parameter list and MapComponent invocation
old_location_screen_def = """const LocationScreen = ({
    userLocation,
    userInfo,
    hiddenTasks,
    handleHiddenTaskClick,
    isGuest,
    fetchActiveTasks,
    onTestClaim
}) => {"""
new_location_screen_def = """const LocationScreen = ({
    userLocation,
    userInfo,
    hiddenTasks,
    handleHiddenTaskClick,
    campaigns = [],
    onCampaignClick = null,
    isGuest,
    fetchActiveTasks,
    onTestClaim
}) => {"""
content_lf = content_lf.replace(old_location_screen_def, new_location_screen_def)

old_map_comp_call = """            <MapComponent 
                ref={mapComponentRef}
                userLocation={userLocation} 
                user={userInfo}
                stops={[]} 
                hiddenTasks={hiddenTasks} 
                onHiddenTaskClick={handleHiddenTaskClick}
                fullScreen={true}
                mapStyle={mapStyle}
                showHiddenTasks={showHiddenTasks}
            />"""
new_map_comp_call = """            <MapComponent 
                ref={mapComponentRef}
                userLocation={userLocation} 
                user={userInfo}
                stops={[]} 
                hiddenTasks={hiddenTasks} 
                onHiddenTaskClick={handleHiddenTaskClick}
                campaigns={campaigns}
                onCampaignClick={onCampaignClick}
                fullScreen={true}
                mapStyle={mapStyle}
                showHiddenTasks={showHiddenTasks}
            />"""
content_lf = content_lf.replace(old_map_comp_call, new_map_comp_call)

# 8. Add Campaign Modal Overlay HTML block
# Let's insert it before the Redeem Success Modal block
old_quest_modal_end = "            {/* --- Redeem Voucher Success Modal --- */}"
new_campaign_modal_overlay = """            {/* --- Campaign Overlays --- */}
            {showCampaignModal && selectedCampaign && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content">
                        <div className="quest-modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={20} style={{ color: '#e67e22' }} /> {selectedCampaign.title || 'Chiến dịch Doanh nghiệp'}</h3>
                            <button className="quest-close-btn" onClick={() => {
                                setShowCampaignModal(false);
                                setQuestError('');
                                setQuestSuccess(null);
                                setQrTokenInput('');
                                setQuizAnswer('');
                                setPhotoUploaded(false);
                                setPhotoUrl('');
                            }}>✕</button>
                        </div>
                        
                        <div className="quest-modal-body">
                            {!questSuccess ? (
                                <>
                                    <p className="quest-desc">{selectedCampaign.description || 'Hoàn thành thử thách để nhận quà từ doanh nghiệp.'}</p>
                                    
                                    <div className="quest-meta-info" style={{ display: 'flex', gap: '15px' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Bán kính: {selectedCampaign.radius_meters}m</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Award size={14} style={{ color: '#f1c40f' }} /> Thưởng: {selectedCampaign.reward_exp} EXP | <Coins size={14} style={{ color: '#f1c40f', marginLeft: '4px' }} /> {selectedCampaign.reward_coin} Coin</span>
                                    </div>

                                    {/* 1. CHECKIN QUEST */}
                                    {selectedCampaign.quest_type === 'CHECKIN' && (
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
                                    {selectedCampaign.quest_type === 'QR' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><QrCode size={16} /> Vui lòng nhập mã token nhận được từ doanh nghiệp hoặc quét QR:</p>
                                            <input 
                                                type="text" 
                                                className="quest-input"
                                                placeholder="Ví dụ: QR_EVENT_TOKEN_123"
                                                value={qrTokenInput}
                                                onChange={(e) => setQrTokenInput(e.target.value)}
                                            />
                                            <button 
                                                className="quest-action-btn"
                                                onClick={() => handleVerifyCampaign({ qr_token: qrTokenInput })}
                                                disabled={questLoading || !qrTokenInput.trim()}
                                                type="button"
                                            >
                                                {questLoading ? 'Đang xác thực...' : 'Xác nhận mã QR'}
                                            </button>
                                        </div>
                                    )}

                                    {/* 3. QUIZ QUEST */}
                                    {selectedCampaign.quest_type === 'QUIZ' && (
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
                                    {selectedCampaign.quest_type === 'PHOTO' && (
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
                                                    <small className="photo-helper-text">(Mô phỏng tự động chọn ảnh chất lượng cao)</small>
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
                                        onClick={() => {
                                            setShowCampaignModal(false);
                                            setQuestSuccess(null);
                                            setQrTokenInput('');
                                            setQuizAnswer('');
                                            setPhotoUploaded(false);
                                            setPhotoUrl('');
                                        }}
                                        type="button"
                                    >
                                        Tuyệt vời! Tiếp tục hành trình
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- Redeem Voucher Success Modal --- */}"""

content_lf = content_lf.replace(old_quest_modal_end, new_campaign_modal_overlay)

# Write back with CRLF line endings to preserve file style exactly
final_content = content_lf.replace("\n", "\r\n")
with open(path, "w", encoding="utf-8", newline="\r\n") as f:
    f.write(final_content)

print("MainTabs.jsx successfully updated with v2 script!")
