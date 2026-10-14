import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { roleRoute } from '../lib/roleRoute'
import { accessibleBrandColor, normalizeBrandColor } from '../lib/brandColor'

const navigation = {
  super_admin: [
    ['Platform', [['Dashboard', '\u2302', ''], ['Schools', '\u25a3', '?module=Schools'], ['Approvals', '\u2713', '?module=School approvals'], ['Subscriptions', '\u25c7', '?module=Subscriptions'], ['Payments', '$', '?module=Payments'], ['Analytics', '\u25ce', '?module=Analytics'], ['Audit trail', '\u2261', '?module=Audit Trail']]]
  ],
  school_admin: [
    ['School', [['Dashboard', '\u2302', ''], ['Students', '\u25c9', '?module=Students'], ['Teachers', '\u25c8', '?module=Teachers'], ['Portal accounts', '\u2637', '/school-accounts'], ['Classes', '\u25a6', '?module=Classes'], ['Attendance', '\u2713', '?module=Attendance'], ['Fees & payments', '$', '?module=Fees'], ['Admissions', '\u2197', '/admissions'], ['School settings', '\u2699', '/settings'], ['Plan & billing', '\u25c7', '/subscription']]],
    ['Learning', [['Timetable', '\u25f7', '/timetable'], ['Assignments', '\u25a4', '?module=Assignments'], ['Gradebook', '\u25a5', '/gradebook'], ['Library', '\u25a7', '/library'], ['Quizzes', '\u270e', '/quizzes']]],
    ['Community', [['Calendar & events', '\u25a6', '/calendar'], ['Messages', '\u2709', '/chat'], ['Announcements', '\u25c9', '?module=Announcements'], ['Audit trail', '\u2261', '/audit-trail']]]
  ],
  teacher: [
    ['Teaching', [['Dashboard', '\u2302', ''], ['My classes', '\u25a6', '?module=My classes'], ['Attendance', '\u2713', '?module=Take attendance'], ['Assignments', '\u25a4', '?module=Assignments'], ['Gradebook', '\u25a5', '/gradebook'], ['Lesson plans', '\u25a7', '/lessons'], ['Timetable', '\u25f7', '/timetable'], ['Library', '\u25a8', '/library']]],
    ['Connect', [['Messages', '\u2709', '/chat'], ['Meetings', '\u25f7', '/meetings'], ['Announcements', '\u25c9', '?module=Announcements']]]
  ],
  student: [
    ['My school', [['Dashboard', '\u2302', ''], ['Assignments', '\u25a4', '?module=Assignments'], ['My results', '\u25a5', '?module=My results'], ['Timetable', '\u25f7', '/timetable'], ['Attendance', '\u2713', '?module=Attendance'], ['Library', '\u25a8', '/library'], ['Quizzes', '\u270e', '/quizzes']]],
    ['Connect', [['Messages', '\u2709', '/chat'], ['Announcements', '\u25c9', '?module=Announcements'], ['Calendar & events', '\u25a6', '/calendar']]]
  ],
  parent: [
    ['Family', [['Dashboard', '\u2302', ''], ['My children', '\u25c9', '?module=My children'], ['Attendance', '\u2713', '?module=Child attendance'], ['Results', '\u25a5', '?module=Child results'], ['Fees', '$', '?module=Child fees'], ['Timetable', '\u25f7', '/timetable']]],
    ['Connect', [['Messages', '\u2709', '/chat'], ['Meetings', '\u25f7', '/meetings'], ['Announcements', '\u25c9', '?module=Announcements'], ['Calendar & events', '\u25a6', '/calendar']]]
  ]
}

const pageNames = { '/calendar': 'Calendar & events', '/timetable': 'Timetable', '/library': 'Library', '/quizzes': 'Quizzes', '/chat': 'Messages', '/gradebook': 'Gradebook', '/lessons': 'Lesson plans', '/meetings': 'Meetings', '/settings': 'School settings', '/admissions': 'Admissions', '/broadcast': 'Broadcast', '/audit-trail': 'Audit trail', '/security': 'Security settings', '/profile': 'My profile', '/course-builder': 'Course builder', '/school-accounts': 'Portal accounts', '/subscription': 'Plan & billing' }

