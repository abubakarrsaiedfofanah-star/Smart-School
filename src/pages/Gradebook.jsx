import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { queueOfflineWrite, syncOfflineWrites } from '../lib/offlineQueue';
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
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const sync = async () => {
      if (!navigator.onLine || !profile?.id || !supabase) return;
      try {
        const count = await syncOfflineWrites({ ownerId: profile.id, supabase });
        if (count) toast.success(`${count} offline attendance or grade entr${count === 1 ? 'y' : 'ies'} synced.`);
      } catch (error) { toast.error(`Offline work is still waiting to sync: ${error.message}`); }
    };
    update();
    void sync();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('online', sync);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('online', sync);
    };
  }, [profile?.id]);

  useEffect(() => {
    if (profile) fetchInitialData();
  }, [profile]);

  useEffect(() => {
    if (selectedAssignId && selectedExamId) fetchStudentsAndGrades();
  }, [selectedAssignId, selectedExamId]);

  async function fetchInitialData() {
    if (!supabase) { setLoading(false); return; }
    try {
      const [assRes, examsRes] = await Promise.all([
        supabase.from('teacher_subject_assignments').select('*, subjects(id, name), classes(id, name)').eq('teacher_id', profile.id).eq('school_id', profile.school_id),
        supabase.from('exams').select('id, name, max_score').eq('school_id', profile.school_id)
      ]);
      if (assRes.error) throw assRes.error;
      if (examsRes.error) throw examsRes.error;
      setAssignedSubjects((assRes.data || []).filter(a => a.subjects && a.classes).map(a => ({ id: a.id, name: a.subjects.name, class_name: a.classes.name, class_id: a.classes.id, subject_id: a.subjects.id })));
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
        supabase.from('students').select('id, admission_number, profiles(full_name)').eq('school_id', profile.school_id).eq('class_id', selected.class_id),
        supabase.from('results').select('student_id, score, remarks').eq('school_id', profile.school_id).eq('exam_id', selectedExamId).eq('subject_id', selected.subject_id)
      ]);
      if (stuRes.error) throw stuRes.error;
      if (resRes.error) throw resRes.error;
      setStudents(stuRes.data || []);
      const map = {}; (resRes.data || []).forEach(r => { map[r.student_id] = { score: r.score, remarks: r.remarks }; });
      setMarks(map);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  const handleMarkChange = (id, f, v) => setMarks(prev => ({ ...prev, [id]: { ...prev[id], [f]: v } }));

  async function saveAll() {
    if (!supabase) return;
    const selected = assignedSubjects.find(a => a.id === selectedAssignId);
    const exam = exams.find(item => item.id === selectedExamId);
    if (!selected || !exam) return;
    const enteredMarks = Object.entries(marks).filter(([, mark]) => mark.score !== '' && mark.score !== null && mark.score !== undefined);
    if (!enteredMarks.length) return toast.error('Enter at least one mark before saving.');
    const maxScore = Number(exam.max_score) || 100;
    const invalidMark = enteredMarks.find(([, mark]) => !Number.isFinite(Number(mark.score)) || Number(mark.score) < 0 || Number(mark.score) > maxScore);
    if (invalidMark) return toast.error(`Marks must be between 0 and ${maxScore}.`);
    setSaving(true);
    try {
      const payload = enteredMarks.map(([id, mark]) => ({ school_id: profile.school_id, exam_id: selectedExamId, subject_id: selected.subject_id, student_id: id, score: Number(mark.score), remarks: mark.remarks || '', published: true }));
      if (!navigator.onLine) {
        await queueOfflineWrite({ ownerId: profile.id, schoolId: profile.school_id, table: 'results', payload });
        toast.success('Grades saved on this device. They will sync when you reconnect.');
        return;
      }
      const { error } = await supabase.from('results').upsert(payload, { onConflict: 'exam_id,student_id' });
      if (error) throw error;
      toast.success('Grades saved and published.');
      await fetchStudentsAndGrades();
    } catch (err) {
      if (!navigator.onLine) {
        try {
          const payload = enteredMarks.map(([id, mark]) => ({ school_id: profile.school_id, exam_id: selectedExamId, subject_id: selected.subject_id, student_id: id, score: Number(mark.score), remarks: mark.remarks || '', published: true }));
          await queueOfflineWrite({ ownerId: profile.id, schoolId: profile.school_id, table: 'results', payload });
          toast.success('Connection dropped. Grades are queued on this device.');
        } catch (queueError) { toast.error(`Could not save offline: ${queueError.message}`); }
      } else toast.error(err.message);
    } finally { setSaving(false); }
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
        .gradebook-controls { display:flex; gap:20px; margin-bottom:30px; }
        .gradebook-controls select { min-width:0; }
        @media(max-width:700px) {
          .gradebook-page { padding:20px 12px; }
          .gb-header { align-items:flex-start; gap:12px; }
          .gradebook-controls { flex-direction:column; gap:10px !important; padding:16px !important; }
          .gb-table thead { display:none; }
          .gb-table, .gb-table tbody, .gb-table tr, .gb-table td { display:block; width:100%; }
          .gb-table tr { padding:12px; border-bottom:1px solid var(--line); }
          .gb-table td { display:grid; grid-template-columns:minmax(88px, .7fr) minmax(0, 1.3fr); gap:10px; padding:7px 0; border:0; }
          .gb-table td::before { content:attr(data-label); color:var(--muted); font-size:.72rem; font-weight:700; }
          .gb-table td input { width:100% !important; min-width:0; }
          .save-bar { align-items:stretch !important; flex-direction:column; }
          .save-bar button { min-height:46px; }
        }
      `}</style>

      <header className="gb-header">
        <div><p className="eyebrow">Data Integrity</p><h1>Academic Gradebook</h1><small role="status">{online ? 'Online · changes sync immediately' : 'Offline · changes stay on this device until synced'}</small></div>
        <button className="button outline-button tactile-btn" onClick={() => navigate('/portal')}>← Back</button>
      </header>

      <div className="security-banner">🛡️ <b>Strict Authorization:</b> You can only modify records for subjects and classes assigned to your staff profile.</div>

      <div className="glass-card neumorph-flat gradebook-controls">
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
                  <td data-label="Student"><b>{s.profiles?.full_name}</b></td>
                  <td data-label="Admission no."><small>{s.admission_number}</small></td>
              <td data-label="Marks"><input type="number" min="0" max={exams.find(exam => exam.id === selectedExamId)?.max_score || 100} step="any" aria-label={`Marks for ${s.profiles?.full_name || s.admission_number}`} style={{width:'80px'}} value={marks[s.id]?.score ?? ''} onChange={e => handleMarkChange(s.id, 'score', e.target.value)} /></td>
                  <td data-label="Remarks"><input style={{width:'100%'}} value={marks[s.id]?.remarks || ''} aria-label={`Remarks for ${s.profiles?.full_name || s.admission_number}`} onChange={e => handleMarkChange(s.id, 'remarks', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="save-bar" style={{marginTop:'30px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <p style={{color:'var(--muted)'}}>Saved grades are published to student and parent portals.</p>
            <button className="button blue-button tactile-btn" onClick={saveAll} disabled={saving}>{saving ? 'Saving...' : 'Save and publish grades'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
