import { API_BASE } from '../config/api';

export const createPlanningSession = async (payload, token) => {
    try {
        const response = await fetch(`${API_BASE}/api/planning/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Lỗi khi tạo phiên lập kế hoạch");
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const getRecommendations = async (payload, token = null) => {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(`${API_BASE}/api/suggestions/recommend`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Lỗi khi lấy gợi ý địa điểm");
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};
