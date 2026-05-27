import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const canUseLocalStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const getLocalValue = (key) => (canUseLocalStorage() ? window.localStorage.getItem(key) : null);

const setLocalValue = (key, value) => {
    if (!canUseLocalStorage()) return;
    window.localStorage.setItem(key, value);
};

const removeLocalValue = (key) => {
    if (!canUseLocalStorage()) return;
    window.localStorage.removeItem(key);
};

export const storageGet = async (key) => {
    if (Capacitor.isNativePlatform()) {
        try {
            const { value } = await Preferences.get({ key });
            if (value !== null && value !== undefined) {
                return value;
            }
            return getLocalValue(key);
        } catch (error) {
            return getLocalValue(key);
        }
    }

    return getLocalValue(key);
};

export const storageSet = async (key, value) => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Preferences.set({ key, value });
            return;
        } catch (error) {
            // Fallback to localStorage on web runtime or when plugin is unavailable.
        }
    }

    setLocalValue(key, value);
};

export const storageRemove = async (key) => {
    if (Capacitor.isNativePlatform()) {
        try {
            await Preferences.remove({ key });
            removeLocalValue(key);
            return;
        } catch (error) {
            // Fallback to localStorage on web runtime or when plugin is unavailable.
        }
    }

    removeLocalValue(key);
};
