import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function SchoolSettings() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState({
    name: '',
    school_motto: '',
    school_level: 'Primary school',
    logo_url: '',
    principal_signature_url: '',
    teacher_signature_url: '',
    mpesa_paybill: '',
    mpesa_till: '',
    bank_name: '',
    bank_account_number: '',
    primary_color: '#2375e1'
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Immediate fallback for no profile or demo environment
    if (!profile || !supabase || demo || !profile.school_id || profile.school_id === 'demo-school-id') {
      setSchool({
        name: 'SmartSchool Demo Academy',
        school_motto: 'Learning for the Future',
        school_level: 'Primary school',
        logo_url: '',
        principal_signature_url: '',
        teacher_signature_url: '',
        mpesa_paybill: '247247',
        mpesa_till: '512345',
        bank_name: 'Equity Bank',
        bank_account_number: '0123456789'
      });
      setLoading(false);
      return;
    }

    // Live environment fetch
    fetchSchool();
  }, [profile, demo]);

  async function fetchSchool() {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('id', profile.school_id)
        .single();

      if (error) throw error;
      if (data) setSchool(data);
    } catch (err) {
      console.error('Failed to fetch school settings:', err);
      toast.error('Using offline settings.');
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(file, bucket, path) {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  }

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from('schools').update({
        name: school.name,
        school_motto: school.school_motto,
        school_level: school.school_level,
        logo_url: school.logo_url,
        principal_signature_url: school.principal_signature_url,
        teacher_signature_url: school.teacher_signature_url,
        mpesa_paybill: school.mpesa_paybill,
        mpesa_till: school.mpesa_till,
        bank_name: school.bank_name,
        bank_account_number: school.bank_account_number,
        primary_color: school.primary_color
      }).eq('id', profile.school_id);
      if (error) throw error;
      toast.success('School settings updated!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const handleFileChange = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    const toastId = toast.loading('Uploading image...');
    try {
      const path = `${profile.school_id}/${field}-${Date.now()}`;
      const url = await uploadFile(file, 'branding', path);
      setSchool({ ...school, [field]: url });
      toast.success('Image uploaded!', { id: toastId });
    } catch (err) {
      toast.error('Upload failed', { id: toastId });
    }
  };

  if (loading) return <div className="portal-loading"><div className="spinner"></div></div>;

  return (
    <div className="settings-page page-transition">
      <style>{`
        .settings-page { max-width: 800px; margin: 40px auto; padding: 0 20px; }
        .settings-grid { display: grid; gap: 30px; margin-top: 30px; }
        .asset-row { display: flex; align-items: center; gap: 20px; padding: 20px; background: var(--panel); border-radius: 16px; border: 1px solid var(--line); }
        .asset-preview { width: 80px; height: 80px; border-radius: 12px; background: var(--bg); display: grid; place-items: center; overflow: hidden; border: 1px solid var(--line); }
        .asset-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .asset-info { flex: 1; }
        .asset-info b { display: block; margin-bottom: 5px; }
        .asset-info input { font-size: 0.8rem; }
      `}</style>

      <p className="eyebrow blue-eyebrow">ADMINISTRATION</p>
      <h1>School Branding & Settings</h1>
      <p>Customize your report cards with your school logo and official signatures.</p>

      <form onSubmit={saveSettings} className="settings-grid">
        <div className="glass-card">
          <label>School Name</label>
          <input value={school.name} onChange={e => setSchool({...school, name: e.target.value})} required />

          <label style={{marginTop:'20px'}}>School Level</label>
          <select value={school.school_level} onChange={e => setSchool({...school, school_level: e.target.value})}>
            <option value="Primary school">Primary school</option>
            <option value="Secondary school">Secondary school</option>
            <option value="Both primary & secondary">Both primary & secondary</option>
          </select>

          <label style={{marginTop:'20px'}}>School Motto</label>
          <input value={school.school_motto || ''} onChange={e => setSchool({...school, school_motto: e.target.value})} placeholder="e.g. Striving for Excellence" />

          <label style={{marginTop:'20px'}}>Brand Primary Color</label>
          <div style={{display: 'flex', gap: '15px', alignItems: 'center', marginTop: '10px'}}>
            <input
              type="color"
              value={school.primary_color || '#2375e1'}
              onChange={e => setSchool({...school, primary_color: e.target.value})}
              style={{width: '60px', height: '45px', padding: '5px', cursor: 'pointer', borderRadius: '8px'}}
            />
            <span style={{fontSize: '0.9rem', color: 'var(--muted)'}}>{school.primary_color}</span>
          </div>
        </div>

        <div className="glass-card">
          <h3>Payment Accounts</h3>
          <p style={{fontSize:'0.8rem', color:'var(--muted)', marginBottom:'15px'}}>Configure your school's official payment channels.</p>
          <label>M-Pesa Paybill</label>
          <input value={school.mpesa_paybill || ''} onChange={e => setSchool({...school, mpesa_paybill: e.target.value})} placeholder="e.g. 247247" />

          <label style={{marginTop:'15px'}}>M-Pesa Till Number</label>
          <input value={school.mpesa_till || ''} onChange={e => setSchool({...school, mpesa_till: e.target.value})} placeholder="e.g. 512345" />

          <label style={{marginTop:'15px'}}>Bank Name</label>
          <input value={school.bank_name || ''} onChange={e => setSchool({...school, bank_name: e.target.value})} placeholder="e.g. Equity Bank" />

          <label style={{marginTop:'15px'}}>Bank Account Number</label>
          <input value={school.bank_account_number || ''} onChange={e => setSchool({...school, bank_account_number: e.target.value})} placeholder="e.g. 0123456789" />
        </div>

        <div className="asset-row">
          <div className="asset-preview">
            {school.logo_url ? <img src={school.logo_url} alt="Logo" /> : <span>Logo</span>}
          </div>
          <div className="asset-info">
            <b>School Logo / Badge</b>
            <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'logo_url')} />
          </div>
        </div>

        <div className="asset-row">
          <div className="asset-preview">
            {school.principal_signature_url ? <img src={school.principal_signature_url} alt="Principal Sig" /> : <span>Sig</span>}
          </div>
          <div className="asset-info">
            <b>Principal's Signature</b>
            <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'principal_signature_url')} />
          </div>
        </div>

        <div className="asset-row">
          <div className="asset-preview">
            {school.teacher_signature_url ? <img src={school.teacher_signature_url} alt="Teacher Sig" /> : <span>Sig</span>}
          </div>
          <div className="asset-info">
            <b>Teacher's Signature (General)</b>
            <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'teacher_signature_url')} />
          </div>
        </div>

        <button className="button blue-button" style={{justifyContent:'center'}} disabled={saving}>
          {saving ? 'Saving...' : 'Save All Settings →'}
        </button>
      </form>
    </div>
  );
}
