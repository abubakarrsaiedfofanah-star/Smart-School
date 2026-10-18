import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function SecuritySettings() {
  const { logout, profile, demo } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [factor, setFactor] = useState(null)
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase || demo) return
    let active = true
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) { toast.error(error.message); return }
      if (active) setFactor(data.totp.find(item => item.status === 'verified') || null)
    })
    return () => { active = false }
  }, [demo])

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
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SmartSchool authenticator' })
      if (error) throw error
      setSetup(data)
    } catch (error) { toast.error(error.message) } finally { setBusy(false) }
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
    setBusy(true)
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (error) throw error
      setFactor(null); toast.success('Authenticator verification is disabled.')
    } catch (error) { toast.error(error.message) } finally { setBusy(false) }
  }

  return <div className="security-page page-transition">
    <style>{`.security-page{max-width:1000px;margin:40px auto;padding:0 24px}.security-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.glass-card{background:var(--panel);border-radius:18px;border:1px solid var(--line);padding:28px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:18px}.form-group{display:flex;flex-direction:column;gap:8px}.form-group label{font-weight:700;font-size:.85rem;color:var(--muted)}.form-group input{padding:13px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}.mfa-qr{max-width:220px;width:100%;background:#fff;padding:10px;border-radius:8px}.mfa-secret{overflow-wrap:anywhere}@media(max-width:850px){.security-grid{grid-template-columns:1fr}}`}</style>
    <header><p className="eyebrow">ACCOUNT SECURITY</p><h1>Security settings</h1><p>Protect your account and manage where your current session is active. School and platform administrators, principals, HR administrators, and finance officers must enable authenticator verification.</p></header>
    <div className="security-grid">
      <form onSubmit={handlePasswordChange} className="glass-card">
        <h2>Password</h2>
        <div className="form-group"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></div>
        <div className="form-group"><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div>
        <button className="button blue-button" disabled={changingPassword}>{changingPassword ? 'Updating…' : 'Update password'}</button>
      </form>
      <section className="glass-card" aria-labelledby="mfa-heading">
        <h2 id="mfa-heading">Authenticator verification</h2>
        <p>{factor ? 'A verified authenticator app is connected.' : 'Add a time based code from an authenticator app for an extra sign in check.'}</p>
        {!factor && !setup && <button className="button blue-button" type="button" disabled={busy || !supabase} onClick={startMfa}>Set up authenticator</button>}
        {setup && <form onSubmit={verifyMfa} className="form-group">
          <img className="mfa-qr" src={setup.totp.qr_code} alt="Authenticator setup QR code" />
          <p className="mfa-secret"><b>Manual key:</b> {setup.totp.secret}</p>
          <label htmlFor="mfa-code">6 digit code</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required />
          <button className="button blue-button" disabled={busy}>Verify and enable</button>
          <button className="outline" type="button" onClick={() => setSetup(null)}>Cancel setup</button>
        </form>}
        {factor && <button className="outline" type="button" disabled={busy} onClick={disableMfa}>Remove authenticator</button>}
      </section>
      <section className="glass-card"><h2>Active sessions</h2><p>Sign out from every browser and device where this account is currently signed in.</p><button className="outline" type="button" onClick={logout}>Sign out of all sessions</button></section>
      <section className="glass-card"><h2>Personal data</h2><p>Download a copy of your profile, notifications, and learner records visible to this account.</p><button className="outline" type="button" onClick={exportData}>Download my data</button></section>
    </div>
  </div>
}
