import { useState, useEffect } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { roleRoute } from '../lib/roleRoute'
import { hasSchoolPermission } from '../lib/schoolRoles'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function Login(){
  const [email,setEmail]=useState(() => localStorage.getItem('smartschool_remembered_email') || '')
  const [password,setPassword]=useState('')
  const [remember,setRemember]=useState(() => Boolean(localStorage.getItem('smartschool_remembered_email')))
  const [showPassword,setShowPassword]=useState(false)
  const [loading,setLoading]=useState(false)
  const [googleLoading,setGoogleLoading]=useState(false)
  const [showForgotModal,setShowForgotModal]=useState(false)
  const [forgotEmail,setForgotEmail]=useState('')
  const [forgotLoading,setForgotLoading]=useState(false)
  const [searchParams] = useSearchParams()
  const selectedSchoolSlug = searchParams.get('school') || ''
  const [selectedSchool,setSelectedSchool]=useState(null)
  const [schoolLookup,setSchoolLookup]=useState(() => searchParams.get('school') ? 'loading' : 'idle')

  const {login,resetPassword,logout,session,profile,staffRoles,loading:authLoading}=useAuth(),navigate=useNavigate(),{portalRole}=useParams();
  const roleLabels={super_admin:'Super Admin',school_admin:'School Admin',teacher:'Teacher',staff:'Staff',student:'Student',parent:'Parent',hr:'HR & Payroll',finance:'Finance'};
  const requestedRole=roleLabels[portalRole] ? portalRole : null;
  const specialistPermission = requestedRole === 'hr' ? 'school.hr.portal.view' : requestedRole === 'finance' ? 'school.finance.portal.view' : null;
  const sessionMatchesRequestedRole = !requestedRole || (specialistPermission
    ? profile?.role === 'staff' && hasSchoolPermission(profile?.role, staffRoles, specialistPermission)
    : requestedRole === profile?.role);
  const portalDestination = (account, assignedRoles) => {
    if (!specialistPermission || !hasSchoolPermission(account?.role, assignedRoles, specialistPermission)) return roleRoute(account?.role);
    return requestedRole === 'hr' ? '/hr-payroll' : '/finance-operations';
  };

  useEffect(() => {
    if (!selectedSchoolSlug) { setSelectedSchool(null); setSchoolLookup('idle'); return undefined }
    if (!supabase) { setSchoolLookup('error'); return undefined }
    let active = true
    setSchoolLookup('loading')
    supabase.rpc('get_public_school_login_directory').then(({ data, error }) => {
      if (error) throw error
      const school = (data || []).find(item => item.slug === selectedSchoolSlug)
      if (!school) throw new Error('This school is not available in the directory.')
      if (active) { setSelectedSchool(school); setSchoolLookup('ready') }
    }).catch(error => {
      if (active) { setSelectedSchool(null); setSchoolLookup('error'); toast.error(error.message || 'Could not confirm the selected school.') }
    })
    return () => { active = false }
  }, [selectedSchoolSlug])

  useEffect(() => {
    if (remember && email) {
      localStorage.setItem('smartschool_remembered_email', email);
    } else if (!remember) {
      localStorage.removeItem('smartschool_remembered_email');
    }
  }, [remember, email]);

  useEffect(() => {
    if (!showForgotModal) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => { if (event.key === 'Escape') setShowForgotModal(false) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [showForgotModal])
  async function handleLogin(e){
    e.preventDefault();
    setLoading(true);
    const id = toast.loading('Signing in to SmartSchool...');
    try{
      const {profile,staffRoles:assignedRoles}=await login(email,password);
      if (selectedSchoolSlug && profile.role !== 'super_admin' && profile.school_id !== selectedSchool?.id) {
        await logout()
        throw new Error(`This account is not linked to ${selectedSchool?.name || 'the selected school'}. Choose the school connected to your account.`)
      }
      if (profile.is_active === false) {
        toast.success(profile.billing_suspended_at ? 'School access is paused until billing is restored.' : 'Your registration is waiting for school administrator approval.', { id });
        navigate(profile.role === 'school_admin' && profile.billing_suspended_at ? '/subscription' : roleRoute(profile.role));
        return;
      }
      if (specialistPermission && (profile.role !== 'staff' || !hasSchoolPermission(profile.role, assignedRoles, specialistPermission))) {
        toast.error(`This account has not been assigned the ${roleLabels[requestedRole]} portal. Ask your school administrator to grant access.`, { id });
        navigate(roleRoute(profile.role), { replace: true });
        return;
      }
      if(requestedRole&&!specialistPermission&&profile.role!==requestedRole) toast('This account belongs to the '+(roleLabels[profile.role]||'assigned')+' portal. Opening that portal instead.',{id});
      else toast.success('Signed in successfully!', {id});
      navigate(portalDestination(profile, assignedRoles));
    }catch(e){
      toast.error(e.message||'Could not sign in. Please check your credentials.', {id});
    }finally{
      setLoading(false);
    }
  }

  async function handleGoogleSignIn(){
    if(!supabase) return toast.error('Google sign-in is unavailable until the school backend is connected.')
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${portalRole ? `/login/${encodeURIComponent(portalRole)}` : '/login'}${selectedSchoolSlug ? `?school=${encodeURIComponent(selectedSchoolSlug)}` : ''}` }
    })
    if(error){
      setGoogleLoading(false)
      toast.error(error.message || 'Could not start Google sign-in.')
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

  if(authLoading || (selectedSchoolSlug && schoolLookup === 'loading')) return <div className="portal-loading"><div className="spinner"/><p>Checking your school account...</p></div>;
  if(!selectedSchoolSlug&&!session&&!requestedRole) return <Navigate to="/portals" replace/>;
  if(selectedSchoolSlug && schoolLookup === 'error') return <main className="portal-loading"><section><p className="eyebrow">SCHOOL NOT AVAILABLE</p><h1>Choose an active school</h1><p>The selected school could not be confirmed. Return to the school directory and choose an active school.</p><Link className="button blue-button" to="/portals">Choose a school</Link></section></main>;
  if(session&&profile&&selectedSchoolSlug&&profile.role!=='super_admin'&&!profile.school_id) return <main className="portal-loading"><section><p className="eyebrow">SCHOOL REGISTRATION</p><h1>Complete your school request</h1><p>This Google account is not linked to a school yet. Choose a portal and submit a registration request to {selectedSchool?.name}; access will stay locked until its administrator approves it.</p><Link className="button blue-button" to={`/join-school/${encodeURIComponent(selectedSchool.slug)}`}>Register with {selectedSchool?.name}</Link><button className="outline-button" type="button" onClick={() => void logout()}>Sign out</button></section></main>;
  if(session&&profile&&selectedSchoolSlug&&profile.role!=='super_admin'&&profile.school_id!==selectedSchool?.id) return <main className="portal-loading"><section><p className="eyebrow">SCHOOL ACCOUNT</p><h1>This account belongs to another school</h1><p>Sign out, then choose the school linked to your account to continue.</p><button className="button blue-button" type="button" onClick={() => void logout()}>Sign out and choose a school</button><Link className="outline-button" to="/portals">Choose a school</Link></section></main>;
  if(session&&profile&&profile.role==='school_admin'&&profile.billing_suspended_at) return <Navigate to="/subscription" replace/>;
  if(session&&profile&&sessionMatchesRequestedRole) return <Navigate to={portalDestination(profile, staffRoles)} replace/>;
  if(session&&profile) return <main className="portal-loading"><section><p className="eyebrow">PORTAL ACCESS</p><h1>You are signed in to a different portal</h1><p>This account is assigned to the {roleLabels[profile.role] || 'current'} portal. To open {roleLabels[requestedRole] || 'the selected'} portal, sign out and sign in with an account that has that role.</p><button className="button blue-button" type="button" onClick={() => void logout()}>Sign out and switch account</button><Link className="outline-button" to={roleRoute(profile.role)}>Return to your portal</Link></section></main>;
  if(session&&!profile) return <main className="portal-loading"><section><p className="eyebrow">ACCOUNT NOT READY</p><h1>No school account is linked</h1><p>This Google account has no approved SmartSchool profile. Ask your school administrator to create or approve your account, then try again.</p><button className="button blue-button" type="button" onClick={() => void logout()}>Sign out</button></section></main>;

  return (
    <div className="auth page-transition login-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'radial-gradient(circle at 50% 20%, rgba(35, 117, 225, 0.12) 0%, transparent 60%)' }}>
      <div className="auth-container login-container" style={{ width: '100%', maxWidth: '500px' }}>
        <aside className="login-aside">
          <Link className="brand login-platform-logo" to="/" aria-label="SmartSchool home"><img src="/smartschool-logo.svg" alt="SmartSchool — Learn, Grow, Succeed" /></Link>
          <p className="eyebrow">ONE SCHOOL. ONE WORKSPACE.</p>
          <h2>Make room for better learning.</h2>
          <p className="login-aside-copy">A calmer place to manage classes, follow progress, and keep your school community connected.</p>
          <div className="login-aside-points"><span><b>01</b> Tools matched to your role</span><span><b>02</b> Your school’s work in one place</span><span><b>03</b> Secure access for every account</span></div>
          <div className="login-aside-footer"><span>Setting up a school?</span><Link to="/register">Create your school workspace <b aria-hidden="true">→</b></Link></div>
        </aside>
        <main className="auth-card login-card glass-card neumorph-flat" style={{ padding: '40px', borderRadius: '28px', background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <span className="login-card-brand">SmartSchool account</span>
            <Link to="/" className="text-link" style={{ fontSize: '0.85rem', fontWeight: 600, padding: '6px 12px', background: 'var(--cream)', borderRadius: '8px' }}>← Back to Home</Link>
          </div>

          <div className="login-heading" style={{ marginBottom: '25px' }}>
            <span className="eyebrow" style={{ display: 'inline-block', marginBottom: '8px' }}>{requestedRole ? roleLabels[requestedRole].toUpperCase()+' PORTAL' : 'SECURE SCHOOL PORTAL'}</span>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.5px' }}>{selectedSchool ? `Login to ${selectedSchool.name}` : requestedRole ? roleLabels[requestedRole]+' sign in' : 'Welcome Back'}</h1>
            <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.95rem' }}>{selectedSchool ? `Sign in with an account registered with ${selectedSchool.name}. You will open only the portal assigned to your account.` : 'Sign in with the account your school issued. Your school and portal access are determined by that account.'}</p>
            {!supabase && <p role="status" style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: '10px', background: '#fff7ed', color: '#9a3412', fontSize: '.82rem' }}>Sign-in is unavailable until the school backend is connected.</p>}
          </div>

          <button type="button" className="outline-button full" onClick={handleGoogleSignIn} disabled={googleLoading || !supabase} style={{ width: '100%', borderRadius: '14px', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontWeight: 700 }}>
            <GoogleMark />{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
          </button>
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0', color: 'var(--muted)', fontSize: '.8rem' }}><span style={{ height: '1px', background: 'var(--line)', flex: 1 }} />or sign in with email<span style={{ height: '1px', background: 'var(--line)', flex: 1 }} /></div>

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
                style={{ boxSizing: 'border-box', width: '100%', borderRadius: '12px', padding: '14px 16px', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', outlineColor: 'var(--green)' }}
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
                  style={{ boxSizing: 'border-box', border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', outlineColor: 'var(--green)', borderRadius: '12px', padding: '14px 16px', width: '100%', paddingRight: '70px' }}
                />
                <button
                  type="button"
                  onClick={()=>setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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

          {selectedSchool && <div style={{ marginTop: '25px', textAlign: 'center', fontSize: '0.9rem', borderTop: '1px solid var(--line)', paddingTop: '20px' }}><span style={{ color: 'var(--muted)' }}>Need an account at this school? </span><Link to={`/join-school/${encodeURIComponent(selectedSchool.slug)}`} className="text-link" style={{ fontWeight: 700, color: 'var(--green)' }}>Register with this school</Link></div>}
          {!selectedSchool && <div style={{ marginTop: '25px', textAlign: 'center', fontSize: '0.9rem', borderTop: '1px solid var(--line)', paddingTop: '20px' }}>
            <span style={{ color: 'var(--muted)' }}>New educational institution? </span>
            <Link to="/register" className="text-link" style={{ fontWeight: 700, color: 'var(--green)' }}>Register your school →</Link>
          </div>}
        </main>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" role="dialog" aria-modal="true" aria-labelledby="reset-password-title" style={{ width: '100%', maxWidth: '420px', background: 'var(--panel)', borderRadius: '24px', padding: '30px', boxShadow: 'var(--shadow)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 id="reset-password-title" style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Reset password</h3>
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

function GoogleMark(){return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="#4A90E2" d="M12.8 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 18Z"/><path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6.1 29.5 4 24 4A20 20 0 0 0 5.9 15l6.9 5.2c1.6-4.7 6-8.1 11.2-8.1Z"/></svg>}

