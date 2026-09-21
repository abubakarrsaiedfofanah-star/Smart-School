import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function BehaviorLog() {
  const { profile, demo } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Form State
  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState('merit'); // merit or demerit
  const [category, setCategory] = useState('Behavior');
  const [points, setPoints] = useState(5);
  const [comment, setComment] = useState('');

  const categories = ['Attendance', 'Behavior', 'Academic', 'Helpfulness', 'Leadership', 'Sports', 'Other'];

  useEffect(() => {
    if (profile?.school_id) {
      loadData();
    }
  }, [profile?.school_id]);

  const loadData = async () => {
    setFetching(true);
    try {
      if (demo || !supabase) {
        setStudents([
          { id: 'S1', full_name: 'Amina Hassan', admission_number: 'ST-001' },
          { id: 'S2', full_name: 'David Kimani', admission_number: 'ST-002' },
          { id: 'S3', full_name: 'Sarah Wambui', admission_number: 'ST-003' }
        ]);
        setRecords([
          { id: 1, student_name: 'Amina Hassan', type: 'merit', category: 'Academic', points: 10, comment: 'Excellent performance in Math quiz', created_at: new Date().toISOString() },
          { id: 2, student_name: 'David Kimani', type: 'demerit', category: 'Attendance', points: 5, comment: 'Late for morning assembly twice', created_at: new Date().toISOString() },
          { id: 3, student_name: 'Sarah Wambui', type: 'merit', category: 'Helpfulness', points: 5, comment: 'Assisted in organizing the library', created_at: new Date().toISOString() }
        ]);
      } else {
        const [stdRes, recRes] = await Promise.all([
          supabase.from('students').select('id, full_name, admission_number').eq('school_id', profile.school_id).order('full_name'),
          supabase.from('behavior_records')
            .select(`
              *,
              students:student_id (full_name)
            `)
            .eq('school_id', profile.school_id)
            .order('created_at', { ascending: false })
            .limit(30)
        ]);

        if (stdRes.error) throw stdRes.error;
        if (recRes.error) throw recRes.error;

        setStudents(stdRes.data || []);
        setRecords(recRes.data?.map(r => ({
          ...r,
          student_name: r.students?.full_name || 'Unknown Student'
        })) || []);
      }
    } catch (e) {
      toast.error('Failed to load data');
      console.error(e);
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!studentId) return toast.error('Please select a student');

    setLoading(true);
    const payload = {
      student_id: studentId,
      type,
      category,
      points: Number(points),
      comment,
      school_id: profile.school_id,
      logged_by: profile.id
    };

    try {
      if (demo || !supabase) {
        const student = students.find(s => s.id === studentId);
        const newRecord = {
          ...payload,
          id: Date.now(),
          student_name: student?.full_name || 'Demo Student',
          created_at: new Date().toISOString()
        };
        setRecords(prev => [newRecord, ...prev]);
        toast.success('Behavior record saved (Demo Mode)');
      } else {
        const { error } = await supabase.from('behavior_records').insert(payload);
        if (error) throw error;
        toast.success('Record logged successfully! 🌟');
        loadData();
      }
      // Reset form fields
      setStudentId('');
      setComment('');
      setPoints(5);
    } catch (e) {
      toast.error('Failed to save record');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="behavior-page page-transition">
      <style>{`
        .behavior-page { padding: 40px 24px; max-width: 1200px; margin: 0 auto; }
        .bh-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        .bh-grid { display: grid; grid-template-columns: 1fr 1.5fr; gap: 30px; align-items: start; }

        .form-section { padding: 35px; }
        .toggle-group { display: flex; gap: 10px; margin-bottom: 20px; }
        .toggle-btn { flex: 1; padding: 12px; font-weight: 700; border-radius: 12px; cursor: pointer; transition: all 0.2s; border: 2px solid transparent; display: flex; align-items: center; justify-content: center; gap: 8px; }

        .toggle-merit { background: #eff6ff; color: #2375e1; border-color: #dbeafe; }
        .toggle-merit.active { background: #2375e1; color: #fff; border-color: #2375e1; box-shadow: 0 4px 12px rgba(35, 117, 225, 0.3); }

        .toggle-demerit { background: #fff5f5; color: #e03131; border-color: #ffe3e3; }
        .toggle-demerit.active { background: #e03131; color: #fff; border-color: #e03131; box-shadow: 0 4px 12px rgba(224, 49, 49, 0.3); }

        .form-field { margin-bottom: 20px; }
        .form-field label { display: block; margin-bottom: 8px; font-weight: 700; font-size: 0.75rem; letter-spacing: 1.5px; text-transform: uppercase; color: #2375e1; }

        .points-row { display: grid; grid-template-columns: 1fr 100px; gap: 20px; }

        .records-list { max-height: 700px; overflow-y: auto; }
        .record-card { padding: 20px; border-bottom: 1px solid var(--line); transition: background 0.2s; }
        .record-card:last-child { border-bottom: 0; }
        .record-card:hover { background: rgba(35, 117, 225, 0.02); }

        .type-badge { font-size: 0.65rem; font-weight: 800; padding: 4px 10px; border-radius: 50px; text-transform: uppercase; }
        .badge-merit { background: #dcfce7; color: #166534; }
        .badge-demerit { background: #fee2e2; color: #991b1b; }

        .record-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .record-student { font-size: 1.1rem; font-weight: 700; color: var(--ink); }
        .record-details { font-size: 0.95rem; line-height: 1.5; color: var(--muted); }
        .record-footer { display: flex; gap: 15px; margin-top: 10px; font-size: 0.75rem; color: #94a3b8; }
        .category-tag { color: #2375e1; font-weight: 700; }

        @media (max-width: 900px) {
          .bh-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <header className="bh-header">
        <div>
          <p className="eyebrow">DISCIPLINE & REWARDS</p>
          <h1>Behavior Log</h1>
        </div>
        <button className="button outline-button small" onClick={() => navigate('/portal')}>
          ← Back to Portal
        </button>
      </header>

      <div className="bh-grid">
        {/* ENTRY FORM */}
        <section className="glass-card form-section">
          <h3 style={{ marginBottom: '25px' }}>Log New Activity</h3>

          <form onSubmit={handleSave}>
            <div className="form-field">
              <label>Select Student</label>
              <select
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                required
              >
                <option value="">-- Search Student --</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.admission_number})
                  </option>
                ))}
              </select>
            </div>

            <label className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>Log Type</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-btn toggle-merit ${type === 'merit' ? 'active' : ''}`}
                onClick={() => setType('merit')}
              >
                🌟 Merit
              </button>
              <button
                type="button"
                className={`toggle-btn toggle-demerit ${type === 'demerit' ? 'active' : ''}`}
                onClick={() => setType('demerit')}
              >
                ⚠️ Demerit
              </button>
            </div>

            <div className="points-row">
              <div className="form-field">
                <label>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Points</label>
                <input
                  type="number"
                  value={points}
                  onChange={e => setPoints(e.target.value)}
                  min="1"
                  max="50"
                  required
                />
              </div>
            </div>

            <div className="form-field">
              <label>Comments / Description</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Briefly describe the student's behavior..."
                rows="4"
                required
              />
            </div>

            <button
              type="submit"
              className={`button full ${type === 'merit' ? 'blue-button' : ''}`}
              style={type === 'demerit' ? { backgroundColor: '#e03131' } : {}}
              disabled={loading}
            >
              {loading ? 'Processing...' : `Save ${type === 'merit' ? 'Merit' : 'Demerit'} Entry →`}
            </button>
          </form>
        </section>

        {/* RECENT LOGS */}
        <section className="glass-card" style={{ padding: '0' }}>
          <div style={{ padding: '25px 30px', borderBottom: '1px solid var(--line)' }}>
            <h3 style={{ margin: 0 }}>Recent Activity</h3>
            <p style={{ margin: '5px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Latest behavior records for your school
            </p>
          </div>

          <div className="records-list">
            {fetching ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 15px' }}></div>
                <p>Fetching records...</p>
              </div>
            ) : records.length === 0 ? (
              <div className="empty-state-visual">
                <div className="empty-icon">✨</div>
                <b>No records found</b>
                <p>Behavior logs will appear here once added.</p>
              </div>
            ) : (
              records.map(rec => (
                <div key={rec.id} className="record-card">
                  <div className="record-meta">
                    <span className="record-student">{rec.student_name}</span>
                    <span className={`type-badge badge-${rec.type}`}>
                      {rec.type} (+{rec.points})
                    </span>
                  </div>
                  <div className="record-details">
                    <span className="category-tag">{rec.category}:</span> {rec.comment}
                  </div>
                  <div className="record-footer">
                    <span>📅 {new Date(rec.created_at).toLocaleDateString()}</span>
                    <span>🕒 {new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
