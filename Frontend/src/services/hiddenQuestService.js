// src/services/hiddenQuestService.js
// API service layer for the Hidden Quest & Dynamic Event gamification system

import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';

const BASE_URL = API_BASE;

const getAuthHeader = async () => {
    const token = await storageGet('access_token');
    if (!token) {
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    return { 'Authorization': `Bearer ${token}` };
};

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

/**
 * Ping GPS location to backend.
 * Backend may spawn new hidden chests or dynamic quests nearby.
 * @param {number} lat - latitude
 * @param {number} lng - longitude
 * @returns {Promise<object>} - spawn result
 */
export const pingLocation = async (lat, lng) => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/v1/hidden/ping-location`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        },
        body: JSON.stringify({ latitude: lat, longitude: lng })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Lỗi ping vị trí'));
    }
    return response.json();
};

/**
 * Fetch the list of active hidden tasks (chests + events) for the logged-in player.
 * @returns {Promise<Array>} - list of active tasks
 */
export const getActiveTasks = async () => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/v1/hidden/active`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        }
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Lỗi tải danh sách nhiệm vụ ẩn'));
    }
    return response.json();
};

/**
 * Claim / open a treasure chest.
 * @param {string} spawnId - UUID of the player_hidden_tasks entry
 * @param {number} lat - current player latitude
 * @param {number} lng - current player longitude
 * @returns {Promise<object>} - reward details
 */
export const claimChest = async (spawnId, lat, lng) => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/v1/hidden/claim-chest`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        },
        body: JSON.stringify({
            spawn_id: spawnId,
            latitude: lat,
            longitude: lng
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Không thể mở rương'));
    }
    return response.json();
};

/**
 * Verify / complete a dynamic hidden quest (check-in, QR, quiz, photo).
 * @param {string} spawnId - UUID of the player_hidden_tasks entry
 * @param {number} lat - current player latitude
 * @param {number} lng - current player longitude
 * @param {string} questType - CHECKIN | QR | QUIZ | PHOTO
 * @param {object} extraData - e.g. { qr_token, answer, image_url }
 * @returns {Promise<object>} - reward details
 */
export const verifyQuest = async (spawnId, lat, lng, questType, extraData = {}) => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/v1/hidden/verify-quest`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        },
        body: JSON.stringify({
            spawn_id: spawnId,
            latitude: lat,
            longitude: lng,
            quest_type: questType,
            ...extraData
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Xác thực nhiệm vụ thất bại'));
    }
    return response.json();
};

/**
 * Force-spawn a chest or event near player (Dev / Debug only).
 * @param {string} taskType - CHEST | DYNAMIC_QUEST
 * @param {number} lat - latitude
 * @param {number} lng - longitude
 * @param {string} rarity - COMMON | RARE | EPIC | LEGENDARY
 * @returns {Promise<object>} - spawned task info
 */
export const debugSpawn = async (taskType, lat, lng, rarity = 'COMMON') => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/v1/hidden/debug-spawn`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        },
        body: JSON.stringify({
            task_type: taskType,
            latitude: lat,
            longitude: lng,
            rarity: rarity
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Debug spawn thất bại'));
    }
    return response.json();
};

// ─── Enterprise Event APIs ───────────────────────────────────────────────────

/**
 * Fetch events owned by the logged-in enterprise account.
 * @returns {Promise<Array>}
 */
export const getEnterpriseEvents = async () => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/enterprise/events`, {
        headers: { ...authHeader }
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Lỗi tải danh sách sự kiện'));
    }
    return response.json();
};

/**
 * Create a new enterprise event.
 * @param {object} eventData - event payload
 * @returns {Promise<object>}
 */
export const createEnterpriseEvent = async (eventData) => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/enterprise/events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        },
        body: JSON.stringify(eventData)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Tạo sự kiện thất bại'));
    }
    return response.json();
};

/**
 * Delete / deactivate an enterprise event.
 * @param {string} eventId
 * @returns {Promise<object>}
 */
export const deleteEnterpriseEvent = async (eventId) => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/enterprise/events/${eventId}`, {
        method: 'DELETE',
        headers: { ...authHeader }
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Hủy sự kiện thất bại'));
    }
    return response.json();
};

// ─── Public Campaign APIs for Players ────────────────────────────────────────

/**
 * Lấy danh sách toàn bộ chiến dịch doanh nghiệp đang hoạt động.
 * @returns {Promise<Array>}
 */
export const getActiveCampaigns = async () => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/v1/campaigns/active`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        }
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Lỗi tải danh sách chiến dịch hoạt động'));
    }
    return response.json();
};

/**
 * Xác thực và hoàn thành thử thách chiến dịch cho người chơi.
 * @param {string} eventId
 * @param {number} lat
 * @param {number} lng
 * @param {string} questType
 * @param {object} extraData
 * @returns {Promise<object>}
 */
export const verifyCampaign = async (eventId, lat, lng, questType, extraData = {}) => {
    const authHeader = await getAuthHeader();
    const response = await fetch(`${BASE_URL}/api/v1/campaigns/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader
        },
        body: JSON.stringify({
            event_id: eventId,
            latitude: lat,
            longitude: lng,
            quest_type: questType,
            ...extraData
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(formatError(err, 'Xác thực thử thách chiến dịch thất bại'));
    }
    return response.json();
};
