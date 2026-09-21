import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function TeacherReview() {
  const { assignmentId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile || !assignmentId) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        if (!supabase || profile?.school_id === 'demo-school-id' || assignmentId.startsWith('demo')) {
          const demoAss = { title: 'Algebra Quadratic Equations', classes: { name: 'Grade 7A' }, subjects: { name: 'Mathematics' } };
          const demoSubs = [
            { id: 'ds1', score: null, content: 'Done my best.', file_path: 'demo.pdf', students: { admission_number: 'ST001', profiles: { full_name: 'Amina Hassan' } } },
            { id: 'ds2', score: 85, content: 'Easy assignment.', file_path: 'demo2.pdf', students: { admission_number: 'ST002', profiles: { full_name: 'David Kimani' } } }
          ];
          setAssignment(demoAss);
          setSubmissions(demoSubs);
          setLoading(false);
          return;
        }

        // Fetch assignment details
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('assignments')
          .select('*, subjects(name), classes(name)')
          .eq('id', assignmentId)
          .single();

        if (assignmentError) throw assignmentError;
        setAssignment(assignmentData);

        // Fetch all submissions for this assignment
        const { data: submissionData, error: submissionError } = await supabase
          .from('submissions')
          .select(`
            *,
            students (
              id,
              admission_number,
              profiles (full_name)
            )
          `)
          .eq('assignment_id', assignmentId);

        if (submissionError) throw submissionError;
        setSubmissions(submissionData);
      } catch (error) {
        console.error('Error fetching review data:', error);
        toast.error('Failed to load submissions');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile, assignmentId]);

  const handleSelect = (sub) => {
    setSelectedSubmission(sub);
    setScore(sub.score || '');
    setFeedback(sub.feedback || '');
  };

  const handleSaveGrade = async (e) => {
    e.preventDefault();
    if (!selectedSubmission) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('submissions')
        .update({
          score: parseFloat(score),
          feedback: feedback
        })
        .eq('id', selectedSubmission.id);

      if (error) throw error;

      toast.success('Grade saved successfully!');

      // Update local state
      setSubmissions(prev => prev.map(s =>
        s.id === selectedSubmission.id ? { ...s, score: parseFloat(score), feedback } : s
      ));
      setSelectedSubmission(null);
    } catch (error) {
      console.error('Error saving grade:', error);
      toast.error('Failed to save grade');
    } finally {
      setSaving(false);
    }
  };

  const downloadFile = async (path) => {
    try {
      const { data, error } = await supabase.storage
        .from('assignments')
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop();
      a.click();
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Failed to download file');
    }
  };

  if (loading) return <div className="portal-loading"><div className="spinner"></div><p>Loading submissions...</p></div>;
  if (!assignment) return <div className="error-state">Assignment not found.</div>;

  return (
    <div className="review-page page-transition">
      <style>{`
        .review-page { padding: 40px 20px; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 350px 1fr; gap: 30px; }
        .assignment-info { grid-column: 1 / -1; margin-bottom: 20px; border-bottom: 2px solid var(--ink); padding-bottom: 20px; }
        .assignment-info h1 { margin: 0; font: 700 2.2rem 'Playfair Display', serif; }
        .submission-list { background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
        .sub-item { padding: 15px 20px; border-bottom: 1px solid var(--line); cursor: pointer; transition: background 0.2s; }
        .sub-item:hover { background: #f8fafc; }
        .sub-item.active { background: var(--cream); border-left: 4px solid var(--green); }
        .sub-item b { display: block; font-size: 1rem; color: var(--ink); }
        .sub-item small { color: var(--muted); }
        .grading-pane { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 40px; }
        .grading-form label { display: block; margin-bottom: 10px; font-weight: 700; }
        .grading-form input, .grading-form textarea { width: 100%; padding: 12px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 20px; }
        .grading-form textarea { min-height: 150px; }
        .file-link { color: var(--green); font-weight: 700; cursor: pointer; text-decoration: underline; margin-bottom: 20px; display: inline-block; }
        .empty-review { text-align: center; color: var(--muted); margin-top: 100px; }
        @media (max-width: 900px) { .review-page { grid-template-columns: 1fr; } }
      `}</style>

      <div className="assignment-info">
        <button className="back-btn" onClick={() => navigate('/portal')}>← Back to Portal</button>
        <p className="eyebrow blue-eyebrow">{assignment.classes?.name} · {assignment.subjects?.name}</p>
        <h1>Submissions for: {assignment.title}</h1>
      </div>

      <aside className="submission-list">
        {submissions.length === 0 ? (
          <div style={{padding: '40px', textAlign: 'center', color: 'var(--muted)'}}>No submissions yet.</div>
        ) : (
          submissions.map(sub => (
            <div
              key={sub.id}
              className={`sub-item ${selectedSubmission?.id === sub.id ? 'active' : ''}`}
              onClick={() => handleSelect(sub)}
            >
              <b>{sub.students.profiles.full_name}</b>
              <small>{sub.students.admission_number} · {sub.score !== null ? `Graded: ${sub.score}` : 'Ungraded'}</small>
            </div>
          ))
        )}
      </aside>

      <main className="grading-pane">
        {selectedSubmission ? (
          <div className="grading-form">
            <h2>Reviewing: {selectedSubmission.students.profiles.full_name}</h2>

            <div className="student-work" style={{margin: '20px 0', background: '#f8fafc', padding: '20px', borderRadius: '8px'}}>
              <p><strong>Student Comments:</strong> {selectedSubmission.content || 'No comments.'}</p>
              <span className="file-link" onClick={() => downloadFile(selectedSubmission.file_path)}>
                📄 Download Submitted File
              </span>
            </div>

            <form onSubmit={handleSaveGrade}>
              <label>Score (Out of 100)</label>
              <input
                type="number"
                max="100"
                min="0"
                value={score}
                onChange={e => setScore(e.target.value)}
                required
              />

              <label>Teacher Feedback</label>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Write your feedback for the student here..."
              />

              <div className="form-actions">
                <button type="submit" className="button blue-button full" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Grade & Feedback →'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="empty-review">
            <div style={{fontSize: '3rem', marginBottom: '20px'}}>📁</div>
            <p>Select a student from the left to review their work.</p>
          </div>
        )}
      </main>
    </div>
  );
}
