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
  const [verifiedParentIds, setVerifiedParentIds] = useState({})
  const [learners, setLearners] = useState([])
  const [parents, setParents] = useState([])
  const [managedAccounts, setManagedAccounts] = useState([])
  const [changingAccountId, setChangingAccountId] = useState('')
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'student', student_id: '', job_title: '', department: '' })
  const [familyLink, setFamilyLink] = useState({ parent_id: '', student_id: '' })

  const load = useCallback(async () => {
    if (!supabase || !profile?.school_id) { setLoading(false); return }
    setLoading(true)
    const [inviteResult, studentResult, requestResult, classResult, parentResult, accountResult, staffRoleResult, signupStatusResult] = await Promise.all([
      supabase.from('school_portal_invites').select('id,user_id,email,full_name,role,student_id,created_at,accepted_at').eq('school_id', profile.school_id).order('created_at', { ascending: false }),
      supabase.from('students').select('id,admission_number,student_registration_id,profile_id,full_name,class_id').eq('school_id', profile.school_id).order('admission_number'),
      supabase.from('school_portal_signup_requests').select('user_id,full_name,email,requested_role,requested_access,admission_number,requested_class_id,student_registration_id,parent_national_id,created_at').eq('school_id', profile.school_id).eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('classes').select('id,name,grade').eq('school_id', profile.school_id).order('name'),
      supabase.from('profiles').select('id,full_name,email').eq('school_id', profile.school_id).eq('role', 'parent').eq('is_active', true).order('full_name'),
      supabase.from('profiles').select('id,full_name,email,role,is_active').eq('school_id', profile.school_id).in('role', ['teacher', 'staff', 'student', 'parent']).order('full_name'),
      supabase.from('school_staff_role_assignments').select('profile_id,role_key').eq('school_id', profile.school_id),
      supabase.from('school_portal_signup_requests').select('user_id,status').eq('school_id', profile.school_id)
    ])
    if (inviteResult.error) toast.error(`Could not load invitations: ${inviteResult.error.message}`)
    if (studentResult.error) toast.error(`Could not load learners: ${studentResult.error.message}`)
    if (requestResult.error) toast.error(`Could not load registration requests: ${requestResult.error.message}`)
    if (classResult.error) toast.error(`Could not load classes: ${classResult.error.message}`)
    if (parentResult.error) toast.error(`Could not load parent accounts: ${parentResult.error.message}`)
    if (accountResult.error) toast.error(`Could not load school account status: ${accountResult.error.message}`)
    if (staffRoleResult.error) toast.error(`Could not load HR and finance role labels: ${staffRoleResult.error.message}`)
    if (signupStatusResult.error) toast.error(`Could not load account approval status: ${signupStatusResult.error.message}`)
    setInvites(inviteResult.data || [])
    setLearners(studentResult.data || [])
    setSignupRequests(requestResult.data || [])
    setClasses(classResult.data || [])
    setParents(parentResult.data || [])
    const staffRolesByProfile = (staffRoleResult.data || []).reduce((roles, assignment) => {
      roles[assignment.profile_id] ||= []
      roles[assignment.profile_id].push(assignment.role_key)
      return roles
    }, {})
    const approvedUsers = new Set((signupStatusResult.data || []).filter(request => request.status === 'approved').map(request => request.user_id))
    const invitedUsers = new Set((inviteResult.data || []).map(invite => invite.user_id))
    setManagedAccounts((accountResult.data || []).map(account => ({
      ...account,
      specialistRoles: staffRolesByProfile[account.id] || [],
      canReactivate: approvedUsers.has(account.id) || invitedUsers.has(account.id)
    })))
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
    if (approve && request.requested_role === 'parent' && !verifiedParentIds[request.user_id]) return toast.error('Confirm that you checked the parent national ID before approving.')
    if (approve && linkedRole && !studentId) return toast.error(request.requested_role === 'parent' ? 'Verify the parent national ID and select the learner matching the registration ID.' : 'Select the learner record matching the submitted admission number.')
    const { error } = await supabase.rpc(approve ? 'approve_school_portal_signup' : 'reject_school_portal_signup', approve
      ? { p_user_id: request.user_id, p_student_id: linkedRole ? studentId : null }
      : { p_user_id: request.user_id })
    if (error) return toast.error(error.message || 'Could not update this registration request.')
    toast.success(approve ? 'Account approved. The person can now sign in.' : 'Registration request declined.')
    await load()
  }

  async function linkAdditionalLearner(event) {
    event.preventDefault()
    const { error } = await supabase.rpc('admin_link_parent_student', {
      p_parent_id: familyLink.parent_id, p_student_id: familyLink.student_id
    })
    if (error) return toast.error(error.message || 'Could not link the learner to this parent account.')
    toast.success('Learner linked to the parent account.')
    setFamilyLink({ parent_id: '', student_id: '' })
  }

  async function changeAccountAccess(account) {
    const nextActive = !account.is_active
    const action = nextActive ? 'restore access to' : 'deactivate'
    if (!window.confirm(`Are you sure you want to ${action} ${account.full_name || account.email}? ${nextActive ? 'The account must already be verified and approved.' : 'They will lose access to this school immediately. Their records will be kept.'}`)) return
    setChangingAccountId(account.id)
    const { data, error } = await supabase.functions.invoke('manage-school-user', {
      body: { action: 'set-account-active', user_id: account.id, is_active: nextActive }
    })
    if (error || data?.error) toast.error(data?.error || error.message || 'Could not update account access.')
    else {
      toast.success(data?.message || 'Account access updated.')
      await load()
    }
    setChangingAccountId('')
  }

  const displayRole = account => {
    if (account.role === 'staff' && account.specialistRoles?.length) {
      const labels = account.specialistRoles.map(role => role === 'hr_admin' ? 'HR' : role === 'finance_officer' ? 'Finance' : role.replaceAll('_', ' '))
      return `Staff · ${labels.join(', ')}`
    }
    return roleNames[account.role] || account.role
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
      <div><h3 id="school-admissions-link-title">Share your school application link</h3><p>After adding a learner, share their student registration ID with the parent. They use it with their national ID to request a parent account. Review the national ID before approving, then add any later siblings to that parent account below.</p>{admissionsUrl && <a href={admissionsUrl} target="_blank" rel="noreferrer">{admissionsUrl}</a>}</div>
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
          const matchingLearners = learners.filter(learner => request.requested_role === 'parent'
            ? learner.student_registration_id?.trim().toUpperCase() === request.student_registration_id?.trim().toUpperCase()
            : learner.admission_number?.trim().toLowerCase() === request.admission_number?.trim().toLowerCase()
              && (request.requested_role !== 'student' || !learner.profile_id)
              && (!learner.class_id || learner.class_id === request.requested_class_id))
          const requestedClass = classes.find(item => item.id === request.requested_class_id)
          const needsLearnerLink = ['student', 'parent'].includes(request.requested_role)
          const requestedRoleName = request.requested_access === 'hr' ? 'HR & Payroll' : request.requested_access === 'finance' ? 'Finance' : roleNames[request.requested_role] || request.requested_role
          return <article key={request.user_id}><div className="school-signup-request-copy"><b>{request.full_name}</b><small>{request.email}</small><span>{requestedRoleName} · {new Date(request.created_at).toLocaleDateString()}</span>{request.requested_role === 'parent' ? <><small>Student registration ID: {request.student_registration_id || 'Not provided'}</small><small>Parent national ID for verification: {request.parent_national_id || 'Not provided'}</small><label><input type="checkbox" checked={Boolean(verifiedParentIds[request.user_id])} onChange={event => setVerifiedParentIds(current => ({ ...current, [request.user_id]: event.target.checked }))} /> I verified this parent’s national ID</label></> : request.admission_number && <small>Admission number: {request.admission_number}</small>}{requestedClass && <small>Requested class: {requestedClass.name}{requestedClass.grade ? ` · ${requestedClass.grade}` : ''}</small>}</div>{needsLearnerLink && <label>Match learner<select value={requestStudents[request.user_id] || ''} onChange={event => setRequestStudents(current => ({ ...current, [request.user_id]: event.target.value }))}><option value="">Choose matching record</option>{matchingLearners.map(learner => { const learnerClass = classes.find(item => item.id === learner.class_id); return <option key={learner.id} value={learner.id}>{learner.full_name || 'Learner'} · {request.requested_role === 'parent' ? learner.student_registration_id : learner.admission_number}{learnerClass ? ` · ${learnerClass.name}` : ''}</option> })}</select>{!matchingLearners.length && <small>{request.requested_role === 'parent' ? 'No learner matches that registration ID. Check the code with the family and the student record.' : 'No learner record matches this admission number and requested class. Check the student record first.'}</small>}</label>}<div className="school-signup-request-actions"><button type="button" disabled={(needsLearnerLink && !requestStudents[request.user_id]) || (request.requested_role === 'parent' && !verifiedParentIds[request.user_id])} onClick={() => void reviewSignup(request, true)}>Approve</button><button type="button" className="decline" onClick={() => void reviewSignup(request, false)}>Decline</button></div></article>
        })}</div> : <div className="school-account-empty"><b>No pending requests</b><span>Public school account requests appear here.</span></div>}
      </section>

      <section className="school-account-form"><div className="account-section-heading"><span>04</span><div><h3>Add a learner to a parent account</h3><p>Use this when an approved parent later needs another child added.</p></div></div>
        <form onSubmit={event => void linkAdditionalLearner(event)}>
          <label>Parent account<select required value={familyLink.parent_id} onChange={event => setFamilyLink(current => ({ ...current, parent_id: event.target.value }))}><option value="">Choose an active parent</option>{parents.map(parent => <option key={parent.id} value={parent.id}>{parent.full_name || parent.email}</option>)}</select></label>
          <label>Student<select required value={familyLink.student_id} onChange={event => setFamilyLink(current => ({ ...current, student_id: event.target.value }))}><option value="">Choose a learner</option>{learners.map(learner => <option key={learner.id} value={learner.id}>{learner.full_name || 'Learner'} · {learner.student_registration_id}</option>)}</select></label>
          <button className="button blue-button" type="submit" disabled={!familyLink.parent_id || !familyLink.student_id}>Link learner</button>
        </form>
      </section>

      <section className="school-account-list"><div className="account-section-heading"><span>03</span><div><h3>Invitations</h3></div><button type="button" onClick={load} disabled={loading} aria-label="Refresh invitations">Refresh</button></div>
        {!supabase ? <div className="school-account-empty">Connect Supabase to view invites.</div> : loading ? <div className="school-account-empty">Loading…</div> : invites.length ? <div className="school-invite-list">{invites.map(invite => <article key={invite.id}><span className="school-invite-avatar">{invite.full_name?.slice(0, 1).toUpperCase() || '?'}</span><div className="school-invite-copy"><b>{invite.full_name || 'New account'}</b><small>{invite.email}</small></div><span className="school-invite-role">{roleNames[invite.role] || invite.role}</span><span className={`school-invite-status ${invite.accepted_at ? 'accepted' : ''}`}>{invite.accepted_at ? 'Joined' : 'Sent'}</span></article>)}</div> : <div className="school-account-empty"><b>No invites yet</b><span>Invited accounts appear here.</span></div>}
      </section>

      <section className="school-account-list school-managed-accounts"><div className="account-section-heading"><span>05</span><div><h3>Account access</h3><p>Deactivate or restore parent, student, teacher, HR, finance, and staff accounts in this school. Records remain available to authorized school staff.</p></div><button type="button" onClick={load} disabled={loading} aria-label="Refresh school accounts">Refresh</button></div>
        {!supabase ? <div className="school-account-empty">Connect Supabase to manage school account access.</div> : loading ? <div className="school-account-empty">Loading accounts…</div> : managedAccounts.length ? <div className="school-managed-account-list">{managedAccounts.map(account => <article key={account.id}>
          <span className={`school-managed-status ${account.is_active ? 'active' : 'inactive'}`}>{account.is_active ? 'Active' : 'Inactive'}</span>
          <div className="school-managed-account-copy"><b>{account.full_name || 'School account'}</b><small>{account.email || 'No email on file'}</small></div>
          <span className="school-invite-role">{displayRole(account)}</span>
          {account.is_active || account.canReactivate ? <button type="button" className={account.is_active ? 'deactivate' : 'reactivate'} disabled={changingAccountId === account.id} onClick={() => void changeAccountAccess(account)}>{changingAccountId === account.id ? 'Updating…' : account.is_active ? 'Deactivate' : 'Restore access'}</button> : <span className="school-account-status-note">Approval required</span>}
        </article>)}</div> : <div className="school-account-empty"><b>No portal accounts yet</b><span>Approved or invited school accounts will appear here.</span></div>}
      </section>
    </div>
  </main>
}
