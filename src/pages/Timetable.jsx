import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { hasSchoolPermission } from '../lib/schoolRoles'

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const emptyForm = { class_id: '', subject_id: '', day_of_week: '1', start_time: '08:00', end_time: '09:00', room_number: '' }

export default function Timetable() {
  const { profile, staffRoles } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [timetable, setTimetable] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teacherPairs, setTeacherPairs] = useState([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [activeDay, setActiveDay] = useState(1)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const role = profile?.role
  const canManage = hasSchoolPermission(role, staffRoles, 'school.timetable.manage')
  const isTeacher = role === 'teacher' && !canManage

  useEffect(() => { if (profile) init() }, [profile])

  async function init() {
    setLoading(true)
    try {
      let classQuery = supabase.from('classes').select('id,name,grade').eq('school_id', profile.school_id).order('name')
      if (isTeacher) {
        const [{ data: assigned }, { data: owned }] = await Promise.all([
          supabase.from('teacher_subject_assignments').select('class_id,subject_id,classes(id,name,grade),subjects(id,name,code)').eq('teacher_id', profile.id),
          supabase.from('classes').select('id,name,grade').eq('school_id', profile.school_id).eq('teacher_id', profile.id).order('name')
        ])
        const byId = new Map()
        ;(owned || []).forEach(c => byId.set(c.id, c))
        ;(assigned || []).forEach(a => { if (a.classes) byId.set(a.classes.id, a.classes) })
        const classList = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
        const subjectMap = new Map()
        ;(assigned || []).forEach(a => { if (a.subjects) subjectMap.set(a.subjects.id, a.subjects) })
        setClasses(classList)
        setSubjects([...subjectMap.values()].sort((a, b) => a.name.localeCompare(b.name)))
        setTeacherPairs(assigned || [])
        const firstId = classList[0]?.id || ''
        setSelectedClassId(firstId)
        if (firstId) await fetchTimetable(firstId)
        else setTimetable([])
      } else if (role === 'student') {
        const { data: student } = await supabase.from('students').select('class_id').eq('profile_id', profile.id).maybeSingle()
        if (student?.class_id) { setSelectedClassId(student.class_id); await fetchTimetable(student.class_id) }
      } else {
        const { data: list, error } = await classQuery
        if (error) throw error
        const { data: subjectList, error: subjectError } = await supabase.from('subjects').select('id,name,code').eq('school_id', profile.school_id).order('name')
        if (subjectError) throw subjectError
        setClasses(list || [])
        setSubjects(subjectList || [])
        const firstId = list?.[0]?.id || ''
        setSelectedClassId(firstId)
        if (firstId) await fetchTimetable(firstId)
      }
    } catch (err) { console.error('Timetable init error:', err) }
    finally { setLoading(false) }
  }

  async function fetchTimetable(classId) {
    if (!classId) { setTimetable([]); return }
    const { data, error } = await supabase.from('timetable')
      .select('*, subjects(name,code), classes(name), teacher:profiles!timetable_teacher_id_fkey(full_name)')
      .eq('school_id', profile.school_id).eq('class_id', classId)
      .order('day_of_week').order('start_time')
    if (error) throw error
    setTimetable(data || [])
  }

  const bySlot = useMemo(() => {
    const map = new Map()
    timetable.forEach(item => {
      const key = `${item.day_of_week}-${item.start_time.slice(0, 5)}`
      map.set(key, [...(map.get(key) || []), item])
    })
    return map
  }, [timetable])
  const sessions = (day, time) => bySlot.get(`${day}-${time}`) || []

  function beginEdit(item) {
    setEditing(item?.id || 'new')
    setForm(item ? { class_id: item.class_id, subject_id: item.subject_id, day_of_week: String(item.day_of_week), start_time: item.start_time.slice(0, 5), end_time: item.end_time.slice(0, 5), room_number: item.room_number || '' } : { ...emptyForm, class_id: selectedClassId, subject_id: subjects[0]?.id || '' })
  }

  async function savePeriod(event) {
    event.preventDefault()
    if (form.end_time <= form.start_time) { window.alert('End time must be later than start time.'); return }
    setSaving(true)
    try {
      const payload = { ...form, day_of_week: Number(form.day_of_week), school_id: profile.school_id, teacher_id: isTeacher ? profile.id : (editing !== 'new' ? timetable.find(x => x.id === editing)?.teacher_id || null : null) }
      const result = editing === 'new'
        ? await supabase.from('timetable').insert(payload)
        : await supabase.from('timetable').update(payload).eq('id', editing)
      if (result.error) throw result.error
      setEditing(null)
      if (form.class_id !== selectedClassId) setSelectedClassId(form.class_id)
      await fetchTimetable(form.class_id)
    } catch (err) { window.alert(err.message || 'Could not save this timetable period.') }
    finally { setSaving(false) }
  }

  async function deletePeriod(id) {
    if (!window.confirm('Delete this timetable period?')) return
    const { error } = await supabase.from('timetable').delete().eq('id', id)
    if (error) window.alert(error.message)
    else await fetchTimetable(selectedClassId)
  }

  const timeSlots = [...new Set([...Array.from({ length: 10 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`), ...timetable.map(x => x.start_time.slice(0, 5))])].sort()

  return <div className="timetable-page page-transition">
    <style>{`.timetable-page{min-height:100vh;background:var(--bg);color:var(--ink);padding:40px 24px}.tt-container{max-width:1200px;margin:auto}.tt-header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:28px}.tt-title h1{font-size:2.4rem;font-weight:800;margin:0;color:var(--green)}.tt-title p{color:var(--muted);margin:8px 0}.tt-actions,.tt-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:16px 0}.tt-table{width:100%;border-collapse:collapse;min-width:850px}.tt-table th,.tt-table td{padding:10px;border:1px solid var(--line);vertical-align:top;background:var(--panel)}.tt-table th{color:var(--green);text-align:center}.tt-time-col{width:90px;font-weight:700}.tt-grid-wrapper{overflow:auto;border-radius:var(--radius)}.session-card{background:var(--cream);border-left:4px solid var(--green);padding:12px;border-radius:10px;margin-bottom:8px}.session-subject{font-weight:800}.session-teacher,.session-meta{color:var(--muted);font-size:.82rem;margin-top:4px}.session-buttons{display:flex;gap:6px;margin-top:8px}.session-buttons button,.tt-button{cursor:pointer;border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:var(--panel);color:var(--ink)}.tt-button.primary{background:var(--green);color:white;border-color:var(--green)}.tt-mobile{display:none}.tt-form{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px;padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:12px;margin:16px 0}.tt-form label{display:grid;gap:6px;color:var(--muted);font-size:.9rem}.tt-form input,.tt-form select,.tt-controls select{padding:10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}.tt-form-actions{grid-column:1/-1;display:flex;gap:8px}.tt-empty{padding:24px;text-align:center;color:var(--muted)}@media(max-width:800px){.timetable-page{padding:20px 14px 90px}.tt-header{align-items:flex-start;flex-direction:column}.tt-table.desktop{display:none}.tt-mobile{display:block}.tt-day-tabs{display:flex;gap:8px;margin:18px 0}.tt-day-tabs button{flex:1;padding:12px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px}.tt-day-tabs button.active{background:var(--green);color:white}.tt-form{grid-template-columns:1fr 1fr}}`}</style>
    <div className="tt-container">
      <header className="tt-header"><div className="tt-title"><h1>School timetable</h1><p>Weekly schedule and class allocations</p></div><button className="tt-button" onClick={() => navigate('/portal')}>← Back to portal</button></header>
      <div className="tt-controls"><label htmlFor="class-select">Class:</label><select id="class-select" value={selectedClassId} onChange={async e => { setSelectedClassId(e.target.value); try { await fetchTimetable(e.target.value) } catch (err) { window.alert(err.message) } }}>
        {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.grade ? ` (${c.grade})` : ''}</option>)}
      </select>{classes.length === 0 && <span>No classes are assigned to your account yet.</span>}</div>
      {canManage && classes.length > 0 && <div className="tt-actions"><button className="tt-button primary" onClick={() => beginEdit(null)}>＋ Add period</button></div>}
      {editing && <form className="tt-form" onSubmit={savePeriod}>
        <label>Class<select required value={form.class_id} onChange={e => { const classId = e.target.value; const nextSubject = isTeacher ? teacherPairs.find(a => a.class_id === classId)?.subject_id || '' : form.subject_id; setForm({ ...form, class_id: classId, subject_id: nextSubject }) }}>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Subject<select required value={form.subject_id} onChange={e => setForm({ ...form, subject_id: e.target.value })}>{(isTeacher ? teacherPairs.filter(a => a.class_id === form.class_id).map(a => a.subjects).filter(Boolean) : subjects).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Day<select value={form.day_of_week} onChange={e => setForm({ ...form, day_of_week: e.target.value })}>{days.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
        <label>Starts<input type="time" required value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })}/></label>
        <label>Ends<input type="time" required value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })}/></label>
        <label>Room<input value={form.room_number} onChange={e => setForm({ ...form, room_number: e.target.value })} placeholder="Optional"/></label>
        <div className="tt-form-actions"><button className="tt-button primary" disabled={saving || !subjects.length}>{saving ? 'Saving…' : 'Save period'}</button><button type="button" className="tt-button" onClick={() => setEditing(null)}>Cancel</button>{!subjects.length && <span>Ask your school admin to assign subjects first.</span>}</div>
      </form>}
      <div className="tt-grid-wrapper">{loading ? <div className="tt-empty">Loading schedule…</div> : timetable.length === 0 ? <div className="tt-empty">No classes scheduled for this class yet.</div> : <>
        <table className="tt-table desktop"><thead><tr><th className="tt-time-col">Time</th>{days.map(d => <th key={d}>{d}</th>)}</tr></thead><tbody>{timeSlots.map(time => <tr key={time}><td className="tt-time-col">{time}</td>{days.map((d, i) => <td key={d}>{sessions(i + 1, time).map(s => <div key={s.id} className="session-card"><div className="session-subject">{s.subjects?.name || 'Subject'}</div><div className="session-teacher">{s.teacher?.full_name || 'Staff'}</div><div className="session-meta">Room {s.room_number || 'TBA'} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</div>{canManage && <div className="session-buttons"><button onClick={() => beginEdit(s)}>Edit</button><button onClick={() => deletePeriod(s.id)}>Delete</button></div>}</div>)}</td>)}</tr>)}</tbody></table>
        <div className="tt-mobile"><div className="tt-day-tabs">{days.map((d, i) => <button key={d} className={activeDay === i + 1 ? 'active' : ''} onClick={() => setActiveDay(i + 1)}>{d.slice(0, 1)}</button>)}</div><h3>{days[activeDay - 1]}</h3>{timetable.filter(s => s.day_of_week === activeDay).map(s => <div key={s.id} className="session-card"><div className="session-subject">{s.subjects?.name || 'Subject'}</div><div className="session-teacher">{s.teacher?.full_name || 'Staff'}</div><div className="session-meta">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · Room {s.room_number || 'TBA'}</div>{canManage && <div className="session-buttons"><button onClick={() => beginEdit(s)}>Edit</button><button onClick={() => deletePeriod(s.id)}>Delete</button></div>}</div>)}</div>
      </>}</div>
    </div>
  </div>
}
