import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorBarcodeScanner } from '@capacitor/barcode-scanner';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useGeolocation } from '../../hooks/useGeolocation';
import { API_BASE } from '../../config/api';
import { capturePhotoFile, pickPhotoFile, releasePreviewUrl } from '../../platform/camera';
import { storageGet } from '../../platform/storage';
import { 
  ArrowLeft, Gamepad2, Award, Radio, AlertTriangle, 
  Camera, RefreshCw, Info, Send, HelpCircle, 
  QrCode, Lock, Trophy, Flame, Flag, Scan
} from 'lucide-react';
import './TaskDetail.css';

const QRCameraScanner = ({ onScanSuccess, onScannerError }) => {
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) return undefined;

    let scanner = null;
    let isMounted = true;

    try {
      scanner = new Html5QrcodeScanner(
        'qr-reader',
        { qrbox: { width: 250, height: 250 }, fps: 10 },
        false
      );

      scanner.render(
        (decodedText) => {
          if (!isMounted) return;
          scanner.clear().catch(() => {});
          onScanSuccess(decodedText);
        },
        (errorMessage) => {
          if (!isMounted) return;
          if (
            typeof errorMessage === 'string' &&
            (errorMessage.includes('NotAllowedError') ||
              errorMessage.includes('Permission') ||
              errorMessage.includes('NotFoundError'))
          ) {
            onScannerError('Không thể khởi động camera QR. Vui lòng cấp quyền camera hoặc nhập mã thủ công.');
          }
        }
      );
    } catch (error) {
      onScannerError('Khởi tạo QR scanner thất bại. Bạn vẫn có thể nhập mã thủ công.');
    }

    return () => {
      isMounted = false;
      if (scanner) {
        scanner.clear().catch(() => {});
      }
    };
  }, [isNative, onScanSuccess, onScannerError]);

  const startNativeScan = async () => {
    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: 17, // CapacitorBarcodeScannerTypeHintALLOption.ALL
        scanInstructions: 'Hướng camera về phía mã QR để quét',
        cameraDirection: 1, // BACK
      });
      
      if (result && result.ScanResult) {
        onScanSuccess(result.ScanResult);
      }
    } catch (error) {
      if (error && error.message && !error.message.includes('canceled')) {
        onScannerError('Lỗi khởi động Native Scanner: ' + error.message);
      }
    }
  };

  if (isNative) {
    return (
      <div className="native-qr-wrapper" style={{ width: '100%', marginTop: '10px' }}>
        <button className="btn-submit-verification" onClick={startNativeScan} style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
          <Scan size={18} /> Mở Camera Quét Mã (Native)
        </button>
      </div>
    );
  }

  return (
    <div className="qr-camera-wrapper" style={{ width: '100%', marginTop: '10px' }}>
      <div
        id="qr-reader"
        style={{
          width: '100%',
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      />
    </div>
  );
};

export const TaskDetail = ({ task, userId, itineraryId, onBack, onCompleteSuccess }) => {
  const { latitude, longitude, distance, error, loading } = useGeolocation(
    task.target_latitude,
    task.target_longitude
  );

  const [progressId, setProgressId] = useState(task.progress_id);
  const [taskStatus, setTaskStatus] = useState(task.status);
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [selectedOption, setSelectedOption] = useState('');
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [qrScannerError, setQrScannerError] = useState('');
  const [photoHint, setPhotoHint] = useState('');

  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => () => releasePreviewUrl(previewUrl), [previewUrl]);

  useEffect(() => {
    const handleStartTask = async () => {
      if (task.task_type !== 'PHOTO') return;
      try {
        setStarting(true);
        const token = await storageGet('access_token');
        if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

        const response = await fetch(
          `${API_BASE}/api/gamification/tasks/${task.task_id}/start?user_id=${userId}&itinerary_id=${itineraryId}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
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

  const updatePhotoSelection = (file, nextPreviewUrl) => {
    releasePreviewUrl(previewUrl);
    setImageFile(file);
    setPreviewUrl(nextPreviewUrl);
  };

  const clearPhotoSelection = () => {
    releasePreviewUrl(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
  };

  const handleCapturePhoto = async () => {
    setSubmitError(null);
    setPhotoHint('');
    try {
      const result = await capturePhotoFile({ quality: 85 });
      updatePhotoSelection(result.file, result.previewUrl);
    } catch (err) {
      setPhotoHint('Nếu camera bị từ chối, hãy cấp quyền Camera trong cài đặt ứng dụng và thử lại.');
      setSubmitError(err.message || 'Không thể mở camera.');
    }
  };

  const handlePickPhoto = async () => {
    setSubmitError(null);
    setPhotoHint('');
    try {
      const result = await pickPhotoFile();
      updatePhotoSelection(result.file, result.previewUrl);
    } catch (err) {
      setSubmitError(err.message || 'Không thể chọn ảnh từ thư viện.');
    }
  };

  const handleSubmit = async (qrScannedToken = null) => {
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (task.task_type === 'PHOTO') {
        if (!imageFile || latitude === null || longitude === null || !progressId) {
          throw new Error('Vui lòng chụp ảnh và đợi GPS ổn định trước khi gửi.');
        }
        const token = await storageGet('access_token');
        if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

        const formData = new FormData();
        formData.append('progress_id', progressId);
        formData.append('latitude', latitude.toString());
        formData.append('longitude', longitude.toString());
        formData.append('photo', imageFile);

        const response = await fetch(`${API_BASE}/api/gamification/submissions/submit-photo`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Xác thực hình ảnh không đạt yêu cầu.');
        setSuccessData(data);
        setShowSuccessModal(true);
      } else if (task.task_type === 'QA') {
        if (!selectedOption) throw new Error('Vui lòng chọn một đáp án.');
        const token = await storageGet('access_token');
        if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        const response = await fetch(`${API_BASE}/api/v1/tasks/qa/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            task_id: task.task_id,
            selected_option: selectedOption,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Gửi đáp án thất bại.');
        if (!data.success) throw new Error(data.message || 'Đáp án chưa chính xác, thử lại nhé!');

        setSuccessData({
          message: data.message,
          exp_rewarded: data.reward_exp,
          confidence_score: 100,
          new_itinerary_exp: data.new_total_points,
          new_level: Math.floor(data.new_total_points / 1000) + 1,
        });
        setShowSuccessModal(true);
      } else if (task.task_type === 'QR') {
        const tokenToSubmit = (qrScannedToken || qrTokenInput || '').trim();
        if (!tokenToSubmit) throw new Error('Vui lòng nhập hoặc quét mã QR.');

        const token = await storageGet('access_token');
        if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        const response = await fetch(`${API_BASE}/api/v1/tasks/qr/scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            qr_token: tokenToSubmit,
            latitude: latitude || 10.762622,
            longitude: longitude || 106.660172,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Mã QR không trùng khớp hoặc ngoài phạm vi.');

        setSuccessData({
          message: data.message,
          exp_rewarded: data.reward_exp,
          confidence_score: 100,
          new_itinerary_exp: data.new_total_points,
          new_level: Math.floor(data.new_total_points / 1000) + 1,
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
        <button onClick={onBack} className="btn-back-gami" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Rời Thử Thách
        </button>
        <span className="header-title-gami" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Gamepad2 size={18} style={{ color: '#0abde3' }} /> CHINH PHỤC CỘT MỐC
        </span>
      </div>

      <div className="task-detail-body-gami">
        <div className="task-target-card">
          <div className="target-img-container">
            <img
              src={task.reference_image_url || '/assets/island/map-dao.png'}
              alt={task.title}
              className="target-img"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = '/assets/island/map-dao.png';
              }}
            />
            <div className="reward-overlay" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Award size={14} /> +{task.reward_exp} EXP
            </div>
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
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Radio size={16} style={{ color: '#0abde3' }} /> SÓNG ĐỊNH VỊ GPS THỜI GIAN THỰC
                </h4>
                <span className={`gps-pill ${loading ? 'loading' : isWithinRadius ? 'valid' : 'invalid'}`}>
                  {loading ? 'Đang tìm GPS' : isWithinRadius ? 'Đã vào phạm vi' : 'Chưa đến điểm'}
                </span>
              </div>
              <div className="gps-grid-data">
                <div className="gps-stat-item">
                  <span className="stat-label">Cự ly thực địa</span>
                  <span className="stat-value">{distance !== null ? `${Math.round(distance)}m` : 'Đang tìm...'}</span>
                  <span className="stat-hint">Yêu cầu ≤ {task.radius_meters}m</span>
                </div>
              </div>
              {error && <div className="gps-error-alert" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {error}</div>}
            </div>

            <div className="camera-interact-box">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Camera size={18} /> BÁO CÁO HÌNH ẢNH
              </h4>
              {!previewUrl ? (
                <div className={`camera-dash-upload ${isWithinRadius ? 'unlocked' : 'locked'}`}>
                  <div className="camera-upload-label">
                    <div className="camera-icon-circle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={24} />
                    </div>
                    <h5>Chụp toàn cảnh kiến trúc</h5>
                    <p>Bạn cần ở trong bán kính check-in để mở camera.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
                    <button
                      className="btn-submit-verification"
                      type="button"
                      onClick={handleCapturePhoto}
                      disabled={!isWithinRadius || starting}
                      style={{ flex: 1 }}
                    >
                      {starting ? 'Đang khởi tạo...' : 'Mở Camera'}
                    </button>
                    <button
                      className="btn-submit-verification"
                      type="button"
                      onClick={handlePickPhoto}
                      disabled={!isWithinRadius || starting}
                      style={{ flex: 1 }}
                    >
                      Chọn Thư Viện
                    </button>
                  </div>
                </div>
              ) : (
                <div className="image-preview-card">
                  <img src={previewUrl} alt="Preview" className="preview-img" />
                  <button className="btn-capture-again" onClick={clearPhotoSelection} style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                    <RefreshCw size={14} /> Chụp lại
                  </button>
                </div>
              )}
              {photoHint && <div className="submit-error-banner" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Info size={14} /> {photoHint}</div>}
              {submitError && <div className="submit-error-banner" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {submitError}</div>}
              {previewUrl && (
                <button className={`btn-submit-verification ${submitting ? 'loading' : ''}`} onClick={() => handleSubmit()} disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                  {submitting ? 'AI đang quét kiểm định...' : <><Send size={16} /> Gửi phân tích ảnh</>}
                </button>
              )}
            </div>
          </>
        )}

        {task.task_type === 'QA' && (
          <div className="camera-interact-box" style={{ gap: '15px' }}>
            <h4 style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <HelpCircle size={18} /> TRẢ LỜI CÂU HỎI TRẮC NGHIỆM KHÁM PHÁ
            </h4>
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
            {submitError && <div className="submit-error-banner" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {submitError}</div>}
            <button className="btn-submit-verification" onClick={() => handleSubmit()} disabled={submitting || !selectedOption} style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
              {submitting ? 'Đang chấm điểm...' : <><Send size={16} /> Nộp kết quả</>}
            </button>
          </div>
        )}

        {task.task_type === 'QR' && (
          <div className="camera-interact-box">
            <h4 style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <QrCode size={18} /> QUÉT MÃ QR XÁC THỰC HIỆN DIỆN
            </h4>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
              Hướng camera vào QR code hoặc nhập mã định danh:
            </p>

            <QRCameraScanner
              onScanSuccess={(token) => handleSubmit(token)}
              onScannerError={(message) => setQrScannerError(message)}
            />

            {qrScannerError && (
              <div className="submit-error-banner" style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={14} /> {qrScannerError}
              </div>
            )}

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
            {submitError && <div className="submit-error-banner" style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} /> {submitError}</div>}

            <button
              className="btn-submit-verification"
              onClick={() => handleSubmit()}
              disabled={submitting || !qrTokenInput.trim()}
              style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
            >
              {submitting ? 'Hệ thống đang kiểm tra...' : <><Lock size={16} /> Xác thực mã QR</>}
            </button>
          </div>
        )}
      </div>

      {showSuccessModal && (
        <div className="success-gami-modal">
          <div className="modal-card">
            <div className="badge-3d-hexagon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trophy size={40} style={{ color: '#fbc531' }} />
            </div>
            <h2>THỬ THÁCH HOÀN THÀNH!</h2>
            <p className="success-congrats-msg">{successData?.message}</p>
            <div className="score-reward-summary">
              <div className="reward-score-pill">
                <span className="score-label">THƯỞNG HỆ THỐNG</span>
                <span className="score-val">+{successData?.exp_rewarded} EXP</span>
              </div>
              <div className="reward-score-pill">
                <span className="score-label">ĐỘ CHÍNH XÁC</span>
                <span className="score-val" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {successData?.confidence_score}% <Flame size={14} style={{ color: '#ff7f50' }} />
                </span>
              </div>
            </div>
            <button className="btn-close-modal-gami" onClick={() => { setShowSuccessModal(false); onCompleteSuccess(); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
              Nhận Quà & Quay lại hành trình <Flag size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDetail;

