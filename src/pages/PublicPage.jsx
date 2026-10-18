import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'

const portalPaths = { 'School Admin': '/school-admin', Teacher: '/teacher', Student: '/student', Parent: '/parent', 'HR & Payroll': '/login/hr', Finance: '/login/finance' }

const pages = {
  features: ['School tools', 'Everyday school work, organised in one place.', [['Academic operations', 'Plan classes, share assignments and manage assessments.'], ['People and attendance', 'Keep student records and daily attendance connected.'], ['Finance and billing', 'Organise fee schedules, payment records and invoices.'], ['Communication', 'Share announcements and school updates with your community.']]],
  portals: ['Role portals', 'A separate workspace for each person in the school system.', [['School Admin', 'Oversee school records, people and daily operations.'], ['Teacher', 'Manage classes, attendance, lessons and student work.'], ['Student', 'Keep up with assignments, timetables and results.'], ['Parent', 'Follow school updates and your learner’s progress.'], ['HR & Payroll', 'Manage staff records, recruitment, leave and payroll workflows.'], ['Finance', 'Manage school expenses, payments and financial reconciliation.']]],
  pricing: ['Plans for your school', 'Choose a plan as your school workspace grows.', [['Starter', 'Core tools to organise a school’s daily routines.'], ['Professional', 'More tools for connected school teams.'], ['Enterprise', 'Support for larger schools and school groups.']]],
  about: ['About SmartSchool', 'A shared system for the people who make a school work.', [['Built around schools', 'Bring everyday school operations into a practical workspace.'], ['Clear roles', 'Give school leaders, teachers, students and parents the tools they need.'], ['One school workspace', 'Keep school information organised under each school’s own portal.']]],
  contact: ['Get started with SmartSchool', 'Create a school workspace or sign in to a portal your school has already set up.', [['Register a school', 'Set up a new school workspace and its administrator account.'], ['Existing school', 'Sign in with the account credentials provided by your school.'], ['Role portals', 'Each role opens a separate workspace with its own access.']]],
}

export default function PublicPage({ page }) {
  const [title, intro, items] = pages[page] || pages.features

  return <div className="public-site school-home school-public-page page-transition">
    <PublicHeader />
    <main className="school-public-content">
      <section className="school-public-intro">
        <p className="eyebrow">SMARTSCHOOL · {page.replaceAll('-', ' ').toUpperCase()}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="school-public-actions">
          <Link className="button blue-button" to="/register">Register your school <b aria-hidden="true">→</b></Link>
          <Link className="button outline-hero" to="/login">Sign in to your portal</Link>
        </div>
      </section>
      <section className="school-public-grid" aria-label={`${title} information`}>
        {items.map(([label, text], index) => (
          <article className="school-public-card" key={label}>
            <span className="school-public-card-number">0{index + 1}</span>
            <h2>{label}</h2>
            <p>{text}</p>
            {page === 'portals' && <Link to={portalPaths[label]}>Open {label} portal <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Register a school' && <Link to="/register">Start registration <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Existing school' && <Link to="/login">Open sign in <b aria-hidden="true">→</b></Link>}
            {page === 'contact' && label === 'Role portals' && <Link to="/portals">View portals <b aria-hidden="true">→</b></Link>}
          </article>
        ))}
      </section>
    </main>
    <PublicFooter />
  </div>
}
