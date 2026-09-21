import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { scheduleEventReminder } from '../lib/notifications';

export default function SchoolCalendar() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    fetchEvents();
  }, [profile, currentDate]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      // Fetch both events and assignments (as deadlines)
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString();

      const [eventsRes, assignmentsRes] = await Promise.all([
        supabase.from('events').select('*').eq('school_id', profile.school_id).gte('event_date', startOfMonth).lte('event_date', endOfMonth),
        supabase.from('assignments').select('id, title, due_date').eq('school_id', profile.school_id).gte('due_date', startOfMonth.split('T')[0]).lte('due_date', endOfMonth.split('T')[0])
      ]);

      const allEvents = [
        ...(eventsRes.data || []).map(e => ({ ...e, type: 'event', date: new Date(e.event_date) })),
        ...(assignmentsRes.data || []).map(a => ({ ...a, type: 'assignment', date: new Date(a.due_date), event_date: a.due_date }))
      ];

      setEvents(allEvents);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      toast.error('Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  };

  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const renderHeader = () => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return (
      <div className="calendar-header">
        <button onClick={() => navigate('/portal')} className="back-btn">← Back</button>
        <div className="month-nav">
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}>‹</button>
          <h2>{months[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}>›</button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return <div className="calendar-grid-header">{days.map(d => <div key={d}>{d}</div>)}</div>;
  };

  const renderCells = () => {
    const totalDays = daysInMonth(currentDate.getFullYear(), currentDate.getMonth());
    const startDay = firstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
    const cells = [];

    // Empty cells for padding
    for (let i = 0; i < startDay; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-cell empty"></div>);
    }

    // Days of the month
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), d).toISOString().split('T')[0];
      const dayEvents = events.filter(e => e.date.getDate() === d && e.date.getMonth() === currentDate.getMonth());

      cells.push(
        <div key={d} className="calendar-cell">
          <span className="day-number">{d}</span>
          <div className="event-list">
            {dayEvents.map((e, i) => (
              <div
                key={i}
                className={`event-tag ${e.type}`}
                title={e.title}
                onClick={() => e.type === 'assignment' && navigate(`/submit/${e.id}`)}
              >
                {e.title}
              </div>
            ))}
          </div>
          {dayEvents.length > 0 && (
             <button className="remind-me" onClick={() => scheduleEventReminder(dayEvents[0])}>🔔</button>
          )}
        </div>
      );
    }

    return <div className="calendar-grid">{cells}</div>;
  };

  return (
    <div className="calendar-page">
      <style>{`
        .calendar-page { padding: 40px; max-width: 1200px; margin: 0 auto; min-height: 100vh; }
        .calendar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; }
        .month-nav { display: flex; align-items: center; gap: 20px; }
        .month-nav h2 { font: 700 1.8rem 'Playfair Display', serif; margin: 0; min-width: 250px; text-align: center; }
        .month-nav button { background: var(--cream); border: 1px solid var(--line); width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; display: grid; place-items: center; }

        .calendar-grid-header { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-weight: 700; color: var(--muted); margin-bottom: 10px; }
        .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
        .calendar-cell { background: #fff; min-height: 120px; padding: 10px; display: flex; flex-direction: column; position: relative; }
        .calendar-cell.empty { background: #f9fafb; }
        .day-number { font-weight: 700; color: var(--ink); font-size: 0.9rem; }

        .event-list { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
        .event-tag { font-size: 0.7rem; padding: 4px 8px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
        .event-tag.event { background: var(--cream); color: var(--green); border: 1px solid var(--green); }
        .event-tag.assignment { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; }

        .remind-me { position: absolute; bottom: 8px; right: 8px; background: none; border: none; cursor: pointer; font-size: 0.9rem; opacity: 0.3; transition: opacity 0.2s; }
        .calendar-cell:hover .remind-me { opacity: 1; }

        @media (max-width: 768px) {
          .calendar-page { padding: 15px; }
          .calendar-cell { min-height: 80px; padding: 5px; }
          .event-tag { font-size: 0.6rem; padding: 2px 4px; }
          .month-nav h2 { font-size: 1.2rem; min-width: 150px; }
        }
      `}</style>

      {renderHeader()}
      <div className="glass-card" style={{padding: '20px'}}>
        {renderDays()}
        {loading ? (
          <div className="portal-loading" style={{minHeight: '400px'}}><div className="spinner"></div></div>
        ) : (
          renderCells()
        )}
      </div>
    </div>
  );
}
