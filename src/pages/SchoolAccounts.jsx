import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const roleNames = { teacher: 'Teacher', staff: 'Staff member', student: 'Student', parent: 'Parent' }

export default function SchoolAccounts() {
  const { profile, school } = useAuth()
  const [invites, setInvites] = useState([])
  const [signupRequests, setSignupRequests] = useState([])
  const [requestStudents, setRequestStudents] = useState({})
  const [learners, setLearners] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'student', student_id: '', job_title: '', department: '' })

  const load = useCallback(async () => {
    if (!supabase || !profile?.school_id) { setLoading(false); return }
    setLoading(true)
    const [inviteResult, studentResult, requestResult, classResult] = await Promise.all([
      supabase.from('school_portal_invites').select('id,email,full_name,role,student_id,created_at,accepted_at').eq('school_id', profile.school_id).order('created_at', { ascending: false }),
      supabase.from('students').select('id,admission_number,profile_id,full_name').eq('school_id', profile.school_id).order('admission_number'),
      supabase.from('school_portal_signup_requests').select('user_id,full_name,email,requested_role,requested_access,admission_number,requested_class_id,created_at').eq('school_id', profile.school_id).eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('classes').select('id,name,grade').eq('school_id', profile.school_id).order('name')
    ])
    if (inviteResult.error) toast.error(`Could not load invitations: ${inviteResult.error.message}`)
    if (studentResult.error) toast.error(`Could not load learners: ${studentResult.error.message}`)
    if (requestResult.error) toast.error(`Could not load registration requests: ${requestResult.error.message}`)
    if (classResult.error) toast.error(`Could not load classes: ${classResult.error.message}`)
    setInvites(inviteResult.data || [])
    setLearners(studentResult.data || [])
    setSignupRequests(requestResult.data || [])
    setClasses(classResult.data || [])
    setLoading(false)
  }, [profile?.school_id])

  useEffect(() => { load() }, [load])

  async function sendInvite(event) {
    event.preventDefault()
    if (!supabase) return toast.error('Connect Supabase before managing portal accounts.')
    setSending(true)
    const { data, error } = await supabase.functions.invoke('manage-school-user', { body: form })
    if (error || data?.error) toast.error(data?.error || error.message || 'Could not send invitation.')
    else {
      toast.success(data?.message || 'Portal invitation sent.')
      setForm({ full_name: '', email: '', role: 'student', student_id: '', job_title: '', department: '' })
      await load()
    }
    setSending(false)
  }

  async function reviewSignup(request, approve) {
    if (!supabase) return toast.error('Connect Supabase before reviewing requests.')
    const linkedRole = ['student', 'parent'].includes(request.requested_role)
    const studentId = requestStudents[request.user_id] || ''
    if (approve && linkedRole && !studentId) return toast.error('Select the learner record matching the submitted admission number.')
    const { error } = await supabase.rpc(approve ? 'approve_school_portal_signup' : 'reject_school_portal_signup', approve
      ? { p_user_id: request.user_id, p_student_id: linkedRole ? studentId : null }
      : { p_user_id: request.user_id })
    if (error) return toast.error(error.message || 'Could not update this registration request.')
    toast.success(approve ? 'Account approved. The person can now sign in.' : 'Registration request declined.')
    await load()
  }

  const admissionsUrl = school?.slug ? `${window.location.origin}/apply/${encodeURIComponent(school.slug)}` : ''

  async function copyAdmissionsUrl() {
    if (!admissionsUrl) return toast.error('This school does not have an application link yet.')
    try {
      await navigator.clipboard.writeText(admissionsUrl)
      toast.success('School application link copied.')
    } catch {
      toast.error(`Copy this link: ${admissionsUrl}`)
    }
  }

  const needsLearner = form.role === 'student' || form.role === 'parent'
  const isStaff = form.role === 'staff'
  const availableLearners = learners.filter(learner => form.role !== 'student' || !learner.profile_id)

  return <main className="school-accounts">
    <header className="school-accounts-heading"><div><p className="eyebrow blue-eyebrow">{school?.name || 'YOUR SCHOOL'} PORTAL ACCESS</p><h2>Manage school accounts</h2><p>Review public account requests or invite people directly. New requests stay inactive until this school approves them; every account remains assigned to this school.</p></div></header>
    <section className="school-admissions-link" aria-labelledby="school-admissions-link-title">
      <div><h3 id="school-admissions-link-title">Share your school application link</h3><p>Families can apply to this school here. After you accept and enroll a learner, invite the learner and their guardian below to create their school portal accounts.</p>{admissionsUrl && <a href={admissionsUrl} target="_blank" rel="noreferrer">{admissionsUrl}</a>}</div>
      <button type="button" onClick={() => void copyAdmissionsUrl()} disabled={!admissionsUrl}>Copy application link</button>
    </section>
    <div className="school-accounts-grid">
      <section className="school-account-form"><div className="account-section-heading"><span>01</span><div><h3>Invite someone</h3></div></div>
        <form onSubmit={sendInvite}>
          <label>Full name<input required minLength="2" maxLength="160" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Person’s name" /></label>
          <label>Email address<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></label>
          <label>Portal role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value, student_id: '' })}><option value="student">Student</option><option value="parent">Parent / guardian</option><option value="teacher">Teacher</option><option value="staff">Non-teaching staff</option></select></label>
          {isStaff && <><label>Job title<input required minLength="2" maxLength="120" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. School receptionist" /></label><label>Department <span>(optional)</span><input maxLength="100" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="e.g. Administration" /></label></>}
          {needsLearner && <label>{form.role === 'student' ? 'Student record' : 'Link parent to learner'}<select required value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}><option value="">Choose a learner</option>{availableLearners.map(learner => <option key={learner.id} value={learner.id}>{learner.admission_number || 'Student'}{form.role === 'student' && learner.profile_id ? ' (account linked)' : ''}</option>)}</select>{!availableLearners.length && <small>{form.role === 'student' ? 'Add the student record first from the Students section.' : 'Add a student record first.'}</small>}</label>}
          <div className="school-account-role-note"><b>{roleNames[form.role]} portal</b><span>{form.role === 'teacher' ? 'Teaching tools.' : isStaff ? 'Payslips and leave.' : form.role === 'student' ? 'Linked to this student record.' : 'Linked to this child.'}</span></div>
          <button className="button blue-button" type="submit" disabled={sending || !supabase || (needsLearner && !availableLearners.length)}>{sending ? 'Sending…' : 'Send invite'}</button>
        </form>
      </section>

      <section className="school-account-list"><div className="account-section-heading"><span>02</span><div><h3>Registration requests</h3></div><button type="button" onClick={load} disabled={loading} aria-label="Refresh registration requests">Refresh</button></div>
        {!supabase ? <div className="school-account-empty">Connect Supabase to review requests.</div> : loading ? <div className="school-account-empty">Loading…</div> : signupRequests.length ? <div className="school-signup-request-list">{signupRequests.map(request => {
          const matchingLearners = learners.filter(learner => learner.admission_number?.trim().toLowerCase() === request.admission_number?.trim().toLowerCase() && (request.requested_role !== 'student' || !learner.profile_id) && (!learner.class_id || learner.class_id === request.requested_class_id))
          const requestedClass = classes.find(item => item.id === request.requested_class_id)
          const needsLearnerLink = ['student', 'parent'].includes(request.requested_role)
          const requestedRoleName = request.requested_access === 'hr' ? 'HR & Payroll' : request.requested_access === 'finance' ? 'Finance' : roleNames[request.requested_role] || request.requested_role
          return <article key={request.user_id}><div className="school-signup-request-copy"><b>{request.full_name}</b><small>{request.email}</small><span>{requestedRoleName} · {new Date(request.created_at).toLocaleDateString()}</span>{request.admission_number && <small>Admission number: {request.admission_number}</small>}{requestedClass && <small>Requested class: {requestedClass.name}{requestedClass.grade ? ` · ${requestedClass.grade}` : ''}</small>}</div>{needsLearnerLink && <label>Match learner<select value={requestStudents[request.user_id] || ''} onChange={event => setRequestStudents(current => ({ ...current, [request.user_id]: event.target.value }))}><option value="">Choose matching record</option>{matchingLearners.map(learner => { const learnerClass = classes.find(item => item.id === learner.class_id); return <option key={learner.id} value={learner.id}>{learner.full_name || 'Learner'} · {learner.admission_number}{learnerClass ? ` · ${learnerClass.name}` : ''}</option> })}</select>{!matchingLearners.length && <small>No learner record matches this admission number and requested class. Check the student record first.</small>}</label>}<div className="school-signup-request-actions"><button type="button" disabled={needsLearnerLink && !requestStudents[request.user_id]} onClick={() => void reviewSignup(request, true)}>Approve</button><button type="button" className="decline" onClick={() => void reviewSignup(request, false)}>Decline</button></div></article>
        })}</div> : <div className="school-account-empty"><b>No pending requests</b><span>Public school account requests appear here.</span></div>}
      </section>

      <section className="school-account-list"><div className="account-section-heading"><span>03</span><div><h3>Invitations</h3></div><button type="button" onClick={load} disabled={loading} aria-label="Refresh invitations">Refresh</button></div>
        {!supabase ? <div className="school-account-empty">Connect Supabase to view invites.</div> : loading ? <div className="school-account-empty">Loading…</div> : invites.length ? <div className="school-invite-list">{invites.map(invite => <article key={invite.id}><span className="school-invite-avatar">{invite.full_name?.slice(0, 1).toUpperCase() || '?'}</span><div className="school-invite-copy"><b>{invite.full_name || 'New account'}</b><small>{invite.email}</small></div><span className="school-invite-role">{roleNames[invite.role] || invite.role}</span><span className={`school-invite-status ${invite.accepted_at ? 'accepted' : ''}`}>{invite.accepted_at ? 'Joined' : 'Sent'}</span></article>)}</div> : <div className="school-account-empty"><b>No invites yet</b><span>Invited accounts appear here.</span></div>}
      </section>
    </div>
  </main>
}
