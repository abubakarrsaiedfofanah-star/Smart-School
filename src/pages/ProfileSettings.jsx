import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function ProfileSettings() {
  const { profile, setProfile, demo } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ full_name: '', phone: '', signature_url: '' });

  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        signature_url: profile.signature_url || ''
      });
    }
  }, [profile]);

  // Canvas Logic
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
    }
  }, [formData.signature_url]);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `sig-${profile.id}.png`, { type: 'image/png' });

    const toastId = toast.loading('Saving signature...');
    try {
      const fileName = `sig-${profile.id}-${Date.now()}.png`;
      const { error } = await supabase.storage.from('branding').upload(fileName, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(fileName);

      setFormData({ ...formData, signature_url: publicUrl });
      toast.success('Signature captured!', { id: toastId });
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    }
  };

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (demo) {
        toast.success('Profile updated locally (Demo)!');
        return;
      }
      const { error } = await supabase.from('profiles').update({
        full_name: formData.full_name,
        phone: formData.phone,
        signature_url: formData.signature_url
      }).eq('id', profile.id);
      if (error) throw error;
      toast.success('Profile saved successfully');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="profile-page page-transition">
      <style>{`
        .profile-page { max-width: 700px; margin: 40px auto; padding: 0 20px; }
        .sig-pad-container { background: #fff; border: 2px solid var(--line); border-radius: 12px; margin-top: 15px; position: relative; }
        .sig-canvas { width: 100%; height: 200px; cursor: crosshair; touch-action: none; }
        .sig-controls { display: flex; gap: 10px; padding: 10px; background: #f8fafc; border-top: 1px solid var(--line); border-radius: 0 0 12px 12px; }
        .sig-preview { width: 150px; height: 80px; background: #fff; border: 1px dashed var(--line); border-radius: 8px; display: grid; place-items: center; margin-top: 15px; overflow: hidden; }
        .sig-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
      `}</style>

      <p className="eyebrow">Personal Account</p>
      <h1>My Profile Settings</h1>

      <form onSubmit={handleSave} className="glass-card" style={{ marginTop: '30px', display: 'grid', gap: '20px' }}>
        <label>Full Name
          <input value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} required />
        </label>
        <label>Phone Number
          <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
        </label>

        {profile?.role === 'teacher' && (
          <div className="signature-section">
            <b>Draw Your Digital Signature</b>
            <p style={{fontSize: '0.8rem', color: 'var(--muted)'}}>Sign below with your mouse or finger. This will be used on official reports.</p>

            <div className="sig-pad-container">
              <canvas
                ref={canvasRef}
                className="sig-canvas"
                width={600}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              <div className="sig-controls">
                <button type="button" className="button small outline" onClick={clearCanvas}>Clear</button>
                <button type="button" className="button small blue-button" onClick={saveSignature}>Capture Signature</button>
              </div>
            </div>

            <div className="current-sig">
              <small style={{display:'block', marginTop:'15px', color:'var(--muted)'}}>Current Saved Signature:</small>
              <div className="sig-preview">
                {formData.signature_url ? <img src={formData.signature_url} alt="Signature" /> : <span>No Signature</span>}
              </div>
            </div>
          </div>
        )}

        <button className="button blue-button full" disabled={loading}>
          {loading ? 'Saving...' : 'Save Profile Changes →'}
        </button>
      </form>
    </div>
  );
}
