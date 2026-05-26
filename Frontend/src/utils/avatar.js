export const getInitials = (fullName = '') => {
    const normalized = String(fullName).trim();
    if (!normalized) return 'ND';

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    const first = words[0][0] || '';
    const last = words[words.length - 1][0] || '';
    return `${first}${last}`.toUpperCase();
};

const buildSeed = (fullName = '') => {
    const normalized = String(fullName || 'nguoi-choi')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
    return normalized || 'nguoi-choi';
};

const buildGameAvatarUrl = (fullName = '') => {
    const seed = buildSeed(fullName);
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
};

export const createInitialAvatarDataUrl = (fullName = '') => {
    return buildGameAvatarUrl(fullName);
};

export const getSafeAvatarSrc = (avatarUrl, fullName = '') => {
    if (avatarUrl) return avatarUrl;
    return buildGameAvatarUrl(fullName);
};
