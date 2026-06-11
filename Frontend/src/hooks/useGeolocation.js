import { useState, useEffect } from 'react';
import { startWatchingPosition } from '../platform/location';

export const useGeolocation = (targetLat, targetLng) => {
  const [state, setState] = useState({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: true,
  });
  const [distance, setDistance] = useState(null);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    const updateCoordinates = (lat, lng, accuracy = 10) => {
      setState({
        latitude: lat,
        longitude: lng,
        accuracy,
        error: null,
        loading: false,
      });

      if (targetLat !== undefined && targetLng !== undefined) {
        const dist = calculateDistance(lat, lng, targetLat, targetLng);
        setDistance(dist);
      }
    };

    // If mock GPS is active initially, load the mock coordinates immediately
    if (window.isMockGpsActive && typeof window.mockLatitude === 'number') {
      updateCoordinates(window.mockLatitude, window.mockLongitude);
    }

    const handleMockUpdate = (e) => {
      const { lat, lng } = e.detail;
      updateCoordinates(lat, lng);
    };

    const handleMockDisabled = () => {
      setState(prev => ({ ...prev, loading: true }));
    };

    window.addEventListener('mock_location_update', handleMockUpdate);
    window.addEventListener('mock_location_disabled', handleMockDisabled);

    const stopWatching = startWatchingPosition({
      onSuccess: (position) => {
        if (window.isMockGpsActive) return; // Skip if mock GPS is active

        const { latitude, longitude, accuracy } = position;
        updateCoordinates(latitude, longitude, accuracy);
      },
      onError: (geoError) => {
        if (window.isMockGpsActive) return; // Skip if mock GPS is active

        setState((prev) => ({
          ...prev,
          error: geoError?.message || 'Không thể lấy dữ liệu GPS.',
          loading: false,
        }));
      },
      options: {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    });

    return () => {
      if (typeof stopWatching === 'function') {
        stopWatching();
      }
      window.removeEventListener('mock_location_update', handleMockUpdate);
      window.removeEventListener('mock_location_disabled', handleMockDisabled);
    };
  }, [targetLat, targetLng]);

  return { ...state, distance };
};
