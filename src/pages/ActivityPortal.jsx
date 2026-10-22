import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const emptyForm = { title: '', description: '', activity_type: 'sports', starts_at: '', location: '', class_id: '', subject_id: '', registration_deadline: '', is_free: 'yes', amount: '' }
const activityTypes = { sports: 'Sports', trip: 'Road trip', excursion: 'Excursion', club: 'Club activity', other: 'Other' }
const money = (amount, currency) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount) || 0) }
  catch { return `${currency} ${(Number(amount) || 0).toFixed(2)}` }
}
const localDateTime = value => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ActivityPortal() {
  const { profile, school, staffRoles = [], demo } = useAuth()
  const [searchParams] = useSearchParams()
  const [activities, setActivities] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teacherAssignments, setTeacherAssignments] = useState([])
  const [children, setChildren] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [attempts, setAttempts] = useState([])
  const [selectedChildren, setSelectedChildren] = useState({})
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const currency = String(school?.currency_code || 'KES').toUpperCase()
  const role = profile?.role
  const isParent = role === 'parent'
  const isStudent = role === 'student'
  const isFinance = role === 'school_admin' || (['teacher', 'staff'].includes(role) && (staffRoles.includes('finance_officer') || staffRoles.includes('principal')))
  const canCreate = ['school_admin', 'teacher'].includes(role) || staffRoles.includes('principal')
  const canChooseWholeSchool = role === 'school_admin' || staffRoles.includes('principal')
  const classNames = useMemo(() => new Map(classes.map(item => [item.id, item.name])), [classes])
  const registrationsByLearner = useMemo(() => new Map(registrations.map(row => [`${row.activity_id}:${row.student_id}`, row])), [registrations])

  const load = useCallback(async () => {
    if (!supabase || !profile?.school_id || demo) {
      setActivities([]); setRegistrations([]); setAttempts([]); setChildren([]); setClasses([]); setSubjects([]); setTeacherAssignments([])
      setLoadError(demo ? 'Demo accounts can view this workspace without live school activity records.' : 'Connect this school to Supabase to manage activities.')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const activityRequest = supabase.from('school_activities').select('*').eq('school_id', profile.school_id).order('starts_at', { ascending: true })
      const classesRequest = supabase.from('classes').select('id,name,grade,teacher_id').eq('school_id', profile.school_id).order('name')
      const subjectsRequest = supabase.from('subjects').select('id,name,code').eq('school_id', profile.school_id).order('name')
      const assignmentsRequest = role === 'teacher'
        ? supabase.from('teacher_subject_assignments').select('class_id,subject_id').eq('school_id', profile.school_id).eq('teacher_id', profile.id)
        : Promise.resolve({ data: [], error: null })
      let childRequest = Promise.resolve({ data: [], error: null })
      if (isParent) {
        childRequest = (async () => {
          const { data: links, error: linkError } = await supabase.from('student_guardians').select('student_id').eq('guardian_id', profile.id)
          if (linkError) throw linkError
          const ids = (links || []).map(row => row.student_id)
          if (!ids.length) return { data: [], error: null }
          const { data: learners, error: learnerError } = await supabase.from('students').select('id,admission_number,class_id,profile_id').eq('school_id', profile.school_id).in('id', ids)
          if (learnerError) throw learnerError
          const profileIds = (learners || []).map(item => item.profile_id).filter(Boolean)
          if (!profileIds.length) return { data: learners || [], error: null }
          const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id,full_name').in('id', profileIds)
          if (profilesError) throw profilesError
          const names = new Map((profiles || []).map(item => [item.id, item.full_name]))
          return { data: (learners || []).map(item => ({ ...item, full_name: names.get(item.profile_id) || '' })), error: null }
        })()
      } else if (isStudent) {
        childRequest = (async () => {
          const { data: learners, error: learnerError } = await supabase.from('students').select('id,admission_number,class_id,profile_id').eq('school_id', profile.school_id).eq('profile_id', profile.id).limit(1)
          if (learnerError || !learners?.length) return { data: learners || [], error: learnerError }
          const { data: owner, error: ownerError } = await supabase.from('profiles').select('id,full_name').eq('id', profile.id).maybeSingle()
          if (ownerError) throw ownerError
          return { data: learners.map(item => ({ ...item, full_name: owner?.full_name || '' })), error: null }
        })()
      }
      const [activityResult, classResult, subjectResult, assignmentResult, childResult] = await Promise.all([activityRequest, classesRequest, subjectsRequest, assignmentsRequest, childRequest])
      if (activityResult.error || classResult.error || subjectResult.error || assignmentResult.error || childResult.error) throw activityResult.error || classResult.error || subjectResult.error || assignmentResult.error || childResult.error
      const nextActivities = activityResult.data || []
      const [registrationResult, attemptResult] = await Promise.all([
        supabase.from('school_activity_registrations').select('id,activity_id,student_id,parent_id,status,registered_at,paid_at').eq('school_id', profile.school_id),
        isFinance
        ? supabase.from('school_activity_payment_attempts').select('tx_ref,activity_id,registration_id,student_id,student_reference,amount,currency_code,status,created_at,flutterwave_transaction_id').eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(300)
          : Promise.resolve({ data: [], error: null })
      ])
      if (registrationResult.error || attemptResult.error) throw registrationResult.error || attemptResult.error
      setActivities(nextActivities)
      setClasses(classResult.data || [])
      setSubjects(subjectResult.data || [])
      setTeacherAssignments(assignmentResult.data || [])
      setChildren(childResult.data || [])
      setRegistrations(registrationResult.data || [])
      setAttempts(attemptResult.data || [])
    } catch (error) {
      setActivities([]); setClasses([]); setSubjects([]); setTeacherAssignments([]); setChildren([]); setRegistrations([]); setAttempts([])
      setLoadError(error?.message || 'Could not load school activities. Check your connection and access.')
    } finally {
      setLoading(false)
    }
  }, [profile?.id, profile?.school_id, role, isParent, isStudent, isFinance, canCreate, demo])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (searchParams.get('payment') !== 'return') return undefined
    toast('Payment submitted. The activity registration will update after the provider verifies it.')
    const timer = window.setTimeout(() => { void load() }, 2500)
    return () => window.clearTimeout(timer)
  }, [load, searchParams])

  const submitActivity = async event => {
    event.preventDefault()
    if (demo) return toast('Demo accounts cannot publish activities.')
    if (!supabase || !profile?.school_id) return toast.error('Connect this school before publishing an activity.')
    if (!canChooseWholeSchool && !form.class_id) return toast.error('Choose one of your assigned classes for this activity.')
    if (form.subject_id && !form.class_id) return toast.error('Choose a class before selecting a subject.')
    const isFree = form.is_free === 'yes'
    const amount = isFree ? null : Number(form.amount)
    if (!isFree && (!Number.isFinite(amount) || amount <= 0)) return toast.error('Enter an activity amount above zero, or mark it free.')
    const start = new Date(form.starts_at)
    const deadline = form.registration_deadline ? new Date(form.registration_deadline) : null
    if (Number.isNaN(start.getTime()) || (deadline && Number.isNaN(deadline.getTime()))) return toast.error('Enter a valid activity date and registration deadline.')
    if (deadline && deadline > start) return toast.error('The registration deadline must be before the activity starts.')
    setSaving(true)
    try {
      const { error } = await supabase.from('school_activities').insert({
        school_id: profile.school_id, created_by: profile.id, title: form.title.trim(),
        description: form.description.trim(), activity_type: form.activity_type,
        starts_at: start.toISOString(), location: form.location.trim(), class_id: form.class_id || null, subject_id: form.subject_id || null,
        registration_deadline: deadline?.toISOString() || null, is_free: isFree, amount,
        currency_code: currency, status: 'published'
      })
      if (error) throw error
      toast.success('Activity published for the school')
      setForm(emptyForm)
      await load()
    } catch (error) {
      toast.error(error?.message || 'Could not publish activity.')
    } finally { setSaving(false) }
  }

  const registerFree = async (activity, learnerId) => {
    if (!supabase || !learnerId) return
    setSaving(true)
    const { error } = await supabase.rpc('register_for_free_school_activity', { p_activity_id: activity.id, p_student_id: learnerId })
    setSaving(false)
    if (error) { toast.error(error.message || 'Could not register for this activity.'); return }
    toast.success('Learner registered for the free activity')
    await load()
  }

  const payForActivity = async (activity, learnerId) => {
    if (!supabase || !learnerId) return
    setSaving(true)
    const { data, error } = await supabase.functions.invoke('start-school-activity-payment', { body: { activity_id: activity.id, student_id: learnerId } })
    setSaving(false)
    if (error || !data?.checkout_url) return toast.error(data?.error || error?.message || 'Could not start activity checkout.')
    window.location.assign(data.checkout_url)
  }

  const learnerLabel = learner => learner?.full_name || (learner?.admission_number ? `Learner ${learner.admission_number}` : `Learner ${learner?.id?.slice(0, 8) || ''}`)
  const classLabel = activity => activity.class_id ? classNames.get(activity.class_id) || 'Assigned class' : 'Whole school'
  const subjectLabel = activity => activity.subject_id ? subjects.find(item => item.id === activity.subject_id)?.name || 'Assigned subject' : ''
  const availableFormSubjects = subjects.filter(subject => form.class_id && (role !== 'teacher' || teacherAssignments.some(item => item.class_id === form.class_id && item.subject_id === subject.id)))
  const getRegistration = (activity, learner) => learner ? registrationsByLearner.get(`${activity.id}:${learner.id}`) : null

  return <main className="school-activities">
    <style>{`.school-activities{max-width:1180px;margin:0 auto;padding:12px 0 38px;color:var(--ink)}.activity-head,.activity-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}.activity-head{margin:6px 0 22px}.activity-head h1{margin:4px 0;font-size:clamp(1.7rem,4vw,2.35rem)}.activity-head p{color:var(--muted);margin:0}.activity-heading{margin:24px 0 12px}.activity-heading h2{margin:3px 0}.activity-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr));gap:14px}.activity-card,.activity-panel{min-width:0;border:1px solid var(--line);border-radius:15px;background:var(--surface,white);padding:18px}.activity-card h3{margin:6px 0 8px;font-size:1.16rem}.activity-card p{margin:8px 0;color:var(--muted);line-height:1.55}.activity-meta{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}.activity-meta span,.activity-tag{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:5px 9px;color:var(--muted);font-size:.8rem}.activity-price{font-weight:750;color:var(--ink)!important}.activity-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.activity-form label{display:grid;gap:5px;color:var(--muted);font-size:.85rem}.activity-form input,.activity-form select,.activity-form textarea,.activity-card select{min-width:0;width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit}.activity-form textarea{min-height:82px;resize:vertical}.activity-form .wide{grid-column:1/-1}.activity-choice{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.activity-choice label{display:flex;align-items:center;gap:6px}.activity-choice input{width:auto}.activity-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:13px}.activity-actions select{max-width:230px}.activity-muted{font-size:.84rem;color:var(--muted)}.activity-error,.activity-empty{padding:18px;border:1px solid var(--line);border-radius:12px;color:var(--muted);background:var(--surface,white)}.activity-table-wrap{max-width:100%;overflow:auto}.activity-table{width:100%;border-collapse:collapse;min-width:620px}.activity-table th,.activity-table td{text-align:left;padding:10px;border-bottom:1px solid var(--line);font-size:.86rem}.activity-table th{color:var(--muted)}.activity-status{text-transform:capitalize}.activity-finance-summary{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.activity-finance-summary article{padding:12px 16px;border:1px solid var(--line);border-radius:11px;background:var(--surface,white);min-width:145px}.activity-finance-summary span,.activity-finance-summary strong{display:block}.activity-finance-summary span{font-size:.8rem;color:var(--muted)}@media(max-width:620px){.school-activities{padding-top:0}.activity-card,.activity-panel{padding:14px}.activity-form{grid-template-columns:1fr}.activity-form .wide{grid-column:auto}.activity-actions>*{flex:1 1 auto}.activity-actions select{max-width:none}}`}</style>
    <header className="activity-head"><div><p className="eyebrow">{school?.name || 'School workspace'}</p><h1>Activities</h1><p>School trips, sports, and other activities with clear registration and payment status.</p></div><button type="button" className="button outline-button" onClick={() => void load()} disabled={loading}>Refresh</button></header>
    {demo && <div className="dashboard-data-note" role="status">Demo view · activity records are not connected.</div>}
    {loadError && <div className="activity-error" role="alert">{loadError}</div>}

    {canCreate && <section className="activity-panel"><div className="activity-heading"><div><p className="eyebrow blue-eyebrow">SCHOOL COMMUNITY</p><h2>Publish an activity</h2></div><span className="activity-muted">Teachers publish to assigned classes. School admins and principals can publish school-wide.</span></div>
      <form className="activity-form" onSubmit={submitActivity}>
        <label>Activity name<input required minLength="3" maxLength="140" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="e.g. Inter-school football day" /></label>
        <label>Activity type<select value={form.activity_type} onChange={event => setForm({ ...form, activity_type: event.target.value })}>{Object.entries(activityTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>When<input required type="datetime-local" value={form.starts_at} onChange={event => setForm({ ...form, starts_at: event.target.value })} /></label>
        <label>Location<input maxLength="240" value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} placeholder="Venue or meeting point" /></label>
        <label>Registration deadline (optional)<input type="datetime-local" value={form.registration_deadline} onChange={event => setForm({ ...form, registration_deadline: event.target.value })} /></label>
        <label>Who can join<select required={!canChooseWholeSchool} value={form.class_id} onChange={event => setForm({ ...form, class_id: event.target.value })}>
          {canChooseWholeSchool && <option value="">Whole school</option>}
          {!canChooseWholeSchool && <option value="">Choose your assigned class</option>}
          {classes.map(item => <option key={item.id} value={item.id}>{item.name}{item.grade ? ` · ${item.grade}` : ''}</option>)}
        </select></label>
        <label>Subject focus (optional)<select value={form.subject_id} disabled={!form.class_id} onChange={event => setForm({ ...form, subject_id: event.target.value })}><option value="">All subjects / general activity</option>{availableFormSubjects.map(item => <option key={item.id} value={item.id}>{item.name}{item.code ? ` · ${item.code}` : ''}</option>)}</select><small>A subject activity is shown to that class and assigned subject teachers.</small></label>
        <fieldset className="activity-choice wide" style={{ border: 0, padding: 0, margin: 0 }}><legend className="activity-muted">Activity fee</legend>
          <label><input type="radio" name="activity-fee" value="yes" checked={form.is_free === 'yes'} onChange={() => setForm({ ...form, is_free: 'yes', amount: '' })} /> Free</label>
          <label><input type="radio" name="activity-fee" value="no" checked={form.is_free === 'no'} onChange={() => setForm({ ...form, is_free: 'no' })} /> Payment required</label>
          {form.is_free === 'no' && <label style={{ maxWidth: 240 }}>Amount per learner ({currency})<input required type="number" min="0.01" max="100000000" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label>}
        </fieldset>
        <label className="wide">Details<textarea maxLength="4000" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="What learners need to know, including what to bring." /></label>
        <div className="wide"><button type="submit" className="button blue-button" disabled={saving || demo}>{saving ? 'Publishing…' : 'Publish activity'}</button></div>
      </form>
    </section>}

    {isFinance && <section className="activity-panel" style={{ marginTop: 16 }}><div className="activity-heading"><div><p className="eyebrow blue-eyebrow">FINANCE</p><h2>Activity collections</h2></div><span className="activity-muted">Payment status is updated only after Flutterwave verification.</span></div>
      <div className="activity-finance-summary"><article><span>Payment attempts</span><strong>{attempts.length}</strong></article><article><span>Verified collections</span><strong>{money(attempts.filter(item => item.status === 'successful').reduce((sum, item) => sum + Number(item.amount || 0), 0), currency)}</strong></article><article><span>Awaiting / failed</span><strong>{attempts.filter(item => item.status !== 'successful').length}</strong></article></div>
      {loading ? <p className="activity-muted">Loading activity payments…</p> : attempts.length === 0 ? <p className="activity-muted">No activity payment attempts yet.</p> : <div className="activity-table-wrap"><table className="activity-table"><thead><tr><th>Activity</th><th>Learner reference</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{attempts.map(item => <tr key={item.tx_ref}><td>{activities.find(activity => activity.id === item.activity_id)?.title || 'School activity'}</td><td>{item.student_reference || item.student_id.slice(0, 8)}</td><td>{money(item.amount, item.currency_code)}</td><td className="activity-status">{item.status}</td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
    </section>}

    <section><div className="activity-heading"><div><p className="eyebrow blue-eyebrow">UPDATES</p><h2>Published activities</h2></div><span className="activity-muted">{activities.length} {activities.length === 1 ? 'activity' : 'activities'}</span></div>
      {loading ? <div className="activity-empty">Loading activities…</div> : !activities.length ? <div className="activity-empty">No activities have been published for your portal yet.</div> : <div className="activity-grid">{activities.map(activity => {
        const eligibleChildren = activity.class_id ? children.filter(item => item.class_id === activity.class_id) : children
        const learner = isParent ? (eligibleChildren.find(item => item.id === selectedChildren[activity.id]) || eligibleChildren[0]) : isStudent ? children[0] : null
        const registration = getRegistration(activity, learner)
        const isClosed = activity.status !== 'published' || new Date(activity.starts_at) <= new Date() || (activity.registration_deadline && new Date(activity.registration_deadline) <= new Date())
        const canRegister = (isParent || isStudent) && learner && !isClosed && !['registered','paid'].includes(registration?.status)
        return <article className="activity-card" key={activity.id}>
          <div className="activity-meta"><span>{activityTypes[activity.activity_type] || 'School activity'}</span><span>{classLabel(activity)}</span>{subjectLabel(activity) && <span>{subjectLabel(activity)}</span>}{activity.status === 'cancelled' && <span>Cancelled</span>}</div>
          <h3>{activity.title}</h3>
          <div className="activity-meta"><span>{localDateTime(activity.starts_at)}</span>{activity.location && <span>{activity.location}</span>}</div>
          <p className="activity-price">{activity.is_free ? 'Free activity' : `${money(activity.amount, activity.currency_code)} per learner`}</p>
          {activity.description && <p>{activity.description}</p>}
          {activity.registration_deadline && <p className="activity-muted">Register by {localDateTime(activity.registration_deadline)}</p>}
          {(canCreate || isFinance) && <p className="activity-muted">{registrations.filter(row => row.activity_id === activity.id && row.status !== 'cancelled').length} learner registration(s)</p>}
          {isParent && <div className="activity-actions"><label className="activity-muted" htmlFor={`learner-${activity.id}`}>Register learner</label><select id={`learner-${activity.id}`} value={learner?.id || ''} onChange={event => setSelectedChildren(current => ({ ...current, [activity.id]: event.target.value }))} disabled={!eligibleChildren.length}><option value="">{eligibleChildren.length ? 'Choose learner' : 'No eligible linked learners'}</option>{eligibleChildren.map(item => <option key={item.id} value={item.id}>{learnerLabel(item)}</option>)}</select></div>}
          {registration && <p className="activity-muted" role="status">{learnerLabel(learner)} · {registration.status === 'pending_payment' ? 'Payment pending verification' : registration.status === 'paid' ? 'Payment confirmed' : registration.status === 'registered' ? 'Registered' : registration.status}</p>}
          {isStudent && !learner && <p className="activity-muted">No learner record is linked to this student account.</p>}
          {canRegister && activity.is_free && <div className="activity-actions"><button type="button" className="button blue-button" disabled={saving} onClick={() => void registerFree(activity, learner.id)}>Register for free</button></div>}
          {canRegister && !activity.is_free && isParent && <div className="activity-actions"><button type="button" className="button blue-button" disabled={saving} onClick={() => void payForActivity(activity, learner.id)}>{registration?.status === 'pending_payment' ? 'Retry payment' : `Pay ${money(activity.amount, activity.currency_code)}`}</button></div>}
          {canRegister && !activity.is_free && isStudent && <p className="activity-muted">Ask your parent or guardian to choose you and complete payment.</p>}
          {isClosed && activity.status === 'published' && <p className="activity-muted">Registration is closed.</p>}
          {activity.status === 'cancelled' && <p className="activity-muted">This activity has been cancelled by the school.</p>}
        </article>
      })}</div>}
    </section>
  </main>
}
