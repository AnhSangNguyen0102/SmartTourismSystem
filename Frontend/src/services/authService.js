// Gọi API đăng nhập, đăng ký.
import { API_BASE } from '../config/api';
import { storageGet, storageRemove, storageSet } from '../platform/storage';

const API_URL = `${API_BASE}/api/auth`;

const getDeviceId = () => (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown-device');

export const authService = {
    register: async (fullName, email, password, role, enterpriseProfile = null) => {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                full_name: fullName,
                email,
                password,
                register_type: 'EMAIL',
                role,
                ...(enterpriseProfile || {}),
            }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.detail || 'Đăng ký thất bại hoặc email đã tồn tại');
        return body;
    },

    login: async (email, password) => {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password,
                device_id: getDeviceId(),
            }),
        });

        if (!response.ok) throw new Error('Sai email hoặc mật khẩu');

        const data = await response.json();
        await Promise.all([
            storageSet('access_token', data.access_token),
            storageSet('refresh_token', data.refresh_token),
        ]);
        return data;
    },

    logout: async () => {
        const refreshToken = await storageGet('refresh_token');

        if (refreshToken) {
            await fetch(`${API_URL}/logout`, {
                method: 'POST',
                headers: { 'Authorization-Refresh': refreshToken },
            });
        }

        await Promise.all([
            storageRemove('access_token'),
            storageRemove('refresh_token'),
        ]);
    },

    getCurrentUser: async () => {
        const token = await storageGet('access_token');
        if (!token) return null;

        const response = await fetch(`${API_URL}/me`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            await storageRemove('access_token');
            return null;
        }

        return response.json();
    },

    loginWithGoogle: async (googleToken) => {
        const response = await fetch(`${API_URL}/google-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: googleToken,
                device_id: getDeviceId(),
            }),
        });

        if (!response.ok) throw new Error('Đăng nhập Google thất bại');

        const data = await response.json();
        await Promise.all([
            storageSet('access_token', data.access_token),
            storageSet('refresh_token', data.refresh_token),
        ]);
        return data;
    },
};
