import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function ClassHistory() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [periods, setPeriods] = useState([])
  const [marks, setMarks] = useState([])
  const [lessons, setLessons] = useState([])
  const [assignments, setAssignments] = useState([])
  const [attendance, setAttendance] = useState([])
  const [pastQuestions, setPastQuestions] = useState([])
  const [questionSubject, setQuestionSubject] = useState('all')
  const [questionType, setQuestionType] = useState('all')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const selected = params.get('enrollment')
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!supabase || !profile?.id) return
      setLoading(true)
      const { data: learner } = await supabase.from('students').select('id,class_id').eq('profile_id', profile.id).maybeSingle()
      if (!learner) { if (alive) { setMessage('No learner record is linked to this account.'); setLoading(false) } return }
      const { data: rows, error } = await supabase.from('student_class_enrollments')
        .select('id,class_id,academic_year,started_at,ended_at,change_reason,promotion_percentage,classes(name,grade)')
        .eq('student_id', learner.id).order('started_at', { ascending: false })
      if (!alive) return
      if (error) { setMessage(error.message); setLoading(false); return }
      setPeriods(rows || [])
      const active = (rows || []).find(row => !row.ended_at)
      if (!selected && active) setParams({ enrollment: active.id }, { replace: true })
      const period = (rows || []).find(row => row.id === selected) || active
      if (period) {
        const [{ data: resultRows, error: resultError }, { data: lessonRows }, { data: assignmentRows }, { data: attendanceRows }] = await Promise.all([
          supabase.from('results')
          .select('id,score,grade,remarks,published,exams(name,exam_date,academic_year,term,class_id,max_score)')
          .eq('student_id', learner.id).eq('published', true),
          supabase.from('lesson_plans').select('id,title,content,created_at,subjects(name)').eq('class_id', period.class_id).eq('is_public', true).order('created_at', { ascending: false }),
          supabase.from('assignments').select('id,title,instructions,due_date,subjects(name)').eq('class_id', period.class_id).not('published_at', 'is', null).order('due_date', { ascending: false }),
          supabase.from('attendance').select('id,attendance_date,status').eq('student_id', learner.id).eq('class_id', period.class_id).order('attendance_date', { ascending: false })
        ])
        if (!alive) return
        if (resultError) setMessage(resultError.message)
        setMarks((resultRows || []).filter(row => row.exams?.class_id === period.class_id &&
          (!period.ended_at || (row.exams.exam_date && new Date(`${row.exams.exam_date}T23:59:59`) <= new Date(period.ended_at)))));
        const beforeEnd = value => !period.ended_at || (value && new Date(value) < new Date(period.ended_at))
        setLessons((lessonRows || []).filter(row => beforeEnd(row.created_at)))
        setAssignments((assignmentRows || []).filter(row => beforeEnd(row.due_date)))
        setAttendance((attendanceRows || []).filter(row => beforeEnd(row.attendance_date)))
      } else { setMarks([]); setLessons([]); setAssignments([]); setAttendance([]) }
      setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [profile?.id, selected, setParams])
  useEffect(() => {
    let active = true
    if (supabase && profile?.id) void supabase.rpc('get_my_past_class_questions').then(({ data }) => {
      if (active) setPastQuestions(data || [])
    })
    return () => { active = false }
  }, [profile?.id])
  const current = periods.find(row => row.id === selected) || periods.find(row => !row.ended_at)
  const pastSubjects = [...new Map(pastQuestions.map(row => [row.subject_id, row.subject_name || 'General'])).entries()]
  const filteredQuestions = pastQuestions.filter(row => (questionSubject === 'all' || row.subject_id === questionSubject) && (questionType === 'all' || row.assessment_type === questionType))
  return <section className="page-wrap">
    <div className="page-heading"><div><p className="eyebrow">Your learning record</p><h1>Class & results history</h1><p>Choose a class period to review its published results. Your learning tools continue to use your current class.</p></div></div>
    {message && <div className="notice notice-error" role="alert">{message}</div>}
    <div className="panel" style={{ marginBottom: 20 }}><label htmlFor="class-period"><b>Class or level</b></label><select id="class-period" value={current?.id || ''} onChange={event => setParams({ enrollment: event.target.value })} style={{ display: 'block', marginTop: 8, minWidth: 260 }}>
      {periods.map(row => <option key={row.id} value={row.id}>{row.classes?.name || row.classes?.grade || 'Class'}{row.ended_at ? ' · Previous' : ' · Current'}{row.academic_year ? ` · ${row.academic_year}` : ''}</option>)}
    </select></div>
    {loading ? <div className="portal-loading"><div className="spinner" /></div> : !periods.length ? <div className="empty-state">Your class history will appear here when your school links your learner record.</div> : <>
      <div className="panel"><h2>{current?.classes?.name || current?.classes?.grade || 'Class'} {current?.ended_at ? '· Previous record' : '· Current class'}</h2><p>{current?.started_at ? `Started ${new Date(current.started_at).toLocaleDateString()}` : ''}{current?.ended_at ? ` · Completed ${new Date(current.ended_at).toLocaleDateString()}` : ''}</p>{current?.promotion_percentage != null && <p>Promotion result: {current.promotion_percentage}%</p>}</div>
      <div className="panel" style={{ marginTop: 16 }}><h2>Published results</h2>{marks.length ? <div className="table-wrap"><table><thead><tr><th>Exam</th><th>Period</th><th>Score</th><th>Grade</th><th>Teacher notes</th></tr></thead><tbody>{marks.map(row => <tr key={row.id}><td>{row.exams?.name || 'Exam'}</td><td>{[row.exams?.academic_year,row.exams?.term].filter(Boolean).join(' · ') || row.exams?.exam_date || '—'}</td><td>{row.score ?? '—'} / {row.exams?.max_score ?? '—'}</td><td>{row.grade || '—'}</td><td>{row.remarks || '—'}</td></tr>)}</tbody></table></div> : <p>No published results are available for this class period yet.</p>}</div>
      <div className="panel" style={{ marginTop: 16 }}><h2>Past questions from previous classes</h2><p>Practice published questions from earlier classes, organized by subject and assessment type. Answer keys are not shown.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '12px 0' }}><label>Subject <select value={questionSubject} onChange={event => setQuestionSubject(event.target.value)}><option value="all">All subjects</option>{pastSubjects.map(([id, name]) => id && <option key={id} value={id}>{name}</option>)}</select></label><label>Assessment <select value={questionType} onChange={event => setQuestionType(event.target.value)}><option value="all">All types</option><option value="exam">Exam</option><option value="cat">CAT</option><option value="test">Test</option><option value="quiz">Quiz</option></select></label></div>
        {filteredQuestions.length ? filteredQuestions.map((row, index) => <article key={row.question_id} style={{ padding: '14px 0', borderTop: '1px solid var(--border, #e5e7eb)' }}><small>{row.class_name} · {row.subject_name || 'General'} · {row.assessment_type.toUpperCase()} · {row.assessment_title} · {row.points} mark{row.points === 1 ? '' : 's'}</small><p><b>{index + 1}. {row.question_text}</b></p>{Array.isArray(row.options) && <ol type="A">{row.options.map((option, optionIndex) => <li key={optionIndex}>{typeof option === 'string' ? option : option?.text || JSON.stringify(option)}</li>)}</ol>}{row.explanation && <details><summary>Study note</summary><p>{row.explanation}</p></details>}</article>) : <p>Past questions will appear here when your school has published class assessments with questions.</p>}
      </div>
      {current?.ended_at && <><div className="panel" style={{ marginTop: 16 }}><h2>Class notes</h2>{lessons.length ? lessons.map(row => <article key={row.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}><h3>{row.title}</h3><small>{row.subjects?.name || 'Subject'} · {new Date(row.created_at).toLocaleDateString()}</small><p style={{ whiteSpace: 'pre-wrap' }}>{row.content}</p></article>) : <p>No historical notes available for this class.</p>}</div>
      <div className="panel" style={{ marginTop: 16 }}><h2>Past assignments</h2>{assignments.length ? assignments.map(row => <article key={row.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}><b>{row.title}</b><p>{row.subjects?.name || 'Subject'}{row.due_date ? ` · Due ${new Date(`${row.due_date}T12:00:00`).toLocaleDateString()}` : ''}</p><p>{row.instructions}</p></article>) : <p>No past assignments available for this class.</p>}</div>
      <div className="panel" style={{ marginTop: 16 }}><h2>Attendance record</h2>{attendance.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>{attendance.map(row => <tr key={row.id}><td>{new Date(`${row.attendance_date}T12:00:00`).toLocaleDateString()}</td><td>{row.status}</td></tr>)}</tbody></table></div> : <p>No attendance records available for this class.</p>}</div></>}
    </>}
  </section>
}
