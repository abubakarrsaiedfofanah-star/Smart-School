import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Gradebook() {
  const { profile, demo } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState([]);
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedAssignId, setSelectedAssignId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [marks, setMarks] = useState({}); // { studentId: { score: '', remarks: '' } }

  useEffect(() => {
    if (!profile) return;
    fetchInitialData();
  }, [profile]);

  useEffect(() => {
    if (selectedAssignId && selectedExamId) {
      fetchStudentsAndGrades();
    }
  }, [selectedAssignId, selectedExamId]);

  async function fetchInitialData() {
    try {
      if (!supabase || demo) {
        setAssignedSubjects([{ id: 'as1', name: 'Biology', class_name: 'Grade 8', class_id: 'c1', subject_id: 's1' }, { id: 'as2', name: 'Math', class_name: 'Grade 7', class_id: 'c2', subject_id: 's2' }]);
        setExams([{ id: 'e1', name: 'Term 2 Mid' }, { id: 'e2', name: 'Term 2 Final' }]);
        setLoading(false);
        return;
      }

      const { data: assignments } = await supabase
        .from('teacher_subject_assignments')
        .select('*, subjects(id, name), classes(id, name)')
        .eq('teacher_id', profile.id);

      const { data: examsRes } = await supabase.from('exams').select('id, name').eq('school_id', profile.school_id);

      setAssignedSubjects((assignments || []).map(a => ({
        id: a.id,
        name: a.subjects.name,
        class_name: a.classes.name,
        class_id: a.classes.id,
        subject_id: a.subjects.id
      })));
      setExams(examsRes || []);
    } catch (err) {
      toast.error('Failed to load authorization data');
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudentsAndGrades() {
    setLoading(true);
    try {
      const selected = assignedSubjects.find(a => a.id === selectedAssignId);
      if (!selected) return;

      if (!supabase || demo) {
        setStudents([{ id: 's1', profiles: { full_name: 'Amina Hassan' }, admission_number: 'ST001' }]);
        setMarks({ 's1': { score: '85', remarks: 'Good' } });
        setLoading(false);
        return;
      }

      const { data: studentsData } = await supabase.from('students').select('id, admission_number, profiles(full_name)').eq('class_id', selected.class_id);
      const { data: resultsData } = await supabase.from('results').select('student_id, score, remarks').eq('exam_id', selectedExamId).eq('subject_id', selected.subject_id);

      setStudents(studentsData || []);
      const marksMap = {};
      (resultsData || []).forEach(r => { marksMap[r.student_id] = { score: r.score, remarks: r.remarks }; });
      setMarks(marksMap);
    } catch (err) {
      toast.error('Failed to load class list');
    } finally {
      setLoading(false);
    }
  }

  const handleMarkChange = (studentId, field, value) => {
    setMarks(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }));
  };

  async function saveAll() {
    const selected = assignedSubjects.find(a => a.id === selectedAssignId);
    if (!selected || !selectedExamId) return;
    setSaving(true);
    try {
      const payload = Object.entries(marks).map(([studentId, data]) => ({
        school_id: profile.school_id,
        exam_id: selectedExamId,
        subject_id: selected.subject_id,
        student_id: studentId,
        score: parseFloat(data.score) || 0,
        remarks: data.remarks
      })).filter(r => r.score > 0);

      const { error } = await supabase.from('results').upsert(payload, { onConflict: 'exam_id,student_id,subject_id' });
      if (error) throw error;
      toast.success('Authorized grades saved!');
    } catch (err) {
      toast.error('Security/Data Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gradebook-page page-transition">
      <style>{`
        .gradebook-page { padding: 40px 24px; max-width: 1200px; margin: 0 auto; }
        .gb-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .security-banner { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 12px 20px; border-radius: 12px; font-size: 0.85rem; margin-bottom: 30px; display: flex; align-items: center; gap: 10px; }
        .gb-table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: var(--radius); overflow: hidden; }
        .gb-table th { text-align: left; padding: 15px 20px; background: var(--ink); color: #fff; font-size: 0.8rem; }
        .gb-table td { padding: 12px 20px; border-bottom: 1px solid var(--line); }
        .save-bar { position: sticky; bottom: 100px; background: var(--panel); padding: 20px; border-radius: 50px; border: 1px solid var(--green); display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow); margin-top: 40px; }
      `}</style>

      <header className="gb-header">
        <div><p className="eyebrow">AUTHORIZED GRADING</p><h1>Gradebook</h1></div>
        <button className="button outline-button" onClick={() => navigate('/portal')}>← Back</button>
      </header>

      <div className="security-banner">
        <span>🛡️</span> <b>Authorized Subjects Only:</b> You can only enter grades for subjects and classes specifically assigned to you by the administrator.
      </div>

      <div className="controls glass-card" style={{display:'flex', gap:'20px', marginBottom:'30px'}}>
        <select value={selectedAssignId} onChange={e => setSelectedAssignId(e.target.value)}>
          <option value="">-- Choose Assigned Subject/Class --</option>
          {assignedSubjects.map(a => <option key={a.id} value={a.id}>{a.name} ({a.class_name})</option>)}
        </select>
        <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}>
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
          <div className="save-bar">
            <span>Secure upload enabled.</span>
            <button className="button blue-button" onClick={saveAll} disabled={saving}>{saving ? 'Saving...' : 'Confirm & Save All Grades →'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
