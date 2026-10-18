import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { scheduleEventReminder } from '../lib/notifications'
import { roleRoute } from '../lib/roleRoute'

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const sampleEvents = [
  { id: 'demo-event-1', title: 'Staff planning meeting', description: 'Review this week’s school priorities.', event_date: dateKey(new Date()), type: 'event' },
  { id: 'demo-event-2', title: 'Science project due', description: 'Submit the class science project.', event_date: dateKey(new Date(Date.now() + 86400000)), type: 'assignment' },
  { id: 'demo-event-3', title: 'Family reading morning', description: 'Families are welcome in the library.', event_date: dateKey(new Date(Date.now() + 4 * 86400000)), type: 'event' }
]

export default function SchoolCalendar() {
  const { profile, demo } = useAuth()
  const navigate = useNavigate()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ title: '', description: '', event_date: dateKey(new Date()) })
  const canCreate = ['school_admin', 'teacher'].includes(profile?.role)
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(currentDate)

  const fetchEvents = useCallback(async () => {
    if (!profile) return
    setLoading(true); setLoadError('')
    if (demo || profile.school_id === 'demo-school-id') {
      setEvents(sampleEvents.map(item => ({ ...item, dateKey: item.event_date })))
      setLoading(false)
      return
    }
    if (!supabase || !profile.school_id) {
      setEvents([]); setLoadError('This account is not connected to a school calendar.'); setLoading(false); return
    }
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    const from = dateKey(start), until = dateKey(nextMonth)
    try {
      const [eventsRes, assignmentsRes, assessmentsRes] = await Promise.all([
        supabase.from('events').select('*').eq('school_id', profile.school_id).gte('event_date', `${from}T00:00:00`).lt('event_date', `${until}T00:00:00`).order('event_date'),
        supabase.from('assignments').select('id,title,due_date').eq('school_id', profile.school_id).gte('due_date', from).lt('due_date', until).order('due_date'),
        supabase.from('quizzes').select('id,title,due_at,assessment_type,unit_title,subjects(name)').eq('school_id', profile.school_id).eq('published', true).gte('due_at', `${from}T00:00:00`).lt('due_at', `${until}T00:00:00`).order('due_at')
      ])
      if (eventsRes.error) throw eventsRes.error
      if (assignmentsRes.error) throw assignmentsRes.error
      if (assessmentsRes.error) throw assessmentsRes.error
      const all = [
        ...(eventsRes.data || []).map(item => ({ ...item, type: 'event', dateKey: String(item.event_date).slice(0, 10) })),
        ...(assignmentsRes.data || []).map(item => ({ ...item, type: 'assignment', event_date: item.due_date, dateKey: String(item.due_date).slice(0, 10) })),
        ...(assessmentsRes.data || []).map(item => ({ ...item, type: 'assessment', event_date: item.due_at, description: `${(item.assessment_type || 'quiz').toUpperCase()} · ${item.subjects?.name || 'Subject'}${item.unit_title ? ` · ${item.unit_title}` : ''}`, dateKey: String(item.due_at).slice(0, 10) }))
      ].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      setEvents(all)
    } catch (error) {
      console.error('Error fetching calendar data:', error)
      setLoadError(error.message || 'Could not load this month’s calendar.')
      setEvents([])
    } finally { setLoading(false) }
  }, [profile, demo, currentDate])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const eventsByDay = useMemo(() => events.reduce((byDay, event) => {
    byDay[event.dateKey] = [...(byDay[event.dateKey] || []), event]
    return byDay
  }, {}), [events])

  const moveMonth = amount => setCurrentDate(value => new Date(value.getFullYear(), value.getMonth() + amount, 1))
  const openEvent = event => setSelectedEvent(event)

  async function createEvent(event) {
    event.preventDefault()
    if (!draft.title.trim() || !draft.event_date) return
    setSaving(true)
    const payload = { school_id: profile.school_id, title: draft.title.trim(), description: draft.description.trim() || null, event_date: `${draft.event_date}T12:00:00` }
    try {
      if (demo || profile.school_id === 'demo-school-id') {
        const next = { id: `demo-event-${Date.now()}`, ...payload, type: 'event', dateKey: draft.event_date }
        setEvents(items => [...items, next].sort((a, b) => a.dateKey.localeCompare(b.dateKey)))
      } else {
        const { error } = await supabase.from('events').insert(payload)
        if (error) throw error
        await fetchEvents()
      }
      setShowCreate(false); setDraft({ title: '', description: '', event_date: dateKey(new Date()) }); toast.success('Calendar event added.')
    } catch (error) { toast.error(error.message || 'Could not create event.') }
    finally { setSaving(false) }
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const totalDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
  const cells = [...Array(firstDay)].map((_, index) => <div key={`blank-${index}`} className="calendar-cell empty" aria-hidden="true" />)
  for (let day = 1; day <= totalDays; day++) {
    const key = dateKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))
    const dayEvents = eventsByDay[key] || []
    cells.push(<div className={`calendar-cell ${key === dateKey(new Date()) ? 'today' : ''}`} key={key}>
      <span className="day-number">{day}</span>
      <div className="calendar-event-list">{dayEvents.map(item => <button type="button" key={`${item.type}-${item.id}`} className={`event-tag ${item.type}`} title={item.title} onClick={() => openEvent(item)}>{item.title}</button>)}</div>
      {dayEvents.length > 0 && <button type="button" className="remind-me" aria-label={`Set reminder for ${dayEvents[0].title}`} onClick={() => scheduleEventReminder({ ...dayEvents[0], date: new Date(`${dayEvents[0].dateKey}T12:00:00`) })}>🔔</button>}
    </div>)
  }
  const upcoming = events.filter(item => item.dateKey >= dateKey(new Date())).slice(0, 8)

  return <section className="calendar-page">
    <style>{`
      .calendar-page{width:100%;padding:clamp(8px,2vw,24px);color:var(--ink)}.calendar-title-row{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:0 0 18px}.calendar-title-row h1{margin:0;font-size:clamp(1.35rem,3vw,2rem)}.calendar-title-row p{margin:5px 0 0;color:var(--muted);font-size:.9rem}.calendar-actions{display:flex;gap:8px;align-items:center}.calendar-actions button,.calendar-header button{min-height:40px;border:1px solid var(--line);border-radius:9px;padding:8px 12px;background:var(--panel);color:var(--ink);font-weight:700;cursor:pointer}.calendar-actions .calendar-create{background:var(--school-accent-strong);border-color:var(--school-accent-strong);color:white}.calendar-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.month-nav{display:flex;align-items:center;gap:12px}.month-nav h2{min-width:190px;margin:0;text-align:center;font-size:1.15rem}.calendar-grid-header,.calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.calendar-grid-header{margin-bottom:6px;text-align:center;color:var(--muted);font-size:.78rem;font-weight:800}.calendar-grid{gap:1px;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--line)}.calendar-cell{position:relative;display:flex;min-width:0;min-height:clamp(82px,10vw,132px);flex-direction:column;padding:8px;background:var(--panel)}.calendar-cell.empty{background:var(--bg)}.calendar-cell.today .day-number{display:grid;width:26px;height:26px;place-items:center;border-radius:50%;background:var(--school-accent-strong);color:#fff}.day-number{width:26px;height:26px;font-size:.82rem;font-weight:750}.calendar-event-list{display:grid;gap:4px;margin-top:4px;padding-bottom:16px}.event-tag{width:100%;overflow:hidden;border:1px solid transparent;border-radius:5px;padding:4px 6px;text-align:left;text-overflow:ellipsis;white-space:nowrap;font-size:.68rem;cursor:pointer}.event-tag.event{background:color-mix(in srgb,var(--school-accent) 12%,white);border-color:color-mix(in srgb,var(--school-accent) 35%,white);color:var(--school-accent-strong)}.event-tag.assignment{background:#fff1f0;border-color:#ffd2cc;color:#b9382c}.remind-me{position:absolute;right:5px;bottom:4px;border:0;background:transparent;opacity:.65;cursor:pointer}.calendar-upcoming{margin-top:20px;padding:clamp(14px,2vw,22px);border:1px solid var(--line);border-radius:12px;background:var(--panel)}.calendar-upcoming h2{margin:0 0 12px;font-size:1.05rem}.upcoming-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.upcoming-event{display:flex;min-width:0;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink);text-align:left;cursor:pointer}.upcoming-event time{flex:0 0 54px;color:var(--school-accent-strong);font-size:.75rem;font-weight:800}.upcoming-event span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.calendar-message{padding:22px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--muted)}.calendar-modal-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:18px;background:#10263b88}.calendar-modal{width:min(480px,100%);padding:22px;border-radius:14px;background:var(--panel);box-shadow:0 20px 70px #07152245}.calendar-modal h2{margin:0 0 12px}.calendar-modal label{display:grid;gap:6px;margin:12px 0;font-size:.85rem;font-weight:700}.calendar-modal input,.calendar-modal textarea{width:100%;min-height:42px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}.calendar-modal textarea{min-height:100px;resize:vertical}.calendar-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.calendar-modal-actions button{padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-weight:700;cursor:pointer}.calendar-modal-actions button:last-child{background:var(--school-accent-strong);border-color:var(--school-accent-strong);color:#fff}
      .event-tag.assessment{background:#fff7df;border-color:#f1d98d;color:#755500}
      @media(max-width:680px){.calendar-page{padding:4px}.calendar-title-row{align-items:flex-start}.calendar-title-row p{font-size:.78rem}.calendar-actions button{min-height:36px;padding:7px 9px;font-size:.76rem}.calendar-grid-header,.calendar-grid{min-width:620px}.calendar-scroll{overflow-x:auto;padding-bottom:7px}.calendar-cell{min-height:88px;padding:5px}.event-tag{font-size:.62rem;padding:3px 4px}.upcoming-list{grid-template-columns:1fr}}
      @media(max-width:420px){.calendar-title-row{flex-direction:column}.calendar-actions{width:100%;justify-content:space-between}.calendar-header{gap:6px}.month-nav{gap:5px}.month-nav h2{min-width:140px;font-size:.98rem}.calendar-header button{padding:7px 9px}}
    `}</style>
    <div className="calendar-title-row"><div><h1>Calendar & events</h1><p>See school dates and assignment deadlines in one place.</p></div><div className="calendar-actions"><button type="button" onClick={() => navigate(roleRoute(profile?.role))}>← Dashboard</button>{canCreate && <button type="button" className="calendar-create" onClick={() => setShowCreate(true)}>＋ Add event</button>}</div></div>
    <div className="calendar-header"><button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹ Previous</button><div className="month-nav"><h2>{monthLabel}</h2></div><button type="button" onClick={() => moveMonth(1)} aria-label="Next month">Next ›</button></div>
    {loading ? <div className="calendar-message">Loading this month’s events…</div> : loadError ? <div className="calendar-message" role="alert">{loadError} <button type="button" onClick={fetchEvents}>Try again</button></div> : <>
      <div className="calendar-scroll"><div className="calendar-grid-header">{days.map(day => <div key={day}>{day}</div>)}</div><div className="calendar-grid">{cells}</div></div>
      <section className="calendar-upcoming"><h2>Upcoming this month</h2>{upcoming.length ? <div className="upcoming-list">{upcoming.map(item => <button type="button" className="upcoming-event" key={`upcoming-${item.type}-${item.id}`} onClick={() => openEvent(item)}><time>{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date(`${item.dateKey}T12:00:00`))}</time><span>{item.title}</span></button>)}</div> : <p className="calendar-message">No upcoming events this month.</p>}</section>
    </>}
    {selectedEvent && <div className="calendar-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedEvent(null) }}><section className="calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title"><p className="eyebrow">{selectedEvent.type === 'assignment' ? 'ASSIGNMENT DEADLINE' : selectedEvent.type === 'assessment' ? 'ASSESSMENT DEADLINE' : 'SCHOOL EVENT'}</p><h2 id="calendar-event-title">{selectedEvent.title}</h2><p>{new Intl.DateTimeFormat(undefined,{dateStyle:'full'}).format(new Date(`${selectedEvent.dateKey}T12:00:00`))}</p>{selectedEvent.description && <p>{selectedEvent.description}</p>}<div className="calendar-modal-actions"><button onClick={() => setSelectedEvent(null)}>Close</button>{selectedEvent.type === 'assignment' && profile?.role === 'student' && <button onClick={() => navigate(`/submit/${selectedEvent.id}`)}>Open assignment</button>}{selectedEvent.type === 'assessment' && <button onClick={() => navigate('/quizzes')}>Open assessments</button>}</div></section></div>}
    {showCreate && <div className="calendar-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowCreate(false) }}><form className="calendar-modal" onSubmit={createEvent} role="dialog" aria-modal="true" aria-labelledby="new-event-title"><h2 id="new-event-title">Add school event</h2><label>Event title<input autoFocus value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} maxLength={120} required /></label><label>Date<input type="date" value={draft.event_date} onChange={event => setDraft({ ...draft, event_date: event.target.value })} required /></label><label>Description<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} maxLength={1000} /></label><div className="calendar-modal-actions"><button type="button" onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save event'}</button></div></form></div>}
  </section>
}
