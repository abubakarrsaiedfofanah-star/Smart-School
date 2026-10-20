import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { detectLogoColor, normalizeBrandColor } from '../lib/brandColor';

export default function SchoolSettings() {
  const { profile, setSchool: setTenant, demo } = useAuth();
  const [loading, setLoading] = useState(true);
  const [school, setSchool] = useState({
    name: '',
    school_motto: '',
    mission: '',
    vision: '',
    school_level: '',
    logo_url: '',
    principal_signature_url: '',
    teacher_signature_url: '',
    mpesa_paybill: '',
    mpesa_till: '',
    country_code: '',
    mobile_money_provider: '',
    mobile_money_number: '',
    mobile_money_account_name: '',
    bank_name: '',
    bank_account_number: '',
    primary_color: '',
    timezone: '',
    currency_code: '',
    academic_terms: [],
    grading_scale: []
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (demo || !profile || !supabase || !profile.school_id) {
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
    const gradeBands = school.grading_scale || [];
    const boundaries = gradeBands.map(band => Number(band.min));
    const terms = (school.academic_terms || []).map(term => term.trim());
    if (terms.length < 2 || terms.length > 6 || terms.some(term => term.length < 2 || term.length > 40) || new Set(terms.map(term => term.toLowerCase())).size !== terms.length) {
      toast.error('Add 2–6 distinct academic terms, each between 2 and 40 characters.');
      return;
    }
    if (!gradeBands.length || boundaries.some(value => !Number.isFinite(value) || value < 0 || value > 100) || new Set(boundaries).size !== boundaries.length || !boundaries.includes(0)) {
      toast.error('Grade boundaries must be unique values from 0 to 100, including a starting grade at 0%.');
      return;
    }
    if (demo || !supabase || !profile?.school_id) { toast.error('Connect a school account to save these settings.'); return }
    setSaving(true);
    try {
      const { error } = await supabase.from('schools').update({
        name: school.name,
        school_motto: school.school_motto,
        mission: school.mission || '',
        vision: school.vision || '',
        school_level: school.school_level,
        logo_url: school.logo_url,
        principal_signature_url: school.principal_signature_url,
        teacher_signature_url: school.teacher_signature_url,
        mpesa_paybill: school.mpesa_paybill,
        mpesa_till: school.mpesa_till,
        country_code: school.country_code || 'KE',
        mobile_money_provider: school.mobile_money_provider || '',
        mobile_money_number: school.mobile_money_number || '',
        mobile_money_account_name: school.mobile_money_account_name || '',
        bank_name: school.bank_name,
        bank_account_name: school.bank_account_name,
        bank_account_number: school.bank_account_number,
        primary_color: school.primary_color,
        timezone: school.timezone || 'Africa/Nairobi',
        currency_code: school.currency_code || 'KES',
        academic_terms: terms,
        grading_scale: school.grading_scale || [{ min: 80, grade: 'A' }, { min: 70, grade: 'B' }, { min: 60, grade: 'C' }, { min: 50, grade: 'D' }, { min: 0, grade: 'E' }]
      }).eq('id', profile.school_id);
      if (error) throw error;
      setTenant({ ...school, academic_terms: terms });
      toast.success('School settings updated!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const handleFileChange = async (e, field) => {
    if (demo) { toast.error('Demo account is read only.'); return }
    const file = e.target.files[0];
    if (!file) return;
    const toastId = toast.loading('Uploading image...');
    try {
      let detectedColor;
      if (field === 'logo_url') {
        const localImage = URL.createObjectURL(file);
        try { detectedColor = await detectLogoColor(localImage); }
        catch (error) { toast(error.message || 'Could not detect the logo color. You can choose it manually.'); }
        finally { URL.revokeObjectURL(localImage); }
      }
      const path = `${profile.school_id}/${field}-${Date.now()}`;
      const url = await uploadFile(file, 'branding', path);
      const updates = { [field]: url };
      if (detectedColor) updates.primary_color = detectedColor;
      setSchool(current => ({ ...current, ...updates }));
      toast.success(field === 'logo_url' && updates.primary_color ? `Logo uploaded. Detected ${updates.primary_color}.` : 'Image uploaded!', { id: toastId });
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
        .school-local-settings { display:grid; gap:15px; }
        .school-local-settings h3, .school-local-settings p { margin:0; }
        .grading-scale-editor { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; padding-top:8px; }
        .grading-scale-editor > b, .grading-scale-editor > p { grid-column:1/-1; }
        .grading-scale-editor label { display:grid; gap:6px; color:var(--muted); font-size:.78rem; }
        .grading-scale-editor input { min-height:40px; padding:8px 10px; border-radius:8px; }
      `}</style>

      <p className="eyebrow blue-eyebrow">ADMINISTRATION</p>
      <h1>School Branding & Settings</h1>
      <p>Set your school identity and portal accent color.</p>

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

          <label style={{marginTop:'20px'}}>Mission</label>
          <textarea value={school.mission || ''} onChange={e => setSchool({...school, mission: e.target.value})} placeholder="Describe your school's purpose and the work it does for learners." maxLength={2000} rows={4} />

          <label style={{marginTop:'20px'}}>Vision</label>
          <textarea value={school.vision || ''} onChange={e => setSchool({...school, vision: e.target.value})} placeholder="Describe the future your school aims to create." maxLength={2000} rows={4} />

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
          <label>Mobile money provider</label>
          <input value={school.mobile_money_provider || ''} onChange={e => setSchool({...school, mobile_money_provider: e.target.value})} placeholder="e.g. M-Pesa, Orange Money" />

          <label style={{marginTop:'15px'}}>Mobile money account / merchant number</label>
          <input value={school.mobile_money_number || school.mpesa_paybill || school.mpesa_till || ''} onChange={e => setSchool({...school, mobile_money_number: e.target.value})} placeholder="Merchant or mobile account number" />

          <label style={{marginTop:'15px'}}>Mobile money account name</label>
          <input value={school.mobile_money_account_name || ''} onChange={e => setSchool({...school, mobile_money_account_name: e.target.value})} placeholder="Account holder" />

          <label style={{marginTop:'15px'}}>Bank Name</label>
          <input value={school.bank_name || ''} onChange={e => setSchool({...school, bank_name: e.target.value})} placeholder="e.g. Equity Bank" />

          <label style={{marginTop:'15px'}}>Bank Account Name</label>
          <input value={school.bank_account_name || ''} onChange={e => setSchool({...school, bank_account_name: e.target.value})} placeholder="Account holder name" />

          <label style={{marginTop:'15px'}}>Bank Account Number</label>
          <input value={school.bank_account_number || ''} onChange={e => setSchool({...school, bank_account_number: e.target.value})} placeholder="e.g. 0123456789" />
          <label style={{marginTop:'15px'}}>Country code</label>
          <input value={school.country_code || 'KE'} maxLength={2} onChange={e => setSchool({...school, country_code: e.target.value.toUpperCase()})} placeholder="e.g. KE, SL" />
        </div>

        <div className="glass-card school-local-settings">
          <h3>Local school settings</h3>
          <p style={{fontSize:'.85rem', color:'var(--muted)'}}>Set date, currency, academic term and grade formats. Currency changes display only.</p>
          <label>Time zone
            <input value={school.timezone || 'Africa/Nairobi'} onChange={e => setSchool({...school, timezone:e.target.value})} placeholder="IANA time zone, e.g. Africa/Freetown" />
          </label>
          <label>Currency
            <input value={school.currency_code || 'KES'} maxLength={3} pattern="[A-Z]{3}" onChange={e => setSchool({...school, currency_code:e.target.value.toUpperCase()})} placeholder="3-letter code, e.g. SLE" />
          </label>
          <div className="grading-scale-editor"><b>Academic terms</b><p>Used for exams and report cards. Existing records keep their term.</p>
            {(school.academic_terms || []).map((term, index) => <label key={`term-${index}`}>Term {index + 1}
              <input type="text" maxLength="40" value={term} onChange={event => setSchool({...school, academic_terms:school.academic_terms.map((item, itemIndex) => itemIndex === index ? event.target.value : item)})} />
            </label>)}
            {(school.academic_terms || []).length < 6 && <button type="button" className="outline-button" onClick={() => setSchool({...school, academic_terms:[...school.academic_terms, `Term ${school.academic_terms.length + 1}`]})}>Add term</button>}
            {(school.academic_terms || []).length > 2 && <button type="button" className="outline-button" onClick={() => setSchool({...school, academic_terms:school.academic_terms.slice(0, -1)})}>Remove last term</button>}
          </div>
          <div className="grading-scale-editor"><b>Grade boundaries</b><p>Set grade minimums from 0 to 100%. Include a grade starting at 0%.</p>
            {(school.grading_scale || []).map((band, index) => <label key={`${band.grade}-${index}`}>{band.grade} starts at
              <input type="number" min="0" max="100" value={band.min} onChange={event => setSchool({...school, grading_scale:school.grading_scale.map((item, itemIndex) => itemIndex === index ? {...item, min:Number(event.target.value)} : item)})} />%
            </label>)}
          </div>
        </div>

        <div className="asset-row">
          <div className="asset-preview">
            {school.logo_url ? <img src={school.logo_url} alt="Logo" /> : <span>Logo</span>}
          </div>
          <div className="asset-info">
            <b>School Logo / Badge</b>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e => handleFileChange(e, 'logo_url')} />
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
