import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const roleNames = { teacher: 'Teacher', staff: 'Staff member', student: 'Student', parent: 'Parent' }

export default function SchoolAccounts() {
  const { profile, school } = useAuth()
  const [invites, setInvites] = useState([])
  const [learners, setLearners] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'student', student_id: '', job_title: '', department: '' })

  const load = useCallback(async () => {
    if (!supabase || !profile?.school_id) { setLoading(false); return }
    setLoading(true)
    const [inviteResult, studentResult] = await Promise.all([
      supabase.from('school_portal_invites').select('id,email,full_name,role,student_id,created_at,accepted_at').eq('school_id', profile.school_id).order('created_at', { ascending: false }),
      supabase.from('students').select('id,admission_number,profile_id').eq('school_id', profile.school_id).order('admission_number')
    ])
    if (inviteResult.error) toast.error(`Could not load invitations: ${inviteResult.error.message}`)
    if (studentResult.error) toast.error(`Could not load learners: ${studentResult.error.message}`)
    setInvites(inviteResult.data || [])
    setLearners(studentResult.data || [])
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

  const needsLearner = form.role === 'student' || form.role === 'parent'
  const isStaff = form.role === 'staff'
  const availableLearners = learners.filter(learner => form.role !== 'student' || !learner.profile_id)

  return <main className="school-accounts">
    <header className="school-accounts-heading"><div><p className="eyebrow blue-eyebrow">{school?.name || 'YOUR SCHOOL'} PORTAL ACCESS</p><h2>Manage school accounts</h2><p>Invite teachers, non-teaching staff, students, and parents into this school’s separate role portals.</p></div></header>
    <div className="school-accounts-grid">
      <section className="school-account-form"><div className="account-section-heading"><span>01</span><div><h3>Invite someone</h3><p>They receive a secure email link to set their password.</p></div></div>
        <form onSubmit={sendInvite}>
          <label>Full name<input required minLength="2" maxLength="160" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Person’s name" /></label>
          <label>Email address<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></label>
          <label>Portal role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value, student_id: '' })}><option value="student">Student</option><option value="parent">Parent / guardian</option><option value="teacher">Teacher</option><option value="staff">Non-teaching staff</option></select></label>
          {isStaff && <><label>Job title<input required minLength="2" maxLength="120" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. School receptionist" /></label><label>Department <span>(optional)</span><input maxLength="100" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="e.g. Administration" /></label></>}
          {needsLearner && <label>{form.role === 'student' ? 'Student record' : 'Link parent to learner'}<select required value={form.student_id} onChange={e => setForm({ ...form, student_id: e.target.value })}><option value="">Choose a learner</option>{availableLearners.map(learner => <option key={learner.id} value={learner.id}>{learner.admission_number || 'Student'}{form.role === 'student' && learner.profile_id ? ' (account linked)' : ''}</option>)}</select>{!availableLearners.length && <small>{form.role === 'student' ? 'Add the student record first from the Students section.' : 'Add a student record first.'}</small>}</label>}
          <div className="school-account-role-note"><b>{roleNames[form.role]} portal</b><span>{form.role === 'teacher' ? 'Access to teaching tools for this school.' : isStaff ? 'A separate dashboard for personal details, approved payslips, and leave requests.' : form.role === 'student' ? 'The invite is linked to the selected learner record.' : 'The invite is linked to the selected child.'}</span></div>
          <button className="button blue-button" type="submit" disabled={sending || !supabase || (needsLearner && !availableLearners.length)}>{sending ? 'Sending invitation...' : 'Send portal invitation'}</button>
        </form>
      </section>

      <section className="school-account-list"><div className="account-section-heading"><span>02</span><div><h3>Invitations</h3><p>Accounts are limited to this school workspace.</p></div><button type="button" onClick={load} disabled={loading} aria-label="Refresh invitations">Refresh</button></div>
        {!supabase ? <div className="school-account-empty">Connect Supabase to see school invitations.</div> : loading ? <div className="school-account-empty">Loading invitations…</div> : invites.length ? <div className="school-invite-list">{invites.map(invite => <article key={invite.id}><span className="school-invite-avatar">{invite.full_name.slice(0, 1).toUpperCase()}</span><div className="school-invite-copy"><b>{invite.full_name}</b><small>{invite.email}</small></div><span className="school-invite-role">{roleNames[invite.role] || invite.role}</span><span className={`school-invite-status ${invite.accepted_at ? 'accepted' : ''}`}>{invite.accepted_at ? 'Joined' : 'Invite sent'}</span></article>)}</div> : <div className="school-account-empty"><b>No portal invitations yet</b><span>Invited teachers, non-teaching staff, students, and parents will appear here.</span></div>}
      </section>
    </div>
  </main>
}
