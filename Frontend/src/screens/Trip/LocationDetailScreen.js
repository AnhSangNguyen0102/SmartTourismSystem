import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config/api';
import { storageGet } from '../../platform/storage';
import './LocationDetailScreen.css';

// ── Helper ──────────────────────────────────────────────────────────────────
const fallbackImage = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
const defaultAvatar = 'https://ui-avatars.com/api/?background=0abde3&color=fff&name=';

const formatTime = (t) => (t ? t.substring(0, 5) : null);

const timeAgo = (isoStr) => {
    if (!isoStr) return '';
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} ngày trước`;
    return new Date(isoStr).toLocaleDateString('vi-VN');
};

const StarBar = ({ value, max = 5, size = 16 }) => (
    <span style={{ color: '#f39c12', fontSize: size, letterSpacing: 1 }}>
        {Array.from({ length: max }, (_, i) => (
            <span key={i} style={{ opacity: i < Math.round(value) ? 1 : 0.25 }}>★</span>
        ))}
    </span>
);

// ── Component ────────────────────────────────────────────────────────────────
const LocationDetailScreen = ({ location, onBack }) => {
    const [ambassadors, setAmbassadors] = useState([]);
    const [loadingAmbassadors, setLoadingAmbassadors] = useState(false);
    const [images, setImages] = useState([]);          // ảnh từ DB
    const [coverIdx, setCoverIdx] = useState(0);       // ảnh đang hiển thị
    const [ratingSummary, setRatingSummary] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [loadingReviews, setLoadingReviews] = useState(false);

    // Write-review form
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [myRating, setMyRating] = useState(5);
    const [myComment, setMyComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitMsg, setSubmitMsg] = useState('');

    // Map overlay
    const [showMap, setShowMap] = useState(false);

    // ── Fetch helpers ──────────────────────────────────────────────────────
    const fetchReviews = useCallback(async () => {
        if (!location?.location_id) return;
        setLoadingReviews(true);
        try {
            const [summaryRes, reviewsRes] = await Promise.all([
                fetch(`${API_BASE}/api/v1/locations/${location.location_id}/rating-summary`),
                fetch(`${API_BASE}/api/v1/locations/${location.location_id}/reviews?limit=10`),
            ]);
            if (summaryRes.ok) setRatingSummary(await summaryRes.json());
            if (reviewsRes.ok) setReviews(await reviewsRes.json());
        } catch (e) {
            console.error('Lỗi tải reviews:', e);
        } finally {
            setLoadingReviews(false);
        }
    }, [location?.location_id]);

    useEffect(() => {
        if (!location?.location_id) return;

        // Ảnh từ DB
        fetch(`${API_BASE}/api/v1/locations/${location.location_id}/images`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (data.length > 0) setImages(data); })
            .catch(() => {});

        // Đại sứ
        setLoadingAmbassadors(true);
        fetch(`${API_BASE}/api/social/locations/${location.location_id}/ambassador`)
            .then(r => r.ok ? r.json() : [])
            .then(setAmbassadors)
            .catch(() => {})
            .finally(() => setLoadingAmbassadors(false));

        // Reviews
        fetchReviews();
    }, [location?.location_id, fetchReviews]);

    // ── Guard ──────────────────────────────────────────────────────────────
    if (!location) {
        return (
            <div className="location-detail-container">
                <button onClick={onBack}>Quay lại</button>
                <p>Không có dữ liệu địa điểm</p>
            </div>
        );
    }

    // ── Derived display values ─────────────────────────────────────────────
    const dbImages = images.map(i => i.url);
    const allImages = dbImages.length > 0
        ? dbImages
        : [location.image_url || location.cover_image || fallbackImage];
    const bannerUrl = allImages[coverIdx] || fallbackImage;

    const displayLocation = location.address || location.city_name || 'Việt Nam';
    const displayDesc = location.description || null;
    const openTime = formatTime(location.open_time);
    const closeTime = formatTime(location.close_time);
    const minPrice = location.min_price != null ? Number(location.min_price) : null;
    const maxPrice = location.max_price != null ? Number(location.max_price) : null;
    const isFree = minPrice === 0 && (maxPrice === 0 || maxPrice == null);
    const priceText = minPrice == null
        ? null
        : isFree
            ? 'Miễn phí'
            : `${minPrice.toLocaleString('vi-VN')}đ${maxPrice && maxPrice > 0 ? ` - ${maxPrice.toLocaleString('vi-VN')}đ` : ''}`;

    // Rating hiển thị: ưu tiên từ Supabase reviews, fallback về score từ API
    const avgRating = ratingSummary?.average_rating ?? (location.score ? Number(location.score) : null);
    const totalReviews = ratingSummary?.total_reviews ?? 0;

    // ── Submit review ──────────────────────────────────────────────────────
    const handleSubmitReview = async () => {
        setSubmitting(true);
        setSubmitMsg('');
        try {
            const token = await storageGet('access_token');
            if (!token) { setSubmitMsg('Bạn cần đăng nhập để đánh giá.'); return; }
            const res = await fetch(`${API_BASE}/api/v1/locations/${location.location_id}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ rating: myRating, comment: myComment }),
            });
            if (res.ok) {
                setSubmitMsg('✅ Đã lưu đánh giá!');
                setShowReviewForm(false);
                setMyComment('');
                setMyRating(5);
                await fetchReviews();           // Refresh danh sách
            } else {
                const err = await res.json().catch(() => ({}));
                setSubmitMsg(`❌ ${err.detail || 'Lỗi khi lưu'}`);
            }
        } catch (e) {
            setSubmitMsg('❌ Không thể kết nối server');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="location-detail-container">
            {/* ── Image Banner ── */}
            <div
                className="detail-banner"
                style={{ backgroundImage: `url(${bannerUrl})` }}
            >
                <div className="banner-overlay">
                    <button className="banner-btn back-btn" onClick={onBack}>
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <button className="banner-btn fav-btn">
                        <i className="far fa-heart"></i>
                    </button>
                </div>

                {/* Thumbnail strip nếu có nhiều ảnh */}
                {allImages.length > 1 && (
                    <div style={{
                        position: 'absolute', bottom: 8, left: 0, right: 0,
                        display: 'flex', justifyContent: 'center', gap: 6, padding: '0 12px'
                    }}>
                        {allImages.map((url, idx) => (
                            <div
                                key={idx}
                                onClick={() => setCoverIdx(idx)}
                                style={{
                                    width: 42, height: 42, borderRadius: 8,
                                    backgroundImage: `url(${url})`,
                                    backgroundSize: 'cover', backgroundPosition: 'center',
                                    border: idx === coverIdx ? '2px solid #fff' : '1px solid rgba(255,255,255,0.5)',
                                    cursor: 'pointer', flexShrink: 0,
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Content ── */}
            <div className="detail-content">
                {/* Tiêu đề + địa chỉ + rating tổng */}
                <div className="header-info">
                    <h2 className="loc-title">{location.location_name}</h2>
                    <div className="loc-meta">
                        <span className="loc-address">
                            <i className="fas fa-map-marker-alt" style={{ color: '#0abde3', marginRight: 5 }}></i>
                            {displayLocation}
                        </span>
                        {avgRating != null && (
                            <span className="loc-rating">
                                <span style={{ color: '#f39c12', marginRight: 4 }}>★</span>
                                {Number(avgRating).toFixed(1)}
                                {totalReviews > 0 && (
                                    <span style={{ fontSize: 12, color: '#888', marginLeft: 4 }}>
                                        ({totalReviews})
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                </div>

                {/* Giá & giờ */}
                {(priceText || openTime) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, fontSize: 13, color: '#636e72' }}>
                        {openTime && (
                            <span>
                                <i className="fas fa-clock" style={{ color: '#0abde3', marginRight: 6 }}></i>
                                Mở cửa: {openTime}{closeTime ? ` – ${closeTime}` : ''}
                            </span>
                        )}
                        {priceText && (
                            <span>
                                <i className="fas fa-tag" style={{ color: '#00b894', marginRight: 6 }}></i>
                                Giá vé: {priceText}
                            </span>
                        )}
                    </div>
                )}

                {/* Mô tả */}
                {displayDesc && (
                    <div className="desc-section">
                        <p className="loc-desc">{displayDesc}</p>
                    </div>
                )}

                <button className="btn-directions" onClick={() => setShowMap(true)}>
                    <i className="fas fa-directions" style={{ marginRight: 8 }}></i> Directions
                </button>

                {/* ── Đại sứ địa phương ── */}
                <div className="section" style={{
                    border: '2.5px solid #2c3e50', borderRadius: 16, padding: 12,
                    backgroundColor: '#f8fafc', boxShadow: '0 4px 0 #2c3e50', marginBottom: 20
                }}>
                    <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 'bold', margin: '0 0 10px', color: '#2c3e50' }}>
                        👑 Đại sứ địa phương
                    </h3>
                    {loadingAmbassadors ? (
                        <div style={{ fontSize: 12, color: '#7f8c8d', textAlign: 'center', padding: 10 }}>Đang tải...</div>
                    ) : ambassadors.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '12px 0', color: '#747d8c', fontSize: 12, fontWeight: 'bold' }}>
                            <span>Chưa có Đại sứ địa phương ở đây! 🗺️</span>
                            <p style={{ fontSize: 10, color: '#95a5a6', fontWeight: 'normal', marginTop: 4 }}>
                                Hãy là người check-in đầu tiên để chiếm lĩnh danh hiệu này!
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {ambassadors.map((amb, index) => {
                                const medals = ['🥇', '🥈', '🥉', '🎖️', '🎖️'];
                                return (
                                    <div key={amb.user_id} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '8px 10px', backgroundColor: '#fff',
                                        border: '2px solid #2c3e50', borderRadius: 12, boxShadow: '0 2px 0 #2c3e50'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span style={{ fontSize: 16, fontWeight: 'bold' }}>{medals[index] || '🎖️'}</span>
                                            <img src={amb.avatar} alt={amb.name} style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #2c3e50' }} />
                                            <span style={{ fontSize: 13, fontWeight: 'bold', color: '#2c3e50' }}>{amb.name}</span>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 'bold', color: '#3498db', backgroundColor: '#eaf2f8', padding: '3px 8px', borderRadius: 8, border: '1px solid #a9cce3' }}>
                                            {amb.checkin_count} check-in
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>


                {/* ── Rating & Reviews ── */}
                <div className="section" style={{ paddingBottom: 80 }}>
                    <h3 className="section-title">Rating &amp; Reviews</h3>

                    {/* Rating tổng */}
                    {ratingSummary && ratingSummary.total_reviews > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 16,
                            background: 'linear-gradient(135deg, #fff9f0, #fff3e0)',
                            borderRadius: 16, padding: '14px 18px', marginBottom: 16,
                            border: '1px solid #ffe0b2'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 36, fontWeight: 900, color: '#f39c12', lineHeight: 1 }}>
                                    {Number(ratingSummary.average_rating).toFixed(1)}
                                </div>
                                <StarBar value={ratingSummary.average_rating} size={18} />
                                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                                    {ratingSummary.total_reviews} đánh giá
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                {[5, 4, 3, 2, 1].map(star => {
                                    const count = ratingSummary.distribution?.[star] ?? 0;
                                    const pct = ratingSummary.total_reviews > 0
                                        ? (count / ratingSummary.total_reviews) * 100 : 0;
                                    return (
                                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                            <span style={{ fontSize: 11, width: 8, color: '#888' }}>{star}</span>
                                            <span style={{ fontSize: 11, color: '#f39c12' }}>★</span>
                                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: '#f39c12', borderRadius: 3 }} />
                                            </div>
                                            <span style={{ fontSize: 10, color: '#888', width: 16 }}>{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Danh sách reviews */}
                    {loadingReviews ? (
                        <div style={{ textAlign: 'center', color: '#888', padding: 12, fontSize: 13 }}>Đang tải đánh giá...</div>
                    ) : reviews.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#a0aab4', padding: '16px 0', fontSize: 13 }}>
                            <p style={{ margin: 0 }}>Chưa có đánh giá nào.</p>
                            <p style={{ margin: '4px 0 0', fontSize: 11 }}>Hãy là người đầu tiên đánh giá địa điểm này!</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {reviews.map(rev => (
                                <div key={rev.review_id} className="review-card">
                                    <div className="review-header">
                                        <img
                                            src={rev.user.avatar_url || `${defaultAvatar}${encodeURIComponent(rev.user.full_name)}`}
                                            alt={rev.user.full_name}
                                            className="reviewer-avatar"
                                            onError={e => { e.target.src = `${defaultAvatar}${encodeURIComponent(rev.user.full_name)}`; }}
                                        />
                                        <div className="reviewer-info">
                                            <h4 className="reviewer-name">{rev.user.full_name}</h4>
                                            <div className="review-meta">
                                                <StarBar value={rev.rating} size={13} />
                                                <span className="review-time">{timeAgo(rev.created_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {rev.comment && (
                                        <p className="review-text">{rev.comment}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Thông báo sau submit */}
                    {submitMsg && (
                        <p style={{ textAlign: 'center', fontSize: 13, marginTop: 8, color: submitMsg.startsWith('✅') ? '#00b894' : '#e17055' }}>
                            {submitMsg}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Write Review Modal / Overlay ── */}
            {showReviewForm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    zIndex: 100, display: 'flex', alignItems: 'flex-end'
                }}>
                    <div style={{
                        background: '#fff', width: '100%', borderRadius: '20px 20px 0 0',
                        padding: '24px 20px 32px', boxSizing: 'border-box'
                    }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 800 }}>Viết đánh giá</h3>

                        {/* Chọn sao */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
                            {[1, 2, 3, 4, 5].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setMyRating(s)}
                                    style={{
                                        fontSize: 32, background: 'none', border: 'none',
                                        cursor: 'pointer', padding: 4,
                                        opacity: s <= myRating ? 1 : 0.3,
                                        color: '#f39c12', transition: 'opacity 0.15s'
                                    }}
                                >★</button>
                            ))}
                        </div>

                        {/* Bình luận */}
                        <textarea
                            placeholder="Chia sẻ cảm nhận của bạn về địa điểm này..."
                            value={myComment}
                            onChange={e => setMyComment(e.target.value)}
                            rows={4}
                            style={{
                                width: '100%', borderRadius: 12, border: '1.5px solid #e0e0e0',
                                padding: '10px 12px', fontSize: 14, resize: 'none',
                                boxSizing: 'border-box', fontFamily: 'inherit',
                                outline: 'none', marginBottom: 12
                            }}
                        />

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => { setShowReviewForm(false); setSubmitMsg(''); }}
                                style={{
                                    flex: 1, padding: '12px 0', borderRadius: 12,
                                    border: '1.5px solid #ddd', background: '#f5f5f5',
                                    fontSize: 15, fontWeight: 600, cursor: 'pointer'
                                }}
                            >Huỷ</button>
                            <button
                                onClick={handleSubmitReview}
                                disabled={submitting}
                                style={{
                                    flex: 2, padding: '12px 0', borderRadius: 12,
                                    border: 'none', background: '#00bcd4',
                                    color: '#fff', fontSize: 15, fontWeight: 700,
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                    opacity: submitting ? 0.7 : 1
                                }}
                            >
                                {submitting ? 'Đang lưu...' : 'Gửi đánh giá'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Bottom Fixed Bar ── */}
            <div className="bottom-fixed-bar">
                <button className="btn-write-review" onClick={() => { setShowReviewForm(true); setSubmitMsg(''); }}>
                    Write Review
                </button>
            </div>

            {/* ── Map Overlay ── */}
            {showMap && (() => {
                const lat = location.latitude || location.lat;
                const lng = location.longitude || location.lng;
                const name = encodeURIComponent(location.location_name || 'Địa điểm');
                // Dùng tọa độ nếu có, fallback về tên địa điểm
                const mapSrc = (lat && lng)
                    ? `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`
                    : `https://maps.google.com/maps?q=${name}&output=embed`;
                const mapsLink = (lat && lng)
                    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${name}`;

                return (
                    <div className="map-overlay-backdrop" onClick={() => setShowMap(false)}>
                        <div className="map-overlay-sheet" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="map-overlay-header">
                                <div className="map-overlay-title">
                                    <i className="fas fa-map-marker-alt" style={{ color: '#0abde3' }}></i>
                                    {location.location_name}
                                </div>
                                <button className="map-overlay-close" onClick={() => setShowMap(false)}>✕</button>
                            </div>

                            {/* Map iframe */}
                            <iframe
                                className="map-overlay-iframe"
                                title="map"
                                src={mapSrc}
                                allowFullScreen
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />

                            {/* Footer */}
                            <div className="map-overlay-footer">
                                <button
                                    className="map-open-btn"
                                    onClick={() => window.open(mapsLink, '_blank')}
                                >
                                    <i className="fas fa-external-link-alt"></i>
                                    Mở Google Maps
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default LocationDetailScreen;
