# update_trip_detail.py
path = r"c:\Users\Hieu\Desktop\SmartTourismSystem\Frontend\src\screens\Trip\TripDetailScreen.js"
with open(path, "r", encoding="utf-8", newline="") as f:
    content = f.read()

# Normalize CRLF to LF
content_lf = content.replace("\r\n", "\n")

# 1. Update import
old_import = "import { getActiveTasks, pingLocation, verifyQuest, getActiveCampaigns, verifyCampaign } from '../../services/hiddenQuestService';"
if old_import not in content_lf:
    content_lf = content_lf.replace(
        "import { getActiveTasks, pingLocation, verifyQuest } from '../../services/hiddenQuestService';",
        old_import
    )

# 2. Inject states after hiddenTasks states
target_state_line = "    const [questSuccess, setQuestSuccess] = useState(null);"
new_states = """    const [questSuccess, setQuestSuccess] = useState(null);

    // States for Public Campaigns
    const [campaigns, setCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [showCampaignModal, setShowCampaignModal] = useState(false);

    // Fetch active campaigns list
    const fetchActiveCampaigns = async () => {
        try {
            const activeCampaigns = await getActiveCampaigns();
            setCampaigns(activeCampaigns);
        } catch (err) {
            console.error('Lỗi lấy chiến dịch hoạt động:', err);
        }
    };

    // Verify / Complete campaign endpoint trigger
    const handleVerifyCampaign = async (extraData = {}) => {
        if (!selectedCampaign || !userLocation) {
            setQuestError('Không xác định được vị trí GPS hiện tại!');
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
            playSound('success.mp3');
            setQuestSuccess(res);
            fetchActiveCampaigns();
        } catch (err) {
            playSound('error.mp3');
            setQuestError(err.message || 'Xác thực thất bại');
        } finally {
            setQuestLoading(false);
        }
    };"""

content_lf = content_lf.replace(target_state_line, new_states)

# 3. Add fetchActiveCampaigns call inside useEffect
old_watch_block = """        if (itineraryId) {
            fetchDetail();
            fetchHiddenTasks();
        }"""
new_watch_block = """        if (itineraryId) {
            fetchDetail();
            fetchHiddenTasks();
            fetchActiveCampaigns();
        }"""
content_lf = content_lf.replace(old_watch_block, new_watch_block)

