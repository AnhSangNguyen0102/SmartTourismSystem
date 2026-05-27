import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isBgmEnabled, setBgmEnabled } from '../../utils/soundUtils';
import './AudioControl.css';

const AudioControl = () => {
    const [bgmOn, setBgmOn] = useState(true);

    useEffect(() => {
        setBgmOn(isBgmEnabled());
        
        // Listen for custom event from UserProfile to sync state
        const handleSettingsChange = () => {
            setBgmOn(isBgmEnabled());
        };
        window.addEventListener('audioSettingsChanged', handleSettingsChange);
        
        return () => window.removeEventListener('audioSettingsChanged', handleSettingsChange);
    }, []);

    const toggleBgm = () => {
        const newState = !bgmOn;
        setBgmEnabled(newState);
        setBgmOn(newState);
        // Dispatch custom event to sync UserProfile if it's open
        window.dispatchEvent(new Event('audioSettingsChanged'));
    };

    return (
        <button 
            className={`audio-control-btn ${bgmOn ? 'on' : 'off'}`} 
            onClick={toggleBgm}
            title={bgmOn ? "Tắt Nhạc Nền" : "Bật Nhạc Nền"}
        >
            {bgmOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
    );
};

export default AudioControl;
