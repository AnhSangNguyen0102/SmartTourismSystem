class SoundManager {
    constructor() {
        this.bgmAudio = null;
        this.bgmStarted = false;
        
        // Khôi phục cài đặt từ localStorage, mặc định là Bật
        const savedBgm = localStorage.getItem('bgmEnabled');
        this.bgmEnabled = savedBgm !== null ? savedBgm === 'true' : true;
        
        const savedSfx = localStorage.getItem('sfxEnabled');
        this.sfxEnabled = savedSfx !== null ? savedSfx === 'true' : true;
        
        const savedVolume = localStorage.getItem('bgmVolume');
        this.bgmVolume = savedVolume !== null ? parseFloat(savedVolume) : 0.5;
    }

    setBgmEnabled(enabled) {
        this.bgmEnabled = enabled;
        localStorage.setItem('bgmEnabled', enabled);
        
        if (enabled) {
            this.playBGM();
        } else {
            this.pauseBGM();
        }
    }

    setSfxEnabled(enabled) {
        this.sfxEnabled = enabled;
        localStorage.setItem('sfxEnabled', enabled);
    }

    isBgmEnabled() {
        return this.bgmEnabled;
    }

    isSfxEnabled() {
        return this.sfxEnabled;
    }
    
    getBgmVolume() {
        return this.bgmVolume;
    }

    setBgmVolume(volume) {
        this.bgmVolume = volume;
        localStorage.setItem('bgmVolume', volume);
        if (this.bgmAudio) {
            this.bgmAudio.volume = volume;
        }
    }

    playBGM() {
        if (!this.bgmEnabled) return;
        
        if (!this.bgmAudio) {
            this.bgmAudio = new Audio('/assets/sounds/bgm.mp3');
            this.bgmAudio.loop = true;
            this.bgmAudio.volume = this.bgmVolume;
        }
        
        this.bgmAudio.play().catch(e => {
            console.warn('BGM could not auto-play, waiting for interaction', e);
        });
        this.bgmStarted = true;
    }

    pauseBGM() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
        }
    }

    playSound(soundFileName) {
        if (!this.sfxEnabled) return;
        
        try {
            const audio = new Audio(`/assets/sounds/${soundFileName}`);
            audio.play().catch((e) => {
                // Ignore DOMException for missing files or autoplay blocks
                console.warn(`Could not play sound: ${soundFileName}`, e);
            });
        } catch (err) {
            console.warn('Audio playback error:', err);
        }
    }
}

const soundManager = new SoundManager();

export const setBgmEnabled = (val) => soundManager.setBgmEnabled(val);
export const setSfxEnabled = (val) => soundManager.setSfxEnabled(val);
export const isBgmEnabled = () => soundManager.isBgmEnabled();
export const isSfxEnabled = () => soundManager.isSfxEnabled();
export const getBgmVolume = () => soundManager.getBgmVolume();
export const setBgmVolume = (val) => soundManager.setBgmVolume(val);
export const playBGM = () => soundManager.playBGM();
export const pauseBGM = () => soundManager.pauseBGM();
export const playSound = (name) => soundManager.playSound(name);

