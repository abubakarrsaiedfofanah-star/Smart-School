import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { roleRoute } from '../lib/roleRoute'
import { accessibleBrandColor, normalizeBrandColor } from '../lib/brandColor'
import { hasSchoolPermission } from '../lib/schoolRoles'

const navigation = {
  super_admin: [
    ['Platform', [['Dashboard', '\u2302', ''], ['Schools', '\u25a3', '?module=Schools'], ['Approvals', '\u2713', '?module=School approvals'], ['Subscriptions', '\u25c7', '?module=Subscriptions'], ['Payments', '$', '?module=Payments'], ['Analytics', '\u25ce', '?module=Analytics'], ['Audit trail', '\u2261', '?module=Audit Trail']]]
  ],
  school_admin: [
    ['School', [['Dashboard', '\u2302', ''], ['Students', '\u25c9', '?module=Students'], ['Teachers', '\u25c8', '?module=Teachers'], ['Teacher subject assignments', '\u25a4', '/teacher-loads'], ['Portal accounts', '\u2637', '/school-accounts'], ['Staff roles & access', '\u2659', '/staff-roles'], ['Classes', '\u25a6', '?module=Classes'], ['Attendance', '\u2713', '?module=Attendance'], ['Staff attendance', '\u2713', '/staff-attendance'], ['Fees & payments', '$', '?module=Fees'], ['Inventory & assets', '\u25a7', '/inventory'], ['Admissions', '\u2197', '/admissions'], ['School settings', '\u2699', '/settings'], ['Plan & billing', '\u25c7', '/subscription']]],
    ['Learning', [['Timetable', '\u25f7', '/timetable'], ['Assignments', '\u25a4', '?module=Assignments'], ['Gradebook', '\u25a5', '/gradebook'], ['Library', '\u25a7', '/library'], ['Quizzes', '\u270e', '/quizzes']]],
    ['Community', [['Calendar & events', '\u25a6', '/calendar'], ['Activities', '\u25cf', '/activities'], ['Messages', '\u2709', '/chat'], ['Announcements', '\u25c9', '?module=Announcements'], ['Audit trail', '\u2261', '/audit-trail']]]
  ],
  teacher: [
    ['Teaching', [['Dashboard', '\u2302', ''], ['My classes', '\u25a6', '?module=My classes'], ['My subjects', '\u25a4', '?module=My subjects'], ['Students', '\u25c9', '?module=Students'], ['Class performance', '\u25ce', '?module=Class performance'], ['Timetable', '\u25f7', '/timetable'], ['Gradebook', '\u25a5', '/gradebook'], ['Lesson plans', '\u25a7', '/lessons'], ['Quizzes', '\u270e', '/quizzes'], ['Courses', '\u25a6', '/course-builder'], ['Library', '\u25a8', '/library']]],
    ['Work', [['Attendance', '\u2713', '?module=Take attendance'], ['Assignments', '\u25a4', '/teacher-assignments'], ['Submissions', '\u25a5', '?module=Submissions'], ['Exams', '\u25a4', '?module=Exams'], ['Results', '\u25a5', '?module=Results'], ['Activities', '\u25cf', '/activities'], ['Behavior log', '\u2605', '?module=Behavior Log'], ['Meetings', '\u25f7', '/meetings']]],
    ['Connect', [['Messages', '\u2709', '/chat'], ['Announcements', '\u25c9', '?module=Announcements'], ['Calendar', '\u25a6', '/calendar']]]
  ],
  student: [
    ['My school', [['Dashboard', '\u2302', ''], ['Assignments', '\u25a4', '?module=Assignments'], ['My results', '\u25a5', '?module=My results'], ['Timetable', '\u25f7', '/timetable'], ['Attendance', '\u2713', '?module=Attendance'], ['Activities', '\u25cf', '/activities'], ['Library', '\u25a8', '/library'], ['Quizzes', '\u270e', '/quizzes']]],
    ['Connect', [['Messages', '\u2709', '/chat'], ['Announcements', '\u25c9', '?module=Announcements'], ['Calendar & events', '\u25a6', '/calendar']]]
  ],
  parent: [
    ['Family', [['Dashboard', '\u2302', ''], ['My children', '\u25c9', '?module=My children'], ['Attendance', '\u2713', '?module=Child attendance'], ['Results', '\u25a5', '?module=Child results'], ['Fees', '$', '?module=Child fees'], ['Activities', '\u25cf', '/activities'], ['Timetable', '\u25f7', '/timetable']]],
    ['Connect', [['Messages', '\u2709', '/chat'], ['Meetings', '\u25f7', '/meetings'], ['Announcements', '\u25c9', '?module=Announcements'], ['Calendar & events', '\u25a6', '/calendar']]]
  ],
  staff: [['My work', [['Overview', '\u2302', ''], ['My payslips', '$', '?module=My payslips'], ['Leave requests', '\u2713', '?module=Leave requests'], ['My details', '\u263a', '?module=My details']]]]
}

