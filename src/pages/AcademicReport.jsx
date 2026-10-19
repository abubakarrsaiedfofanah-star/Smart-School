import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { roleRoute } from '../lib/roleRoute'
import { accessibleBrandColor, normalizeBrandColor } from '../lib/brandColor'
import toast from 'react-hot-toast'
import '../styles/academic-reports.css'

const formatScore = value => Number.isInteger(value) ? String(value) : value.toFixed(1)
const defaultScale = [{ min: 80, grade: 'A' }, { min: 70, grade: 'B' }, { min: 60, grade: 'C' }, { min: 50, grade: 'D' }, { min: 0, grade: 'E' }]
const getGrade = (score, gradingScale) => {
  const scale = (Array.isArray(gradingScale) && gradingScale.length ? gradingScale : defaultScale).slice().sort((a, b) => Number(b.min) - Number(a.min))
  const band = scale.find(item => score >= Number(item.min)) || scale.at(-1)
  const colors = { A: '#147d59', B: '#26784f', C: '#9a6700', D: '#a64b16', E: '#b42318', EE: '#147d59', ME: '#26784f', AE: '#9a6700', BE: '#b42318' }
  return { label: band?.grade || '—', color: colors[band?.grade] || '#3456a1' }
}

export default function AcademicReport() {
  const { studentId } = useParams()
  const { profile, demo } = useAuth()
  const [data, setData] = useState(null)
  const [behavior, setBehavior] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [selectedTerm, setSelectedTerm] = useState('all')

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      if (!studentId) { setLoading(false); return }
      setLoading(true)
      try {
        if (demo || !supabase) {
          if (!cancelled) { setData(null); setBehavior([]) }
          return
        }

        const [studentRes, resultsRes, behaviorRes] = await Promise.all([
          supabase.from('students').select('*, profiles:profile_id(full_name), classes:class_id(name, teacher:teacher_id(full_name, signature_url)), schools:school_id(name, logo_url, primary_color, principal_signature_url, school_motto, school_level, grading_scale, timezone)').eq('id', studentId).single(),
          supabase.from('results').select('score, remarks, exams:exam_id(name, max_score, exam_date, academic_year, term, subjects:subject_id(name))').eq('student_id', studentId).eq('published', true),
          supabase.from('behavior_records').select('type,points').eq('student_id', studentId)
        ])
        if (studentRes.error) throw studentRes.error
        if (resultsRes.error) throw resultsRes.error
        if (behaviorRes.error) throw behaviorRes.error
        if (!cancelled) {
          setData({ student: studentRes.data, results: resultsRes.data || [] })
          setBehavior(behaviorRes.data || [])
        }
      } catch (error) {
        console.error('Failed to load report card:', error)
        if (!cancelled) toast.error('This report card could not be loaded.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchData()
    return () => { cancelled = true }
  }, [studentId, demo])

  const results = data?.results || []
  const periodYear = result => result.exams?.academic_year || (result.exams?.exam_date ? String(new Date(`${result.exams.exam_date}T00:00:00`).getFullYear()) : 'Unassigned')
  const years = useMemo(() => [...new Set(results.map(periodYear))].sort((a, b) => b.localeCompare(a)), [results])
  const activeYear = years.includes(selectedYear) ? selectedYear : years[0] || selectedYear
  const terms = useMemo(() => [...new Set(results.filter(result => periodYear(result) === activeYear).map(result => result.exams?.term || 'Unassigned'))].sort(), [results, activeYear])
  const periodResults = results.filter(result => periodYear(result) === activeYear && (selectedTerm === 'all' || (result.exams?.term || 'Unassigned') === selectedTerm))
  const totals = useMemo(() => periodResults.reduce((acc, result) => {
    const score = Number(result.score) || 0
    const max = Number(result.exams?.max_score) || 0
    acc.score += score
    acc.max += max
    return acc
  }, { score: 0, max: 0 }), [periodResults])
  const average = totals.max > 0 ? totals.score / totals.max * 100 : 0
  const overallGrade = getGrade(average, data?.student?.schools?.grading_scale)
  const school = data?.student?.schools
  const accent = normalizeBrandColor(school?.primary_color)
  const brandStyle = { '--school-accent': accent, '--school-accent-strong': accessibleBrandColor(accent) }
  const year = new Date().getFullYear()
  const gradingScale = school?.grading_scale || defaultScale
  const subjectProgress = periodResults.reduce((groups, result) => {
    const name = result.exams?.subjects?.name || 'Subject'
    const max = Number(result.exams?.max_score) || 0
    const score = Number(result.score) || 0
    if (!groups[name]) groups[name] = { score: 0, max: 0 }
    groups[name].score += score
    groups[name].max += max
    return groups
  }, {})

  if (loading) return <div className="portal-loading"><div className="spinner" /><p>Preparing the school report card...</p></div>
  if (!data?.student) return <main className="report-empty"><section><span>REPORT CARD</span><h1>Report card unavailable</h1><p>The student or published results could not be found in this school workspace.</p><Link to={profile?.role ? roleRoute(profile.role) : '/login'}>Back to portal</Link></section></main>

  const { student } = data
  const merits = behavior.filter(item => item.type === 'merit').reduce((sum, item) => sum + (Number(item.points) || 0), 0)
  const demerits = behavior.filter(item => item.type === 'demerit').reduce((sum, item) => sum + (Number(item.points) || 0), 0)

  return <div className="report-page page-transition" style={brandStyle}>
    <nav className="no-print report-nav" aria-label="Report card actions">
      <Link to={profile?.role ? roleRoute(profile.role) : '/login'} className="back-btn">← Back to portal</Link>
      <button className="button blue-button tactile-btn" onClick={() => window.print()}>Print report card</button>
    </nav>

    <article className="report-card printable">
      <header className="report-header">
        <div className="school-branding">
          {school?.logo_url && <img src={school.logo_url} alt={`${school.name} logo`} className="report-logo" />}
          <h1>{school?.name || 'School'}</h1>
          {school?.school_level && <div className="school-type-badge">{school.school_level}</div>}
          {school?.school_motto && <p className="school-motto">{school.school_motto}</p>}
        </div>
        <div className="report-title">
          <div className="verified-badge">OFFICIAL SCHOOL RECORD</div>
          <h2>Academic report</h2>
          <p>Academic year {activeYear || year} · {selectedTerm === 'all' ? 'All terms' : selectedTerm}</p>
        </div>
      </header>

      <section className="student-info-grid" aria-label="Student details">
        <div className="info-item"><span>Student</span><b>{student.profiles?.full_name || 'Student'}</b></div>
        <div className="info-item"><span>Admission number</span><b>{student.admission_number || '—'}</b></div>
        <div className="info-item"><span>Class</span><b>{student.classes?.name || '—'}</b></div>
        <div className="info-item"><span>Issued</span><b>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: school?.timezone || 'Africa/Nairobi' }).format(new Date())}</b></div>
      </section>

      {years.length > 0 && <section className="report-period no-print" aria-label="Choose report period">
        <label>Academic year<select value={activeYear} onChange={event => { setSelectedYear(event.target.value); setSelectedTerm('all') }}>{years.map(period => <option key={period} value={period}>{period}</option>)}</select></label>
        <label>Term<select value={selectedTerm} onChange={event => setSelectedTerm(event.target.value)}><option value="all">All terms</option>{terms.map(term => <option key={term} value={term}>{term}</option>)}</select></label>
      </section>}

      <div className="report-table-wrap">
        <table className="results-table">
          <thead><tr><th>Subject</th><th>Score</th><th>Grade</th><th>Teacher remarks</th></tr></thead>
          <tbody>
            {periodResults.map((result, index) => {
              const score = Number(result.score) || 0
              const max = Number(result.exams?.max_score) || 0
              const grade = getGrade(max ? score / max * 100 : 0, gradingScale)
              return <tr key={`${result.exams?.name || 'result'}-${index}`}><td>{result.exams?.subjects?.name || 'Subject'}</td><td><b>{formatScore(score)}{max ? ` / ${formatScore(max)}` : ''}</b></td><td><span className="badge" style={{ '--grade-color': grade.color }}>{grade.label}</span></td><td className="remarks">{result.remarks || '—'}</td></tr>
            })}
          </tbody>
        </table>
        {!periodResults.length && <p className="report-no-results">No results have been published for this period yet.</p>}
      </div>

      {!!Object.keys(subjectProgress).length && <section className="report-progress" aria-label="Subject progress summary">
        <h3>Progress by subject</h3>
        <p>Weighted averages for the selected report period.</p>
        <div className="report-progress-list">{Object.entries(subjectProgress).map(([subject, total]) => {
          const score = total.max ? total.score / total.max * 100 : 0
          const grade = getGrade(score, gradingScale)
          return <div className="report-progress-row" key={subject}><div><b>{subject}</b><span>{score.toFixed(1)}% · Grade {grade.label}</span></div><div className="report-progress-track"><i style={{ width: `${Math.min(100, score)}%`, background: grade.color }} /></div></div>
        })}</div>
      </section>}

      <section className="conduct-summary">
        <h3>Personal development</h3>
        <div className="conduct-grid">
          <div className="conduct-stat"><span>Merit points</span><b className="merit-color">{merits}</b></div>
          <div className="conduct-stat"><span>Conduct points</span><b className="demerit-color">{demerits}</b></div>
        </div>
      </section>

      <footer className="report-summary">
        <div className="summary-box">
          <div className="summary-item"><span>Total marks</span><b>{formatScore(totals.score)} / {formatScore(totals.max)}</b></div>
          <div className="summary-item"><span>Weighted average</span><b>{average.toFixed(1)}%</b></div>
          <div className="summary-item"><span>Overall grade</span><b style={{ color: overallGrade.color }}>{periodResults.length ? overallGrade.label : '—'}</b></div>
        </div>
        <div className="signature-area">
          <div className="sig">
            {student.classes?.teacher?.signature_url && <img src={student.classes.teacher.signature_url} alt="Class teacher signature" className="sig-img" />}
            <div className="line" /><span>{student.classes?.teacher?.full_name || 'Class teacher'} signature</span>
          </div>
          <div className="sig">
            {school?.principal_signature_url && <img src={school.principal_signature_url} alt="School head signature" className="sig-img" />}
            <div className="line" /><span>{school?.school_level?.toLowerCase().includes('primary') ? 'Head teacher' : 'Principal'} signature</span>
          </div>
        </div>
      </footer>
    </article>
  </div>
}
