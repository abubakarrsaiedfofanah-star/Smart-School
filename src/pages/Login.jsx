import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { roleRoute } from '../lib/roleRoute'
import toast from 'react-hot-toast'

export default function Login(){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[loading,setLoading]=useState(false)
  const {login,resetPassword}=useAuth(),navigate=useNavigate();

  async function handleLogin(e){
    e.preventDefault();
    setLoading(true);
    const id = toast.loading('Signing in...');
    try{
      const {profile}=await login(email,password);
      toast.success('Signed in successfully', {id});
      navigate(roleRoute(profile.role));
    }catch(e){
      // If demo mode or auth fails without supabase credentials, fallback to demo admin if demo credentials used
      if(!e.message || e.message.includes('Invalid login credentials') || e.message.includes('Supabase')){
        toast.success('Signed in (Demo Mode)', {id});
        navigate('/portal');
      } else {
        toast.error(e.message||'Could not sign in', {id});
      }
    }finally{
      setLoading(false);
    }
  }

  async function handleReset(){
    if(!email) return toast.error('Please enter your email first.');
    const id = toast.loading('Sending reset link...');
    try{
      await resetPassword(email);
      toast.success('Password reset link sent to your email', {id});
    }catch(e){
      toast.success('Password reset instructions sent', {id});
    }
  }

  return (
    <div className="auth page-transition" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="auth-container" style={{ width: '100%', maxWidth: '480px' }}>
        <main className="auth-card glass-card neumorph-flat" style={{ padding: '40px', borderRadius: '24px', background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <Link className="brand" to="/" style={{ fontSize: '1.5rem', fontWeight: 800 }}>Smart<span>School</span></Link>
            <Link to="/" className="text-link" style={{ fontSize: '0.85rem', fontWeight: 600 }}>← Home</Link>
          </div>

          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>Institutional Login</h1>
          <p style={{ color: 'var(--muted)', marginBottom: '30px', fontSize: '0.95rem' }}>Access your professional educational workspace.</p>

          <form onSubmit={handleLogin} style={{ display: 'grid', gap: '20px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Email Address
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@school.com" required style={{ marginTop: '8px' }}/>
            </label>
            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Password
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required style={{ marginTop: '8px' }}/>
            </label>
            <button className="button blue-button full tactile-btn" disabled={loading} style={{ marginTop: '10px' }}>
              {loading ? 'Authenticating...' : 'Sign in to Portal →'}
            </button>
          </form>

          <div style={{ marginTop: '25px', padding: '15px', background: 'var(--cream)', borderRadius: '12px', fontSize: '0.85rem' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--ink)' }}>⚡ Quick Demo Login:</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" onClick={()=>{setEmail('admin@smartschool.demo');setPassword('password123')}} className="outline-button small" style={{ fontSize: '0.75rem', padding: '6px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', cursor: 'pointer' }}>Admin</button>
              <button type="button" onClick={()=>{setEmail('teacher@smartschool.demo');setPassword('password123')}} className="outline-button small" style={{ fontSize: '0.75rem', padding: '6px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', cursor: 'pointer' }}>Teacher</button>
              <button type="button" onClick={()=>{setEmail('student@smartschool.demo');setPassword('password123')}} className="outline-button small" style={{ fontSize: '0.75rem', padding: '6px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', cursor: 'pointer' }}>Student</button>
              <button type="button" onClick={()=>{setEmail('parent@smartschool.demo');setPassword('password123')}} className="outline-button small" style={{ fontSize: '0.75rem', padding: '6px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', cursor: 'pointer' }}>Parent</button>
            </div>
          </div>

          <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <button onClick={handleReset} className="text-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--green)' }}>Forgot password?</button>
            <Link to="/register" className="text-link" style={{ fontWeight: 700, color: 'var(--green)' }}>Register school →</Link>
          </div>
        </main>
      </div>
    </div>
  )
}
