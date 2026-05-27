import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';

const request = async (path, options = {}) => {
    const token = await storageGet('access_token');
    if (!token) {
        throw new Error('Phiên đăng nhập đã hết hạn.');
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(body.detail || body.message || 'Không thể tải dữ liệu doanh nghiệp.');
    }
    return body;
};

export const enterpriseService = {
    getEnterpriseProfile: async () => {
        try {
            return await request('/api/enterprise/profile');
        } catch (error) {
            if (error.message?.includes('Chưa có hồ sơ')) return null;
            throw error;
        }
    },
    submitEnterpriseProfile: (payload) => request('/api/enterprise/register-profile', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    updateEnterpriseProfile: (payload) => request('/api/auth/update-profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
    }),
    getEnterpriseEvents: () => request('/api/enterprise/events'),
    createEnterpriseEvent: (payload) => request('/api/enterprise/events', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    deleteEnterpriseEvent: (eventId) => request(`/api/enterprise/events/${eventId}`, { method: 'DELETE' }),
    getEnterpriseDailyFlow: () => request('/api/enterprise/stats/daily-flow'),
    getEnterpriseLocationSubmissions: () => request('/api/enterprise/location-submissions'),
    getEnterpriseLocations: () => request('/api/enterprise/locations'),
};
