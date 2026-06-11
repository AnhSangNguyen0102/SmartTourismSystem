// src/components/MainTabs/LocationScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Map, Globe, Activity, Sparkles } from 'lucide-react';
import MapComponent from '../Map/MapComponent';
import { API_BASE } from '../../config/api';
import './LocationScreen.css';

const getWeatherEmoji = (code) => {
    if (code === 0) return '☀️';
    if (code >= 1 && code <= 3) return '🌤️';
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 55) return '🌦️';
    if (code >= 61 && code <= 65) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌧️';
    if (code >= 95 && code <= 99) return '⛈️';
    return '🌡️';
};

const LocationScreen = ({
    userLocation,
    userInfo,
    hiddenTasks,
    handleHiddenTaskClick,
    campaigns = [],
    onCampaignClick = null,
    isGuest,
    fetchActiveTasks
}) => {
    const mapComponentRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [weatherInfo, setWeatherInfo] = useState(null);
    const [showMapSearch, setShowMapSearch] = useState(false);
    const [showMapMenu, setShowMapMenu] = useState(false);
    const [mapStyle, setMapStyle] = useState('voyager');
    const [showHiddenTasks, setShowHiddenTasks] = useState(true);

    const fetchWeather = async (lat, lon) => {
        try {
            const res = await fetch(`${API_BASE}/api/discovery/weather?lat=${lat}&lon=${lon}`);
            if (res.ok) {
                const data = await res.json();
                setWeatherInfo(data);
            }
        } catch (err) {
            console.error("Weather fetch failed", err);
        }
    };

    const fetchSearchResults = async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        setSearchLoading(true);
        try {
            const coordsParam = userLocation ? `&lat=${userLocation.lat}&lon=${userLocation.lng}` : '';
            const res = await fetch(`${API_BASE}/api/discovery/geocode/search?q=${encodeURIComponent(query)}${coordsParam}`);
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data);
            }
        } catch (err) {
            console.error("Geocoding search failed", err);
        } finally {
            setSearchLoading(false);
        }
    };

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (searchQuery.trim()) {
                fetchSearchResults(searchQuery);
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery]);

    useEffect(() => {
        if (userLocation?.lat && userLocation?.lng) {
            fetchWeather(userLocation.lat, userLocation.lng);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userLocation]);

    return (
        <div className="location-screen-full">
            <MapComponent 
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
            />

            {/* Overlays on top of the map */}
            <div className="map-overlay-top" style={{ alignItems: 'center' }}>
                <div className="map-title-box">
                    <h1 className="map-title-main">Hành trình</h1>
                    <div className="map-title-sub">
                        <span className="dot-blue"></span> BẢN ĐỒ TRỰC TUYẾN
                    </div>
                </div>
                <div className="map-top-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {weatherInfo && (
                        <div className="weather-hud-pill" style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--st-surface)',
                            border: '2.5px solid var(--game-border-color)',
                            borderRadius: '20px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: 'var(--st-text)',
                            boxShadow: '0 3px 0 var(--game-border-color)',
                        }} title={`Thời tiết: ${weatherInfo.condition || 'Bình thường'}`}>
                            <span>{getWeatherEmoji(weatherInfo.weathercode)}</span>
                            <span>{Math.round(weatherInfo.temp)}°C</span>
                        </div>
                    )}
                    <button className="map-circle-btn" onClick={() => setShowMapSearch(!showMapSearch)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </button>
                    <button className="map-circle-btn" onClick={() => setShowMapMenu(!showMapMenu)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                </div>
            </div>

            {/* Quick Search Overlay */}
            {showMapSearch && (
                <div className="map-search-overlay" style={{
                    position: 'absolute',
                    top: '150px',
                    left: '20px',
                    right: '20px',
                    background: 'var(--st-surface)',
                    border: '3px solid var(--game-border-color)',
                    borderRadius: '16px',
                    padding: '12px',
                    boxShadow: '0 5px 0 var(--game-border-color)',
                    zIndex: 20
                }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Gõ địa điểm tìm kiếm..."
                            style={{
                                flex: 1,
                                border: '2.5px solid var(--game-border-color)',
                                borderRadius: '10px',
                                padding: '8px 12px',
                                outline: 'none',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                background: 'var(--st-surface-muted)',
                                color: 'var(--st-text)'
                            }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                        <button
                            onClick={() => fetchSearchResults(searchQuery)}
                            style={{
                                background: 'var(--game-yellow)',
                                border: '2.5px solid var(--game-border-color)',
                                borderRadius: '10px',
                                padding: '8px 14px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                color: '#2c3e50',
                                boxShadow: '0 3px 0 var(--game-border-color)'
                            }}
                        >
                            Tìm
                        </button>
                    </div>
                    
                    {/* Search results list */}
                    {(searchResults.length > 0 || searchLoading) && (
                        <div style={{
                            marginTop: '10px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                        }}>
                            {searchLoading ? (
                                <div style={{ textAlign: 'center', padding: '10px', fontWeight: 'bold', color: '#7f8c8d' }}>Đang tìm kiếm...</div>
                            ) : (
                                searchResults.map((item) => (
                                    <div
                                        key={item.place_id}
                                        onClick={() => {
                                            if (item.lat && item.lon) {
                                                mapComponentRef.current?.flyToLocation(item.lat, item.lon, item.display_name.split(',')[0]);
                                                setShowMapSearch(false);
                                                setSearchResults([]);
                                            }
                                        }}
                                        className="map-search-result-item"
                                    >
                                        📍 {item.display_name}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Map Menu Overlay */}
            {showMapMenu && (
                <div className="map-menu-overlay" style={{ position: 'absolute', top: '150px', right: '20px', background: 'var(--st-surface)', border: '2px solid var(--st-border)', borderRadius: '16px', padding: '12px', boxShadow: 'var(--st-shadow)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '180px' }}>
                    <button onClick={() => { setMapStyle('voyager'); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', color: '#3b82f6', fontWeight: mapStyle === 'voyager' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Map size={16} /> Bản đồ game
                    </button>
                    <button onClick={() => { setMapStyle('satellite'); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', color: 'var(--st-text)', fontWeight: mapStyle === 'satellite' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Globe size={16} /> Bản đồ Vệ tinh
                    </button>
                    <button onClick={() => { setMapStyle('traffic'); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', color: 'var(--st-text)', fontWeight: mapStyle === 'traffic' ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Activity size={16} /> Bản đồ Tối (Giao thông)
                    </button>
                    <button onClick={() => { setShowHiddenTasks(!showHiddenTasks); setShowMapMenu(false); }} style={{ background: 'none', border: 'none', textAlign: 'left', fontSize: '14px', cursor: 'pointer', padding: '5px', color: '#8e44ad', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={16} /> {showHiddenTasks ? 'Ẩn nhiệm vụ' : 'Hiện nhiệm vụ ẩn'}
                    </button>
                </div>
            )}

            <button className="map-my-location-btn" onClick={() => {
                mapComponentRef.current?.flyToUserLocation();
            }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
            </button>
        </div>
    );
};

export default LocationScreen;
