import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SuperAdminOverview() {
  const [metrics, setMetrics] = useState(null)
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const [allSchools, activeSchools, pendingSchools, suspendedSchools, activeSubs, planRequests, schoolList] = await Promise.all([
      supabase.from('schools').select('id', { count: 'exact', head: true }),
      supabase.from('schools').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('schools').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('schools').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', ['active', 'trial']),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('request_status', 'pending'),
      supabase.from('schools').select('id,name,slug,email,admin_email,status,subscription_plan,logo_url,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(5)
    ])
    setMetrics([
      ['Total schools', allSchools.count], ['Active schools', activeSchools.count], ['Pending approval', pendingSchools.count],
      ['Suspended schools', suspendedSchools.count], ['Active subscriptions', activeSubs.count], ['Plan requests', planRequests.count]
    ])
    setPending(schoolList.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return <div className="platform-overview">
    <section className="platform-overview-head"><div><p className="eyebrow blue-eyebrow">PLATFORM OPERATIONS</p><h2>School network</h2><p>Review registrations, subscription requests and school workspace status.</p></div><button type="button" onClick={load} disabled={loading}>↻ Refresh</button></section>
    {!supabase ? <div className="platform-empty">Connect Supabase to manage registered schools.</div> : <>
      <section className="platform-metric-grid">{(metrics || [['Schools','—'],['Active schools','—'],['Pending approval','—'],['Suspended schools','—'],['Active subscriptions','—'],['Plan requests','—']]).map(([label,value]) => <article className="platform-metric" key={label}><span>{label}</span><b>{loading ? '…' : value ?? '—'}</b></article>)}</section>
      <section className="platform-pending-panel"><div className="platform-pending-heading"><div><p className="eyebrow blue-eyebrow">NEEDS REVIEW</p><h3>School registration requests</h3></div><button type="button" onClick={() => navigate('/super-admin?module=School%20approvals')}>All approvals →</button></div>
        {loading ? <p className="platform-overview-empty">Loading school requests…</p> : pending.length ? <div className="platform-pending-list">{pending.map(school => <article key={school.id}><span className="platform-school-logo">{school.logo_url ? <img src={school.logo_url} alt="" /> : (school.name || 'S').slice(0, 1)}</span><div><b>{school.name}</b><small>{school.admin_email || school.email || 'No administrator email'} · {school.subscription_plan || 'Starter'}</small></div><button type="button" onClick={() => navigate('/super-admin?module=School%20approvals')}>Review</button></article>)}</div> : <p className="platform-overview-empty">No schools are waiting for approval.</p>}
      </section>
      <section className="platform-quick-links"><button onClick={() => navigate('/super-admin?module=Schools')}>Manage schools <span>→</span></button><button onClick={() => navigate('/super-admin?module=Subscriptions')}>Manage subscriptions <span>→</span></button></section>
    </>}
  </div>
}
