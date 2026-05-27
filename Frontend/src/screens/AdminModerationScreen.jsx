import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowLeft,
    BarChart3,
    Building2,
    Check,
    ClipboardList,
    Coins,
    FileText,
    Lock,
    MapPin,
    Minus,
    MoreVertical,
    RefreshCw,
    RotateCcw,
    Search,
    Shield,
    Trash2,
    Unlock,
    User,
    Users,
    X,
} from 'lucide-react';
import { adminService } from '../services/adminService';
import './AdminModerationScreen.css';

const tabs = [
    { id: 'enterprise', label: 'DN', title: 'Doanh nghiệp', icon: Building2 },
    { id: 'location', label: 'Địa điểm', title: 'Địa điểm', icon: MapPin },
    { id: 'users', label: 'Users', title: 'Thành viên', icon: Users },
    { id: 'stats', label: 'Stats', title: 'Thống kê', icon: BarChart3 },
    { id: 'reports', label: 'Reports', title: 'Báo cáo', icon: FileText },
];

const formatDate = (value) => {
    if (!value) return 'Chưa có';
    return new Date(value).toLocaleString('vi-VN');
};

const formatMetric = (value) => (
    value === null || value === undefined
        ? '...'
        : Number(value || 0).toLocaleString('vi-VN')
);

const Field = ({ label, value }) => (
    <div className="admin-field">
        <span>{label}</span>
        <strong>{value || 'Chưa cập nhật'}</strong>
    </div>
);

