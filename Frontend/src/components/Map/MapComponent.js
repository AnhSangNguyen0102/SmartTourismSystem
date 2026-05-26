import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createPlayerAvatarIcon } from '../PlayerAvatar/PlayerAvatar';

const MapComponent = forwardRef(({ stops = [], userLocation = null, hiddenTasks = [], onHiddenTaskClick = null, fullScreen = false, mapStyle = 'voyager', showHiddenTasks = true, user = null }, ref) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markersLayer = useRef(null);
    const tileLayerRef = useRef(null);
    const hasAutoFitRef = useRef(false);
    const prevStopsKeyRef = useRef('');
    const hasUserInteractedRef = useRef(false);

    useImperativeHandle(ref, () => ({
        flyToUserLocation: () => {
            if (mapInstance.current && userLocation?.lat && userLocation?.lng) {
                mapInstance.current.flyTo([userLocation.lat, userLocation.lng], 16, { animate: true, duration: 1.5 });
            } else {
                alert("Vui lòng bật định vị GPS và chờ trong giây lát.");
            }
        }
    }));

    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        const centerLat = stops.length > 0 ? parseFloat(stops[0].latitude) : 10.762622;
        const centerLng = stops.length > 0 ? parseFloat(stops[0].longitude) : 106.660172;

        mapInstance.current = L.map(mapRef.current, {
            zoomControl: !fullScreen, // Hide zoom control if full screen for cleaner look
            zoomAnimation: false,
            fadeAnimation: false,
            markerZoomAnimation: false
        }).setView([centerLat, centerLng], 13);
        // Initial tile layer setup
        tileLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(mapInstance.current);

        markersLayer.current = L.layerGroup().addTo(mapInstance.current);

        const markUserInteracted = () => {
            hasUserInteractedRef.current = true;
        };
        mapInstance.current.on('zoomstart', markUserInteracted);
        mapInstance.current.on('dragstart', markUserInteracted);

        setTimeout(() => {
            mapInstance.current?.invalidateSize();
        }, 400);

        return () => {
            if (mapInstance.current) {
                mapInstance.current.off('zoomstart');
                mapInstance.current.off('dragstart');
                mapInstance.current.remove();
                mapInstance.current = null;
            }
            markersLayer.current = null;
            tileLayerRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fullScreen]); // stops is removed from dependencies to prevent recreating map when stops reference changes

    useEffect(() => {
        if (!tileLayerRef.current) return;
        
        let url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        if (mapStyle === 'satellite') {
            url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        } else if (mapStyle === 'traffic') {
            // Using dark mode as a placeholder for traffic view
            url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        }
        
        tileLayerRef.current.setUrl(url);
    }, [mapStyle]);

    useEffect(() => {
        if (!mapInstance.current || !markersLayer.current) return;

        markersLayer.current.clearLayers();
        const bounds = [];
        const nextStop = stops.find((stop) => stop.status === 'PENDING' || stop.status === 'VISITING');

        stops.forEach((stop, index) => {
            if (!stop.latitude || !stop.longitude) return;

            const lat = parseFloat(stop.latitude);
            const lng = parseFloat(stop.longitude);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return;

            let markerColor = '#2196F3';
            if (stop.status === 'COMPLETED') markerColor = '#4CAF50';
            else if (nextStop && stop.stop_id === nextStop.stop_id) markerColor = '#FF9800';

            L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div style="background-color:${markerColor};color:white;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;font-weight:bold;font-size:12px;box-shadow:0 2px 5px rgba(0,0,0,0.3);">${index + 1}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12],
                }),
            })
                .bindPopup(`<b>${stop.location_name}</b><br/>${stop.arrival_time ? `Đến: ${stop.arrival_time.slice(0, 5)}` : ''}`)
                .addTo(markersLayer.current);

            bounds.push([lat, lng]);
        });

        // User location marker with shared game avatar style
        if (userLocation?.lat && userLocation?.lng) {
            L.marker([userLocation.lat, userLocation.lng], {
                icon: createPlayerAvatarIcon(user),
            })
                .bindPopup('Vị trí của bạn')
                .addTo(markersLayer.current);

            bounds.push([userLocation.lat, userLocation.lng]);
        }

        if (showHiddenTasks) {
            hiddenTasks.forEach((task) => {
                if (!task.latitude || !task.longitude) return;

                const lat = parseFloat(task.latitude);
                const lng = parseFloat(task.longitude);
                if (Number.isNaN(lat) || Number.isNaN(lng)) return;

                const rarityColors = {
                    COMMON: '#7f8c8d',
                    RARE: '#2980b9',
                    EPIC: '#8e44ad',
                    LEGENDARY: '#f1c40f',
                };
                const color = rarityColors[task.rarity] || '#7f8c8d';

                let iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C12 3 12 8 12 8s0-5 4.5-5a2.5 2.5 0 0 1 0 5z"/></svg>';
                let label = 'Rương kho báu';
                if (task.task_type === 'DYNAMIC_QUEST') {
                    iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>';
                    label = 'Sự kiện đặc biệt';
                }

                const marker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'hidden-task-icon',
                        html: `<div class="glowing-chest" style="background-color:${color};border:2px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px ${color};cursor:pointer;animation:float-effect 2s infinite ease-in-out;position:relative;">${iconHtml}<div style="position:absolute;width:40px;height:40px;border-radius:50%;border:2px dashed ${color};top:-6px;left:-6px;animation:spin-circle 8s infinite linear;"></div></div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                    }),
                });

                marker.bindPopup(`<b>${task.title || label}</b><br/><small>${task.rarity} - Click để xem!</small>`);
                marker.on('click', () => {
                    if (onHiddenTaskClick) onHiddenTaskClick(task);
                });
                marker.addTo(markersLayer.current);
                bounds.push([lat, lng]);
            });
        }

        // Chỉ auto-fit lần đầu hoặc khi danh sách điểm dừng thay đổi,
        // tránh giật zoom khi GPS/userLocation cập nhật liên tục.
        const stopsKey = stops
            .map((stop) => `${stop.stop_id || stop.location_id || stop.location_name}-${stop.latitude}-${stop.longitude}`)
            .join('|');
        const shouldAutoFitByData = !hasAutoFitRef.current || prevStopsKeyRef.current !== stopsKey;
        const shouldAutoFit = shouldAutoFitByData && !hasUserInteractedRef.current;

        if (bounds.length > 0 && shouldAutoFit) {
            mapInstance.current.fitBounds(bounds, { padding: [40, 40], animate: false });
            hasAutoFitRef.current = true;
            prevStopsKeyRef.current = stopsKey;
        }
    }, [stops, userLocation, hiddenTasks, onHiddenTaskClick, showHiddenTasks, user]);

    return (
        <div
            style={fullScreen ? {
                height: '100%',
                width: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 1
            } : {
                height: '350px',
                width: '100%',
                marginBottom: '25px',
                position: 'relative',
                background: '#e0e0e0',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
        >
            <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
        </div>
    );
});

export default MapComponent;
