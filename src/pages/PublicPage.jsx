import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'

const portalPaths = { 'School Admin': '/login/school_admin', Teacher: '/login/teacher', Staff: '/login/staff', Student: '/login/student', Parent: '/login/parent', 'HR & Payroll': '/login/hr', Finance: '/login/finance' }

const serviceCatalog = [
  { title: 'Teaching and learning', summary: 'Plan teaching and keep classwork moving.', features: ['Classes, subjects and timetables', 'Lesson plans and course materials', 'Assignments, submissions and quizzes', 'Exams, gradebook and results'] },
  { title: 'Student records and admissions', summary: 'Keep learner information and school entry organised.', features: ['Student and guardian profiles', 'Admissions and applications', 'School account requests and approvals', 'Behaviour records and learner progress'] },
  { title: 'Attendance and daily operations', summary: 'Coordinate the routines that keep a school running.', features: ['Student and staff attendance', 'School calendar, events and notices', 'Inventory and asset records', 'School settings and staff access'] },
  { title: 'Family and school communication', summary: 'Help school teams and families stay connected.', features: ['Announcements and broadcasts', 'Direct messages', 'Parent and teacher meetings', 'Role based portals for families and staff'] },
  { title: 'Fees and finance', summary: 'Manage school charges and follow payment activity.', features: ['Fees, invoices and payment records', 'Expense tracking and reconciliation', 'Finance workspace and approved payouts', 'Payment and finance reporting'] },
  { title: 'Human resources and payroll', summary: 'Support staff administration and payroll workflows.', features: ['Staff records, recruitment and contracts', 'Leave and staff attendance', 'Payroll preparation and approvals', 'Payslips and salary history'] },
  { title: 'Library and digital courses', summary: 'Bring learning resources into the school workspace.', features: ['Library catalogue', 'Online courses and course builder', 'Learner course progress', 'Course completion certificates'] },
  { title: 'Transport and school resources', summary: 'Coordinate operational resources and transport workflows.', features: ['Transport routes and driver tools', 'Vehicle and trip information', 'School inventory and asset condition', 'Role based access to operational tools'] },
  { title: 'Reports and school oversight', summary: 'Give authorised leaders a view of activity and performance.', features: ['School and platform dashboards', 'Student, teacher and academic reports', 'Subscription and payment oversight', 'Audit trail and security settings'] },
]

const pages = {
  features: ['Services', 'Explore the tools SmartSchool brings together for learning, school operations and family engagement.'],
  portals: ['Choose your school portal', 'Sign in to the workspace assigned to your role.', [['School Admin', 'Manage school records and staff.'], ['Teacher', 'Manage classes, attendance and learning.'], ['Staff', 'View payslips and request leave.'], ['Student', 'See assignments, timetable and results.'], ['Parent', 'Follow updates and learner progress.'], ['HR & Payroll', 'Manage staff records, leave and payroll.'], ['Finance', 'Track expenses and approved payouts.']]],
  pricing: ['Plans for your school', 'Request a 14-day free trial. Subscription pricing is shared during registration.', [['Starter', 'Core tools for school routines.'], ['Professional', 'Tools for connected school teams.'], ['Enterprise', 'Options for larger schools and groups.']]],
  about: ['About SmartSchool', 'A shared system for the people who make a school work.', [['Built around schools', 'Bring everyday school operations into a practical workspace.'], ['Clear roles', 'Give school leaders, teachers, students and parents the tools they need.'], ['One school workspace', 'Keep school information organised under each school’s own portal.']]],
  contact: ['Get started with SmartSchool', 'Create a school workspace or sign in to a portal your school has already set up.', [['Register a school', 'Set up a new school workspace and its administrator account.'], ['Existing school', 'Sign in with the account credentials provided by your school.'], ['Role portals', 'Each role opens a separate workspace with its own access.']]],
}

