import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import '../styles/academic-reports.css';

const getGrade = (score) => {
  if (score >= 80) return { label: 'A', color: '#11966a' };
  if (score >= 70) return { label: 'B', color: '#1cb681' };
  if (score >= 60) return { label: 'C', color: '#ffa500' };
  if (score >= 50) return { label: 'D', color: '#ff7c7c' };
  return { label: 'E', color: '#ff4d4d' };
};

export default function AcademicReport() {
  const { studentId } = useParams();
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [behavior, setBehavior] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Handle Demo Data
        if (studentId.startsWith('ST-DEMO') || !supabase) {
          const demoStudent = {
            admission_number: studentId,
            profiles: { full_name: studentId.includes('1') ? 'Amina Hassan' : studentId.includes('2') ? 'Yusuf Hassan' : 'Mary Hassan' },
            classes: { name: studentId.includes('1') ? 'Grade 5A' : studentId.includes('2') ? 'Grade 8B' : 'Grade 10A' }
          };
          const demoResults = [
            { score: 85, remarks: 'Excellent work', exams: { name: 'Term 2 Mid', max_score: 100, subjects: { name: 'Mathematics' } } },
            { score: 78, remarks: 'Good progress', exams: { name: 'Term 2 Mid', max_score: 100, subjects: { name: 'English' } } },
            { score: 92, remarks: 'Brilliant!', exams: { name: 'Term 2 Mid', max_score: 100, subjects: { name: 'Science' } } },
            { score: 64, remarks: 'Needs more effort', exams: { name: 'Term 2 Mid', max_score: 100, subjects: { name: 'History' } } }
          ];
          const demoBehavior = [
            { type: 'merit', points: 5, category: 'Helpfulness', comment: 'Assisted in library organization.' },
            { type: 'merit', points: 3, category: 'Academic', comment: 'Outstanding participation in Science.' }
          ];
          setTimeout(() => {
            setData({ student: demoStudent, results: demoResults });
            setBehavior(demoBehavior);
            setLoading(false);
          }, 600);
          return;
        }

        // 1. Fetch Student & Profile & Class & School & Teacher
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select(`
            *,
            profiles:profile_id (full_name),
            classes:class_id (
              name,
              teacher:teacher_id (
                full_name,
                signature_url
              )
            ),
            schools:school_id (
              name,
              logo_url,
              principal_signature_url,
              school_motto,
              school_level
            )
          `)
          .eq('id', studentId)
          .single();

        if (studentError) throw studentError;

        if (studentError) throw studentError;

        // 2. Fetch Results with Exams and Subjects
        const { data: results, error: resultsError } = await supabase
          .from('results')
          .select(`
            score,
            remarks,
            exams:exam_id (name, max_score, subjects:subject_id (name))
          `)
          .eq('student_id', studentId);

        if (resultsError) throw resultsError;

        // 3. Fetch Behavior Records
        const { data: behaviorData } = await supabase
          .from('behavior_records')
          .select('*')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false });

        setData({ student, results });
        setBehavior(behaviorData || []);
      } catch (e) {
        toast.error('Failed to load report card');
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [studentId]);

  if (loading) return <div className="portal-loading"><div className="spinner"></div><p>Generating report card...</p></div>;
  if (!data || !data.student) return <div className="error-state">Report card not found.</div>;

  const { student, results } = data;
  const totalScore = results.reduce((acc, r) => acc + Number(r.score), 0);
  const totalMax = results.reduce((acc, r) => acc + Number(r.exams.max_score), 0);
  const average = results.length ? (totalScore / results.length).toFixed(1) : 0;
  const overallGrade = getGrade(average);

  return (
    <div className="report-page page-transition">
      <nav className="no-print report-nav">
        <Link to="/portal" className="back-btn">← Back to Dashboard</Link>
        <button className="button blue-button" onClick={() => window.print()}>Print Report Card 🖨️</button>
      </nav>

      <div className="report-card printable">
        <header className="report-header">
          <div className="school-branding">
            {student.schools?.logo_url ? (
              <img src={student.schools.logo_url} alt="School Logo" className="report-logo" />
            ) : (
              <div className="brand">{student.schools?.name || 'Smart<span>School</span>'}</div>
            )}
            <div className="school-type-badge">{student.schools?.school_level?.toUpperCase()}</div>
            {student.schools?.school_motto && <p className="school-motto">{student.schools.school_motto}</p>}
          </div>
          <div className="report-title">
            <div className="verified-badge">✓ VERIFIED BY AUTHORIZED TEACHER</div>
            <h1>Student Academic Report</h1>
            <p>Academic Year 2025/2026</p>
          </div>
        </header>

        <section className="student-info-grid">
          <div className="info-item"><span>Student Name</span><b>{student.profiles?.full_name}</b></div>
          <div className="info-item"><span>Admission No</span><b>{student.admission_number}</b></div>
          <div className="info-item"><span>Class</span><b>{student.classes?.name}</b></div>
          <div className="info-item"><span>Report Date</span><b>{new Date().toLocaleDateString()}</b></div>
        </section>

        <table className="results-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Exam Name</th>
              <th>Score</th>
              <th>Max</th>
              <th>Grade</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const grade = getGrade(r.score);
              return (
                <tr key={i}>
                  <td>{r.exams.subjects?.name}</td>
                  <td>{r.exams.name}</td>
                  <td><b>{r.score}</b></td>
                  <td>{r.exams.max_score}</td>
                  <td><span className="badge" style={{backgroundColor: grade.color}}>{grade.label}</span></td>
                  <td className="remarks">{r.remarks}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <section className="conduct-summary">
          <h3>Conduct & Behavioral Summary</h3>
          <div className="conduct-grid">
            <div className="conduct-stat">
              <span>Total Merits</span>
              <b className="merit-color">{behavior.filter(b => b.type === 'merit').reduce((a, c) => a + c.points, 0)}</b>
            </div>
            <div className="conduct-stat">
              <span>Total Demerits</span>
              <b className="demerit-color">{behavior.filter(b => b.type === 'demerit').reduce((a, c) => a + c.points, 0)}</b>
            </div>
          </div>
          <div className="recent-behavior">
            {behavior.slice(0, 3).map((b, i) => (
              <div key={i} className={`behavior-pill ${b.type}`}>
                {b.type === 'merit' ? '🌟' : '⚠️'} {b.category}: {b.comment}
              </div>
            ))}
          </div>
        </section>

        <footer className="report-summary">
          <div className="summary-box">
            <div className="summary-item"><span>Total Score</span><b>{totalScore} / {totalMax}</b></div>
            <div className="summary-item"><span>Mean Grade</span><b style={{color: overallGrade.color}}>{overallGrade.label}</b></div>
            <div className="summary-item"><span>Average Score</span><b>{average}%</b></div>
          </div>

          <div className="signature-area">
            <div className="sig">
              {student.classes?.teacher?.signature_url && <img src={student.classes.teacher.signature_url} alt="Teacher Sig" className="sig-img" />}
              <div className="line"></div>
              <span>{student.classes?.teacher?.full_name || "Class Teacher"}'s Signature</span>
            </div>
            <div className="sig">
              {student.schools?.principal_signature_url && <img src={student.schools.principal_signature_url} alt="Admin Sig" className="sig-img" />}
              <div className="line"></div>
              <span>{student.schools?.school_level?.toLowerCase().includes('primary') ? "Headmaster" : "Principal"}'s Signature</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