export default function AdminModerationScreen({ onBack }) {
    const [activeTab, setActiveTab] = useState('enterprise');
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [overviewLoading, setOverviewLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [overview, setOverview] = useState({
        pendingEnterprises: null,
        pendingLocations: null,
        totalUsers: null,
        reports: null,
        totalPoints: null,
    });
    const [pendingEnterprises, setPendingEnterprises] = useState([]);
    const [selectedEnterprise, setSelectedEnterprise] = useState(null);
    const [locationSubmissions, setLocationSubmissions] = useState([]);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [submissionDetail, setSubmissionDetail] = useState(null);
    const [usersList, setUsersList] = useState([]);
    const [stats, setStats] = useState(null);
    const [reports, setReports] = useState([]);

    const [userSearch, setUserSearch] = useState('');
    const [userActionTarget, setUserActionTarget] = useState(null);
    const [userActionView, setUserActionView] = useState('menu');
    const [pointsAmount, setPointsAmount] = useState('');
    const [rejectModal, setRejectModal] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [confirmModal, setConfirmModal] = useState(null);
    const [isViolationMode, setIsViolationMode] = useState(false);

    const loadOverview = useCallback(async () => {
        setOverviewLoading(true);
        try {
            const [enterpriseResult, locationResult, statsResult, reportsResult] = await Promise.allSettled([
                adminService.getPendingEnterprises(),
                adminService.getLocationSubmissions(),
                adminService.getAdminStats(),
                adminService.getReports(),
            ]);

            setOverview((current) => ({
                pendingEnterprises: enterpriseResult.status === 'fulfilled'
                    ? enterpriseResult.value.length
                    : current.pendingEnterprises,
                pendingLocations: locationResult.status === 'fulfilled'
                    ? locationResult.value.length
                    : current.pendingLocations,
                totalUsers: statsResult.status === 'fulfilled'
                    ? statsResult.value.total_users
                    : current.totalUsers,
                reports: reportsResult.status === 'fulfilled'
                    ? reportsResult.value.length
                    : current.reports,
                totalPoints: statsResult.status === 'fulfilled'
                    ? statsResult.value.total_points_awarded
                    : current.totalPoints,
            }));
        } finally {
            setOverviewLoading(false);
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        setNotice('');
        try {
            if (activeTab === 'enterprise') {
                const data = await adminService.getPendingEnterprises();
                setPendingEnterprises(data);
                setOverview((current) => ({ ...current, pendingEnterprises: data.length }));
                setSelectedEnterprise(null);
            } else if (activeTab === 'location') {
                const data = await adminService.getLocationSubmissions();
                setLocationSubmissions(data);
                setOverview((current) => ({ ...current, pendingLocations: data.length }));
                setSelectedSubmission(null);
                setSubmissionDetail(null);
            } else if (activeTab === 'users') {
                const data = await adminService.getAdminUsers();
                setUsersList(data);
                setOverview((current) => ({ ...current, totalUsers: data.length }));
            } else if (activeTab === 'stats') {
                const data = await adminService.getAdminStats();
                setStats(data);
                setOverview((current) => ({
                    ...current,
                    totalUsers: data.total_users,
                    pendingEnterprises: data.pending_enterprises,
                    totalPoints: data.total_points_awarded,
                }));
            } else if (activeTab === 'reports') {
                const [reportsData, usersData] = await Promise.all([
                    adminService.getReports(),
                    adminService.getAdminUsers(),
                ]);
                setReports(reportsData);
                setUsersList(usersData);
                setOverview((current) => ({
                    ...current,
                    reports: reportsData.length,
                    totalUsers: usersData.length,
                }));
            }
        } catch (err) {
            setError(err.message || 'Không thể tải dữ liệu quản trị.');
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    const runAction = async (action, successMessage) => {
        setActionLoading(true);
        setError('');
        setNotice('');
        try {
            await action();
            await Promise.all([loadData(), loadOverview()]);
            setNotice(successMessage);
            return true;
        } catch (err) {
            setError(err.message || 'Thao tác thất bại.');
            return false;
        } finally {
            setActionLoading(false);
            setConfirmModal(null);
            setRejectModal(null);
            setRejectReason('');
        }
    };

    const openSubmission = async (submission) => {
        setSelectedSubmission(submission);
        setSubmissionDetail(null);
        setLoading(true);
        setError('');
        try {
            setSubmissionDetail(await adminService.getLocationSubmissionDetail(submission.submission_id));
        } catch (err) {
            setError(err.message || 'Không thể tải chi tiết địa điểm.');
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = useMemo(() => {
        const keyword = userSearch.trim().toLowerCase();
        if (!keyword) return usersList;
        return usersList.filter((item) =>
            [item.name, item.email, item.role].some((value) =>
                String(value || '').toLowerCase().includes(keyword)
            )
        );
    }, [usersList, userSearch]);


    const getTabCount = (tabId) => {
        if (tabId === 'enterprise') return overview.pendingEnterprises;
        if (tabId === 'location') return overview.pendingLocations;
        if (tabId === 'users') return overview.totalUsers;
        if (tabId === 'reports') return overview.reports;
        return null;
    };


    const openQueueCount = overview.pendingEnterprises === null && overview.pendingLocations === null
        ? null
        : Number(overview.pendingEnterprises || 0) + Number(overview.pendingLocations || 0);

    const closeUserAction = () => {
        setUserActionTarget(null);
        setUserActionView('menu');
        setPointsAmount('');
        setIsViolationMode(false);
    };

    const runUserAction = async (action, successMessage) => {
        const ok = await runAction(action, successMessage);
        if (ok) closeUserAction();
    };

    const submitReject = (event) => {
        event.preventDefault();
        if (!rejectModal || !rejectReason.trim()) return;
        if (rejectModal.type === 'enterprise') {
            runAction(
                () => adminService.rejectEnterprise(rejectModal.id, rejectReason.trim()),
                'Đã từ chối hồ sơ doanh nghiệp.'
            );
        } else {
            runAction(
                () => adminService.rejectLocationSubmission(rejectModal.id, rejectReason.trim()),
                'Đã từ chối yêu cầu địa điểm.'
            );
        }
    };

    const submitDeductPoints = (event) => {
        event.preventDefault();
        if (!userActionTarget || !pointsAmount) return;
        runUserAction(
            () => adminService.updateUserPoints(userActionTarget.id, 'deduct', parseInt(pointsAmount, 10)),
            `Đã trừ ${pointsAmount} điểm của ${userActionTarget.name}.`
        );
    };

    const handleActionUser = async (targetUserId) => {
        const targetIdLower = targetUserId.toLowerCase();
        let foundUser = usersList.find((u) => u.id.toLowerCase() === targetIdLower);
        if (!foundUser) {
            try {
                setLoading(true);
                const data = await adminService.getAdminUsers();
                setUsersList(data);
                foundUser = data.find((u) => u.id.toLowerCase() === targetIdLower);
            } catch (err) {
                setError('Không thể tải danh sách người dùng.');
            } finally {
                setLoading(false);
            }
        }
        
        if (foundUser) {
            setUserActionTarget(foundUser);
            setUserActionView('menu');
            setPointsAmount('');
            setIsViolationMode(true);
        } else {
            setError('Không tìm thấy thành viên này trong hệ thống.');
        }
    };

    const renderEnterprise = () => {
        if (selectedEnterprise) {
            return (
                <section className="admin-panel">
                    <div className="admin-panel-header">
                        <div>
                            <p>Hồ sơ chờ duyệt</p>
                            <h2>{selectedEnterprise.business_name}</h2>
                        </div>
                        <button type="button" className="admin-secondary-btn" onClick={() => setSelectedEnterprise(null)}>
                            Đóng
                        </button>
                    </div>
                    <div className="admin-fields-grid">
                        <Field label="Người đại diện" value={selectedEnterprise.contact_person} />
                        <Field label="Email liên hệ" value={selectedEnterprise.contact_email} />
                        <Field label="Số điện thoại" value={selectedEnterprise.contact_phone} />
                        <Field label="Ngày gửi" value={formatDate(selectedEnterprise.created_at)} />
                    </div>
                    <div className="admin-action-row">
                        <button
                            type="button"
                            className="admin-danger-btn"
                            disabled={actionLoading}
                            onClick={() => setRejectModal({ type: 'enterprise', id: selectedEnterprise.enterprise_id })}
                        >
                            <X size={16} /> Từ chối
                        </button>
                        <button
                            type="button"
                            className="admin-primary-btn"
                            disabled={actionLoading}
                            onClick={() => setConfirmModal({
                                title: 'Duyệt doanh nghiệp',
                                message: `Cấp role ENTERPRISE cho ${selectedEnterprise.business_name}?`,
                                action: () => adminService.approveEnterprise(selectedEnterprise.enterprise_id),
                                success: 'Đã phê duyệt doanh nghiệp.',
                            })}
                        >
                            <Check size={16} /> Phê duyệt
                        </button>
                    </div>
                </section>
            );
        }

        if (pendingEnterprises.length === 0) {
            return <EmptyState icon={Check} text="Không có hồ sơ doanh nghiệp nào chờ duyệt." />;
        }

        return (
            <div className="admin-list">
                {pendingEnterprises.map((enterprise) => (
                    <button
                        type="button"
                        className="admin-list-item"
                        key={enterprise.enterprise_id}
                        onClick={() => setSelectedEnterprise(enterprise)}
                    >
                        <span className="admin-item-icon"><Building2 size={18} /></span>
                        <span className="admin-list-copy">
                            <strong>{enterprise.business_name}</strong>
                            <small>{enterprise.contact_person} · {enterprise.contact_email}</small>
                        </span>
                        <span className="admin-list-meta">{formatDate(enterprise.created_at)}</span>
                    </button>
                ))}
            </div>
        );
    };

    const renderLocation = () => {
        if (selectedSubmission && submissionDetail) {
            const pending = submissionDetail.pending_data || {};
            return (
                <section className="admin-panel">
                    <div className="admin-panel-header">
                        <div>
                            <p>{submissionDetail.type} · {submissionDetail.status}</p>
                            <h2>{pending.location_name || 'Đề xuất địa điểm'}</h2>
                        </div>
                        <button
                            type="button"
                            className="admin-secondary-btn"
                            onClick={() => {
                                setSelectedSubmission(null);
                                setSubmissionDetail(null);
                            }}
                        >
                            Đóng
                        </button>
                    </div>

                    {submissionDetail.duplicate_warnings?.length > 0 && (
                        <div className="admin-warning-box">
                            <AlertTriangle size={16} />
                            <div>
                                <strong>Cảnh báo trùng lặp</strong>
                                {submissionDetail.duplicate_warnings.map((warning, index) => (
                                    <p key={`${warning.location_name}-${index}`}>
                                        {warning.location_name}: {warning.reasons?.join(', ')}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="admin-fields-grid">
                        <Field label="Địa chỉ" value={pending.address} />
                        <Field label="Tọa độ" value={`${pending.latitude || '-'}, ${pending.longitude || '-'}`} />
                        <Field label="Doanh nghiệp" value={submissionDetail.enterprise?.business_name} />
                        <Field label="Giờ hoạt động" value={`${pending.open_time || '-'} - ${pending.close_time || '-'}`} />
                        <Field label="Khoảng giá" value={`${pending.min_price || 0} - ${pending.max_price || 0} ${pending.currency || 'VND'}`} />
                        <Field label="Ngày gửi" value={formatDate(submissionDetail.created_at)} />
                    </div>

                    <div className="admin-action-row">
                        <button
                            type="button"
                            className="admin-danger-btn"
                            disabled={actionLoading}
                            onClick={() => setRejectModal({ type: 'location', id: submissionDetail.submission_id })}
                        >
                            <X size={16} /> Từ chối
                        </button>
                        <button
                            type="button"
                            className="admin-primary-btn"
                            disabled={actionLoading}
                            onClick={() => setConfirmModal({
                                title: 'Duyệt địa điểm',
                                message: `Tạo/cập nhật location thật cho "${pending.location_name}"?`,
                                action: () => adminService.approveLocationSubmission(submissionDetail.submission_id),
                                success: 'Đã phê duyệt địa điểm.',
                            })}
                        >
                            <Check size={16} /> Phê duyệt
                        </button>
                    </div>
                </section>
            );
        }

        if (locationSubmissions.length === 0) {
            return <EmptyState icon={Check} text="Không có yêu cầu địa điểm nào chờ duyệt." />;
        }

        return (
            <div className="admin-list">
                {locationSubmissions.map((submission) => (
                    <button
                        type="button"
                        className="admin-list-item"
                        key={submission.submission_id}
                        onClick={() => openSubmission(submission)}
                    >
                        <span className="admin-item-icon"><MapPin size={18} /></span>
                        <span className="admin-list-copy">
                            <strong>{submission.location_name || 'Địa điểm chưa đặt tên'}</strong>
                            <small>{submission.enterprise_name} · {submission.type}</small>
                        </span>
                        <span className="admin-status-pill">Pending</span>
                    </button>
                ))}
            </div>
        );
    };

    const renderUsers = () => (
        <section className="admin-stack">
            <div className="admin-toolbar">
                <div className="admin-search">
                    <Search size={16} />
                    <input
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        placeholder="Tìm theo tên, email hoặc role"
                    />
                </div>
            </div>

            <div className="admin-list">
                {filteredUsers.map((item) => (
                    <div className="admin-user-row" key={item.id}>
                        <div className="admin-user-avatar"><User size={18} /></div>
                        <div>
                            <strong>{item.name}</strong>
                            <small>{item.email} · {item.total_points || 0} điểm</small>
                        </div>
                        <span className={`admin-role-pill ${item.status === 'BANNED' ? 'locked' : ''}`}>
                            {item.status === 'BANNED' ? 'Khóa' : item.role}
                        </span>
                        <button
                            type="button"
                            className="admin-icon-action-btn"
                            onClick={() => {
                                setUserActionTarget(item);
                                setUserActionView('menu');
                                setPointsAmount('');
                            }}
                            aria-label={`Hành động với ${item.name}`}
                            title="Hành động"
                        >
                            <MoreVertical size={17} />
                        </button>
                    </div>
                ))}
            </div>
        </section>
    );

    const renderStats = () => {
        if (!stats) return null;
        const statsItems = [
            { label: 'Tổng thành viên', value: stats.total_users, icon: Users },
            { label: 'Tổng bài viết', value: stats.total_posts, icon: FileText },
            { label: 'Điểm đã phát', value: stats.total_points_awarded, icon: Coins },
            { label: 'DN chờ duyệt', value: stats.pending_enterprises, icon: Building2 },
        ];
        return (
            <div className="admin-stats-grid">
                {statsItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <div className="admin-stat-card" key={item.label}>
                            <span className="admin-stat-icon"><Icon size={17} /></span>
                            <span>{item.label}</span>
                            <strong>{Number(item.value || 0).toLocaleString('vi-VN')}</strong>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderReports = () => {
        if (reports.length === 0) {
            return <EmptyState icon={Check} text="Không có báo cáo vi phạm nào." />;
        }

        return (
            <div className="admin-list">
                {reports.map((report) => {
                    const content = report.content || '';
                    const postId = content.includes('Post ID:') ? content.split('Post ID: ')[1]?.split(' |')[0] : null;
                    const userIdMatch = content.match(/Target User ID:\s*([a-fA-F0-9-]+)/);
                    const targetUserId = userIdMatch ? userIdMatch[1] : null;

                    return (
                        <div className="admin-report-row" key={report.feedback_id}>
                            <div>
                                <strong>Báo cáo vi phạm</strong>
                                <small>{formatDate(report.created_at)}</small>
                                <p>{content}</p>
                            </div>
                            <div className="admin-action-row" style={{ marginTop: '6px' }}>
                                {postId && (
                                    <button
                                        type="button"
                                        className="admin-danger-btn"
                                        onClick={() => setConfirmModal({
                                            title: 'Xóa bài viết',
                                            message: 'Xóa bài viết bị báo cáo khỏi cộng đồng?',
                                            action: () => adminService.deletePost(postId),
                                            success: 'Đã xóa bài viết vi phạm.',
                                        })}
                                    >
                                        <Trash2 size={16} /> Xóa
                                    </button>
                                )}
                                {targetUserId && (
                                    <button
                                        type="button"
                                        className="admin-danger-btn"
                                        onClick={() => handleActionUser(targetUserId)}
                                    >
                                        <AlertTriangle size={16} /> Xử lý
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderContent = () => {
        if (loading) return <div className="admin-loading">Đang tải dữ liệu...</div>;
        if (activeTab === 'enterprise') return renderEnterprise();
        if (activeTab === 'location') return renderLocation();
        if (activeTab === 'users') return renderUsers();
        if (activeTab === 'stats') return renderStats();
        return renderReports();
    };

    return (
        <div className="admin-moderation-container">
            <header className="admin-topbar">
                <button type="button" className="admin-back-btn" onClick={onBack} aria-label="Quay lại">
                    <ArrowLeft size={18} />
                </button>
                <div className="admin-title-block">
                    <h1>Dashboard</h1>
                </div>
                <button
                    type="button"
                    className="admin-refresh-btn"
                    onClick={() => {
                        loadData();
                        loadOverview();
                    }}
                    disabled={loading || overviewLoading}
                    aria-label="Làm mới dữ liệu"
                    title="Làm mới dữ liệu"
                >
                    <RefreshCw size={17} />
                </button>
            </header>

            <div className="admin-scroll-shell admin-tabs-shell">
                <nav className="admin-tabs-row" aria-label="Admin sections">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const count = getTabCount(tab.id);
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                className={activeTab === tab.id ? 'active' : ''}
                                onClick={() => setActiveTab(tab.id)}
                                aria-label={tab.title}
                                title={tab.title}
                            >
                                <Icon size={16} />
                                {count !== null && count !== undefined && (
                                    <span className="admin-tab-count">{formatMetric(count)}</span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            <main className="admin-content-body">
                <section className="admin-overview-panel">
                    <div className="admin-overview-copy">
                        <span className="admin-overview-icon"><ClipboardList size={18} /></span>
                        <div>
                            <p>Yêu cầu chờ duyệt</p>
                            <h2>
                                {openQueueCount === null
                                    ? 'Đang tải thông tin...'
                                    : openQueueCount === 0
                                    ? 'Tất cả yêu cầu đã được xử lý'
                                    : `Có ${formatMetric(openQueueCount)} yêu cầu đang chờ duyệt`}
                            </h2>
                            <small>
                                {openQueueCount === null
                                    ? 'Vui lòng đợi trong giây lát'
                                    : openQueueCount === 0
                                    ? 'Hệ thống không còn hồ sơ doanh nghiệp hoặc địa điểm nào chờ duyệt.'
                                    : 'Vui lòng kiểm tra và phê duyệt hồ sơ doanh nghiệp hoặc địa điểm mới.'}
                            </small>
                        </div>
                    </div>
                </section>

                {(error || notice) && (
                    <div className={`admin-message ${error ? 'error' : 'success'}`}>
                        {error || notice}
                    </div>
                )}

                {renderContent()}
            </main>

            {userActionTarget && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal admin-user-action-modal">
                        <div className="admin-modal-header">
                            <div>
                                <h3>{userActionTarget.name}</h3>
                                <span>{userActionTarget.email}</span>
                            </div>
                            <button type="button" onClick={closeUserAction}><X size={18} /></button>
                        </div>

                        {userActionView === 'menu' && (
                            <div className="admin-action-menu">
                                <button type="button" onClick={() => setUserActionView('points')}>
                                    <Minus size={17} />
                                    <span>
                                        <strong>Điểm</strong>
                                        <small>Trừ điểm hoặc reset về 0</small>
                                    </span>
                                </button>
                                <button type="button" onClick={() => setUserActionView('account')}>
                                    {userActionTarget.status === 'BANNED' ? <Unlock size={17} /> : <Lock size={17} />}
                                    <span>
                                        <strong>Tài khoản</strong>
                                        <small>{userActionTarget.status === 'BANNED' ? 'Mở khóa đăng nhập' : 'Khóa đăng nhập'}</small>
                                    </span>
                                </button>
                                {userActionTarget.role !== 'ENTERPRISE' && !isViolationMode && (
                                    <button type="button" onClick={() => setUserActionView('role')}>
                                        <Shield size={17} />
                                        <span>
                                            <strong>Role</strong>
                                            <small>Chuyển USER / ADMIN</small>
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}

                        {userActionView === 'points' && (
                            <form className="admin-action-form" onSubmit={submitDeductPoints}>
                                <div className="admin-current-points">
                                    <span>Điểm hiện tại</span>
                                    <strong>{Number(userActionTarget.total_points || 0).toLocaleString('vi-VN')}</strong>
                                </div>
                                <label>
                                    <span>Số điểm cần trừ</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100000"
                                        value={pointsAmount}
                                        onChange={(event) => setPointsAmount(event.target.value)}
                                        placeholder="Nhập số điểm"
                                    />
                                </label>
                                <div className="admin-action-row">
                                    <button type="submit" className="admin-danger-btn" disabled={actionLoading || !pointsAmount}>
                                        <Minus size={16} /> Trừ điểm
                                    </button>
                                    <button
                                        type="button"
                                        className="admin-secondary-btn"
                                        disabled={actionLoading}
                                        onClick={() => runUserAction(
                                            () => adminService.updateUserPoints(userActionTarget.id, 'reset'),
                                            `Đã reset điểm của ${userActionTarget.name}.`
                                        )}
                                    >
                                        <RotateCcw size={16} /> Reset
                                    </button>
                                </div>
                            </form>
                        )}

                        {userActionView === 'account' && (
                            <div className="admin-action-form">
                                <div className="admin-action-row">
                                    {userActionTarget.status === 'BANNED' ? (
                                        <button
                                            type="button"
                                            className="admin-primary-btn"
                                            disabled={actionLoading}
                                            onClick={() => runUserAction(
                                                () => adminService.updateUserStatus(userActionTarget.id, 'unlock'),
                                                `Đã mở khóa ${userActionTarget.name}.`
                                            )}
                                        >
                                            <Unlock size={16} /> Mở khóa
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="admin-danger-btn"
                                            disabled={actionLoading}
                                            onClick={() => runUserAction(
                                                () => adminService.updateUserStatus(userActionTarget.id, 'lock'),
                                                `Đã khóa ${userActionTarget.name}.`
                                            )}
                                        >
                                            <Lock size={16} /> Khóa
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {userActionView === 'role' && (
                            <div className="admin-action-form">
                                <p>
                                    Chuyển role hiện tại từ <strong>{userActionTarget.role}</strong> sang{' '}
                                    <strong>{userActionTarget.role === 'ADMIN' ? 'USER' : 'ADMIN'}</strong>.
                                </p>
                                <button
                                    type="button"
                                    className="admin-primary-btn"
                                    disabled={actionLoading}
                                    onClick={() => runUserAction(
                                        () => adminService.updateUserRole(
                                            userActionTarget.id,
                                            userActionTarget.role === 'ADMIN' ? 'USER' : 'ADMIN'
                                        ),
                                        `Đã cập nhật role cho ${userActionTarget.name}.`
                                    )}
                                >
                                    <Shield size={16} /> Cập nhật role
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {rejectModal && (
                <div className="admin-modal-overlay">
                    <form className="admin-modal" onSubmit={submitReject}>
                        <div className="admin-modal-header">
                            <h3>Lý do từ chối</h3>
                            <button type="button" onClick={() => setRejectModal(null)}><X size={18} /></button>
                        </div>
                        <p>Lý do này sẽ được lưu vào log kiểm duyệt.</p>
                        <textarea
                            value={rejectReason}
                            onChange={(event) => setRejectReason(event.target.value)}
                            placeholder="Nhập lý do từ chối..."
                            required
                        />
                        <div className="admin-action-row">
                            <button type="button" className="admin-secondary-btn" onClick={() => setRejectModal(null)}>Hủy</button>
                            <button type="submit" className="admin-danger-btn" disabled={actionLoading}>Từ chối</button>
                        </div>
                    </form>
                </div>
            )}

            {confirmModal && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal">
                        <div className="admin-modal-header">
                            <h3>{confirmModal.title}</h3>
                            <button type="button" onClick={() => setConfirmModal(null)}><X size={18} /></button>
                        </div>
                        <p>{confirmModal.message}</p>
                        <div className="admin-action-row">
                            <button type="button" className="admin-secondary-btn" onClick={() => setConfirmModal(null)}>Hủy</button>
                            <button
                                type="button"
                                className="admin-primary-btn"
                                disabled={actionLoading}
                                onClick={() => runAction(confirmModal.action, confirmModal.success)}
                            >
                                Xác nhận
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function EmptyState({ icon: Icon, text }) {
    return (
        <div className="admin-empty">
            <Icon size={36} />
            <p>{text}</p>
        </div>
    );
}
