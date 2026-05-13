import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './RouteMap.css';

// --- Fix Leaflet default icon issue with bundlers ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// --- Decode Google/OSRM encoded polyline (Algorithm from Google) ---
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

// --- Custom icon cho marker ---
function createStopIcon(order, status) {
    const bgColor = status === 'COMPLETED' ? '#00b894' :
                    status === 'VISITING'  ? '#f39c12' : '#0984e3';
    return L.divIcon({
        className: 'custom-marker',
        html: `<div class="marker-pin" style="background:${bgColor}"><span>${order}</span></div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        popupAnchor: [0, -45],
    });
}

const RouteMap = ({ stops = [], routes = [], userLocation = null }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const userMarkerRef = useRef(null);

    // useEffect 1: Khởi tạo map + vẽ routes/stops (CHỈ khi stops hoặc routes thay đổi)
    useEffect(() => {
        if (!mapRef.current || stops.length === 0) return;

        // Destroy previous map if it exists
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
            userMarkerRef.current = null;
        }

        // --- Init map ---
        const map = L.map(mapRef.current, {
            zoomControl: true,
            attributionControl: true,
        });
        mapInstanceRef.current = map;

        // OpenStreetMap tiles (miễn phí)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18,
        }).addTo(map);

        const allLatLngs = [];

        // --- Vẽ routes (polyline) ---
        routes.forEach((route) => {
            // Tìm stop tương ứng để lấy day_order cho màu
            const fromStop = stops.find(s => s.stop_id === route.from_stop_id);
            const dayIndex = fromStop ? (fromStop.day_order || 1) - 1 : 0;
            const color = DAY_COLORS[dayIndex % DAY_COLORS.length];

            let routeCoords;
            try {
                routeCoords = decodePolyline(route.polyline_data);
            } catch (e) {
                // Fallback: nếu polyline không decode được, vẽ đường thẳng
                const toStop = stops.find(s => s.stop_id === route.to_stop_id);
                if (fromStop && toStop) {
                    routeCoords = [
                        [parseFloat(fromStop.latitude), parseFloat(fromStop.longitude)],
                        [parseFloat(toStop.latitude), parseFloat(toStop.longitude)]
                    ];
                } else {
                    return;
                }
            }

            if (routeCoords.length > 0) {
                const polyline = L.polyline(routeCoords, {
                    color: color,
                    weight: 4,
                    opacity: 0.8,
                    dashArray: null,
                    lineJoin: 'round',
                });
                polyline.addTo(map);

                // Popup hiển thị thông tin route
                const midIdx = Math.floor(routeCoords.length / 2);
                const midPoint = routeCoords[midIdx];
                L.popup({ closeButton: false, autoClose: true, className: 'route-popup' })
                    .setLatLng(midPoint)
                    .setContent(`<b>${route.distance} km</b> · ${route.travel_time} phút`);
                
                // Nhấn vào route sẽ hiện popup
                polyline.on('click', (e) => {
                    L.popup({ className: 'route-popup' })
                        .setLatLng(e.latlng)
                        .setContent(`<b>${route.distance} km</b> · ${route.travel_time} phút`)
                        .openOn(map);
                });

                routeCoords.forEach(c => allLatLngs.push(c));
            }
        });

        // --- Vẽ markers cho các trạm dừng ---
        stops.forEach((stop) => {
            const lat = parseFloat(stop.latitude);
            const lng = parseFloat(stop.longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            const icon = createStopIcon(stop.stop_order, stop.status);
            const marker = L.marker([lat, lng], { icon }).addTo(map);

            const priceStr = stop.min_price
                ? `${new Intl.NumberFormat('vi-VN').format(stop.min_price)}đ`
                : '';

            marker.bindPopup(`
                <div class="stop-popup">
                    <strong>${stop.location_name}</strong><br/>
                    <span>🕐 ${stop.arrival_time?.slice(0, 5)} - ${stop.departure_time?.slice(0, 5)}</span>
                    ${priceStr ? `<br/><span>💰 ${priceStr}</span>` : ''}
                    ${stop.status === 'COMPLETED' ? '<br/><span style="color:#00b894">✅ Đã check-in</span>' : ''}
                </div>
            `);

            allLatLngs.push([lat, lng]);
        });

        // --- Auto zoom để thấy toàn bộ route ---
        if (allLatLngs.length > 0) {
            const bounds = L.latLngBounds(allLatLngs);
            map.fitBounds(bounds, { padding: [40, 40] });
        }

        // Cleanup
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
                userMarkerRef.current = null;
            }
        };
    }, [stops, routes]);

    // useEffect 2: Cập nhật vị trí user RIÊNG BIỆT (không destroy map)
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Xóa marker cũ nếu có
        if (userMarkerRef.current) {
            userMarkerRef.current.remove();
            userMarkerRef.current = null;
        }

        // Thêm marker mới nếu có vị trí user
        if (userLocation && userLocation.lat && userLocation.lng) {
            const userIcon = L.divIcon({
                className: 'user-location-icon',
                html: `<div style="background-color: #F44336; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(244, 67, 54, 0.6); position: relative;">
                        <div style="position: absolute; top: -4px; left: -4px; right: -4px; bottom: -4px; border-radius: 50%; border: 2px solid #F44336; opacity: 0.5;"></div>
                       </div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
            });
            userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
                .bindPopup('📍 Vị trí của bạn')
                .addTo(map);
        }
    }, [userLocation]);

    if (stops.length === 0) return null;

    return (
        <div className="route-map-container">
            <div className="route-map-header">
                <span className="map-icon">🗺️</span>
                <h3>Bản đồ lộ trình</h3>
            </div>
            <div className="route-map-wrapper">
                <div ref={mapRef} className="route-map" />
            </div>
            {routes.length > 0 && (
                <div className="route-map-legend">
                    <span className="legend-hint">📍 Nhấn vào đường để xem khoảng cách & thời gian</span>
                </div>
            )}
        </div>
    );
};

export default RouteMap;
