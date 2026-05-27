import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Camera, CheckCircle, HelpCircle, MapPin, QrCode, Radar, Users } from 'lucide-react';
import { enterpriseService } from '../services/enterpriseService';
import './EnterpriseDashboard.css';

const normalizeEvents = (events) => Array.isArray(events) ? events : [];

const questTypeMeta = {
    CHECKIN: { label: 'Check-in GPS', icon: MapPin },
    QR: { label: 'Quét QR', icon: QrCode },
    QUIZ: { label: 'Quiz', icon: HelpCircle },
    PHOTO: { label: 'Ảnh', icon: Camera },
};

const getQuestTypeMeta = (questType) => questTypeMeta[questType] || { label: questType || 'Quest', icon: HelpCircle };

const EnterpriseDashboard = ({ user }) => {
    const [profile, setProfile] = useState(null);
    const [events, setEvents] = useState([]);
    const [dailyFlow, setDailyFlow] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let mounted = true;

        const loadDashboard = async () => {
            setLoading(true);
            setError('');
            try {
                const [profileData, eventData, flowData] = await Promise.all([
                    enterpriseService.getEnterpriseProfile(),
                    enterpriseService.getEnterpriseEvents(),
                    enterpriseService.getEnterpriseDailyFlow(),
                ]);
                if (!mounted) return;
                setProfile(profileData);
                setEvents(normalizeEvents(eventData));
                setDailyFlow(Array.isArray(flowData) ? flowData : []);
            } catch (err) {
                if (mounted) setError(err.message || 'Không thể tải tổng quan doanh nghiệp.');
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadDashboard();
        return () => {
            mounted = false;
        };
    }, []);

    const stats = useMemo(() => {
        const totalVisits = events.reduce((sum, event) => sum + Number(event.scanned_count || 0), 0);
        const checkins = events
            .filter((event) => event.quest_type === 'CHECKIN')
            .reduce((sum, event) => sum + Number(event.scanned_count || 0), 0);
        const qrScans = events
            .filter((event) => event.quest_type === 'QR')
            .reduce((sum, event) => sum + Number(event.scanned_count || 0), 0);
        const activeCampaigns = events.filter((event) => event.is_active).length;

        return [
            { label: 'Tổng lượt tương tác', value: totalVisits, icon: Users },
            { label: 'Check-in', value: checkins, icon: MapPin },
            { label: 'QR scans', value: qrScans, icon: QrCode },
            { label: 'Chiến dịch active', value: activeCampaigns, icon: Radar },
        ];
    }, [events]);

    const displayName = profile?.business_name || user?.business_name || user?.full_name || 'Doanh nghiệp';
    const maxFlow = Math.max(...dailyFlow.map((item) => item.count || 0), 1);

    if (loading) {
        return <div className="enterprise-dashboard enterprise-state">Đang tải tổng quan...</div>;
    }

    if (error) {
        return <div className="enterprise-dashboard enterprise-state enterprise-state-error">{error}</div>;
    }

    return (
        <div className="enterprise-dashboard">
            <div className="enterprise-dashboard-header">
                <div>
                    <p className="enterprise-eyebrow">Tổng quan vận hành</p>
                    <h2>{displayName}</h2>
                    <span>{profile?.contact_email || user?.email}</span>
                </div>
                <span className={`enterprise-status-badge ${profile?.status === 'ACTIVE' ? 'active' : 'pending'}`}>
                    <CheckCircle size={14} /> {profile?.status || 'ACTIVE'}
                </span>
            </div>

            <div className="enterprise-stats-grid">
                {stats.map((item) => {
                    const Icon = item.icon;
                    return (
                        <div className="enterprise-stat-card" key={item.label}>
                            <span className="enterprise-stat-icon"><Icon size={18} /></span>
                            <h3>{Number(item.value || 0).toLocaleString('vi-VN')}</h3>
                            <p>{item.label}</p>
                        </div>
                    );
                })}
            </div>

            <section className="enterprise-panel">
                <div className="enterprise-panel-header">
                    <div>
                        <h3>Flow 7 ngày</h3>
                        <p>Lượt hoàn thành event theo ngày trong tuần</p>
                    </div>
                    <BarChart3 size={18} />
                </div>
                {dailyFlow.length === 0 ? (
                    <div className="enterprise-empty">Chưa có dữ liệu flow.</div>
                ) : (
                    <div className="enterprise-flow-chart">
                        {dailyFlow.map((item) => (
                            <div className="enterprise-flow-column" key={item.day}>
                                <div className="enterprise-flow-bar-wrap">
                                    <div
                                        className="enterprise-flow-bar"
                                        style={{ height: `${Math.max(6, ((item.count || 0) / maxFlow) * 100)}%` }}
                                    />
                                </div>
                                <strong>{item.count || 0}</strong>
                                <span>{item.day}</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="enterprise-panel">
                <div className="enterprise-panel-header">
                    <div>
                        <h3>Chiến dịch gần đây</h3>
                        <p>{events.length} chiến dịch đã tạo</p>
                    </div>
                </div>
                {events.length === 0 ? (
                    <div className="enterprise-empty">Chưa có chiến dịch. Tạo chiến dịch đầu tiên ở tab Chiến dịch.</div>
                ) : (
                    <div className="enterprise-mini-list">
                        {events.slice(0, 4).map((event) => {
                            const questMeta = getQuestTypeMeta(event.quest_type);
                            const QuestIcon = questMeta.icon;

                            return (
                                <article key={event.event_id}>
                                    <div>
                                        <strong>{event.title}</strong>
                                        <span className="enterprise-mini-meta">
                                            <QuestIcon size={13} /> {questMeta.label} · {event.radius_meters}m · {event.scanned_count || 0} lượt
                                        </span>
                                    </div>
                                    <span className={event.is_active ? 'active' : 'inactive'}>
                                        {event.is_active ? 'Active' : 'Đã đóng'}
                                    </span>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};

export default EnterpriseDashboard;
