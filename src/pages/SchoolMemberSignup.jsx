import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'
import '../styles/school-member-signup.css'

const portalOptions = [
  { value: 'student', label: 'Student', profileRole: 'student', access: null },
  { value: 'parent', label: 'Parent / guardian', profileRole: 'parent', access: null },
  { value: 'teacher', label: 'Teacher', profileRole: 'teacher', access: null },
  { value: 'hr', label: 'HR & Payroll', profileRole: 'staff', access: 'hr' },
  { value: 'finance', label: 'Finance', profileRole: 'staff', access: 'finance' },
]

export default function SchoolMemberSignup() {
  const { schoolSlug } = useParams()
  const [searchParams] = useSearchParams()
  const isGoogleRegistration = searchParams.get('google_signup') === '1'
  const googlePortal = searchParams.get('portal') || 'student'
  const googleFullName = searchParams.get('full_name') || ''
  const googleAdmissionNumber = searchParams.get('admission_number') || ''
  const [school, setSchool] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [googleSubmitted, setGoogleSubmitted] = useState(false)
  const [form, setForm] = useState(() => ({ fullName: googleFullName, email: '', password: '', portal: portalOptions.some(option => option.value === googlePortal) ? googlePortal : 'student', admissionNumber: googleAdmissionNumber }))
  const googleRequestStarted = useRef(false)
  const selectedPortal = portalOptions.find(option => option.value === form.portal) || portalOptions[0]

  useEffect(() => {
    let live = true
    async function loadSchool() {
      if (!supabase) { setLoading(false); return }
      const { data, error } = await supabase.rpc('get_public_school_directory')
      if (!live) return
      if (error) toast.error(error.message || 'Could not load the school directory.')
      setSchool((data || []).find(item => item.slug === schoolSlug) || null)
      setLoading(false)
    }
    void loadSchool()
    return () => { live = false }
  }, [schoolSlug])

  useEffect(() => {
    if (!isGoogleRegistration || loading || !school || !supabase || googleRequestStarted.current) return undefined
    let live = true
    const submitGoogleRequest = async session => {
      if (!session || googleRequestStarted.current) return
      googleRequestStarted.current = true
      setSubmitting(true)
      const { error } = await supabase.rpc('submit_google_school_portal_signup', {
        p_school_slug: schoolSlug,
        p_full_name: googleFullName,
        p_requested_role: selectedPortal.profileRole,
        p_requested_access: selectedPortal.access,
        p_admission_number: googleAdmissionNumber,
      })
      if (!live) return
      setSubmitting(false)
      if (error) {
        googleRequestStarted.current = false
        toast.error(error.message || 'Could not submit the school registration request.')
      } else {
        setGoogleSubmitted(true)
        setSubmitted(true)
        toast.success('Your request is waiting for school administrator approval.')
      }
    }
    void supabase.auth.getSession().then(({ data }) => submitGoogleRequest(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { void submitGoogleRequest(session) })
    return () => { live = false; subscription.unsubscribe() }
  }, [googleAdmissionNumber, googleFullName, isGoogleRegistration, loading, school, schoolSlug, selectedPortal.access, selectedPortal.profileRole])

  async function submit(event) {
    event.preventDefault()
    if (!supabase || !school) return toast.error('This school is not accepting portal registration right now.')
    if (form.password.length < 12) return toast.error('Use a password with at least 12 characters.')
    if (['student', 'parent'].includes(selectedPortal.profileRole) && !form.admissionNumber.trim()) return toast.error('Enter the learner admission number provided by the school.')
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
    if (['student', 'parent'].includes(selectedPortal.profileRole) && !form.admissionNumber.trim()) return toast.error('Enter the learner admission number provided by the school.')
    const callback = new URLSearchParams({
      google_signup: '1', portal: selectedPortal.value,
      full_name: form.fullName.trim(), admission_number: form.admissionNumber.trim(),
    })
    const redirectTo = `${window.location.origin}/join-school/${encodeURIComponent(school.slug)}?${callback.toString()}`
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (error) toast.error(error.message || 'Could not start Google registration.')
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
          <p>Your request goes only to this school. The administrator must approve it before you can access school data. School administrators cannot register from this page.</p>
          <button className="outline-button full" type="button" onClick={() => void continueWithGoogle()} disabled={!supabase || submitting}>Continue with Google</button>
          <form onSubmit={submit}>
            <label>Portal<select value={form.portal} onChange={event => setForm(current => ({ ...current, portal: event.target.value }))}>{portalOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label>Full name<input required minLength="2" maxLength="160" autoComplete="name" value={form.fullName} onChange={event => setForm(current => ({ ...current, fullName: event.target.value }))} /></label>
            <label>Email<input required type="email" maxLength="254" autoComplete="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></label>
            {['student', 'parent'].includes(selectedPortal.profileRole) && <label>Learner admission number<input required maxLength="80" value={form.admissionNumber} onChange={event => setForm(current => ({ ...current, admissionNumber: event.target.value }))} /><small>For a parent account, enter your child’s admission number.</small></label>}
            <label>Password<input required minLength="12" type="password" autoComplete="new-password" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} /><small>At least 12 characters.</small></label>
            {!supabase && <p className="school-member-signup-error">Supabase is not connected. Registration is unavailable.</p>}
            <button className="button blue-button" type="submit" disabled={submitting || !supabase}>{submitting ? 'Submitting…' : 'Request school account'}</button>
          </form>
          <p className="school-member-signup-back"><Link to="/portals">Choose another school</Link> · <Link to={`/login?school=${encodeURIComponent(schoolSlug)}`}>Already have an account? Login</Link></p>
        </section>}
    </main>
    <PublicFooter />
  </div>
}
