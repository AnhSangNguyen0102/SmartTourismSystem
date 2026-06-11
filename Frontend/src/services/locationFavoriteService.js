import { storageGet, storageSet } from '../platform/storage';

const STORAGE_KEY = 'favorite_locations';
export const FAVORITE_LOCATIONS_CHANGED = 'favoriteLocationsChanged';

const parseFavorites = (value) => {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const getLocationId = (location) => String(location?.location_id || location?.id || '');

export const getFavoriteLocations = async () => parseFavorites(await storageGet(STORAGE_KEY));

export const isFavoriteLocation = async (location) => {
    const locationId = getLocationId(location);
    if (!locationId) return false;
    const favorites = await getFavoriteLocations();
    return favorites.some((item) => getLocationId(item) === locationId);
};

export const toggleFavoriteLocation = async (location) => {
    const locationId = getLocationId(location);
    if (!locationId) throw new Error('Địa điểm chưa có mã để lưu yêu thích.');

    const favorites = await getFavoriteLocations();
    const existingIndex = favorites.findIndex((item) => getLocationId(item) === locationId);
    const isFavorite = existingIndex === -1;
    const nextFavorites = isFavorite
        ? [{
            location_id: location.location_id || location.id,
            location_name: location.location_name || location.name || 'Địa điểm',
            address: location.address || location.city_name || 'Việt Nam',
            image_url: location.image_url || location.cover_image || location.image || location.thumbnail_url || null,
            latitude: location.latitude || location.lat || null,
            longitude: location.longitude || location.lng || null,
            score: location.score ?? null,
        }, ...favorites]
        : favorites.filter((_, index) => index !== existingIndex);

    await storageSet(STORAGE_KEY, JSON.stringify(nextFavorites));
    window.dispatchEvent(new CustomEvent(FAVORITE_LOCATIONS_CHANGED, { detail: nextFavorites }));
    return isFavorite;
};
