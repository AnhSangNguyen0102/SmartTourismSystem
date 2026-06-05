import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';

const API_URL = `${API_BASE}/api/vouchers`;

const getAuthHeaders = async () => {
    const token = await storageGet('access_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
};

export const voucherService = {
    // Lấy voucher theo location
    getVouchersByLocation: async (locationId) => {
        const response = await fetch(`${API_URL}/location/${locationId}`);
        if (!response.ok) throw new Error('Không thể tải danh sách voucher');
        return response.json();
    },

    // Lấy toàn bộ voucher hệ thống không cần vị trí
    getAllActiveVouchers: async () => {
        const response = await fetch(`${API_BASE}/api/vouchers/active`);
        if (!response.ok) throw new Error('Không thể tải danh sách voucher hệ thống');
        return response.json();
    },

    // Nhận/Đổi voucher
    claimVoucher: async (voucherId) => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_URL}/${voucherId}/claim`, {
            method: 'POST',
            headers
        });
        
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Không thể đổi voucher');
        return data;
    },

    // Xem kho voucher cá nhân
    getMyVouchers: async () => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_URL}/my-vouchers`, {
            method: 'GET',
            headers
        });
        
        if (!response.ok) throw new Error('Không thể tải kho voucher');
        return response.json();
    },

    // Sử dụng voucher
    useVoucher: async (userVoucherId) => {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_URL}/${userVoucherId}/use`, {
            method: 'POST',
            headers
        });
        
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Không thể sử dụng voucher');
        return data;
    }
};
