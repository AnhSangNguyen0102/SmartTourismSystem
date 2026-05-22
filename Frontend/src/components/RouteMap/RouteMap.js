import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './RouteMap.css';

// Feature 2: Player Avatar
import { createPlayerAvatarIcon } from '../PlayerAvatar/PlayerAvatar';

// Feature 3: Fog of War
import { createFogLayer } from '../FogOfWar/FogOfWar';

// --- Fix Leaflet default icon issue with bundlers ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function decodePolyline(encoded) {
    const points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
        let shift = 0, result = 0, byte;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lat += (result & 1) ? ~(result >> 1) : (result >> 1);

        shift = 0; result = 0;
        do {
            byte = encoded.charCodeAt(index++) - 63;
            result |= (byte & 0x1f) << shift;
            shift += 5;
        } while (byte >= 0x20);
        lng += (result & 1) ? ~(result >> 1) : (result >> 1);
        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}

// --- Màu sắc cho các route theo ngày ---
const DAY_COLORS = ['#6C5CE7', '#00B894', '#E17055', '#0984E3', '#FDCB6E', '#E84393'];

function createStopIcon(stop) {
    const isCompleted = stop.status === 'COMPLETED';
    const isVisiting = stop.status === 'VISITING';
    const statusClass = isCompleted ? 'completed' : (isVisiting ? 'visiting' : 'pending');
    
    const shortName = stop.location_name.length > 20 ? stop.location_name.substring(0, 20) + '...' : stop.location_name;

    return L.divIcon({
        className: 'custom-block-marker',
        html: `<div class="block-marker ${statusClass}">
                   <span class="block-order">${stop.stop_order}</span>
                   <span class="block-name">${shortName}</span>
               </div>`,
        iconSize: [null, null], // Let CSS set size
    });
}

/**
 * Format khoảng cách cho hiển thị
 */
function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
}

