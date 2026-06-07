import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config/api';
import { storageGet } from '../../platform/storage';
import { showToast } from '../../platform/dialog';
import { isFavoriteLocation, toggleFavoriteLocation } from '../../services/locationFavoriteService';
import LocationDetailMap from '../../components/LocationDetailMap/LocationDetailMap';
import './LocationDetailScreen.css';

// ── Helper ──────────────────────────────────────────────────────────────────
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
    const [externalImages, setExternalImages] = useState([]);
    const [loadingExternalImages, setLoadingExternalImages] = useState(false);
    const [failedImageUrls, setFailedImageUrls] = useState([]);
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
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);

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
        let active = true;
        setImages([]);
        setExternalImages([]);
        setLoadingExternalImages(false);
        setFailedImageUrls([]);
        setCoverIdx(0);
        setRatingSummary(null);
        setReviews([]);

        const providedImageExists = [
            location.image_url,
            location.cover_image,
            location.image,
            location.thumbnail_url,
        ].some(Boolean);

        const loadImages = async () => {
            let databaseImages = [];
            try {
                const response = await fetch(`${API_BASE}/api/v1/locations/${location.location_id}/images`);
                if (response.ok) databaseImages = await response.json();
            } catch (error) {
                console.error('Lỗi tải ảnh địa điểm:', error);
            }

            if (!active) return;
            if (databaseImages.length > 0) {
                setImages(databaseImages);
                return;
            }
            if (providedImageExists) return;

            setLoadingExternalImages(true);
            try {
                const response = await fetch(`${API_BASE}/api/v1/locations/${location.location_id}/external-images`);
                const data = response.ok ? await response.json() : null;
                if (active && data?.eligible && data.images?.length > 0) {
                    setExternalImages(data.images);
                }
            } catch (error) {
                console.error('Lỗi tìm ảnh Wikimedia Commons:', error);
            } finally {
                if (active) setLoadingExternalImages(false);
            }
        };
        loadImages();

        // Đại sứ
        setLoadingAmbassadors(true);
        fetch(`${API_BASE}/api/social/locations/${location.location_id}/ambassador`)
            .then(r => r.ok ? r.json() : [])
            .then(setAmbassadors)
            .catch(() => {})
            .finally(() => setLoadingAmbassadors(false));

        // Reviews
        fetchReviews();

        return () => { active = false; };
    }, [
        location?.location_id,
        location?.image_url,
        location?.cover_image,
        location?.image,
        location?.thumbnail_url,
        fetchReviews,
    ]);

    useEffect(() => {
        let active = true;
        isFavoriteLocation(location).then((saved) => {
            if (active) setIsFavorite(saved);
        });
        return () => { active = false; };
    }, [location]);

    const handleToggleFavorite = async () => {
        if (favoriteLoading) return;
        setFavoriteLoading(true);
        try {
            const saved = await toggleFavoriteLocation(location);
            setIsFavorite(saved);
            showToast(saved ? 'Đã thêm địa điểm vào Yêu thích.' : 'Đã bỏ địa điểm khỏi Yêu thích.', 'success');
        } catch (error) {
            showToast(error.message || 'Không thể cập nhật địa điểm yêu thích.', 'error');
        } finally {
            setFavoriteLoading(false);
        }
    };

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
    const providedImages = [
        location.image_url,
        location.cover_image,
        location.image,
        location.thumbnail_url,
    ].filter(Boolean);
    const externalImageUrls = externalImages.map(image => image.url).filter(Boolean);
    const usingExternalImages = dbImages.length === 0 && providedImages.length === 0;
    const candidateImages = dbImages.length > 0
        ? dbImages
        : providedImages.length > 0
            ? providedImages
            : externalImageUrls;
    const allImages = candidateImages.filter(url => !failedImageUrls.includes(url));
    const bannerIdx = allImages[coverIdx] ? coverIdx : 0;
    const bannerUrl = allImages[bannerIdx] || null;
    const activeExternalImage = usingExternalImages && bannerUrl
        ? externalImages.find(image => image.url === bannerUrl)
        : null;

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

    const avgRating = ratingSummary?.total_reviews > 0 ? ratingSummary.average_rating : null;
    const totalReviews = ratingSummary?.total_reviews ?? 0;
    const matchScore = location.score != null ? Number(location.score) : null;
    const matchScoreText = matchScore == null
        ? null
        : matchScore <= 1
            ? `${Math.round(matchScore * 100)}% phù hợp`
            : `${matchScore.toFixed(1)} điểm phù hợp`;

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
                className={`detail-banner ${bannerUrl ? '' : 'detail-banner--empty'}`}
            >
                {bannerUrl && (
                    <img
                        className="detail-banner-image"
                        src={bannerUrl}
                        alt={location.location_name}
                        onError={() => setFailedImageUrls(current => (
                            current.includes(bannerUrl) ? current : [...current, bannerUrl]
                        ))}
                    />
                )}
                {!bannerUrl && (
                    <div className="detail-banner-placeholder">
                        <i className="fas fa-map-marker-alt"></i>
                        <strong>{location.location_name}</strong>
                        <span>{loadingExternalImages ? 'Đang tìm ảnh địa điểm...' : 'Địa điểm chưa có ảnh'}</span>
                    </div>
                )}
                {activeExternalImage && (
                    <a
                        className={`external-image-credit ${allImages.length > 1 ? 'with-thumbnails' : ''}`}
                        href={activeExternalImage.source_url}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Ảnh: {activeExternalImage.author || 'Wikimedia Commons'}
                        {activeExternalImage.license ? ` · ${activeExternalImage.license}` : ''}
                    </a>
                )}
                <div className="banner-overlay">
                    <button type="button" className="banner-btn back-btn" onClick={onBack} aria-label="Quay lại">
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <button
                        type="button"
                        className={`banner-btn fav-btn ${isFavorite ? 'active' : ''}`}
                        onClick={handleToggleFavorite}
                        disabled={favoriteLoading}
                        aria-label={isFavorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
                    >
                        <i className={`${isFavorite ? 'fas' : 'far'} fa-heart`}></i>
                    </button>
                </div>

                {/* Thumbnail strip nếu có nhiều ảnh */}
                {allImages.length > 1 && (
                    <div className="thumbnail-strip">
                        {allImages.map((url, idx) => (
                            <div
                                key={idx}
                                onClick={() => setCoverIdx(idx)}
                                className={`thumbnail-item ${idx === bannerIdx ? 'active' : ''}`}
                                style={{ backgroundImage: `url(${url})` }}
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
                                <span className="loc-rating-star">★</span>
                                {Number(avgRating).toFixed(1)}
                                {totalReviews > 0 && (
                                    <span className="loc-rating-count">
                                        ({totalReviews})
                                    </span>
                                )}
                            </span>
                        )}
                        {matchScoreText && (
                            <span className="loc-match-score">
                                <i className="fas fa-bullseye"></i> {matchScoreText}
                            </span>
                        )}
                    </div>
                </div>

                {/* Giá & giờ */}
                {(priceText || openTime) && (
                    <div className="loc-info-row">
                        {openTime && (
                            <span>
                                <i className="fas fa-clock loc-info-icon loc-info-icon--blue"></i>
                                Mở cửa: {openTime}{closeTime ? ` – ${closeTime}` : ''}
                            </span>
                        )}
                        {priceText && (
                            <span>
                                <i className="fas fa-tag loc-info-icon loc-info-icon--green"></i>
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
                <div className="section ambassador-section">
                    <h3 className="section-title ambassador-title">
                        👑 Đại sứ địa phương
                    </h3>
                    {loadingAmbassadors ? (
                        <div className="section-loading-text">Đang tải...</div>
                    ) : ambassadors.length === 0 ? (
                        <div className="section-empty-text">
                            <span>Chưa có Đại sứ địa phương ở đây! 🗺️</span>
                            <p className="section-empty-sub">
                                Hãy là người check-in đầu tiên để chiếm lĩnh danh hiệu này!
                            </p>
                        </div>
                    ) : (
                        <div className="ambassador-list">
                            {ambassadors.map((amb, index) => {
                                const medals = ['🥇', '🥈', '🥉', '🎖️', '🎖️'];
                                return (
                                    <div key={amb.user_id} className="ambassador-item">
                                        <div className="ambassador-item-left">
                                            <span className="ambassador-medal">{medals[index] || '🎖️'}</span>
                                            <img src={amb.avatar} alt={amb.name} className="ambassador-avatar" />
                                            <span className="ambassador-name">{amb.name}</span>
                                        </div>
                                        <span className="ambassador-count">
                                            {amb.checkin_count} check-in
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>


                {/* ── Rating & Reviews ── */}
                <div className="section section--reviews">
                    <h3 className="section-title">Rating &amp; Reviews</h3>

                    {/* Rating tổng */}
                    {ratingSummary && ratingSummary.total_reviews > 0 && (
                        <div className="rating-summary-box">
                            <div className="rating-summary-left">
                                <div className="rating-big-number">
                                    {Number(ratingSummary.average_rating).toFixed(1)}
                                </div>
                                <StarBar value={ratingSummary.average_rating} size={18} />
                                <div className="rating-count-label">
                                    {ratingSummary.total_reviews} đánh giá
                                </div>
                            </div>
                            <div className="rating-bars">
                                {[5, 4, 3, 2, 1].map(star => {
                                    const count = ratingSummary.distribution?.[star] ?? 0;
                                    const pct = ratingSummary.total_reviews > 0
                                        ? (count / ratingSummary.total_reviews) * 100 : 0;
                                    return (
                                        <div key={star} className="rating-bar-row">
                                            <span className="rating-bar-label">{star}</span>
                                            <span className="rating-bar-star">★</span>
                                            <div className="rating-bar-track">
                                                <div className="rating-bar-fill" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="rating-bar-count">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Danh sách reviews */}
                    {loadingReviews ? (
                        <div className="section-loading-text">Đang tải đánh giá...</div>
                    ) : reviews.length === 0 ? (
                        <div className="section-empty-text">
                            <p style={{ margin: 0 }}>Chưa có đánh giá nào.</p>
                            <p className="section-empty-sub" style={{ margin: '4px 0 0' }}>Hãy là người đầu tiên đánh giá địa điểm này!</p>
                        </div>
                    ) : (
                        <div className="reviews-list">
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
                        <p className={`submit-msg ${submitMsg.startsWith('✅') ? 'submit-msg--success' : 'submit-msg--error'}`}>
                            {submitMsg}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Write Review Modal / Overlay ── */}
            {showReviewForm && (
                <div className="review-modal-overlay">
                    <div className="review-modal-sheet">
                        <h3 className="review-modal-title">Viết đánh giá</h3>

                        {/* Chọn sao */}
                        <div className="star-picker">
                            {[1, 2, 3, 4, 5].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setMyRating(s)}
                                    className={`star-picker-btn ${s <= myRating ? 'active' : ''}`}
                                >★</button>
                            ))}
                        </div>

                        {/* Bình luận */}
                        <textarea
                            placeholder="Chia sẻ cảm nhận của bạn về địa điểm này..."
                            value={myComment}
                            onChange={e => setMyComment(e.target.value)}
                            rows={4}
                            className="review-textarea"
                        />

                        <div className="modal-actions">
                            <button
                                onClick={() => { setShowReviewForm(false); setSubmitMsg(''); }}
                                className="btn-modal-cancel"
                            >Huỷ</button>
                            <button
                                onClick={handleSubmitReview}
                                disabled={submitting}
                                className="btn-modal-submit"
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
                const mapsLink = (lat && lng)
                    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`
                    : `https://www.openstreetmap.org/search?query=${name}`;

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

                            <LocationDetailMap
                                stop={{
                                    ...location,
                                    latitude: lat,
                                    longitude: lng,
                                }}
                            />

                            {/* Footer */}
                            <div className="map-overlay-footer">
                                <button
                                    className="map-open-btn"
                                    onClick={() => window.open(mapsLink, '_blank')}
                                >
                                    <i className="fas fa-external-link-alt"></i>
                                    Mở OpenStreetMap
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
