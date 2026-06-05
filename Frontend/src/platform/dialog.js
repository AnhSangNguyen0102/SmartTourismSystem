import { Capacitor } from '@capacitor/core';
import { Dialog } from '@capacitor/dialog';

const showCustomDialog = (title, message, isConfirm, options = {}) => {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') {
            resolve(isConfirm ? false : undefined);
            return;
        }

        const {
            okButtonTitle = 'Đồng ý',
            cancelButtonTitle = 'Hủy',
            buttonTitle = 'Đóng',
        } = options;

        // Overlay element
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        overlay.style.backdropFilter = 'blur(4px)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '999999';
        overlay.style.fontFamily = "'Be Vietnam Pro', 'Inter', -apple-system, sans-serif";

        // Modal container
        const container = document.createElement('div');
        container.style.backgroundColor = '#ffffff';
        container.style.border = '4px solid #000000';
        container.style.boxShadow = '8px 8px 0px #000000';
        container.style.padding = '24px';
        container.style.width = '90%';
        container.style.maxWidth = '420px';
        container.style.borderRadius = '0px';
        container.style.transform = 'translateY(10px)';
        container.style.transition = 'transform 0.15s ease-out';
        
        // Title
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.margin = '0 0 16px 0';
        titleEl.style.fontSize = '20px';
        titleEl.style.fontWeight = '800';
        titleEl.style.color = '#000000';
        titleEl.style.borderBottom = '3px solid #000000';
        titleEl.style.paddingBottom = '8px';
        titleEl.style.textTransform = 'uppercase';
        container.appendChild(titleEl);

        // Message
        const messageEl = document.createElement('p');
        messageEl.textContent = message;
        messageEl.style.margin = '0 0 24px 0';
        messageEl.style.fontSize = '15px';
        messageEl.style.lineHeight = '1.6';
        messageEl.style.color = '#1a1a1a';
        messageEl.style.fontWeight = '500';
        container.appendChild(messageEl);

        // Buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.justifyContent = 'flex-end';
        buttonsContainer.style.gap = '12px';

        const createButton = (text, isPrimary, onClick) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.padding = '10px 20px';
            btn.style.fontSize = '14px';
            btn.style.fontWeight = '800';
            btn.style.textTransform = 'uppercase';
            btn.style.border = '3px solid #000000';
            btn.style.borderRadius = '0px';
            btn.style.boxShadow = '4px 4px 0px #000000';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'all 0.1s ease';
            btn.style.fontFamily = "'Be Vietnam Pro', 'Inter', -apple-system, sans-serif";
            
            if (isPrimary) {
                btn.style.backgroundColor = '#FFD200';
                btn.style.color = '#000000';
            } else {
                btn.style.backgroundColor = '#ffffff';
                btn.style.color = '#000000';
            }

            btn.addEventListener('mousedown', () => {
                btn.style.transform = 'translate(2px, 2px)';
                btn.style.boxShadow = '2px 2px 0px #000000';
            });
            btn.addEventListener('mouseup', () => {
                btn.style.transform = 'translate(0px, 0px)';
                btn.style.boxShadow = '4px 4px 0px #000000';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translate(0px, 0px)';
                btn.style.boxShadow = '4px 4px 0px #000000';
            });
            btn.addEventListener('click', onClick);
            return btn;
        };

        const cleanup = () => {
            overlay.remove();
        };

        if (isConfirm) {
            const cancelBtn = createButton(cancelButtonTitle, false, () => {
                cleanup();
                resolve(false);
            });
            const okBtn = createButton(okButtonTitle, true, () => {
                cleanup();
                resolve(true);
            });
            buttonsContainer.appendChild(cancelBtn);
            buttonsContainer.appendChild(okBtn);
        } else {
            const closeBtn = createButton(buttonTitle, true, () => {
                cleanup();
                resolve(undefined);
            });
            buttonsContainer.appendChild(closeBtn);
        }

        container.appendChild(buttonsContainer);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        // Animate container entrance
        requestAnimationFrame(() => {
            container.style.transform = 'translateY(0)';
        });
    });
};

export const showAlert = async (message, options = {}) => {
    const text = typeof message === 'string' ? message : String(message ?? '');
    const { title = 'Thông báo' } = options;

    if (Capacitor.isNativePlatform()) {
        try {
            await Dialog.alert({
                title,
                message: text,
                buttonTitle: options.buttonTitle || 'Đóng',
            });
            return;
        } catch (error) {
            // Fallback to custom dialog.
        }
    }

    await showCustomDialog(title, text, false, options);
};

export const showConfirm = async (message, options = {}) => {
    const text = typeof message === 'string' ? message : String(message ?? '');
    const { title = 'Xác nhận' } = options;

    if (Capacitor.isNativePlatform()) {
        try {
            const result = await Dialog.confirm({
                title,
                message: text,
                okButtonTitle: options.okButtonTitle || 'Đồng ý',
                cancelButtonTitle: options.cancelButtonTitle || 'Hủy',
            });
            return !!result?.value;
        } catch (error) {
            // Fallback to custom dialog.
        }
    }

    return await showCustomDialog(title, text, true, options);
};

// ── Toast notification (floating, auto-dismiss) ─────────────────────────────
let toastContainer = null;

const getToastContainer = () => {
    if (!toastContainer || !document.body.contains(toastContainer)) {
        toastContainer = document.createElement('div');
        toastContainer.style.position = 'fixed';
        toastContainer.style.top = '16px';
        toastContainer.style.left = '50%';
        toastContainer.style.transform = 'translateX(-50%)';
        toastContainer.style.zIndex = '9999999';
        toastContainer.style.display = 'flex';
        toastContainer.style.flexDirection = 'column';
        toastContainer.style.alignItems = 'center';
        toastContainer.style.gap = '8px';
        toastContainer.style.pointerEvents = 'none';
        toastContainer.style.width = '90%';
        toastContainer.style.maxWidth = '420px';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
};

export const showToast = (message, type = 'info', duration = 3000) => {
    if (!message || typeof document === 'undefined') return;

    const colors = {
        info:    { bg: '#1e3a5f', border: '#3498db', icon: 'ℹ️' },
        success: { bg: '#1a472a', border: '#2ecc71', icon: '✅' },
        error:   { bg: '#4a1020', border: '#e74c3c', icon: '❌' },
        warning: { bg: '#4a3000', border: '#f39c12', icon: '⚠️' },
    };
    const { bg, border, icon } = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${bg};
        border: 2px solid ${border};
        border-radius: 12px;
        padding: 12px 16px;
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        font-family: 'Be Vietnam Pro', 'Inter', sans-serif;
        line-height: 1.4;
        box-shadow: 0 4px 20px rgba(0,0,0,0.35);
        pointer-events: auto;
        cursor: pointer;
        width: 100%;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        opacity: 0;
        transform: translateY(-12px) scale(0.97);
        transition: opacity 0.25s ease, transform 0.25s ease;
    `;

    const iconEl = document.createElement('span');
    iconEl.textContent = icon;
    iconEl.style.fontSize = '16px';
    iconEl.style.flexShrink = '0';
    iconEl.style.marginTop = '1px';

    const textEl = document.createElement('span');
    textEl.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(textEl);

    const container = getToastContainer();
    container.appendChild(toast);

    // Slide in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0) scale(1)';
        });
    });

    const dismiss = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-8px) scale(0.97)';
        setTimeout(() => toast.remove(), 300);
    };

    toast.addEventListener('click', dismiss);
    const timer = setTimeout(dismiss, duration);
    toast.addEventListener('click', () => clearTimeout(timer));
};