const RouteMap = ({ stops = [], routes = [], hiddenTasks = [], userLocation = null, onStopClick, onHiddenTaskClick = null, user = null }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const routeLayerRef = useRef(null);
    const fogLayerRef = useRef(null);
    const checkinCirclesRef = useRef([]);
    const userLineRef = useRef(null);
    const distanceBadgeRef = useRef(null);
    const hiddenTasksLayerRef = useRef(null);
    const userLayerRef = useRef(null);

    // Feature 3: Fog toggle — mặc định BẬT, người dùng có thể tắt
    const [fogEnabled, setFogEnabled] = useState(true);

    const onStopClickRef = useRef(onStopClick);
    const onHiddenTaskClickRef = useRef(onHiddenTaskClick);
    useEffect(() => {
        onStopClickRef.current = onStopClick;
        onHiddenTaskClickRef.current = onHiddenTaskClick;
    }, [onStopClick, onHiddenTaskClick]);

    // 1. VẼ LỘ TRÌNH TĨNH
    useEffect(() => {
        if (stops.length === 0 || !mapRef.current) return;

        // Destroy previous map if it exists
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
            checkinCirclesRef.current = [];
            userLineRef.current = null;
            distanceBadgeRef.current = null;
        }

        const startLat = parseFloat(stops[0].latitude);
        const startLng = parseFloat(stops[0].longitude);

        const map = L.map(mapRef.current, {
            zoomControl: false,
            attributionControl: false,
            zoomAnimation: false,
            fadeAnimation: false,
            markerZoomAnimation: false
        }).setView([startLat, startLng], 13);
        mapInstanceRef.current = map;

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19
        }).addTo(map);

        routeLayerRef.current = L.layerGroup().addTo(map);
        hiddenTasksLayerRef.current = L.layerGroup().addTo(map);
        userLayerRef.current = L.layerGroup().addTo(map);

        const routeLayer = routeLayerRef.current;
        const allLatLngs = [];

        stops.forEach((stop) => {
            const lat = parseFloat(stop.latitude);
            const lng = parseFloat(stop.longitude);
            if (isNaN(lat) || isNaN(lng)) return;
            
            allLatLngs.push([lat, lng]);

            const icon = createStopIcon(stop);
            const marker = L.marker([lat, lng], { icon }).addTo(map);

            marker.on('click', () => {
                if (onStopClickRef.current) {
                    onStopClickRef.current(stop);
                }
            });

            // Vòng tròn bán kính check-in
            const checkinRadius = stop.checkin_radius || 100;
            const circleColor = stop.status === 'COMPLETED' ? '#00b894' :
                                stop.status === 'VISITING'  ? '#f39c12' : '#0984e3';
            
            const circle = L.circle([lat, lng], {
                radius: checkinRadius,
                color: circleColor,
                fillColor: circleColor,
                fillOpacity: stop.status === 'COMPLETED' ? 0.08 : 0.12,
                weight: stop.status === 'COMPLETED' ? 1 : 1.5,
                dashArray: stop.status === 'COMPLETED' ? null : '6 4',
                className: 'checkin-radius-circle',
            }).addTo(map);

            checkinCirclesRef.current.push(circle);
        });

        // Vẽ routes từ data (nếu có polyline_data)
        routes.forEach((route, index) => {
            if (route.polyline_data) {
                try {
                    const coords = decodePolyline(route.polyline_data);
                    const color = DAY_COLORS[index % DAY_COLORS.length];
                    L.polyline(coords, {
                        color,
                        weight: 4,
                        opacity: 0.8,
                        lineJoin: 'round'
                    }).addTo(routeLayer);
                } catch(e) {}
            }
        });

        // Initialize Hidden Tasks Layer
        const tasksLayer = hiddenTasksLayerRef.current;
        hiddenTasks.forEach((task) => {
            const lat = parseFloat(task.latitude);
            const lng = parseFloat(task.longitude);
            
            let iconHtml = task.task_type === 'CHEST' ? '🎁' : '🔮';
            let markerClass = `hidden-task-marker ${task.task_type?.toLowerCase()} rarity-${task.rarity?.toLowerCase()}`;

            const taskMarker = L.marker([lat, lng], {
                icon: L.divIcon({
                    className: markerClass,
                    html: `<div class="quest-icon-inner">${iconHtml}</div>`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                })
            });

            taskMarker.on('click', () => { if (onHiddenTaskClickRef.current) onHiddenTaskClickRef.current(task); });
            taskMarker.addTo(tasksLayer);
        });

        if (allLatLngs.length > 0) {
            map.fitBounds(L.latLngBounds(allLatLngs), { padding: [50, 50], animate: false });
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.off();
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(stops), JSON.stringify(routes), JSON.stringify(hiddenTasks)]);

    // 2. VẼ VỊ TRÍ NGƯỜI DÙNG & TÍNH KHOẢNG CÁCH
    useEffect(() => {
        if (!mapInstanceRef.current || !userLocation) return;
        const map = mapInstanceRef.current;
        const userLayer = userLayerRef.current;

        userLayer.clearLayers();

        const avatarIcon = createPlayerAvatarIcon(user);
        L.marker([userLocation.lat, userLocation.lng], { icon: avatarIcon, zIndexOffset: 1000 }).addTo(userLayer);

        // -- Cập nhật sương mù --
        if (fogEnabled) {
            if (!fogLayerRef.current) {
                fogLayerRef.current = createFogLayer(stops, userLocation).addTo(map);
            } else {
                fogLayerRef.current.updateUserLocation(userLocation);
            }
        } else if (fogLayerRef.current) {
            fogLayerRef.current.remove();
            fogLayerRef.current = null;
        }

        // Đường nối nét đứt đến trạm PENDING tiếp theo
        const nextStop = stops.find(s => s.status === 'PENDING');
        if (userLineRef.current) userLineRef.current.remove();
        if (distanceBadgeRef.current) distanceBadgeRef.current.remove();

        if (nextStop) {
            const destLat = parseFloat(nextStop.latitude);
            const destLng = parseFloat(nextStop.longitude);

            userLineRef.current = L.polyline([[userLocation.lat, userLocation.lng], [destLat, destLng]], {
                color: '#f39c12', weight: 2.5, dashArray: '8 6', opacity: 0.7
            }).addTo(map);

            const dist = map.distance([userLocation.lat, userLocation.lng], [destLat, destLng]);
            const midLat = (userLocation.lat + destLat) / 2;
            const midLng = (userLocation.lng + destLng) / 2;

            distanceBadgeRef.current = L.marker([midLat, midLng], {
                icon: L.divIcon({
                    className: 'distance-badge-container',
                    html: `<div class="distance-badge"><span>${formatDistance(dist)}</span></div>`,
                    iconSize: [60, 30]
                })
            }).addTo(map);
        }
    }, [userLocation, stops, fogEnabled, user]);

    return (
        <div className="route-map-container" style={{ width: '100%', marginBottom: '20px' }}>
            <div className="route-map-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span className="map-icon" style={{ fontSize: '20px' }}>🗺️</span>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#2d3436', fontWeight: 'bold' }}>Bản đồ lộ trình</h3>
                <div style={{ flex: 1 }}></div>
                <button 
                    className={`fog-toggle-btn ${fogEnabled ? 'active' : ''}`}
                    onClick={() => setFogEnabled(!fogEnabled)}
                    title="Bật/Tắt Sương Mù"
                >
                    {fogEnabled ? '🌫️' : '☀️'}
                </button>
            </div>
            
            <div className="route-map-wrapper" style={{ height: '380px', width: '100%', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.08)', background: '#e0e0e0' }}>
                <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
            </div>

            <div className="route-map-footer" style={{ marginTop: '8px', textAlign: 'center' }}>
                {routes.length > 0 && (
                    <span className="legend-hint" style={{ fontSize: '12px', color: '#b2bec3' }}>📍 Nhấn vào đường đi hoặc rương báu để tương tác</span>
                )}
            </div>

            <style>{`
                @keyframes pulse-glow-ring {
                    0% { transform: scale(0.6); opacity: 0.6; }
                    50% { transform: scale(1.3); opacity: 0.1; }
                    100% { transform: scale(0.6); opacity: 0.6; }
                }
                /* Bổ sung hiệu ứng tỏa sóng đỏ cho user */
                @keyframes pulse-red {
                    0% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7); }
                    70% { box-shadow: 0 0 0 15px rgba(231, 76, 60, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0); }
                }
            `}</style>

        </div>
    );
};

export default RouteMap;
