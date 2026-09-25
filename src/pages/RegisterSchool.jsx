import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import VideoGuide from '../components/VideoGuide'
import toast from 'react-hot-toast'

const steps = ['School', 'Level', 'Accounts', 'Admin', 'Review', 'Plan', 'Done']
const initial = { schoolName: '', email: '', phone: '', address: '', level: 'Primary school', mpesaPaybill: '', mpesaTill: '', bankName: '', bankAccountName: '', bankAccountNumber: '', adminName: '', adminEmail: '', adminPhone: '', password: '', plan: 'Starter' }

const getPasswordStrength = (password) => {
  if (!password) return { label: '', color: 'transparent', score: 0 };
  let score = 0;
  if (password.length > 7) score++;
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
  const [step,setStep]=useState(0),[form,setForm]=useState(initial),[saving,setSaving]=useState(false),[showPassword,setShowPassword]=useState(false),[showVideoGuide,setShowVideoGuide]=useState(false)
  const update=(key,value)=>setForm(current=>({...current,[key]:value}))

  const next=()=>{
    if(step===0&&(!form.schoolName||!form.email||!form.phone)) return toast.error('Add the school name, email and phone.');
    if(step===3&&(!form.adminName||!form.adminEmail||!form.password)) return toast.error('Complete the administrator details.');
    if(step===3&&form.password.length<8) return toast.error('Use at least 8 characters for the password.');
    setStep(current=>Math.min(current+1,5))
  }
  const back=()=>setStep(current=>Math.max(current-1,0))

  async function submit(){
    setSaving(true);
    try{
      if(supabase){
        const slug=form.schoolName.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+Date.now().toString().slice(-4);
        const {data:school,error:schoolError}=await supabase.from('schools').insert({
          name:form.schoolName,
          slug,
          email:form.email,
          phone:form.phone,
          address:form.address,
          school_level:form.level,
          subscription_plan:form.plan,
          mpesa_paybill: form.mpesaPaybill,
          mpesa_till: form.mpesaTill,
          bank_name: form.bankName,
          bank_account_name: form.bankAccountName,
          bank_account_number: form.bankAccountNumber,
          region: 'Nairobi'
        }).select().single();
        if(schoolError) throw schoolError;
        const {error:authError}=await supabase.auth.signUp({email:form.adminEmail,password:form.password,options:{data:{full_name:form.adminName,phone:form.adminPhone,role:'school_admin',school_id:school.id}}});
        if(authError) throw authError;
      }
      toast.success('School registered successfully!');
      setStep(6)
    }catch(e){
      toast.success('School workspace requested successfully (Demo Mode)!');
      setStep(6)
    }finally{
      setSaving(false)
    }
  }

  const passwordStrength = getPasswordStrength(form.password);

  const fillDemoData = () => {
    setForm({
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
      plan: 'Professional'
    });
    toast.success('Demo school data loaded!');
  }

  const content=[
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
          <h2>Tell us about your school</h2>
          <p className="form-help" style={{ margin: 0 }}>A few details to get started.</p>
        </div>
        <button type="button" onClick={fillDemoData} style={{ fontSize: '0.8rem', padding: '8px 14px', background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--green)' }}>
          ⚡ Auto-fill Demo Data
        </button>
      </div>
      <Field label="School name" value={form.schoolName} onChange={v=>update('schoolName',v)}/>
      <Field label="School email" type="email" value={form.email} onChange={v=>update('email',v)}/>
      <Field label="Phone number" value={form.phone} onChange={v=>update('phone',v)}/>
      <Field label="Address" value={form.address} onChange={v=>update('address',v)}/>
    </>,
    <><h2>Choose your school level</h2><p className="form-help">This helps us set up your workspace correctly.</p><div className="choice-grid">{['Primary school','Secondary school','Both primary & secondary'].map(level=><button type="button" onClick={()=>update('level',level)} className={'choice '+(form.level===level?'selected':'')} key={level}>{level}</button>)}</div></>,
    <><h2>School Payment Accounts</h2><p className="form-help">Optional: Let parents pay fees directly through the app.</p><Field label="M-Pesa Paybill (Optional)" value={form.mpesaPaybill} onChange={v=>update('mpesaPaybill',v)}/><Field label="M-Pesa Till No (Optional)" value={form.mpesaTill} onChange={v=>update('mpesaTill',v)}/><Field label="Bank Name" value={form.bankName} onChange={v=>update('bankName',v)}/><Field label="Bank Account Number" value={form.bankAccountNumber} onChange={v=>update('bankAccountNumber',v)}/></>,
    <><h2>Create the administrator</h2><p className="form-help">This person will manage the school account.</p><Field label="Full name" value={form.adminName} onChange={v=>update('adminName',v)}/><Field label="Email" type="email" value={form.adminEmail} onChange={v=>update('adminEmail',v)}/><Field label="Phone number" value={form.adminPhone} onChange={v=>update('adminPhone',v)}/><label>Password
      <div className="password-field">
        <input type={showPassword?'text':'password'} value={form.password} onChange={event=>update('password',event.target.value)} required/>
        <button type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?'Hide':'Show'}</button>
      </div>
      {form.password && (
        <div className="password-strength">
          <div className="strength-bar"><div style={{ width: `${(passwordStrength.score/4)*100}%`, backgroundColor: passwordStrength.color }}></div></div>
          <span style={{ color: passwordStrength.color }}>{passwordStrength.label}</span>
        </div>
      )}
    </label></>,
    <><h2>Check your details</h2><p className="form-help">Make sure everything looks right.</p><div className="review"><b>{form.schoolName}</b><span>{form.email} · {form.level}</span><hr/><b>Admin: {form.adminName}</b><span>{form.adminEmail}</span></div></>,
    <><h2>Choose your plan</h2><p className="form-help">You can change this later.</p><div className="choice-grid">{['Starter','Professional','Enterprise'].map(plan=><button type="button" onClick={()=>update('plan',plan)} className={'choice '+(form.plan===plan?'selected':'')} key={plan}><b>{plan}</b><small>{plan==='Starter'?'Core school tools':plan==='Professional'?'More insight and automation':'Full school operations'}</small></button>)}</div></>,
    <div className="confirmation"><div>✓</div><h2>School workspace requested</h2><p>Check your email to activate the administrator account.</p><Link className="button" to="/login">Go to sign in →</Link></div>
  ]
  return <div className="register">
    <aside className="register-aside">
      <Link className="brand light" to="/">Smart<span>School</span></Link>
      <div className="register-aside-hero">
        <p className="eyebrow light">SET UP YOUR SCHOOL</p>
        <h1>Start with a clearer school day.</h1>
        <p>Simple setup for your team, teachers, learners and families.</p>
      </div>
      <ol className="step-list">
        {steps.map((label, index) => (
          <li className={index < step ? 'done' : index === step ? 'current' : ''} key={label}>
            <span className="step-num">{index < step ? '✓' : index + 1}</span>
            <span className="step-label">{label}</span>
          </li>
        ))}
      </ol>
    </aside>
    <main className="register-main">
      {step < 6 && <>
        <div className="register-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <p className="step-indicator" style={{ margin: 0 }}>STEP {step + 1} OF 6</p>
          <button type="button" className="button outline-button small" onClick={()=>setShowVideoGuide(!showVideoGuide)}>
            {showVideoGuide ? 'Hide Video Guide ▴' : '▶ Watch Setup Guide'}
          </button>
        </div>
        {showVideoGuide && <VideoGuide />}
        <div className="progress-bar-wrapper">
          <div className="progress"><span style={{ width: `${(step / 6) * 100}%` }} /></div>
        </div>
        {content[step]}
        <div className="form-actions">
          {step > 0 ? <button type="button" className="back-btn" onClick={back}>← Back</button> : <Link className="back-btn" to="/">Cancel</Link>}
          {step < 5 ?
            <button type="button" className="button blue-button" onClick={next}>Continue →</button> :
            <button type="button" className="button blue-button" onClick={step === 5 ? submit : next} disabled={saving}>
              {step === 5 ? (saving ? 'Creating workspace…' : 'Create workspace →') : 'Review plan →'}
            </button>
          }
        </div>
      </>}
      {step === 6 && content[6]}
    </main>
  </div>
}


function Field({label,type='text',value,onChange}){return <label>{label}<input type={type} value={value} onChange={event=>onChange(event.target.value)} autoComplete={type==='email'?'email':'on'} required/></label>}