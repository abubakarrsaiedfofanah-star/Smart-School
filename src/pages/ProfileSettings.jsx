import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import toast from 'react-hot-toast';

export default function ProfileSettings() {
  const { profile, setProfile, demo, staffRoles } = useAuth();
  const { lang, setLang } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ full_name: '', phone: '', signature_url: '', notification_preferences: { absences: true, announcements: true, behavior: true, schoolwork: true }, delivery_preferences: { email: false, sms: false, whatsapp: false, push: false } });

  const canvasRef = useRef(null);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const canSignOfficialDocuments = profile?.role === 'teacher' || staffRoles.includes('finance_officer');

  async function uploadProfilePhoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file.');
    if (file.size > 5 * 1024 * 1024) return toast.error('Choose an image smaller than 5 MB.');
    if (!supabase || !profile?.id) return toast.error('Profile photo upload is unavailable.');
    setPhotoUploading(true);
    const toastId = toast.loading('Uploading profile photo…');
    let uploadedPath = null;
    try {
      const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[file.type];
      if (!extension) throw new Error('Use a JPG, PNG, WebP, or GIF image.');
      const filePath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('profile-photos').upload(filePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPath = filePath;
      const { data: photo, error: photoError } = await supabase.storage.from('profile-photos').createSignedUrl(filePath, 604800);
      if (photoError || !photo?.signedUrl) throw photoError || new Error('Could not prepare the uploaded photo.');
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: filePath }).eq('id', profile.id);
      if (profileError) throw profileError;
      const previousPhotoPath = profile.avatar_path;
      setProfile(current => ({ ...current, avatar_url: photo.signedUrl, avatar_path: filePath }));
      if (previousPhotoPath && previousPhotoPath !== filePath) {
        const { error: removeError } = await supabase.storage.from('profile-photos').remove([previousPhotoPath]);
        if (removeError) console.warn('Could not remove the previous profile photo:', removeError.message);
      }
      toast.success('Profile photo updated.', { id: toastId });
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('profile-photos').remove([uploadedPath]);
      toast.error(error.message || 'Could not upload the profile photo.', { id: toastId });
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  }

  async function removeProfilePhoto() {
    if (!supabase || !profile?.id || !profile?.avatar_path) return;
    setPhotoUploading(true);
    const toastId = toast.loading('Removing profile photo…');
    try {
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
      if (profileError) throw profileError;
      setProfile(current => ({ ...current, avatar_url: null, avatar_path: null }));
      const { error: removeError } = await supabase.storage.from('profile-photos').remove([profile.avatar_path]);
      if (removeError) console.warn('Could not remove the old profile photo file:', removeError.message);
      toast.success('Profile photo removed.', { id: toastId });
    } catch (error) {
      toast.error(error.message || 'Could not remove the profile photo.', { id: toastId });
    } finally {
      setPhotoUploading(false);
    }
  }

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        signature_url: profile.signature_url || '',
        notification_preferences: { absences: true, announcements: true, behavior: true, schoolwork: true, ...(profile.notification_preferences || {}) },
        delivery_preferences: { email: false, sms: false, whatsapp: false, push: false, ...(profile.delivery_preferences || {}) }
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

      const { error: profileError } = await supabase.from('profiles').update({ signature_url: publicUrl }).eq('id', profile.id);
      if (profileError) throw profileError;

      setFormData({ ...formData, signature_url: publicUrl });
      setProfile(current => ({ ...current, signature_url: publicUrl }));
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
        setProfile(current => ({ ...current, full_name: formData.full_name, phone: formData.phone, notification_preferences: formData.notification_preferences, delivery_preferences: formData.delivery_preferences }));
        toast.success('Profile updated locally (Demo)!');
        return;
      }
      const { error } = await supabase.from('profiles').update({
        full_name: formData.full_name,
        phone: formData.phone,
        signature_url: formData.signature_url,
        notification_preferences: formData.notification_preferences,
        delivery_preferences: formData.delivery_preferences
      }).eq('id', profile.id);
      if (error) throw error;
      setProfile(current => ({ ...current, full_name: formData.full_name, phone: formData.phone, signature_url: formData.signature_url, notification_preferences: formData.notification_preferences, delivery_preferences: formData.delivery_preferences }));
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
        .notification-preferences { display:grid; gap:12px; margin:0; padding:16px; border:1px solid var(--line); border-radius:12px; }
        .notification-preferences legend { padding:0 6px; font-weight:750; }
        .notification-preferences label { display:flex; align-items:flex-start; gap:10px; color:var(--ink); font-size:.88rem; line-height:1.45; }
        .notification-preferences input { width:18px; height:18px; flex:0 0 18px; margin:1px 0 0; }
        .profile-photo-editor { display:flex; align-items:center; gap:18px; padding:20px; border:1px solid var(--line); border-radius:16px; background:linear-gradient(140deg, var(--panel), color-mix(in srgb, var(--green) 5%, var(--panel))); }
        .profile-photo-preview { display:grid; width:96px; height:96px; flex:0 0 96px; place-items:center; overflow:hidden; border:3px solid var(--panel); border-radius:50%; background:var(--cream); color:var(--green); font-size:2rem; font-weight:800; box-shadow:0 0 0 1px var(--line), 0 8px 22px #122b4017; }
        .profile-photo-preview img { width:100%; height:100%; object-fit:cover; }
        .profile-photo-actions { display:flex; flex-wrap:wrap; gap:9px; }
        @media(max-width:520px) { .profile-photo-editor { align-items:flex-start; flex-direction:column; } }
      `}</style>

      <p className="eyebrow">Personal Account</p>
      <h1>My Profile Settings</h1>

      <section className="glass-card profile-photo-editor" aria-label="Profile photo" style={{ marginTop: '20px' }}>
        <div className="profile-photo-preview">{profile?.avatar_url ? <img src={profile.avatar_url} alt="Your profile" /> : profile?.full_name?.trim()?.[0]?.toUpperCase() || 'U'}</div>
        <div><b>Profile photo</b><p style={{ margin: '5px 0 12px', color: 'var(--muted)', fontSize: '.88rem' }}>Upload a new picture or take one with your device camera. Your photo is private to your account. Maximum 5 MB.</p>
          <div className="profile-photo-actions">
            <button type="button" className="button small blue-button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>{photoUploading ? 'Uploading…' : 'Upload photo'}</button>
            <button type="button" className="button small outline" onClick={() => cameraInputRef.current?.click()} disabled={photoUploading}>Take a photo</button>
            {profile?.avatar_path && <button type="button" className="button small outline" onClick={() => void removeProfilePhoto()} disabled={photoUploading}>Remove photo</button>}
          </div>
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={event => void uploadProfilePhoto(event.target.files?.[0])} />
          <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="user" hidden onChange={event => void uploadProfilePhoto(event.target.files?.[0])} />
        </div>
      </section>

      <form onSubmit={handleSave} className="glass-card" style={{ marginTop: '30px', display: 'grid', gap: '20px' }}>
        <label>Full Name
          <input value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} required />
        </label>
        <label>Phone Number
          <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
        </label>

        <label>Portal language
          <select value={lang} onChange={event => setLang(event.target.value)}>
            <option value="en">English</option><option value="sw">Kiswahili</option>
          </select>
          <small style={{display:'block', marginTop:6, color:'var(--muted)'}}>This preference is saved on this device.</small>
        </label>

        <fieldset className="notification-preferences">
          <legend>School notifications</legend>
          <label><input type="checkbox" checked={formData.notification_preferences.absences} onChange={event => setFormData({...formData, notification_preferences:{...formData.notification_preferences, absences:event.target.checked}})} /> Notify me when a learner I’m linked to is marked absent</label>
          <label><input type="checkbox" checked={formData.notification_preferences.announcements} onChange={event => setFormData({...formData, notification_preferences:{...formData.notification_preferences, announcements:event.target.checked}})} /> Send me school announcement alerts</label>
          <label><input type="checkbox" checked={formData.notification_preferences.behavior} onChange={event => setFormData({...formData, notification_preferences:{...formData.notification_preferences, behavior:event.target.checked}})} /> Send me behavior update alerts</label>
          <label><input type="checkbox" checked={formData.notification_preferences.schoolwork} onChange={event => setFormData({...formData, notification_preferences:{...formData.notification_preferences, schoolwork:event.target.checked}})} /> Send me classwork, exam, and published result alerts</label>
        </fieldset>

        <fieldset className="notification-preferences">
          <legend>Delivery channel preferences</legend>
          <p style={{ margin: 0, color: 'var(--muted)' }}>External delivery starts after the school configures its messaging providers.</p>
          {Object.entries({ email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Push notifications' }).map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(formData.delivery_preferences[key])} onChange={event => setFormData(current => ({ ...current, delivery_preferences: { ...current.delivery_preferences, [key]: event.target.checked } }))} /> {label}</label>)}
        </fieldset>

        {canSignOfficialDocuments && (
          <div className="signature-section">
            <b>Draw Your Digital Signature</b>
            <p style={{fontSize: '0.8rem', color: 'var(--muted)'}}>{staffRoles.includes('finance_officer') ? 'This saved signature appears on school fee receipts.' : 'Sign below with your mouse or finger. This saved signature appears on class report cards.'}</p>

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
