// src/components/HiddenQuest/ChestOpeningAnimation.jsx
import React, { useState, useEffect, useRef } from 'react';
import './ChestOpeningAnimation.css';

const ChestOpeningAnimation = ({ task, onClose, onClaim, userLocation = null }) => {
    const [stage, setStage] = useState('IDLE'); // IDLE, OPENING, REVEALED
    const [isFlipped, setIsFlipped] = useState(false);
    const [rewards, setRewards] = useState(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const canvasRef = useRef(null);
    const animationFrameRef = useRef(null);
    const particlesRef = useRef([]);

    // Rarity styles
    const rarity = task?.rarity || 'COMMON';
    const chestTitle = task?.title || 'Rương kho báu';
    const chestDesc = task?.description || 'Hãy mở ra xem bên trong có gì nhé!';

    // Color definitions for rarity particles
    const rarityColors = {
        COMMON: ['#7f8c8d', '#bdc3c7', '#95a5a6', '#ffffff'],
        RARE: ['#0abde3', '#00cec9', '#54a0ff', '#ffffff'],
        EPIC: ['#a29bfe', '#6c5ce7', '#e0b0ff', '#ffffff'],
        LEGENDARY: ['#f1c40f', '#f39c12', '#ffeaa7', '#ffffff']
    };

    // 1. Particle Simulation Logic
    const initParticles = (width, height) => {
        const colors = rarityColors[rarity] || rarityColors.COMMON;
        const count = rarity === 'LEGENDARY' ? 120 : rarity === 'EPIC' ? 80 : 50;
        const particles = [];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 3;
            
            particles.push({
                x: width / 2,
                y: height / 2 - 20,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (Math.random() * 4 + 2), // upward bias
                size: Math.random() * 6 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1,
                decay: Math.random() * 0.02 + 0.01,
                gravity: 0.15,
                shape: Math.random() > 0.5 ? 'circle' : 'star'
            });
        }
        particlesRef.current = particles;
    };

    const updateAndDrawParticles = (ctx, width, height) => {
        ctx.clearRect(0, 0, width, height);
        const particles = particlesRef.current;

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            
            // physics
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.alpha -= p.decay;

            if (p.alpha <= 0) {
                particles.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = rarity === 'LEGENDARY' ? 15 : 5;
            ctx.shadowColor = p.color;

            if (p.shape === 'star') {
                ctx.beginPath();
                ctx.moveTo(p.x, p.y - p.size);
                ctx.lineTo(p.x + p.size/2, p.y);
                ctx.lineTo(p.x, p.y + p.size);
                ctx.lineTo(p.x - p.size/2, p.y);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        if (particles.length > 0) {
            animationFrameRef.current = requestAnimationFrame(() => updateAndDrawParticles(ctx, width, height));
        } else {
            setStage('REVEALED');
        }
    };

    const startExplosion = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;

        initParticles(width, height);
        updateAndDrawParticles(ctx, width, height);
    };

    // 2. Handle Opening / Claim Logic
    const handleOpenChest = async () => {
        if (loading) return;
        setLoading(true);
        setErrorMsg('');

        try {
            // Retrieve token
            const token = localStorage.getItem('access_token');
            if (!token) {
                throw new Error("Vui lòng đăng nhập trước khi nhận rương");
            }

            let latitude = null;
            let longitude = null;

            // 1. Dùng GPS truyền từ component cha nếu có
            if (userLocation && userLocation.lat !== undefined && userLocation.lng !== undefined) {
                latitude = userLocation.lat;
                longitude = userLocation.lng;
            } else {
                // 2. Nếu không có sẵn, tiến hành định vị GPS từ trình duyệt
                try {
                    const pos = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { 
                            enableHighAccuracy: true,
                            timeout: 8000 
                        });
                    });
                    latitude = pos.coords.latitude;
                    longitude = pos.coords.longitude;
                } catch (gpsErr) {
                    console.error("Lỗi lấy GPS:", gpsErr);
                    throw new Error("📍 Lỗi định vị: Không thể xác định vị trí GPS của bạn. Vui lòng bật định vị và cho phép trình duyệt truy cập vị trí để mở rương!");
                }
            }

            // Đảm bảo có tọa độ GPS thực tế
            if (latitude === null || longitude === null) {
                throw new Error("📍 Lỗi định vị: Chưa nhận được dữ liệu GPS. Vui lòng bật định vị để mở rương!");
            }

            const response = await fetch('http://localhost:8000/api/v1/hidden/claim-chest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    spawn_id: task.spawn_id,
                    latitude,
                    longitude
                })
            });

            const data = await response.json();

            // ❌ LỖI 1: Khoảng cách quá xa (Backend trả về status: "too_far" với status code 200)
            if (data && data.status === "too_far") {
                setErrorMsg(`📍 Khoảng cách quá xa: ${data.message} (Khoảng cách thực tế: ${Math.round(data.current_distance)}m, yêu cầu <= ${data.required_distance}m)`);
                setLoading(false);
                return; 
            }

            // Xử lý khi HTTP Status code trả về lỗi hệ thống (4xx, 5xx)
            if (!response.ok) {
                const backendDetail = data.detail || "";

                // ❌ LỖI 2: Thiếu dữ liệu profile cá nhân dưới DB
                if (backendDetail.includes("user_profiles") || backendDetail.includes("hồ sơ") || backendDetail.includes("profile")) {
                    setErrorMsg("👤 Lỗi tài khoản: Hệ thống không tìm thấy hồ sơ cá nhân (user_profiles) tương ứng với tài khoản của bạn. Vui lòng cập nhật profile hoặc kiểm tra DB.");
                } 
                // ❌ LỖI 3: Rương kho báu đã hết hạn trên bản đồ
                else if (backendDetail.includes("expired") || backendDetail.includes("hết hạn") || backendDetail.includes("timeout")) {
                    setErrorMsg("⏳ Rương đã hết hạn: Rương kho báu này đã quá thời gian tồn tại trên hệ thống!");
                } 
                // ❌ CÁC LỖI KHÁC
                else {
                    setErrorMsg(`⚠️ Lỗi hệ thống: ${backendDetail || "Không thể mở rương vào lúc này"}`);
                }

                setLoading(false);
                return;
            }

            // 🎉 XỬ LÝ KHI THÀNH CÔNG HOÀN TOÀN (status: "ok")
            if (data.status === "ok") {
                setRewards(data);
                setStage('OPENING');
                setLoading(false);
                
                // Start particle explosion
                setTimeout(() => {
                    startExplosion();
                }, 500);
            } else {
                throw new Error("Phản hồi trạng thái từ Server không hợp lệ");
            }

        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || "❌ Mất kết nối: Đã xảy ra lỗi khi kết nối đến máy chủ Backend");
            setLoading(false);
        }
    };

    // Clean up animation frame on unmount
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    const triggerFlip = () => {
        setIsFlipped(!isFlipped);
    };

    const handleConfirmClaim = () => {
        if (onClaim && rewards) {
            onClaim(rewards);
        }
        onClose();
    };

    return (
        <div className="chest-modal-overlay">
            <div className="chest-modal-container">
                {/* Glow ring in the back */}
                <div className={`chest-glow-bg glow-${rarity}`} />
                
                {/* Canvas particles */}
                <canvas ref={canvasRef} className="particle-canvas" />

                {stage === 'IDLE' && (
                    <>
                        <span className={`rarity-badge badge-${rarity}`}>{rarity} CHEST</span>
                        <h2 className="chest-title">{chestTitle}</h2>
                        <p className="chest-subtitle">{chestDesc}</p>
                        
                        <div className="chest-wrapper chest-floating" onClick={handleOpenChest}>
                            <div style={{ fontSize: '100px', transform: 'scale(1.2)', cursor: 'pointer' }}>
                                {rarity === 'LEGENDARY' ? '🏆' : rarity === 'EPIC' ? '👑' : rarity === 'RARE' ? '💎' : '📦'}
                            </div>
                        </div>

                        {errorMsg && (
                            <p style={{ 
                                color: '#ff7675', 
                                fontSize: '13px', 
                                margin: '15px 0 5px 0', 
                                fontWeight: 'bold', 
                                backgroundColor: 'rgba(255, 118, 117, 0.1)', 
                                padding: '10px', 
                                borderRadius: '6px',
                                border: '1px solid rgba(255, 118, 117, 0.2)',
                                textAlign: 'center',
                                width: '100%',
                                boxSizing: 'border-box'
                            }}>
                                {errorMsg}
                            </p>
                        )}

                        <button 
                            className="claim-btn" 
                            onClick={handleOpenChest}
                            disabled={loading}
                            style={{ marginTop: errorMsg ? '10px' : '20px' }}
                        >
                            {loading ? 'Đang mở khóa...' : 'Mở rương 🔑'}
                        </button>
                        
                        <button 
                            style={{ background: 'none', border: 'none', color: '#747d8c', marginTop: '15px', cursor: 'pointer', fontSize: '14px' }}
                            onClick={onClose}
                        >
                            Đóng
                        </button>
                    </>
                )}

                {stage === 'OPENING' && (
                    <>
                        <span className={`rarity-badge badge-${rarity}`}>{rarity} CHEST</span>
                        <h2 className="chest-title" style={{ animation: 'flashText 1.5s infinite' }}>
                            ĐANG MỞ KHÓA...
                        </h2>
                        
                        <div className="chest-wrapper chest-shaking chest-open-animation">
                            <div style={{ fontSize: '100px', transform: 'scale(1.2)' }}>
                                {rarity === 'LEGENDARY' ? '🏆' : rarity === 'EPIC' ? '👑' : rarity === 'RARE' ? '💎' : '📦'}
                            </div>
                        </div>
                    </>
                )}

                {stage === 'REVEALED' && (
                    <>
                        <span className={`rarity-badge badge-${rarity}`}>{rarity} REWARD</span>
                        <h2 className="chest-title">Chúc mừng!</h2>
                        <p className="chest-subtitle" style={{ margin: 0 }}>Bạn nhận được vật phẩm quý giá</p>

                        <div className="reward-card-container" onClick={triggerFlip}>
                            <div className={`reward-card ${isFlipped ? 'flipped' : ''}`}>
                                
                                {/* Front Face */}
                                <div className="card-face card-front">
                                    <div className="card-front-content">
                                        <div className="card-logo">🎁</div>
                                        <h3 style={{ margin: 0 }}>Lật Thẻ</h3>
                                        <p className="tap-to-reveal">Chạm vào đây 💫</p>
                                    </div>
                                </div>

                                {/* Back Face */}
                                <div className={`card-face card-back card-${rarity}`}>
                                    <h4 className="reward-heading">PHẦN THƯỞNG</h4>
                                    
                                    <div className="reward-row">
                                        <span className="reward-icon">🔥</span>
                                        <div className="reward-text">
                                            <span className="reward-val">+{rewards?.reward_exp || 0}</span>
                                            <span className="reward-label">Kinh nghiệm (EXP)</span>
                                        </div>
                                    </div>

                                    <div className="reward-row">
                                        <span className="reward-icon">🪙</span>
                                        <div className="reward-text">
                                            <span className="reward-val">+{rewards?.reward_coin || 0}</span>
                                            <span className="reward-label">Xu (Coin)</span>
                                        </div>
                                    </div>

                                    {rewards?.multiplier > 1 && (
                                        <div className="multiplier-tag">
                                            Hệ số Rarity: x{rewards.multiplier} 🚀
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>

                        <button className="claim-btn" onClick={handleConfirmClaim}>
                            Nhận và Tiếp tục 🎉
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ChestOpeningAnimation;