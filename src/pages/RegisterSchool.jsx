import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import VideoGuide from '../components/VideoGuide'
import toast from 'react-hot-toast'

const steps = ['School', 'Level', 'Accounts', 'Admin', 'Review', 'Plan', 'Done']
const initial = { schoolName: '', email: '', phone: '', address: '', level: 'Primary school', mpesaPaybill: '', mpesaTill: '', bankName: '', bankAccountName: '', bankAccountNumber: '', adminName: '', adminEmail: '', adminPhone: '', password: '', confirmPassword: '', plan: 'Starter' }
const persistDraft = values => {
  const { password, confirmPassword, ...safeDraft } = values
  localStorage.setItem('smartschool_reg_draft', JSON.stringify(safeDraft))
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
  const [step,setStep]=useState(()=>{
    const savedStep = localStorage.getItem('smartschool_reg_step');
    return savedStep ? parseInt(savedStep, 10) : 0;
  });

  const [form,setForm]=useState(()=>{
    const saved = localStorage.getItem('smartschool_reg_draft');
    if (!saved) return initial
    try {
      const draft = { ...initial, ...JSON.parse(saved), password: '', confirmPassword: '' }
      persistDraft(draft)
      return draft
    } catch {
      localStorage.removeItem('smartschool_reg_draft')
      return initial
    }
  });

  const [saving,setSaving]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const [showConfirmPassword,setShowConfirmPassword]=useState(false);
  const [showVideoGuide,setShowVideoGuide]=useState(false);
  const [showHelpModal,setShowHelpModal]=useState(false);
  const [helpTopic,setHelpTopic]=useState('');

  const update=(key,value)=>setForm(current=>{
    const updated = {...current,[key]:value};
    persistDraft(updated)
    return updated;
  });

  useEffect(()=>{
    localStorage.setItem('smartschool_reg_step', step.toString());
  },[step]);

  const clearDraft = () => {
    localStorage.removeItem('smartschool_reg_draft');
    localStorage.removeItem('smartschool_reg_step');
    setForm(initial);
    setStep(0);
    toast.success('Registration draft cleared.');
  }

  const next=()=>{
    if(step===0&&(!form.schoolName||!form.email||!form.phone)) return toast.error('Please add the school name, email and phone number.');
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
          school: { name: form.schoolName, email: form.email, phone: form.phone, address: form.address, school_level: form.level, subscription_plan: form.plan, mpesa_paybill: form.mpesaPaybill, mpesa_till: form.mpesaTill, bank_name: form.bankName, bank_account_name: form.bankAccountName, bank_account_number: form.bankAccountNumber },
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
      toast.success('School request submitted. Verify the administrator email if prompted. Your school portals open after platform approval.', {id});
      setStep(6)
    }catch(e){
      toast.error(e.message || 'Could not register the school. Check the details and try again.', {id});
    }finally{
      setSaving(false)
    }
  }

  const passwordStrength = getPasswordStrength(form.password);

  const fillDemoData = () => {
    const demoData = {
      schoolName: 'Greenfield Academy',
      email: 'info@greenfield.edu',
      phone: '+254 712 345678',
      address: '123 Education Ave, Nairobi',
      level: 'Primary school',
      mpesaPaybill: '123456',
      mpesaTill: '789012',
      bankName: 'Equity Bank',
      bankAccountName: 'Greenfield Academy',
      bankAccountNumber: '011000123456',
      adminName: 'Sarah Jenkins',
      adminEmail: 'admin@greenfield.edu',
      adminPhone: '+254 722 987654',
      password: 'SecurePassword123!',
      confirmPassword: 'SecurePassword123!',
      plan: 'Professional'
    };
    setForm(demoData);
    persistDraft(demoData);
    toast.success('Demo school data loaded!');
  }

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
          <button type="button" onClick={fillDemoData} style={{ fontSize: '0.8rem', padding: '8px 14px', background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--green)' }}>
            Auto-fill demo data
          </button>
        </div>
      </div>
      <Field label="School name" value={form.schoolName} onChange={v=>update('schoolName',v)} placeholder="e.g. Springfield High School"/>
      <Field label="School email" type="email" value={form.email} onChange={v=>update('email',v)} placeholder="info@springfield.edu"/>
      <Field label="Phone number" value={form.phone} onChange={v=>update('phone',v)} placeholder="+254 700 000000"/>
      <Field label="Address / Location" value={form.address} onChange={v=>update('address',v)} placeholder="City, Street, Region"/>
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
      <p className="form-help">Optional: Enable seamless fee payments via M-Pesa and bank transfer.</p>
      <Field label="M-Pesa Paybill (Optional)" value={form.mpesaPaybill} onChange={v=>update('mpesaPaybill',v)} placeholder="e.g. 123456"/>
      <Field label="M-Pesa Till Number (Optional)" value={form.mpesaTill} onChange={v=>update('mpesaTill',v)} placeholder="e.g. 789012"/>
      <Field label="Bank Name" value={form.bankName} onChange={v=>update('bankName',v)} placeholder="e.g. Equity Bank / KCB"/>
      <Field label="Bank Account Number" value={form.bankAccountNumber} onChange={v=>update('bankAccountNumber',v)} placeholder="e.g. 011000123456"/>
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
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: form.plan === plan ? 'var(--green)' : 'var(--muted)' }}>{plan === 'Starter' ? 'Free / Core' : plan === 'Professional' ? 'Most Popular' : 'Advanced'}</span>
            </div>
            <small style={{ color: 'var(--muted)', display: 'block', lineHeight: 1.4 }}>
              {plan==='Starter'?'Core attendance, gradebook, and student profiles for small schools.':plan==='Professional'?'More insight, automated fee collection, and parent portal features.':'Full school operations, custom geofence tracking, and priority support.'}
            </small>
          </button>
        ))}
      </div>
    </>,
    <div className="confirmation" style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ width: '70px', height: '70px', background: 'var(--green)', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, margin: '0 auto 20px', boxShadow: '0 10px 25px rgba(28, 182, 129, 0.3)' }}>OK</div>
      <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>School request submitted</h2>
      <p style={{ color: 'var(--muted)', maxWidth: '400px', margin: '0 auto 25px' }}>Your school and plan request are waiting for SmartSchool platform review. The school administrator can use the portal after approval. Online payment checkout is not connected yet.</p>

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
    <div className="register" style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1.2fr' }}>
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
            <p className="step-indicator" style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem', color: 'var(--green)', letterSpacing: '1px' }}>STEP {step + 1} OF 6</p>
            <button type="button" className="button outline-button small" onClick={()=>setShowVideoGuide(!showVideoGuide)} style={{ padding: '6px 14px', fontSize: '0.8rem', background: 'var(--cream)', borderRadius: '8px', border: '1px solid var(--line)', cursor: 'pointer', fontWeight: 600 }}>
              {showVideoGuide ? 'Hide video guide' : 'Watch setup guide'}
            </button>
          </div>
          {showVideoGuide && <div style={{ marginBottom: '20px' }}><VideoGuide /></div>}
          <div className="progress-bar-wrapper" style={{ height: '6px', background: 'var(--line)', borderRadius: '3px', marginBottom: '30px', overflow: 'hidden' }}>
            <div className="progress" style={{ height: '100%', background: 'var(--green)', width: `${(step / 6) * 100}%`, transition: 'width 0.3s' }} />
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
              Configuring your M-Pesa Paybill, Till number, or bank accounts allows parents to pay school fees directly through the SmartSchool mobile and web parent portal. All transactions reconcile automatically with the finance module. You can also skip this and configure it later in School Settings.
            </p>
            <button type="button" onClick={()=>setShowHelpModal(false)} className="button blue-button full" style={{ borderRadius: '12px', padding: '12px' }}>Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({label,type='text',value,onChange,placeholder}){return <label style={{ display: 'grid', gap: '6px', fontWeight: 600, fontSize: '0.9rem', marginBottom: '16px' }}>{label}<input type={type} value={value} onChange={event=>onChange(event.target.value)} placeholder={placeholder} style={{ borderRadius: '12px', padding: '14px 16px' }} required/></label>}
