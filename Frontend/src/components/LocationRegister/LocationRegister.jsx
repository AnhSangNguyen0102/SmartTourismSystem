import React, { useState } from 'react';
// ĐÃ SỬA CHUẨN ĐƯỜNG DẪN THÀNH 2 DẤU CHẤM LÙI BƯỚC:
import { businessService } from '../../services/businessService'; 
import './LocationRegister.css'; 

const LocationRegister = ({ onBack }) => {
    // 1. Khai báo State
    const [formData, setFormData] = useState({
        location_name: '',
        address: '',
        city_id: 1,
        open_time: '08:00',
        close_time: '22:00',
        min_price: '',
        max_price: '',
        currency: 'VND',
        category_ids: [1], 
        tag_ids: [1, 2]
    });

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // 2. Hàm bắt sự kiện thay đổi input
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    // 3. Hàm gửi dữ liệu đi (Đã dùng các biến nên sẽ hết bị Warning)
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });

        try {
            const payload = {
                ...formData,
                open_time: `${formData.open_time}:00`,
                close_time: `${formData.close_time}:00`,
                city_id: parseInt(formData.city_id),
                min_price: formData.min_price.toString(),
                max_price: formData.max_price.toString()
            };

            const response = await businessService.registerLocation(payload);
            const submissionSuffix = response.submission_id ? ` Mã yêu cầu: ${response.submission_id}` : '';
            setMessage({
                type: 'success',
                text: `${response.message || 'Đã gửi yêu cầu, chờ admin duyệt.'}${submissionSuffix}`,
            });
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="register-container">
            {/* Nút quay lại trang chủ */}
            {onBack && (
                <button onClick={onBack} style={{ marginBottom: '15px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 'bold' }}>
                    ← Quay lại
                </button>
            )}

            <h2 className="register-title">Đăng Ký Địa Điểm Kinh Doanh</h2>
            
            {message.text && (
                <div className={`alert-message ${message.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                    {message.text}
                </div>
            )}

            <form onSubmit={handleSubmit}>
                <h3 className="form-section-title">1. Thông tin cơ bản</h3>
                
                <div className="form-group">
                    <label className="form-label">Tên địa điểm</label>
                    <input type="text" name="location_name" required value={formData.location_name} onChange={handleChange} className="form-control" />
                </div>
                
                <div className="form-group">
                    <label className="form-label">Địa chỉ</label>
                    <input type="text" name="address" required value={formData.address} onChange={handleChange} className="form-control" />
                </div>

                <div className="form-group">
                    <label className="form-label">Thành phố</label>
                    <select name="city_id" value={formData.city_id} onChange={handleChange} className="form-control">
                        <option value={1}>Hồ Chí Minh</option>
                        <option value={2}>Hà Nội</option>
                    </select>
                </div>

                <h3 className="form-section-title" style={{ marginTop: '1.5rem' }}>2. Hoạt động & Chi phí</h3>
                
                <div className="grid-2-cols">
                    <div className="form-group">
                        <label className="form-label">Giờ mở cửa</label>
                        <input type="time" name="open_time" required value={formData.open_time} onChange={handleChange} className="form-control" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Giờ đóng cửa</label>
                        <input type="time" name="close_time" required value={formData.close_time} onChange={handleChange} className="form-control" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Giá thấp nhất</label>
                        <input type="number" name="min_price" required value={formData.min_price} onChange={handleChange} className="form-control" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Giá cao nhất</label>
                        <input type="number" name="max_price" required value={formData.max_price} onChange={handleChange} className="form-control" />
                    </div>
                </div>

                <button type="submit" disabled={loading} className="submit-btn">
                    {loading ? 'Đang gửi yêu cầu...' : 'Đăng Ký Địa Điểm'}
                </button>
            </form>
        </div>
    );
};

export default LocationRegister;
