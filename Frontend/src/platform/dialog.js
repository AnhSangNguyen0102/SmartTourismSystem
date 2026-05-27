import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';

export const showAlert = async (message, options = {}) => {
    const text = typeof message === 'string' ? message : String(message ?? '');
    const { title = 'Thong bao', buttonTitle = 'Dong' } = options;

    if (Capacitor.isNativePlatform()) {
        try {
            await Dialog.alert({
                title,
                message: text,
                buttonTitle,
            });
            return;
        } catch (error) {
            // Fallback to browser dialog.
        }
    }

    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(text);
    }
};

export const showConfirm = async (message, options = {}) => {
    const text = typeof message === 'string' ? message : String(message ?? '');
    const {
        title = 'Xac nhan',
        okButtonTitle = 'Dong y',
        cancelButtonTitle = 'Huy',
    } = options;

    if (Capacitor.isNativePlatform()) {
        try {
            const result = await Dialog.confirm({
                title,
                message: text,
                okButtonTitle,
                cancelButtonTitle,
            });
            return !!result?.value;
        } catch (error) {
            // Fallback to browser dialog.
        }
    }

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return window.confirm(text);
    }

    return false;
};
