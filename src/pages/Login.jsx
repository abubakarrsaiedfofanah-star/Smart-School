import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { roleRoute } from '../lib/roleRoute'
import toast from 'react-hot-toast'

export default function Login(){
  const [email,setEmail]=useState(() => localStorage.getItem('smartschool_remembered_email') || '')
  const [password,setPassword]=useState('')
  const [remember,setRemember]=useState(() => Boolean(localStorage.getItem('smartschool_remembered_email')))
  const [showPassword,setShowPassword]=useState(false)
  const [loading,setLoading]=useState(false)
  const [showForgotModal,setShowForgotModal]=useState(false)
  const [forgotEmail,setForgotEmail]=useState('')
  const [forgotLoading,setForgotLoading]=useState(false)

  const {login,loginDemo,resetPassword,session,profile,loading:authLoading}=useAuth(),navigate=useNavigate(),{portalRole}=useParams();
  const roleLabels={school_admin:'School Admin',teacher:'Teacher',student:'Student',parent:'Parent',super_admin:'Platform Admin'};
  const requestedRole=roleLabels[portalRole] ? portalRole : null;

  useEffect(() => {
    if (remember && email) {
      localStorage.setItem('smartschool_remembered_email', email);
    } else if (!remember) {
      localStorage.removeItem('smartschool_remembered_email');
    }
  }, [remember, email]);

  async function handleLogin(e){
    e.preventDefault();
    setLoading(true);
    const id = toast.loading('Signing in to SmartSchool...');
    try{
      const {profile}=await login(email,password);
      if(requestedRole&&profile.role!==requestedRole) toast('This account belongs to the '+(roleLabels[profile.role]||'assigned')+' portal. Opening that portal instead.',{id});
      else toast.success('Signed in successfully!', {id});
      navigate(roleRoute(profile.role));
    }catch(e){
      toast.error(e.message||'Could not sign in. Please check your credentials.', {id});
    }finally{
      setLoading(false);
    }
  }

  async function handleReset(e){
    e.preventDefault();
    if(!forgotEmail) return toast.error('Please enter your email address.');
    setForgotLoading(true);
    const id = toast.loading('Sending password reset instructions...');
    try{
      await resetPassword(forgotEmail);
      toast.success('Password reset link sent to your email!', {id});
      setShowForgotModal(false);
      setForgotEmail('');
    }catch(e){
      toast.error(e.message||'Could not send password reset instructions.', {id});
    }finally{
      setForgotLoading(false);
    }
  }

  function openDemo(role){
    loginDemo(role)
    navigate(roleRoute(role), { replace: true })
  }

  function openHrDemo(){
    loginDemo('school_admin')
    navigate('/hr-payroll', { replace: true })
  }

  if(authLoading) return <div className="portal-loading"><div className="spinner"/><p>Loading your account...</p></div>;
  if(session&&profile) return <Navigate to={roleRoute(profile.role)} replace/>;

  return (
    <div className="auth page-transition" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'radial-gradient(circle at 50% 20%, rgba(35, 117, 225, 0.12) 0%, transparent 60%)' }}>
      <div className="auth-container" style={{ width: '100%', maxWidth: '500px' }}>
        <main className="auth-card glass-card neumorph-flat" style={{ padding: '40px', borderRadius: '28px', background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <Link className="brand" to="/" style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Smart<span>School</span></Link>
            <Link to="/" className="text-link" style={{ fontSize: '0.85rem', fontWeight: 600, padding: '6px 12px', background: 'var(--cream)', borderRadius: '8px' }}>← Back to Home</Link>
          </div>

          <div style={{ marginBottom: '25px' }}>
            <span className="eyebrow" style={{ display: 'inline-block', marginBottom: '8px' }}>{requestedRole ? roleLabels[requestedRole].toUpperCase()+' PORTAL' : 'SECURE SCHOOL PORTAL'}</span>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.5px' }}>{requestedRole ? roleLabels[requestedRole]+' sign in' : 'Welcome Back'}</h1>
            <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.95rem' }}>Sign in with the account your school provided. You will open your own role portal.</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'grid', gap: '18px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'grid', gap: '6px' }}>
              Institutional Email
              <input
                type="email"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                placeholder="name@school.edu"
                required
                autoComplete="email"
                style={{ borderRadius: '12px', padding: '14px 16px' }}
              />
            </label>

            <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'grid', gap: '6px' }}>
              Password
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  style={{ borderRadius: '12px', padding: '14px 16px', width: '100%', paddingRight: '70px' }}
                />
                <button
                  type="button"
                  onClick={()=>setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', background: 'transparent', border: 'none', color: 'var(--muted)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', padding: '4px 8px' }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginTop: '2px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 500, color: 'var(--muted)' }}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e=>setRemember(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--green)', cursor: 'pointer', margin: 0 }}
                />
                Remember this device
              </label>
              <button type="button" onClick={()=>setShowForgotModal(true)} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--green)', fontWeight: 600 }}>
                Forgot password?
              </button>
            </div>

            <button className="button blue-button full tactile-btn" disabled={loading} style={{ marginTop: '8px', borderRadius: '14px', padding: '16px', fontSize: '1rem', fontWeight: 700 }}>
              {loading ? 'Authenticating Workspace...' : 'Sign in to Portal →'}
            </button>
          </form>

          <section className="demo-access login-demo-access" aria-labelledby="demo-access-title">
            <h3 id="demo-access-title">Explore with a demo account</h3>
            <p>Demo workspace uses sample data saved only in this browser session.</p>
            <div className="demo-grid">
              {Object.entries(roleLabels).map(([role,label])=><button type="button" key={role} onClick={()=>openDemo(role)}>{label}<span>Open demo →</span></button>)}
            </div>
            <button type="button" className="demo-hr-preview" onClick={openHrDemo}><span><b>HR & Payroll preview</b><small>View sample staff and payroll activity</small></span><strong>Open preview →</strong></button>
            <p className="demo-specialist-note"><b>HR, finance, admissions, and other staff portals</b> are specialist permissions managed by the school administrator. Use the preview above for sample HR activity, or ask your administrator to assign a staff portal to your account.</p>
          </section>

          <nav className="login-portals" aria-label="Choose a role portal"><span>Choose a portal</span><div>{[['school_admin','School Admin'],['teacher','Teacher'],['student','Student'],['parent','Parent']].map(([role,label])=><Link className={requestedRole===role?'active':''} to={'/login/'+role} key={role}>{label}</Link>)}</div></nav>
          <div style={{ marginTop: '25px', textAlign: 'center', fontSize: '0.9rem', borderTop: '1px solid var(--line)', paddingTop: '20px' }}>
            <span style={{ color: 'var(--muted)' }}>New educational institution? </span>
            <Link to="/register" className="text-link" style={{ fontWeight: 700, color: 'var(--green)' }}>Register your school →</Link>
          </div>
        </main>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '420px', background: 'var(--panel)', borderRadius: '24px', padding: '30px', boxShadow: 'var(--shadow)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Reset Password</h3>
              <button onClick={()=>setShowForgotModal(false)} style={{ background: 'var(--cream)', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '20px' }}>Enter your institutional email address and we'll send you a secure link to reset your password.</p>
            <form onSubmit={handleReset} style={{ display: 'grid', gap: '16px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'grid', gap: '6px' }}>
                Email Address
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={e=>setForgotEmail(e.target.value)}
                  placeholder="admin@school.edu"
                  required
                  style={{ borderRadius: '12px', padding: '14px 16px' }}
                />
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={()=>setShowForgotModal(false)} className="outline-button" style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'var(--cream)', border: '1px solid var(--line)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={forgotLoading} className="button blue-button" style={{ flex: 1, padding: '14px', borderRadius: '12px', justifyContent: 'center' }}>
                  {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

