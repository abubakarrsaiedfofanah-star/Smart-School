import React, { useState } from 'react';

export default function ConfirmShield({ isOpen, onConfirm, onClose, title = "Sensitive Action", message = "This action is destructive and cannot be undone." }) {
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen) return null;

  return (
    <div className="payment-overlay" style={{ zIndex: 9999, position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center' }}>
      <div className="payment-modal glass-card page-transition" style={{ maxWidth: '450px', background: 'var(--bg)', padding: '30px', borderRadius: '20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🛡️</div>
          <h2 style={{ color: 'var(--ink)' }}>{title}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>{message}</p>
        </div>

        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>
            Type "CONFIRM" to authorize
          </label>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="TYPE CONFIRM"
            style={{ textAlign: 'center', fontWeight: 700, letterSpacing: '2px', width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}
          />
        </div>

        <div className="flex-actions" style={{ display: 'flex', gap: '15px' }}>
          <button className="button outline-button full" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
          <button
            className="button blue-button full"
            disabled={confirmText !== 'CONFIRM'}
            onClick={() => {
              onConfirm();
              setConfirmText('');
              onClose();
            }}
            style={{ flex: 1 }}
          >
            Authorize Action 🔒
          </button>
        </div>
      </div>
    </div>
  );
}
