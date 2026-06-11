import { Capacitor } from '@capacitor/core';

const explicitApiUrl = process.env.REACT_APP_API_URL;

const normalizeUrl = (url) => url?.replace(/\/$/, '');

const isLocalOrPrivateHost = (hostname) => (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
);

const assertSecureInternetApiUrl = (url) => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' && !isLocalOrPrivateHost(parsed.hostname)) {
            throw new Error('Public internet API URL must use HTTPS.');
        }
    } catch (error) {
        if (error.message === 'Public internet API URL must use HTTPS.') throw error;
    }
};

const getApiBase = () => {
    if (explicitApiUrl) {
        const normalized = normalizeUrl(explicitApiUrl);
        assertSecureInternetApiUrl(normalized);
        return normalized;
    }

    if (Capacitor.isNativePlatform()) {
        throw new Error(
            'Missing REACT_APP_API_URL. Native APK requires Frontend/.env with LAN backend URL.'
        );
    }

    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname || 'localhost';
    const inferredUrl = `${protocol}//${hostname}:8000`;
    
    // Nếu đang chạy trên web thật (không phải localhost), tự động gọi API từ Render
    if (!isLocalOrPrivateHost(hostname)) {
        return 'https://smarttourismsystem-3lq6.onrender.com';
    }
    
    assertSecureInternetApiUrl(inferredUrl);
    return inferredUrl;
};

export const API_BASE = getApiBase();
export const WS_BASE = API_BASE.replace(/^http/, 'ws');
