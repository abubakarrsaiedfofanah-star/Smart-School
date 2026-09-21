import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function SubmissionPortal() {
  const { assignmentId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [comment, setComment] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [studentId, setStudentId] = useState(null);

  useEffect(() => {
    if (!profile || !assignmentId) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Handle Demo Mode
        if (!supabase || profile?.school_id === 'demo-school-id' || assignmentId.startsWith('demo')) {
          const demoAss = {
            id: assignmentId,
            title: 'Algebra Quadratic Equations',
            instructions: 'Please solve the 10 problems attached in the worksheet and show all your steps.',
            due_date: '2026-10-15',
            subjects: { name: 'Mathematics' }
          };
          setAssignment(demoAss);
          setStudentId('demo-student-id');
          setLoading(false);
          return;
        }

        // Fetch assignment details
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('assignments')
          .select('*, subjects(name)')
          .eq('id', assignmentId)
          .single();

        if (assignmentError) throw assignmentError;
        setAssignment(assignmentData);

        // Fetch student record
        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('id')
          .eq('profile_id', profile.id)
          .single();

        if (studentError) throw studentError;
        setStudentId(studentData.id);

        // Check for existing submission
        const { data: submissionData, error: submissionError } = await supabase
          .from('submissions')
          .select('*')
          .eq('assignment_id', assignmentId)
          .eq('student_id', studentData.id)
          .maybeSingle();

        if (submissionError) throw submissionError;
        if (submissionData) {
          setSubmission(submissionData);
          setComment(submissionData.content || '');
        }
      } catch (error) {
        console.error('Error fetching submission data:', error);
        toast.error('Failed to load assignment details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile, assignmentId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file && !submission?.file_path) {
      toast.error('Please select a file to upload');
      return;
    }

    setUploading(true);
    try {
      let filePath = submission?.file_path;

      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const newPath = `submissions/${assignmentId}/${studentId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('assignments')
          .upload(newPath, file, { upsert: true });

        if (uploadError) throw uploadError;
        filePath = newPath;
      }

      const submissionPayload = {
        assignment_id: assignmentId,
        student_id: studentId,
        content: comment,
        file_path: filePath,
        submitted_at: new Date().toISOString()
      };

      const { error: upsertError } = await supabase
        .from('submissions')
        .upsert(submissionPayload, { onConflict: 'assignment_id,student_id' });

      if (upsertError) throw upsertError;

      toast.success(submission ? 'Submission updated!' : 'Assignment submitted successfully!');
      navigate('/portal');
    } catch (error) {
      console.error('Error submitting assignment:', error);
      toast.error('Failed to submit assignment');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="portal-loading"><div className="spinner"></div><p>Loading assignment...</p></div>;
  if (!assignment) return <div className="error-state">Assignment not found.</div>;

  return (
    <div className="submission-page page-transition">
      <style>{`
        .submission-page { padding: 40px 20px; max-width: 800px; margin: 0 auto; }
        .assignment-card { margin-bottom: 30px; padding: 30px; }
        .assignment-card h1 { font: 700 2rem 'Playfair Display', serif; color: var(--ink); margin-bottom: 15px; }
        .meta { display: flex; gap: 20px; color: var(--muted); font-size: 0.9rem; margin-bottom: 20px; }
        .instructions { line-height: 1.6; color: var(--ink); background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .submission-form label { display: block; margin-bottom: 10px; font-weight: 700; color: var(--ink); }
        .submission-form textarea { width: 100%; min-height: 120px; padding: 15px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 20px; outline: none; transition: border-color 0.2s; }
        .submission-form textarea:focus { border-color: var(--green); }
        .file-input-wrapper { margin-bottom: 30px; }
        .current-file { font-size: 0.85rem; color: var(--green); margin-top: 10px; display: block; }
        .grade-feedback { margin-top: 30px; padding: 20px; background: var(--cream); border-radius: 8px; border: 1px solid var(--line); }
        .grade-feedback h3 { margin-bottom: 10px; color: var(--green); }
      `}</style>

      <div className="assignment-card glass-card">
        <header>
          <p className="eyebrow blue-eyebrow">{assignment.subjects?.name || 'Assignment'}</p>
          <h1>{assignment.title}</h1>
          <div className="meta">
            <span>📅 Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
            {submission && <span className="status-badge success">✓ Submitted</span>}
          </div>
        </header>

        <div className="instructions">
          <h3>Instructions</h3>
          <p>{assignment.instructions || 'No specific instructions provided.'}</p>
        </div>

        {submission?.score !== null && submission?.score !== undefined && (
          <div className="grade-feedback">
            <h3>Feedback Received</h3>
            <p><strong>Score:</strong> {submission.score} / 100</p>
            {submission.feedback && <p><strong>Teacher Comments:</strong> {submission.feedback}</p>}
          </div>
        )}

        <form className="submission-form" onSubmit={handleSubmit}>
          <label>Your Comments / Notes</label>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Describe your work or add any notes for the teacher..."
          />

          <div className="file-input-wrapper">
            <label>Upload Work (PDF, Image, or Doc)</label>
            <input
              type="file"
              onChange={e => setFile(e.target.files[0])}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            />
            {submission?.file_path && !file && (
              <span className="current-file">Current file: {submission.file_path.split('/').pop()}</span>
            )}
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="button blue-button full"
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : submission ? 'Update Submission →' : 'Submit Assignment →'}
            </button>
            <button
              type="button"
              className="back"
              style={{width: '100%', marginTop: '10px'}}
              onClick={() => navigate('/portal')}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
