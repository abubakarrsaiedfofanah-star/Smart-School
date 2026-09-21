import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function MeetingScheduler() {
  const { profile, demo } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState([]);
  const [isTeacher, setIsTeacher] = useState(false);

  // Create Slot State
  const [newSlot, setNewSlot] = useState({ start: '', end: '', link: '' });

  useEffect(() => {
    if (profile) {
      setIsTeacher(['teacher', 'school_admin'].includes(profile.role));
      fetchMeetings();
    }
  }, [profile]);

  async function fetchMeetings() {
    setLoading(true);
    try {
      if (!supabase || demo) {
        setMeetings([
          { id: 'm1', start_time: '2026-09-25T10:00:00Z', end_time: '2026-09-25T10:15:00Z', status: 'available', teacher: { full_name: 'Mark Otieno' } },
          { id: 'm2', start_time: '2026-09-25T10:30:00Z', end_time: '2026-09-25T10:45:00Z', status: 'booked', teacher: { full_name: 'Grace Wanjiku' }, parent: { full_name: 'David Parent' } }
        ]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('meetings')
        .select('*, teacher:teacher_id(full_name), parent:parent_id(full_name)')
        .eq('school_id', profile.school_id)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      toast.error('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }

  async function createSlot(e) {
    e.preventDefault();
    try {
      const payload = {
        school_id: profile.school_id,
        teacher_id: profile.id,
        start_time: new Date(newSlot.start).toISOString(),
        end_time: new Date(newSlot.end).toISOString(),
        meeting_link: newSlot.link,
        status: 'available'
      };

      if (!supabase || demo) {
        setMeetings([...meetings, { ...payload, id: Date.now(), teacher: { full_name: profile.full_name } }]);
        toast.success('Slot created (Demo)!');
        return;
      }

      const { error } = await supabase.from('meetings').insert(payload);
      if (error) throw error;
      toast.success('Meeting slot opened!');
      fetchMeetings();
    } catch (err) {
      toast.error('Failed to create slot');
    }
  }

  async function bookSlot(meetingId) {
    try {
      if (!supabase || demo) {
        setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'booked', parent: { full_name: profile.full_name } } : m));
        toast.success('Meeting booked (Demo)!');
        return;
      }

      const { error } = await supabase
        .from('meetings')
        .update({ parent_id: profile.id, status: 'booked' })
        .eq('id', meetingId);

      if (error) throw error;
      toast.success('Meeting scheduled successfully!');
      fetchMeetings();
    } catch (err) {
      toast.error('Failed to book slot');
    }
  }

  if (loading) return <div className="portal-loading"><div className="spinner"></div></div>;

  return (
    <div className="meeting-page page-transition">
      <style>{`
        .meeting-page { padding: 40px 24px; max-width: 1000px; margin: 0 auto; }
        .slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 30px; }
        .slot-card { padding: 25px; display: flex; flex-direction: column; gap: 15px; }
        .slot-time { font-size: 1.1rem; font-weight: 800; color: var(--ink); }
        .status-pill { padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 800; width: fit-content; text-transform: uppercase; }
        .status-pill.available { background: var(--cream); color: var(--green); }
        .status-pill.booked { background: #fee2e2; color: #dc2626; }
        .create-form { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 15px; align-items: end; }
      `}</style>

      <p className="eyebrow">COORDINATION</p>
      <h1>Parent-Teacher Meetings</h1>

      {isTeacher && (
        <div className="glass-card" style={{marginTop: '30px'}}>
          <h3>Open a New Meeting Slot</h3>
          <form className="create-form" onSubmit={createSlot}>
            <label>Start Time<input type="datetime-local" onChange={e => setNewSlot({...newSlot, start: e.target.value})} required /></label>
            <label>End Time<input type="datetime-local" onChange={e => setNewSlot({...newSlot, end: e.target.value})} required /></label>
            <label>Link (Optional)<input placeholder="Zoom/Google Meet" onChange={e => setNewSlot({...newSlot, link: e.target.value})} /></label>
            <button className="button blue-button">Open Slot</button>
          </form>
        </div>
      )}

      <div className="slot-grid">
        {meetings.map(m => (
          <div key={m.id} className="slot-card glass-card">
            <div className="status-pill + m.status">{m.status}</div>
            <div className="slot-time">
              {new Date(m.start_time).toLocaleDateString()} @ {new Date(m.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </div>
            <div>
              <small style={{display:'block', color:'var(--muted)'}}>Teacher</small>
              <b>{m.teacher?.full_name}</b>
            </div>
            {m.parent && (
              <div>
                <small style={{display:'block', color:'var(--muted)'}}>Booked By</small>
                <b>{m.parent?.full_name}</b>
              </div>
            )}
            {!isTeacher && m.status === 'available' && (
              <button className="button blue-button full" onClick={() => bookSlot(m.id)}>Book Appointment</button>
            )}
            {m.meeting_link && <a href={m.meeting_link} target="_blank" className="text-link blue-text-link">Join Meeting Link ↗</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
