import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const toLocationError = (error) => {
    const message = error?.message || 'Không thể lấy dữ liệu GPS.';
    return new Error(message);
};

const normalizePosition = (position) => {
    if (!position?.coords) return null;
    return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
        altitude: position.coords.altitude ?? null,
        heading: position.coords.heading ?? null,
        speed: position.coords.speed ?? null,
        timestamp: position.timestamp ?? Date.now(),
        raw: position,
    };
};

const browserGetCurrentPosition = (options = {}) =>
    new Promise((resolve, reject) => {
        if (!navigator?.geolocation) {
            reject(new Error('Trình duyệt không hỗ trợ định vị GPS.'));
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

const browserWatchPosition = (onSuccess, onError, options = {}) => {
    if (!navigator?.geolocation) {
        onError?.(new Error('Trình duyệt không hỗ trợ định vị GPS.'));
        return null;
    }

    return navigator.geolocation.watchPosition(
        (position) => {
            const normalized = normalizePosition(position);
            if (normalized) onSuccess?.(normalized, position);
        },
        (error) => onError?.(toLocationError(error), error),
        options
    );
};

export const getCurrentPosition = async (options = {}) => {
    if (Capacitor.isNativePlatform()) {
        try {
            const nativePosition = await Geolocation.getCurrentPosition(options);
            const normalized = normalizePosition(nativePosition);
            if (!normalized) throw new Error('Không nhận được dữ liệu GPS từ thiết bị.');
            return normalized;
        } catch (nativeError) {
            try {
                const webPosition = await browserGetCurrentPosition(options);
                const normalized = normalizePosition(webPosition);
                if (!normalized) throw new Error('Không nhận được dữ liệu GPS.');
                return normalized;
            } catch (webError) {
                throw toLocationError(nativeError?.message ? nativeError : webError);
            }
        }
    }

    const webPosition = await browserGetCurrentPosition(options);
    const normalized = normalizePosition(webPosition);
    if (!normalized) throw new Error('Không nhận được dữ liệu GPS.');
    return normalized;
};

export const startWatchingPosition = ({ onSuccess, onError, options = {} }) => {
    let webWatchId = null;
    let nativeWatchId = null;
    let stopped = false;

    const stop = () => {
        stopped = true;

        if (webWatchId !== null && navigator?.geolocation) {
            navigator.geolocation.clearWatch(webWatchId);
            webWatchId = null;
        }

        if (nativeWatchId !== null) {
            Geolocation.clearWatch({ id: nativeWatchId }).catch(() => {});
            nativeWatchId = null;
        }
    };

    const startBrowserWatch = () => {
        webWatchId = browserWatchPosition(onSuccess, onError, options);
    };

    if (Capacitor.isNativePlatform()) {
        Geolocation.watchPosition(options, (position, error) => {
            if (stopped) return;

            if (error) {
                onError?.(toLocationError(error), error);
                return;
            }

            const normalized = normalizePosition(position);
            if (normalized) onSuccess?.(normalized, position);
        })
            .then((id) => {
                nativeWatchId = id;
                if (stopped && nativeWatchId !== null) {
                    Geolocation.clearWatch({ id: nativeWatchId }).catch(() => {});
                    nativeWatchId = null;
                }
            })
            .catch(() => {
                if (!stopped) startBrowserWatch();
            });
    } else {
        startBrowserWatch();
    }

    return stop;
};
