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
      toast.error(e.message||'Could not sign in', {id});
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
      toast.error(e.message||'Could not send reset link', {id});
    }
  }

  return (
    <div className="auth page-transition">
      <div className="auth-container" style={{ gridTemplateColumns: '1fr', maxWidth: '500px' }}>
        <main className="auth-card glass-card neumorph-flat">
          <Link className="brand" to="/" style={{display:'block', marginBottom:'30px'}}>Smart<span>School</span></Link>
          <h1>Institutional Login</h1>
          <p style={{color:'var(--muted)', marginBottom:'30px'}}>Access your professional educational workspace.</p>

          <form onSubmit={handleLogin} style={{display:'grid', gap:'20px'}}>
            <label>Email Address
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@school.com" required/>
            </label>
            <label>Password
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/>
            </label>
            <button className="button blue-button full tactile-btn" disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign in to Portal →'}
            </button>
          </form>

          <div style={{marginTop:'30px', display:'flex', justifyContent:'space-between', fontSize:'0.9rem'}}>
            <button onClick={handleReset} className="text-link" style={{background:'none', border:'none', padding:0, cursor:'pointer'}}>Forgot password?</button>
            <Link to="/register" className="text-link" style={{fontWeight:700}}>Register school</Link>
          </div>
        </main>
      </div>
    </div>
  )
}
