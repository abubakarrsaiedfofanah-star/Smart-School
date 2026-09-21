import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function LessonPlans() {
  const { profile, demo } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [assignedSubjects, setAssignedSubjects] = useState([]);
  const [studentSubjects, setSubjects] = useState([]);
  const [isTeacher, setIsTeacher] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Filter states
  const [filterSubjectId, setFilterSubjectId] = useState('all');

  // Form state
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
    try {
      if (demo) {
        setAssignedSubjects([{ id: 's1', name: 'Biology', class_name: 'Grade 8' }, { id: 's2', name: 'Math', class_name: 'Grade 7' }]);
        setSubjects([{ id: 's1', name: 'Biology' }, { id: 's2', name: 'Math' }]);
        setLoading(false);
        return;
      }

      if (profile.role === 'teacher') {
        // Fetch specific assignments for this teacher
        const { data } = await supabase
          .from('teacher_subject_assignments')
          .select('*, subjects(id, name), classes(id, name)')
          .eq('teacher_id', profile.id);

        const mapped = (data || []).map(d => ({
          id: d.subjects.id,
          name: d.subjects.name,
          class_id: d.classes.id,
          class_name: d.classes.name,
          assignment_id: d.id
        }));
        setAssignedSubjects(mapped);
      } else if (profile.role === 'student') {
        const { data: student } = await supabase.from('students').select('class_id').eq('profile_id', profile.id).single();
        if (student) {
          const { data } = await supabase.from('subjects').select('*').eq('school_id', profile.school_id);
          setSubjects(data || []);
        }
      }
      setLoading(false);
    } catch (err) {
      toast.error('Initialization error');
    }
  }

  async function fetchPlans() {
    setLoading(true);
    try {
      if (demo) {
        setPlans([
          { id: 1, title: 'Introduction to Photosynthesis', subject_id: 's1', subjects: { name: 'Biology' }, classes: { name: 'Grade 8' }, content: 'Today we discuss how plants convert light to energy.' },
          { id: 2, title: 'Algebraic Expressions', subject_id: 's2', subjects: { name: 'Mathematics' }, classes: { name: 'Grade 7' }, content: 'Solving for x and basic variable manipulation.', file_path: 'demo.pdf' }
        ].filter(p => filterSubjectId === 'all' || p.subject_id === filterSubjectId));
        setLoading(false);
        return;
      }

      let query = supabase.from('lesson_plans').select('*, subjects(name), classes(name)').eq('school_id', profile.school_id);
      if (filterSubjectId !== 'all') query = query.eq('subject_id', filterSubjectId);

      const { data } = await query.order('created_at', { ascending: false });
      setPlans(data || []);
    } catch (err) {
      toast.error('Failed to load lesson plans');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.assignment_id) return toast.error('Please select a subject/class');

    setUploading(true);
    try {
      const selected = assignedSubjects.find(s => s.assignment_id === formData.assignment_id);
      let filePath = null;
      if (file) {
        const fileName = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('branding').upload(`lessons/${fileName}`, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(`lessons/${fileName}`);
        filePath = publicUrl;
      }

      const payload = {
        title: formData.title,
        content: formData.content,
        subject_id: selected.id,
        class_id: selected.class_id,
        school_id: profile.school_id,
        teacher_id: profile.id,
        file_path: filePath
      };

      const { error } = await supabase.from('lesson_plans').insert(payload);
      if (error) throw error;

      toast.success('Academic notes published!');
      fetchPlans();
      setFormData({ title: '', assignment_id: '', content: '' });
      setFile(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (loading && plans.length === 0) return <div className="portal-loading"><div className="spinner"></div></div>;

  return (
    <div className="lessons-page page-transition">
      <style>{`
        .lessons-page { max-width: 1100px; margin: 40px auto; padding: 0 24px; }
        .lessons-grid { display: grid; grid-template-columns: ${isTeacher ? '350px 1fr' : '1fr'}; gap: 30px; margin-top: 30px; }
        .filter-bar { display: flex; gap: 15px; align-items: center; margin-bottom: 20px; background: var(--panel); padding: 15px; border-radius: 16px; border: 1px solid var(--line); }
        .plan-card { padding: 25px; margin-bottom: 20px; transition: transform 0.2s; position: relative; }
        .plan-card:hover { transform: translateY(-5px); }
        .plan-meta { display: flex; gap: 10px; margin-bottom: 12px; }
        .badge { font-size: 0.65rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; }
        .badge.subject { background: var(--cream); color: var(--green); }
        .badge.class { background: #fef3c7; color: #92400e; }
        .plan-title { font-size: 1.2rem; font-weight: 800; margin-bottom: 10px; }
        .plan-content { color: var(--muted); line-height: 1.6; white-space: pre-wrap; margin-bottom: 20px; }
        .download-attachment { position: absolute; top: 25px; right: 25px; background: #2375e1; color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
      `}</style>

      <p className="eyebrow">ACADEMIC REPOSITORY</p>
      <h1>{isTeacher ? 'Lesson & Subject Management' : 'My Lesson Plans'}</h1>

      <div className="filter-bar">
        <span>Filter by Subject:</span>
        <select value={filterSubjectId} onChange={e => setFilterSubjectId(e.target.value)} style={{width:'auto'}}>
          <option value="all">All Subjects</option>
          {(isTeacher ? assignedSubjects : studentSubjects).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="lessons-grid">
        {isTeacher && (
          <form className="glass-card" onSubmit={handleSubmit} style={{ height: 'fit-content', position: 'sticky', top: '40px' }}>
            <h3>New Lesson Entry</h3>
            <div style={{ display: 'grid', gap: '15px', marginTop: '20px' }}>
              <label>Lesson Title<input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} required /></label>
              <label>Assign to Subject/Class
                <select value={formData.assignment_id} onChange={e => setFormData({ ...formData, assignment_id: e.target.value })} required>
                  <option value="">-- Choose Target --</option>
                  {assignedSubjects.map(s => <option key={s.assignment_id} value={s.assignment_id}>{s.name} ({s.class_name})</option>)}
                </select>
              </label>
              <label>Lesson Notes<textarea style={{ minHeight: '120px' }} value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} required /></label>
              <label>Upload Materials<input type="file" onChange={e => setFile(e.target.files[0])} /></label>
              <button className="button blue-button full" disabled={uploading}>{uploading ? 'Publishing...' : 'Publish to Class 🚀'}</button>
            </div>
          </form>
        )}

        <div className="plans-list">
          {plans.map(p => (
            <div key={p.id} className="plan-card glass-card page-transition">
              <div className="plan-meta"><span className="badge subject">{p.subjects?.name}</span><span className="badge class">{p.classes?.name}</span></div>
              {p.file_path && <button className="download-attachment" onClick={() => window.open(p.file_path, '_blank')}>📥 Download</button>}
              <div className="plan-title">{p.title}</div>
              <div className="plan-content">{p.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
