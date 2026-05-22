import { useState, useEffect } from 'react';

export const useGeolocation = (targetLat, targetLng) => {
  const [state, setState] = useState({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: true,
  });
  const [distance, setDistance] = useState(null);

  // Client-side Haversine distance calculator
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Returns distance in meters
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: 'Trình duyệt không hỗ trợ định vị GPS.', loading: false }));
      return;
    }

    const handleSuccess = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      
      setState({
        latitude,
        longitude,
        accuracy,
        error: null,
        loading: false,
      });

      if (targetLat !== undefined && targetLng !== undefined) {
        const dist = calculateDistance(latitude, longitude, targetLat, targetLng);
        setDistance(dist);
      }
    };

    const handleError = (error) => {
      setState((prev) => ({ ...prev, error: error.message, loading: false }));
    };

    // Start watchPosition for real-time tracking
    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [targetLat, targetLng]);

  return { ...state, distance };
};
