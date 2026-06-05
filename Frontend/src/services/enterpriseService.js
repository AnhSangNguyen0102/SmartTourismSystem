import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';

const getAuthHeaders = async () => {
    const token = await storageGet('access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
};

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

    // --- VOUCHER MANAGEMENT ---
    getEnterpriseVouchers: async () => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE}/api/vouchers/manage/me`, { headers });
        if (!response.ok) throw new Error('Không thể tải danh sách voucher');
        return response.json();
    },

    createEnterpriseVoucher: async (voucherData) => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE}/api/vouchers/`, {
            method: 'POST',
            headers,
            body: JSON.stringify(voucherData)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Lỗi tạo voucher');
        return data;
    },

    deleteEnterpriseVoucher: async (voucherId) => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE}/api/vouchers/${voucherId}`, {
            method: 'DELETE',
            headers
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Lỗi xóa voucher');
        return data;
    },
};