export default function PublicPage({ page }) {
const [title, intro, items] = pages[page] || pages.features
  const [schools, setSchools] = useState([])
  const [schoolsLoading, setSchoolsLoading] = useState(page === 'portals')
  const [schoolsError, setSchoolsError] = useState('')
  const [schoolSearch, setSchoolSearch] = useState('')

  const filteredSchools = useMemo(() => {
    const query = schoolSearch.trim().toLocaleLowerCase()
    return query ? schools.filter(school => school.name.toLocaleLowerCase().includes(query)) : schools
  }, [schools, schoolSearch])

  async function loadSchools() {
    if (!supabase) {
      setSchoolsError('The school directory is temporarily unavailable.')
      setSchoolsLoading(false)
      return
    }
    setSchoolsLoading(true)
    setSchoolsError('')
    const { data, error } = await supabase.rpc('get_public_school_directory')
    if (error) {
      console.error('Could not load the public school directory:', error.message)
      setSchoolsError('We could not load schools right now. Please try again.')
      setSchools([])
    } else {
      setSchools(data || [])
    }
    setSchoolsLoading(false)
  }

  useEffect(() => {
    if (page !== 'portals') { setSchoolsLoading(false); return undefined }
    void loadSchools()
    return undefined
  }, [page])

  return <div className="public-site school-home school-public-page page-transition">
    <PublicHeader />
    <main className="school-public-content">
      <section className="school-public-intro">
        <p className="eyebrow">SMARTSCHOOL · {page === 'features' ? 'SERVICES' : page.replaceAll('-', ' ').toUpperCase()}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="school-public-actions">
          {page === 'pricing' && <Link className="button blue-button" to="/register?trial=1">Start a school trial <b aria-hidden="true">→</b></Link>}
          <Link className="button outline-hero" to="/login">{page === 'portals' ? 'Sign in to your school' : 'Sign in'}</Link>
        </div>
      </section>
      {page === 'portals' && <section className="school-directory-section" id="schools" aria-labelledby="school-directory-title">
        <div className="school-directory-heading"><div><p className="eyebrow">NEW TO SMARTSCHOOL?</p><h2 id="school-directory-title">Find your school</h2><p>Choose your school to request a student, parent, teacher, HR or Finance account. Your school administrator must approve the request.</p></div><Link to="/register">Register a school</Link></div>
        {schoolsLoading ? <p className="school-directory-empty" role="status">Loading active schools…</p>
          : schoolsError ? <div className="school-directory-empty"><p>{schoolsError}</p><button type="button" onClick={() => void loadSchools()}>Try again</button></div>
            : schools.length ? <><label className="school-directory-search">Search schools<input type="search" value={schoolSearch} onChange={event => setSchoolSearch(event.target.value)} placeholder="Type a school name" aria-label="Search schools by name" /></label>{filteredSchools.length ? <div className="school-directory-grid">{filteredSchools.map(school => <article className="school-directory-card" key={school.id}><h3>{school.name}</h3><p>Request an account in this school</p><Link className="school-public-portal-link" to={`/join-school/${encodeURIComponent(school.slug)}`}>Choose this school <b aria-hidden="true">→</b></Link></article>)}</div> : <p className="school-directory-empty" role="status">No schools match “{schoolSearch}”. Try another name.</p>}</>
              : <p className="school-directory-empty">No approved schools are listed yet. A school appears here after it has been approved and activated.</p>}
      </section>}
      {page === 'features' && <section className="school-public-grid school-service-grid" aria-label="SmartSchool services and features">
        {serviceCatalog.map(({ title: serviceTitle, summary, features }, index) => <article className="school-public-card school-service-card" key={serviceTitle}>
          <span className="school-public-card-number">{String(index + 1).padStart(2, '0')}</span>
          <h2>{serviceTitle}</h2>
          <p>{summary}</p>
          <ul>{features.map(feature => <li key={feature}>{feature}</li>)}</ul>
        </article>)}
        <p className="school-service-note">Tools are shown according to each person’s role and the services enabled for their school.</p>
      </section>}
      {page !== 'features' && (page !== 'portals' || schoolsLoading || schoolsError || schools.length > 0) && <section className={`school-public-grid ${page === 'portals' ? 'school-public-portal-grid' : ''} ${page === 'pricing' ? 'school-pricing-grid' : ''}`} aria-label={page === 'portals' ? 'Choose a role portal' : `${title} information`}>
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
      </section>}
    </main>
    <PublicFooter />
  </div>
}
