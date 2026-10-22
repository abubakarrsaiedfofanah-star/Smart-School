import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function SecuritySettings() {
  const { logout, profile, staffRoles, demo } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [factor, setFactor] = useState(null)
  const [factorLoading, setFactorLoading] = useState(Boolean(supabase && !demo))
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [accountUser, setAccountUser] = useState(null)
  const requiresMfa = profile?.role === 'super_admin' || profile?.role === 'school_admin'
    || staffRoles.some(role => ['principal', 'deputy_principal', 'head_of_department', 'hr_admin', 'finance_officer', 'registrar', 'inventory_manager', 'nurse', 'counsellor', 'transport_manager'].includes(role))

  useEffect(() => {
    if (!supabase || demo) { setFactorLoading(false); return undefined }
    let active = true
    setFactorLoading(true)
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) throw error
      if (active) setFactor(data.totp.find(item => item.status === 'verified') || null)
    }).catch(error => { if (active) toast.error(`Could not check authenticator status: ${error.message}`) })
      .finally(() => { if (active) setFactorLoading(false) })
    return () => { active = false }
  }, [demo, profile?.id])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) throw error
      if (active) setAccountUser(data.user || null)
    }).catch(error => {
      if (active) toast.error(`Could not load account identity: ${error.message}`)
    })
    return () => { active = false }
  }, [profile?.id])

  const exportData = async () => {
    if (!supabase || !profile) return toast.error('Data export is unavailable until the platform is connected.')
    try {
      const [userResult, account, alerts, learnerRows, guardianLinks] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('id,full_name,phone,role,school_id,notification_preferences,delivery_preferences,created_at').eq('id', profile.id).maybeSingle(),
        supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1000),
        supabase.from('students').select('*').eq('profile_id', profile.id),
        supabase.from('student_guardians').select('student_id,relationship').eq('guardian_id', profile.id),
      ])
      for (const result of [userResult, account, alerts, learnerRows, guardianLinks]) if (result.error) throw result.error
      const studentIds = [...new Set([...(learnerRows.data || []).map(row => row.id), ...(guardianLinks.data || []).map(row => row.student_id)])]
      const [attendance, results] = studentIds.length ? await Promise.all([
        supabase.from('attendance').select('*').in('student_id', studentIds).limit(5000),
        supabase.from('results').select('*').in('student_id', studentIds).limit(5000),
      ]) : [{ data: [] }, { data: [] }]
      if (attendance.error) throw attendance.error
      if (results.error) throw results.error
      const payload = { exported_at: new Date().toISOString(), scope: 'Records available to this signed-in account under school access rules', profile: { ...account.data, email: userResult.data.user?.email }, notifications: alerts.data || [], learners: learnerRows.data || [], guardian_links: guardianLinks.data || [], attendance: attendance.data || [], results: results.data || [] }
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `smartschool-account-${profile.id}.json`; anchor.click(); URL.revokeObjectURL(objectUrl)
      toast.success('Your account data export is ready.')
    } catch (error) { toast.error(`Could not export account data: ${error.message}`) }
  }

  const handlePasswordChange = async event => {
    event.preventDefault()
    if (!supabase) return toast.error('Account security is unavailable until the platform is connected.')
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match.')
    if (newPassword.length < 12) return toast.error('Use at least 12 characters for your password.')
    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Password updated.')
      setNewPassword(''); setConfirmPassword('')
    } catch (error) { toast.error(error.message) } finally { setChangingPassword(false) }
  }

  const startMfa = async () => {
    if (!supabase) return
    setBusy(true)
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) throw listError
      for (const pendingFactor of factors.totp.filter(item => item.status === 'unverified')) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id })
        if (removeError) throw removeError
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SmartSchool authenticator' })
      if (error) throw error
      setSetup(data)
    } catch (error) { toast.error(error.message) } finally { setBusy(false) }
  }

  const cancelMfaSetup = async () => {
    if (!supabase || !setup?.id) { setSetup(null); setCode(''); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: setup.id })
      if (error) throw error
      setSetup(null); setCode('')
    } catch (error) { toast.error(`Could not cancel authenticator setup: ${error.message}`) } finally { setBusy(false) }
  }

  const verifyMfa = async event => {
    event.preventDefault()
    if (!supabase || !setup?.id) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code: code.replace(/\s/g, '') })
      if (error) throw error
      setFactor({ id: setup.id, status: 'verified' }); setSetup(null); setCode('')
      toast.success('Authenticator verification is enabled.')
    } catch (error) { toast.error(error.message) } finally { setBusy(false) }
  }

  const disableMfa = async () => {
    if (!supabase || !factor) return
    if (requiresMfa) return toast.error('Authenticator verification is required for your role.')
    if (!window.confirm('Remove authenticator verification from this account?')) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (error) throw error
      setFactor(null); toast.success('Authenticator verification is disabled.')
    } catch (error) { toast.error(error.message) } finally { setBusy(false) }
  }

  const authProvider = accountUser?.app_metadata?.provider
  const signInMethod = authProvider === 'google' ? 'Google sign-in' : authProvider === 'email' ? 'Email and password' : 'Account sign-in'
  const emailVerified = Boolean(accountUser?.email_confirmed_at || accountUser?.confirmed_at)

  return <div className="security-page page-transition">
    <style>{`.security-page{max-width:1000px;margin:40px auto;padding:0 24px}.security-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.glass-card{background:var(--panel);border-radius:18px;border:1px solid var(--line);padding:28px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:18px}.form-group{display:flex;flex-direction:column;gap:8px}.form-group label{font-weight:700;font-size:.85rem;color:var(--muted)}.form-group input{padding:13px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}.mfa-qr{max-width:220px;width:100%;background:#fff;padding:10px;border-radius:8px}.mfa-secret{overflow-wrap:anywhere}@media(max-width:850px){.security-grid{grid-template-columns:1fr}}`}</style>
    <style>{`.security-page .security-secondary-action{display:inline-flex;width:100%;min-height:42px;align-items:center;justify-content:center;padding:10px 14px;border:1px solid var(--line)!important;border-radius:9px;background:var(--bg)!important;color:var(--ink)!important;box-shadow:none!important;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer}.security-page .security-secondary-action:hover:not(:disabled){border-color:var(--green)!important;background:var(--cream)!important}.security-page .security-secondary-action:focus-visible{outline:3px solid color-mix(in srgb,var(--green) 35%,transparent);outline-offset:2px}`}</style>
    <style>{`.security-page{max-width:1080px;margin:36px auto 70px;padding:0 24px}.security-page>header{margin-bottom:28px;padding:28px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(135deg,var(--panel),var(--bg));box-shadow:var(--shadow)}.security-page>header h1{margin:6px 0 10px;font-size:clamp(1.8rem,4vw,2.55rem);letter-spacing:-.04em}.security-page>header>p:last-child{max-width:720px;margin:0;color:var(--muted);line-height:1.65}.security-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.security-grid>.glass-card{min-width:0;gap:16px;padding:24px}.security-grid>.glass-card h2{margin:0;font-size:1.08rem}.security-grid>.glass-card>p{margin:0;color:var(--muted);font-size:.9rem;line-height:1.6}.security-status{display:inline-flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:.7rem;font-weight:750;white-space:nowrap}.security-status:before{width:7px;height:7px;border-radius:50%;background:#92a2b1;content:''}.security-status.is-secure{border-color:#b8e2c9;background:#effaf3;color:#28744a}.security-status.is-secure:before{background:#2da467}.security-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.security-input-wrap{display:flex;align-items:center;overflow:hidden;border:1px solid var(--line);border-radius:10px;background:var(--bg)}.security-input-wrap input{width:100%;min-width:0;border:0!important;outline:0;background:transparent!important}.security-input-wrap button{align-self:stretch;padding:0 12px;border:0;border-left:1px solid var(--line);background:transparent;color:var(--muted);font-size:.76rem;font-weight:700;cursor:pointer}.security-requirements{margin:-5px 0 0;color:var(--muted);font-size:.76rem;line-height:1.5}.security-factor-setup{display:grid;gap:12px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--bg)}.security-factor-setup label{font-size:.84rem;font-weight:700;color:var(--muted)}.security-factor-setup input{min-height:44px;padding:11px;border:1px solid var(--line);border-radius:9px;background:var(--panel);color:var(--ink);font:inherit}.security-factor-setup .mfa-qr{max-width:220px;width:100%;background:#fff;padding:10px;border-radius:8px}.security-factor-setup .mfa-secret{overflow-wrap:anywhere;color:var(--muted);font-size:.82rem;line-height:1.55}.security-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:auto}.security-grid>.security-data-card{grid-column:1/-1}.security-page button:disabled{cursor:wait;opacity:.6}@media(max-width:760px){.security-page{margin:20px auto 48px;padding:0 16px}.security-page>header{padding:21px}.security-grid{grid-template-columns:1fr}.security-grid>.glass-card{padding:20px}.security-grid>.security-data-card{grid-column:auto}}`}</style>
    <style>{`.security-identity{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}.security-identity-copy{display:grid;min-width:0;flex:1;gap:4px}.security-identity-copy b{overflow-wrap:anywhere;font-size:.9rem}.security-identity-copy span{color:var(--muted);font-size:.76rem;text-transform:capitalize}.security-identity .security-status{margin-left:auto}.security-identity-mark{display:grid;width:40px;height:40px;flex:0 0 40px;place-items:center;border-radius:12px;background:var(--bg);color:var(--ink);font-weight:850}`}</style>
    <header><p className="eyebrow">ACCOUNT SECURITY</p><h1>Security settings</h1><p>Protect your account with a strong password and authenticator app. Manage verification and sign out across your devices.</p><div className="security-identity"><span className="security-identity-mark" aria-hidden="true">{(profile?.full_name || accountUser?.email || 'A').slice(0, 1).toUpperCase()}</span><div className="security-identity-copy"><b>{accountUser?.email || profile?.full_name || 'Signed-in account'}</b><span>{signInMethod} · {profile?.role?.replaceAll('_', ' ') || 'User'}</span></div><span className={`security-status${emailVerified ? ' is-secure' : ''}`}>{accountUser ? emailVerified ? 'Email verified' : 'Email unverified' : 'Checking email'}</span></div></header>
    <div className="security-grid">
      <form onSubmit={handlePasswordChange} className="glass-card">
        <div className="security-card-heading"><h2>Password</h2><span className="security-status">Change anytime</span></div>
        <p>Choose a new password with at least 12 characters.</p>
        <div className="form-group"><label htmlFor="new-password">New password</label><div className="security-input-wrap"><input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /><button type="button" aria-label={showPassword ? 'Hide new password' : 'Show new password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div></div>
        <div className="form-group"><label htmlFor="confirm-password">Confirm new password</label><div className="security-input-wrap"><input id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /><button type="button" aria-label={showConfirmPassword ? 'Hide confirmation' : 'Show confirmation'} onClick={() => setShowConfirmPassword(value => !value)}>{showConfirmPassword ? 'Hide' : 'Show'}</button></div></div>
        <p className="security-requirements" aria-live="polite">{confirmPassword ? (newPassword === confirmPassword ? 'Passwords match.' : 'Passwords do not match yet.') : 'Use a unique password you do not use for another account.'}</p>
        <button className="button blue-button" disabled={changingPassword || !newPassword || newPassword !== confirmPassword}>{changingPassword ? 'Updatingâ€¦' : 'Update password'}</button>
      </form>
      <section className="glass-card" aria-labelledby="mfa-heading">
        <div className="security-card-heading"><h2 id="mfa-heading">Authenticator verification</h2><span className={`security-status${factor ? ' is-secure' : ''}`}>{factorLoading ? 'Checking' : factor ? 'Enabled' : 'Not enabled'}</span></div>
        <p>{factor ? 'A verified authenticator app is connected to your account.' : requiresMfa ? 'Required for your role. Set it up to continue using protected school tools.' : 'Add a time-based code from an authenticator app for an extra sign-in check.'}</p>
        {!factor && !setup && <button className="button blue-button" type="button" disabled={busy || factorLoading || !supabase} onClick={startMfa}>{factorLoading ? 'Checking statusâ€¦' : 'Set up authenticator'}</button>}
        {setup && <form onSubmit={verifyMfa} className="security-factor-setup">
          <img className="mfa-qr" src={setup.totp.qr_code} alt="Authenticator setup QR code" />
          <p className="mfa-secret"><b>Manual key:</b> {setup.totp.secret}</p>
          <label htmlFor="mfa-code">6-digit code from your authenticator app</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required />
          <button className="button blue-button" disabled={busy || code.length !== 6}>{busy ? 'Verifyingâ€¦' : 'Verify and enable'}</button>
          <button className="security-secondary-action" type="button" disabled={busy} onClick={cancelMfaSetup}>Cancel setup</button>
        </form>}
        {factor && (requiresMfa ? <p className="security-requirements">Authenticator verification is required for your role.</p> : <button className="security-secondary-action" type="button" disabled={busy} onClick={disableMfa}>Remove authenticator</button>)}
      </section>
      <section className="glass-card"><div className="security-card-heading"><h2>Active sessions</h2><span className="security-status is-secure">Signed in</span></div><p>Sign out this account from all browsers and devices. You will need to sign in again.</p><button className="security-secondary-action" type="button" onClick={logout}>Sign out of all sessions</button></section>
      <section className="glass-card security-data-card"><h2>Personal data</h2><p>Download a copy of your profile, notifications, and learner records visible to this account.</p><button className="security-secondary-action" type="button" onClick={exportData}>Download my data</button></section>
    </div>
  </div>
}
