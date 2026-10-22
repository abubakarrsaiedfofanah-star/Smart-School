import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import '../styles/password-recovery.css'

export default function PasswordRecovery() {
  const navigate = useNavigate()
  const [checkingLink, setCheckingLink] = useState(true)
  const [validLink, setValidLink] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!supabase) { setCheckingLink(false); return undefined }
    let active = true
    const checkRecoverySession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!active) return
      setValidLink(Boolean(!error && data.session))
      setCheckingLink(false)
    }
    void checkRecoverySession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY') setValidLink(true)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function updatePassword(event) {
    event.preventDefault()
    if (!supabase) return toast.error('Password reset is unavailable right now.')
    if (password.length < 12) return toast.error('Use at least 12 characters for your password.')
    if (password !== confirmPassword) return toast.error('The passwords do not match.')
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setSaving(false)
      toast.error(error.message || 'Could not update your password.')
      return
    }
    await supabase.auth.signOut({ scope: 'local' })
    toast.success('Your password has been reset. Sign in with your new password.')
    navigate('/login', { replace: true })
  }

  return <main className="password-recovery-page">
    <section className="password-recovery-card" aria-labelledby="password-recovery-title">
      <Link className="password-recovery-brand" to="/">SmartSchool</Link>
      {checkingLink ? <div role="status"><div className="password-recovery-spinner" /><p>Verifying your reset link…</p></div>
        : validLink ? <>
          <p className="eyebrow blue-eyebrow">ACCOUNT SECURITY</p>
          <h1 id="password-recovery-title">Choose a new password</h1>
          <p className="password-recovery-copy">Use at least 12 characters. You’ll sign in with this password after it’s updated.</p>
          <form onSubmit={updatePassword}>
            <label htmlFor="recovery-password">New password</label>
            <div className="password-recovery-input"><input id="recovery-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>
            <label htmlFor="recovery-confirm-password">Confirm new password</label>
            <div className="password-recovery-input"><input id="recovery-confirm-password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={12} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /><button type="button" aria-label={showConfirmation ? 'Hide confirmation' : 'Show confirmation'} onClick={() => setShowConfirmation(value => !value)}>{showConfirmation ? 'Hide' : 'Show'}</button></div>
            <p className="password-recovery-hint" aria-live="polite">{confirmPassword ? password === confirmPassword ? 'Passwords match.' : 'Passwords do not match yet.' : 'Choose a unique password you do not use elsewhere.'}</p>
            <button className="password-recovery-submit" type="submit" disabled={saving || password.length < 12 || password !== confirmPassword}>{saving ? 'Updating password…' : 'Update password'}</button>
          </form>
        </> : <>
          <p className="eyebrow blue-eyebrow">RESET LINK UNAVAILABLE</p>
          <h1 id="password-recovery-title">This reset link has expired</h1>
          <p className="password-recovery-copy">Request a new password reset link, then open it from this device.</p>
          <Link className="password-recovery-submit" to="/login">Return to sign in</Link>
        </>}
    </section>
  </main>
}
