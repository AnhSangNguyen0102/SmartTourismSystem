import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { showAlert } from '../../platform/dialog';
import './LocationDetailMap.css';

const DETAIL_TILE_STYLE = {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
    },
};
const USER_LOCATION_ZOOM = 18;

const LocationDetailMap = ({ stop, userLocation }) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const layersRef = useRef(null);
    const hasInitialViewRef = useRef(false);

    // 1. Initialize map once on mount
    useEffect(() => {
        if (!mapRef.current) return;

        const map = L.map(mapRef.current, {
            zoomControl: true,
            attributionControl: true,
            zoomSnap: 1,
            zoomDelta: 1,
            bounceAtZoomLimits: false,
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: true
        });
        mapInstanceRef.current = map;

        L.tileLayer(DETAIL_TILE_STYLE.url, DETAIL_TILE_STYLE.options).addTo(map);

        layersRef.current = L.layerGroup().addTo(map);

        setTimeout(() => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.invalidateSize();
            }
        }, 300);

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
            layersRef.current = null;
            hasInitialViewRef.current = false;
        };
    }, []);

    // 2. Draw content whenever stop or userLocation changes
    useEffect(() => {
        const map = mapInstanceRef.current;
        const layers = layersRef.current;
        if (!map || !layers || !stop) return;

        layers.clearLayers();
        const lat = parseFloat(stop.latitude);
        const lng = parseFloat(stop.longitude);
        const hasStopCoords = !isNaN(lat) && !isNaN(lng);

        if (!hasInitialViewRef.current) {
            if (hasStopCoords) {
                map.setView([lat, lng], 14, { animate: false });
                hasInitialViewRef.current = true;
            } else if (userLocation?.lat && userLocation?.lng) {
                map.setView([userLocation.lat, userLocation.lng], 14, { animate: false });
                hasInitialViewRef.current = true;
            }
        }

        if (hasStopCoords) {
            const stopIcon = L.divIcon({
                className: 'detail-stop-icon detail-game-stop-icon',
                html: `<div class="detail-game-pin detail-place-pin"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
                iconSize: [42, 52],
                iconAnchor: [21, 46]
            });
            L.marker([lat, lng], { icon: stopIcon }).bindPopup(`<b>${stop.location_name}</b>`, {
                className: 'detail-game-popup',
            }).addTo(layers);
        }

        if (userLocation && userLocation.lat && userLocation.lng) {
            const userIcon = L.divIcon({
                className: 'detail-user-icon detail-game-user-icon',
                html: `<div class="detail-game-user-dot"></div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).bindPopup('Vị trí của bạn', {
                className: 'detail-game-popup',
            }).addTo(layers);

            // Draw line
            if (hasStopCoords) {
                L.polyline([[userLocation.lat, userLocation.lng], [lat, lng]], {
                    color: '#243447',
                    weight: 10,
                    opacity: 0.3,
                    lineCap: 'round'
                }).addTo(layers);
                L.polyline([[userLocation.lat, userLocation.lng], [lat, lng]], {
                    color: '#ffd32d',
                    weight: 5,
                    dashArray: '10 10',
                    opacity: 0.95,
                    lineCap: 'round',
                    className: 'detail-quest-line'
                }).addTo(layers);
            }
        }

    }, [stop, userLocation]);

    const focusUserLocation = async () => {
        const map = mapInstanceRef.current;
        if (map && userLocation?.lat && userLocation?.lng) {
            const currentZoom = map.getZoom();
            const targetZoom = Math.max(currentZoom, USER_LOCATION_ZOOM);
            map.flyTo([userLocation.lat, userLocation.lng], targetZoom, { animate: true, duration: 0.8 });
        } else {
            await showAlert("Vui lòng bật định vị GPS và chờ trong giây lát.");
        }
    };

    return (
        <div className="location-detail-map-wrapper">
            <div ref={mapRef} className="location-detail-map" />
            <button
                type="button"
                className="location-detail-my-location-btn"
                onClick={focusUserLocation}
                aria-label="Đến vị trí của bạn"
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
            </button>
        </div>
    );
};

export default LocationDetailMap;
