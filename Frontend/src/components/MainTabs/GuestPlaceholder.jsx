// src/components/MainTabs/GuestPlaceholder.jsx
import React from 'react';
import { Compass } from 'lucide-react';
import './GuestPlaceholder.css';

const GuestPlaceholder = ({ title, icon, onRequireLogin }) => (
    <div className="guest-placeholder">
        <div className="guest-placeholder-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', color: '#636e72' }}>
            {icon}
        </div>
        <h2>{title}</h2>
        <p>
            Tính năng này yêu cầu đăng nhập. Hãy tạo tài khoản để lưu lại hành trình của riêng bạn nhé!
        </p>
        <button
            onClick={onRequireLogin}
            className="guest-login-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}
        >
            Đăng nhập ngay <Compass size={18} />
        </button>
    </div>
);

export default GuestPlaceholder;
