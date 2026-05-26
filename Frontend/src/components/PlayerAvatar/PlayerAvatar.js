/**
 * PlayerAvatar.js
 * Tạo Leaflet DivIcon cho avatar người chơi trên bản đồ.
 * Sử dụng cùng hệ thống avatar DiceBear Adventurer như Leaderboard.
 */
import L from 'leaflet';
import './PlayerAvatar.css';
import { getSafeAvatarSrc, createInitialAvatarDataUrl } from '../../utils/avatar';

/**
 * Lấy URL avatar (giống logic getAvatarSrc ở Leaderboard)
 * @param {Object} user - user object chứa avatar_url, full_name
 * @returns {string} URL avatar
 */
export function getAvatarUrl(user) {
    const name = user?.full_name || 'Nguoi choi';
    return getSafeAvatarSrc(user?.avatar_url, name);
}

/**
 * Tạo Leaflet DivIcon cho player avatar
 * @param {Object} user - { full_name, avatar_url }
 * @returns {L.DivIcon}
 */
export function createPlayerAvatarIcon(user) {
    const displayName = user?.full_name || 'Bạn';
    const avatarUrl = getAvatarUrl(user);
    const fallbackAvatar = createInitialAvatarDataUrl(displayName);
    // Cắt tên nếu quá dài
    const shortName = displayName.length > 12 ? displayName.substring(0, 12) + '…' : displayName;

    return L.divIcon({
        className: 'player-avatar-container',
        html: `
            <div class="player-avatar-marker">
                <div class="player-avatar-ring">
                    <div class="player-avatar-pulse"></div>
                    <img 
                        class="player-avatar-img" 
                        src="${avatarUrl}" 
                        alt="${displayName}"
                        onerror="this.onerror=null;this.src='${fallbackAvatar}'"
                    />
                </div>
                <div class="player-avatar-pointer"></div>
                <div class="player-avatar-name">${shortName}</div>
            </div>
        `,
        iconSize: [50, 70],
        iconAnchor: [25, 60],
        popupAnchor: [0, -65],
    });
}
