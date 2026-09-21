import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Gradebook() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState([]);
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedAssignId, setSelectedAssignId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [marks, setMarks] = useState({});

  useEffect(() => {
    if (profile) fetchInitialData();
  }, [profile]);

  useEffect(() => {
    if (selectedAssignId && selectedExamId) fetchStudentsAndGrades();
  }, [selectedAssignId, selectedExamId]);

  async function fetchInitialData() {
    if (!supabase) return;
    try {
      const [assRes, examsRes] = await Promise.all([
        supabase.from('teacher_subject_assignments').select('*, subjects(id, name), classes(id, name)').eq('teacher_id', profile.id),
        supabase.from('exams').select('id, name').eq('school_id', profile.school_id)
      ]);
      setAssignedSubjects((assRes.data || []).map(a => ({ id: a.id, name: a.subjects.name, class_name: a.classes.name, class_id: a.classes.id, subject_id: a.subjects.id })));
      setExams(examsRes.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function fetchStudentsAndGrades() {
    if (!supabase) return;
    setLoading(true);
    try {
      const selected = assignedSubjects.find(a => a.id === selectedAssignId);
      if (!selected) return;
      const [stuRes, resRes] = await Promise.all([
        supabase.from('students').select('id, admission_number, profiles(full_name)').eq('class_id', selected.class_id),
        supabase.from('results').select('student_id, score, remarks').eq('exam_id', selectedExamId).eq('subject_id', selected.subject_id)
      ]);
      setStudents(stuRes.data || []);
      const map = {}; (resRes.data || []).forEach(r => { map[r.student_id] = { score: r.score, remarks: r.remarks }; });
      setMarks(map);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  const handleMarkChange = (id, f, v) => setMarks(prev => ({ ...prev, [id]: { ...prev[id], [f]: v } }));

  async function saveAll() {
    if (!supabase) return;
    const selected = assignedSubjects.find(a => a.id === selectedAssignId);
    if (!selected || !selectedExamId) return;
    setSaving(true);
    try {
      const payload = Object.entries(marks).map(([id, d]) => ({ school_id: profile.school_id, exam_id: selectedExamId, subject_id: selected.subject_id, student_id: id, score: parseFloat(d.score) || 0, remarks: d.remarks })).filter(r => r.score > 0);
      const { error } = await supabase.from('results').upsert(payload, { onConflict: 'exam_id,student_id,subject_id' });
      if (error) throw error;
      toast.success('Authorized grades saved!');
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  if (loading && exams.length === 0) return <div className="portal-loading"><div className="spinner"></div><p>Verifying Credentials...</p></div>;

  return (
    <div className="gradebook-page page-transition">
      <style>{`
        .gradebook-page { padding: 40px 24px; max-width: 1200px; margin: 0 auto; }
        .gb-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .security-banner { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 12px 20px; border-radius: 12px; font-size: 0.85rem; margin-bottom: 30px; }
        .gb-table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: var(--radius); overflow: hidden; }
        .gb-table th { text-align: left; padding: 15px 20px; background: var(--ink); color: #fff; font-size: 0.8rem; }
        .gb-table td { padding: 12px 20px; border-bottom: 1px solid var(--line); }
      `}</style>

      <header className="gb-header">
        <div><p className="eyebrow">Data Integrity</p><h1>Academic Gradebook</h1></div>
        <button className="button outline-button tactile-btn" onClick={() => navigate('/portal')}>← Back</button>
      </header>

      <div className="security-banner">🛡️ <b>Strict Authorization:</b> You can only modify records for subjects and classes assigned to your staff profile.</div>

      <div className="glass-card neumorph-flat" style={{display:'flex', gap:'20px', marginBottom:'30px'}}>
        <select style={{flex:1}} value={selectedAssignId} onChange={e => setSelectedAssignId(e.target.value)}>
          <option value="">-- Choose Assigned Subject --</option>
          {assignedSubjects.map(a => <option key={a.id} value={a.id}>{a.name} ({a.class_name})</option>)}
        </select>
        <select style={{width:'200px'}} value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}>
          <option value="">-- Select Exam --</option>
          {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {students.length > 0 && (
        <div className="table-wrap">
          <table className="gb-table">
            <thead><tr><th>Student</th><th>Adm No</th><th>Marks</th><th>Remarks</th></tr></thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td><b>{s.profiles?.full_name}</b></td>
                  <td><small>{s.admission_number}</small></td>
                  <td><input type="number" style={{width:'80px'}} value={marks[s.id]?.score || ''} onChange={e => handleMarkChange(s.id, 'score', e.target.value)} /></td>
                  <td><input style={{width:'100%'}} value={marks[s.id]?.remarks || ''} onChange={e => handleMarkChange(s.id, 'remarks', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="save-bar" style={{marginTop:'30px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <p style={{color:'var(--muted)'}}>All changes are immutable and logged.</p>
            <button className="button blue-button tactile-btn" onClick={saveAll} disabled={saving}>{saving ? 'Saving...' : 'Authorize & Save All Grades'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
