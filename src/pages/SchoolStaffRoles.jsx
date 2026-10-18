import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { SCHOOL_STAFF_ROLES } from '../lib/schoolRoles'

export default function SchoolStaffRoles() {
  const { profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    if (!supabase || !profile?.school_id) return
    setLoading(true)
    const [people, roles] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email').eq('school_id', profile.school_id).eq('role', 'teacher').order('full_name'),
      supabase.from('school_staff_role_assignments').select('id,profile_id,role_key').eq('school_id', profile.school_id)
    ])
    if (people.error || roles.error) toast.error('Could not load staff roles. Apply database migration 041 first.')
    setStaff(people.data || [])
    setAssignments(roles.data || [])
    setLoading(false)
  }, [profile?.school_id])
  useEffect(() => { void load() }, [load])

  async function toggle(person, role, existing) {
    if (role.available === false && !existing) return
    const key = `${person.id}:${role.key}`
    setBusy(key)
    const result = existing
      ? await supabase.from('school_staff_role_assignments').delete().eq('id', existing.id).eq('school_id', profile.school_id)
      : await supabase.from('school_staff_role_assignments').insert({ school_id: profile.school_id, profile_id: person.id, role_key: role.key, assigned_by: profile.id })
    setBusy('')
    if (result.error) toast.error(result.error.message || 'Could not update assignment')
    else { toast.success(existing ? 'Role removed' : 'Role assigned'); void load() }
  }

  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 32 }}>
    <p className="eyebrow">School administration</p><h1>Staff roles & access</h1>
    <p>Assign a staff member to one or more separate school workspaces. Active portals appear in that person’s staff portal hub. Only school administrators can change access.</p>
    <p className="staff-role-note">Nurse, counsellor, transport, and general staff portals are not available yet, so new access to those roles is disabled.</p>
    {loading ? <p>Loading staff…</p> : !staff.length ? <p>No teacher accounts are linked to this school yet. Create staff accounts under Portal accounts first, then assign their specialist responsibilities here.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th align="left">Staff member</th>{SCHOOL_STAFF_ROLES.map(role => <th key={role.key} title={role.description} style={{ padding: 8, opacity: role.available === false ? .55 : 1 }}>{role.label}{role.available === false && <small style={{ display: 'block' }}>Coming later</small>}</th>)}</tr></thead><tbody>{staff.map(person => <tr key={person.id} style={{ borderTop: '1px solid var(--line)' }}><td style={{ padding: 12 }}><strong>{person.full_name || 'Staff member'}</strong><br/><small>{person.email}</small></td>{SCHOOL_STAFF_ROLES.map(role => { const assignment = assignments.find(row => row.profile_id === person.id && row.role_key === role.key); const key = `${person.id}:${role.key}`; return <td key={role.key} align="center" title={role.description}><input type="checkbox" aria-label={`${role.label} for ${person.full_name || 'staff member'}`} checked={Boolean(assignment)} disabled={busy === key || (role.available === false && !assignment)} onChange={() => void toggle(person, role, assignment)} /></td> })}</tr>)}</tbody></table></div>}
  </main>
}
