import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart2,
    CalendarClock,
    Camera,
    Copy,
    HelpCircle,
    LayoutDashboard,
    LogOut,
    MapPin,
    Plus,
    QrCode,
    Save,
    Settings,
    Ticket,
    Trash2,
} from 'lucide-react';
import EnterpriseDashboard from './EnterpriseDashboard';
import { enterpriseService } from '../services/enterpriseService';
import { getCurrentPosition } from '../platform/location';
import './EnterpriseTabs.css';

const defaultCampaignForm = () => {
    const start = new Date();
    const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
        title: '',
        description: '',
        quest_type: 'CHECKIN',
        latitude: '10.776797',
        longitude: '106.700981',
        radius_meters: 100,
        reward_exp: 100,
        reward_coin: 50,
        start_time: start.toISOString().slice(0, 16),
        end_time: end.toISOString().slice(0, 16),
        max_scans: 100,
    };
};

const navItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Chiến dịch', icon: CalendarClock },
    { id: 'locations', label: 'Địa điểm', icon: MapPin },
    { id: 'vouchers', label: 'Voucher', icon: Ticket },
    { id: 'profile', label: 'Hồ sơ', icon: Settings },
];

const questTypeMeta = {
    CHECKIN: { label: 'Check-in GPS', icon: MapPin },
    QR: { label: 'Quét QR', icon: QrCode },
    QUIZ: { label: 'Quiz', icon: HelpCircle },
    PHOTO: { label: 'Ảnh', icon: Camera },
};

const getQuestTypeMeta = (questType) => questTypeMeta[questType] || { label: questType || 'Quest', icon: HelpCircle };

const getQrImageUrl = (value) => (
    `https://api.qrserver.com/v1/create-qr-code/?size=128x128&margin=10&data=${encodeURIComponent(value)}`
);

