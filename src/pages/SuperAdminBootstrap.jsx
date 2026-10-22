import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { roleRoute } from '../lib/roleRoute'

export default function SuperAdminBootstrap() {
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [availability, setAvailability] = useState('checking')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [accountCreated, setAccountCreated] = useState(false)

  useEffect(() => {
    if (authLoading || session) return undefined
    if (!supabase) {
      setAvailability('error')
      return undefined
    }
    let active = true
    void supabase.rpc('super_admin_bootstrap_available').then(({ data, error }) => {
      if (!active) return
      setAvailability(error ? 'error' : data === true ? 'available' : 'closed')
    }).catch(() => { if (active) setAvailability('error') })
    return () => { active = false }
  }, [authLoading, session])

  if (authLoading) return <main className="portal-loading" role="status"><div className="spinner" /><p>Checking account status…</p></main>
  if (session && profile?.role) return <Navigate to={roleRoute(profile.role)} replace />
  if (session && !profile) return <Navigate to="/login/super_admin" replace />

  const submit = async event => {
    event.preventDefault()
    setErrorMessage('')
    if (password !== confirmPassword) return setErrorMessage('The passwords do not match.')
    if (!supabase) return setErrorMessage('Super Admin setup is unavailable until the platform is connected.')
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('bootstrap-super-admin', {
      body: { full_name: fullName, email, password, bootstrap_token: bootstrapToken },
    })
    setBootstrapToken('')
    if (error || data?.error) {
      let message = data?.error || error?.message || 'Could not complete the first Super Admin setup.'
      if (error?.context && typeof error.context.json === 'function') {
        const body = await error.context.json().catch(() => null)
        if (body?.error) message = body.error
      }
      setErrorMessage(message)
      if (/already closed|already exists|registration is closed/i.test(message)) setAvailability('closed')
      setBusy(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setPassword('')
    setConfirmPassword('')
    if (signInError) {
      setAccountCreated(true)
      setErrorMessage('Your account was created, but automatic sign-in failed. Sign in with your new Super Admin account.')
      setBusy(false)
      return
    }
    navigate('/super-admin', { replace: true })
  }

  return (
    <main className="auth page-transition login-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="auth-container login-container" style={{ width: '100%', maxWidth: '560px' }}>
        <section className="auth-card login-card glass-card neumorph-flat">
          <span className="login-card-brand">SmartSchool platform setup</span>
          <div className="login-heading">
            <h1>Register the first Super Admin</h1>
            <p>This one-time setup is separate from school administrator registration. It closes permanently after the first account is claimed.</p>
          </div>

          {availability === 'checking' && <p role="status">Checking whether setup is still available…</p>}
          {availability === 'error' && <p role="alert">Could not verify setup status. Contact the platform maintainer; registration stays closed until status can be checked.</p>}
          {(availability === 'closed' || accountCreated) && <div role="status"><p>Super Admin registration is closed. Use the existing Super Admin account to sign in.</p><Link className="button blue-button" to="/login/super_admin">Super Admin sign in</Link></div>}

          {availability === 'available' && !accountCreated && <form onSubmit={submit}>
            <label>Full name<input autoComplete="name" maxLength={160} required value={fullName} onChange={event => setFullName(event.target.value)} /></label>
            <label>Email address<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} /></label>
            <label>Password<div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={14} maxLength={72} required value={password} onChange={event => setPassword(event.target.value)} style={{ width: '100%', paddingRight: '52px' }} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} style={{ position: 'absolute', right: '8px', display: 'grid', placeItems: 'center', width: '40px', height: '40px', padding: 0, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}><PasswordEye visible={showPassword} /></button></div></label>
            <label>Confirm password<div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}><input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={14} maxLength={72} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} style={{ width: '100%', paddingRight: '52px' }} /><button type="button" onClick={() => setShowConfirmPassword(value => !value)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmPassword} style={{ position: 'absolute', right: '8px', display: 'grid', placeItems: 'center', width: '40px', height: '40px', padding: 0, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}><PasswordEye visible={showConfirmPassword} /></button></div></label>
            <label>One-time setup key<input type="password" autoComplete="off" minLength={32} required value={bootstrapToken} onChange={event => setBootstrapToken(event.target.value)} /></label>
            {errorMessage && <p role="alert">{errorMessage}</p>}
            <button className="button blue-button" type="submit" disabled={busy}>{busy ? 'Creating secure account…' : 'Create Super Admin account'}</button>
          </form>}

          {availability === 'available' && !accountCreated && <p className="login-aside-footer">The setup key must be configured in Supabase Edge Function secrets. Do not share it or add it to the website settings.</p>}
        </section>
      </div>
    </main>
  )
}

function PasswordEye({ visible }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!visible && <path d="m3 3 18 18" />}
    </svg>
  )
}
