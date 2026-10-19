import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const blank = { teaching: '', title: '', instructions: '', due_date: '', max_score: '100' }

export default function TeacherAssignments() {
  const { profile, demo } = useAuth()
  const [teaching, setTeaching] = useState([])
  const [assignments, setAssignments] = useState([])
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase || !profile?.school_id || demo) { setLoading(false); return }
    setLoading(true)
    const [teachingResult, assignmentResult] = await Promise.all([
      supabase.from('teacher_subject_assignments').select('class_id,subject_id,classes(name),subjects(name)').eq('teacher_id', profile.id).eq('school_id', profile.school_id),
      supabase.from('assignments').select('id,title,due_date,max_score,published_at,created_at,classes(name),subjects(name),submissions(id,score)').eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(100)
    ])
    if (teachingResult.error) toast.error('Could not load your class and subject assignments')
    if (assignmentResult.error) toast.error(assignmentResult.error.message || 'Could not load assignments')
    setTeaching(teachingResult.data || [])
    setAssignments(assignmentResult.data || [])
    setLoading(false)
  }, [profile?.id, profile?.school_id, demo])

  useEffect(() => { void load() }, [load])

  async function createAssignment(event) {
    event.preventDefault()
    if (!supabase || !form.teaching) return
    const selected = teaching.find(item => `${item.class_id}:${item.subject_id}` === form.teaching)
    if (!selected) return
    const maxScore = Number(form.max_score)
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100000) return toast.error('Enter a maximum score above 0 and at most 100,000.')
    setBusy(true)
    const { error } = await supabase.from('assignments').insert({
      school_id: profile.school_id, class_id: selected.class_id, subject_id: selected.subject_id,
      title: form.title.trim(), instructions: form.instructions.trim() || null,
      due_date: form.due_date || null, max_score: maxScore, created_by: profile.id,
      published_at: new Date().toISOString()
    })
    setBusy(false)
    if (error) { toast.error(error.message || 'Could not publish assignment'); return }
    toast.success('Assignment published to the selected class')
    setForm(blank)
    await load()
  }

  return <main className="teacher-assignments-page">
    <p className="eyebrow">Teaching workspace</p><h1>Assignments & submissions</h1>
    <p>Create assignments and review submissions.</p>
    <div className="teacher-assignments-layout">
      <form className="panel" onSubmit={createAssignment} style={{ padding: 20, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Create assignment</h2>
        <label>Class and subject<select required value={form.teaching} onChange={event => setForm({ ...form, teaching: event.target.value })}><option value="">Choose a class and subject</option>{teaching.map(item => <option key={`${item.class_id}:${item.subject_id}`} value={`${item.class_id}:${item.subject_id}`}>{item.classes?.name || 'Class'} · {item.subjects?.name || 'Subject'}</option>)}</select></label>
        <label>Title<input required maxLength={160} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label>Instructions<textarea maxLength={10000} rows={5} value={form.instructions} onChange={event => setForm({ ...form, instructions: event.target.value })} /></label>
        <label>Due date<input type="date" value={form.due_date} onChange={event => setForm({ ...form, due_date: event.target.value })} /></label>
        <label>Maximum score<input type="number" min="1" max="100000" step="0.01" required value={form.max_score} onChange={event => setForm({ ...form, max_score: event.target.value })} /></label>
        <button className="button blue-button" disabled={busy || !teaching.length}>{busy ? 'Publishing…' : 'Publish assignment'}</button>
        {!teaching.length && <small>Ask your administrator to assign a class and subject.</small>}
      </form>
      <section className="panel" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>Your class assignments</h2>
        {loading ? <p>Loading assignments…</p> : !assignments.length ? <p>No assignments are available for your classes yet.</p> : <div style={{ display: 'grid', gap: 12 }}>{assignments.map(item => { const submitted = item.submissions || []; const graded = submitted.filter(row => row.score !== null).length; return <article key={item.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{item.title}</strong><p style={{ margin: '4px 0', color: 'var(--muted)' }}>{item.classes?.name || 'Class'} · {item.subjects?.name || 'Subject'} · Max {item.max_score ?? 100}{item.due_date ? ` · Due ${item.due_date}` : ''}</p><small>{submitted.length} submitted · {graded} graded</small></div><Link className="button outline-button" to={`/review/${item.id}`}>Review submissions</Link></div></article> })}</div>}
      </section>
    </div>
        <style>{`
      .teacher-assignments-page { max-width: 1120px; margin: 0 auto; padding: 32px 24px; }
      .teacher-assignments-layout { display: grid; grid-template-columns: minmax(260px, .75fr) minmax(0, 1.25fr); gap: 18px; align-items: start; margin-top: 24px; }
      .teacher-assignments-layout > * { min-width: 0; }
      .teacher-assignments-layout label { display: grid; gap: 6px; }
      .teacher-assignments-layout input, .teacher-assignments-layout select, .teacher-assignments-layout textarea { box-sizing: border-box; width: 100%; min-width: 0; min-height: 46px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); }
      @media (max-width: 850px) { .teacher-assignments-layout { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: 520px) {
        .teacher-assignments-page { padding: 22px 12px; }
        .teacher-assignments-page h1 { font-size: clamp(1.45rem, 7vw, 2rem); }
        .teacher-assignments-layout > .panel { padding: 16px !important; }
        .teacher-assignments-layout button, .teacher-assignments-layout a.button { min-height: 44px; }
      }
    `}</style>
  </main>
}
