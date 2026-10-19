import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STAGES = [
  { key: 'pending', label: 'Pending', dot: 'bg-amber-400' },
  { key: 'interview', label: 'Interview', dot: 'bg-blue-400' },
  { key: 'accepted', label: 'Accepted', dot: 'bg-emerald-500' },
  { key: 'rejected', label: 'Rejected', dot: 'bg-rose-400' },
  { key: 'enrolled', label: 'Enrolled', dot: 'bg-violet-500' }
]

export default function AdmissionsManager() {
  const { profile, school, demo } = useAuth()
  const [applications, setApplications] = useState([])
  const [classes, setClasses] = useState([])
  const [classByApplication, setClassByApplication] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [loadError, setLoadError] = useState('')

  const fetchApplications = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    if (demo || !supabase) {
      setApplications([])
      setClasses([])
      setLoadError('Connect a school account to load admissions records.')
      setLoading(false)
      return
    }
    if (!profile?.school_id) { setApplications([]); setClasses([]); setLoading(false); return }

    const [applicationResult, classResult] = await Promise.all([
      supabase.from('applications').select('*').eq('school_id', profile.school_id).order('created_at', { ascending: false }),
      supabase.from('classes').select('id,name,grade').eq('school_id', profile.school_id).order('name')
    ])
    if (applicationResult.error) {
      setLoadError(applicationResult.error.message || 'Could not load school applications.')
      setApplications([])
    } else {
      setApplications((applicationResult.data || []).map(application => ({ ...application, status: String(application.status || 'pending').toLowerCase() })))
    }
    if (classResult.error) toast.error(classResult.error.message || 'Could not load school classes')
    setClasses(classResult.data || [])
    setLoading(false)
  }, [demo, profile?.school_id])

  useEffect(() => { void fetchApplications() }, [fetchApplications])

  async function updateStatus(id, status) {
    setBusyId(id)
    if (demo || !supabase) { setBusyId(''); toast.error('Connect a school account to update admissions.'); return }
    const { error } = await supabase.from('applications').update({ status }).eq('id', id).eq('school_id', profile.school_id)
    setBusyId('')
    if (error) { toast.error(error.message || 'Could not update application'); return }
    setApplications(rows => rows.map(application => application.id === id ? { ...application, status } : application))
  }

  async function enrollStudent(application) {
    setBusyId(application.id)
    const classId = classByApplication[application.id] || null
    if (demo || !supabase) { setBusyId(''); toast.error('Connect a school account to enroll a student.'); return }
    const { error } = await supabase.rpc('enroll_school_application', {
      target_application: application.id,
      target_class: classId
    })
    setBusyId('')
    if (error) { toast.error(error.message || 'Could not enroll applicant. Apply the latest admissions migration.'); return }
    setApplications(rows => rows.map(row => row.id === application.id ? { ...row, status: 'enrolled' } : row))
    toast.success(`${application.student_first_name} enrolled successfully`)
  }

  const enrolledCount = applications.filter(application => application.status === 'enrolled').length
  const conversionRate = applications.length ? Math.round((enrolledCount / applications.length) * 100) : 0
  const applicationUrl = school?.slug ? `${window.location.origin}/apply/${school.slug}` : ''

  async function copyApplicationLink() {
    if (!applicationUrl) { toast.error('This school does not have an application link yet.'); return }
    try { await navigator.clipboard.writeText(applicationUrl); toast.success('School application link copied') }
    catch { toast.error(`Copy this link: ${applicationUrl}`) }
  }

  return <main className="admissions-page">
    <style>{`.admissions-page{min-height:100%;padding:clamp(20px,4vw,40px);background:var(--bg);color:var(--ink)}.admissions-shell{max-width:1500px;margin:auto}.admissions-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:26px}.admissions-head h1{margin:0;font-size:clamp(1.8rem,4vw,2.5rem);letter-spacing:-.04em}.admissions-head p{margin:8px 0 0;color:var(--muted)}.admissions-link-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.admissions-link-actions a,.admissions-link-actions button{padding:8px 11px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--school-accent,#2375e1);font-size:.75rem;font-weight:700;text-decoration:none;cursor:pointer}.admissions-kpis{display:flex;gap:10px}.admissions-kpi{min-width:130px;padding:13px 16px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.admissions-kpi small{display:block;color:var(--muted);font-size:.7rem;font-weight:750;letter-spacing:.06em;text-transform:uppercase}.admissions-kpi strong{display:block;margin-top:5px;font-size:1.4rem}.admissions-board{display:grid;grid-template-columns:repeat(5,minmax(235px,1fr));gap:12px;overflow-x:auto;padding:2px 2px 18px}.admissions-column{display:flex;min-height:340px;max-height:calc(100vh - 250px);flex-direction:column;border:1px solid var(--line);border-radius:16px;background:color-mix(in srgb,var(--panel) 78%,var(--bg))}.admissions-column-head{display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid var(--line)}.admissions-column-head h2{display:flex;align-items:center;gap:8px;margin:0;font-size:.9rem}.admissions-column-head h2 i{width:8px;height:8px;border-radius:50%}.admissions-column-head span{display:grid;min-width:24px;height:24px;place-items:center;border-radius:99px;background:var(--bg);color:var(--muted);font-size:.73rem}.admissions-card-list{display:grid;align-content:start;gap:10px;overflow:auto;padding:10px}.admissions-card{padding:14px;border:1px solid var(--line);border-radius:13px;background:var(--panel);box-shadow:0 5px 14px rgba(17,39,61,.04)}.admissions-card h3{margin:0;color:var(--ink);font-size:.95rem}.admissions-card-subtitle{margin:5px 0;color:var(--muted);font-size:.77rem}.admissions-card-meta{display:grid;gap:4px;margin:12px 0;color:var(--muted);font-size:.74rem}.admissions-card-actions{display:flex;flex-wrap:wrap;gap:6px;padding-top:10px;border-top:1px solid var(--line)}.admissions-card-actions button,.admissions-enroll button{padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-size:.7rem;font-weight:700;cursor:pointer}.admissions-card-actions button:hover,.admissions-enroll button:hover{border-color:var(--school-accent,#2375e1)}.admissions-enroll{display:grid;gap:7px;margin:10px 0}.admissions-enroll label{color:var(--muted);font-size:.7rem}.admissions-enroll select{width:100%;box-sizing:border-box;margin-top:4px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}.admissions-enroll button{background:var(--school-accent,#2375e1);color:#fff}.admissions-empty,.admissions-error{padding:24px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);text-align:center}.admissions-error{margin-bottom:14px;border-color:#e59a9a;color:#a13636}@media(max-width:800px){.admissions-head{align-items:flex-start;flex-direction:column}.admissions-kpis{width:100%}.admissions-kpi{flex:1;min-width:0}}`}</style>
    <div className="admissions-shell">
      <header className="admissions-head"><div><p className="eyebrow">STUDENT SERVICES</p><h1>Admissions</h1>{applicationUrl && <div className="admissions-link-actions"><a href={applicationUrl} target="_blank" rel="noreferrer">Preview public form</a><button onClick={() => void copyApplicationLink()}>Copy application link</button></div>}</div><div className="admissions-kpis"><div className="admissions-kpi"><small>Applications</small><strong>{applications.length}</strong></div><div className="admissions-kpi"><small>Enrolled</small><strong>{enrolledCount} · {conversionRate}%</strong></div></div></header>
      {demo && <p className="hr-pill">Demo account · no connected records</p>}
      {loadError && <div className="admissions-error" role="alert">{loadError}</div>}
      {loading ? <div className="admissions-empty" role="status">Loading applications…</div> : <div className="admissions-board">{STAGES.map(stage => {
        const stageApplications = applications.filter(application => application.status === stage.key)
        return <section className="admissions-column" key={stage.key} aria-label={`${stage.label} applications`}>
          <header className="admissions-column-head"><h2><i className={stage.dot}/>{stage.label}</h2><span>{stageApplications.length}</span></header>
          <div className="admissions-card-list">{stageApplications.map(application => <article className="admissions-card" key={application.id}>
            <h3>{application.student_first_name} {application.student_last_name}</h3>
            <p className="admissions-card-subtitle">{application.grade_level}</p>
            <div className="admissions-card-meta"><span>Guardian: {application.parent_name}</span>{application.parent_email && <span>{application.parent_email}</span>}<span>Applied {new Date(application.created_at).toLocaleDateString()}</span></div>
            {stage.key === 'accepted' && <div className="admissions-enroll"><label>Class placement (optional)<select value={classByApplication[application.id] || ''} onChange={event => setClassByApplication(current => ({ ...current, [application.id]: event.target.value }))}><option value="">Assign class later</option>{classes.map(schoolClass => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}{schoolClass.grade ? ` · ${schoolClass.grade}` : ''}</option>)}</select></label><button disabled={busyId === application.id} onClick={() => void enrollStudent(application)}>{busyId === application.id ? 'Enrolling…' : 'Enroll learner'}</button></div>}
            {stage.key !== 'enrolled' && <div className="admissions-card-actions">{STAGES.filter(next => next.key !== stage.key && next.key !== 'enrolled').map(next => <button key={next.key} disabled={busyId === application.id} onClick={() => void updateStatus(application.id, next.key)}>{next.label}</button>)}</div>}
          </article>)}{!stageApplications.length && <div className="admissions-empty">No applications</div>}</div>
        </section>
      })}</div>}
    </div>
  </main>
}
