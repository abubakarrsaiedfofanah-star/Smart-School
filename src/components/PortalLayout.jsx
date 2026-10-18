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
    ['School', [['Dashboard', '\u2302', ''], ['Students', '\u25c9', '?module=Students'], ['Teachers', '\u25c8', '?module=Teachers'], ['Teacher subject assignments', '\u25a4', '/teacher-loads'], ['Portal accounts', '\u2637', '/school-accounts'], ['Staff roles & access', '\u2659', '/staff-roles'], ['Staff portal hub', '\u25c8', '/staff-portals'], ['Classes', '\u25a6', '?module=Classes'], ['Attendance', '\u2713', '?module=Attendance'], ['Staff attendance', '\u2713', '/staff-attendance'], ['Fees & payments', '$', '?module=Fees'], ['Finance portal', '$', '/finance-operations'], ['Inventory & assets', '\u25a7', '/inventory'], ['HR & Payroll portal', '\u25a4', '/hr-payroll'], ['Admissions', '\u2197', '/admissions'], ['School settings', '\u2699', '/settings'], ['Plan & billing', '\u25c7', '/subscription']]],
    ['Learning', [['Timetable', '\u25f7', '/timetable'], ['Assignments', '\u25a4', '?module=Assignments'], ['Gradebook', '\u25a5', '/gradebook'], ['Library', '\u25a7', '/library'], ['Quizzes', '\u270e', '/quizzes']]],
    ['Community', [['Calendar & events', '\u25a6', '/calendar'], ['Messages', '\u2709', '/chat'], ['Announcements', '\u25c9', '?module=Announcements'], ['Audit trail', '\u2261', '/audit-trail']]]
  ],
  teacher: [
    ['Teaching', [['Dashboard', '\u2302', ''], ['My classes', '\u25a6', '?module=My classes'], ['Attendance', '\u2713', '?module=Take attendance'], ['Assignments', '\u25a4', '/teacher-assignments'], ['Gradebook', '\u25a5', '/gradebook'], ['Lesson plans', '\u25a7', '/lessons'], ['Timetable', '\u25f7', '/timetable'], ['Quizzes', '\u270e', '/quizzes'], ['Courses', '\u25a6', '/course-builder'], ['Library', '\u25a8', '/library']]],
    ['Connect', [['Messages', '\u2709', '/chat'], ['Meetings', '\u25f7', '/meetings'], ['Announcements', '\u25c9', '?module=Announcements'], ['Calendar', '\u25a6', '/calendar']]]
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

const pageNames = { '/calendar': 'Calendar & events', '/timetable': 'Timetable', '/library': 'Library', '/inventory': 'Inventory & assets', '/staff-attendance': 'Staff attendance', '/finance-operations': 'Expenses & reconciliation', '/quizzes': 'Quizzes', '/chat': 'Messages', '/gradebook': 'Gradebook', '/lessons': 'Lesson plans', '/meetings': 'Meetings', '/settings': 'School settings', '/admissions': 'Admissions', '/broadcast': 'Broadcast', '/audit-trail': 'Audit trail', '/security': 'Security settings', '/profile': 'My profile', '/course-builder': 'Course builder', '/teacher-assignments': 'Assignments & submissions', '/teacher-loads': 'Teacher class & subject assignments', '/school-accounts': 'Portal accounts', '/staff-roles': 'Staff roles & access', '/staff-portals': 'Staff portal hub', '/subscription': 'Plan & billing' }

export default function PortalLayout({ children, portal = null }) {
  const { profile, school, staffRoles, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const role = profile?.role || 'school_admin'
  const assignedRoles = staffRoles || []
  const specialistItems = []
  if (assignedRoles.some(item => ['principal', 'deputy_principal', 'hr_admin'].includes(item))) specialistItems.push(['Staff attendance', '\u2713', '/staff-attendance'])
  if (assignedRoles.some(item => ['principal', 'hr_admin'].includes(item))) specialistItems.push(['HR & Payroll portal', '\u25a4', '/hr-payroll'])
  if (assignedRoles.some(item => ['principal', 'finance_officer'].includes(item))) specialistItems.push(['Finance portal', '$', '/finance-operations'])
  if (assignedRoles.some(item => ['principal', 'deputy_principal', 'registrar'].includes(item))) specialistItems.push(['Admissions', '\u2197', '/admissions'])
  if (assignedRoles.some(item => ['principal', 'deputy_principal', 'inventory_manager', 'librarian'].includes(item))) specialistItems.push(['Inventory & assets', '\u25a7', '/inventory'])
  if (assignedRoles.some(item => ['principal', 'librarian'].includes(item))) specialistItems.push(['Library', '\u25a8', '/library'])
  const specialistNavigation = {
    hr: [['Human resources', [
      ['Dashboard', '\u2302', '?module=Dashboard'], ['Staff records', '\u263a', '?module=Staff Records'],
      ['Recruitment', '\u25c7', '?module=Recruitment'], ['Contracts', '\u25a4', '?module=Contracts'],
      ['Attendance & leave', '\u2713', '?module=Attendance & Leave'], ['Salary settings', '$', '?module=Salary Settings'],
      ['Payroll', '$', '?module=Payroll'], ['Approvals', '\u2713', '?module=Approvals'],
      ['Payments', '\u25c7', '?module=Payments'], ['Payslips', '\u25a5', '?module=Payslips'],
      ['Security & reports', '\u2261', '?module=Security & Reports']
    ]]],
    finance: [['Finance', [
      ['Dashboard', '\u2302', '?module=Dashboard'], ['Fee collections', '$', '?module=Collections'],
      ['Expenses', '\u25a7', '?module=Expenses'], ['Payment reconciliation', '\u2713', '?module=Reconciliation']
    ]]]
  }
  const hrOnly = role === 'teacher' && assignedRoles.includes('hr_admin') && !assignedRoles.includes('principal')
  const groups = portal ? specialistNavigation[portal].map(([group, items]) => [group, portal === 'hr' && hrOnly
      ? items.filter(([label]) => ['Dashboard', 'Staff records', 'Recruitment', 'Contracts', 'Attendance & leave', 'Salary settings', 'Payroll', 'Approvals', 'Payslips', 'Security & reports'].includes(label))
      : items]) : role === 'teacher'
    ? [...navigation.teacher, ['Staff portals', [['Portal hub', '\u25c8', '/staff-portals'], ...specialistItems]]]
    : navigation[role] || navigation.school_admin
  const home = portal === 'hr' ? '/hr-payroll' : portal === 'finance' ? '/finance-operations' : roleRoute(role)
  const accent = normalizeBrandColor(school?.primary_color)
  const title = portal ? (new URLSearchParams(location.search).get('module') || (portal === 'hr' ? 'HR & Payroll' : 'Finance dashboard')) : location.pathname === home ? (new URLSearchParams(location.search).get('module') || 'Dashboard') : (pageNames[location.pathname] || 'School workspace')

  useEffect(() => { setMobileOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const destination = (suffix) => {
    if (suffix.startsWith('/')) return suffix
    if (portal && suffix.startsWith('?module=')) return `${home}?module=${encodeURIComponent(suffix.slice(8))}`
    return `${home}${suffix}`
  }
  const activeFor = (suffix) => {
    const target = destination(suffix)
    if (target.includes('?module=')) return location.pathname === target.split('?')[0] && (new URLSearchParams(location.search).get('module') || 'Dashboard') === decodeURIComponent(target.split('?module=')[1])
    if (target === home) return location.pathname === home && !location.search
    return location.pathname === target || (target === '/calendar' && location.pathname === '/calendar')
  }

  return <div className={`portal-frame ${collapsed ? 'portal-frame-collapsed' : ''}`} style={{ '--school-accent': accent, '--school-accent-strong': accessibleBrandColor(accent), '--green': accent }}>
    {mobileOpen && <button className="portal-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`portal-sidebar ${mobileOpen ? 'portal-sidebar-open' : ''}`}>
      <div className="portal-sidebar-brand"><Link to={home} className="tenant-brand">{role !== 'super_admin' && school?.logo_url ? <img src={school.logo_url} alt={`${school.name} logo`} /> : <span className="tenant-mark">{role === 'super_admin' ? 'S' : (school?.name || 'S').slice(0, 1).toUpperCase()}</span>}<span className="tenant-brand-copy"><b>{role === 'super_admin' ? 'SmartSchool' : (school?.name || 'Your school')}</b><small>{portal ? (portal === 'hr' ? 'HR & PAYROLL PORTAL' : 'FINANCE PORTAL') : role === 'super_admin' ? 'PLATFORM ADMIN' : 'SCHOOL PORTAL'}</small></span></Link><button className="portal-sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">{'\u00d7'}</button></div>
      <div className="portal-tenant-chip"><span className="tenant-status-dot" />{portal ? `${portal === 'hr' ? 'HR & Payroll' : 'Finance'} workspace` : role === 'super_admin' ? 'Platform workspace' : (school?.school_level || 'School workspace')}</div>
      <nav className="portal-navigation" aria-label="Portal navigation">{groups.map(([group, items]) => <section className="portal-nav-group" key={group}><h2>{group}</h2>{items.map(([label, icon, suffix]) => <button type="button" key={label} className={activeFor(suffix) ? 'active' : ''} title={collapsed ? label : undefined} onClick={() => navigate(destination(suffix))}><span className="portal-nav-icon" aria-hidden="true">{icon}</span><span className="portal-nav-label">{label}</span>{activeFor(suffix) && <i className="portal-nav-active-mark" />}</button>)}</section>)}</nav>
      {role !== 'super_admin' && !portal && <Link className="portal-upgrade-link" to="/subscription"><span>{'\u2197'}</span><span><b>School account</b><small>View plan and billing</small></span></Link>}
      <button className="portal-settings-link" type="button" onClick={() => navigate(role === 'school_admin' ? '/settings' : role === 'super_admin' ? '/security' : '/profile')}><span className="portal-nav-icon" aria-hidden="true">⚙</span><span className="portal-nav-label">Settings</span></button>
      <button className="portal-logout" onClick={logout}><span className="portal-nav-icon">{'\u21aa'}</span><span className="portal-nav-label">Sign out</span></button>
    </aside>
    <main className="portal-workspace">
      <header className="portal-topbar"><button className="portal-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>{'\u2630'}</button><button className="portal-collapse-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '›' : '‹'}</button><div className="portal-breadcrumb"><span>{role === 'super_admin' ? 'Platform' : (school?.name || 'School workspace')}</span><b>/</b><strong>{title}</strong></div><div className="portal-topbar-user"><span className="portal-user-avatar">{profile?.full_name?.trim()?.[0]?.toUpperCase() || 'U'}</span><span><b>{profile?.full_name || 'School user'}</b><small>{portal ? (portal === 'hr' ? 'HR & Payroll' : 'Finance') : role.replaceAll('_', ' ')}</small></span></div></header>
      <div className="portal-page-content">{children}</div>
    </main>
  </div>
}
