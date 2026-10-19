import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const steps = ['School', 'Level', 'Accounts', 'Admin', 'Review', 'Plan', 'Done']
const countryDefaults = { KE: { currency: 'KES', timezone: 'Africa/Nairobi', label: 'Kenya' }, SL: { currency: 'SLE', timezone: 'Africa/Freetown', label: 'Sierra Leone' }, UG: { currency: 'UGX', timezone: 'Africa/Kampala', label: 'Uganda' }, TZ: { currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', label: 'Tanzania' }, GH: { currency: 'GHS', timezone: 'Africa/Accra', label: 'Ghana' }, NG: { currency: 'NGN', timezone: 'Africa/Lagos', label: 'Nigeria' }, RW: { currency: 'RWF', timezone: 'Africa/Kigali', label: 'Rwanda' }, ZM: { currency: 'ZMW', timezone: 'Africa/Lusaka', label: 'Zambia' }, MW: { currency: 'MWK', timezone: 'Africa/Blantyre', label: 'Malawi' }, ZA: { currency: 'ZAR', timezone: 'Africa/Johannesburg', label: 'South Africa' }, LR: { currency: 'LRD', timezone: 'Africa/Monrovia', label: 'Liberia' }, GM: { currency: 'GMD', timezone: 'Africa/Banjul', label: 'The Gambia' }, SN: { currency: 'XOF', timezone: 'Africa/Dakar', label: 'Senegal' }, CI: { currency: 'XOF', timezone: 'Africa/Abidjan', label: 'Côte d’Ivoire' }, CM: { currency: 'XAF', timezone: 'Africa/Douala', label: 'Cameroon' }, ET: { currency: 'ETB', timezone: 'Africa/Addis_Ababa', label: 'Ethiopia' }, EG: { currency: 'EGP', timezone: 'Africa/Cairo', label: 'Egypt' }, US: { currency: 'USD', timezone: 'America/New_York', label: 'United States' }, GB: { currency: 'GBP', timezone: 'Europe/London', label: 'United Kingdom' }, OTHER: { currency: 'USD', timezone: 'UTC', label: 'Other country' } }
const currencyOptions = [...new Set([...Object.values(countryDefaults).map(country => country.currency), 'KES','SLE','UGX','TZS','GHS','NGN','USD'])]
const initial = { schoolName: '', email: '', phone: '', address: '', countryCode: 'KE', customCountryCode: '', currencyCode: 'KES', timezone: 'Africa/Nairobi', level: 'Primary school', mobileProvider: 'M-Pesa', mobileMoneyNumber: '', mobileMoneyAccountName: '', mpesaPaybill: '', mpesaTill: '', bankName: '', bankAccountName: '', bankAccountNumber: '', adminName: '', adminEmail: '', adminPhone: '', password: '', confirmPassword: '', plan: 'Starter', trialRequested: false }
const draftTtl = 24 * 60 * 60 * 1000
const persistDraft = values => {
  const { password, confirmPassword, mobileMoneyNumber, mobileMoneyAccountName, mpesaPaybill, mpesaTill, bankName, bankAccountName, bankAccountNumber, ...safeDraft } = values
  try { localStorage.setItem('smartschool_reg_draft', JSON.stringify({ savedAt: Date.now(), values: safeDraft })) } catch { /* Keep registration usable when browser storage is unavailable. */ }
}
const loadDraft = () => {
  try {
    const saved = localStorage.getItem('smartschool_reg_draft')
    if (!saved) return initial
    const parsed = JSON.parse(saved)
    const savedAt = Number(parsed.savedAt)
    if (Number.isFinite(savedAt) && (Date.now() - savedAt > draftTtl || savedAt > Date.now())) {
      localStorage.removeItem('smartschool_reg_draft')
      localStorage.removeItem('smartschool_reg_step')
      return initial
    }
    const draft = { ...initial, ...(parsed.values || parsed), password: '', confirmPassword: '' }
    persistDraft(draft)
    return draft
  } catch {
    try { localStorage.removeItem('smartschool_reg_draft') } catch { /* Ignore unavailable browser storage. */ }
    return initial
  }
}
const loadDraftStep = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('smartschool_reg_draft') || 'null')
    const savedAt = Number(parsed?.savedAt)
    if (Number.isFinite(savedAt) && (Date.now() - savedAt > draftTtl || savedAt > Date.now())) return 0
    const savedStep = Number(localStorage.getItem('smartschool_reg_step'))
    return Number.isInteger(savedStep) && savedStep >= 0 && savedStep < steps.length ? savedStep : 0
  } catch { return 0 }
}

