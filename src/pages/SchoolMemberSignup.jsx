import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'
import '../styles/school-member-signup.css'

const portalCatalog = [
  { value: 'student', label: 'Student', profileRole: 'student', access: null },
  { value: 'parent', label: 'Parent / guardian', profileRole: 'parent', access: null },
  { value: 'teacher', label: 'Teacher', profileRole: 'teacher', access: null },
  { value: 'hr', label: 'HR & Payroll', profileRole: 'staff', access: 'hr' },
  { value: 'finance', label: 'Finance', profileRole: 'staff', access: 'finance' },
]

function readGoogleSignupDraft(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || '{}') }
  catch { return {} }
}

export default function SchoolMemberSignup() {
  const { schoolSlug } = useParams()
  const [searchParams] = useSearchParams()
  const isGoogleRegistration = searchParams.get('google_signup') === '1'
  const googlePortal = searchParams.get('portal') || 'student'
  const googleDraftKey = `smartschool_google_signup:${schoolSlug}`
  const googleDraft = isGoogleRegistration ? readGoogleSignupDraft(googleDraftKey) : {}
  const googleFullName = googleDraft.fullName || ''
  const googleAdmissionNumber = googleDraft.admissionNumber || ''
  const [school, setSchool] = useState(null)
  const [classes, setClasses] = useState([])
  const [availablePortals, setAvailablePortals] = useState([])
  const [portalLoadError, setPortalLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [googleSubmitted, setGoogleSubmitted] = useState(false)
  const [chosenPortal, setChosenPortal] = useState(() => isGoogleRegistration && portalCatalog.some(option => option.value === googlePortal) ? googlePortal : '')
  const [form, setForm] = useState(() => ({ fullName: googleFullName, email: '', password: '', admissionNumber: googleAdmissionNumber, requestedClassId: googleDraft.requestedClassId || '' }))
  const googleRequestStarted = useRef(false)
  const selectedPortal = availablePortals.find(option => option.value === chosenPortal) || null
  const googlePortalUnavailable = isGoogleRegistration && !loading && !portalLoadError
    && availablePortals.length > 0 && !availablePortals.some(option => option.value === googlePortal)

  useEffect(() => {
    let live = true
    async function loadSchool() {
      setLoading(true)
      setClasses([])
      setSchool(null)
      setAvailablePortals([])
      setPortalLoadError('')
      if (!supabase) { setLoading(false); return }
      const { data, error } = await supabase.rpc('get_public_school_directory')
      if (!live) return
      if (error) toast.error(error.message || 'Could not load the school directory.')
      const selectedSchool = (data || []).find(item => item.slug === schoolSlug) || null
      setSchool(selectedSchool)
      if (selectedSchool) {
        const [{ data: classRows, error: classError }, { data: portalRows, error: portalError }] = await Promise.all([
          supabase.rpc('get_public_school_classes', { p_school_slug: schoolSlug }),
          supabase.rpc('get_public_school_registration_portals', { p_school_slug: schoolSlug }),
        ])
        if (!live) return
        if (classError) toast.error(classError.message || 'Could not load school classes.')
        setClasses(classRows || [])
        if (portalError) {
          setPortalLoadError('Could not load this school’s registration portals. Please try again later.')
          toast.error(portalError.message || 'Could not load school registration portals.')
        } else {
          const options = (portalRows || []).map(row => portalCatalog.find(option => option.value === row.portal)).filter(Boolean)
          setAvailablePortals(options)
          setChosenPortal(current => options.some(option => option.value === current) ? current : '')
        }
      }
      setLoading(false)
    }
    void loadSchool()
    return () => { live = false }
  }, [schoolSlug])

  useEffect(() => {
    const googleSelectedPortal = availablePortals.find(option => option.value === googlePortal)
    if (!isGoogleRegistration || loading || !school || !supabase || !googleSelectedPortal || googleRequestStarted.current) return undefined
    let live = true
    const submitGoogleRequest = async session => {
      if (!session || googleRequestStarted.current) return
      googleRequestStarted.current = true
      setSubmitting(true)
      const { error } = await supabase.rpc('submit_google_school_portal_signup', {
        p_school_slug: schoolSlug,
        p_full_name: googleFullName,
        p_requested_role: googleSelectedPortal.profileRole,
        p_requested_access: googleSelectedPortal.access,
        p_admission_number: googleAdmissionNumber,
        p_requested_class_id: googleDraft.requestedClassId || null,
      })
      if (!live) return
      setSubmitting(false)
      if (error) {
        googleRequestStarted.current = false
        toast.error(error.message || 'Could not submit the school registration request.')
      } else {
        setGoogleSubmitted(true)
        setSubmitted(true)
        try { sessionStorage.removeItem(googleDraftKey) } catch { /* Ignore unavailable browser storage. */ }
        toast.success('Your request is waiting for school administrator approval.')
      }
    }
    void supabase.auth.getSession().then(({ data }) => submitGoogleRequest(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { void submitGoogleRequest(session) })
    return () => { live = false; subscription.unsubscribe() }
  }, [availablePortals, googleAdmissionNumber, googleDraft.requestedClassId, googleDraftKey, googleFullName, googlePortal, isGoogleRegistration, loading, school, schoolSlug])

  async function submit(event) {
    event.preventDefault()
    if (!supabase || !school) return toast.error('This school is not accepting portal registration right now.')
    if (!selectedPortal) return toast.error('Choose a portal currently available at this school.')
    if (form.password.length < 12) return toast.error('Use a password with at least 12 characters.')
    if (['student', 'parent'].includes(selectedPortal.profileRole) && !form.admissionNumber.trim()) return toast.error('Enter the learner admission number provided by the school.')
    if (['student', 'parent'].includes(selectedPortal.profileRole) && !form.requestedClassId) return toast.error('Choose the learner’s current class or level.')
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?school=${encodeURIComponent(school.slug)}`,
        data: {
          school_portal_signup: 'true', school_id: school.id,
          requested_portal_role: selectedPortal.profileRole,
          requested_portal_access: selectedPortal.access,
          admission_number: form.admissionNumber.trim(), full_name: form.fullName.trim(),
          requested_class_id: form.requestedClassId || '',
        },
      },
    })
    setSubmitting(false)
    if (error || !data?.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
      toast.error(error?.message || 'An account may already exist for this email. Sign in or use another email.')
      return
    }
    setSubmitted(true)
  }

  async function continueWithGoogle() {
    if (!supabase || !school) return toast.error('Google registration is unavailable right now.')
    if (!selectedPortal) return toast.error('Choose a portal currently available at this school.')
    if (['student', 'parent'].includes(selectedPortal.profileRole) && !form.admissionNumber.trim()) return toast.error('Enter the learner admission number provided by the school.')
    if (['student', 'parent'].includes(selectedPortal.profileRole) && !form.requestedClassId) return toast.error('Choose the learner’s current class or level.')
    try {
      sessionStorage.setItem(googleDraftKey, JSON.stringify({
        fullName: form.fullName.trim(), admissionNumber: form.admissionNumber.trim(),
        requestedClassId: form.requestedClassId || '',
      }))
    } catch {
      return toast.error('Could not save this registration for the Google sign-in step. Check your browser storage settings and try again.')
    }
    const callback = new URLSearchParams({ google_signup: '1', portal: selectedPortal.value })
    const redirectTo = `${window.location.origin}/join-school/${encodeURIComponent(school.slug)}?${callback.toString()}`
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (error) {
      try { sessionStorage.removeItem(googleDraftKey) } catch { /* Ignore unavailable browser storage. */ }
      toast.error(error.message || 'Could not start Google registration.')
    }
  }

  return <div className="public-site school-home school-member-signup">
    <PublicHeader />
    <main className="school-member-signup-main">
      {loading ? <section className="school-member-signup-card"><p>Loading school…</p></section>
        : submitted ? <section className="school-member-signup-card" role="status">
          <p className="eyebrow">REQUEST RECEIVED</p><h1>{googleSubmitted ? 'Request submitted' : 'Check your email'}</h1>
          <p>{googleSubmitted ? `Your Google account is verified. ${school?.name}’s administrator will review your ${selectedPortal.label} request; access stays locked until approval.` : <>Verify your email address. <b>{school?.name}</b>’s administrator will review your {selectedPortal.label} account request. Your account stays locked until the school approves it.</>}</p>
          <Link className="button blue-button" to={`/login?school=${encodeURIComponent(schoolSlug)}`}>Login to {school?.name}</Link>
        </section>
        : !school ? <section className="school-member-signup-card"><p className="eyebrow">SCHOOL PORTAL</p><h1>School not found</h1><p>This school is unavailable or is not accepting new portal registrations.</p><Link to="/portals">View portals</Link></section>
        : <section className="school-member-signup-card">
          <p className="eyebrow">JOIN A SCHOOL</p><h1>Register with {school.name}</h1>
          <p>Your request goes only to this school. Choose a portal this school has enabled. The administrator must approve your request before you can access school data.</p>
          {portalLoadError ? <p className="school-member-signup-error" role="alert">{portalLoadError}</p> : !availablePortals.length ? <p className="school-member-signup-error" role="status">This school is not accepting public portal registrations right now. Contact the school administrator.</p> : <>
          {googlePortalUnavailable && <p className="school-member-signup-error" role="alert">The portal selected before signing in with Google is no longer available. Choose another portal below.</p>}
          {!selectedPortal ? <div className="school-registration-portal-picker">
            <ol className="school-registration-steps" aria-label="Registration steps"><li aria-current="step"><b>1</b>Choose a portal</li><li><b>2</b>Enter your details</li></ol>
            <h2>Choose a portal</h2><p>Select the account type you need at {school.name}.</p>
            <div className="school-registration-portal-grid">{availablePortals.map((option, index) => <button className="school-registration-portal-card" type="button" key={option.value} onClick={() => setChosenPortal(option.value)}>
              <span className="school-registration-portal-number">{String(index + 1).padStart(2, '0')}</span><b>{option.label}</b><span>Register for this portal <span aria-hidden="true">→</span></span>
            </button>)}</div>
          </div> : <>
          <ol className="school-registration-steps" aria-label="Registration steps"><li><b>1</b>Choose a portal</li><li aria-current="step"><b>2</b>Enter your details</li></ol>
          <div className="school-registration-selected-portal"><div><span>REGISTERING AS</span><b>{selectedPortal.label}</b></div><button type="button" onClick={() => setChosenPortal('')} disabled={submitting}>Choose another portal</button></div>
          <button className="outline-button full" type="button" onClick={() => void continueWithGoogle()} disabled={!supabase || submitting}>Continue with Google</button>
          <form onSubmit={submit}>
            <label>Full name<input required minLength="2" maxLength="160" autoComplete="name" value={form.fullName} onChange={event => setForm(current => ({ ...current, fullName: event.target.value }))} /></label>
            <label>Email<input required type="email" maxLength="254" autoComplete="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></label>
            {selectedPortal && ['student', 'parent'].includes(selectedPortal.profileRole) && <>
              <label>Class or level<select required value={form.requestedClassId || ''} onChange={event => setForm(current => ({ ...current, requestedClassId: event.target.value }))}><option value="">Choose current class or level</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}{item.grade ? ` · ${item.grade}` : ''}</option>)}</select><small>This helps the school match the request and show the right class activities.</small></label>
              <label>Learner admission number<input required maxLength="80" value={form.admissionNumber} onChange={event => setForm(current => ({ ...current, admissionNumber: event.target.value }))} /><small>For a parent account, enter your child’s admission number.</small></label>
              {!classes.length && <small>The school has not added any classes yet. Contact the school administrator before registering.</small>}
            </>}
            <label>Password<input required minLength="12" type="password" autoComplete="new-password" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} /><small>At least 12 characters.</small></label>
            {!supabase && <p className="school-member-signup-error">Supabase is not connected. Registration is unavailable.</p>}
            <button className="button blue-button" type="submit" disabled={submitting || !supabase || !selectedPortal}>{submitting ? 'Submitting…' : 'Request school account'}</button>
          </form>
          </>}
          </>}
          <p className="school-member-signup-back"><Link to="/portals">Choose another school</Link> · <Link to={`/login?school=${encodeURIComponent(schoolSlug)}`}>Already have an account? Login</Link></p>
        </section>}
    </main>
    <PublicFooter />
  </div>
}
