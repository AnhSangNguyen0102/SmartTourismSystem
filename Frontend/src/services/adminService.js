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
        throw new Error(body.detail || body.message || 'Thao tác quản trị thất bại.');
    }
    return body;
};

export const adminService = {
    getPendingEnterprises: () => request('/api/admin/enterprises/pending'),
    approveEnterprise: (enterpriseId) => request(`/api/admin/enterprises/${enterpriseId}/approve`, { method: 'POST' }),
    rejectEnterprise: (enterpriseId, reason) => request(`/api/admin/enterprises/${enterpriseId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    }),
    getLocationSubmissions: () => request('/api/admin/location-submissions'),
    getLocationSubmissionDetail: (submissionId) => request(`/api/admin/location-submissions/${submissionId}`),
    approveLocationSubmission: (submissionId) => request(`/api/admin/location-submissions/${submissionId}/approve`, { method: 'POST' }),
    rejectLocationSubmission: (submissionId, reason) => request(`/api/admin/location-submissions/${submissionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    }),
    getApprovedLocations: () => request('/api/admin/locations'),
    getAdminStats: () => request('/api/admin/stats'),
    getAdminUsers: () => request('/api/admin/users'),
    grantPoints: (userId, amount) => request('/api/admin/grant-points', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, amount }),
    }),
    updateUserPoints: (userId, action, amount = null) => request(`/api/admin/users/${userId}/points`, {
        method: 'PATCH',
        body: JSON.stringify({ action, amount }),
    }),
    updateUserStatus: (userId, action) => request(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
    }),
    updateUserRole: (userId, role) => request(`/api/admin/update-role/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
    }),
    getReports: () => request('/api/admin/social/reports'),
    deletePost: (postId) => request(`/api/admin/social/posts/${postId}`, { method: 'DELETE' }),
};
