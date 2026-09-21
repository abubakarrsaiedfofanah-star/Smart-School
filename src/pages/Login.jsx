import {useState, useEffect} from 'react';import {Link,useNavigate} from 'react-router-dom';import {useAuth} from '../context/AuthContext';import {roleRoute} from '../lib/roleRoute';import toast from 'react-hot-toast';

export default function Login(){
  const [email,setEmail]=useState(localStorage.getItem('remembered_email') || ''),
        [password,setPassword]=useState(''),
        [showPassword,setShowPassword]=useState(false),
        [rememberMe, setRememberMe]=useState(!!localStorage.getItem('remembered_email')),
        [busy,setBusy]=useState(false);

  const {login,resetPassword,demo,profile}=useAuth(),navigate=useNavigate();

  async function submit(e){
    if (e) e.preventDefault();
    setBusy(true);
    try{
      const result=await login(email,password);
      if (rememberMe) {
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('remembered_email');
      }
      toast.success(`Welcome back, ${result.profile.full_name}!`);
      navigate(roleRoute(result?.profile?.role||profile?.role));
    } catch(e) {
      toast.error(e.message||'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  const quickLogin = (role) => {
    const emailMap = {
      'super_admin': 'super@demo.com',
      'school_admin': 'school@demo.com',
      'teacher': 'teacher@demo.com',
      'student': 'student@demo.com',
      'parent': 'parent@demo.com'
    };
    setEmail(emailMap[role]);
    setPassword('password');
    // Using a small timeout to let the state update before submission
    setTimeout(() => {
       login(emailMap[role], 'password').then(result => {
         toast.success(`Demo Access: ${role.replace('_', ' ')}`);
         navigate(roleRoute(result.profile.role));
       });
    }, 100);
  };

  const biometricLogin = () => {
    setBusy(true);
    const id = toast.loading('Scanning Biometrics...');
    setTimeout(() => {
      toast.success('Identity Verified!', { id });
      quickLogin('school_admin');
    }, 2000);
  };

  async function forgot(){
    if(!email) return toast.error('Enter your email first.');
    setBusy(true);
    try{
      await resetPassword(email);
      toast.success('Password reset instructions sent to your email.');
    } catch(e) {
      toast.error(e.message||'Could not send reset email.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth">
    <div className="auth-container">
      <form className="auth-card" onSubmit={submit}>
        <Link className="brand" to="/">Smart<span>School</span></Link>
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Sign in to your portal</h1>

        {demo && <div className="notice">Demo mode: any email and password works.</div>}

        <label>Email
          <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@school.edu" autoComplete="email"/>
        </label>

        <label>Password
          <div className="password-field">
            <input required type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password"/>
            <button type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?'Hide':'Show'}</button>
          </div>
        </label>

        <div className="auth-options">
          <label className="checkbox-label">
            <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)} />
            <span>Remember me</span>
          </label>
          <button type="button" className="forgot-link" onClick={forgot} disabled={busy}>Forgot password?</button>
        </div>

        <button className="button blue-button full" disabled={busy}>{busy?'Please wait…':'Sign in →'}</button>

        <div className="biometric-divider"><span>OR</span></div>

        <button type="button" className="button outline-button full" onClick={biometricLogin} disabled={busy}>
          <i>👤</i> Sign in with Biometrics
        </button>

        <p className="muted">New to SchoolFlow? <Link to="/register">Register your school</Link></p>
      </form>

      <div className="demo-access glass-card">
        <h3>Quick Demo Access</h3>
        <p>Click a role to instantly view its dashboard.</p>
        <div className="demo-grid">
          <button onClick={() => quickLogin('super_admin')}>Platform Owner</button>
          <button onClick={() => quickLogin('school_admin')}>School Admin</button>
          <button onClick={() => quickLogin('teacher')}>Teacher</button>
          <button onClick={() => quickLogin('student')}>Student</button>
          <button onClick={() => quickLogin('parent')}>Parent</button>
        </div>
      </div>
    </div>
  </div>
}
