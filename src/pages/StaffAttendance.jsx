import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { hasSchoolPermission } from '../lib/schoolRoles'

const states = ['present', 'late', 'absent', 'leave', 'half_day']
const localDateValue = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const localTime = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''

export default function StaffAttendance() {
  const { profile, staffRoles } = useAuth()
  const canManage = hasSchoolPermission(profile?.role, staffRoles, 'school.staff_attendance.manage')
  const [date, setDate] = useState(localDateValue)
  const [staff, setStaff] = useState([])
  const [marks, setMarks] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!profile?.school_id || !supabase) return
    setLoading(true)
    const [people, attendance] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role').eq('school_id', profile.school_id).in('role', ['school_admin', 'teacher']).order('full_name'),
      supabase.from('staff_attendance').select('staff_profile_id,status,check_in_at,check_out_at,note').eq('school_id', profile.school_id).eq('attendance_date', date)
    ])
    if (people.error) toast.error('Could not load staff list')
    if (attendance.error) toast.error(attendance.error.message || 'Could not load attendance. Apply migration 039.')
    setStaff(people.data || [])
    const next = {}
    for (const row of attendance.data || []) next[row.staff_profile_id] = { ...row, note: row.note || '' }
    setMarks(next)
    setLoading(false)
  }, [profile?.school_id, date])

  useEffect(() => { load() }, [load])

  async function save(profileId) {
    if (!supabase) return
    const mark = marks[profileId] || {}
    if (!mark.status) { toast.error('Choose an attendance status first'); return }
    setSavingId(profileId)
    const { error } = await supabase.from('staff_attendance').upsert({
      school_id: profile.school_id,
      staff_profile_id: profileId,
      attendance_date: date,
      status: mark.status,
      check_in_at: mark.check_in_at || null,
      check_out_at: mark.check_out_at || null,
      note: mark.note?.trim() || null,
      recorded_by: profile.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'school_id,staff_profile_id,attendance_date' })
    setSavingId(null)
    if (error) { toast.error(error.message || 'Could not save attendance'); return }
    toast.success('Attendance saved')
    load()
  }

  const visibleStaff = staff.filter(person => (person.full_name || '').toLowerCase().includes(search.toLowerCase()))
  const update = (id, key, value) => setMarks(current => ({ ...current, [id]: { ...current[id], [key]: value } }))
  return <main className="staff-attendance-page">
    <style>{`.staff-attendance-page{max-width:1150px;margin:auto;padding:36px 24px;color:var(--ink)}.staff-attendance-head{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:22px}.staff-attendance-head h1{margin:4px 0}.staff-attendance-head p{color:var(--muted);margin:0}.staff-attendance-tools{display:flex;gap:10px;margin:18px 0}.staff-attendance-tools input,.staff-attendance-table select,.staff-attendance-table input{padding:9px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}.staff-attendance-tools input{min-width:200px}.staff-attendance-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface,white)}.staff-attendance-table{width:100%;border-collapse:collapse;min-width:680px}.staff-attendance-table th,.staff-attendance-table td{text-align:left;padding:12px;border-bottom:1px solid var(--line)}.staff-attendance-table th{color:var(--muted);font-size:.86rem}.staff-attendance-table td input,.staff-attendance-table td select{width:100%;box-sizing:border-box}.staff-attendance-table tr:last-child td{border:0}.staff-attendance-empty{text-align:center;padding:35px;color:var(--muted)}`}</style>
    <header className="staff-attendance-head"><div><p className="eyebrow">People operations</p><h1>Staff attendance</h1><p>Record daily attendance for teachers and school administrators.</p></div></header>
    {!canManage ? <p className="staff-attendance-empty">You do not have permission to manage staff attendance.</p> : <>
    <div className="staff-attendance-tools"><input type="date" value={date} onChange={event => setDate(event.target.value)} aria-label="Attendance date" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search staff" aria-label="Search staff" /></div>
    {loading ? <div className="staff-attendance-empty">Loading attendance…</div> : <div className="staff-attendance-wrap"><table className="staff-attendance-table"><thead><tr><th>Staff member</th><th>Status</th><th>Check in</th><th>Check out</th><th>Note</th><th></th></tr></thead><tbody>
      {visibleStaff.map(person => { const mark = marks[person.id] || {}; return <tr key={person.id}><td><strong>{person.full_name || 'Staff member'}</strong><div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{person.role.replace('_', ' ')}</div></td><td><select value={mark.status || ''} onChange={event => update(person.id, 'status', event.target.value)}><option value="">Not marked</option>{states.map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></td><td><input type="time" value={localTime(mark.check_in_at)} onChange={event => update(person.id, 'check_in_at', event.target.value ? new Date(`${date}T${event.target.value}`).toISOString() : '')} /></td><td><input type="time" value={localTime(mark.check_out_at)} onChange={event => update(person.id, 'check_out_at', event.target.value ? new Date(`${date}T${event.target.value}`).toISOString() : '')} /></td><td><input value={mark.note || ''} onChange={event => update(person.id, 'note', event.target.value)} placeholder="Optional note" /></td><td><button className="button blue-button" disabled={savingId === person.id} onClick={() => save(person.id)}>{savingId === person.id ? 'Saving…' : 'Save'}</button></td></tr> })}
      {!visibleStaff.length && <tr><td className="staff-attendance-empty" colSpan="6">No staff found.</td></tr>}
    </tbody></table></div>}
    </>}
  </main>
}