# 4. Add window event listener in useEffect
old_watch_effect = "        const stopWatching = startWatchingPosition({"
new_watch_effect = """        const handleNewCampaignEvent = (event) => {
            const data = event.detail;
            void showAlert(`[Chiến dịch mới] "${data.title}" vừa được tạo gần bạn! Hãy khám phá trên bản đồ để check-in và nhận quà nhé!`);
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

# 5. Pass props to RouteMap render
old_route_map_call = """                            <RouteMap 
                                stops={[selectedStop]} 
                                routes={[]} 
                                hiddenTasks={hiddenTasks}
                                userLocation={userLocation}
                                user={user}
                                nextStop={selectedStop}
                                onStopClick={setSelectedStop}
                                onHiddenTaskClick={(task) => {
                                setSelectedHiddenTask(task);
                                setShowChestAnimation(true);
                            }}
                            />"""
new_route_map_call = """                            <RouteMap 
                                stops={[selectedStop]} 
                                routes={[]} 
                                hiddenTasks={hiddenTasks}
                                campaigns={campaigns}
                                onCampaignClick={(campaign) => {
                                    setSelectedCampaign(campaign);
                                    setShowCampaignModal(true);
                                }}
                                userLocation={userLocation}
                                user={user}
                                nextStop={selectedStop}
                                onStopClick={setSelectedStop}
                                onHiddenTaskClick={(task) => {
                                    setSelectedHiddenTask(task);
                                    setShowChestAnimation(true);
                                }}
                            />"""
content_lf = content_lf.replace(old_route_map_call, new_route_map_call)

# 6. Add Campaign Modal Overlay HTML block
# Let's insert it before the ChestOpeningAnimation overlay HTML
old_overlays_start = "            {/* --- Hidden Quest Overlays --- */}"
new_campaign_modal_overlay = """            {/* --- Campaign Overlays --- */}
            {showCampaignModal && selectedCampaign && (
                <div className="quest-modal-overlay">
                    <div className="quest-modal-content">
                        <div className="quest-modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Sparkles size={18} style={{ color: '#e67e22' }} /> {selectedCampaign.title || 'Chiến dịch Doanh nghiệp'}</h3>
                            <button className="quest-close-btn" onClick={() => {
                                setShowCampaignModal(false);
                                setQuestError('');
                                setQuestSuccess(null);
                                setQrTokenInput('');
                                setQuizAnswer('');
                                setPhotoUploaded(false);
                                setPhotoUrl('');
                            }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
                        </div>
                        
                        <div className="quest-modal-body">
                            {!questSuccess ? (
                                <>
                                    <p className="quest-desc">{selectedCampaign.description || 'Hoàn thành thử thách để nhận quà từ doanh nghiệp.'}</p>
                                    
                                    <div className="quest-meta-info">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Bán kính: {selectedCampaign.radius_meters}m</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Award size={14} /> {selectedCampaign.reward_exp} EXP | <Coins size={14} /> {selectedCampaign.reward_coin} xu</span>
                                    </div>

                                    {/* CHECKIN */}
                                    {selectedCampaign.quest_type === 'CHECKIN' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Hệ thống sẽ xác thực vị trí GPS của bạn.</p>
                                            <button className="quest-action-btn" onClick={() => handleVerifyCampaign()} disabled={questLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><MapPin size={16} /> Check-in ngay</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* QR */}
                                    {selectedCampaign.quest_type === 'QR' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><QrCode size={14} /> Nhập mã token hoặc quét QR:</p>
                                            <input type="text" className="quest-input" placeholder="QR_EVENT_TOKEN_123" value={qrTokenInput} onChange={(e) => setQrTokenInput(e.target.value)} />
                                            <button className="quest-action-btn" onClick={() => handleVerifyCampaign({ qr_token: qrTokenInput })} disabled={questLoading || !qrTokenInput.trim()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><Check size={16} /> Xác nhận mã QR</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* QUIZ */}
                                    {selectedCampaign.quest_type === 'QUIZ' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><HelpCircle size={14} /> Trả lời câu hỏi:</p>
                                            <div className="quiz-options-grid">
                                                {[
                                                    { code: 'A', text: 'Dịch vụ lưu trú & Tour trọn gói' },
                                                    { code: 'B', text: 'Cho thuê phương tiện di chuyển' },
                                                    { code: 'C', text: 'Bán quà lưu niệm thủ công' },
                                                    { code: 'D', text: 'Ăn uống & Ẩm thực đường phố' }
                                                ].map((opt) => (
                                                    <button key={opt.code} className={`quiz-option-card ${quizAnswer === opt.code ? 'selected' : ''}`} onClick={() => setQuizAnswer(opt.code)}>
                                                        <span className="option-code">{opt.code}</span>
                                                        <span className="option-text">{opt.text}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <button className="quest-action-btn" onClick={() => handleVerifyCampaign({ answer: quizAnswer, correct_answer: 'A' })} disabled={questLoading || !quizAnswer} style={{ marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang gửi...' : <><Check size={16} /> Nộp đáp án</>}
                                            </button>
                                        </div>
                                    )}

                                    {/* PHOTO */}
                                    {selectedCampaign.quest_type === 'PHOTO' && (
                                        <div className="quest-action-area">
                                            <p className="quest-instruction" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Camera size={14} /> Chụp ảnh check-in:</p>
                                            {photoUploaded ? (
                                                <div className="photo-preview-box">
                                                    <img src={photoUrl} alt="Preview" />
                                                    <button className="photo-reset" onClick={() => { setPhotoUploaded(false); setPhotoUrl(''); }} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><X size={12} /> Xóa</button>
                                                </div>
                                            ) : (
                                                <div className="photo-upload-placeholder" onClick={() => { setPhotoUrl('/assets/island/map-dao.png'); setPhotoUploaded(true); }}>
                                                    <Camera size={32} style={{ color: '#a4b0be' }} />
                                                    <span>Chạm để tải lên / Chụp ảnh</span>
                                                </div>
                                            )}
                                            <button className="quest-action-btn" onClick={() => handleVerifyCampaign({ image_url: photoUrl })} disabled={questLoading || !photoUploaded} style={{ marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                {questLoading ? 'Đang xác thực...' : <><Check size={16} /> Xác nhận ảnh</>}
                                            </button>
                                        </div>
                                    )}

                                    {questError && <div className="quest-error-msg" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {questError}</div>}
                                </>
                            ) : (
                                <div className="quest-success-screen">
                                    <div className="success-icon" style={{ display: 'flex', alignItems: 'center', justifycontent: 'center' }}><Sparkles size={48} style={{ color: '#2ed573' }} /></div>
                                    <h4>Chiến dịch hoàn thành!</h4>
                                    <p>Chúc mừng bạn đã nhận được phần thưởng:</p>
                                    <div className="success-reward-card">
                                        <div className="success-reward-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Flame size={20} style={{ color: '#ff7f50' }} /><span><strong>+{questSuccess.reward_exp}</strong> EXP</span></div>
                                        <div className="success-reward-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Coins size={20} style={{ color: '#fbc531' }} /><span><strong>+{questSuccess.reward_coin}</strong> xu</span></div>
                                    </div>
                                    <button className="quest-close-success-btn" onClick={() => {
                                        setShowCampaignModal(false);
                                        setQuestSuccess(null);
                                        setQrTokenInput('');
                                        setQuizAnswer('');
                                        setPhotoUploaded(false);
                                        setPhotoUrl('');
                                    }}>Tuyệt vời! Tiếp tục hành trình</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- Hidden Quest Overlays --- */}"""

content_lf = content_lf.replace(old_overlays_start, new_campaign_modal_overlay)

# Write back with CRLF line endings
final_content = content_lf.replace("\n", "\r\n")
with open(path, "w", encoding="utf-8", newline="\r\n") as f:
    f.write(final_content)

print("TripDetailScreen.js successfully updated!")
