import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ModulePanel from '../components/ModulePanel'
import TeacherAttendance from './TeacherAttendance'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const moduleTables = {
  'My classes': 'classes', 'My subjects': 'subjects', Assignments: 'assignments', Students: 'students',
  Exams: 'exams', Results: 'results', 'Class performance': 'results', 'Behavior Log': 'behavior_records',
  Announcements: 'announcements'
}

export default function TeacherWorkspace() {
  const { profile, demo } = useAuth()
  const [params] = useSearchParams()
  const selected = params.get('module') || 'Dashboard'
  const [stats, setStats] = useState({ classes: '—', students: '—', assignments: '—', attendance: '—' })

  useEffect(() => {
    if (!profile?.school_id || !supabase || demo) return
    let active = true
    const load = async () => {
      const today = new Intl.DateTimeFormat('en-CA').format(new Date())
      const { data: classes } = await supabase.from('classes').select('id').eq('school_id', profile.school_id).eq('teacher_id', profile.id)
      const classIds = (classes || []).map(row => row.id)
      const [students, assignments, attendance] = await Promise.all([
        classIds.length ? supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id).in('class_id', classIds) : Promise.resolve({ count: 0 }),
        supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id).eq('created_by', profile.id),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('school_id', profile.school_id).eq('recorded_by', profile.id).eq('attendance_date', today)
      ])
      if (active) setStats({ classes: String(classIds.length), students: String(students.count || 0), assignments: String(assignments.count || 0), attendance: String(attendance.count || 0) })
    }
    void load()
    return () => { active = false }
  }, [profile?.id, profile?.school_id, demo])

  if (selected === 'Take attendance') return <TeacherAttendance />
  if (moduleTables[selected]) return <ModulePanel table={moduleTables[selected]} profile={profile} canCreate={['Assignments','Exams','Announcements'].includes(selected)} />
  if (selected !== 'Dashboard') return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 32 }}><p>Choose a teaching tool from the navigation.</p></main>

  const metrics = [['My classes', stats.classes], ['Students in my classes', stats.students], ['Assignments I created', stats.assignments], ['Attendance records today', stats.attendance]]
  return <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px' }}>
    <p className="eyebrow">Teaching workspace</p><h1>Welcome, {profile?.full_name?.split(' ')[0] || 'Teacher'}</h1>
    <p>Plan lessons, support your classes, assess progress, and keep families informed from one workspace.</p>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, margin: '24px 0' }}>{metrics.map(([label, value]) => <article className="panel" key={label} style={{ padding: 18 }}><small>{label}</small><h2 style={{ margin: '8px 0 0' }}>{value}</h2></article>)}</section>
    <h2>Teaching tools</h2><section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
      {[
        ['Classes & students', '/teacher?module=My classes', 'Open assigned classes and class lists.'],
        ['Take attendance', '/teacher?module=Take%20attendance', 'Record student attendance for your classes.'],
        ['Assignments', '/teacher-assignments', 'Create classwork and review submissions.'],
        ['Gradebook', '/gradebook', 'Review scores and academic progress.'],
        ['Lesson plans', '/lessons', 'Prepare and organize lessons.'],
        ['Timetable', '/timetable', 'View assigned lessons and the school schedule.'],
        ['Quizzes & courses', '/quizzes', 'Build practice activities and learning content.'],
        ['Staff portals', '/staff-portals', 'Open additional tools granted for your school responsibilities.']
      ].map(([title, href, description]) => <Link className="panel" key={title} to={href} style={{ display: 'block', padding: 18, color: 'inherit', textDecoration: 'none' }}><h3 style={{ margin: '0 0 8px' }}>{title}</h3><p style={{ margin: 0, color: 'var(--muted)' }}>{description}</p></Link>)}
    </section>
  </main>
}