const EnterpriseTabs = ({ user, onLogout, onOpenLocationRegister }) => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const contentRef = useRef(null);
    const [events, setEvents] = useState([]);
    const [locations, setLocations] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [showCampaignForm, setShowCampaignForm] = useState(false);
    const [campaignForm, setCampaignForm] = useState(defaultCampaignForm);
    const [profileForm, setProfileForm] = useState({
        business_name: '',
        contact_person: '',
        contact_email: '',
        contact_phone: '',
    });

    const loadProfile = useCallback(async () => {
        const data = await enterpriseService.getEnterpriseProfile();
        setProfile(data);
        setProfileForm({
            business_name: data?.business_name || user?.business_name || '',
            contact_person: data?.contact_person || user?.contact_person || '',
            contact_email: data?.contact_email || user?.email || '',
            contact_phone: data?.contact_phone || user?.contact_phone || '',
        });
    }, [user]);

    const loadEvents = useCallback(async () => {
        setEvents(await enterpriseService.getEnterpriseEvents());
    }, []);

    const loadLocations = useCallback(async () => {
        const [locationData, submissionData] = await Promise.all([
            enterpriseService.getEnterpriseLocations(),
            enterpriseService.getEnterpriseLocationSubmissions(),
        ]);
        setLocations(Array.isArray(locationData) ? locationData : []);
        setSubmissions(Array.isArray(submissionData) ? submissionData : []);
    }, []);

    useEffect(() => {
        let mounted = true;
        const loadTab = async () => {
            setLoading(true);
            setError('');
            setMessage('');
            try {
                if (activeTab === 'campaigns') await loadEvents();
                if (activeTab === 'locations') await loadLocations();
                if (activeTab === 'profile') await loadProfile();
            } catch (err) {
                if (mounted) setError(err.message || 'Không thể tải dữ liệu doanh nghiệp.');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        loadTab();
        return () => {
            mounted = false;
        };
    }, [activeTab, loadEvents, loadLocations, loadProfile]);

    const campaignStats = useMemo(() => ({
        active: events.filter((event) => event.is_active).length,
        scans: events.reduce((sum, event) => sum + Number(event.scanned_count || 0), 0),
    }), [events]);

    const updateCampaignForm = (field, value) => {
        setCampaignForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleTabSelect = (tabId) => {
        setActiveTab(tabId);
        requestAnimationFrame(() => {
            contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        });
    };

    const handleUseCurrentGps = async () => {
        setActionLoading(true);
        setError('');
        try {
            const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
            setCampaignForm((prev) => ({
                ...prev,
                latitude: position.latitude.toFixed(6),
                longitude: position.longitude.toFixed(6),
            }));
        } catch (err) {
            setError('Không lấy được GPS hiện tại. Bạn có thể nhập tọa độ thủ công.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreateCampaign = async (event) => {
        event.preventDefault();
        setActionLoading(true);
        setError('');
        setMessage('');
        try {
            const payload = {
                ...campaignForm,
                latitude: parseFloat(campaignForm.latitude),
                longitude: parseFloat(campaignForm.longitude),
                radius_meters: parseInt(campaignForm.radius_meters, 10),
                reward_exp: parseInt(campaignForm.reward_exp, 10),
                reward_coin: parseInt(campaignForm.reward_coin, 10),
                max_scans: parseInt(campaignForm.max_scans, 10),
                start_time: new Date(campaignForm.start_time).toISOString(),
                end_time: new Date(campaignForm.end_time).toISOString(),
            };
            await enterpriseService.createEnterpriseEvent(payload);
            setCampaignForm(defaultCampaignForm());
            setShowCampaignForm(false);
            setMessage('Đã tạo chiến dịch thành công.');
            await loadEvents();
        } catch (err) {
            setError(err.message || 'Tạo chiến dịch thất bại.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteCampaign = async (eventId) => {
        setActionLoading(true);
        setError('');
        setMessage('');
        try {
            await enterpriseService.deleteEnterpriseEvent(eventId);
            setMessage('Đã hủy kích hoạt chiến dịch.');
            await loadEvents();
        } catch (err) {
            setError(err.message || 'Không thể hủy chiến dịch.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleProfileSave = async (event) => {
        event.preventDefault();
        setActionLoading(true);
        setError('');
        setMessage('');
        try {
            await enterpriseService.updateEnterpriseProfile(profileForm);
            await loadProfile();
            setMessage('Đã cập nhật hồ sơ doanh nghiệp.');
        } catch (err) {
            setError(err.message || 'Không thể cập nhật hồ sơ.');
        } finally {
            setActionLoading(false);
        }
    };

    const renderCampaigns = () => (
        <section className="enterprise-section">
            <div className="enterprise-section-header">
                <div>
                    <p>{campaignStats.active} active · {campaignStats.scans} lượt tương tác</p>
                    <h2>Chiến dịch O2O</h2>
                </div>
                <button type="button" className="enterprise-primary-btn" onClick={() => setShowCampaignForm(true)}>
                    <Plus size={16} /> Tạo mới
                </button>
            </div>

            {showCampaignForm && (
                <form className="enterprise-form-panel" onSubmit={handleCreateCampaign}>
                    <div className="enterprise-form-grid">
                        <label>
                            Tên chiến dịch
                            <input value={campaignForm.title} onChange={(e) => updateCampaignForm('title', e.target.value)} required />
                        </label>
                        <label>
                            Loại quest
                            <select value={campaignForm.quest_type} onChange={(e) => updateCampaignForm('quest_type', e.target.value)}>
                                <option value="CHECKIN">GPS Check-in</option>
                                <option value="QR">Quét QR</option>
                                <option value="QUIZ">Quiz</option>
                                <option value="PHOTO">Photo</option>
                            </select>
                        </label>
                        <label className="enterprise-form-wide">
                            Mô tả
                            <textarea value={campaignForm.description} onChange={(e) => updateCampaignForm('description', e.target.value)} required />
                        </label>
                        <label>
                            Latitude
                            <input value={campaignForm.latitude} onChange={(e) => updateCampaignForm('latitude', e.target.value)} required />
                        </label>
                        <label>
                            Longitude
                            <input value={campaignForm.longitude} onChange={(e) => updateCampaignForm('longitude', e.target.value)} required />
                        </label>
                        <label>
                            Bán kính (m)
                            <input type="number" min="0" value={campaignForm.radius_meters} onChange={(e) => updateCampaignForm('radius_meters', e.target.value)} />
                        </label>
                        <label>
                            Reward EXP
                            <input type="number" min="0" value={campaignForm.reward_exp} onChange={(e) => updateCampaignForm('reward_exp', e.target.value)} />
                        </label>
                        <label>
                            Reward coin
                            <input type="number" min="0" value={campaignForm.reward_coin} onChange={(e) => updateCampaignForm('reward_coin', e.target.value)} />
                        </label>
                        {campaignForm.quest_type === 'QR' && (
                            <label>
                                Max scans
                                <input type="number" min="1" value={campaignForm.max_scans} onChange={(e) => updateCampaignForm('max_scans', e.target.value)} />
                            </label>
                        )}
                        <label>
                            Bắt đầu
                            <input type="datetime-local" value={campaignForm.start_time} onChange={(e) => updateCampaignForm('start_time', e.target.value)} required />
                        </label>
                        <label>
                            Kết thúc
                            <input type="datetime-local" value={campaignForm.end_time} onChange={(e) => updateCampaignForm('end_time', e.target.value)} required />
                        </label>
                    </div>
                    <div className="enterprise-action-row">
                        <button type="button" className="enterprise-secondary-btn" onClick={handleUseCurrentGps} disabled={actionLoading}>
                            <MapPin size={16} /> Dùng GPS hiện tại
                        </button>
                        <button type="button" className="enterprise-secondary-btn" onClick={() => setShowCampaignForm(false)}>
                            Hủy
                        </button>
                        <button type="submit" className="enterprise-primary-btn" disabled={actionLoading}>
                            <Save size={16} /> Lưu chiến dịch
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="enterprise-empty">Đang tải chiến dịch...</div>
            ) : events.length === 0 ? (
                <div className="enterprise-empty">Chưa có chiến dịch nào.</div>
            ) : (
                <div className="enterprise-card-list">
                    {events.map((event) => {
                        const questMeta = getQuestTypeMeta(event.quest_type);
                        const QuestIcon = questMeta.icon;

                        return (
                            <article className="enterprise-campaign-card" key={event.event_id}>
                                <div className="enterprise-card-main">
                                    <div>
                                        <h3>{event.title}</h3>
                                        <p>{event.description}</p>
                                    </div>
                                    <span className={event.is_active ? 'enterprise-badge active' : 'enterprise-badge inactive'}>
                                        {event.is_active ? 'Active' : 'Đã đóng'}
                                    </span>
                                </div>
                                <div className="enterprise-meta-grid">
                                    <span><QuestIcon size={14} /> {questMeta.label}</span>
                                    <span><MapPin size={14} /> {event.radius_meters}m</span>
                                    <span><BarChart2 size={14} /> {event.scanned_count || 0} lượt</span>
                                    <span><CalendarClock size={14} /> {new Date(event.end_time).toLocaleDateString('vi-VN')}</span>
                                </div>
                                {event.quest_type === 'QR' && event.qr_token && (
                                    <div className="enterprise-qr-row">
                                        <div className="enterprise-qr-preview" aria-label={`QR cho ${event.title}`}>
                                            <img
                                                src={getQrImageUrl(event.qr_token)}
                                                alt={`QR cho ${event.title}`}
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.nextElementSibling?.classList.add('visible');
                                                }}
                                            />
                                            <span className="enterprise-qr-fallback"><QrCode size={34} /></span>
                                        </div>
                                        <div className="enterprise-qr-info">
                                            <strong>QR check-in</strong>
                                            <span>Dùng cho khách quét tại điểm chiến dịch</span>
                                        </div>
                                        <button
                                            type="button"
                                            aria-label="Copy nội dung QR"
                                            title="Copy nội dung QR"
                                            onClick={() => navigator.clipboard?.writeText(event.qr_token)}
                                        >
                                            <Copy size={16} />
                                        </button>
                                    </div>
                                )}
                                {event.is_active && (
                                    <button type="button" className="enterprise-danger-btn" disabled={actionLoading} onClick={() => handleDeleteCampaign(event.event_id)}>
                                        <Trash2 size={16} /> Hủy kích hoạt
                                    </button>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );

    const renderLocations = () => (
        <section className="enterprise-section">
            <div className="enterprise-section-header">
                <div>
                    <p>{locations.length} địa điểm active · {submissions.length} yêu cầu</p>
                    <h2>Địa điểm doanh nghiệp</h2>
                </div>
                <button type="button" className="enterprise-primary-btn" onClick={onOpenLocationRegister}>
                    <Plus size={16} /> Đăng địa điểm
                </button>
            </div>

            {loading ? (
                <div className="enterprise-empty">Đang tải địa điểm...</div>
            ) : (
                <>
                    <h3 className="enterprise-subtitle">Địa điểm đang quản lý</h3>
                    {locations.length === 0 ? (
                        <div className="enterprise-empty">Chưa có địa điểm được duyệt.</div>
                    ) : (
                        <div className="enterprise-card-list">
                            {locations.map((location) => (
                                <article className="enterprise-location-card" key={location.location_id}>
                                    <h3>{location.location_name}</h3>
                                    <p>{location.address || 'Chưa có địa chỉ'}</p>
                                    <span>{location.min_price} - {location.max_price} {location.currency}</span>
                                </article>
                            ))}
                        </div>
                    )}

                    <h3 className="enterprise-subtitle">Yêu cầu kiểm duyệt</h3>
                    {submissions.length === 0 ? (
                        <div className="enterprise-empty">Không có yêu cầu đang xử lý.</div>
                    ) : (
                        <div className="enterprise-card-list">
                            {submissions.map((submission) => (
                                <article className="enterprise-submission-card" key={submission.submission_id}>
                                    <div>
                                        <strong>{submission.type}</strong>
                                        <span>{new Date(submission.created_at).toLocaleString('vi-VN')}</span>
                                    </div>
                                    <span className={`enterprise-badge ${submission.status?.toLowerCase()}`}>
                                        {submission.status}
                                    </span>
                                    {submission.reject_reason && <p>{submission.reject_reason}</p>}
                                </article>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );

    const renderVouchers = () => (
        <section className="enterprise-section">
            <div className="enterprise-section-header">
                <div>
                    <p>MVP</p>
                    <h2>Voucher</h2>
                </div>
            </div>
            <div className="enterprise-empty">
                Module voucher cần CRUD/audit riêng nên chưa bật dữ liệu giả trong production path.
            </div>
        </section>
    );

    const renderProfile = () => (
        <section className="enterprise-section">
            <div className="enterprise-section-header">
                <div>
                    <p>{profile?.status || 'ACTIVE'}</p>
                    <h2>Hồ sơ doanh nghiệp</h2>
                </div>
            </div>
            <form className="enterprise-form-panel" onSubmit={handleProfileSave}>
                <div className="enterprise-form-grid">
                    <label>
                        Tên doanh nghiệp
                        <input value={profileForm.business_name} onChange={(e) => setProfileForm({ ...profileForm, business_name: e.target.value })} required />
                    </label>
                    <label>
                        Người đại diện
                        <input value={profileForm.contact_person} onChange={(e) => setProfileForm({ ...profileForm, contact_person: e.target.value })} required />
                    </label>
                    <label>
                        Email liên hệ
                        <input type="email" value={profileForm.contact_email} onChange={(e) => setProfileForm({ ...profileForm, contact_email: e.target.value })} required />
                    </label>
                    <label>
                        Số điện thoại
                        <input value={profileForm.contact_phone} onChange={(e) => setProfileForm({ ...profileForm, contact_phone: e.target.value })} required />
                    </label>
                </div>
                <div className="enterprise-action-row">
                    <button type="submit" className="enterprise-primary-btn" disabled={actionLoading}>
                        <Save size={16} /> Lưu hồ sơ
                    </button>
                    <button type="button" className="enterprise-danger-btn" onClick={onLogout}>
                        <LogOut size={16} /> Đăng xuất
                    </button>
                </div>
            </form>
        </section>
    );

    const renderContent = () => {
        if (activeTab === 'dashboard') return <EnterpriseDashboard user={user} />;
        if (activeTab === 'campaigns') return renderCampaigns();
        if (activeTab === 'locations') return renderLocations();
        if (activeTab === 'vouchers') return renderVouchers();
        return renderProfile();
    };

    return (
        <div className="enterprise-layout">
            <div className="enterprise-content" ref={contentRef}>
                {(message || error) && (
                    <div className={`enterprise-message ${error ? 'error' : 'success'}`}>
                        {error || message}
                    </div>
                )}
                {renderContent()}
            </div>

            <nav className="enterprise-bottom-nav" aria-label="Enterprise navigation">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={activeTab === item.id ? 'active' : ''}
                            aria-label={item.label}
                            title={item.label}
                            onClick={() => handleTabSelect(item.id)}
                        >
                            <Icon size={22} aria-hidden="true" />
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

export default EnterpriseTabs;
