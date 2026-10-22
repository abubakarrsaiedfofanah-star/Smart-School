import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'

const publicPhotos = [
  { src: '/images/school-day/classroom-learning.jpg', alt: 'Students learning together in a classroom', caption: 'Learning together' },
  { src: '/images/school-day/school-community.jpg', alt: 'School community sharing a learning day', caption: 'A connected community' },
  { src: '/images/school-day/school-library.jpg', alt: 'Books and learning resources in a school library', caption: 'Resources for every learner' },
]
const pagePhotoCopy = {
  features: ['Teaching and learning', 'A school community', 'Learning resources'],
  portals: ['A place to learn', 'Families and school teams', 'Explore and study'],
  pricing: ['Support for classrooms', 'Plans for your school', 'Room to grow'],
  about: ['Learning in action', 'People at the heart of school', 'A place to discover'],
  contact: ['Start in the classroom', 'Connect your school', 'Make learning accessible'],
}

const serviceCatalog = [
  { icon: '✎', title: 'Teaching and learning', summary: 'Plan teaching and keep classwork moving.', features: ['Classes, subjects and timetables', 'Lesson plans and course materials', 'Assignments, submissions and quizzes', 'Exams, gradebook and results'] },
  { icon: '♧', title: 'Student records and admissions', summary: 'Keep learner information and school entry organised.', features: ['Student and guardian profiles', 'Admissions and applications', 'School account requests and approvals', 'Behaviour records and learner progress'] },
  { icon: '✓', title: 'Attendance and daily operations', summary: 'Coordinate the routines that keep a school running.', features: ['Student and staff attendance', 'School calendar, events and notices', 'Inventory and asset records', 'School settings and staff access'] },
  { icon: '✉', title: 'Family and school communication', summary: 'Help school teams and families stay connected.', features: ['Announcements and broadcasts', 'Direct messages', 'Parent and teacher meetings', 'Role based portals for families and staff'] },
  { icon: '$', title: 'Fees and finance', summary: 'Manage school charges and follow payment activity.', features: ['Fees, invoices and payment records', 'Expense tracking and reconciliation', 'Finance workspace and approved payouts', 'Payment and finance reporting'] },
  { icon: '♙', title: 'Human resources and payroll', summary: 'Support staff administration and payroll workflows.', features: ['Staff records, recruitment and contracts', 'Leave and staff attendance', 'Payroll preparation and approvals', 'Payslips and salary history'] },
  { icon: '▤', title: 'Library and digital courses', summary: 'Bring learning resources into the school workspace.', features: ['Library catalogue', 'Online courses and course builder', 'Learner course progress', 'Course completion certificates'] },
  { icon: '➜', title: 'Transport and school resources', summary: 'Coordinate operational resources and transport workflows.', features: ['Transport routes and driver tools', 'Vehicle and trip information', 'School inventory and asset condition', 'Role based access to operational tools'] },
  { icon: '◷', title: 'Reports and school oversight', summary: 'Give authorised leaders a view of activity and performance.', features: ['School and platform dashboards', 'Student, teacher and academic reports', 'Subscription and payment oversight', 'Audit trail and security settings'] },
]

const pages = {
  features: ['Services', 'Explore the tools SmartSchool brings together for learning, school operations and family engagement.'],
  portals: ['Choose your school', 'Sign in to your school or request an account.'],
  pricing: ['Plans for your school', 'Request a 14-day free trial. Subscription pricing is shared during registration.', [['Starter', 'Core tools for school routines.'], ['Professional', 'Tools for connected school teams.'], ['Enterprise', 'Options for larger schools and groups.']]],
  about: ['About SmartSchool', 'A shared system for the people who make a school work.', [['Built around schools', 'Bring everyday school operations into a practical workspace.'], ['Clear roles', 'Give school leaders, teachers, students and parents the tools they need.'], ['One school workspace', 'Keep school information organised under each school’s own portal.']]],
  contact: ['Get started with SmartSchool', 'Create a school workspace or sign in to a portal your school has already set up.', [['Register a school', 'Set up a new school workspace and its administrator account.'], ['Existing school', 'Sign in with the account credentials provided by your school.'], ['Role portals', 'Each role opens a separate workspace with its own access.']]],
}

