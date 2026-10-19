import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const actions = [
  ['Dashboard', 'Open your dashboard', role => role === 'super_admin' ? '/super-admin' : role ? `/${role.replace('_', '-')}` : '/'],
  ['Record attendance', 'Open the attendance workspace', role => role === 'teacher' ? '/teacher?module=Take%20attendance' : '/school-admin?module=Attendance'],
  ['Gradebook', 'Review grades and assessment marks', () => '/gradebook'],
  ['Calendar', 'View school events and reminders', () => '/calendar'],
  ['Timetable', 'View the school timetable', () => '/timetable'],
  ['Messages', 'Open school messages', () => '/chat'],
  ['Profile settings', 'Update your account profile', () => '/profile'],
  ['Security settings', 'Password and authenticator settings', () => '/security'],
]

export default function CommandPalette() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const entries = useMemo(() => actions.filter(([, , href]) => {
    const target = href(profile?.role)
    return target !== '/gradebook' || ['teacher', 'school_admin'].includes(profile?.role)
  }).filter(([label, description]) => (label !== 'Record attendance' || ['teacher', 'school_admin'].includes(profile?.role)) && `${label} ${description}`.toLowerCase().includes(query.toLowerCase())), [profile?.role, query])

  useEffect(() => {
    const onKeyDown = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); setQuery('') }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  if (!session || !profile) return null
  const go = href => { setOpen(false); navigate(href(profile.role)) }

  return <>
    <style>{`.command-trigger{position:fixed;z-index:20;right:20px;bottom:20px;display:flex;align-items:center;gap:9px;padding:10px 13px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink);box-shadow:var(--shadow);cursor:pointer}.command-trigger kbd{padding:2px 5px;border:1px solid var(--line);border-radius:4px;font-size:10px}.command-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:start center;padding:12vh 16px 20px;background:#10203088}.command-panel{width:min(560px,100%);padding:20px;border:1px solid var(--line);border-radius:16px;background:var(--panel);color:var(--ink);box-shadow:0 24px 80px #0005}.command-panel h2{margin:0 0 12px;font-size:18px}.command-panel>input{width:100%;min-height:46px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--ink);font-size:16px}.command-results{max-height:50vh;overflow:auto;margin-top:10px}.command-results button{display:grid;width:100%;gap:3px;padding:12px;border:0;border-radius:8px;background:transparent;color:var(--ink);text-align:left;cursor:pointer}.command-results button:hover,.command-results button:focus-visible{background:var(--bg)}.command-results small,.command-hint{color:var(--muted)}.command-hint{margin:12px 0 0;font-size:12px}@media(max-width:600px){.command-trigger{display:none}}`}</style>
    <button type="button" className="command-trigger" onClick={() => setOpen(true)} aria-label="Open quick navigation">⌕ <span>Quick find</span><kbd>Ctrl K</kbd></button>
    {open && <div className="command-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="command-panel" role="dialog" aria-modal="true" aria-labelledby="command-title">
        <h2 id="command-title">Quick navigation</h2>
        <input autoFocus type="search" aria-label="Search pages and actions" placeholder="Search pages and actions…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && entries[0]) go(entries[0][2]) }} />
        <div className="command-results" role="listbox" aria-label="Available pages">{entries.map(([label, description, href]) => <button role="option" aria-selected="false" key={label} onClick={() => go(href)}><b>{label}</b><small>{description}</small></button>)}{!entries.length && <p>No matching pages.</p>}</div>
        <p className="command-hint">Press Esc to close · Ctrl K to toggle</p>
      </section>
    </div>}
  </>
}