const pageNames = { '/calendar': 'Calendar & events', '/activities': 'School activities', '/timetable': 'Timetable', '/library': 'Library', '/inventory': 'Inventory & assets', '/staff-attendance': 'Staff attendance', '/finance-operations': 'Expenses & reconciliation', '/quizzes': 'Quizzes', '/chat': 'Messages', '/gradebook': 'Gradebook', '/lessons': 'Lesson plans', '/meetings': 'Meetings', '/settings': 'School settings', '/admissions': 'Admissions', '/broadcast': 'Broadcast', '/audit-trail': 'Audit trail', '/security': 'Security settings', '/profile': 'My profile', '/course-builder': 'Course builder', '/teacher-assignments': 'Assignments & submissions', '/teacher-loads': 'Teacher class & subject assignments', '/school-accounts': 'Portal accounts', '/staff-roles': 'Staff roles & access', '/subscription': 'Plan & billing' }

export default function PortalLayout({ children, portal = null }) {
  const { profile, school, staffRoles, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [navSearch, setNavSearch] = useState('')
  const navSearchRef = useRef(null)
  const menuTriggerRef = useRef(null)
  const closeMenuRef = useRef(null)
  const role = profile?.role || 'unknown'
  const assignedRoles = staffRoles || []
  const specialistNavigation = {
    hr: [['Human resources', [
      ['Dashboard', '\u2302', '?module=Dashboard'], ['Staff records', '\u263a', '?module=Staff Records'],
      ['Recruitment', '\u25c7', '?module=Recruitment'], ['Contracts', '\u25a4', '?module=Contracts'],
      ['Attendance & leave', '\u2713', '?module=Attendance & Leave'], ['Salary settings', '$', '?module=Salary Settings'],
      ['Payroll', '$', '?module=Payroll'], ['Approvals', '\u2713', '?module=Approvals'],
      ['Payslips', '\u25a5', '?module=Payslips'],
      ['Security & reports', '\u2261', '?module=Security & Reports']
    ]]],
    finance: [['Finance', [
      ['Dashboard', '\u2302', '?module=Dashboard'], ['Fee collections', '$', '?module=Collections'],
      ['Activity collections', '\u25cf', '/activities'],
      ['Expenses', '\u25a7', '?module=Expenses'], ['Payment reconciliation', '\u2713', '?module=Reconciliation']
    ]]]
  }
  const hrOnly = ['teacher', 'staff'].includes(role) && assignedRoles.includes('hr_admin')
  const financePayoutAccess = ['teacher', 'staff'].includes(role) && assignedRoles.includes('finance_officer')
  const groups = portal ? specialistNavigation[portal].map(([group, items]) => [group, portal === 'finance' && financePayoutAccess
      ? [...items, ['Salary payments', '$', '?module=Salary payments']]
      : portal === 'hr' && hrOnly
      ? items.filter(([label]) => ['Dashboard', 'Staff records', 'Recruitment', 'Contracts', 'Attendance & leave', 'Salary settings', 'Payroll', 'Approvals', 'Payslips', 'Security & reports'].includes(label))
      : items]) : role === 'teacher'
    ? navigation.teacher
    : navigation[role] || []
  const roleToolLinks = [
    ['HR & Payroll', '\u2659', '/hr-payroll', 'school.hr.portal.view', ['teacher', 'staff']],
    ['Finance operations', '$', '/finance-operations', 'school.finance.portal.view', ['teacher', 'staff']],
    ['Staff attendance', '\u2713', '/staff-attendance', 'school.staff_attendance.manage', ['staff']],
    ['Admissions', '\u2197', '/admissions', 'school.admissions.manage', ['staff']],
    ['Inventory & assets', '\u25a7', '/inventory', 'school.inventory.view', ['staff']],
    ['Library', '\u25a8', '/library', null, ['staff']],
  ].filter(([, , , permission, allowedRoles]) => allowedRoles.includes(role) && (!permission || hasSchoolPermission(role, assignedRoles, permission)))
  const roleGroups = !portal && roleToolLinks.length ? [...groups, ['Assigned responsibilities', roleToolLinks.map(([label, icon, path]) => [label, icon, path])]] : groups
  const visibleGroups = useMemo(() => {
    const query = navSearch.trim().toLocaleLowerCase()
    if (!query) return roleGroups
    return roleGroups.map(([group, items]) => [group, items.filter(([label]) => label.toLocaleLowerCase().includes(query))]).filter(([, items]) => items.length)
  }, [roleGroups, navSearch])
  const visibleNavCount = visibleGroups.reduce((count, [, items]) => count + items.length, 0)
  const home = portal === 'hr' ? '/hr-payroll' : portal === 'finance' ? '/finance-operations' : roleRoute(role)
  const accent = normalizeBrandColor(school?.primary_color)
  const title = portal ? (new URLSearchParams(location.search).get('module') || (portal === 'hr' ? 'HR & Payroll' : 'Finance dashboard')) : location.pathname === home ? (new URLSearchParams(location.search).get('module') || 'Dashboard') : (pageNames[location.pathname] || 'School workspace')

  useEffect(() => { setMobileOpen(false); setNavSearch('') }, [location.pathname, location.search])
  useEffect(() => { if (collapsed) setNavSearch('') }, [collapsed])
  useEffect(() => {
    const focusNavigationSearch = event => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || collapsed || (window.innerWidth <= 800 && !mobileOpen)) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      event.preventDefault()
      navSearchRef.current?.focus()
    }
    window.addEventListener('keydown', focusNavigationSearch)
    return () => window.removeEventListener('keydown', focusNavigationSearch)
  }, [collapsed, mobileOpen])
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])
  useEffect(() => {
    if (!mobileOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const keepFocusInMenu = event => {
      if (event.key !== 'Tab') return
      const panel = document.getElementById('portal-navigation-panel')
      const focusable = [...(panel?.querySelectorAll('a[href], button:not([disabled])') || [])]
        .filter(element => element.getClientRects().length > 0)
      if (!focusable.length) { event.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    closeMenuRef.current?.focus()
    window.addEventListener('keydown', keepFocusInMenu)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', keepFocusInMenu)
      menuTriggerRef.current?.focus()
    }
  }, [mobileOpen])

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
    <aside id="portal-navigation-panel" className={`portal-sidebar ${mobileOpen ? 'portal-sidebar-open' : ''}`} aria-label="Portal navigation">
      <div className="portal-sidebar-brand"><Link to={home} className="tenant-brand">{role === 'super_admin' ? <img className="platform-tenant-mark" src="/smartschool-mark.svg" alt="SmartSchool logo" /> : school?.logo_url ? <img src={school.logo_url} alt={`${school.name} logo`} /> : <span className="tenant-mark">{(school?.name || 'S').slice(0, 1).toUpperCase()}</span>}<span className="tenant-brand-copy"><b>{role === 'super_admin' ? 'SmartSchool' : (school?.name || 'Your school')}</b><small>{portal ? (portal === 'hr' ? 'HR & PAYROLL PORTAL' : 'FINANCE PORTAL') : role === 'staff' ? 'STAFF SELF-SERVICE' : role === 'super_admin' ? 'PLATFORM ADMIN' : 'SCHOOL PORTAL'}</small></span></Link><button ref={closeMenuRef} className="portal-sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">{'\u00d7'}</button></div>
      <div className="portal-tenant-chip"><span className="tenant-status-dot" />{portal ? `${portal === 'hr' ? 'HR & Payroll' : 'Finance'} workspace` : role === 'staff' ? 'Personal staff workspace' : role === 'super_admin' ? 'Platform workspace' : (school?.school_level || 'School workspace')}</div>
      {!collapsed && <div className="portal-nav-search"><label htmlFor="portal-nav-search-input">Find a page</label><div><span aria-hidden="true">{'\u2315'}</span><input ref={navSearchRef} id="portal-nav-search-input" type="search" placeholder="Search your tools" value={navSearch} onChange={event => setNavSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setNavSearch(''); if (event.key === 'ArrowDown') document.querySelector('.portal-navigation button')?.focus() }} /><kbd>/</kbd></div></div>}
      <nav className="portal-navigation" aria-label="Portal navigation" aria-live="polite">{visibleNavCount ? visibleGroups.map(([group, items]) => <section className="portal-nav-group" key={group}><h2>{group}</h2>{items.map(([label, icon, suffix]) => <button type="button" key={label} className={activeFor(suffix) ? 'active' : ''} aria-current={activeFor(suffix) ? 'page' : undefined} title={collapsed ? label : undefined} onClick={() => { setNavSearch(''); navigate(destination(suffix)) }}><span className="portal-nav-icon" aria-hidden="true">{icon}</span><span className="portal-nav-label">{label}</span>{activeFor(suffix) && <i className="portal-nav-active-mark" />}</button>)}</section>) : <p className="portal-nav-no-results" role="status">No pages match &ldquo;{navSearch}&rdquo;.</p>}</nav>
      {role === 'school_admin' && !portal && <Link className="portal-upgrade-link" to="/subscription"><span>{'\u2197'}</span><span><b>School account</b><small>Plan and billing</small></span></Link>}
      <button className="portal-settings-link" type="button" onClick={() => navigate(role === 'school_admin' ? '/settings' : role === 'super_admin' ? '/security' : '/profile')}><span className="portal-nav-icon" aria-hidden="true">⚙</span><span className="portal-nav-label">Settings</span></button>
      <button className={`portal-profile-link ${location.pathname === '/profile' ? 'active' : ''}`} type="button" onClick={() => navigate('/profile')} title={collapsed ? 'My profile' : undefined} aria-current={location.pathname === '/profile' ? 'page' : undefined}><span className="portal-profile-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile?.full_name?.trim()?.[0]?.toUpperCase() || 'U'}</span><span className="portal-profile-copy"><b>{profile?.full_name || 'My profile'}</b><small>{role === 'super_admin' ? 'Platform administrator' : role.replaceAll('_', ' ')}</small></span><span className="portal-profile-edit" aria-hidden="true">Edit</span></button>
      <button className="portal-logout" onClick={logout}><span className="portal-nav-icon">{'\u21aa'}</span><span className="portal-nav-label">Sign out</span></button>
    </aside>
    <main className="portal-workspace">
      <header className="portal-topbar"><button ref={menuTriggerRef} className="portal-menu-button" aria-label="Open navigation" aria-controls="portal-navigation-panel" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>{'\u2630'}</button><button className="portal-collapse-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '›' : '‹'}</button><div className="portal-breadcrumb"><span>{role === 'super_admin' ? 'Platform' : (school?.name || 'School workspace')}</span><b>/</b><strong>{title}</strong></div><Link className="portal-topbar-user" to="/profile" aria-label="Open my profile">{profile?.avatar_url ? <img className="portal-user-avatar portal-user-photo" src={profile.avatar_url} alt="" /> : <span className="portal-user-avatar">{profile?.full_name?.trim()?.[0]?.toUpperCase() || 'U'}</span>}<span><b>{profile?.full_name || 'School user'}</b><small>{portal ? (portal === 'hr' ? 'HR & Payroll' : 'Finance') : role === 'staff' ? 'Staff self-service' : role.replaceAll('_', ' ')}</small></span></Link></header>
      <div className="portal-page-content">{children}</div>
    </main>
  </div>
}
