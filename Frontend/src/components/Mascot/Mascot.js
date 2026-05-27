import React, { useEffect, useState, useRef, useCallback } from 'react';
import './Mascot.css';

const Mascot = ({ message }) => {
    // Chuẩn hóa message thành mảng để hỗ trợ chuỗi các câu thoại liên tiếp
    const msgs = Array.isArray(message) ? message : (message ? [message] : []);
    const msgsString = JSON.stringify(msgs);
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [displayedMessage, setDisplayedMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [animationClass, setAnimationClass] = useState('idle');

    // Vị trí và kéo thả
    const [position, setPosition] = useState(() => {
        const savedPos = localStorage.getItem('mascotPosition');
        if (savedPos) {
            try { return JSON.parse(savedPos); } catch (e) {}
        }
        return { x: 20, y: window.innerHeight - 220 };
    });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0, dragged: false });

    // Reset chuỗi thoại khi có message mới
    useEffect(() => {
        setCurrentIndex(0);
    }, [msgsString]);

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

        setDisplayedMessage('');
        setIsTyping(true);
        setAnimationClass('talking');
        
        let i = 0;
        typingInterval = setInterval(() => {
            if (i < currentMsg.length) {
                setDisplayedMessage(prev => prev + currentMsg.charAt(i));
                i++;
            } else {
                clearInterval(typingInterval);
                setIsTyping(false);
                setAnimationClass('happy'); // Quick jump when done
                
                animationTimeout = setTimeout(() => setAnimationClass('idle'), 1500);
                
                if (currentIndex < msgs.length - 1) {
                    // Nếu còn câu thoại tiếp theo, đợi 2.5s rồi chuyển
                    nextMessageTimeout = setTimeout(() => {
                        setCurrentIndex(prev => prev + 1);
                    }, 2500);
                } else {
                    // Ẩn câu thoại cuối cùng sau 5 giây để không che màn hình
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
    }, [msgsString, currentIndex]);

    // Trình giả lập các animation random (chớp mắt, vẫy tay, liếc) bằng CSS
    // Vì là ảnh tĩnh nên ta mô phỏng bằng cách nghiêng, nhún nhảy.
    useEffect(() => {
        if (animationClass === 'talking' || isTyping) return;
        
        const randomAction = setInterval(() => {
            const actions = ['look-left', 'look-right', 'jump', 'wiggle', 'idle'];
            const random = actions[Math.floor(Math.random() * actions.length)];
            setAnimationClass(random);
            setTimeout(() => setAnimationClass('idle'), 2000); // Back to idle
        }, 5000); // Cứ 5s làm 1 hành động

        return () => clearInterval(randomAction);
    }, [isTyping, animationClass]);

    // Drag events
    const handlePointerDown = (e) => {
        setIsDragging(true);
        const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        dragRef.current = {
            startX: clientX,
            startY: clientY,
            initialX: position.x,
            initialY: position.y,
            dragged: false
        };
    };

    const handlePointerMove = useCallback((e) => {
        if (!isDragging) return;
        if (e.cancelable) e.preventDefault(); 
        const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        
        const dx = clientX - dragRef.current.startX;
        const dy = clientY - dragRef.current.startY;
        
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            dragRef.current.dragged = true;
        }

        let newX = dragRef.current.initialX + dx;
        let newY = dragRef.current.initialY + dy;
        
        // Clamp to screen bounds
        const maxX = window.innerWidth - 80;
        const maxY = window.innerHeight - 100;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        
        setPosition({ x: newX, y: newY });
    }, [isDragging]);

    const handlePointerUp = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            localStorage.setItem('mascotPosition', JSON.stringify(position));
        }
    }, [isDragging, position]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handlePointerMove);
            window.addEventListener('mouseup', handlePointerUp);
            window.addEventListener('touchmove', handlePointerMove, { passive: false });
            window.addEventListener('touchend', handlePointerUp);
        } else {
            window.removeEventListener('mousemove', handlePointerMove);
            window.removeEventListener('mouseup', handlePointerUp);
            window.removeEventListener('touchmove', handlePointerMove);
            window.removeEventListener('touchend', handlePointerUp);
        }
        return () => {
            window.removeEventListener('mousemove', handlePointerMove);
            window.removeEventListener('mouseup', handlePointerUp);
            window.removeEventListener('touchmove', handlePointerMove);
            window.removeEventListener('touchend', handlePointerUp);
        };
    }, [isDragging, handlePointerMove, handlePointerUp]);

    const handleMascotClick = (e) => {
        if (dragRef.current.dragged) return; // Prevent click if user was dragging
        if (!isTyping && msgs.length > 0) {
            setCurrentIndex(0); // Phát lại đoạn thoại khi người dùng nhấn vào mascot
        }
    };

    return (
        <div 
            className="mascot-container"
            style={{ 
                left: `${position.x}px`, 
                top: `${position.y}px`,
                bottom: 'auto',
                touchAction: 'none',
                zIndex: isDragging ? 9999 : 999
            }}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
        >
            {displayedMessage && (
                <div className="mascot-bubble">
                    {displayedMessage}
                    {isTyping && <span className="typing-cursor">|</span>}
                </div>
            )}
            <div className={`mascot-character ${animationClass}`} onClick={handleMascotClick} style={{ cursor: 'pointer' }}>
                {/* Đặt ảnh mascot vào thư mục public/mascot.png để hệ thống load */}
                <img src="/mascot.png" alt="Mascot" onError={(e) => {
                    // Fallback avatar nếu người dùng chưa kịp lưu ảnh mascot
                    e.target.src = 'https://cdn-icons-png.flaticon.com/512/3069/3069172.png';
                }} />
            </div>
        </div>
    );
};

export default Mascot;
