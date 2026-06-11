// src/components/MainTabs/FavoritesScreen.jsx
import React, { useState, useEffect } from 'react';
import { Heart, MapPin } from 'lucide-react';
import { storageGet } from '../../platform/storage';
import { API_BASE } from '../../config/api';
import { FAVORITE_LOCATIONS_CHANGED, getFavoriteLocations } from '../../services/locationFavoriteService';
import './FavoritesScreen.css';

const FavoritesScreen = ({ onOpenLocationDetail }) => {
    const [savedList, setSavedList] = useState([]);
    const [savedLocations, setSavedLocations] = useState([]);
    const [loadingSaved, setLoadingSaved] = useState(true);

    const fetchSavedPosts = async () => {
        setLoadingSaved(true);
        try {
            const token = await storageGet('access_token');
            if (!token) return;
            const res = await fetch(`${API_BASE}/api/social/saved-posts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSavedList(data);
            }
        } catch (error) {
            console.error('Error fetching saved posts:', error);
        } finally {
            setLoadingSaved(false);
        }
    };

    useEffect(() => {
        fetchSavedPosts();
    }, []);

    useEffect(() => {
        const loadLocations = () => getFavoriteLocations().then(setSavedLocations);
        loadLocations();
        window.addEventListener(FAVORITE_LOCATIONS_CHANGED, loadLocations);
        return () => window.removeEventListener(FAVORITE_LOCATIONS_CHANGED, loadLocations);
    }, []);

    return (
        <div className="favorites-screen-wrapper" style={{ padding: '16px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '24px', fontWeight: '950', color: 'var(--st-text)', marginBottom: '16px', textShadow: '1.5px 1.5px 0 var(--st-bg)' }}>Yêu Thích Đã Lưu</h2>
            {savedLocations.length > 0 && (
                <div className="favorite-location-list">
                    <h3>Địa điểm yêu thích</h3>
                    {savedLocations.map((location) => (
                        <button
                            type="button"
                            key={location.location_id}
                            className="favorite-location-card"
                            onClick={() => onOpenLocationDetail?.(location)}
                        >
                            <div
                                className="favorite-location-image"
                                style={location.image_url ? { backgroundImage: `url(${location.image_url})` } : undefined}
                            >
                                {!location.image_url && <MapPin size={24} />}
                            </div>
                            <span>
                                <strong>{location.location_name}</strong>
                                <small><MapPin size={11} /> {location.address}</small>
                            </span>
                            <Heart size={18} fill="currentColor" />
                        </button>
                    ))}
                </div>
            )}
            {loadingSaved ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="loader-hud" style={{ margin: '0 auto 12px' }}></div>
                    <p style={{ fontWeight: 'bold', color: 'var(--st-text-muted)' }}>Đang tải danh mục đã lưu...</p>
                </div>
            ) : savedList.length === 0 && savedLocations.length === 0 ? (
                <div className="cartoon-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--st-text-muted)', fontWeight: 'bold' }}>
                    <Heart size={48} style={{ color: '#ff4757', marginBottom: '12px' }} />
                    <p>Danh sách trống!</p>
                    <p style={{ fontSize: '11px', fontWeight: 'normal', marginTop: '4px' }}>Hãy lưu các địa điểm và bài đăng thú vị để xem lại tại đây.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '80px' }}>
                    {savedList.map(post => (
                        <div key={post.post_id} className="cartoon-card" style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <img 
                                    src={post.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.profiles?.full_name}`} 
                                    alt="avatar" 
                                    style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid var(--game-border-color)' }} 
                                />
                                <div>
                                    <h4 style={{ fontSize: '12px', fontWeight: '800', color: 'var(--st-text)' }}>{post.profiles?.full_name}</h4>
                                    {post.location_name && (
                                        <span style={{ fontSize: '9px', color: 'var(--st-text-muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                            <MapPin size={8} /> {post.location_name}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--st-text)', lineHeight: '1.4' }}>{post.caption}</p>
                            {post.image_url && (
                                <img 
                                    src={post.image_url.includes('|') ? post.image_url.split('|')[0] : (post.image_url.startsWith('data:image') ? post.image_url : post.image_url.split(',')[0])} 
                                    alt="preview" 
                                    style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '12px', border: '2px solid var(--game-border-color)', marginTop: '10px' }} 
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FavoritesScreen;