export default function PublicPage({ page }) {
  const [title, intro, configuredItems] = pages[page] || pages.features
  const items = page === 'portals' ? [] : configuredItems
  const [schools, setSchools] = useState([])
  const [schoolsLoading, setSchoolsLoading] = useState(page === 'portals')
  const [schoolsError, setSchoolsError] = useState('')
  const [schoolSearch, setSchoolSearch] = useState('')
  const heroPhotoIndex = page === 'about' ? 1 : page === 'pricing' ? 2 : 0
  const heroPhoto = publicPhotos[heroPhotoIndex]
  const galleryPhotos = publicPhotos.map((photo, index) => ({ ...photo, index })).filter(photo => photo.index !== heroPhotoIndex)

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
    const { data, error } = await supabase.rpc('get_public_school_login_directory')
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
      {page !== 'portals' && <section className="school-public-hero">
        <div className="school-public-intro">
        <p className="eyebrow">SMARTSCHOOL · {page === 'features' ? 'SERVICES' : page.replaceAll('-', ' ').toUpperCase()}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="school-public-actions">
          {page === 'pricing' && <Link className="button blue-button" to="/register?trial=1">Start a school trial <b aria-hidden="true">→</b></Link>}
          <Link className="button outline-hero" to="/portals">Sign in</Link>
        </div>
        </div>
        <figure className="school-public-hero-photo">
          <img src={heroPhoto.src} alt={heroPhoto.alt} />
          <figcaption>{page === 'portals' ? 'Every role has a place' : page === 'pricing' ? 'Tools that grow with your school' : 'A connected school day'}</figcaption>
        </figure>
      </section>}
      {page === 'portals' && <section className="school-public-intro school-directory-intro">
        <p className="eyebrow">SMARTSCHOOL · SCHOOL PORTALS</p>
        <h1>Find your school</h1>
        <p>Choose your school to sign in or request an account. Your access stays with the school you choose.</p>
        <div className="school-public-actions"><Link className="button blue-button" to="/register">Register a new school</Link></div>
      </section>}
      {page !== 'portals' && <section className="school-public-photo-strip" aria-label="Life and learning at school">
        {galleryPhotos.map(photo => <figure key={photo.src}>
          <img src={photo.src} alt={photo.alt} loading="lazy" />
          <figcaption>{pagePhotoCopy[page]?.[photo.index] || photo.caption}</figcaption>
        </figure>)}
      </section>}
      {page === 'portals' && <section className="school-directory-section" id="schools" aria-labelledby="school-directory-title">
        <div className="school-directory-heading"><div><p className="eyebrow">SCHOOL DIRECTORY</p><h2 id="school-directory-title">Choose a school</h2><p>Use Login for an existing account, or register for access to the selected school.</p></div></div>
        {schoolsLoading ? <p className="school-directory-empty" role="status">Loading active schools…</p>
          : schoolsError ? <div className="school-directory-empty"><p>{schoolsError}</p><button type="button" onClick={() => void loadSchools()}>Try again</button></div>
            : schools.length ? <><label className="school-directory-search">Search schools<input type="search" value={schoolSearch} onChange={event => setSchoolSearch(event.target.value)} placeholder="Type a school name" aria-label="Search schools by name" /></label>{filteredSchools.length ? <div className="school-directory-grid">{filteredSchools.map(school => <article className="school-directory-card" key={school.id}><h3>{school.name}</h3>{school.status === 'suspended' && <p className="school-directory-paused">Subscription payment is overdue. School access is paused.</p>}<div className="school-directory-actions"><Link className="button blue-button" to={'/login?school=' + encodeURIComponent(school.slug)}>Login</Link>{school.status === 'active' ? <Link className="school-public-portal-link" to={`/join-school/${encodeURIComponent(school.slug)}`}>Register for this school</Link> : <span className="school-directory-paused-label">New registrations paused</span>}</div></article>)}</div> : <p className="school-directory-empty" role="status">No schools match “{schoolSearch}”. Try another name.</p>}</>
              : <p className="school-directory-empty">No approved schools are listed yet. A school appears here after it has been approved and activated.</p>}
      </section>}
      {page === 'features' && <section className="school-public-grid school-service-grid" aria-label="SmartSchool services and features">
        {serviceCatalog.map(({ icon, title: serviceTitle, summary, features }, index) => <article className={`school-public-card school-service-card school-service-card-${index + 1}`} key={serviceTitle}>
          <div className="school-service-card-top"><span className="school-service-icon" aria-hidden="true">{icon}</span><span className="school-public-card-number">{String(index + 1).padStart(2, '0')}</span></div>
          <h2>{serviceTitle}</h2>
          <p>{summary}</p>
          <ul>{features.map(feature => <li key={feature}>{feature}</li>)}</ul>
        </article>)}
        <p className="school-service-note">Tools are shown according to each person’s role and the services enabled for their school.</p>
      </section>}
      {page !== 'features' && page !== 'portals' && <section className={`school-public-grid ${page === 'pricing' ? 'school-pricing-grid' : ''}`} aria-label={`${title} information`}>
        {items.map(([label, text], index) => (
          <article className="school-public-card" key={label}>
            <span className="school-public-card-number">0{index + 1}</span>
            <h2>{label}</h2>
            <p>{text}</p>
            {page === 'pricing' && <Link className="school-public-portal-link" to={`/register?trial=1&plan=${encodeURIComponent(label)}`}>Choose {label} for your school <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Register a school' && <Link to="/register">Start registration <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Existing school' && <Link to="/portals">Open sign in <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Role portals' && <Link to="/portals">View portals <b aria-hidden="true">→</b></Link>}
          </article>
        ))}
      </section>}
    </main>
    <PublicFooter />
  </div>
}
