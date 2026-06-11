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

    const [position, setPosition] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const positionStart = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);
    const containerRef = useRef(null);
    const initialRect = useRef(null);

    const handlePointerDown = (e) => {
        isDragging.current = true;
        hasMoved.current = false;
        dragStart.current = { x: e.clientX, y: e.clientY };
        positionStart.current = { ...position };
        
        if (containerRef.current) {
            initialRect.current = containerRef.current.getBoundingClientRect();
        }

        e.currentTarget.setPointerCapture(e.pointerId);
        // Prevent default touch behaviors
        e.preventDefault();
    };

    const handlePointerMove = (e) => {
        if (!isDragging.current || !initialRect.current) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasMoved.current = true;
        }
        
        let newX = positionStart.current.x + dx;
        let newY = positionStart.current.y + dy;

        // Calculate boundaries to keep the container within the viewport
        const rect = initialRect.current;
        const baseLeft = rect.left - positionStart.current.x;
        const baseTop = rect.top - positionStart.current.y;

        const minX = -baseLeft;
        const maxX = window.innerWidth - baseLeft - rect.width;

        const minY = -baseTop;
        const maxY = window.innerHeight - baseTop - rect.height;

        newX = Math.max(minX, Math.min(newX, maxX));
        newY = Math.max(minY, Math.min(newY, maxY));

        setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = (e) => {
        isDragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleMascotClick = (e) => {
        if (hasMoved.current) return; // Không kích hoạt thoại nếu đang kéo thả
        if (!isTyping && msgs.length > 0) {
            setCurrentIndex(0);
            setReplayTrigger(prev => prev + 1);
        }
    };

    return (
        <div ref={containerRef} className="mascot-container" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
            {displayedMessage && (
                <div className="mascot-bubble">
                    {displayedMessage}
                    {isTyping && <span className="typing-cursor">|</span>}
                </div>
            )}
            <div 
                className={`mascot-character ${animationClass}`} 
                onClick={handleMascotClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ cursor: 'grab', touchAction: 'none' }}
            >
                <img src="/mascot.png" alt="Mascot" draggable="false" onError={(e) => {
                    e.target.src = 'https://cdn-icons-png.flaticon.com/512/3069/3069172.png';
                }} />
            </div>
        </div>
    );
};

export default Mascot;
