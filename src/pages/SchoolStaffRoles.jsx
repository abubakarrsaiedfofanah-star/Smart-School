import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { SCHOOL_STAFF_ROLES } from '../lib/schoolRoles'

export default function SchoolStaffRoles() {
  const { profile, demo } = useAuth()
  const [staff, setStaff] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    if (demo || !supabase || !profile?.school_id) {
      setStaff([])
      setAssignments([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [people, roles] = await Promise.all([
        supabase.from('profiles').select('id,full_name,email').eq('school_id', profile.school_id).in('role', ['teacher', 'staff']).eq('is_active', true).order('full_name'),
        supabase.from('school_staff_role_assignments').select('id,profile_id,role_key').eq('school_id', profile.school_id)
      ])
      if (people.error) throw people.error
      if (roles.error) throw roles.error
      setStaff(people.data || [])
      setAssignments(roles.data || [])
    } catch (error) {
      setStaff([])
      setAssignments([])
      toast.error(error?.message || 'Could not load staff roles. Check the connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [demo, profile?.school_id])
  useEffect(() => { void load() }, [load])

  async function toggle(person, role, existing) {
    if (demo || !supabase || role.available === false && !existing) return
    const key = `${person.id}:${role.key}`
    setBusy(key)
    try {
      const result = existing
        ? await supabase.from('school_staff_role_assignments').delete().eq('id', existing.id).eq('school_id', profile.school_id).select('id').maybeSingle()
        : await supabase.from('school_staff_role_assignments').insert({ school_id: profile.school_id, profile_id: person.id, role_key: role.key, assigned_by: profile.id }).select('id').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) throw new Error('The role assignment was not changed. It may have been updated already or your access may have changed.')
      toast.success(existing ? 'Role removed' : 'Role assigned')
      await load()
    } catch (error) {
      toast.error(error?.message || 'Could not update assignment. Check the connection and try again.')
    } finally {
      setBusy('')
    }
  }

  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: 32 }}>
    <p className="eyebrow">School administration</p><h1>Staff roles & access</h1>
    <p>Assign specialist workspace access to active teacher and non-teaching staff accounts. Non-teaching staff use their own staff dashboard and do not receive teaching tools. Only school administrators can change specialist access.</p>
    <p className="staff-role-note">Nurse, counsellor, transport, and general staff portals are not available yet, so new access to those roles is disabled.</p>
    {demo ? <p className="staff-role-note" role="status">Demo access is read only. Connect a school workspace to manage staff roles.</p> : loading ? <p>Loading staff…</p> : !supabase ? <p className="staff-role-note" role="status">Connect this workspace to Supabase to load and manage staff roles.</p> : !staff.length ? <p>No active teacher or staff accounts are linked to this school yet. Invite employees from Portal accounts and assign their specialist responsibilities here.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th align="left">Teacher or staff account</th>{SCHOOL_STAFF_ROLES.map(role => <th key={role.key} title={role.description} style={{ padding: 8, opacity: role.available === false ? .55 : 1 }}>{role.label}{role.available === false && <small style={{ display: 'block' }}>Coming later</small>}</th>)}</tr></thead><tbody>{staff.map(person => <tr key={person.id} style={{ borderTop: '1px solid var(--line)' }}><td style={{ padding: 12 }}><strong>{person.full_name || 'Staff member'}</strong><br/><small>{person.email}</small></td>{SCHOOL_STAFF_ROLES.map(role => { const assignment = assignments.find(row => row.profile_id === person.id && row.role_key === role.key); const key = `${person.id}:${role.key}`; return <td key={role.key} align="center" title={role.description}><input type="checkbox" aria-label={`${role.label} for ${person.full_name || 'staff member'}`} checked={Boolean(assignment)} disabled={busy === key || (role.available === false && !assignment)} onChange={() => void toggle(person, role, assignment)} /></td> })}</tr>)}</tbody></table></div>}
  </main>
}
