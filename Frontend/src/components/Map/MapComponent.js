import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createPlayerAvatarIcon } from '../PlayerAvatar/PlayerAvatar';
import { showAlert } from '../../platform/dialog';
import './MapComponent.css';

const TILE_STYLES = {
    voyager: {
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        options: {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20,
        },
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: '&copy; Esri',
            maxZoom: 20,
        },
    },
    traffic: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        options: {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20,
        },
    },
};

const getTileStyleConfig = (mapStyle) => TILE_STYLES[mapStyle] || TILE_STYLES.voyager;
const USER_LOCATION_ZOOM = 18;

const MapComponent = forwardRef(({ stops = [], userLocation = null, hiddenTasks = [], onHiddenTaskClick = null, campaigns = [], onCampaignClick = null, fullScreen = false, mapStyle = 'voyager', showHiddenTasks = true, user = null }, ref) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markersLayer = useRef(null);
    const tileLayerRef = useRef(null);
    const hasInitialViewRef = useRef(false);

    useImperativeHandle(ref, () => ({
        flyToUserLocation: async () => {
            if (mapInstance.current && userLocation?.lat && userLocation?.lng) {
                const currentZoom = mapInstance.current.getZoom();
                const targetZoom = Math.max(currentZoom, USER_LOCATION_ZOOM);
                mapInstance.current.flyTo([userLocation.lat, userLocation.lng], targetZoom, { animate: true, duration: 0.8 });
            } else {
                await showAlert("Vui lòng bật định vị GPS và chờ trong giây lát.");
            }
        },
        flyToLocation: (lat, lon, name) => {
            if (mapInstance.current && lat && lon) {
                const targetZoom = Math.max(mapInstance.current.getZoom(), USER_LOCATION_ZOOM - 2);
                mapInstance.current.flyTo([parseFloat(lat), parseFloat(lon)], targetZoom, { animate: true, duration: 1.2 });
                
                L.popup({ className: 'game-map-popup' })
                    .setLatLng([parseFloat(lat), parseFloat(lon)])
                    .setContent(`<b>${name || 'Địa điểm tìm kiếm'}</b>`)
                    .openOn(mapInstance.current);
            }
        }
    }));

    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        let centerLat = 10.762622;
        let centerLng = 106.660172;
        let initialZoom = 13;

        if (userLocation?.lat && userLocation?.lng) {
            centerLat = userLocation.lat;
            centerLng = userLocation.lng;
            initialZoom = 15;
            hasInitialViewRef.current = true;
        } else if (stops.length > 0) {
            const stopLat = parseFloat(stops[0].latitude);
            const stopLng = parseFloat(stops[0].longitude);
            if (!isNaN(stopLat) && !isNaN(stopLng)) {
                centerLat = stopLat;
                centerLng = stopLng;
                initialZoom = 13;
                hasInitialViewRef.current = true;
            }
        }

        mapInstance.current = L.map(mapRef.current, {
            zoomControl: !fullScreen, // Hide zoom control if full screen for cleaner look
            zoomSnap: 1,
            zoomDelta: 1,
            bounceAtZoomLimits: false,
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: true
        }).setView([centerLat, centerLng], initialZoom);
        const initialTileStyle = getTileStyleConfig(mapStyle);
        tileLayerRef.current = L.tileLayer(initialTileStyle.url, initialTileStyle.options).addTo(mapInstance.current);

        markersLayer.current = L.layerGroup().addTo(mapInstance.current);

        setTimeout(() => {
            mapInstance.current?.invalidateSize();
        }, 400);

        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
            markersLayer.current = null;
            tileLayerRef.current = null;
            hasInitialViewRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fullScreen]); // stops is removed from dependencies to prevent recreating map when stops reference changes

    useEffect(() => {
        if (!mapInstance.current) return;
        if (!hasInitialViewRef.current) {
            if (userLocation?.lat && userLocation?.lng) {
                mapInstance.current.setView([userLocation.lat, userLocation.lng], 15);
                hasInitialViewRef.current = true;
            } else if (stops.length > 0) {
                const stopLat = parseFloat(stops[0].latitude);
                const stopLng = parseFloat(stops[0].longitude);
                if (!isNaN(stopLat) && !isNaN(stopLng)) {
                    mapInstance.current.setView([stopLat, stopLng], 13);
                    hasInitialViewRef.current = true;
                }
            }
        }
    }, [userLocation, stops]);

    useEffect(() => {
        if (!mapInstance.current) return;

        if (tileLayerRef.current) {
            mapInstance.current.removeLayer(tileLayerRef.current);
        }

        const tileStyle = getTileStyleConfig(mapStyle);
        tileLayerRef.current = L.tileLayer(tileStyle.url, tileStyle.options).addTo(mapInstance.current);
        tileLayerRef.current.bringToBack();
    }, [mapStyle]);

    useEffect(() => {
        if (!mapInstance.current || !markersLayer.current) return;

        markersLayer.current.clearLayers();
        const nextStop = stops.find((stop) => stop.status === 'PENDING' || stop.status === 'VISITING');

        stops.forEach((stop, index) => {
            if (!stop.latitude || !stop.longitude) return;

            const lat = parseFloat(stop.latitude);
            const lng = parseFloat(stop.longitude);
            if (Number.isNaN(lat) || Number.isNaN(lng)) return;

            let markerColor = '#1e90ff';
            let markerStatusClass = '';
            if (stop.status === 'COMPLETED') {
                markerColor = '#2ed573';
                markerStatusClass = 'status-completed';
            } else if (nextStop && stop.stop_id === nextStop.stop_id) {
                markerColor = '#ff9f1a';
                markerStatusClass = 'status-next';
            }

            L.marker([lat, lng], {
                icon: L.divIcon({
                    className: 'custom-div-icon game-stop-icon',
                    html: `<div class="game-stop-marker ${markerStatusClass}" style="--marker-color:${markerColor};">${index + 1}</div>`,
                    iconSize: [40, 48],
                    iconAnchor: [20, 42],
                }),
            })
                .bindPopup(`<b>${stop.location_name}</b><br/>${stop.arrival_time ? `Đến: ${stop.arrival_time.slice(0, 5)}` : ''}`, {
                    className: 'game-map-popup',
                })
                .addTo(markersLayer.current);

        });

        // User location marker with shared game avatar style
        if (userLocation?.lat && userLocation?.lng) {
            L.marker([userLocation.lat, userLocation.lng], {
                icon: createPlayerAvatarIcon(user),
            })
                .bindPopup('Vị trí của bạn', {
                    className: 'game-map-popup',
                })
                .addTo(markersLayer.current);

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

                let iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2-2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C12 3 12 8 12 8s0-5 4.5-5a2.5 2.5 0 0 1 0 5z"/></svg>';
                let label = 'Rương kho báu';
                if (task.task_type === 'DYNAMIC_QUEST') {
                    iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>';
                    label = 'Sự kiện đặc biệt';
                }

                const marker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'hidden-task-icon game-hidden-task-icon',
                        html: `<div class="game-hidden-task-marker" style="--task-color:${color};">${iconHtml}<div class="game-hidden-task-orbit"></div></div>`,
                        iconSize: [58, 58],
                        iconAnchor: [29, 29],
                    }),
                });

                marker.bindPopup(`<b>${task.title || label}</b><br/><small>${task.rarity} - Click để xem!</small>`, {
                    className: 'game-map-popup',
                });
                marker.on('click', () => {
                    if (onHiddenTaskClick) onHiddenTaskClick(task);
                });
                marker.addTo(markersLayer.current);
            });
        }

        // Vẽ các chiến dịch doanh nghiệp (Campaigns) công khai hoạt động
        if (campaigns && campaigns.length > 0) {
            campaigns.forEach((campaign) => {
                if (!campaign.latitude || !campaign.longitude) return;

                const lat = parseFloat(campaign.latitude);
                const lng = parseFloat(campaign.longitude);
                if (Number.isNaN(lat) || Number.isNaN(lng)) return;

                const color = '#e67e22'; // Màu cam ấm áp cho chiến dịch tiếp thị

                // Icon Loa phát thanh / Megaphone
                const iconHtml = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M12 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7M16 5l-4 4v6l4 4M21 9c.6.8.6 2.2 0 3M19 6c1.7 1.8 1.7 4.2 0 6"/></svg>';
                const label = 'Chiến dịch Doanh nghiệp';

                const marker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'campaign-icon game-campaign-icon',
                        html: `<div class="game-hidden-task-marker" style="--task-color:${color}; border-radius: 8px;">${iconHtml}<div class="game-hidden-task-orbit" style="border: 2.5px dashed ${color};"></div></div>`,
                        iconSize: [58, 58],
                        iconAnchor: [29, 29],
                    }),
                });

                marker.bindPopup(`<b>${campaign.title || label}</b><br/><small>${campaign.quest_type} - Nhấn để tham gia!</small>`, {
                    className: 'game-map-popup',
                });
                marker.on('click', () => {
                    if (onCampaignClick) onCampaignClick(campaign);
                });
                marker.addTo(markersLayer.current);
            });
        }
    }, [stops, userLocation, hiddenTasks, onHiddenTaskClick, showHiddenTasks, user, campaigns, onCampaignClick]);

    return (
        <div className={`game-map-shell ${fullScreen ? 'full' : 'card'} map-style-${mapStyle}`}>
            <div className="game-map-frame">
                <div ref={mapRef} className="game-map-canvas" />
            </div>
        </div>
    );
});

export default MapComponent;
