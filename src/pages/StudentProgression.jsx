import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function StudentProgression() {
  const { profile, staffRoles = [] } = useAuth()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const authorized = profile?.role === 'school_admin' || (profile?.role === 'staff' && staffRoles.includes('principal'))
  const load = async () => {
    if (!supabase || !profile?.school_id) return
    const { data, error } = await supabase.from('classes').select('id,name,grade,next_class_id,promotion_minimum_percentage,promotion_term').eq('school_id', profile.school_id).order('name')
    if (error) toast.error(error.message)
    setClasses(data || [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [profile?.school_id])
  const update = (id, key, value) => setClasses(items => items.map(item => item.id === id ? { ...item, [key]: value } : item))
  const save = async row => {
    setSaving(row.id)
    const { error } = await supabase.rpc('school_set_class_progression', {
      p_class_id: row.id, p_next_class_id: row.next_class_id || null,
      p_minimum_percentage: Number(row.promotion_minimum_percentage), p_promotion_term: 'Term 3'
    })
    if (error) toast.error(error.message); else toast.success('Class progression settings saved.')
    setSaving('')
  }
  return <section className="page-wrap">
    <div className="page-heading"><div><p className="eyebrow">Academics</p><h1>Student progression</h1><p>Set each class’s next level, pass mark, and promotion term. Eligible learners move automatically when every exam result for that term is published.</p></div></div>
    {!authorized ? <div className="panel">A principal or school administrator can manage student progression settings.</div> : loading ? <div className="portal-loading"><div className="spinner" /></div> : !classes.length ? <div className="empty-state">Create classes before setting promotion paths.</div> : <div className="panel"><div className="table-wrap"><table><thead><tr><th>Current class</th><th>Promote to</th><th>Pass mark (%)</th><th>Promotion period</th><th /></tr></thead><tbody>{classes.map(row => <tr key={row.id}><td>{row.name}{row.grade ? ` · ${row.grade}` : ''}</td><td><select aria-label={`Next class after ${row.name}`} value={row.next_class_id || ''} onChange={event => update(row.id, 'next_class_id', event.target.value)}><option value="">No automatic promotion</option>{classes.filter(item => item.id !== row.id).map(item => <option key={item.id} value={item.id}>{item.name}{item.grade ? ` · ${item.grade}` : ''}</option>)}</select></td><td><input aria-label={`Pass mark for ${row.name}`} type="number" min="0" max="100" step="0.5" value={row.promotion_minimum_percentage ?? 50} onChange={event => update(row.id, 'promotion_minimum_percentage', event.target.value)} style={{ width: 90 }} /></td><td><span>Term 3 · end of academic year</span></td><td><button className="btn btn-primary" type="button" disabled={saving === row.id} onClick={() => save(row)}>{saving === row.id ? 'Saving…' : 'Save'}</button></td></tr>)}</tbody></table></div><p style={{ marginTop: 16 }}>Promotion is considered after exams and published results cover Term 1, Term 2, and Term 3. The overall annual score is compared with the pass mark; learners below it remain in their current class.</p></div>}
  </section>
}
