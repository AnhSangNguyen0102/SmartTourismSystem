export const isMascotEnabled = () => {
    const saved = localStorage.getItem('mascotEnabled');
    return saved !== null ? saved === 'true' : true;
};

export const setMascotEnabled = (enabled) => {
    localStorage.setItem('mascotEnabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('mascotSettingsChanged'));
};
