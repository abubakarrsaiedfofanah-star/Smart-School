import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { classLabel, groupClasses } from '../lib/educationLevels'

const blank = { teacher_id: '', class_id: '', subject_id: '' }

export default function TeacherLoads() {
  const { profile, staffRoles = [] } = useAuth()
  const canManage = profile?.role === 'school_admin' || (profile?.role === 'staff' && staffRoles.includes('principal'))
  const [people, setPeople] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loads, setLoads] = useState([])
  const [form, setForm] = useState(blank)
  const [classTeacherForm, setClassTeacherForm] = useState({ class_id: '', teacher_id: '' })
  const [busy, setBusy] = useState(false)
  const classGroups = groupClasses(classes)
  const selectedClass = classes.find(classRow => classRow.id === form.class_id)
  const availableSubjects = subjects.filter(subject => !selectedClass?.education_stage
    || !subject.education_stages?.length
    || subject.education_stages.includes(selectedClass.education_stage))
  const duplicateAssignment = loads.some(row => row.teacher_id === form.teacher_id
    && row.class_id === form.class_id && row.subject_id === form.subject_id)
  const groupedLoads = classGroups.map(group => ({
    ...group,
    classes: group.classes.map(classRow => ({
      ...classRow,
      assignments: loads.filter(loadRow => loadRow.class_id === classRow.id),
    })).filter(classRow => classRow.assignments.length),
  })).filter(group => group.classes.length)
  const load = useCallback(async () => {
    if (!supabase || !profile?.school_id || !canManage) return
    const [peopleResult, classesResult, subjectsResult, loadsResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email').eq('school_id', profile.school_id).eq('role', 'teacher').eq('is_active', true).order('full_name'),
      supabase.from('classes').select('id,name,grade,education_stage,level_order,teacher_id').eq('school_id', profile.school_id).order('name'),
      supabase.from('subjects').select('id,name,code,education_stages').eq('school_id', profile.school_id).order('name'),
      supabase.from('teacher_subject_assignments').select('id,teacher_id,class_id,subject_id,profiles!teacher_subject_assignments_teacher_id_fkey(full_name),classes(id,name,grade,education_stage,level_order),subjects(name)').eq('school_id', profile.school_id).order('created_at', { ascending: false })
    ])
    for (const result of [peopleResult, classesResult, subjectsResult, loadsResult]) if (result.error) toast.error(result.error.message || 'Could not load teacher assignments')
    setPeople(peopleResult.data || []); setClasses(classesResult.data || []); setSubjects(subjectsResult.data || []); setLoads(loadsResult.data || [])
  }, [profile?.school_id, canManage])
  useEffect(() => { void load() }, [load])

  async function addLoad(event) {
    event.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('teacher_subject_assignments').insert({ ...form, school_id: profile.school_id })
    setBusy(false)
    if (error) toast.error(error.code === '23505' ? 'That teacher already has this class and subject.' : error.message || 'Could not assign subject')
    else { toast.success('Class and subject assigned'); setForm(blank); void load() }
  }
  async function saveClassTeacher(event) {
    event.preventDefault()
    if (!classTeacherForm.class_id) return toast.error('Choose a class first.')
    setBusy(true)
    const { error } = await supabase.from('classes').update({ teacher_id: classTeacherForm.teacher_id || null })
      .eq('id', classTeacherForm.class_id).eq('school_id', profile.school_id)
    setBusy(false)
    if (error) toast.error(error.message || 'Could not assign the class teacher.')
    else { toast.success('Class teacher updated.'); void load() }
  }
  async function removeLoad(row) {
    if (!window.confirm(`Remove ${row.subjects?.name || 'this subject'} from ${row.profiles?.full_name || 'this teacher'}?`)) return
    const { error } = await supabase.from('teacher_subject_assignments').delete().eq('id', row.id).eq('school_id', profile.school_id)
    if (error) toast.error(error.message || 'Could not remove assignment'); else { toast.success('Teaching assignment removed'); void load() }
  }

  if (!canManage) return <main className="portal-loading"><section><p className="eyebrow">ACADEMIC SETUP</p><h1>Principal access required</h1><p>Ask your school principal or administrator to manage teaching assignments.</p></section></main>
  return <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 24px' }}><p className="eyebrow">Academic setup</p><h1>Classes, subjects & teachers</h1><p>Set up each school level, then assign teachers to the subjects they teach in each class. In JSS and SSS, a teacher can have different subjects in different classes.</p>
    <section className="panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, padding: 18, margin: '22px 0' }} aria-label="Academic setup steps">
      <article><b>1 · Classes and levels</b><p>{classes.length} classes configured</p>{profile?.role === 'school_admin' && <Link to="/school-admin?module=Classes">Manage classes</Link>}</article>
      <article><b>2 · Subject catalog</b><p>{subjects.length} subjects available</p>{profile?.role === 'school_admin' && <Link to="/school-admin?module=Subjects">Manage subjects</Link>}</article>
      <article><b>3 · Class subject teachers</b><p>{loads.length} assignments</p><span>Teachers see their assigned subjects and classes.</span></article>
    </section>
    {canManage && <form className="panel" onSubmit={saveClassTeacher} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', alignItems: 'end', gap: 12, padding: 18, margin: '22px 0' }}><div><h2 style={{ marginTop: 0 }}>Class teacher</h2><p style={{ marginBottom: 0 }}>Set a homeroom teacher. Assign subject teachers separately below, especially for JSS and SSS.</p></div><label>Class<select required value={classTeacherForm.class_id} onChange={event => { const selectedClass = classes.find(item => item.id === event.target.value); setClassTeacherForm({ class_id: event.target.value, teacher_id: selectedClass?.teacher_id || '' }) }}><option value="">Select class</option>{classGroups.map(group => <optgroup key={group.stage} label={group.label}>{group.classes.map(item => <option key={item.id} value={item.id}>{classLabel(item)}</option>)}</optgroup>)}</select></label><label>Class teacher<select value={classTeacherForm.teacher_id} onChange={event => setClassTeacherForm({ ...classTeacherForm, teacher_id: event.target.value })}><option value="">No class teacher</option>{people.map(person => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label><button className="button outline-button" disabled={busy || !classTeacherForm.class_id}>Save class teacher</button></form>}
    <form className="panel" onSubmit={addLoad} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, padding: 18, margin: '22px 0' }}>
      <label>Teacher<select required value={form.teacher_id} onChange={event => setForm({ ...form, teacher_id: event.target.value })}><option value="">Select teacher</option>{people.map(person => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label>
      <label>Class<select required value={form.class_id} onChange={event => setForm({ ...form, class_id: event.target.value, subject_id: '' })}><option value="">Select class</option>{classGroups.map(group => <optgroup key={group.stage} label={group.label}>{group.classes.map(item => <option key={item.id} value={item.id}>{classLabel(item)}</option>)}</optgroup>)}</select></label>
      <label>Subject<select required value={form.subject_id} disabled={!form.class_id || !availableSubjects.length} onChange={event => setForm({ ...form, subject_id: event.target.value })}><option value="">{!form.class_id ? 'Choose a class first' : availableSubjects.length ? 'Select subject for this class' : 'No subjects available for this stage'}</option>{availableSubjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{selectedClass?.education_stage&&!availableSubjects.length?<small>Add this stage to a subject in the subject catalog.</small>:null}</label>
      <button className="button blue-button" disabled={busy || !people.length || !classes.length || !availableSubjects.length || !form.teacher_id || !form.class_id || !form.subject_id || duplicateAssignment}>{busy ? 'Saving…' : 'Assign teaching load'}</button>
      {duplicateAssignment&&<p role="status" style={{gridColumn:'1/-1',margin:0}}>This teacher already has this subject for the selected class.</p>}
    </form>
    {!people.length || !classes.length || !subjects.length ? <p className="panel" style={{ padding: 16 }}>First add teacher accounts, classes, and subjects. Then assign one teacher to a subject in a class.</p> : null}
    <section className="panel" style={{ padding: 18 }}><h2>Teaching assignments by level and class</h2>{!loads.length ? <p>No teaching assignments have been added yet.</p> : !groupedLoads.length ? <p>Assignments are loading or their classes are unavailable.</p> : <div style={{ display: 'grid', gap: 20 }}>{groupedLoads.map(group => <section key={group.stage}><h3 style={{ marginBottom: 10 }}>{group.label}</h3><div style={{ display: 'grid', gap: 12 }}>{group.classes.map(classRow => <article key={classRow.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}><h4 style={{ margin: '0 0 10px' }}>{classLabel(classRow)}</h4><div style={{ display: 'grid', gap: 8 }}>{classRow.assignments.map(row => <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px,1fr) minmax(130px,1.3fr) auto', alignItems: 'center', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 8 }}><b>{row.subjects?.name || 'Subject'}</b><span>{row.profiles?.full_name || 'Teacher'}</span><button type="button" className="button outline-button" onClick={() => void removeLoad(row)} aria-label={`Remove ${row.subjects?.name || 'subject'} assignment for ${row.profiles?.full_name || 'teacher'}`}>Remove</button></div>)}</div></article>)}</div></section>)}</div>}</section>
    <style>{`.panel label{display:grid;gap:6px}.panel select{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}`}</style>
  </main>
}
