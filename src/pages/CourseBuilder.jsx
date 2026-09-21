import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function CourseBuilder() {
  const { profile, demo } = useAuth();
  const [courses, setCourses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  // Loading states
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [submittingCourse, setSubmittingCourse] = useState(false);
  const [submittingChapter, setSubmittingChapter] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);

  // Form states - Course
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');
  const [courseSubjectId, setCourseSubjectId] = useState('');

  // Form states - Chapter
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [chapterVideoUrl, setChapterVideoUrl] = useState('');

  // Mock data for fallback / demo mode
  const demoSubjects = [
    { id: 'sub-demo-1', name: 'Mathematics' },
    { id: 'sub-demo-2', name: 'Physics' },
    { id: 'sub-demo-3', name: 'Chemistry' },
    { id: 'sub-demo-4', name: 'English Literature' }
  ];

  const demoCourses = [
    {
      id: 'course-demo-1',
      title: 'Introduction to Quantum Physics',
      description: 'An introductory guide covering wave-particle duality, wavefunctions, and the uncertainty principle.',
      subject_id: 'sub-demo-2',
      created_at: new Date().toISOString()
    },
    {
      id: 'course-demo-2',
      title: 'Advanced Algebraic Structures',
      description: 'Delve deep into group theory, ring theory, modules, and vector spaces.',
      subject_id: 'sub-demo-1',
      created_at: new Date().toISOString()
    }
  ];

  const demoChapters = [
    {
      id: 'chap-demo-1',
      course_id: 'course-demo-1',
      title: '1. The Dawn of Quantum Mechanics',
      content_body: 'Explore blackbody radiation, the photoelectric effect, and how classical mechanics failed to explain subatomic phenomena.',
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      sort_order: 0
    },
    {
      id: 'chap-demo-2',
      course_id: 'course-demo-1',
      title: '2. The Schrodinger Equation',
      content_body: 'Understanding the time-dependent and time-independent Schrodinger equations and their application to a particle in a box.',
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      sort_order: 1
    }
  ];

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
    setLoadingCourses(true);
    try {
      if (!supabase || demo || profile?.school_id === 'demo-school-id') {
        setSubjects(demoSubjects);
        setCourses(demoCourses);
        return;
      }

      // Fetch subjects for dropdown selection
      const { data: subData, error: subErr } = await supabase
        .from('subjects')
        .select('*')
        .eq('school_id', profile.school_id)
        .order('name');

      if (subErr) throw subErr;
      setSubjects(subData || []);

      // Fetch courses with corresponding subject labels
      const { data: courseData, error: courseErr } = await supabase
        .from('courses')
        .select('*, subjects(name)')
        .eq('school_id', profile.school_id)
        .order('created_at', { ascending: false });

      if (courseErr) throw courseErr;
      setCourses(courseData || []);
    } catch (err) {
      console.error('Error loading courses:', err);
      toast.error('Failed to load curriculum data. Showing demo fallback.');
      setSubjects(demoSubjects);
      setCourses(demoCourses);
    } finally {
      setLoadingCourses(false);
    }
  }

  async function loadChapters(courseId) {
    setLoadingChapters(true);
    try {
      if (!supabase || demo || profile?.school_id === 'demo-school-id') {
        const filtered = demoChapters.filter(ch => ch.course_id === courseId);
        setChapters(filtered.sort((a, b) => a.sort_order - b.sort_order));
        return;
      }

      const { data, error } = await supabase
        .from('course_chapters')
        .select('*')
        .eq('course_id', courseId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setChapters(data || []);
    } catch (err) {
      console.error('Error loading chapters:', err);
      toast.error('Failed to load chapters.');
    } finally {
      setLoadingChapters(false);
    }
  }

  async function handleCreateCourse(e) {
    e.preventDefault();
    if (!courseTitle.trim()) return;

    setSubmittingCourse(true);
    try {
      const payload = {
        school_id: profile.school_id,
        title: courseTitle.trim(),
        description: courseDesc.trim(),
        subject_id: courseSubjectId || null,
        teacher_id: profile.id || null,
        is_published: false
      };

      if (!supabase || demo || profile?.school_id === 'demo-school-id') {
        const newCourse = {
          ...payload,
          id: `course-local-${Date.now()}`,
          created_at: new Date().toISOString(),
          subjects: { name: subjects.find(s => s.id === courseSubjectId)?.name || 'General' }
        };
        const updated = [newCourse, ...courses];
        setCourses(updated);
        setSelectedCourse(newCourse);
        toast.success('Course created locally (Demo mode)!');
        resetCourseForm();
        return;
      }

      const { data, error } = await supabase
        .from('courses')
        .insert(payload)
        .select('*, subjects(name)')
        .single();

      if (error) throw error;

      setCourses([data, ...courses]);
      setSelectedCourse(data);
      toast.success('Course created successfully!');
      resetCourseForm();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to create course');
    } finally {
      setSubmittingCourse(false);
    }
  }

  function resetCourseForm() {
    setCourseTitle('');
    setCourseDesc('');
    setCourseSubjectId('');
  }

  async function handleAddChapter(e) {
    e.preventDefault();
    if (!selectedCourse || !chapterTitle.trim()) return;

    setSubmittingChapter(true);
    try {
      const nextSortOrder = chapters.length > 0 ? Math.max(...chapters.map(c => c.sort_order ?? 0)) + 1 : 0;
      const payload = {
        course_id: selectedCourse.id,
        title: chapterTitle.trim(),
        content_body: chapterContent.trim(),
        video_url: chapterVideoUrl.trim(),
        sort_order: nextSortOrder
      };

      if (!supabase || demo || profile?.school_id === 'demo-school-id') {
        const newChapter = {
          ...payload,
          id: `chap-local-${Date.now()}`
        };
        const updated = [...chapters, newChapter];
        setChapters(updated);
        toast.success('Chapter added locally!');
        resetChapterForm();
        return;
      }

      const { data, error } = await supabase
        .from('course_chapters')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;

      setChapters([...chapters, data]);
      toast.success('Chapter added successfully!');
      resetChapterForm();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to add chapter');
    } finally {
      setSubmittingChapter(false);
    }
  }

  function resetChapterForm() {
    setChapterTitle('');
    setChapterContent('');
    setChapterVideoUrl('');
  }

  async function moveChapter(index, direction) {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === chapters.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...chapters];

    // Swap elements
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    // Standardize indices
    const updated = reordered.map((chap, idx) => ({
      ...chap,
      sort_order: idx
    }));

    setChapters(updated);

    if (!supabase || demo || profile?.school_id === 'demo-school-id') {
      toast.success('Reordered chapters locally!');
      return;
    }

    try {
      // Update both rows in DB
      const updatePromises = [
        supabase.from('course_chapters').update({ sort_order: updated[index].sort_order }).eq('id', updated[index].id),
        supabase.from('course_chapters').update({ sort_order: updated[targetIndex].sort_order }).eq('id', updated[targetIndex].id)
      ];
      await Promise.all(updatePromises);
    } catch (err) {
      console.error('Error saving sort order:', err);
      toast.error('Failed to save updated arrangement to the database.');
    }
  }

  async function handleDeleteCourse(courseId, e) {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this course and all its chapters?')) return;

    try {
      if (!supabase || demo || profile?.school_id === 'demo-school-id') {
        setCourses(courses.filter(c => c.id !== courseId));
        if (selectedCourse?.id === courseId) setSelectedCourse(null);
        toast.success('Course removed.');
        return;
      }

      const { error } = await supabase.from('courses').delete().eq('id', courseId);
      if (error) throw error;

      setCourses(courses.filter(c => c.id !== courseId));
      if (selectedCourse?.id === courseId) setSelectedCourse(null);
      toast.success('Course deleted permanently.');
    } catch (err) {
      toast.error(err.message || 'Could not delete course');
    }
  }

  return (
    <div className="course-builder-page page-transition">
      <style>{`
        .course-builder-page {
          max-width: 1300px;
          margin: 30px auto;
          padding: 0 20px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .header-section {
          margin-bottom: 30px;
        }

        .eyebrow {
          font-size: 0.8rem;
          letter-spacing: 2px;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 5px;
        }

        .electric-blue-eyebrow {
          color: #00E5FF;
          text-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
        }

        .main-title {
          font-size: 2.2rem;
          font-weight: 800;
          color: #fff;
          margin: 0 0 8px 0;
        }

        .subtitle {
          color: #94A3B8;
          font-size: 1rem;
          margin: 0;
        }

        .workspace-grid {
          display: grid;
          grid-template-columns: 420px 1fr;
          gap: 30px;
          align-items: start;
        }

        @media (max-width: 1024px) {
          .workspace-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Glassmorphism Cards */
        .glass-panel {
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(0, 229, 255, 0.15);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.25);
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .glass-panel:hover {
          border-color: rgba(0, 229, 255, 0.3);
          box-shadow: 0 12px 40px 0 rgba(0, 229, 255, 0.05);
        }

        .panel-heading {
          font-size: 1.3rem;
          font-weight: 700;
          color: #fff;
          margin: 0 0 20px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 12px;
        }

        .form-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: #CBD5E1;
          margin-bottom: 6px;
          margin-top: 14px;
        }

        .form-label:first-of-type {
          margin-top: 0;
        }

        .glass-input, .glass-select, .glass-textarea {
          width: 100%;
          background: rgba(30, 41, 59, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 11px 14px;
          color: #fff;
          font-size: 0.95rem;
          transition: all 0.25s ease;
          box-sizing: border-box;
        }

        .glass-input:focus, .glass-select:focus, .glass-textarea:focus {
          outline: none;
          border-color: #00E5FF;
          background: rgba(15, 23, 42, 0.8);
          box-shadow: 0 0 12px rgba(0, 229, 255, 0.3);
        }

        .glass-textarea {
          resize: vertical;
          min-height: 80px;
        }

        .electric-btn {
          background: linear-gradient(135deg, #2979FF 0%, #00E5FF 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 12px 20px;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.25s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 18px;
          box-shadow: 0 4px 15px rgba(0, 229, 255, 0.2);
          width: 100%;
        }

        .electric-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0, 229, 255, 0.4);
          filter: brightness(1.1);
        }

        .electric-btn:active {
          transform: translateY(1px);
        }

        /* Course List Items */
        .course-list-container {
          margin-top: 25px;
          max-height: 480px;
          overflow-y: auto;
          padding-right: 5px;
        }

        .course-list-container::-webkit-scrollbar {
          width: 6px;
        }
        .course-list-container::-webkit-scrollbar-thumb {
          background: rgba(0, 229, 255, 0.2);
          border-radius: 10px;
        }

        .course-item-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .course-item-card:hover {
          background: rgba(0, 229, 255, 0.06);
          border-color: rgba(0, 229, 255, 0.3);
          transform: translateX(3px);
        }

        .course-item-card.active {
          background: rgba(0, 229, 255, 0.12);
          border-color: #00E5FF;
          box-shadow: inset 0 0 10px rgba(0, 229, 255, 0.2);
        }

        .course-item-title {
          font-weight: 700;
          color: #fff;
          margin: 0 0 4px 0;
          font-size: 1.05rem;
          padding-right: 24px;
        }

        .course-item-desc {
          color: #94A3B8;
          font-size: 0.85rem;
          margin: 0 0 10px 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .badge-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .subject-badge {
          background: rgba(0, 229, 255, 0.15);
          color: #00E5FF;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid rgba(0, 229, 255, 0.2);
        }

        .delete-icon-btn {
          background: transparent;
          border: none;
          color: #EF4444;
          cursor: pointer;
          opacity: 0.4;
          transition: opacity 0.2s;
          padding: 4px;
          border-radius: 6px;
        }

        .course-item-card:hover .delete-icon-btn {
          opacity: 1;
        }

        .delete-icon-btn:hover {
          background: rgba(239, 68, 68, 0.15);
        }

        /* Empty state styling */
        .empty-placeholder {
          text-align: center;
          padding: 60px 20px;
          color: #64748B;
          border: 2px dashed rgba(255, 255, 255, 0.08);
          border-radius: 16px;
        }

        .empty-placeholder h3 {
          color: #94A3B8;
          margin-bottom: 8px;
        }

        /* Chapter Builder Area */
        .chapter-workspace-header {
          background: linear-gradient(90deg, rgba(0, 82, 255, 0.15) 0%, rgba(0, 229, 255, 0.05) 100%);
          border: 1px solid rgba(0, 229, 255, 0.2);
          border-radius: 14px;
          padding: 18px 22px;
          margin-bottom: 25px;
        }

        .chapter-workspace-title {
          font-size: 1.4rem;
          font-weight: 800;
          color: #fff;
          margin: 0 0 4px 0;
        }

        .chapter-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 25px;
        }

        @media (max-width: 900px) {
          .chapter-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Chapter Items List */
        .chapter-timeline {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chapter-node {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          gap: 16px;
          align-items: flex-start;
          transition: all 0.2s ease;
        }

        .chapter-node:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .sorting-controls {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .sort-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          border-radius: 6px;
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          cursor: pointer;
          font-size: 0.8rem;
          transition: all 0.15s ease;
        }

        .sort-btn:hover:not(:disabled) {
          background: #00E5FF;
          color: #0f172a;
          border-color: #00E5FF;
        }

        .sort-btn:disabled {
          opacity: 0.2;
          cursor: not-allowed;
        }

        .chapter-content-box {
          flex: 1;
        }

        .chapter-node-title {
          font-weight: 700;
          color: #fff;
          margin: 0 0 6px 0;
          font-size: 1.05rem;
        }

        .chapter-node-body {
          color: #94A3B8;
          font-size: 0.88rem;
          margin: 0 0 10px 0;
          line-height: 1.4;
        }

        .video-link-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #00E5FF;
          font-size: 0.8rem;
          text-decoration: none;
          background: rgba(0, 229, 255, 0.08);
          padding: 4px 10px;
          border-radius: 6px;
          border: 1px solid rgba(0, 229, 255, 0.15);
        }

        .video-link-tag:hover {
          background: rgba(0, 229, 255, 0.15);
        }

        .spinner {
          border: 3px solid rgba(0, 229, 255, 0.1);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border-left-color: #00E5FF;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <div className="header-section">
        <p className="eyebrow electric-blue-eyebrow">Curriculum Workspace</p>
        <h1 className="main-title">Course Builder</h1>
        <p className="subtitle">Design structural schemas for courses, organize academic tracks, and order sequential dynamic chapters.</p>
      </div>

      <div className="workspace-grid">

        {/* Left Side Column: Creator & Course Index */}
        <div className="left-workspace-column" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>

          {/* Create New Course Panel */}
          <div className="glass-panel">
            <h2 className="panel-heading">Create New Course</h2>
            <form onSubmit={handleCreateCourse}>

              <label className="form-label">Course Title</label>
              <input
                type="text"
                className="glass-input"
                placeholder="e.g. Advanced Inorganic Chemistry"
                value={courseTitle}
                onChange={e => setCourseTitle(e.target.value)}
                required
              />

              <label className="form-label">Subject Track</label>
              <select
                className="glass-select"
                value={courseSubjectId}
                onChange={e => setCourseSubjectId(e.target.value)}
              >
                <option value="">-- General / Select Subject --</option>
                {subjects.map(sub => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>

              <label className="form-label">Course Description</label>
              <textarea
                className="glass-textarea"
                placeholder="Brief summary detailing prerequisites, syllabus coverage, and primary learning outcomes..."
                value={courseDesc}
                onChange={e => setCourseDesc(e.target.value)}
              />

              <button
                type="submit"
                className="electric-btn"
                disabled={submittingCourse}
              >
                {submittingCourse ? 'Generating Course...' : 'Create Course Structure →'}
              </button>
            </form>
          </div>

          {/* Existing Courses Panel */}
          <div className="glass-panel">
            <h2 className="panel-heading">
              <span>Your Courses</span>
              <span style={{ fontSize: '0.8rem', padding: '2px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                {courses.length}
              </span>
            </h2>

            {loadingCourses ? (
              <div className="spinner"></div>
            ) : courses.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748B', padding: '20px 0' }}>
                No active courses mapped. Create one above to get started.
              </div>
            ) : (
              <div className="course-list-container">
                {courses.map(course => {
                  const isActive = selectedCourse?.id === course.id;
                  const subjectName = course.subjects?.name || subjects.find(s => s.id === course.subject_id)?.name || 'General';

                  return (
                    <div
                      key={course.id}
                      className={`course-item-card ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedCourse(course)}
                    >
                      <div className="course-item-title">{course.title}</div>
                      <div className="course-item-desc">{course.description || 'No description added yet.'}</div>

                      <div className="badge-row">
                        <span className="subject-badge">{subjectName}</span>
                        <button
                          className="delete-icon-btn"
                          title="Delete Course"
                          onClick={(e) => handleDeleteCourse(course.id, e)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Column: Detailed Chapter Builder */}
        <div className="right-workspace-column">
          {selectedCourse ? (
            <div className="glass-panel">

              <div className="chapter-workspace-header">
                <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#00E5FF', fontWeight: 'bold', marginBottom: '2px' }}>
                  ACTIVE COURSE WORKSPACE
                </div>
                <h2 className="chapter-workspace-title">{selectedCourse.title}</h2>
                <p style={{ margin: 0, color: '#94A3B8', fontSize: '0.88rem' }}>
                  {selectedCourse.description || 'No syllabus description provided.'}
                </p>
              </div>

              <div className="chapter-grid">

                {/* Column A: Add Chapter Form */}
                <div className="chapter-form-section">
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    Add New Chapter Module
                  </h3>

                  <form onSubmit={handleAddChapter}>
                    <label className="form-label">Chapter Title</label>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="e.g. Chapter 3: Molecular Orbital Theory"
                      value={chapterTitle}
                      onChange={e => setChapterTitle(e.target.value)}
                      required
                    />

                    <label className="form-label">Video Lecture URL (Optional)</label>
                    <input
                      type="url"
                      className="glass-input"
                      placeholder="e.g. https://youtube.com/... or cloud video path"
                      value={chapterVideoUrl}
                      onChange={e => setChapterVideoUrl(e.target.value)}
                    />

                    <label className="form-label">Body Content / Guidelines</label>
                    <textarea
                      className="glass-textarea"
                      style={{ minHeight: '140px' }}
                      placeholder="Write rich technical instructions, lesson guidelines, reading assignments, or raw text body content here..."
                      value={chapterContent}
                      onChange={e => setChapterContent(e.target.value)}
                    />

                    <button
                      type="submit"
                      className="electric-btn"
                      disabled={submittingChapter}
                      style={{ background: 'linear-gradient(135deg, #00C853 0%, #00E5FF 100%)' }}
                    >
                      {submittingChapter ? 'Injecting Module...' : 'Append Chapter Module +'}
                    </button>
                  </form>
                </div>

                {/* Column B: Sequential Chapters List & Reordering Controls */}
                <div className="chapter-sequence-section">
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    Syllabus Sequence Sequence
                  </h3>

                  {loadingChapters ? (
                    <div className="spinner"></div>
                  ) : chapters.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#64748B', padding: '40px 10px', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                      No chapters compiled for this course yet. Use the append block to build out the sequence tree.
                    </div>
                  ) : (
                    <div className="chapter-timeline">
                      {chapters.map((chapter, index) => (
                        <div key={chapter.id} className="chapter-node">

                          {/* Reordering Sorting Controls (+/- Simple Buttons) */}
                          <div className="sorting-controls">
                            <button
                              type="button"
                              className="sort-btn"
                              title="Move Chapter Up"
                              onClick={() => moveChapter(index, 'up')}
                              disabled={index === 0}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="sort-btn"
                              title="Move Chapter Down"
                              onClick={() => moveChapter(index, 'down')}
                              disabled={index === chapters.length - 1}
                            >
                              ▼
                            </button>
                          </div>

                          {/* Content Display */}
                          <div className="chapter-content-box">
                            <h4 className="chapter-node-title">{chapter.title}</h4>
                            <p className="chapter-node-body">{chapter.content_body || 'No textual instructions provided.'}</p>

                            {chapter.video_url && (
                              <a
                                href={chapter.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="video-link-tag"
                              >
                                📺 Video Resource
                              </a>
                            )}
                          </div>

                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </div>
          ) : (
            <div className="glass-panel empty-placeholder">
              <h3>No Course Selected</h3>
              <p style={{ margin: 0 }}>Choose an existing course from the index matrix or introduce a brand new course container structure to orchestrate and build individual learning chapters.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
