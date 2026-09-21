import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Broadcast() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    recipientType: 'school', // 'school' or 'class'
    selectedClassId: ''
  });

  useEffect(() => {
    if (!profile) return;
    fetchClasses();
  }, [profile]);

  const fetchClasses = async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('id, name')
      .eq('school_id', profile.school_id);

    if (error) {
      toast.error('Failed to load classes');
    } else {
      setClasses(data);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) {
      return toast.error('Please fill in all fields');
    }
    if (formData.recipientType === 'class' && !formData.selectedClassId) {
      return toast.error('Please select a class');
    }

    setLoading(true);
    try {
      // 1. Insert into broadcasts table
      const { error: bError } = await supabase
        .from('broadcasts')
        .insert({
          school_id: profile.school_id,
          sender_id: profile.id,
          class_id: formData.recipientType === 'class' ? formData.selectedClassId : null,
          title: formData.title,
          body: formData.body
        });

      if (bError) throw bError;

      // 2. Fetch recipients (parents/guardians)
      let parentIds = [];
      if (formData.recipientType === 'school') {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('school_id', profile.school_id)
          .eq('role', 'parent');
        if (error) throw error;
        parentIds = data.map(p => p.id);
      } else {
        const { data: students, error: sError } = await supabase
          .from('students')
          .select('id')
          .eq('class_id', formData.selectedClassId);

        if (sError) throw sError;

        const studentIds = students.map(s => s.id);
        if (studentIds.length > 0) {
          const { data: guardians, error: gError } = await supabase
            .from('student_guardians')
            .select('guardian_id')
            .in('student_id', studentIds);

          if (gError) throw gError;
          parentIds = [...new Set(guardians.map(g => g.guardian_id))];
        }
      }

      // 3. Send bulk messages
      if (parentIds.length > 0) {
        const messagesToInsert = parentIds.map(pid => ({
          school_id: profile.school_id,
          sender_id: profile.id,
          recipient_id: pid,
          body: `📢 BROADCAST: ${formData.title}\n\n${formData.body}`
        }));

        const { error: mError } = await supabase
          .from('messages')
          .insert(messagesToInsert);

        if (mError) throw mError;
      }

      toast.success(`Broadcast sent to ${parentIds.length} recipients`);
      setFormData({ ...formData, title: '', body: '' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to send broadcast');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="broadcast-page page-transition">
      <style>{` ... `}</style>

      <div className="broadcast-card">
        <div className="broadcast-header">
          <h1>Broadcast</h1>
          <a className="back-link" onClick={() => navigate('/chat')}>
            ← Back to Chat
          </a>
        </div>

        <form className="broadcast-body" onSubmit={handleSend}>
          <div className="form-section">
            <label>Announcement Title</label>
            <input
              className="form-input"
              placeholder="Enter a descriptive title..."
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>

          <div className="form-section">
            <label>Recipients</label>
            <div className="recipient-options">
              <label className="opt-card">
                <input
                  type="radio"
                  name="recipientType"
                  value="school"
                  checked={formData.recipientType === 'school'}
                  onChange={e => setFormData({...formData, recipientType: e.target.value})}
                />
                <div className="opt-ui">
                  <b>Entire School</b>
                  <span>All parents & guardians</span>
                </div>
              </label>
              <label className="opt-card">
                <input
                  type="radio"
                  name="recipientType"
                  value="class"
                  checked={formData.recipientType === 'class'}
                  onChange={e => setFormData({...formData, recipientType: e.target.value})}
                />
                <div className="opt-ui">
                  <b>Specific Class</b>
                  <span>Guardians of one class</span>
                </div>
              </label>
            </div>
          </div>

          {formData.recipientType === 'class' && (
            <div className="form-section">
              <label>Select Target Class</label>
              <select
                className="form-input"
                value={formData.selectedClassId}
                onChange={e => setFormData({...formData, selectedClassId: e.target.value})}
              >
                <option value="">-- Choose a class --</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-section">
            <label>Message Content</label>
            <textarea
              className="form-input"
              rows="6"
              placeholder="Type your message details here..."
              value={formData.body}
              onChange={e => setFormData({...formData, body: e.target.value})}
            ></textarea>
          </div>

          <button className="send-button" type="submit" disabled={loading}>
            {loading ? <div className="loader"></div> : <><span>🚀</span> Send Bulk Message</>}
          </button>
        </form>
      </div>
    </div>
  );
}
