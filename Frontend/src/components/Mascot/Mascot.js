import React, { useEffect, useState, useRef } from 'react';
import './Mascot.css';

const Mascot = ({ message }) => {
    // Chuẩn hóa message thành mảng để hỗ trợ chuỗi các câu thoại liên tiếp
    const msgs = Array.isArray(message) ? message : (message ? [message] : []);
    const msgsString = JSON.stringify(msgs);
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [displayedMessage, setDisplayedMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [animationClass, setAnimationClass] = useState('idle');
    const [replayTrigger, setReplayTrigger] = useState(0);

    // Reset chuỗi thoại khi có message mới
    const lastMsgStrRef = useRef(msgsString);
    if (lastMsgStrRef.current !== msgsString) {
        lastMsgStrRef.current = msgsString;
        setCurrentIndex(0);
        setDisplayedMessage('');
    }

    useEffect(() => {
        if (msgs.length === 0) {
            setDisplayedMessage('');
            return;
        }

        let typingInterval;
        let hideTimeout;
        let animationTimeout;
        let nextMessageTimeout;

        const currentMsg = msgs[currentIndex];
        if (!currentMsg) return;

        let builtText = '';
        setDisplayedMessage('');
        setIsTyping(true);
        setAnimationClass('talking');
        
        let i = 0;
        typingInterval = setInterval(() => {
            if (i < currentMsg.length) {
                builtText += currentMsg.charAt(i);
                setDisplayedMessage(builtText);
                i++;
            } else {
                clearInterval(typingInterval);
                setIsTyping(false);
                setAnimationClass('happy'); // Quick jump when done
                
                animationTimeout = setTimeout(() => setAnimationClass('idle'), 1500);
                
                if (currentIndex < msgs.length - 1) {
                    nextMessageTimeout = setTimeout(() => {
                        setCurrentIndex(prev => prev + 1);
                    }, 2500);
                } else {
                    hideTimeout = setTimeout(() => setDisplayedMessage(''), 5000);
                }
            }
        }, 30); // 30ms per character

        return () => {
            clearInterval(typingInterval);
            clearTimeout(hideTimeout);
            clearTimeout(animationTimeout);
            clearTimeout(nextMessageTimeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msgsString, currentIndex, replayTrigger]);

    useEffect(() => {
        if (animationClass === 'talking' || isTyping) return;
        
        const randomAction = setInterval(() => {
            const actions = ['look-left', 'look-right', 'jump', 'wiggle', 'idle'];
            const random = actions[Math.floor(Math.random() * actions.length)];
            setAnimationClass(random);
            setTimeout(() => setAnimationClass('idle'), 2000);
        }, 5000);

        return () => clearInterval(randomAction);
    }, [isTyping, animationClass]);

    const handleMascotClick = () => {
        if (!isTyping && msgs.length > 0) {
            setCurrentIndex(0);
            setReplayTrigger(prev => prev + 1);
        }
    };

    return (
        <div className="mascot-container">
            {displayedMessage && (
                <div className="mascot-bubble">
                    {displayedMessage}
                    {isTyping && <span className="typing-cursor">|</span>}
                </div>
            )}
            <div className={`mascot-character ${animationClass}`} onClick={handleMascotClick} style={{ cursor: 'pointer' }}>
                <img src="/mascot.png" alt="Mascot" onError={(e) => {
                    e.target.src = 'https://cdn-icons-png.flaticon.com/512/3069/3069172.png';
                }} />
            </div>
        </div>
    );
};

export default Mascot;
