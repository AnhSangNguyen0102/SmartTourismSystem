// Gọi API lấy gợi ý, lưu lộ trình.
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";
const API_URL = `${API_BASE}/api/trips`;

const formatError = (err, defaultMsg) => {
    let message = defaultMsg;
    if (typeof err.detail === 'string') {
        message = err.detail;
    } else if (Array.isArray(err.detail)) {
        message = err.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ');
    } else if (err.detail) {
        message = JSON.stringify(err.detail);
    } else if (err.message) {
        message = err.message;
    }
    return message;
};

export const getTripHistory = async (token) => {
    try {
        const response = await fetch(`${API_URL}/history`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error("Lỗi khi lấy lịch sử chuyến đi");
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        return [];
    }
};

export const completeTrip = async (itineraryId, token) => {
    try {
        const response = await fetch(`${API_URL}/${itineraryId}/complete`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(formatError(err, "Lỗi khi hoàn thành chuyến đi"));
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const cancelTrip = async (itineraryId, token) => {
    try {
        const response = await fetch(`${API_URL}/${itineraryId}/cancel`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(formatError(err, "Lỗi khi hủy chuyến đi"));
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const createTrip = async (payload, token) => {
    try {
        const response = await fetch(`${API_URL}/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json();
            // Handle Pydantic validation errors (detail is array)
            let message = "Lỗi khi tạo chuyến đi";
            if (typeof err.detail === 'string') {
                message = err.detail;
            } else if (Array.isArray(err.detail)) {
                message = err.detail.map(e => e.msg || e.message || JSON.stringify(e)).join('; ');
            } else if (err.detail) {
                message = JSON.stringify(err.detail);
            }
            throw new Error(message);
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const getTripDetail = async (itineraryId, token) => {
    try {
        const response = await fetch(`${API_URL}/${itineraryId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error("Lỗi khi lấy chi tiết chuyến đi");
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const sendTracking = async (payload, token) => {
    try {
        const response = await fetch(`${API_URL}/tracking`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(formatError(err, "Lỗi khi gửi tracking"));
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const checkinStop = async (stopId, payload, token) => {
    try {
        const response = await fetch(`${API_URL}/${stopId}/checkin`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(formatError(err, "Lỗi khi check-in"));
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};

export const getDeviationStatus = async (itineraryId, token) => {
    try {
        const response = await fetch(`${API_URL}/${itineraryId}/deviation-status`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error("Lỗi khi lấy trạng thái lệch hướng");
        }
        return await response.json();
    } catch (error) {
        console.error(error);
        throw error;
    }
};