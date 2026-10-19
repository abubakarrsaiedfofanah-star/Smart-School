import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { hasSchoolPermission } from '../lib/schoolRoles'
import '../styles/staff-attendance.css'

const states = ['present', 'late', 'absent', 'leave', 'half_day']
const statusLabel = value => value.replace('_', ' ')
const localDateValue = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const localTime = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
const toTimestamp = (date, time) => {
  if (!date || !time) return ''
  const value = new Date(`${date}T${time}`)
  return Number.isNaN(value.getTime()) ? '' : value.toISOString()
}
const cleanMark = row => ({
  status: row?.status || '',
  check_in_at: row?.check_in_at || '',
  check_out_at: row?.check_out_at || '',
  note: row?.note || ''
})

export default function StaffAttendance() {
  const { profile, staffRoles } = useAuth()
  const canManage = hasSchoolPermission(profile?.role, staffRoles, 'school.staff_attendance.manage')
  const [date, setDate] = useState(localDateValue)
  const [staff, setStaff] = useState([])
  const [marks, setMarks] = useState({})
  const [savedMarks, setSavedMarks] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingIds, setSavingIds] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (!profile?.school_id || !supabase) {
      setStaff([]); setMarks({}); setSavedMarks({}); setError('Connect this school to Supabase to manage staff attendance.'); setLoading(false)
      return
    }
    setLoading(true); setError('')
    const [people, attendance] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role').eq('school_id', profile.school_id).eq('is_active', true).in('role', ['school_admin', 'teacher', 'staff']).order('full_name'),
      supabase.from('staff_attendance').select('staff_profile_id,status,check_in_at,check_out_at,note').eq('school_id', profile.school_id).eq('attendance_date', date)
    ])
    if (currentRequest !== requestId.current) return
    if (people.error || attendance.error) {
      const message = people.error?.message || attendance.error?.message || 'Could not load attendance.'
      setError(message); setLoading(false); return
    }
    setStaff(people.data || [])
    const next = {}
    for (const row of attendance.data || []) next[row.staff_profile_id] = cleanMark(row)
    setMarks(next); setSavedMarks(next); setLoading(false)
  }, [profile?.school_id, date])

  useEffect(() => { void load() }, [load])

  const dirtyIds = useMemo(() => staff.filter(person => JSON.stringify(cleanMark(marks[person.id])) !== JSON.stringify(cleanMark(savedMarks[person.id]))).map(person => person.id), [staff, marks, savedMarks])
  const counts = useMemo(() => {
    const result = { all: staff.length, unmarked: 0, present: 0, late: 0, absent: 0, leave: 0, half_day: 0 }
    for (const person of staff) {
      const status = marks[person.id]?.status
      if (status && Object.hasOwn(result, status)) result[status]++
      else result.unmarked++
    }
    return result
  }, [staff, marks])

  const visibleStaff = useMemo(() => staff.filter(person => {
    const matchesName = (person.full_name || '').toLowerCase().includes(search.trim().toLowerCase())
    const matchesStatus = filter === 'all' || (filter === 'unmarked' ? !marks[person.id]?.status : marks[person.id]?.status === filter)
    return matchesName && matchesStatus
  }), [staff, marks, search, filter])

  const changeDate = nextDate => {
    if (dirtyIds.length && !window.confirm(`Discard unsaved changes for ${dirtyIds.length} staff member${dirtyIds.length === 1 ? '' : 's'}?`)) return
    setDate(nextDate)
  }
  const update = (id, key, value) => setMarks(current => ({ ...current, [id]: { ...cleanMark(current[id]), [key]: value } }))

  async function save(profileId) {
    if (!supabase || !profile?.school_id) return false
    const mark = cleanMark(marks[profileId])
    if (!mark.status) { toast.error('Choose an attendance status first'); return false }
    setSavingIds(current => [...new Set([...current, profileId])])
    const { error: saveError } = await supabase.from('staff_attendance').upsert({
      school_id: profile.school_id, staff_profile_id: profileId, attendance_date: date,
      status: mark.status, check_in_at: mark.check_in_at || null, check_out_at: mark.check_out_at || null,
      note: mark.note.trim() || null, recorded_by: profile.id, updated_at: new Date().toISOString()
    }, { onConflict: 'school_id,staff_profile_id,attendance_date' })
    setSavingIds(current => current.filter(id => id !== profileId))
    if (saveError) { toast.error(saveError.message || 'Could not save attendance'); return false }
    setSavedMarks(current => ({ ...current, [profileId]: mark })); toast.success(`${staff.find(person => person.id === profileId)?.full_name || 'Attendance'} saved`)
    return true
  }

  async function saveAll() {
    for (const id of dirtyIds) {
      const success = await save(id)
      if (!success) break
    }
  }

  return <main className="staff-attendance-page">
    <header className="staff-attendance-head">
      <div><p className="eyebrow">People operations</p><h1>Staff attendance</h1><p>Record daily attendance for teaching and non-teaching employees.</p></div>
      {canManage && dirtyIds.length > 0 && <button className="button blue-button staff-save-all" onClick={saveAll} disabled={savingIds.length > 0}>Save {dirtyIds.length} change{dirtyIds.length === 1 ? '' : 's'}</button>}
    </header>
    {!canManage ? <p className="staff-attendance-empty">You do not have permission to manage staff attendance.</p> : <>
      <div className="staff-attendance-tools"><label>Date<input type="date" required value={date} max={localDateValue()} onChange={event => { if (event.target.value) changeDate(event.target.value) }} aria-label="Attendance date" /></label><label className="staff-search">Search staff<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name" aria-label="Search staff" /></label></div>
      <section className="staff-attendance-summary" aria-label="Attendance summary">
        {[['all', 'All staff'], ['unmarked', 'Unmarked'], ...states.map(status => [status, statusLabel(status)])].map(([key, label]) => <button key={key} type="button" className={`staff-attendance-count ${filter === key ? 'selected' : ''}`} onClick={() => setFilter(current => current === key ? 'all' : key)} aria-pressed={filter === key}><span>{label}</span><strong>{counts[key]}</strong></button>)}
      </section>
      {error ? <section className="staff-attendance-error" role="alert"><div><strong>Attendance couldn’t load</strong><p>{error}</p></div><button type="button" className="button outline-button" onClick={() => void load()}>Try again</button></section> : null}
      {loading ? <div className="staff-attendance-empty" role="status">Loading attendance…</div> : !error ? <div className="staff-attendance-wrap"><table className="staff-attendance-table"><thead><tr><th scope="col">Staff member</th><th scope="col">Status</th><th scope="col">Check in</th><th scope="col">Check out</th><th scope="col">Note</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {visibleStaff.map(person => { const mark = cleanMark(marks[person.id]); const changed = dirtyIds.includes(person.id); return <tr key={person.id} className={changed ? 'is-dirty' : ''}><td data-label="Staff member"><strong>{person.full_name || 'Staff member'}</strong><span className="staff-role-label">{person.role.replace('_', ' ')}</span></td><td data-label="Status"><select value={mark.status} onChange={event => update(person.id, 'status', event.target.value)} aria-label={`Attendance status for ${person.full_name || 'staff member'}`}><option value="">Not marked</option>{states.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></td><td data-label="Check in"><input type="time" value={localTime(mark.check_in_at)} onChange={event => update(person.id, 'check_in_at', toTimestamp(date, event.target.value))} aria-label={`Check-in time for ${person.full_name || 'staff member'}`} /></td><td data-label="Check out"><input type="time" value={localTime(mark.check_out_at)} onChange={event => update(person.id, 'check_out_at', toTimestamp(date, event.target.value))} aria-label={`Check-out time for ${person.full_name || 'staff member'}`} /></td><td data-label="Note"><input maxLength={500} value={mark.note} onChange={event => update(person.id, 'note', event.target.value)} placeholder="Optional note" aria-label={`Note for ${person.full_name || 'staff member'}`} /></td><td data-label="Action"><button className="button blue-button" disabled={!changed || savingIds.includes(person.id)} onClick={() => void save(person.id)}>{savingIds.includes(person.id) ? 'Saving…' : changed ? 'Save' : 'Saved'}</button></td></tr> })}
        {!visibleStaff.length && <tr><td className="staff-attendance-empty" colSpan="6">{staff.length ? 'No staff match these filters.' : 'No staff members found.'}</td></tr>}
      </tbody></table></div> : null}
    </>}
  </main>
}
