import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { cacheOfflineClasses, cacheOfflineRoster, getOfflineClasses, getOfflineRoster, queueOfflineWrite, syncOfflineWrites } from '../lib/offlineQueue'
import toast from 'react-hot-toast'
import '../styles/teacher-attendance.css'

const today = (timezone = 'Africa/Nairobi') => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
const attendanceStates = ['present', 'absent', 'late', 'excused']

export default function TeacherAttendance() {
  const { profile, school, demo } = useAuth()
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(() => today(school?.timezone))
  const [students, setStudents] = useState([])
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [loadError, setLoadError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const syncPending = useCallback(async () => {
    if (!supabase || !profile?.id || !navigator.onLine) return
    try {
      const count = await syncOfflineWrites({ ownerId: profile.id, supabase })
      if (count) toast.success(`${count} offline attendance or grade entr${count === 1 ? 'y' : 'ies'} synced.`)
    } catch (error) {
      toast.error(`Offline work is still waiting to sync: ${error.message}`)
    }
  }, [profile?.id])

  useEffect(() => {
    void syncPending()
    window.addEventListener('online', syncPending)
    return () => window.removeEventListener('online', syncPending)
  }, [syncPending])

  useEffect(() => {
    let cancelled = false
    const loadClasses = async () => {
      if (!profile?.school_id || !supabase) { setLoading(false); return }
      setLoading(true)
      setLoadError('')
      try {
        if (!navigator.onLine) {
          const cached = await getOfflineClasses({ ownerId: profile.id, schoolId: profile.school_id })
          if (!cancelled && cached?.classes) {
            setClasses(cached.classes)
            setClassId(current => cached.classes.some(item => item.id === current) ? current : cached.classes[0]?.id || '')
            setLoading(false)
            return
          }
          throw new Error('Connect once to load your assigned classes for offline use.')
        }
        const [owned, assigned] = await Promise.all([
          supabase.from('classes').select('id,name').eq('school_id', profile.school_id).eq('teacher_id', profile.id),
          supabase.from('teacher_subject_assignments').select('class_id').eq('school_id', profile.school_id).eq('teacher_id', profile.id),
        ])
        if (owned.error) throw owned.error
        if (assigned.error) throw assigned.error
        const ids = [...new Set([...(owned.data || []).map(row => row.id), ...(assigned.data || []).map(row => row.class_id)])]
        const assignedClasses = ids.length ? await supabase.from('classes').select('id,name').eq('school_id', profile.school_id).in('id', ids) : { data: [], error: null }
        if (assignedClasses.error) throw assignedClasses.error
        if (cancelled) return
        setClasses(assignedClasses.data || [])
        setClassId(current => ids.includes(current) ? current : ids[0] || '')
        void cacheOfflineClasses({ ownerId: profile.id, schoolId: profile.school_id, classes: assignedClasses.data || [] }).catch(() => {})
      } catch (error) {
        if (!cancelled) setLoadError(error.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (demo) {
      setClasses([])
      setClassId('')
      setLoading(false)
      return () => { cancelled = true }
    }
    void loadClasses()
    return () => { cancelled = true }
  }, [profile?.id, profile?.school_id, demo, retryKey])

  useEffect(() => {
    let cancelled = false
    const loadRoster = async () => {
      if (demo) {
        setStudents([])
        setStatuses({})
        setLoading(false)
        return () => { cancelled = true }
      }
      if (!classId || !profile?.school_id || !supabase) { setStudents([]); return }
      setLoading(true)
      setLoadError('')
      try {
        if (!navigator.onLine) {
          const cached = await getOfflineRoster({ ownerId: profile.id, schoolId: profile.school_id, classId, date })
          if (!cached || cancelled) throw new Error('This class and date need to be opened once online before offline use.')
          setStudents(cached.students)
          setStatuses(cached.statuses)
          setLoading(false)
          return
        }
        const [roster, saved] = await Promise.all([
          supabase.from('students').select('id,admission_number,profiles:profile_id(full_name)').eq('school_id', profile.school_id).eq('class_id', classId).order('admission_number'),
          supabase.from('attendance').select('student_id,status').eq('school_id', profile.school_id).eq('class_id', classId).eq('attendance_date', date),
        ])
        if (roster.error) throw roster.error
        if (saved.error) throw saved.error
        if (cancelled) return
        setStudents(roster.data || [])
        const previous = Object.fromEntries((saved.data || []).map(row => [row.student_id, row.status]))
        const nextStatuses = Object.fromEntries((roster.data || []).map(student => [student.id, previous[student.id] || 'present']))
        setStatuses(nextStatuses)
        void cacheOfflineRoster({ ownerId: profile.id, schoolId: profile.school_id, classId, date, students: roster.data || [], statuses: nextStatuses }).catch(() => {})
      } catch (error) {
        if (!cancelled) setLoadError(error.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadRoster()
    return () => { cancelled = true }
  }, [classId, date, profile?.school_id, demo, retryKey])

  const counts = useMemo(() => attendanceStates.reduce((result, state) => ({ ...result, [state]: Object.values(statuses).filter(value => value === state).length }), {}), [statuses])

  async function saveAttendance() {
    if (!students.length) return
    if (demo) { toast.error('Connect a school account to record attendance.'); return }
    setSaving(true)
    const payload = students.map(student => ({
      school_id: profile.school_id,
      class_id: classId,
      student_id: student.id,
      attendance_date: date,
      status: statuses[student.id] || 'present',
      recorded_by: profile.id,
    }))
    try {
      if (!navigator.onLine) {
        await queueOfflineWrite({ ownerId: profile.id, schoolId: profile.school_id, table: 'attendance', payload })
        void cacheOfflineRoster({ ownerId: profile.id, schoolId: profile.school_id, classId, date, students, statuses }).catch(() => {})
        toast.success('Attendance saved on this device. It will sync when you reconnect.')
        return
      }
      if (!supabase || demo) { toast.error('Connect a school account to save attendance.'); return }
      const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'student_id,attendance_date' })
      if (error) throw error
      toast.success(`Attendance saved for ${students.length} learners.`)
    } catch (error) {
      if (!navigator.onLine) {
        try {
          await queueOfflineWrite({ ownerId: profile.id, schoolId: profile.school_id, table: 'attendance', payload })
          void cacheOfflineRoster({ ownerId: profile.id, schoolId: profile.school_id, classId, date, students, statuses }).catch(() => {})
          toast.success('Connection dropped. Attendance is queued on this device.')
        } catch (queueError) { toast.error(`Could not save offline: ${queueError.message}`) }
      } else toast.error(`Attendance was not saved: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return <section className="teacher-attendance page-transition" aria-label="Teacher attendance">
    <header className="teacher-attendance-header">
      <div><p className="eyebrow">TEACHER TOOLS</p><h1>Take attendance</h1><p>Mark a whole class quickly. Open your class list online first; it stays on this device for up to 24 hours for offline attendance.</p></div>
      <span className={`connection-state ${online ? 'is-online' : 'is-offline'}`}><i />{online ? 'Online' : 'Offline'}</span>
    </header>
    <section className="attendance-controls glass-card" aria-label="Attendance session">
      <label>Class<select value={classId} onChange={event => setClassId(event.target.value)} disabled={loading || !classes.length}><option value="">Choose a class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Date<input type="date" value={date} max={today(school?.timezone)} onChange={event => setDate(event.target.value)} /></label>
      <button className="outline-button attendance-all" type="button" onClick={() => setStatuses(Object.fromEntries(students.map(student => [student.id, 'present'])))} disabled={!students.length}>Mark all present</button>
    </section>
    {!loading && !classes.length && <div className="attendance-empty glass-card"><h2>{loadError ? 'Class list unavailable' : 'No assigned classes found'}</h2><p>{loadError || 'Ask your school administrator to assign you to a class or subject.'}</p>{loadError && <button className="outline-button" type="button" onClick={() => setRetryKey(value => value + 1)}>Try again</button>}</div>}
    {classId && <section className="attendance-roster glass-card" aria-label="Class roster">
      <div className="attendance-roster-head"><div><h2>{classes.find(item => item.id === classId)?.name || 'Class roster'}</h2><p>{students.length} learners · {date}</p></div><div className="attendance-counts">{attendanceStates.map(state => <span key={state} className={`attendance-count count-${state}`}>{counts[state] || 0} {state}</span>)}</div></div>
      {loading ? <p className="attendance-loading" role="status">Loading class list…</p> : students.length ? <div className="attendance-list">{students.map(student => <article className="attendance-student" key={student.id}>
        <div className="attendance-student-name"><b>{student.profiles?.full_name || 'Learner'}</b><small>{student.admission_number || 'No admission number'}</small></div>
        <div className="attendance-statuses" role="group" aria-label={`Attendance for ${student.profiles?.full_name || 'learner'}`}>{attendanceStates.map(state => <button type="button" key={state} aria-pressed={statuses[student.id] === state} className={`status-${state} ${statuses[student.id] === state ? 'selected' : ''}`} onClick={() => setStatuses(current => ({ ...current, [student.id]: state }))}>{state}</button>)}</div>
      </article>)}</div> : <div className="attendance-empty-text">{loadError || 'No learners are assigned to this class yet.'}{loadError && <button className="outline-button" type="button" onClick={() => setRetryKey(value => value + 1)}>Try again</button>}</div>}
      <footer className="attendance-save-bar"><span>Changes save only after you select “Save attendance”.</span><button className="button blue-button" onClick={saveAttendance} disabled={!students.length || saving}>{saving ? 'Saving…' : online ? 'Save attendance' : 'Save offline'}</button></footer>
    </section>}
  </section>
}
