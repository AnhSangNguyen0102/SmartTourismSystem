import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useGeolocation } from '../../hooks/useGeolocation';
import './TaskDetail.css';

// =========================================================================
// COMPONENT CON: XỬ LÝ CAMERA QUÉT QR
// =========================================================================
const QRCameraScanner = ({ onScanSuccess }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { qrbox: { width: 250, height: 250 }, fps: 10 },
      false
    );

    scanner.render(
      (decodedText) => {
        // Tắt camera ngay khi quét thành công
        scanner.clear().catch((err) => console.error("Lỗi tắt camera:", err));
        onScanSuccess(decodedText);
      },
      (error) => {
        // Bỏ qua các lỗi không tìm thấy mã trong khung hình
      }
    );

    return () => {
      scanner.clear().catch((err) => console.log("Cleanup camera:", err));
    };
  }, [onScanSuccess]);

  return (
    <div className="qr-camera-wrapper" style={{ width: '100%', marginTop: '10px' }}>
      <div 
        id="qr-reader" 
        style={{ 
          width: '100%', 
          borderRadius: '16px', 
          overflow: 'hidden', 
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.1)' 
        }}
      ></div>
    </div>
  );
};

// =========================================================================
// COMPONENT CHÍNH
// =========================================================================
export const TaskDetail = ({ task, userId, itineraryId, onBack, onCompleteSuccess }) => {
  const { latitude, longitude, accuracy, distance, error, loading } = useGeolocation(
    task.target_latitude,
    task.target_longitude
  );

  const [progressId, setProgressId] = useState(task.progress_id);
  const [taskStatus, setTaskStatus] = useState(task.status);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  // State phục vụ bổ sung riêng cho QA và QR
  const [selectedOption, setSelectedOption] = useState('');
  const [qrTokenInput, setQrTokenInput] = useState('');

  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Chỉ kích hoạt vòng đời IN_PROGRESS riêng cho dạng toán Chụp ảnh thực địa
  useEffect(() => {
    const handleStartTask = async () => {
      if (task.task_type !== 'PHOTO') return;
      try {
        setStarting(true);
        const response = await fetch(
          `http://127.0.0.1:8000/api/gamification/tasks/${task.task_id}/start?user_id=${userId}&itinerary_id=${itineraryId}`,
          { method: 'POST' }
        );
        if (!response.ok) throw new Error('Không thể đăng ký thực hiện thử thách.');
        const data = await response.json();
        setProgressId(data.progress_id);
        setTaskStatus('IN_PROGRESS');
      } catch (err) {
        setSubmitError(err.message);
      } finally {
        setStarting(false);
      }
    };

    if (taskStatus === 'NOT_STARTED') {
      handleStartTask();
    }
  }, [task, userId, itineraryId, taskStatus]);

  // Cập nhật hàm handleSubmit để nhận tham số qrScannedToken từ Camera
  const handleSubmit = async (qrScannedToken = null) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (task.task_type === 'PHOTO') {
        if (!imageFile || latitude === null || longitude === null || !progressId) {
          throw new Error('Vui lòng chụp ảnh và đợi tín hiệu GPS ổn định.');
        }
        const formData = new FormData();
        formData.append('progress_id', progressId);
        formData.append('latitude', latitude.toString());
        formData.append('longitude', longitude.toString());
        formData.append('photo', imageFile);

        const response = await fetch('http://127.0.0.1:8000/api/gamification/submissions/submit-photo', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Xác thực hình ảnh không đạt yêu cầu.');
        setSuccessData(data);
        setShowSuccessModal(true);

      } else if (task.task_type === 'QA') {
        if (!selectedOption) throw new Error('Vui lòng chọn một đáp án.');
        const response = await fetch('http://127.0.0.1:8000/api/v1/tasks/qa/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({
            task_id: task.task_id,
            selected_option: selectedOption
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Gửi đáp án thất bại.');
        if (!data.success) throw new Error(data.message || 'Đáp án chưa chính xác, thử lại nhé!');
        
        setSuccessData({
          message: data.message,
          exp_rewarded: data.reward_exp,
          confidence_score: 100,
          new_itinerary_exp: data.new_total_points,
          new_level: Math.floor(data.new_total_points / 1000) + 1
        });
        setShowSuccessModal(true);

      } else if (task.task_type === 'QR') {
        // Ưu tiên dùng token từ camera quét được, nếu không có thì dùng input nhập tay
        const tokenToSubmit = qrScannedToken || qrTokenInput;
        if (!tokenToSubmit) throw new Error('Vui lòng nhập hoặc quét mã QR.');

        const response = await fetch('http://127.0.0.1:8000/api/v1/tasks/qr/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({
            qr_token: tokenToSubmit,
            latitude: latitude || 10.762622, // Tọa độ fallback an toàn khi giả lập
            longitude: longitude || 106.660172
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Mã QR không trùng khớp hoặc ngoài phạm vi.');
        
        setSuccessData({
          message: data.message,
          exp_rewarded: data.reward_exp,
          confidence_score: 100,
          new_itinerary_exp: data.new_total_points,
          new_level: Math.floor(data.new_total_points / 1000) + 1
        });
        setShowSuccessModal(true);
      }
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isWithinRadius = distance !== null && distance <= task.radius_meters;

  return (
    <div className="task-detail-screen-gami">
      <div className="task-detail-header-gami">
        <button onClick={onBack} className="btn-back-gami">🡨 Rời Thử Thách</button>
        <span className="header-title-gami">🎮 CHINH PHỤC CỘT MỐC</span>
      </div>

      <div className="task-detail-body-gami">
        <div className="task-target-card">
          <div className="target-img-container">
            <img 
              src={task.reference_image_url || 'https://images.unsplash.com/photo-1509060464153-4466739f78d0?w=600'} 
              alt={task.title} 
              className="target-img"
            />
            <div className="reward-overlay">⭐ +{task.reward_exp} EXP</div>
          </div>
          <div className="target-info">
            <span className="diff-badge">{task.difficulty}</span>
            <h3>{task.title}</h3>
            {task.task_type === 'PHOTO' && <p className="task-desc">{task.description}</p>}
          </div>
        </div>

        {task.task_type === 'PHOTO' && (
          <>
            <div className="gps-status-box">
              <div className="gps-status-header">
                <h4>📡 SÓNG ĐỊNH VỊ GPS THỜI GIAN THỰC</h4>
                <span className={`gps-pill ${isWithinRadius ? 'valid' : 'invalid'}`}>
                  {isWithinRadius ? 'Đã vào phạm vi' : 'Chưa đến điểm'}
                </span>
              </div>
              <div className="gps-grid-data">
                <div className="gps-stat-item">
                  <span className="stat-label">Cự ly thực địa</span>
                  <span className="stat-value">{distance !== null ? `${Math.round(distance)}m` : 'Đang tìm...'}</span>
                  <span className="stat-hint">Yêu cầu ≤ {task.radius_meters}m</span>
                </div>
              </div>
            </div>

            <div className="camera-interact-box">
              <h4>📷 BÁO CÁO HÌNH ẢNH</h4>
              {!previewUrl ? (
                <div className={`camera-dash-upload ${isWithinRadius ? 'unlocked' : 'locked'}`}>
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setImageFile(e.target.files[0]);
                      setPreviewUrl(URL.createObjectURL(e.target.files[0]));
                    }
                  }} disabled={!isWithinRadius} id="cam-trigger" className="hidden-file-input" />
                  <label htmlFor={isWithinRadius ? "cam-trigger" : ""} className="camera-upload-label">
                    <div className="camera-icon-circle">📷</div>
                    <h5>Chụp toàn cảnh kiến trúc</h5>
                  </label>
                </div>
              ) : (
                <div className="image-preview-card">
                  <img src={previewUrl} alt="Preview" className="preview-img" />
                  <button className="btn-capture-again" onClick={() => { setImageFile(null); setPreviewUrl(null); }}>🔄 Chụp lại</button>
                </div>
              )}
              {submitError && <div className="submit-error-banner">⚠️ {submitError}</div>}
              {previewUrl && (
                <button className={`btn-submit-verification ${submitting ? 'loading' : ''}`} onClick={() => handleSubmit()} disabled={submitting}>
                  {submitting ? 'AI đang quét kiểm định...' : '🚀 Gửi phân tích ảnh'}
                </button>
              )}
            </div>
          </>
        )}

        {task.task_type === 'QA' && (
          <div className="camera-interact-box" style={{ gap: '15px' }}>
            <h4 style={{ color: '#34d399' }}>❓ TRẢ LỜI CÂU HỎI TRẮC NGHIỆM KHÁM PHÁ</h4>
            <p style={{ fontSize: '15px', fontWeight: 'bold', lineHeight: '1.4' }}>{task.question}</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {['A', 'B', 'C', 'D'].map((opt) => {
                const optText = task[`option_${opt.toLowerCase()}`];
                if (!optText) return null;
                const isSelected = selectedOption === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setSelectedOption(opt)}
                    style={{
                      textAlign: 'left', padding: '12px 15px', borderRadius: '12px', color: '#fff', fontSize: '13px', cursor: 'pointer',
                      border: isSelected ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)'
                    }}
                  >
                    <strong>{opt}.</strong> {optText}
                  </button>
                );
              })}
            </div>
            {submitError && <div className="submit-error-banner">⚠️ {submitError}</div>}
            <button className="btn-submit-verification" onClick={() => handleSubmit()} disabled={submitting || !selectedOption}>
              {submitting ? 'Đang chấm điểm...' : '🚀 Nộp kết quả'}
            </button>
          </div>
        )}

        {task.task_type === 'QR' && (
          <div className="camera-interact-box">
            <h4 style={{ color: '#fbbf24' }}>🔳 QUÉT MÃ QR XÁC THỰC HIỆN DIỆN</h4>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
              Hướng camera vào QR code hoặc nhập mã định danh:
            </p>

            {/* Component Camera quét QR thật */}
            <QRCameraScanner 
              onScanSuccess={(token) => handleSubmit(token)} 
            />

            <div style={{ textAlign: 'center', margin: '15px 0', color: '#94a3b8', fontSize: '12px' }}>
              Hoặc nhập tay:
            </div>
            
            <input 
              type="text" 
              placeholder="Nhập chuỗi QR Code (Ví dụ: QR_VANMIEU_TOKEN)"
              value={qrTokenInput}
              onChange={(e) => setQrTokenInput(e.target.value)}
              style={{
                width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '14px', boxSizing: 'border-box'
              }}
            />
            {submitError && <div className="submit-error-banner" style={{ width: '100%', marginTop: '10px' }}>⚠️ {submitError}</div>}
            
            <button 
              className="btn-submit-verification" 
              onClick={() => handleSubmit()} 
              disabled={submitting || (!qrTokenInput && !submitting)}
              style={{ marginTop: '15px' }}
            >
              {submitting ? 'Hệ thống đang kiểm tra...' : '🔒 Xác thực mã QR'}
            </button>
          </div>
        )}
      </div>

      {/* THÔNG BÁO HOÀN THÀNH VINH DANH CHUNG */}
      {showSuccessModal && (
        <div className="success-gami-modal">
          <div className="modal-card">
            <div className="badge-3d-hexagon">🏆</div>
            <h2>THỬ THÁCH HOÀN THÀNH!</h2>
            <p className="success-congrats-msg">{successData?.message}</p>
            <div className="score-reward-summary">
              <div className="reward-score-pill">
                <span className="score-label">THƯỞNG HỆ THỐNG</span>
                <span className="score-val">+{successData?.exp_rewarded} EXP</span>
              </div>
              <div className="reward-score-pill">
                <span className="score-label">ĐỘ CHÍNH XÁC</span>
                <span className="score-val">{successData?.confidence_score}% 🔥</span>
              </div>
            </div>
            <button className="btn-close-modal-gami" onClick={() => { setShowSuccessModal(false); onCompleteSuccess(); }}>
              Nhận Quà & Quay lại hành trình 🏁
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetail;