import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'

const portalPaths = { 'School Admin': '/login/school_admin', Teacher: '/login/teacher', Staff: '/login/staff', Student: '/login/student', Parent: '/login/parent', 'HR & Payroll': '/login/hr', Finance: '/login/finance' }

const pages = {
  features: ['School tools', 'Everyday school work, organised in one place.', [['Academic operations', 'Plan classes, share assignments and manage assessments.'], ['People and attendance', 'Keep student records and daily attendance connected.'], ['Finance and billing', 'Organise fee schedules, payment records and invoices.'], ['Communication', 'Share announcements and school updates with your community.']]],
  portals: ['Choose your school portal', 'Choose your role to sign in. Your account connects you to the school that issued it.', [['School Admin', 'Oversee school records, people and daily operations.'], ['Teacher', 'Manage classes, attendance, lessons and student work.'], ['Staff', 'View your own approved payslips, request leave, and check your employment details.'], ['Student', 'Keep up with assignments, timetables and results.'], ['Parent', 'Follow school updates and your learner’s progress.'], ['HR & Payroll', 'Manage staff records, recruitment, leave, salary records and payroll preparation.'], ['Finance', 'Manage school expenses and record approved salary payouts and financial reconciliation.']]],
  pricing: ['Plans for your school', 'Start with a 14-day free trial, then continue with a school subscription. Request current plan pricing during registration.', [['Starter', 'Core tools for school routines.'], ['Professional', 'More tools for connected school teams.'], ['Enterprise', 'Options for larger schools and groups.']]],
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
          <Link className="button blue-button" to={page === 'pricing' ? '/register?trial=1' : '/register'}>{page === 'pricing' ? 'Start a free trial' : 'Register your school'} <b aria-hidden="true">→</b></Link>
          <Link className="button outline-hero" to="/login">Sign in</Link>
        </div>
      </section>
      {page === 'portals' && <aside className="school-portal-access-note" role="note">
        <b>Your school account controls your access.</b>
        <span>Your school administrator creates or invites your account. After sign-in, you’ll see only the school workspace linked to that account.</span>
      </aside>}
      <section className={`school-public-grid ${page === 'portals' ? 'school-public-portal-grid' : ''} ${page === 'pricing' ? 'school-pricing-grid' : ''}`} aria-label={page === 'portals' ? 'Choose a role portal' : `${title} information`}>
        {items.map(([label, text], index) => (
          <article className="school-public-card" key={label}>
            <span className="school-public-card-number">0{index + 1}</span>
            <h2>{label}</h2>
            <p>{text}</p>
            {page === 'pricing' && <Link className="school-public-portal-link" to={`/register?plan=${encodeURIComponent(label)}`}>Choose {label} <b aria-hidden="true">→</b></Link>}
            {page === 'portals' && <Link className="school-public-portal-link" to={portalPaths[label]}>Continue to {label} sign in <b aria-hidden="true">→</b></Link>}
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
