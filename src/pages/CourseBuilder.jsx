import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function CourseBuilder() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [loadingCourses, setLoadingCourses] = useState(true);
  const [submittingCourse, setSubmittingCourse] = useState(false);
  const [submittingChapter, setSubmittingChapter] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);

  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');
  const [courseSubjectId, setCourseSubjectId] = useState('');

  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [chapterVideoUrl, setChapterVideoUrl] = useState('');

  useEffect(() => {
    if (profile?.school_id) {
      loadInitialData();
    }
  }, [profile]);

  useEffect(() => {
    if (selectedCourse) {
      loadChapters(selectedCourse.id);
    } else {
      setChapters([]);
    }
  }, [selectedCourse]);

  async function loadInitialData() {
    if (!supabase) return;
    setLoadingCourses(true);
    try {
      const [subData, courseData] = await Promise.all([
        supabase.from('subjects').select('*').eq('school_id', profile.school_id).order('name'),
        supabase.from('courses').select('*, subjects(name)').eq('school_id', profile.school_id).order('created_at', { ascending: false })
      ]);
      setSubjects(subData.data || []);
      setCourses(courseData.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load courses.');
    } finally {
      setLoadingCourses(false);
    }
  }

  async function loadChapters(courseId) {
    if (!supabase) return;
    setLoadingChapters(true);
    try {
      const { data, error } = await supabase.from('course_chapters').select('*').eq('course_id', courseId).order('sort_order', { ascending: true });
      if (error) throw error;
      setChapters(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load chapters.');
    } finally {
      setLoadingChapters(false);
    }
  }

  async function handleCreateCourse(e) {
    e.preventDefault();
    if (!supabase || !courseTitle.trim()) return;
    setSubmittingCourse(true);
    try {
      const { data, error } = await supabase.from('courses').insert({
        school_id: profile.school_id,
        title: courseTitle.trim(),
        description: courseDesc.trim(),
        subject_id: courseSubjectId || null,
        teacher_id: profile.id
      }).select('*, subjects(name)').single();
      if (error) throw error;
      setCourses([data, ...courses]);
      setSelectedCourse(data);
      toast.success('Course structure initialized!');
      setCourseTitle(''); setCourseDesc(''); setCourseSubjectId('');
    } catch (err) {
      toast.error('Failed to create course');
    } finally {
      setSubmittingCourse(false);
    }
  }

  async function handleAddChapter(e) {
    e.preventDefault();
    if (!supabase || !selectedCourse || !chapterTitle.trim()) return;
    setSubmittingChapter(true);
    try {
      const nextSortOrder = chapters.length > 0 ? Math.max(...chapters.map(c => c.sort_order ?? 0)) + 1 : 0;
      const { data, error } = await supabase.from('course_chapters').insert({
        course_id: selectedCourse.id,
        title: chapterTitle.trim(),
        content_body: chapterContent.trim(),
        video_url: chapterVideoUrl.trim(),
        sort_order: nextSortOrder
      }).select('*').single();
      if (error) throw error;
      setChapters([...chapters, data]);
      toast.success('Chapter published!');
      setChapterTitle(''); setChapterContent(''); setChapterVideoUrl('');
    } catch (err) {
      toast.error('Failed to add chapter');
    } finally {
      setSubmittingChapter(false);
    }
  }

  async function moveChapter(index, direction) {
    if (!supabase) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;
    const reordered = [...chapters];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const updated = reordered.map((c, i) => ({ ...c, sort_order: i }));
    setChapters(updated);
    try {
      await Promise.all([
        supabase.from('course_chapters').update({ sort_order: updated[index].sort_order }).eq('id', updated[index].id),
        supabase.from('course_chapters').update({ sort_order: updated[targetIndex].sort_order }).eq('id', updated[targetIndex].id)
      ]);
    } catch (err) { console.error(err); }
  }

  async function handleDeleteCourse(id, e) {
    e.stopPropagation();
    if (!supabase || !window.confirm('Delete this entire course?')) return;
    try {
      const { error } = await supabase.from('courses').delete().eq('id', id);
      if (error) throw error;
      setCourses(courses.filter(c => c.id !== id));
      if (selectedCourse?.id === id) setSelectedCourse(null);
      toast.success('Course deleted.');
    } catch (err) { toast.error('Error deleting course'); }
  }

  if (loadingCourses) return <div className="portal-loading"><div className="spinner"></div><p>Opening Curriculum Workspace...</p></div>;

  return (
    <div className="course-builder-page page-transition">
      <style>{`
        .course-builder-page { max-width: 1300px; margin: 30px auto; padding: 0 24px; }
        .workspace-grid { display: grid; grid-template-columns: 400px 1fr; gap: 30px; }
        .glass-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 20px; padding: 24px; box-shadow: var(--shadow); }
        .course-item-card { background: rgba(0,0,0,0.02); padding: 15px; border-radius: 12px; margin-bottom: 12px; cursor: pointer; border: 1px solid transparent; }
        .course-item-card.active { border-color: var(--green); background: var(--cream); }
        .chapter-node { background: rgba(0,0,0,0.02); padding: 15px; border-radius: 12px; margin-bottom: 10px; display: flex; gap: 15px; }
        .glass-input, .glass-select, .glass-textarea { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 15px; background: var(--bg); color: var(--ink); }
        @media (max-width: 1024px) { .workspace-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{marginBottom:'30px'}}><p className="eyebrow">Academic Production</p><h1>Course Builder</h1></div>

      <div className="workspace-grid">
        <div style={{display:'flex', flexDirection:'column', gap:'30px'}}>
          <div className="glass-panel">
            <h3>New Course</h3>
            <form onSubmit={handleCreateCourse}>
              <input className="glass-input" placeholder="Course Title" value={courseTitle} onChange={e=>setCourseTitle(e.target.value)} required />
              <select className="glass-select" value={courseSubjectId} onChange={e=>setCourseSubjectId(e.target.value)}>
                <option value="">-- Choose Subject --</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <textarea className="glass-textarea" placeholder="Brief description..." value={courseDesc} onChange={e=>setCourseDesc(e.target.value)} />
              <button className="button blue-button full tactile-btn" disabled={submittingCourse}>Create Structure →</button>
            </form>
          </div>

          <div className="glass-panel">
            <h3>Active Courses</h3>
            {courses.length === 0 ? <p style={{color:'var(--muted)', textAlign:'center'}}>No courses created.</p> : courses.map(c => (
              <div key={c.id} className={`course-item-card ${selectedCourse?.id === c.id ? 'active' : ''}`} onClick={()=>setSelectedCourse(c)}>
                <b>{c.title}</b>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'10px'}}>
                  <span className="badge" style={{fontSize:'0.7rem'}}>{c.subjects?.name || 'General'}</span>
                  <button className="mini reject tactile-btn" onClick={(e)=>handleDeleteCourse(c.id, e)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="chapter-area">
          {selectedCourse ? (
            <div className="glass-panel">
              <div style={{paddingBottom:'20px', borderBottom:'1px solid var(--line)', marginBottom:'25px'}}>
                <p className="eyebrow" style={{fontSize:'0.6rem'}}>Editing Course</p>
                <h2>{selectedCourse.title}</h2>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'30px'}}>
                <form onSubmit={handleAddChapter}>
                  <h3>Add Chapter</h3>
                  <input className="glass-input" placeholder="Chapter Title" value={chapterTitle} onChange={e=>setChapterTitle(e.target.value)} required />
                  <input className="glass-input" placeholder="Video URL (Optional)" value={chapterVideoUrl} onChange={e=>setChapterVideoUrl(e.target.value)} />
                  <textarea className="glass-textarea" style={{minHeight:'120px'}} placeholder="Chapter Content..." value={chapterContent} onChange={e=>setChapterContent(e.target.value)} required />
                  <button className="button blue-button full tactile-btn" disabled={submittingChapter}>Add Chapter Module +</button>
                </form>
                <div>
                  <h3>Chapter Sequence</h3>
                  {loadingChapters ? <div className="spinner"></div> : chapters.length === 0 ? <p style={{color:'var(--muted)'}}>No chapters added yet.</p> : chapters.map((ch, i) => (
                    <div key={ch.id} className="chapter-node">
                      <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                        <button className="mini outline tactile-btn" onClick={()=>moveChapter(i, 'up')} disabled={i===0}>▲</button>
                        <button className="mini outline tactile-btn" onClick={()=>moveChapter(i, 'down')} disabled={i===chapters.length-1}>▼</button>
                      </div>
                      <div style={{flex:1}}><b>{ch.title}</b><p style={{fontSize:'0.8rem', color:'var(--muted)', margin:'5px 0'}}>{ch.content_body?.substring(0, 60)}...</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel" style={{textAlign:'center', padding:'80px 20px', color:'var(--muted)', borderStyle:'dashed'}}>
              <h3>No Course Selected</h3>
              <p>Select a course from the left to manage chapters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
