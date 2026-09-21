import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function LessonPlans() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [studentSubjects, setSubjects] = useState([]);
  const [isTeacher, setIsTeacher] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterSubjectId, setFilterSubjectId] = useState('all');
  const [formData, setFormData] = useState({ title: '', assignment_id: '', content: '' });
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (profile) {
      setIsTeacher(['teacher', 'school_admin'].includes(profile.role));
      fetchInitialData();
    }
  }, [profile]);

  useEffect(() => {
    fetchPlans();
  }, [filterSubjectId]);

  async function fetchInitialData() {
    if (!supabase) return;
    try {
      if (profile.role === 'teacher') {
        const { data } = await supabase.from('teacher_subject_assignments').select('*, subjects(id, name), classes(id, name)').eq('teacher_id', profile.id);
        setAssignedSubjects((data || []).map(d => ({ id: d.subjects.id, name: d.subjects.name, class_id: d.classes.id, class_name: d.classes.name, assignment_id: d.id })));
      } else if (profile.role === 'student') {
        const { data } = await supabase.from('subjects').select('*').eq('school_id', profile.school_id);
        setSubjects(data || []);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function fetchPlans() {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase.from('lesson_plans').select('*, subjects(name), classes(name)').eq('school_id', profile.school_id);
      if (filterSubjectId !== 'all') query = query.eq('subject_id', filterSubjectId);
      const { data } = await query.order('created_at', { ascending: false });
      setPlans(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase || !formData.assignment_id) return;
    setUploading(true);
    try {
      const selected = assignedSubjects.find(s => s.assignment_id === formData.assignment_id);
      let filePath = null;
      if (file) {
        const fileName = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('resources').upload(`lessons/${fileName}`, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('resources').getPublicUrl(`lessons/${fileName}`);
        filePath = publicUrl;
      }
      const { error } = await supabase.from('lesson_plans').insert({ title: formData.title, content: formData.content, subject_id: selected.id, class_id: selected.class_id, school_id: profile.school_id, teacher_id: profile.id, file_path: filePath });
      if (error) throw error;
      toast.success('Lesson published!');
      fetchPlans();
      setFormData({ title: '', assignment_id: '', content: '' }); setFile(null);
    } catch (err) { toast.error(err.message); } finally { setUploading(false); }
  }

  if (loading && plans.length === 0) return <div className="portal-loading"><div className="spinner"></div><p>Opening Institutional Repository...</p></div>;

  return (
    <div className="lessons-page page-transition">
      <style>{`
        .lessons-page { max-width: 1100px; margin: 40px auto; padding: 0 24px; }
        .lessons-grid { display: grid; grid-template-columns: ${isTeacher ? '350px 1fr' : '1fr'}; gap: 30px; }
        .plan-card { padding: 25px; margin-bottom: 20px; transition: transform 0.2s; position: relative; }
        .glass-input, .glass-textarea { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 15px; background: var(--bg); color: var(--ink); }
      `}</style>

      <p className="eyebrow">Institutional Repository</p>
      <h1>{isTeacher ? 'Curriculum Management' : 'Academic Notes'}</h1>

      <div className="glass-card" style={{display:'flex', gap:'15px', alignItems:'center', marginBottom:'30px'}}>
        <span>Filter by Subject:</span>
        <select value={filterSubjectId} onChange={e => setFilterSubjectId(e.target.value)} style={{width:'auto'}}>
          <option value="all">All Subjects</option>
          {(isTeacher ? assignedSubjects : studentSubjects).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="lessons-grid">
        {isTeacher && (
          <form className="glass-card" onSubmit={handleSubmit} style={{ height: 'fit-content', position: 'sticky', top: '40px' }}>
            <h3>New Entry</h3>
            <input className="glass-input" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Lesson Title" required />
            <select className="glass-input" value={formData.assignment_id} onChange={e => setFormData({ ...formData, assignment_id: e.target.value })} required>
              <option value="">-- Choose Subject/Class --</option>
              {assignedSubjects.map(s => <option key={s.assignment_id} value={s.assignment_id}>{s.name} ({s.class_name})</option>)}
            </select>
            <textarea className="glass-textarea" style={{ minHeight: '120px' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} placeholder="Write notes here..." required />
            <input type="file" className="glass-input" onChange={e => setFile(e.target.files[0])} />
            <button className="button blue-button full tactile-btn" disabled={uploading}>{uploading ? 'Processing...' : 'Publish to Class 🚀'}</button>
          </form>
        )}

        <div className="plans-list">
          {plans.length === 0 ? <p style={{textAlign:'center', color:'var(--muted)', padding:'40px'}}>No records found for the selected subject.</p> : plans.map(p => (
            <div key={p.id} className="plan-card glass-card neumorph-flat page-transition">
              <div style={{display:'flex', gap:'10px', marginBottom:'12px'}}><span className="badge" style={{background:'var(--cream)', color:'var(--green)', fontSize:'0.65rem'}}>{p.subjects?.name}</span><span className="badge" style={{background:'#fef3c7', color:'#92400e', fontSize:'0.65rem'}}>{p.classes?.name}</span></div>
              {p.file_path && <button className="mini outline tactile-btn" style={{position:'absolute', top:'20px', right:'20px'}} onClick={() => window.open(p.file_path, '_blank')}>📥 Download</button>}
              <h3>{p.title}</h3>
              <p style={{color:'var(--muted)', lineHeigh:'1.6'}}>{p.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
