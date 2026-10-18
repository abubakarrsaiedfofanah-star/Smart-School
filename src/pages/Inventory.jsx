import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatters'
import { hasSchoolPermission } from '../lib/schoolRoles'

const emptyAsset = { name: '', category: '', serial_number: '', status: 'available', purchase_date: '', value: '', assigned_to: '' }
const statuses = ['available', 'assigned', 'maintenance', 'lost']

export default function Inventory() {
  const { profile, school, staffRoles } = useAuth()
  const navigate = useNavigate()
  const [assets, setAssets] = useState([])
  const [history, setHistory] = useState([])
  const [staff, setStaff] = useState([])
  const [form, setForm] = useState(emptyAsset)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const canManage = hasSchoolPermission(profile?.role, staffRoles, 'school.inventory.manage')

  const load = useCallback(async () => {
    if (!profile?.school_id || !supabase) return
    setLoading(true)
    const [assetResult, staffResult, historyResult] = await Promise.all([
      supabase.from('assets').select('id,name,category,serial_number,status,assigned_to,purchase_date,value,created_at').eq('school_id', profile.school_id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name').eq('school_id', profile.school_id).order('full_name'),
      canManage ? supabase.from('asset_change_logs').select('id,asset_name,action,actor_id,created_at,old_values,new_values').eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [] })
    ])
    if (assetResult.error) toast.error('Could not load school assets')
    setAssets(assetResult.data || [])
    setStaff(staffResult.data || [])
    setHistory(historyResult.data || [])
    setLoading(false)
  }, [profile?.school_id, canManage])

  useEffect(() => { load() }, [load])

  function resetForm() { setForm(emptyAsset); setEditingId(null) }

  async function saveAsset(event) {
    event.preventDefault()
    if (!canManage || !profile?.school_id || !supabase) return
    setSaving(true)
    const payload = {
      ...form,
      school_id: profile.school_id,
      name: form.name.trim(),
      category: form.category.trim() || null,
      serial_number: form.serial_number.trim() || null,
      assigned_to: form.assigned_to || null,
      purchase_date: form.purchase_date || null,
      value: form.value === '' ? null : Number(form.value)
    }
    const result = editingId
      ? await supabase.from('assets').update(payload).eq('id', editingId).eq('school_id', profile.school_id)
      : await supabase.from('assets').insert(payload)
    setSaving(false)
    if (result.error) { toast.error(result.error.message || 'Could not save asset'); return }
    toast.success(editingId ? 'Asset updated' : 'Asset added')
    resetForm()
    load()
  }

  async function removeAsset(asset) {
    if (!canManage || !supabase || !window.confirm(`Delete ${asset.name} from the inventory?`)) return
    const { error } = await supabase.from('assets').delete().eq('id', asset.id).eq('school_id', profile.school_id)
    if (error) { toast.error(error.message || 'Could not delete asset'); return }
    toast.success('Asset deleted')
    setAssets(current => current.filter(item => item.id !== asset.id))
  }

  function editAsset(asset) {
    setEditingId(asset.id)
    setForm({ ...emptyAsset, ...asset, value: asset.value ?? '', purchase_date: asset.purchase_date || '', assigned_to: asset.assigned_to || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const filtered = assets.filter(asset => `${asset.name} ${asset.category || ''} ${asset.serial_number || ''} ${asset.status}`.toLowerCase().includes(search.toLowerCase()))
  const counts = statuses.map(status => ({ status, count: assets.filter(asset => asset.status === status).length }))

  return <main className="inventory-page">
    <style>{`
      .inventory-page{max-width:1200px;margin:0 auto;padding:36px 24px;color:var(--ink)}
      .inventory-head{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:26px}
      .inventory-head h1{margin:4px 0}.inventory-head p{color:var(--muted);margin:0}
      .inventory-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:22px}
      .inventory-stat{padding:17px;border:1px solid var(--line);border-radius:14px;background:var(--surface, white)}
      .inventory-stat span{display:block;color:var(--muted);font-size:.84rem;text-transform:capitalize}.inventory-stat strong{font-size:1.5rem}
      .inventory-layout{display:grid;grid-template-columns:${canManage ? '320px minmax(0,1fr)' : '1fr'};gap:22px;align-items:start}
      .inventory-form,.inventory-list{padding:20px;border:1px solid var(--line);border-radius:16px;background:var(--surface, white)}
      .inventory-form h2,.inventory-list h2{font-size:1.1rem;margin:0 0 16px}
      .inventory-form input,.inventory-form select,.inventory-search{box-sizing:border-box;width:100%;padding:11px 12px;margin:0 0 11px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink)}
      .inventory-actions{display:flex;gap:8px;align-items:center}.inventory-table-wrap{overflow-x:auto}
      .inventory-table{width:100%;border-collapse:collapse;min-width:650px}.inventory-table th,.inventory-table td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line);font-size:.9rem}.inventory-table th{color:var(--muted);font-weight:600}
      .inventory-badge{display:inline-block;border-radius:20px;padding:4px 9px;background:var(--bg);text-transform:capitalize;font-size:.78rem}
      .inventory-empty{padding:28px;text-align:center;color:var(--muted)}
      @media(max-width:850px){.inventory-layout{grid-template-columns:1fr}.inventory-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.inventory-head{align-items:flex-start}}
    `}</style>
    <header className="inventory-head">
      <div><p className="eyebrow">School operations</p><h1>Inventory & assets</h1><p>Track school equipment, ownership, condition, and value.</p></div>
      <button className="button outline-button" onClick={() => navigate('/portal')}>← Dashboard</button>
    </header>
    <section className="inventory-stats" aria-label="Asset status counts">
      {counts.map(item => <div className="inventory-stat" key={item.status}><span>{item.status}</span><strong>{item.count}</strong></div>)}
    </section>
    <div className="inventory-layout">
      {canManage && <form className="inventory-form" onSubmit={saveAsset}>
        <h2>{editingId ? 'Edit asset' : 'Add an asset'}</h2>
        <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Asset name" required />
        <input value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="Category (e.g. Lab, Furniture)" />
        <input value={form.serial_number} onChange={event => setForm({ ...form, serial_number: event.target.value })} placeholder="Serial number / tag" />
        <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{statuses.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select>
        <select value={form.assigned_to} onChange={event => setForm({ ...form, assigned_to: event.target.value })}><option value="">Not assigned to a staff member</option>{staff.map(person => <option key={person.id} value={person.id}>{person.full_name || person.id}</option>)}</select>
        <input type="date" value={form.purchase_date} onChange={event => setForm({ ...form, purchase_date: event.target.value })} aria-label="Purchase date" />
        <input type="number" min="0" step="0.01" value={form.value} onChange={event => setForm({ ...form, value: event.target.value })} placeholder="Purchase value" aria-label="Purchase value" />
        <div className="inventory-actions"><button className="button blue-button" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add asset'}</button>{editingId && <button type="button" className="button outline-button" onClick={resetForm}>Cancel</button>}</div>
      </form>}
      <section className="inventory-list">
        <h2>School assets <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({assets.length})</span></h2>
        <input className="inventory-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, category, serial number, or status" aria-label="Search assets" />
        {loading ? <div className="inventory-empty">Loading school assets…</div> : filtered.length === 0 ? <div className="inventory-empty">{assets.length ? 'No assets match your search.' : 'No assets have been recorded yet.'}</div> : <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Asset</th><th>Category</th><th>Tag / serial</th><th>Status</th><th>Assigned to</th><th>Value</th>{canManage && <th>Actions</th>}</tr></thead><tbody>
          {filtered.map(asset => <tr key={asset.id}><td><strong>{asset.name}</strong>{asset.purchase_date && <div style={{ color: 'var(--muted)', fontSize: '.78rem' }}>Purchased {asset.purchase_date}</div>}</td><td>{asset.category || '—'}</td><td>{asset.serial_number || '—'}</td><td><span className="inventory-badge">{asset.status || 'available'}</span></td><td>{staff.find(person => person.id === asset.assigned_to)?.full_name || '—'}</td><td>{asset.value == null ? '—' : formatCurrency(asset.value, school?.currency_code || 'KES')}</td>{canManage && <td><div className="inventory-actions"><button className="button outline-button" onClick={() => editAsset(asset)}>Edit</button><button className="button outline-button" onClick={() => removeAsset(asset)}>Delete</button></div></td>}</tr>)}
        </tbody></table></div>}
      </section>
    </div>
    {canManage && <section className="inventory-list" style={{ marginTop: 22 }}><h2>Recent asset changes</h2>{history.length === 0 ? <div className="inventory-empty">No asset changes recorded yet. Apply migration 039 to enable history.</div> : <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr><th>Time</th><th>Asset</th><th>Action</th><th>Changed by</th><th>Changed fields</th></tr></thead><tbody>{history.map(row => { const before = row.old_values || {}; const after = row.new_values || {}; const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => !['id','school_id','created_at'].includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key])); return <tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.asset_name}</td><td style={{ textTransform: 'capitalize' }}>{row.action}</td><td>{staff.find(person => person.id === row.actor_id)?.full_name || row.actor_id || 'System'}</td><td>{row.action === 'insert' ? 'Asset created' : row.action === 'delete' ? 'Asset removed' : keys.map(key => `${key.replaceAll('_', ' ')}: ${String(before[key] ?? '—')} → ${String(after[key] ?? '—')}`).join('; ') || 'No visible field change'}</td></tr> })}</tbody></table></div>}</section>}
  </main>
}
