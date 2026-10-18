import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import PortalLayout from './PortalLayout'
import { hasSchoolPermission } from '../lib/schoolRoles'
import { roleRoute } from '../lib/roleRoute'

export default function ProtectedRoute({ roles, permission, children, shell = true, portal = null }) {
  const { session, profile, school, staffRoles, loading, logout } = useAuth()
  const location = useLocation()
  const [mfaState, setMfaState] = useState('checking')
  const [mfaPolicy, setMfaPolicy] = useState({ checked: false, required: false })

  useEffect(() => {
    if (!profile) return
    let active = true
    const determinePolicy = async () => {
      if (['super_admin', 'school_admin'].includes(profile.role)) {
        if (active) setMfaPolicy({ checked: true, required: true })
        return
      }
      if (active) setMfaPolicy({ checked: true, required: staffRoles.some(role => ['principal', 'deputy_principal', 'hr_admin', 'finance_officer', 'registrar', 'inventory_manager', 'nurse', 'counsellor', 'transport_manager'].includes(role)) })
    }
    void determinePolicy()
    return () => { active = false }
  }, [profile?.id, profile?.role, profile?.school_id, staffRoles.join(',')])

  if (loading) return <div className="portal-loading" role="status"><div className="spinner" /><p>Verifying secure session…</p></div>
  if (!session) return <Navigate to={roles?.length === 1 ? `/login/${roles[0]}` : '/login'} replace state={{ from: location }} />
  if (roles?.length && (!profile || !roles.includes(profile.role))) {
    const roleNames = { super_admin: 'Platform administrator', school_admin: 'School administrator', teacher: 'Teacher', student: 'Student', parent: 'Parent' }
    return <main className="portal-loading"><section><p className="eyebrow">PORTAL ACCESS</p><h1>This portal belongs to another account</h1><p>You are signed in as {roleNames[profile?.role] || 'an account without a portal role'}. Sign out, then use the account assigned to this portal.</p><Link className="button blue-button" to={profile?.role ? roleRoute(profile.role) : '/login'}>Return to your portal</Link><button className="outline-button" onClick={logout}>Sign out and switch account</button></section></main>
  }
  if (permission && profile?.role !== 'super_admin' && !hasSchoolPermission(profile?.role, staffRoles, permission)) return <main className="portal-loading"><section><p className="eyebrow">PORTAL ACCESS</p><h1>This specialist portal is not assigned to your account</h1><p>Ask your school administrator to grant the required role before opening this workspace.</p><Link className="button blue-button" to={roleRoute(profile?.role || '')}>Return to your portal</Link></section></main>
  if (profile?.role !== 'super_admin' && !profile?.school_id) return <main className="portal-loading"><section><p className="eyebrow">SCHOOL WORKSPACE ACCESS</p><h1>School access is not assigned</h1><p>This account is not linked to a school workspace. Ask your school administrator to invite you, or sign out and use the correct account.</p><button className="outline-button" onClick={logout}>Sign out</button></section></main>

  const schoolAdmin = profile?.role === 'school_admin'
  const canManagePending = schoolAdmin && ['/subscription', '/settings'].includes(location.pathname)
  if (profile?.role !== 'super_admin' && profile?.school_id && (!school || school.status !== 'active') && !canManagePending) {
    const status = school?.status || 'checking'
    return <main className="portal-loading"><section><p className="eyebrow">SCHOOL WORKSPACE ACCESS</p><h1>{status === 'suspended' ? 'School access is suspended' : status === 'rejected' ? 'School registration was declined' : 'Waiting for school approval'}</h1><p>{status === 'suspended' ? 'This school workspace is currently suspended. Contact the SmartSchool platform administrator for help.' : status === 'rejected' ? 'The platform administrator declined this school request. Contact SmartSchool if you need more information.' : 'The school workspace can open after the SmartSchool platform administrator approves the school and its subscription.'}</p>{schoolAdmin && <Link className="button blue-button" to="/subscription">View plan request</Link>}<button className="outline-button" onClick={logout}>Sign out</button></section></main>
  }

  if (!mfaPolicy.checked) return <div className="portal-loading" role="status"><div className="spinner" /><p>Checking account security requirements…</p></div>
  return mfaState === 'verified' ? (shell ? <PortalLayout portal={portal}>{children}</PortalLayout> : children) : <MfaGate required={mfaPolicy.required} onVerified={() => setMfaState('verified')} />
}

