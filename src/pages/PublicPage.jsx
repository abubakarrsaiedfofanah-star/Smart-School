import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'

const portalPaths = { 'School Admin': '/login/school_admin', Teacher: '/login/teacher', Staff: '/login/staff', Student: '/login/student', Parent: '/login/parent', 'HR & Payroll': '/login/hr', Finance: '/login/finance' }

const pages = {
  features: ['School tools', 'Everyday school work, organised in one place.', [['Academic operations', 'Plan classes, share assignments and manage assessments.'], ['People and attendance', 'Keep student records and daily attendance connected.'], ['Finance and billing', 'Organise fee schedules, payment records and invoices.'], ['Communication', 'Share announcements and school updates with your community.']]],
  portals: ['Choose your school portal', 'Sign in to the workspace assigned to your role.', [['School Admin', 'Manage school records and staff.'], ['Teacher', 'Manage classes, attendance and learning.'], ['Staff', 'View payslips and request leave.'], ['Student', 'See assignments, timetable and results.'], ['Parent', 'Follow updates and learner progress.'], ['HR & Payroll', 'Manage staff records, leave and payroll.'], ['Finance', 'Track expenses and approved payouts.']]],
  pricing: ['Plans for your school', 'Request a 14-day free trial. Subscription pricing is shared during registration.', [['Starter', 'Core tools for school routines.'], ['Professional', 'Tools for connected school teams.'], ['Enterprise', 'Options for larger schools and groups.']]],
  about: ['About SmartSchool', 'A shared system for the people who make a school work.', [['Built around schools', 'Bring everyday school operations into a practical workspace.'], ['Clear roles', 'Give school leaders, teachers, students and parents the tools they need.'], ['One school workspace', 'Keep school information organised under each school’s own portal.']]],
  contact: ['Get started with SmartSchool', 'Create a school workspace or sign in to a portal your school has already set up.', [['Register a school', 'Set up a new school workspace and its administrator account.'], ['Existing school', 'Sign in with the account credentials provided by your school.'], ['Role portals', 'Each role opens a separate workspace with its own access.']]],
}

export default function PublicPage({ page }) {
  const [title, intro, items] = pages[page] || pages.features
  const [schools, setSchools] = useState([])
  const [schoolsLoading, setSchoolsLoading] = useState(page === 'portals')

  useEffect(() => {
    if (page !== 'portals' || !supabase) { setSchoolsLoading(false); return undefined }
    let live = true
    supabase.rpc('get_public_school_directory').then(({ data, error }) => {
      if (!live) return
      if (error) console.error('Could not load the public school directory:', error.message)
      setSchools(data || [])
      setSchoolsLoading(false)
    })
    return () => { live = false }
  }, [page])

  return <div className="public-site school-home school-public-page page-transition">
    <PublicHeader />
    <main className="school-public-content">
      <section className="school-public-intro">
        <p className="eyebrow">SMARTSCHOOL · {page.replaceAll('-', ' ').toUpperCase()}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="school-public-actions">
          {page === 'pricing' && <Link className="button blue-button" to="/register?trial=1">Start a school trial <b aria-hidden="true">→</b></Link>}
          <Link className="button outline-hero" to="/login">{page === 'portals' ? 'Sign in to your school' : 'Sign in'}</Link>
        </div>
      </section>
      {page === 'portals' && <aside className="school-portal-access-note" role="note">
        <b>Your school admin sets up your account.</b>
        <span>Sign in to see only your assigned school workspace.</span>
      </aside>}
      <section className={`school-public-grid ${page === 'portals' ? 'school-public-portal-grid' : ''} ${page === 'pricing' ? 'school-pricing-grid' : ''}`} aria-label={page === 'portals' ? 'Choose a role portal' : `${title} information`}>
        {items.map(([label, text], index) => (
          <article className="school-public-card" key={label}>
            <span className="school-public-card-number">0{index + 1}</span>
            <h2>{label}</h2>
            <p>{text}</p>
            {page === 'pricing' && <Link className="school-public-portal-link" to={`/register?trial=1&plan=${encodeURIComponent(label)}`}>Choose {label} for your school <b aria-hidden="true">→</b></Link>}
            {page === 'portals' && <Link className="school-public-portal-link" to={portalPaths[label]}>Continue to {label} sign in <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Register a school' && <Link to="/register">Start registration <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Existing school' && <Link to="/login">Open sign in <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Role portals' && <Link to="/portals">View portals <b aria-hidden="true">→</b></Link>}
          </article>
        ))}
      </section>
      {page === 'portals' && <section className="school-directory-section" id="schools" aria-labelledby="school-directory-title">
        <div className="school-directory-heading"><div><p className="eyebrow">SCHOOL MEMBERS</p><h2 id="school-directory-title">Find your school</h2><p>Select your school to request a learner, parent, teacher, HR or Finance account. The school administrator reviews each request.</p></div><Link to="/register">Register a school</Link></div>
        {schoolsLoading ? <p className="school-directory-empty">Loading schools…</p>
          : schools.length ? <div className="school-directory-grid">{schools.map(school => <article className="school-directory-card" key={school.id}><h3>{school.name}</h3><p>School portal and account registration</p><Link className="school-public-portal-link" to={`/join-school/${encodeURIComponent(school.slug)}`}>Choose this school <b aria-hidden="true">→</b></Link></article>)}</div>
            : <p className="school-directory-empty">No approved schools are listed yet. School names appear here after platform approval.</p>}
      </section>}
    </main>
    <PublicFooter />
  </div>
}
