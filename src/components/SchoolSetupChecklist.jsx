import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const steps = [
  { label: 'School profile', href: '/settings' },
  { label: 'Academic terms', href: '/settings' },
  { label: 'Classes', href: '/school-admin?module=Classes' },
  { label: 'Subjects', href: '/school-admin?module=Subjects' },
  { label: 'Staff accounts', href: '/school-accounts' },
  { label: 'Teacher class & subject assignments', href: '/teacher-loads' },
  { label: 'Learner records', href: '/school-admin?module=Students' },
  { label: 'Family links', href: '/school-admin?module=Student%20guardians' },
  { label: 'Fee payment channels (optional)', href: '/settings', optional: true },
  { label: 'Timetable', href: '/timetable' }
]

export default function SchoolSetupChecklist() {
  const { profile, school, demo } = useAuth()
  const [complete, setComplete] = useState([])
  const [dismissed, setDismissed] = useState(false)
  const [checkError, setCheckError] = useState(false)

  useEffect(() => {
    if (!profile?.school_id || demo || !supabase) return
    let active = true
    const load = async () => {
      const schoolRequest = supabase.from('schools').select('name,country_code,timezone,academic_terms,mobile_money_provider,mobile_money_number,bank_account_number,mpesa_paybill,mpesa_till').eq('id', profile.school_id).maybeSingle()
      const count = table => supabase.from(table).select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id)
      const [schoolResult, classes, subjects, teachers, loads, students, guardians, timetable] = await Promise.all([
        schoolRequest,
        count('classes'),
        count('subjects'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id).eq('role', 'teacher'),
        count('teacher_subject_assignments'),
        count('students'),
        supabase.from('student_guardians').select('student_id,students!inner(school_id)', { count: 'exact', head: true }).eq('students.school_id', profile.school_id),
        count('timetable')
      ])
      if (!active || schoolResult.error) return
      const info = schoolResult.data || {}
      const paymentConfigured = Boolean((info.mobile_money_provider && info.mobile_money_number) || info.bank_account_number || info.mpesa_paybill || info.mpesa_till)
      const done = [Boolean(info.name && info.country_code && info.timezone), Boolean(info.academic_terms?.length >= 2), (classes.count || 0) > 0,
        (subjects.count || 0) > 0, (teachers.count || 0) > 0, (loads.count || 0) > 0, (students.count || 0) > 0,
        (guardians.count || 0) > 0, paymentConfigured, (timetable.count || 0) > 0]
      setComplete(done)
      setCheckError([classes, subjects, teachers, loads, students, guardians, timetable].some(result => result.error))
      setDismissed(done.every((value, index) => value || steps[index].optional))
    }
    void load().catch(() => { if (active) setCheckError(true) })
    return () => { active = false }
  }, [profile?.school_id, demo])

  if (!profile?.school_id || dismissed || demo) return null
  const requiredSteps = steps.filter(step => !step.optional).length
  const finished = steps.filter((step, index) => !step.optional && complete[index]).length
  return <section className="setup-checklist glass-card" aria-labelledby="setup-title">
    <div><p className="eyebrow">GET STARTED</p><h2 id="setup-title">Set up {school?.name || 'your school'}</h2><p>{finished} of {requiredSteps} required setup steps complete</p><progress value={finished} max={requiredSteps} aria-label={`${finished} of ${requiredSteps} required setup steps complete`} />{checkError && <p role="status">Some setup checks could not load. Refresh this page to retry.</p>}</div>
    <ol>{steps.map(({ label, href, optional }, index) => <li key={label} className={complete[index] ? 'setup-done' : ''}><span aria-hidden="true">{complete[index] ? '✓' : '○'}</span><Link to={href}>{label}</Link>{optional && <span className="setup-next">Optional</span>}{!complete[index] && !optional && <span className="setup-next">Set up</span>}</li>)}</ol>
    <style>{`.setup-checklist{display:grid;grid-template-columns:minmax(220px,.8fr) 1.2fr;gap:20px;margin:0 0 22px;padding:20px}.setup-checklist h2{margin:0 0 5px}.setup-checklist p{margin:5px 0;color:var(--muted)}.setup-checklist progress{width:100%;height:9px;accent-color:var(--green)}.setup-checklist ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 16px;margin:0;padding:0;list-style:none}.setup-checklist li{display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--line)}.setup-checklist li>span:first-child{color:var(--green)}.setup-checklist li a{color:var(--ink)}.setup-checklist .setup-done a{text-decoration:line-through;color:var(--muted)}.setup-next{margin-left:auto;color:var(--muted);font-size:12px}@media(max-width:700px){.setup-checklist{grid-template-columns:1fr}.setup-checklist ol{grid-template-columns:1fr}}`}</style>
  </section>
}
