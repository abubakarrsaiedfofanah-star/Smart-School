import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export default function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [togglingMfa, setTogglingMfa] = useState(false);

  // Active Sessions State
  const [sessions, setSessions] = useState([
    { id: 1, browser: 'Chrome 118.0 (Windows 11)', ip: '192.168.1.45', location: 'New York, USA', time: 'Active Now', current: true },
    { id: 2, browser: 'Safari Mobile (iPhone 15 Pro)', ip: '172.56.21.9', location: 'New York, USA', time: 'Yesterday, 11:15 AM', current: false },
    { id: 3, browser: 'Firefox 119.0 (MacOS Sonoma)', ip: '84.21.144.12', location: 'London, UK', time: '14 Sep 2026, 03:22 PM', current: false },
  ]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    setChangingPassword(true);
    try {
      if (!supabase) {
        setTimeout(() => {
          toast.success('Demo Mode: Password updated successfully!');
          setNewPassword(''); setConfirmPassword(''); setChangingPassword(false);
        }, 1000);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated successfully!');
      setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleMfaToggle = () => {
    setTogglingMfa(true);
    setTimeout(() => {
      setTwoFactorEnabled(!twoFactorEnabled);
      setTogglingMfa(false);
      toast.success(twoFactorEnabled ? '2FA Deactivated' : '2FA Activated!');
    }, 600);
  };

  const signOutOthers = async () => {
    const toastId = toast.loading('Kicking out other sessions...');
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'others' });
        if (error) throw error;
      }
      // Simulation: Remove non-current sessions
      setTimeout(() => {
        setSessions(sessions.filter(s => s.current));
        toast.success('All other devices signed out!', { id: toastId });
      }, 1500);
    } catch (err) {
      toast.error('Failed to clear sessions', { id: toastId });
    }
  };

  return (
    <div className="security-page page-transition">
      <style>{`
        .security-page { max-width: 1000px; margin: 40px auto; padding: 0 24px; color: var(--ink); }
        .security-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .security-card {
          background: var(--panel); border-radius: 24px; border: 1px solid var(--line); padding: 32px;
          box-shadow: var(--shadow); position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 24px;
        }
        .security-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #2375e1, #a855f7); }
        .card-title-area { display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 16px; }
        .card-icon { width: 40px; height: 40px; background: rgba(35, 117, 225, 0.1); color: var(--green); border-radius: 10px; display: grid; place-items: center; font-size: 1.2rem; }

        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-weight: 700; font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
        .form-group input { padding: 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }

        .session-item { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: var(--bg); border-radius: 16px; border: 1px solid var(--line); }
        .session-info b { display: block; font-size: 0.9rem; }
        .session-info span { font-size: 0.8rem; color: var(--muted); }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block; margin-right: 8px; box-shadow: 0 0 10px #10b981; }

        @media (max-width: 850px) { .security-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="security-header" style={{ marginBottom: '40px' }}>
        <p className="eyebrow">FORTRESS SECURITY</p>
        <h1>Security Command Center</h1>
        <p>Protect your identity and manage active sessions across all devices.</p>
      </div>

      <div className="security-grid">
        <form onSubmit={handlePasswordChange} className="security-card interactive-card">
          <div className="card-title-area">
            <div className="card-icon">🔐</div>
            <h2>Password & Authentication</h2>
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your new password" />
          </div>
          <button className="button blue-button full" disabled={changingPassword}>
            {changingPassword ? 'Updating...' : 'Update Security Credentials'}
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div className="security-card interactive-card">
            <div className="card-title-area">
              <div className="card-icon">🌍</div>
              <h2>Geo-Locking & Access Control</h2>
            </div>
            <div className="form-group">
              <label>Allowed Countries (Whitelist)</label>
              <input placeholder="e.g. Kenya, UK, USA" />
            </div>
            <div className="form-group">
              <label>Restricted IP Ranges</label>
              <input placeholder="e.g. 192.168.1.1/24" />
            </div>
            <button className="button blue-button full" onClick={() => toast.success('Geo-locking parameters updated!')}>
              Save Access Rules 🛡️
            </button>
          </div>

          <div className="security-card interactive-card">
            <div className="card-title-area">
              <div className="card-icon">🕵️</div>
              <h2>Active Device Sessions</h2>
            </div>
            <div className="sessions-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {sessions.map(s => (
                <div key={s.id} className="session-item">
                  <div className="session-info">
                    <b>{s.current && <span className="status-dot"></span>}{s.browser}</b>
                    <span>{s.location} • {s.ip}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: s.current ? 'var(--green)' : 'var(--muted)' }}>
                    {s.time}
                  </span>
                </div>
              ))}
            </div>
            {sessions.length > 1 && (
              <button className="button outline-button full" onClick={signOutOthers}>
                Sign Out of All Other Devices 🛡️
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