const getPasswordStrength = (password) => {
  if (!password) return { label: '', color: 'transparent', score: 0 };
  let score = 0;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const strengths = [
    { label: 'Weak', color: '#ff4d4d', score: 1 },
    { label: 'Fair', score: 2, color: '#ffa500' },
    { label: 'Good', score: 3, color: '#1cb681' },
    { label: 'Strong', score: 4, color: '#11966a' }
  ];
  return strengths[score - 1] || strengths[0];
};

export default function RegisterSchool(){
  const navigate = useNavigate();
  const [searchParams] = useSearchParams()
  const [step,setStep]=useState(loadDraftStep);

  const [form,setForm]=useState(()=>{
    const draft = loadDraft()
    const requestedPlan = searchParams.get('plan')
    const selectedPlan = ['Starter', 'Professional', 'Enterprise'].includes(requestedPlan) ? requestedPlan : draft.plan
    return { ...draft, plan: selectedPlan, trialRequested: searchParams.get('trial') === '1' || draft.trialRequested }
  });

  const [saving,setSaving]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const [showConfirmPassword,setShowConfirmPassword]=useState(false);
  const [showHelpModal,setShowHelpModal]=useState(false);
  const [helpTopic,setHelpTopic]=useState('');

  const update=(key,value)=>setForm(current=>{
    const updated = {...current,[key]:value};
    persistDraft(updated)
    return updated;
  });

  useEffect(()=>{
    try { localStorage.setItem('smartschool_reg_step', step.toString()) } catch { /* Keep registration usable when browser storage is unavailable. */ }
  },[step]);

  useEffect(() => {
    if (!showHelpModal) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => { if (event.key === 'Escape') setShowHelpModal(false) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [showHelpModal])
  const clearDraft = () => {
    try { localStorage.removeItem('smartschool_reg_draft'); localStorage.removeItem('smartschool_reg_step') } catch { /* Ignore unavailable browser storage. */ }
    setForm(initial);
    setStep(0);
    toast.success('Registration draft cleared.');
  }

  const next=()=>{
    if(step===0&&(!form.schoolName||!form.email||!form.phone)) return toast.error('Please add the school name, email and phone number.');
    if(step===0&&(!/^[A-Z]{3}$/.test(form.currencyCode)|| (form.countryCode==='OTHER'&&!/^[A-Z]{2}$/.test(form.customCountryCode)))) return toast.error('Choose a valid 3-letter currency and country.');
    if(step===3&&(!form.adminName||!form.adminEmail||!form.password)) return toast.error('Please complete the administrator details.');
    if(step===3&&form.password.length<12) return toast.error('Use a password with at least 12 characters.');
    if(step===3&&form.password !== form.confirmPassword) return toast.error('Passwords do not match.');
    setStep(current=>Math.min(current+1,5))
  }
  const back=()=>setStep(current=>Math.max(current-1,0))

  async function submit(){
    setSaving(true);
    const id = toast.loading('Setting up your institutional workspace...');
    try{
      if(supabase){
        const { data, error } = await supabase.functions.invoke('register-school', { body: {
          school: { name: form.schoolName, email: form.email, phone: form.phone, address: form.address, country_code: form.countryCode==='OTHER'?form.customCountryCode:form.countryCode, currency_code: form.currencyCode, timezone: form.timezone, school_level: form.level, subscription_plan: form.plan, trial_requested: form.trialRequested, mobile_money_provider: form.mobileProvider, mobile_money_number: form.mobileMoneyNumber, mobile_money_account_name: form.mobileMoneyAccountName, mpesa_paybill: form.mpesaPaybill, mpesa_till: form.mpesaTill, bank_name: form.bankName, bank_account_name: form.bankAccountName, bank_account_number: form.bankAccountNumber },
          admin: { full_name: form.adminName, email: form.adminEmail.trim().toLowerCase(), phone: form.adminPhone, password: form.password }
        } });
        if (error) {
          const response = await error.context?.json?.().catch(() => null)
          throw new Error(response?.error || error.message)
        }
        if (data?.error) throw new Error(data.error)
      } else {
        throw new Error('School registration needs a Supabase connection. Configure the app credentials before creating a school.');
      }
      localStorage.removeItem('smartschool_reg_draft');
      localStorage.removeItem('smartschool_reg_step');
      toast.success(form.trialRequested ? 'Trial request submitted for review.' : 'School and plan request submitted for review.', {id});
      setStep(6)
    }catch(e){
      toast.error(e.message || 'Could not register the school. Check the details and try again.', {id});
    }finally{
      setSaving(false)
    }
  }

  const passwordStrength = getPasswordStrength(form.password);



  const copyCredentials = () => {
    const text = `School: ${form.schoolName}\nAdmin Email: ${form.adminEmail}\nPlan: ${form.plan}`;
    navigator.clipboard.writeText(text);
    toast.success('School details copied to clipboard.');
  }

  const openHelp = (topic) => {
    setHelpTopic(topic);
    setShowHelpModal(true);
  }

  const content=[
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2>Tell us about your school</h2>
          <p className="form-help" style={{ margin: 0 }}>Basic institutional contact & location details.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {localStorage.getItem('smartschool_reg_draft') && (
            <button type="button" onClick={clearDraft} style={{ fontSize: '0.8rem', padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#ff4d4d' }}>
              Reset Draft
            </button>
          )}

        </div>
      </div>
      <Field label="School name" value={form.schoolName} onChange={v=>update('schoolName',v)} placeholder="e.g. Springfield High School"/>
      <Field label="School email" type="email" value={form.email} onChange={v=>update('email',v)} placeholder="info@springfield.edu"/>
      <Field label="Phone number" value={form.phone} onChange={v=>update('phone',v)} placeholder="+254 700 000000"/>
      <Field label="Address / Location" value={form.address} onChange={v=>update('address',v)} placeholder="City, Street, Region"/>
      <label style={{display:'grid',gap:'6px',fontWeight:600,fontSize:'0.9rem',marginBottom:'16px'}}><span>Country</span><select value={form.countryCode} onChange={event => { const country = event.target.value; const defaults = countryDefaults[country]; setForm(current => { const updated = { ...current, countryCode: country, customCountryCode: '', currencyCode: defaults.currency, timezone: defaults.timezone, mobileProvider: country === 'KE' ? 'M-Pesa' : '' }; persistDraft(updated); return updated }) }}>{Object.entries(countryDefaults).map(([code, country]) => <option key={code} value={code}>{country.label}</option>)}</select></label>
      {form.countryCode==='OTHER' && <Field label="2-letter country code" value={form.customCountryCode} onChange={v=>update('customCountryCode',v.toUpperCase().slice(0,2))} placeholder="e.g. SL"/>}
      <label style={{display:'grid',gap:'6px',fontWeight:600,fontSize:'0.9rem',marginBottom:'16px'}}><span>School currency</span><select value={form.currencyCode} onChange={event => update('currencyCode', event.target.value)}>{currencyOptions.map(currency => <option key={currency} value={currency}>{currency}</option>)}</select></label>
      {form.countryCode==='OTHER' && <Field label="Other 3-letter currency code" value={form.currencyCode} onChange={v=>update('currencyCode',v.toUpperCase().slice(0,3))} placeholder="e.g. SLE"/>}
    </>,
    <>
      <h2>Choose your school level</h2>
      <p className="form-help">This tailors your workspace curriculum and gradebook structures.</p>
      <div className="choice-grid">
        {['Primary school','Secondary school','Both primary & secondary'].map(level=>(
          <button type="button" onClick={()=>update('level',level)} className={'choice '+(form.level===level?'selected':'')} key={level}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>
              {level}
            </div>
            <small style={{ color: 'var(--muted)' }}>Optimized reporting & term structures</small>
          </button>
        ))}
      </div>
    </>,
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h2>School Payment Accounts</h2>
        <button type="button" onClick={()=>openHelp('payments')} style={{ background: 'none', border: 'none', color: 'var(--green)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
          Why configure this?
        </button>
      </div>
      <p className="form-help">Add the school’s own local bank or mobile money details. These provide payment instructions; automated collection is enabled after a supported provider is connected.</p>
      <Field label="Mobile money provider (Optional)" value={form.mobileProvider} onChange={v=>update('mobileProvider',v)} placeholder="e.g. M-Pesa, Orange Money"/>
      <Field label="Mobile money account / number" value={form.mobileMoneyNumber} onChange={v=>update('mobileMoneyNumber',v)} placeholder="Provider account or merchant number"/>
      <Field label="Mobile money account name" value={form.mobileMoneyAccountName} onChange={v=>update('mobileMoneyAccountName',v)} placeholder="Name shown to payers"/>
      <Field label="Bank name" value={form.bankName} onChange={v=>update('bankName',v)} placeholder="Your school’s bank"/>
      <Field label="Bank account name" value={form.bankAccountName} onChange={v=>update('bankAccountName',v)} placeholder="Account holder"/>
      <Field label="Bank account number" value={form.bankAccountNumber} onChange={v=>update('bankAccountNumber',v)} placeholder="School account number"/>
    </>,
    <>
      <h2>Create the administrator</h2>
      <p className="form-help">This master account will manage staff, teachers, and system permissions.</p>
      <Field label="Full name" value={form.adminName} onChange={v=>update('adminName',v)} placeholder="Dr. Jane Doe"/>
      <Field label="Administrator email" type="email" value={form.adminEmail} onChange={v=>update('adminEmail',v)} placeholder="admin@school.edu"/>
      <Field label="Phone number" value={form.adminPhone} onChange={v=>update('adminPhone',v)} placeholder="+254 711 000000"/>

      <label>Password
        <div className="password-field" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input type={showPassword?'text':'password'} value={form.password} onChange={event=>update('password',event.target.value)} placeholder="At least 12 characters" minLength={12} autoComplete="new-password" required style={{ width: '100%', paddingRight: '70px' }}/>
          <button type="button" onClick={()=>setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', background: 'transparent', border: 'none', fontWeight: 600, color: 'var(--muted)', cursor: 'pointer' }}>{showPassword?'Hide':'Show'}</button>
        </div>
        {form.password && (
          <div className="password-strength" style={{ marginTop: '8px' }}>
            <div className="strength-bar" style={{ height: '6px', background: 'var(--line)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${(passwordStrength.score/4)*100}%`, height: '100%', backgroundColor: passwordStrength.color, transition: 'width 0.3s' }}></div>
            </div>
            <span style={{ color: passwordStrength.color, fontSize: '0.8rem', fontWeight: 700, marginTop: '4px', display: 'inline-block' }}>Strength: {passwordStrength.label}</span>
          </div>
        )}
      </label>

      <label style={{ marginTop: '15px' }}>Confirm Password
        <div className="password-field" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input type={showConfirmPassword?'text':'password'} value={form.confirmPassword} onChange={event=>update('confirmPassword',event.target.value)} placeholder="Re-enter password" minLength={12} autoComplete="new-password" required style={{ width: '100%', paddingRight: '70px' }}/>
          <button type="button" onClick={()=>setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: '12px', background: 'transparent', border: 'none', fontWeight: 600, color: 'var(--muted)', cursor: 'pointer' }}>{showConfirmPassword?'Hide':'Show'}</button>
        </div>
        {form.confirmPassword && (
          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '6px', color: form.password === form.confirmPassword ? '#1cb681' : '#ff4d4d' }}>
            {form.password === form.confirmPassword ? 'Passwords match' : 'Passwords do not match'}
          </div>
        )}
      </label>
    </>,
    <>
      <h2>Check your details</h2>
      <p className="form-help">Review everything before finalizing your workspace configuration.</p>
      <div className="review" style={{ background: 'var(--cream)', padding: '20px', borderRadius: '16px', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: '1.1rem', color: 'var(--ink)' }}>{form.schoolName || 'Unnamed School'}</b>
          <span style={{ background: 'var(--green)', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>{form.level}</span>
        </div>
        <p style={{ margin: '8px 0', color: 'var(--muted)', fontSize: '0.9rem' }}>{form.email} Â· {form.phone}</p>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '0.85rem' }}>{form.address || 'No address specified'}</p>
        <hr style={{ borderColor: 'var(--line)', margin: '15px 0' }}/>
        <div style={{ display: 'grid', gap: '4px' }}>
          <b style={{ fontSize: '0.9rem' }}>Administrator: {form.adminName || 'Not specified'}</b>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{form.adminEmail} ({form.adminPhone})</span>
        </div>
      </div>
    </>,
    <>
      <h2>Choose your plan</h2>
      <p className="form-help">Choose the plan you want to request. The platform administrator will review it; online payment checkout is not connected yet.</p>
      <div className="choice-grid">
        {['Starter','Professional','Enterprise'].map(plan=>(
          <button type="button" onClick={()=>update('plan',plan)} className={'choice '+(form.plan===plan?'selected':'')} key={plan} style={{ textAlign: 'left', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <b style={{ fontSize: '1.1rem' }}>{plan}</b>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: form.plan === plan ? 'var(--green)' : 'var(--muted)' }}>{plan === 'Enterprise' ? 'Contact us' : 'Subscription plan'}</span>
            </div>
            <small style={{ color: 'var(--muted)', display: 'block', lineHeight: 1.4 }}>
              {plan==='Starter'?'Core attendance, gradebook, and student profiles for small schools.':plan==='Professional'?'More insight, automated fee collection, and parent portal features.':'Full school operations, custom geofence tracking, and priority support.'}
            </small>
          </button>
        ))}
      </div>
      <label className="registration-trial-option"><input type="checkbox" checked={form.trialRequested} onChange={event => update('trialRequested', event.target.checked)} /><span><b>Request a 14-day free trial</b><small>Starts after school approval.</small></span></label>
    </>,
    <div className="confirmation" style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ width: '70px', height: '70px', background: 'var(--green)', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, margin: '0 auto 20px', boxShadow: '0 10px 25px rgba(28, 182, 129, 0.3)' }}>OK</div>
      <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>School request submitted</h2>
      <p style={{ color: 'var(--muted)', maxWidth: '400px', margin: '0 auto 25px' }}>{form.trialRequested ? 'Your 14-day trial request is waiting for review.' : 'Your school and subscription request are waiting for review.'} The portal opens after approval.</p>

      <div style={{ background: 'var(--cream)', padding: '20px', borderRadius: '16px', maxWidth: '400px', margin: '0 auto 25px', textAlign: 'left', border: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Institution:</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{form.schoolName}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Admin Email:</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{form.adminEmail}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Selected Plan:</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--green)', fontWeight: 700 }}>{form.plan}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={copyCredentials} className="outline-button" style={{ padding: '12px 20px', borderRadius: '12px', background: 'var(--panel)', border: '1px solid var(--line)', cursor: 'pointer', fontWeight: 600 }}>
          Copy school details
        </button>
        <Link className="button blue-button" to="/login" style={{ padding: '12px 24px', borderRadius: '12px' }}>
          Sign in to the portal
        </Link>
      </div>
    </div>
  ]

  return (
    <div className="register register-page" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1.2fr' }}>
      <aside className="register-aside" style={{ background: 'var(--ink)', color: '#fff', padding: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <Link className="brand light" to="/" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>Smart<span>School</span></Link>
          <div className="register-aside-hero" style={{ marginTop: '60px' }}>
            <p className="eyebrow light" style={{ color: 'var(--green)' }}>INSTITUTIONAL ONBOARDING</p>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '20px' }}>Start with a clearer school day.</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', lineHeight: 1.6 }}>Simple, lightning-fast setup for your teachers, learners, and families in one unified workspace.</p>
          </div>
        </div>
        <ol className="step-list" style={{ listStyle: 'none', padding: 0, margin: '40px 0 0', display: 'grid', gap: '16px' }}>
          {steps.map((label, index) => (
            <li className={index < step ? 'done' : index === step ? 'current' : ''} key={label} style={{ display: 'flex', alignItems: 'center', gap: '14px', opacity: index === step ? 1 : index < step ? 0.9 : 0.4 }}>
              <span className="step-num" style={{ width: '28px', height: '28px', borderRadius: '50%', background: index <= step ? 'var(--green)' : 'rgba(255,255,255,0.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>{index < step ? 'OK' : index + 1}</span>
              <span className="step-label" style={{ fontWeight: index === step ? 700 : 500, fontSize: '0.95rem' }}>{label}</span>
            </li>
          ))}
        </ol>
      </aside>

      <main className="register-main" style={{ padding: '50px', background: 'var(--panel)', display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: '700px', width: '100%', margin: '0 auto' }}>
        {step < 6 && <>
          <div className="register-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <p className="step-indicator" style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem', color: 'var(--green)', letterSpacing: '1px' }}>STEP {step + 1} OF 6 <span aria-hidden="true">·</span> {steps[step]}</p>
          </div>
          <div className="progress-bar-wrapper" role="progressbar" aria-label="School registration progress" aria-valuemin="1" aria-valuemax="6" aria-valuenow={step + 1} style={{ height: '6px', background: 'var(--line)', borderRadius: '3px', marginBottom: '30px', overflow: 'hidden' }}>
            <div className="progress" style={{ height: '100%', background: 'var(--green)', width: `${((step + 1) / 6) * 100}%`, transition: 'width 0.3s' }} />
          </div>

          {content[step]}

          <div className="form-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px', borderTop: '1px solid var(--line)', paddingTop: '20px' }}>
            {step > 0 ? <button type="button" className="back-btn" onClick={back} style={{ background: 'var(--cream)', border: '1px solid var(--line)', padding: '12px 20px', borderRadius: '12px', cursor: 'pointer', fontWeight: 600 }}>Back</button> : <Link className="back-btn" to="/" style={{ color: 'var(--muted)', fontWeight: 600 }}>Cancel</Link>}
            {step < 5 ?
              <button type="button" className="button blue-button" onClick={next} style={{ padding: '14px 28px', borderRadius: '12px' }}>Continue</button> :
              <button type="button" className="button blue-button" onClick={step === 5 ? submit : next} disabled={saving} style={{ padding: '14px 28px', borderRadius: '12px' }}>
                {step === 5 ? (saving ? 'Creating workspace...' : 'Create workspace') : 'Review plan'}
              </button>
            }
          </div>
        </>}
        {step === 6 && content[6]}
      </main>

      {/* Help Modal */}
      {showHelpModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '450px', background: 'var(--panel)', borderRadius: '24px', padding: '30px', boxShadow: 'var(--shadow)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Payment Accounts Setup</h3>
              <button onClick={()=>setShowHelpModal(false)} style={{ background: 'var(--cream)', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>Close</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
              Each school stores its own local mobile money and bank details. Parents see those instructions in the school portal. Automatic checkout and transaction reconciliation require the school’s supported payment provider to be connected separately.
            </p>
            <button type="button" onClick={()=>setShowHelpModal(false)} className="button blue-button full" style={{ borderRadius: '12px', padding: '12px' }}>Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({label,type='text',value,onChange,placeholder}){return <label style={{ display: 'grid', gap: '6px', fontWeight: 600, fontSize: '0.9rem', marginBottom: '16px' }}>{label}<input type={type} value={value} onChange={event=>onChange(event.target.value)} placeholder={placeholder} style={{ borderRadius: '12px', padding: '14px 16px' }} required/></label>}
