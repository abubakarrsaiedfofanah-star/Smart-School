import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function Timetable() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [timetable, setTimetable] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  useEffect(() => {
    if (!profile) return;
    init();
  }, [profile]);

  async function init() {
    setLoading(true);
    try {
      if (profile.role === 'student') {
        const { data: student } = await supabase
          .from('students')
          .select('class_id')
          .eq('profile_id', profile.id)
          .single();
        if (student?.class_id) {
          fetchTimetable(student.class_id, null);
        }
      } else if (profile.role === 'teacher') {
        fetchTimetable(null, profile.id);
      } else if (['school_admin', 'super_admin'].includes(profile.role)) {
        const { data: classesList } = await supabase
          .from('classes')
          .select('*')
          .eq('school_id', profile.school_id)
          .order('name');
        setClasses(classesList || []);
        if (classesList?.length > 0) {
          setSelectedClassId(classesList[0].id);
          fetchTimetable(classesList[0].id, null);
        }
      }
    } catch (err) {
      console.error('Timetable init error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTimetable(classId, teacherId) {
    setLoading(true);
    try {
      let query = supabase
        .from('timetable')
        .select(`
          *,
          subjects(name, code),
          classes(name),
          teacher:teacher_id(full_name)
        `)
        .eq('school_id', profile.school_id);

      if (classId) query = query.eq('class_id', classId);
      if (teacherId) query = query.eq('teacher_id', teacherId);

      const { data, error } = await query;
      if (error) throw error;
      setTimetable(data || []);
    } catch (err) {
      console.error('Fetch timetable error:', err);
    } finally {
      setLoading(false);
    }
  }

  const [activeDay, setActiveDay] = useState(1); // 1: Mon, 5: Fri

  const handleClassSelect = (e) => {
    const id = e.target.value;
    setSelectedClassId(id);
    fetchTimetable(id, null);
  };

  const renderCells = () => {
    // Desktop View: Original Grid
    const desktopGrid = (
      <table className="tt-table desktop-only">
        <thead>
          <tr>
            <th className="tt-time-col">Time</th>
            {days.map(d => <th key={d}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map(time => (
            <tr key={time}>
              <td className="tt-time-col">{time}</td>
              {days.map((_, dayIdx) => (
                <td key={dayIdx}>
                  {getSlot(dayIdx, time).map(s => (
                    <div key={s.id} className="session-card">
                      <div className="session-subject">{s.subjects?.name}</div>
                      <div className="session-teacher">{s.teacher?.full_name || 'Staff'}</div>
                      <div className="session-meta">
                        <span>Room {s.room_number || 'TBA'}</span>
                        <span>{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</span>
                      </div>
                    </div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );

    // Mobile View: Single Day List
    const mobileList = (
      <div className="tt-mobile-list mobile-only">
        <div className="day-tabs">
          {['M', 'T', 'W', 'T', 'F'].map((d, i) => (
            <button
              key={i}
              className={activeDay === i + 1 ? 'active' : ''}
              onClick={() => setActiveDay(i + 1)}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="day-sessions">
          <h3>{days[activeDay - 1]} Schedule</h3>
          {timeSlots.map(time => {
            const sessions = getSlot(activeDay - 1, time);
            if (sessions.length === 0) return null;
            return sessions.map(s => (
              <div key={s.id} className="session-card mobile-session">
                <div className="session-time-badge">{time}</div>
                <div className="session-details">
                  <div className="session-subject">{s.subjects?.name}</div>
                  <div className="session-teacher">{s.teacher?.full_name}</div>
                  <div className="session-meta">Room {s.room_number} • {s.start_time.slice(0, 5)}</div>
                </div>
              </div>
            ));
          })}
          {timeSlots.every(t => getSlot(activeDay - 1, t).length === 0) && (
            <div className="empty-day">No classes scheduled for today.</div>
          )}
        </div>
      </div>
    );

    return <> {desktopGrid} {mobileList} </>;
  };

  return (
    <div className="timetable-page page-transition">
      <style>{`
        .timetable-page { min-height: 100vh; background: var(--bg); color: var(--ink); padding: 40px 24px; }
        .tt-container { max-width: 1200px; margin: 0 auto; }
        .tt-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        .tt-title h1 { font-size: 2.5rem; font-weight: 800; margin: 0; background: linear-gradient(135deg, var(--green) 0%, var(--ink) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .tt-title p { color: var(--muted); margin: 8px 0 0; }

        .tt-grid-wrapper { border-radius: var(--radius); overflow: hidden; }
        .tt-table { width: 100%; border-collapse: collapse; min-width: 900px; }
        .tt-table th { background: var(--panel); padding: 20px; text-align: center; color: var(--green); border-bottom: 1px solid var(--line); }
        .tt-table td { padding: 10px; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); vertical-align: top; min-width: 160px; background: var(--panel); }

        .session-card { background: var(--cream); border-left: 4px solid var(--green); padding: 12px; border-radius: 12px; margin-bottom: 8px; transition: transform 0.2s; }
        .session-card:hover { transform: translateY(-3px); }
        .session-subject { font-weight: 800; color: var(--ink); margin-bottom: 4px; }
        .session-teacher { color: var(--muted); font-size: 0.8rem; font-weight: 600; }

        /* Mobile Specifics */
        .mobile-only { display: none; }
        .day-tabs { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 30px; }
        .day-tabs button { flex: 1; padding: 15px; border: 1px solid var(--line); background: var(--panel); color: var(--muted); font-weight: 800; cursor: pointer; }
        .day-tabs button.active { background: var(--green); color: #fff; border-color: var(--green); box-shadow: var(--shadow); }

        .day-sessions h3 { margin-bottom: 20px; font-weight: 800; color: var(--ink); }
        .mobile-session { display: flex; align-items: center; gap: 20px; padding: 20px; margin-bottom: 15px; }
        .session-time-badge { font-weight: 800; color: var(--green); font-size: 1.1rem; }

        @media (max-width: 900px) {
          .desktop-only { display: none; }
          .mobile-only { display: block; }
          .tt-header { flex-direction: column; align-items: flex-start; gap: 20px; }
          .timetable-page { padding: 20px 15px 100px; }
        }
      `}</style>

      <div className="tt-container">
        <header className="tt-header">
          <div className="tt-title">
            <h1>School Timetable</h1>
            <p>Weekly academic schedule and class allocations</p>
          </div>
          <button className="back-btn" onClick={() => navigate('/portal')}>
            ← Back to Portal
          </button>
        </header>

        {['school_admin', 'super_admin'].includes(profile?.role) && (
          <div className="tt-controls">
            <span>Viewing Class:</span>
            <select value={selectedClassId} onChange={handleClassSelect}>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.grade})</option>
              ))}
            </select>
          </div>
        )}

        <div className="tt-grid-wrapper">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" style={{margin: '0 auto 20px'}}></div>
              Loading schedule...
            </div>
          ) : (
            <table className="tt-table">
              <thead>
                <tr>
                  <th className="tt-time-col">Time</th>
                  {days.map(d => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map(time => (
                  <tr key={time}>
                    <td className="tt-time-col">{time}</td>
                    {days.map((_, dayIdx) => (
                      <td key={dayIdx}>
                        {getSlot(dayIdx, time).map(s => (
                          <div key={s.id} className="session-card">
                            <div className="session-subject">{s.subjects?.name}</div>
                            <div className="session-teacher">{s.teacher?.full_name || 'Staff'}</div>
                            <div className="session-meta">
                              <span>Room {s.room_number || 'TBA'}</span>
                              <span>{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</span>
                            </div>
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