function MfaGate({ onVerified, required }) {
  const { demo, logout } = useAuth()
  const [state, setState] = useState('checking')
  const [challenge, setChallenge] = useState(null)
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!supabase || demo) { onVerified(); return }
    let active = true
    const prepare = async () => {
      try {
        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
        if (factorsError) throw factorsError
        const factor = factors.totp.find(item => item.status === 'verified')
        if (!factor) {
          if (active && required) setState('setup')
          else if (active) onVerified()
          return
        }
        const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (assuranceError) throw assuranceError
        if (assurance.currentLevel === assurance.nextLevel) { onVerified(); return }
        const { data, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id })
        if (challengeError) throw challengeError
        if (active) { setChallenge({ factorId: factor.id, challengeId: data.id }); setState('challenge') }
      } catch (prepareError) { if (active) { setError(prepareError.message); setState('error') } }
    }
    void prepare()
    return () => { active = false }
  }, [demo, required, attempt])

  const beginEnrollment = async () => {
    if (!supabase) return
    setBusy(true); setError('')
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) throw listError
      const pendingFactor = factors.totp.find(item => item.status === 'unverified')
      if (pendingFactor) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id })
        if (removeError) throw removeError
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SmartSchool authenticator' })
      if (enrollError) throw enrollError
      setSetup(data); setCode(''); setState('enroll')
    } catch (enrollError) { setError(enrollError.message); setState('error') } finally { setBusy(false) }
  }

  const verify = async event => {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError('')
    try {
      const cleanCode = code.replace(/\s/g, '')
      const result = setup?.id
        ? await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code: cleanCode })
        : challenge
          ? await supabase.auth.mfa.verify({ factorId: challenge.factorId, challengeId: challenge.challengeId, code: cleanCode })
          : { error: new Error('Start authenticator setup or request a new code challenge.') }
      if (result.error) throw result.error
      await supabase.auth.refreshSession()
      onVerified()
    } catch (verifyError) { setError(verifyError.message) } finally { setBusy(false) }
  }

  if (state === 'checking') return <div className="portal-loading" role="status">Checking account verification…</div>
  return <main className="portal-loading"><form onSubmit={verify} style={{ width: 'min(420px, calc(100% - 32px))', padding: 24, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14 }}>
    <h1>{state === 'enroll' ? 'Set up authenticator verification' : 'Verify it’s you'}</h1>
    <p>{state === 'error' ? 'Your account needs additional verification before continuing.' : state === 'enroll' ? 'Scan this QR code in an authenticator app, then enter its current six digit code.' : state === 'challenge' ? 'Enter the current six digit code from your authenticator app.' : 'Administrator and finance accounts must enable an authenticator before opening the school workspace.'}</p>
    {state === 'enroll' && setup?.totp && <><img src={setup.totp.qr_code} alt="Authenticator setup QR code" style={{ width: 220, maxWidth: '100%', padding: 8, background: 'white', borderRadius: 8 }} /><p style={{ overflowWrap: 'anywhere' }}><b>Manual setup key:</b> {setup.totp.secret}</p><label htmlFor="route-enroll-code">Authenticator code</label><input id="route-enroll-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required /></>}
    {state === 'challenge' && <><label htmlFor="route-mfa-code">Authenticator code</label><input id="route-mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required /></>}
    {error && <p role="alert">{error}</p>}
    {state === 'challenge' && <button className="button blue-button" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>}
    {state === 'enroll' && <button className="button blue-button" disabled={busy}>{busy ? 'Enabling…' : 'Enable and continue'}</button>}
    {state === 'setup' && <button className="button blue-button" type="button" disabled={busy} onClick={beginEnrollment}>Set up authenticator</button>}
    {state === 'error' && <button className="button blue-button" type="button" disabled={busy} onClick={() => { setSetup(null); setAttempt(value => value + 1); setState('checking'); setError('') }}>Try again</button>}
    <button type="button" className="outline-button" onClick={logout}>Sign out</button>
  </form></main>
}
