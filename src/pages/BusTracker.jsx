import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function BusTracker() {
  const { profile, demo } = useAuth()
  const [busData, setBusData] = useState(null)
  const [message, setMessage] = useState('Loading bus routes…')

  useEffect(() => {
    if (demo || !supabase || !profile?.school_id) {
      setMessage('Connect a school account to load bus routes.')
      return undefined
    }

    let active = true
    const loadRoute = async () => {
      const { data, error } = await supabase.from('bus_routes').select('*')
        .eq('school_id', profile.school_id).eq('status', 'active').limit(1).maybeSingle()
      if (!active) return
      if (error) setMessage('Bus route data is unavailable.')
      else if (!data) setMessage('No active bus route is available.')
      else { setBusData(data); setMessage('') }
    }
    void loadRoute()

    const channel = supabase.channel(`bus-location-${profile.school_id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bus_routes', filter: `school_id=eq.${profile.school_id}` }, payload => {
        if (!active) return
        if (payload.new.status === 'active') { setBusData(payload.new); setMessage('') }
        else { setBusData(null); setMessage('No active bus route is available.') }
      }).subscribe()

    return () => { active = false; void supabase.removeChannel(channel) }
  }, [demo, profile?.school_id])

  const hasLocation = busData?.last_lat != null && busData?.last_lng != null
  return <main className="bus-tracker-container">
    <style>{`.bus-tracker-container{min-height:100%;padding:clamp(16px,4vw,32px);background:var(--bg);color:var(--ink)}.bus-tracker-card{max-width:800px;margin:auto;padding:clamp(18px,3vw,28px);border:1px solid var(--line);border-radius:18px;background:var(--panel);box-shadow:var(--shadow)}.bus-tracker-card h1{margin:0;font-size:clamp(1.35rem,3vw,1.8rem)}.bus-route-meta{margin:8px 0 20px;color:var(--muted)}.bus-route-data{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:12px}.bus-route-data article{min-width:0;padding:15px;border:1px solid var(--line);border-radius:12px;background:var(--bg)}.bus-route-data small{display:block;margin-bottom:6px;color:var(--muted)}.bus-route-data strong{display:block;overflow-wrap:anywhere}.bus-route-empty{padding:24px;border:1px dashed var(--line);border-radius:12px;color:var(--muted)}`}</style>
    <section className="bus-tracker-card">
      <h1>Bus tracking</h1>
      <p className="bus-route-meta">Route: {busData?.route_name || '—'}</p>
      {busData ? <div className="bus-route-data">
        <article><small>Vehicle</small><strong>{busData.vehicle_number || 'Not provided'}</strong></article>
        <article><small>Status</small><strong>{busData.status}</strong></article>
        <article><small>Current location</small><strong>{hasLocation ? `${Number(busData.last_lat).toFixed(5)}, ${Number(busData.last_lng).toFixed(5)}` : 'Location unavailable'}</strong></article>
        <article><small>Last updated</small><strong>{busData.last_updated ? new Date(busData.last_updated).toLocaleString() : 'Not provided'}</strong></article>
      </div> : <p className="bus-route-empty" role="status">{message}</p>}
    </section>
  </main>
}
