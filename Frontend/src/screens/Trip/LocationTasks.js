import React, { useState, useEffect } from 'react';
import './LocationTasks.css';

const LOCATION_MOCK_METADATA = {
  'Hoàng thành Thăng Long': {
    image: 'https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?w=800',
    description: 'Quần thể di tích lịch sử hoàng cung gắn liền với lịch sử phát triển của Thăng Long.',
    category: '🏛️ Di sản Lịch sử',
    rating: '⭐ 4.8'
  },
  'Vần Miếu - Quốc Tử Giám': {
    image: 'https://images.unsplash.com/photo-1571471898518-92f7f315896a?w=800',
    description: 'Trường đại học đầu tiên của Việt Nam, biểu tượng cho nền hiếu học.',
    category: '🏮 Văn hóa & Giáo dục',
    rating: '⭐ 4.9'
  }
};

const DEFAULT_METADATA = {
  image: 'https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=800',
  description: 'Một địa danh du lịch tuyệt vời nằm trong lộ trình khám phá văn hóa và lịch sử.',
  category: '📍 Điểm dừng chân',
  rating: '⭐ 4.5'
};

export const LocationTasks = ({ locationId, locationName, itineraryId, userId, onClose, onSelectTask }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const locationMeta = LOCATION_MOCK_METADATA[locationName] || DEFAULT_METADATA;

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `http://127.0.0.1:8000/api/gamification/locations/${locationId}/tasks?itinerary_id=${itineraryId}&user_id=${userId}`
        );
        if (!response.ok) {
          throw new Error('Không thể lấy danh sách nhiệm vụ.');
        }
        const data = await response.json();
        setTasks(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (locationId && itineraryId && userId) {
      fetchTasks();
    }
  }, [locationId, itineraryId, userId]);

  return (
    <div className="location-tasks-drawer">
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-content">
        <div className="drawer-handle" />
        
        <div className="drawer-header">
          <div className="header-info">
            <span className="location-tag">📍 THÔNG TIN ĐỊA ĐIỂM</span>
            <h3>{locationName}</h3>
          </div>
          <button className="btn-close-drawer" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">
          <div className="location-info-section">
            <div className="hero-img-container">
              <img src={locationMeta.image} alt={locationName} className="location-hero-img" />
              <div className="location-category-badge">{locationMeta.category}</div>
            </div>
            <div className="location-meta-content">
              <p className="location-description">{locationMeta.description}</p>
              <div className="location-rating-row">
                <span className="location-rating">{locationMeta.rating}</span>
                <span className="location-open-status">🟢 Đang hoạt động</span>
              </div>
            </div>
          </div>

          <div className="divider-line" />
          <h4 className="tasks-section-title">🎯 THỬ THÁCH ĐA DẠNG TRẢI NGHIỆM</h4>
          <p className="drawer-intro">Hoàn thành chuỗi nhiệm vụ ảnh chụp, kiến thức và quét mã để nhận thưởng cực lớn!</p>

          {loading && (
            <div className="drawer-loading">
              <div className="spinner" />
              <p>Đang quét tìm thử thách...</p>
            </div>
          )}

          {error && <div className="drawer-error"><p>⚠️ {error}</p></div>}

          {!loading && !error && tasks.map((task) => (
            <div 
              key={task.task_id} 
              className={`task-card-item ${task.status.toLowerCase()}`}
              onClick={() => task.status !== 'COMPLETED' && onSelectTask(task)}
              style={{ marginBottom: '12px' }}
            >
              <div className="task-card-main-row">
                <div className="task-checkbox-container">
                  {task.status === 'COMPLETED' ? '✅' : '⬜'}
                </div>
                
                <div className="task-card-details">
                  <div className="task-item-header">
                    <div className="task-badge-reward">⭐ +{task.reward_exp} EXP</div>
                    <span style={{
                      fontSize: '10px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '6px',
                      background: task.task_type === 'PHOTO' ? '#3b82f633' : task.task_type === 'QA' ? '#10b98133' : '#f59e0b33',
                      color: task.task_type === 'PHOTO' ? '#60a5fa' : task.task_type === 'QA' ? '#34d399' : '#fbbf24'
                    }}>
                      {task.task_type === 'PHOTO' ? '📷 ẢNH CHỤP' : task.task_type === 'QA' ? '❓ HỎI ĐÁP' : '🔳 QUÉT QR'}
                    </span>
                  </div>

                  <h4 className="task-item-title">{task.title}</h4>
                  <p className="task-item-desc">{task.description}</p>
                  
                  <div className="task-item-footer">
                    <span>Yêu cầu vị trí: Trong khu vực di sản</span>
                    <span className={`task-status-text ${task.status.toLowerCase()}`}>
                      {task.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Bấm để thực hiện 🡢'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LocationTasks;