export default function PortalLayout({ children }) {
  const { profile, school, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const role = profile?.role || 'school_admin'
  const groups = navigation[role] || navigation.school_admin
  const home = roleRoute(role)
  const accent = normalizeBrandColor(school?.primary_color)
  const title = location.pathname === home ? (new URLSearchParams(location.search).get('module') || 'Dashboard') : (pageNames[location.pathname] || 'School workspace')

  useEffect(() => { setMobileOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const destination = (suffix) => {
    if (suffix.startsWith('/')) return suffix
    return `${home}${suffix}`
  }
  const activeFor = (suffix) => {
    const target = destination(suffix)
    if (target.includes('?module=')) return location.pathname === home && new URLSearchParams(location.search).get('module') === decodeURIComponent(target.split('?module=')[1])
    if (target === home) return location.pathname === home && !location.search
    return location.pathname === target || (target === '/calendar' && location.pathname === '/calendar')
  }

  return <div className={`portal-frame ${collapsed ? 'portal-frame-collapsed' : ''}`} style={{ '--school-accent': accent, '--school-accent-strong': accessibleBrandColor(accent), '--green': accent }}>
    {mobileOpen && <button className="portal-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`portal-sidebar ${mobileOpen ? 'portal-sidebar-open' : ''}`}>
      <div className="portal-sidebar-brand"><Link to={home} className="tenant-brand">{role !== 'super_admin' && school?.logo_url ? <img src={school.logo_url} alt={`${school.name} logo`} /> : <span className="tenant-mark">{role === 'super_admin' ? 'S' : (school?.name || 'S').slice(0, 1).toUpperCase()}</span>}<span className="tenant-brand-copy"><b>{role === 'super_admin' ? 'SmartSchool' : (school?.name || 'Your school')}</b><small>{role === 'super_admin' ? 'PLATFORM ADMIN' : 'SCHOOL PORTAL'}</small></span></Link><button className="portal-sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">{'\u00d7'}</button></div>
      <div className="portal-tenant-chip"><span className="tenant-status-dot" />{role === 'super_admin' ? 'Platform workspace' : (school?.school_level || 'School workspace')}</div>
      <nav className="portal-navigation" aria-label="Portal navigation">{groups.map(([group, items]) => <section className="portal-nav-group" key={group}><h2>{group}</h2>{items.map(([label, icon, suffix]) => <button type="button" key={label} className={activeFor(suffix) ? 'active' : ''} title={collapsed ? label : undefined} onClick={() => navigate(destination(suffix))}><span className="portal-nav-icon" aria-hidden="true">{icon}</span><span className="portal-nav-label">{label}</span>{activeFor(suffix) && <i className="portal-nav-active-mark" />}</button>)}</section>)}</nav>
      {role !== 'super_admin' && <Link className="portal-upgrade-link" to="/subscription"><span>{'\u2197'}</span><span><b>School account</b><small>View plan and billing</small></span></Link>}
      <button className="portal-settings-link" type="button" onClick={() => navigate(role === 'school_admin' ? '/settings' : role === 'super_admin' ? '/security' : '/profile')}><span className="portal-nav-icon" aria-hidden="true">⚙</span><span className="portal-nav-label">Settings</span></button>
      <button className="portal-logout" onClick={logout}><span className="portal-nav-icon">{'\u21aa'}</span><span className="portal-nav-label">Sign out</span></button>
    </aside>
    <main className="portal-workspace">
      <header className="portal-topbar"><button className="portal-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>{'\u2630'}</button><button className="portal-collapse-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '›' : '‹'}</button><div className="portal-breadcrumb"><span>{role === 'super_admin' ? 'Platform' : (school?.name || 'School workspace')}</span><b>/</b><strong>{title}</strong></div><div className="portal-topbar-user"><span className="portal-user-avatar">{profile?.full_name?.trim()?.[0]?.toUpperCase() || 'U'}</span><span><b>{profile?.full_name || 'School user'}</b><small>{role.replaceAll('_', ' ')}</small></span></div></header>
      <div className="portal-page-content">{children}</div>
    </main>
  </div>
}
