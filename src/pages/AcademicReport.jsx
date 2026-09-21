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
  const [data, setData] = useState(null);
  const [behavior, setBehavior] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId || !supabase) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [studentRes, resultsRes, behaviorRes] = await Promise.all([
          supabase.from('students').select(`*, profiles:profile_id(full_name), classes:class_id(name, teacher:teacher_id(full_name, signature_url)), schools:school_id(name, logo_url, principal_signature_url, school_motto, school_level)`).eq('id', studentId).single(),
          supabase.from('results').select(`score, remarks, exams:exam_id(name, max_score, subjects:subject_id(name))`).eq('student_id', studentId),
          supabase.from('behavior_records').select('*').eq('student_id', studentId).order('created_at', { ascending: false })
        ]);

        if (studentRes.error) throw studentRes.error;
        setData({ student: studentRes.data, results: resultsRes.data || [] });
        setBehavior(behaviorRes.data || []);
      } catch (e) { toast.error('Failed to load report card'); console.error(e); } finally { setLoading(false); }
    };
    fetchData();
  }, [studentId]);

  if (loading) return <div className="portal-loading"><div className="spinner"></div><p>Generating Institutional Report...</p></div>;
  if (!data?.student) return <div className="error-state" style={{textAlign:'center', marginTop:'100px'}}><h2>Report Not Found</h2><Link to="/portal">Back to Dashboard</Link></div>;

  const { student, results } = data;
  const totalScore = results.reduce((acc, r) => acc + Number(r.score), 0);
  const totalMax = results.reduce((acc, r) => acc + Number(r.exams?.max_score || 0), 0);
  const average = results.length ? (totalScore / results.length).toFixed(1) : 0;
  const overallGrade = getGrade(average);

  return (
    <div className="report-page page-transition">
      <nav className="no-print report-nav" style={{display:'flex', justifyContent:'space-between', padding:'20px 40px', background:'var(--bg)'}}>
        <Link to="/portal" className="back-btn">← Back to Dashboard</Link>
        <button className="button blue-button tactile-btn" onClick={() => window.print()}>Print Report Card 🖨️</button>
      </nav>

      <div className="report-card printable">
        <header className="report-header" style={{textAlign:'center', marginBottom:'40px'}}>
          <div className="school-branding">
            {student.schools?.logo_url && <img src={student.schools.logo_url} alt="Logo" className="report-logo" />}
            <h1 style={{margin:0}}>{student.schools?.name}</h1>
            <div className="school-type-badge">{student.schools?.school_level?.toUpperCase()}</div>
            <p className="school-motto">{student.schools?.school_motto}</p>
          </div>
          <div className="report-title" style={{marginTop:'20px'}}>
            <div className="verified-badge">✓ AUTHORIZED INSTITUTIONAL RECORD</div>
            <h2>Student Academic Report</h2>
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
          <thead><tr><th>Subject</th><th>Score</th><th>Max</th><th>Grade</th><th>Remarks</th></tr></thead>
          <tbody>
            {results.map((r, i) => {
              const grade = getGrade(r.score);
              return <tr key={i}><td>{r.exams?.subjects?.name}</td><td><b>{r.score}</b></td><td>{r.exams?.max_score}</td><td><span className="badge" style={{backgroundColor: grade.color}}>{grade.label}</span></td><td className="remarks">{r.remarks}</td></tr>
            })}
          </tbody>
        </table>

        <section className="conduct-summary">
          <h3>Conduct & Behavioral Summary</h3>
          <div className="conduct-grid">
            <div className="conduct-stat"><span>Total Merits</span><b className="merit-color">{behavior.filter(b => b.type === 'merit').reduce((a, c) => a + c.points, 0)}</b></div>
            <div className="conduct-stat"><span>Total Demerits</span><b className="demerit-color">{behavior.filter(b => b.type === 'demerit').reduce((a, c) => a + c.points, 0)}</b></div>
          </div>
        </section>

        <footer className="report-summary">
          <div className="summary-box">
            <div className="summary-item"><span>Total Score</span><b>{totalScore} / {totalMax}</b></div>
            <div className="summary-item"><span>Average Score</span><b>{average}%</b></div>
            <div className="summary-item"><span>Mean Grade</span><b style={{color: overallGrade.color}}>{overallGrade.label}</b></div>
          </div>

          <div className="signature-area">
            <div className="sig">
              {student.classes?.teacher?.signature_url && <img src={student.classes.teacher.signature_url} className="sig-img" />}
              <div className="line"></div>
              <span>{student.classes?.teacher?.full_name || "Class Teacher"}'s Signature</span>
            </div>
            <div className="sig">
              {student.schools?.principal_signature_url && <img src={student.schools.principal_signature_url} className="sig-img" />}
              <div className="line"></div>
              <span>{student.schools?.school_level?.toLowerCase().includes('primary') ? "Headmaster" : "Principal"}'s Signature</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
