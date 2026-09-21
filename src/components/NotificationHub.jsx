import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const sampleNotifications = [
  {
    id: 'sample-1',
    title: 'Attendance Alert',
    body: 'Amina Hassan was marked ABSENT today.',
    type: 'alert',
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  },
  {
    id: 'sample-2',
    title: 'Upcoming Exam Reminder',
    body: 'Term 2 Mathematics exam is scheduled for tomorrow at 9:00 AM.',
    type: 'exam',
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString()
  },
  {
    id: 'sample-3',
    title: 'Fee Payment Success',
    body: 'Invoice Reference PAY-001 for 25,000 has been successfully processed.',
    type: 'payment',
    is_read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
  },
  {
    id: 'sample-4',
    title: 'Campus Announcement',
    body: 'Annual sports day registrations are now open for all grades.',
    type: 'announcement',
    is_read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString()
  }
];

export default function NotificationHub({ isOpen, onClose }) {
  const { session, profile, demo } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchNotifications = async () => {
      setLoading(true);
      if (!supabase || demo) {
        setNotifications(sampleNotifications);
        setLoading(false);
        return;
      }

      try {
        let query = supabase.from('notifications').select('*');
        if (session?.user?.id) {
          query = query.eq('user_id', session.user.id);
        } else if (profile?.id) {
          query = query.eq('user_id', profile.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        setNotifications(data || []);
      } catch (err) {
        console.error('Error fetching notifications:', err);
        toast.error('Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();

    if (supabase && !demo) {
      const channelId = `user-notifications-${session?.user?.id || profile?.id || 'public'}`;
      const subscription = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${session?.user?.id || profile?.id}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setNotifications(prev => [payload.new, ...prev]);
              toast.success(`New notification: ${payload.new.title || 'Alert'}`);
            } else if (payload.eventType === 'UPDATE') {
              setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
            } else if (payload.eventType === 'DELETE') {
              setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(subscription);
      };
    }
  }, [isOpen, session, profile, demo]);

  const markAsRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));

    if (!supabase || demo) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success('All notifications marked as read');

    if (!supabase || demo) return;

    try {
      let query = supabase.from('notifications').update({ is_read: true });
      if (session?.user?.id) {
        query = query.eq('user_id', session.user.id);
      } else if (profile?.id) {
        query = query.eq('user_id', profile.id);
      }
      const { error } = await query.eq('is_read', false);
      if (error) throw error;
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      toast.error('Failed to update notifications');
    }
  };

  const getTypeIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'alert':
      case 'attendance':
        return '🚨';
      case 'exam':
      case 'grade':
      case 'result':
        return '📝';
      case 'payment':
      case 'fee':
        return '💰';
      case 'calendar':
      case 'event':
        return '📅';
      case 'announcement':
      case 'info':
      default:
        return '🔔';
    }
  };

  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="notif-overlay" onClick={onClose}>
      <div className="notif-panel" onClick={e => e.stopPropagation()}>
        <header className="notif-header">
          <div className="notif-title-area">
            <h2>Notifications</h2>
            {unreadCount > 0 && <span className="notif-badge">{unreadCount} new</span>}
          </div>
          <button className="notif-close-btn" onClick={onClose} aria-label="Close panel">×</button>
        </header>

        <div className="notif-actions">
          <button
            className="notif-action-btn"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
          >
            Mark all as read
          </button>
        </div>

        <div className="notif-body">
          {loading ? (
            <div className="notif-loading">
              <div className="spinner"></div>
              <p>Loading alerts...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notif-empty">
              <span>🎉</span>
              <p>All caught up! No notifications.</p>
            </div>
          ) : (
            <div className="notif-list">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${n.is_read ? 'read' : 'unread'}`}
                  onClick={() => !n.is_read && markAsRead(n.id)}
                >
                  <div className="notif-icon-wrapper">
                    {getTypeIcon(n.type)}
                  </div>
                  <div className="notif-content">
                    <div className="notif-item-header">
                      <h3>{n.title}</h3>
                      <span className="notif-time">{formatTime(n.created_at)}</span>
                    </div>
                    <p>{n.body}</p>
                  </div>
                  {!n.is_read && <span className="notif-unread-dot"></span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .notif-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.15);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.2s ease-out;
        }

        .notif-panel {
          width: 100%;
          max-width: 400px;
          height: 100%;
          background: rgba(35, 117, 225, 0.1);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border-left: 1px solid rgba(35, 117, 225, 0.2);
          box-shadow: -10px 0 40px rgba(16, 42, 67, 0.12);
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        [data-theme="dark"] .notif-panel {
          background: rgba(30, 41, 59, 0.7);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: -10px 0 40px rgba(0, 0, 0, 0.4);
        }

        .notif-header {
          padding: 24px 20px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(35, 117, 225, 0.15);
        }

        .notif-title-area {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .notif-header h2 {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 700;
          background: linear-gradient(135deg, var(--ink) 50%, #2375e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .notif-badge {
          background: #2375e1;
          color: #ffffff;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 3px 9px;
          border-radius: 20px;
          box-shadow: 0 4px 12px rgba(35, 117, 225, 0.35);
        }

        .notif-close-btn {
          background: transparent;
          border: none;
          font-size: 1.8rem;
          cursor: pointer;
          color: var(--muted);
          line-height: 1;
          padding: 2px 6px;
          transition: color 0.2s;
        }

        .notif-close-btn:hover {
          color: #2375e1;
        }

        .notif-actions {
          padding: 12px 20px;
          display: flex;
          justify-content: flex-end;
          background: rgba(255, 255, 255, 0.25);
          border-bottom: 1px solid rgba(35, 117, 225, 0.05);
        }

        [data-theme="dark"] .notif-actions {
          background: rgba(0, 0, 0, 0.15);
        }

        .notif-action-btn {
          background: transparent;
          border: none;
          color: #2375e1;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          padding: 2px 6px;
          transition: opacity 0.2s;
        }

        .notif-action-btn:hover:not(:disabled) {
          text-decoration: underline;
          opacity: 0.85;
        }

        .notif-action-btn:disabled {
          color: var(--muted);
          opacity: 0.5;
          cursor: not-allowed;
        }

        .notif-body {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .notif-list {
          display: flex;
          flex-direction: column;
        }

        .notif-item {
          padding: 16px 20px;
          display: flex;
          gap: 14px;
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease;
          border-bottom: 1px solid rgba(35, 117, 225, 0.05);
        }

        .notif-item.unread {
          background: rgba(35, 117, 225, 0.04);
          border-left: 3px solid #2375e1;
          padding-left: 17px;
        }

        .notif-item:hover {
          background: rgba(35, 117, 225, 0.08);
        }

        .notif-icon-wrapper {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(35, 117, 225, 0.1);
          display: grid;
          place-items: center;
          font-size: 1.2rem;
          flex-shrink: 0;
        }

        .notif-content {
          flex: 1;
          min-width: 0;
        }

        .notif-item-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 4px;
        }

        .notif-content h3 {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .notif-time {
          font-size: 0.75rem;
          color: var(--muted);
          flex-shrink: 0;
        }

        .notif-content p {
          margin: 0;
          font-size: 0.85rem;
          line-height: 1.4;
          color: var(--muted);
          word-break: break-word;
        }

        .notif-unread-dot {
          width: 8px;
          height: 8px;
          background-color: #2375e1;
          border-radius: 50%;
          position: absolute;
          right: 20px;
          top: 50%;
          transform: translateY(-50%);
          box-shadow: 0 0 8px rgba(35, 117, 225, 0.6);
        }

        .notif-loading, .notif-empty {
          padding: 60px 20px;
          text-align: center;
          color: var(--muted);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .notif-empty span {
          font-size: 2.5rem;
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 2px solid rgba(35, 117, 225, 0.2);
          border-top-color: #2375e1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
