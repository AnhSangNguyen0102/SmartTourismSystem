import React, { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, Bookmark, Send, MapPin, Flag, Image as ImageIcon, X, AlertTriangle, Plus, Smile, MoreHorizontal, Check, ArrowLeft, Trash2, ShieldAlert, Globe, Lock, Users, Locate } from 'lucide-react';
import { API_BASE } from '../config/api';
import { storageGet } from '../platform/storage';
import { getCurrentPosition } from '../platform/location';
import { showAlert, showConfirm } from '../platform/dialog';
import './SocialFeedScreen.css';

export default function SocialFeedScreen({ user, onRequireLogin, onOpenProfile }) {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [likedPosts, setLikedPosts] = useState(new Set());
    const [savedPosts, setSavedPosts] = useState(new Set());
    
    // Comments Drawer
    const [activeCommentsPostId, setActiveCommentsPostId] = useState(null);
    const [comments, setComments] = useState([]);
    const [commentText, setCommentText] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    
    // Create Post Modal
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [postCaption, setPostCaption] = useState('');
    const [imagePreviews, setImagePreviews] = useState([]);
    const [postLocation, setPostLocation] = useState('');
    const [privacyStatus, setPrivacyStatus] = useState('PUBLIC');
    const [isLocating, setIsLocating] = useState(false);
    const [isSubmittingPost, setIsSubmittingPost] = useState(false);
    const [postMenuId, setPostMenuId] = useState(null);

    // Report Post Modal
    const [reportPostId, setReportPostId] = useState(null);
    const [reportReason, setReportReason] = useState('');
    const [isSubmittingReport, setIsSubmittingReport] = useState(false);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        setLoading(true);
        try {
            const token = await storageGet('access_token');
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${API_BASE}/api/social/posts`, { headers });
            if (res.ok) {
                const data = await res.json();
                setPosts(data);
                
                // Initialize liked and saved states if logged in
                if (token && user) {
                    // Pull saved posts from backend if possible
                    const savedRes = await fetch(`${API_BASE}/api/social/saved-posts`, { headers });
                    if (savedRes.ok) {
                        const savedData = await savedRes.json();
                        const savedIds = new Set(savedData.map(p => p.post_id));
                        setSavedPosts(savedIds);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching posts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLike = async (postId) => {
        if (!user) {
            onRequireLogin();
            return;
        }

        const token = await storageGet('access_token');
        if (!token) return;

        // Optimistic UI update
        const isLiked = likedPosts.has(postId);
        const updatedLiked = new Set(likedPosts);
        if (isLiked) {
            updatedLiked.delete(postId);
        } else {
            updatedLiked.add(postId);
        }
        setLikedPosts(updatedLiked);

        setPosts(prev => prev.map(p => {
            if (p.post_id === postId) {
                return {
                    ...p,
                    likes_count: isLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1
                };
            }
            return p;
        }));

        try {
            const res = await fetch(`${API_BASE}/api/social/like/${postId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPosts(prev => prev.map(p => {
                    if (p.post_id === postId) {
                        return { ...p, likes_count: data.likes_count };
                    }
                    return p;
                }));
            }
        } catch (error) {
            console.error('Error liking post:', error);
        }
    };

    const handleSave = async (postId) => {
        if (!user) {
            onRequireLogin();
            return;
        }

        const token = await storageGet('access_token');
        if (!token) return;

        const isSaved = savedPosts.has(postId);
        const updatedSaved = new Set(savedPosts);
        if (isSaved) {
            updatedSaved.delete(postId);
        } else {
            updatedSaved.add(postId);
        }
        setSavedPosts(updatedSaved);

        try {
            const res = await fetch(`${API_BASE}/api/social/save/${postId}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const nowSaved = data.action === 'saved';
                const finalSaved = new Set(savedPosts);
                if (nowSaved) {
                    finalSaved.add(postId);
                } else {
                    finalSaved.delete(postId);
                }
                setSavedPosts(finalSaved);
            }
        } catch (error) {
            console.error('Error saving post:', error);
        }
    };

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files || []);
        files.slice(0, 4 - imagePreviews.length).forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreviews(prev => [...prev, reader.result]);
            };
            reader.readAsDataURL(file);
        });
    };

    const handleLocate = () => {
        setIsLocating(true);
        getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
            .then(async (pos) => {
                try {
                    const res = await fetch(`${API_BASE}/api/discovery/geocode/reverse?lat=${pos.latitude}&lon=${pos.longitude}`);
                    if (res.ok) {
                        const data = await res.json();
                        setPostLocation(data.address?.city || data.address?.state || data.address?.country || 'Việt Nam');
                    }
                } catch (error) {
                    console.error('Error reverse geocoding:', error);
                } finally {
                    setIsLocating(false);
                }
            })
            .catch((error) => {
                console.error('Geolocation error:', error);
                setIsLocating(false);
            });
    };

    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (!postCaption.trim()) return;

        setIsSubmittingPost(true);
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    caption: postCaption,
                    image_url: imagePreviews.join('|'), // Pipe-separated list to support base64 commas
                    location_name: postLocation,
                    privacy_status: privacyStatus
                })
            });

            if (res.ok) {
                setPostCaption('');
                setImagePreviews([]);
                setPostLocation('');
                setIsCreateOpen(false);
                fetchPosts();
            }
        } catch (error) {
            await showAlert('Đăng bài viết thất bại: ' + error.message);
        } finally {
            setIsSubmittingPost(false);
        }
    };

    const handleOpenComments = async (postId) => {
        setActiveCommentsPostId(postId);
        setComments([]);
        try {
            const res = await fetch(`${API_BASE}/api/social/comments/${postId}`);
            if (res.ok) {
                const data = await res.json();
                setComments(data);
            }
        } catch (error) {
            console.error('Error fetching comments:', error);
        }
    };

    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!commentText.trim() || !activeCommentsPostId) return;

        if (!user) {
            onRequireLogin();
            return;
        }

        setSubmittingComment(true);
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/comment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    post_id: activeCommentsPostId,
                    content: commentText
                })
            });

            if (res.ok) {
                setCommentText('');
                // Refresh comments
                handleOpenComments(activeCommentsPostId);
                // Update local comment count
                setPosts(prev => prev.map(p => {
                    if (p.post_id === activeCommentsPostId) {
                        return { ...p, comments_count: (p.comments_count || 0) + 1 };
                    }
                    return p;
                }));
            }
        } catch (error) {
            console.error('Error adding comment:', error);
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        const confirmed = await showConfirm('Bạn có muốn xóa bình luận này không?');
        if (!confirmed) return;
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/comments/${commentId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                // Refresh comments list
                handleOpenComments(activeCommentsPostId);
                // Decrement local comments count
                setPosts(prev => prev.map(p => {
                    if (p.post_id === activeCommentsPostId) {
                        return { ...p, comments_count: Math.max(0, (p.comments_count || 0) - 1) };
                    }
                    return p;
                }));
            } else {
                const data = await res.json();
                await showAlert(data.detail || 'Không thể xóa bình luận.');
            }
        } catch (error) {
            console.error('Error deleting comment:', error);
        }
    };

    const handleDeletePost = async (postId) => {
        const confirmed = await showConfirm('Bạn có muốn xóa bài đăng này không?');
        if (!confirmed) return;
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/posts/${postId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setPosts(prev => prev.filter(p => p.post_id !== postId));
                setPostMenuId(null);
            }
        } catch (error) {
            console.error('Error deleting post:', error);
        }
    };

    const handleReportPost = async (e) => {
        e.preventDefault();
        if (!reportReason.trim() || !reportPostId) return;

        setIsSubmittingReport(true);
        try {
            const token = await storageGet('access_token');
            const res = await fetch(`${API_BASE}/api/social/report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    post_id: reportPostId,
                    reason: reportReason
                })
            });
            if (res.ok) {
                await showAlert('Báo cáo bài viết thành công. Quản trị viên sẽ xem xét.');
                setReportPostId(null);
                setReportReason('');
            }
        } catch (error) {
            console.error('Error reporting post:', error);
        } finally {
            setIsSubmittingReport(false);
        }
    };

    return (
        <div className="social-feed-container">
            {/* Top Bar */}
            <div className="social-feed-header">
                <h1 className="feed-title">Bản Tin Du Lịch</h1>
                {user && (
                    <button className="squishy-btn green feed-create-btn" onClick={() => setIsCreateOpen(true)}>
                        <Plus size={16} style={{ marginRight: '6px' }} /> Đăng Bài
                    </button>
                )}
            </div>

            {/* Posts Area */}
            {loading ? (
                <div className="feed-loading">
                    <div className="loader-hud"></div>
                    <p>Đang tải bảng tin thám hiểm...</p>
                </div>
            ) : posts.length === 0 ? (
                <div className="feed-empty cartoon-card">
                    <AlertTriangle size={48} className="empty-icon" />
                    <h2>Bảng tin trống!</h2>
                    <p>Hãy là thám hiểm gia đầu tiên chia sẻ hành trình của bạn.</p>
                </div>
            ) : (
                <div className="posts-list">
                    {posts.map(post => {
                        const isMe = user && post.user_id === (user.user_id || user.id);
                        return (
                            <div key={post.post_id} className="post-card cartoon-card">
                                {/* Header */}
                                <div className="post-card-header">
                                    <div className="author-info">
                                        <img 
                                            src={post.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.profiles?.full_name || 'Traveler'}`} 
                                            alt="avatar" 
                                            className="author-avatar" 
                                        />
                                        <div>
                                            <h4 className="author-name">{post.profiles?.full_name || 'Thám hiểm gia'}</h4>
                                            <div className="post-meta">
                                                <span className="post-date">{new Date(post.created_at).toLocaleDateString('vi-VN')}</span>
                                                {post.location_name && (
                                                    <span className="post-location">
                                                        <MapPin size={10} className="meta-icon" /> {post.location_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="post-options">
                                        <button className="btn-menu" onClick={() => setPostMenuId(postMenuId === post.post_id ? null : post.post_id)}>
                                            <MoreHorizontal size={18} />
                                        </button>
                                        {postMenuId === post.post_id && (
                                            <div className="post-dropdown-menu cartoon-card">
                                                {isMe ? (
                                                    <button className="dropdown-item red" onClick={() => handleDeletePost(post.post_id)}>
                                                        <Trash2 size={12} /> Xóa bài đăng
                                                    </button>
                                                ) : (
                                                    <button className="dropdown-item orange" onClick={() => { setReportPostId(post.post_id); setPostMenuId(null); }}>
                                                        <Flag size={12} /> Báo cáo bài viết
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="post-card-body">
                                    <p className="post-caption">{post.caption}</p>
                                    {post.image_url && (
                                        <div className="post-images-grid">
                                            {(post.image_url.includes('|') ? post.image_url.split('|') : (post.image_url.startsWith('data:image') ? [post.image_url] : post.image_url.split(','))).map((url, i) => (
                                                <img key={i} src={url} alt="post preview" className="post-image" />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Footer (Actions) */}
                                <div className="post-card-footer">
                                    <button 
                                        className={`post-action-btn ${likedPosts.has(post.post_id) ? 'active-like' : ''}`}
                                        onClick={() => handleLike(post.post_id)}
                                    >
                                        <Heart size={16} fill={likedPosts.has(post.post_id) ? '#ff4757' : 'none'} />
                                        <span>{post.likes_count || 0}</span>
                                    </button>
                                    <button 
                                        className="post-action-btn"
                                        onClick={() => handleOpenComments(post.post_id)}
                                    >
                                        <MessageCircle size={16} />
                                        <span>{post.comments_count || 0}</span>
                                    </button>
                                    <button 
                                        className={`post-action-btn ${savedPosts.has(post.post_id) ? 'active-save' : ''}`}
                                        onClick={() => handleSave(post.post_id)}
                                    >
                                        <Bookmark size={16} fill={savedPosts.has(post.post_id) ? '#9b59b6' : 'none'} />
                                        <span>{savedPosts.has(post.post_id) ? 'Đã lưu' : 'Lưu'}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create Post Modal */}
            {isCreateOpen && (
                <div className="modal-overlay">
                    <div className="modal-content cartoon-card">
                        <div className="modal-header">
                            <h3>Chia Sẻ Hành Trình</h3>
                            <button className="btn-close" onClick={() => setIsCreateOpen(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreatePost}>
                            <textarea 
                                value={postCaption}
                                onChange={(e) => setPostCaption(e.target.value)}
                                placeholder="Có gì thú vị trong hành trình hôm nay của bạn?"
                                className="post-input-text"
                                required
                            />
                            
                            {imagePreviews.length > 0 && (
                                <div className="images-preview-row">
                                    {imagePreviews.map((src, i) => (
                                        <div key={i} className="preview-img-container">
                                            <img src={src} alt="preview" className="preview-img" />
                                            <button 
                                                type="button" 
                                                className="btn-remove-preview"
                                                onClick={() => setImagePreviews(prev => prev.filter((_, idx) => idx !== i))}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="form-actions-row">
                                <label className="squishy-btn yellow upload-label">
                                    <ImageIcon size={16} style={{ marginRight: '6px' }} /> Ảnh
                                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                                </label>
                                <button type="button" className="squishy-btn blue locate-btn" onClick={handleLocate} disabled={isLocating}>
                                    <Locate size={16} style={{ marginRight: '6px' }} /> {isLocating ? 'Định vị...' : 'Vị trí'}
                                </button>
                            </div>

                            {postLocation && (
                                <div className="tag-location-display">
                                    <MapPin size={12} /> {postLocation}
                                    <button type="button" className="remove-loc" onClick={() => setPostLocation('')}>✕</button>
                                </div>
                            )}

                            <div className="privacy-select-row">
                                <label>Quyền riêng tư:</label>
                                <select value={privacyStatus} onChange={(e) => setPrivacyStatus(e.target.value)}>
                                    <option value="PUBLIC">Công khai</option>
                                    <option value="FRIENDS">Bạn bè</option>
                                    <option value="PRIVATE">Chỉ mình tôi</option>
                                </select>
                            </div>

                            <button type="submit" className="squishy-btn green submit-post-btn" disabled={isSubmittingPost}>
                                {isSubmittingPost ? 'Đang Đăng...' : 'Đăng Bài Viết'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Comments Drawer */}
            {activeCommentsPostId && (
                <div className="modal-overlay">
                    <div className="drawer-content cartoon-card">
                        <div className="modal-header">
                            <h3>Bình Luận</h3>
                            <button className="btn-close" onClick={() => setActiveCommentsPostId(null)}><X size={20} /></button>
                        </div>
                        <div className="comments-list">
                            {comments.length === 0 ? (
                                <p className="comments-empty">Chưa có bình luận nào. Hãy bình luận đầu tiên!</p>
                            ) : (
                                comments.map(comment => {
                                    const activePost = posts.find(p => p.post_id === activeCommentsPostId);
                                    const isPostOwner = activePost && user && (activePost.user_id === (user.user_id || user.id));
                                    const isCommentOwner = user && (comment.user_id === (user.user_id || user.id));
                                    const canDelete = isPostOwner || isCommentOwner;
                                    return (
                                        <div key={comment.comment_id} className="comment-item">
                                            <img 
                                                src={comment.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.profiles?.full_name || 'Visitor'}`} 
                                                alt="avatar" 
                                                className="comment-avatar"
                                            />
                                            <div className="comment-bubble cartoon-card">
                                                <div className="comment-bubble-header">
                                                    <span className="commenter-name">{comment.profiles?.full_name || 'Traveler'}</span>
                                                    <div className="comment-meta-right">
                                                        <span className="comment-time">{new Date(comment.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                        {canDelete && (
                                                            <button 
                                                                className="btn-delete-comment" 
                                                                onClick={() => handleDeleteComment(comment.comment_id)}
                                                                title="Xóa bình luận"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="comment-text-content">{comment.content}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        {user && (
                            <form onSubmit={handleAddComment} className="add-comment-form">
                                <input 
                                    type="text" 
                                    placeholder="Viết bình luận..." 
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    required
                                />
                                <button type="submit" className="squishy-btn blue send-comment-btn" disabled={submittingComment}>
                                    <Send size={14} />
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {reportPostId && (
                <div className="modal-overlay">
                    <div className="modal-content cartoon-card text-center">
                        <div className="modal-header">
                            <h3>Báo Cáo Vi Phạm</h3>
                            <button className="btn-close" onClick={() => setReportPostId(null)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleReportPost}>
                            <p className="report-warning-desc">Vui lòng cung cấp lý do báo cáo bài viết vi phạm tiêu chuẩn cộng đồng:</p>
                            <textarea
                                value={reportReason}
                                onChange={(e) => setReportReason(e.target.value)}
                                placeholder="Ví dụ: Nội dung phản cảm, hình ảnh thô tục, spam..."
                                className="post-input-text"
                                required
                            />
                            <div className="modal-actions-row">
                                <button type="button" className="squishy-btn red cancel-btn" onClick={() => setReportPostId(null)}>Hủy</button>
                                <button type="submit" className="squishy-btn green submit-btn" disabled={isSubmittingReport}>
                                    {isSubmittingReport ? 'Đang gửi...' : 'Báo Cáo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
