import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ModulePanel from '../components/ModulePanel'
import TeacherAttendance from './TeacherAttendance'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import '../styles/teacher-workspace.css'

const moduleTables = {
  'My classes': 'classes', 'My subjects': 'subjects', Assignments: 'assignments', Students: 'students',
  Exams: 'exams', Results: 'results', 'Class performance': 'results', 'Behavior Log': 'behavior_records',
  Announcements: 'announcements'
}

const demoStats = { classes: '4', students: '96', assignments: '8', attendance: '24' }

export default function TeacherWorkspace() {
  const { profile, demo, school } = useAuth()
  const [params] = useSearchParams()
  const selected = params.get('module') || 'Dashboard'
  const [stats, setStats] = useState(demo ? demoStats : { classes: '—', students: '—', assignments: '—', attendance: '—' })
  const [loading, setLoading] = useState(!demo)

  useEffect(() => {
    if (demo) {
      setStats(demoStats)
      setLoading(false)
      return
    }
    if (!profile?.school_id || !supabase) { setLoading(false); return }
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: school?.timezone || 'Africa/Nairobi' }).format(new Date())
        const [classResult, subjectResult] = await Promise.all([
          supabase.from('classes').select('id').eq('school_id', profile.school_id).eq('teacher_id', profile.id),
          supabase.from('teacher_subject_assignments').select('class_id').eq('school_id', profile.school_id).eq('teacher_id', profile.id)
        ])
        if (classResult.error || subjectResult.error) throw classResult.error || subjectResult.error
        const classIds = [...new Set([...(classResult.data || []).map(row => row.id), ...(subjectResult.data || []).map(row => row.class_id)])]
        const [students, assignments, attendance] = await Promise.all([
          classIds.length ? supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id).in('class_id', classIds) : Promise.resolve({ count: 0 }),
          supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id).eq('created_by', profile.id),
          supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id).eq('recorded_by', profile.id).eq('attendance_date', today)
        ])
        if (students.error || assignments.error || attendance.error) throw students.error || assignments.error || attendance.error
        if (active) setStats({ classes: String(classIds.length), students: String(students.count || 0), assignments: String(assignments.count || 0), attendance: String(attendance.count || 0) })
      } catch (error) {
        console.error('Unable to load teacher dashboard:', error.message)
        if (active) setStats({ classes: '—', students: '—', assignments: '—', attendance: '—' })
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [profile?.id, profile?.school_id, demo, school?.timezone])

  if (selected === 'Take attendance') return <TeacherAttendance />
  if (moduleTables[selected]) return <ModulePanel table={moduleTables[selected]} profile={profile} canCreate={['Assignments','Exams','Announcements'].includes(selected)} />
  if (selected !== 'Dashboard') return <main className="teacher-dashboard"><p>Choose a teaching tool from the navigation.</p></main>

  const metrics = [
    ['My classes', stats.classes, 'Assigned learning groups', '▦'],
    ['Students', stats.students, 'Across your classes', '♧'],
    ['Assignments created', stats.assignments, 'Classwork you have set', '✎'],
    ['Attendance today', stats.attendance, 'Records entered by you', '✓']
  ]
  const tools = [
    ['Classes & students', '/teacher?module=My classes', 'Open your assigned classes and learner lists.', '▦'],
    ['Take attendance', '/teacher?module=Take%20attendance', 'Record who is present, late, or away.', '✓'],
    ['Assignments', '/teacher-assignments', 'Set classwork and review learner submissions.', '✎'],
    ['Gradebook', '/gradebook', 'Review scores and follow academic progress.', '▤'],
    ['Lesson plans', '/lessons', 'Prepare and organize upcoming lessons.', '▧'],
    ['Timetable', '/timetable', 'See your lessons and the school schedule.', '◷'],
    ['Quizzes & courses', '/quizzes', 'Build practice activities and learning content.', '◇'],
    ['Staff portals', '/staff-portals', 'Open other tools enabled for your responsibilities.', '＋']
  ]

  return <main className="teacher-dashboard">
    <section className="teacher-welcome">
      <div className="teacher-welcome-copy">
        <p className="teacher-eyebrow">TEACHING WORKSPACE{demo && <span className="teacher-demo-badge">DEMO DATA</span>}</p>
        <h1>Welcome, {profile?.full_name?.split(' ')[0] || 'Teacher'}</h1>
        <p>Plan lessons, support your classes, and keep learning on track from one workspace.</p>
      </div>
      <div className="teacher-welcome-mark" aria-hidden="true">✦</div>
    </section>

    <section className="teacher-metrics" aria-label="Teaching overview">
      {metrics.map(([label, value, hint, icon]) => <article className="teacher-metric" key={label}>
        <div className="teacher-metric-top"><span>{label}</span><i aria-hidden="true">{icon}</i></div>
        <strong aria-live="polite">{loading ? '…' : value}</strong>
        <small>{hint}</small>
      </article>)}
    </section>

    <div className="teacher-section-heading"><div><p className="teacher-eyebrow">YOUR WORKSPACE</p><h2>Teaching tools</h2></div><span>Choose a task to get started</span></div>
    <section className="teacher-tools">
      {tools.map(([title, href, description, icon]) => <Link className="teacher-tool" key={title} to={href}>
        <span className="teacher-tool-icon" aria-hidden="true">{icon}</span><span className="teacher-tool-text"><strong>{title}</strong><small>{description}</small></span><span className="teacher-tool-arrow" aria-hidden="true">↗</span>
      </Link>)}
    </section>
  </main>
}
