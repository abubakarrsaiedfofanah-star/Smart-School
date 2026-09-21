import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export default function SecuritySettings() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
    if (newPassword.length < 6) return toast.error('Password too short');

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Credentials updated!');
      setNewPassword(''); setConfirmPassword('');
    } catch (err) { toast.error(err.message); } finally { setChangingPassword(false); }
  };

  return (
    <div className="security-page page-transition">
      <style>{`
        .security-page { max-width: 1000px; margin: 40px auto; padding: 0 24px; }
        .security-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .glass-card { background: var(--panel); border-radius: 24px; border: 1px solid var(--line); padding: 32px; box-shadow: var(--shadow); position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 24px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-weight: 700; font-size: 0.85rem; color: var(--muted); text-transform: uppercase; }
        .form-group input { padding: 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
        @media (max-width: 850px) { .security-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ marginBottom: '40px' }}><p className="eyebrow">FORTRESS SECURITY</p><h1>Command Center</h1></div>

      <div className="security-grid">
        <form onSubmit={handlePasswordChange} className="glass-card neumorph-flat">
          <h3>Authentication</h3>
          <div className="form-group"><label>New Password</label><input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required /></div>
          <div className="form-group"><label>Confirm</label><input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required /></div>
          <button className="button blue-button full tactile-btn" disabled={changingPassword}>Update Credentials</button>
        </form>

        <div className="glass-card neumorph-flat">
          <h3>Access Control</h3>
          <div className="form-group"><label>Region Whitelist</label><input placeholder="e.g. Kenya, UK" disabled /></div>
          <div className="form-group"><label>MFA Status</label><div style={{display:'flex', alignItems:'center', gap:'10px', color:twoFactorEnabled?'var(--green)':'var(--muted)'}}><span>{twoFactorEnabled?'ACTIVE':'INACTIVE'}</span><button className="mini outline" onClick={()=>setTwoFactorEnabled(!twoFactorEnabled)}>Toggle</button></div></div>
          <p style={{fontSize:'0.75rem', color:'var(--muted)'}}>Enterprise features are managed by the school administrator.</p>
        </div>
      </div>
    </div>
  );
}
