import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const blank = { teacher_id: '', class_id: '', subject_id: '' }

export default function TeacherLoads() {
  const { profile } = useAuth()
  const [people, setPeople] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loads, setLoads] = useState([])
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!supabase || !profile?.school_id) return
    const [peopleResult, classesResult, subjectsResult, loadsResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email').eq('school_id', profile.school_id).eq('role', 'teacher').order('full_name'),
      supabase.from('classes').select('id,name,grade').eq('school_id', profile.school_id).order('name'),
      supabase.from('subjects').select('id,name,code').eq('school_id', profile.school_id).order('name'),
      supabase.from('teacher_subject_assignments').select('id,teacher_id,class_id,subject_id,profiles!teacher_subject_assignments_teacher_id_fkey(full_name),classes(name),subjects(name)').eq('school_id', profile.school_id).order('created_at', { ascending: false })
    ])
    for (const result of [peopleResult, classesResult, subjectsResult, loadsResult]) if (result.error) toast.error(result.error.message || 'Could not load teacher assignments')
    setPeople(peopleResult.data || []); setClasses(classesResult.data || []); setSubjects(subjectsResult.data || []); setLoads(loadsResult.data || [])
  }, [profile?.school_id])
  useEffect(() => { void load() }, [load])

  async function addLoad(event) {
    event.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('teacher_subject_assignments').insert({ ...form, school_id: profile.school_id })
    setBusy(false)
    if (error) toast.error(error.code === '23505' ? 'That teacher already has this class and subject.' : error.message || 'Could not assign subject')
    else { toast.success('Class and subject assigned'); setForm(blank); void load() }
  }
  async function removeLoad(row) {
    if (!window.confirm(`Remove ${row.subjects?.name || 'this subject'} from ${row.profiles?.full_name || 'this teacher'}?`)) return
    const { error } = await supabase.from('teacher_subject_assignments').delete().eq('id', row.id).eq('school_id', profile.school_id)
    if (error) toast.error(error.message || 'Could not remove assignment'); else { toast.success('Teaching assignment removed'); void load() }
  }

  return <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 24px' }}><p className="eyebrow">Academic setup</p><h1>Teacher class & subject assignments</h1>
    <form className="panel" onSubmit={addLoad} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, padding: 18, margin: '22px 0' }}>
      <label>Teacher<select required value={form.teacher_id} onChange={event => setForm({ ...form, teacher_id: event.target.value })}><option value="">Select teacher</option>{people.map(person => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label>
      <label>Class<select required value={form.class_id} onChange={event => setForm({ ...form, class_id: event.target.value })}><option value="">Select class</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}{item.grade ? ` · ${item.grade}` : ''}</option>)}</select></label>
      <label>Subject<select required value={form.subject_id} onChange={event => setForm({ ...form, subject_id: event.target.value })}><option value="">Select subject</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button className="button blue-button" disabled={busy || !people.length || !classes.length || !subjects.length}>{busy ? 'Saving…' : 'Assign teaching load'}</button>
    </form>
    {!people.length || !classes.length || !subjects.length ? <p className="panel" style={{ padding: 16 }}>Create teacher accounts, classes, and subjects before assigning teaching loads.</p> : null}
    <section className="panel" style={{ padding: 18 }}><h2>Current teaching assignments</h2>{!loads.length ? <p>No teaching assignments have been added yet.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th align="left">Teacher</th><th align="left">Class</th><th align="left">Subject</th><th></th></tr></thead><tbody>{loads.map(row => <tr key={row.id} style={{ borderTop: '1px solid var(--line)' }}><td style={{ padding: 12 }}>{row.profiles?.full_name || 'Teacher'}</td><td>{row.classes?.name || 'Class'}</td><td>{row.subjects?.name || 'Subject'}</td><td><button type="button" className="button outline-button" onClick={() => void removeLoad(row)}>Remove</button></td></tr>)}</tbody></table></div>}</section>
    <style>{`.panel label{display:grid;gap:6px}.panel select{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}`}</style>
  </main>
}
