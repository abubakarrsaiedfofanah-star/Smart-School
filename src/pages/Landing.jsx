import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'

const services = [
  ['Teaching and learning', 'Plan lessons, manage classes, share assignments and follow results.'],
  ['Student records and admissions', 'Keep learner profiles, family links and applications organised.'],
  ['Attendance and daily operations', 'Coordinate attendance, timetables, calendars and school resources.'],
  ['Family and school communication', 'Connect families and staff with notices, messages and meetings.'],
  ['Fees and finance', 'Manage fee records, expenses and payment follow-up.'],
  ['Human resources and payroll', 'Support staff records, leave, payroll and payslips.'],
  ['Library and digital courses', 'Make learning materials, courses and certificates easy to find.'],
  ['Transport and school resources', 'Coordinate routes, vehicles, inventory and assets.'],
  ['Reports and school oversight', 'Give authorised leaders a clear view of school activity.'],
]

const homePortals = [
  ['School Admin', 'Manage your school, staff and day-to-day operations.', '/login/school_admin'],
  ['Teacher', 'Plan teaching, attendance and classwork.', '/login/teacher'],
  ['Student', 'Keep up with assignments, timetable and results.', '/login/student'],
  ['Parent / guardian', 'Follow school updates and your learner’s progress.', '/login/parent'],
  ['Staff', 'View payslips and manage leave requests.', '/login/staff'],
  ['HR & Finance', 'Use assigned workspaces for people and finance tasks.', '/login'],
]

function DashboardPreview() {
  return <figure className="hero-feature-showcase" aria-label="A connected school day">
    <img src="/images/school-day/classroom-learning.jpg" alt="Students learning together in a bright classroom" width="1440" height="810" fetchPriority="high" />
    <div className="hero-feature-shade" aria-hidden="true" />
    <div className="hero-feature-image-label"><span className="hero-feature-live-dot" /> A connected school day</div>
  </figure>
}

function Reveal({ children, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (!('IntersectionObserver' in window)) { node.classList.add('is-visible'); return undefined }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { node.classList.add('is-visible'); observer.disconnect() }
    }, { threshold: 0.12 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref} className={`scroll-reveal ${className}`}>{children}</div>
}

export default function Landing() {
  const [schools, setSchools] = useState([])
  const [schoolsLoading, setSchoolsLoading] = useState(true)
  const [schoolsError, setSchoolsError] = useState('')

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

  useEffect(() => { void loadSchools() }, [])

  return <div className="public-site school-home">
    <PublicHeader />

    <main>
      <section id="home" className="sky-hero screenshot-hero school-hero">
        <div className="hero-product-backdrop"><div/><div/><div/><div/></div><div className="video-wash"/><div className="ambient-grid"/><div className="ambient-ring ring-one"/><div className="ambient-ring ring-two"/>
        <div className="hero-copy"><p className="eyebrow blue-eyebrow">A PRACTICAL HOME FOR YOUR SCHOOL</p><h1>Run your school.<br/>Keep learning<br/><span>moving.</span></h1><p>Manage the school day, support teaching and keep families connected from one shared system.</p><div className="actions"><Link className="button blue-button" to="/register">Set up your school <b>→</b></Link><Link className="button outline-hero" to="/login">Sign in to your portal</Link></div></div><DashboardPreview/>
      </section>



      <Reveal><section className="section school-directory-section landing-school-directory" id="schools" aria-labelledby="landing-schools-title">
        <div className="school-directory-heading"><div><p className="eyebrow blue-eyebrow">SCHOOLS USING SMARTSCHOOL</p><h2 id="landing-schools-title">Find your school</h2><p>Open your school’s workspace or register a new school to get started.</p></div><Link to="/portals">View all schools and portals →</Link></div>
        {schoolsLoading ? <p className="school-directory-empty" role="status">Loading active schools…</p>
          : schoolsError ? <div className="school-directory-empty"><p>{schoolsError}</p><button type="button" onClick={() => void loadSchools()}>Try again</button></div>
            : schools.length ? <div className="school-directory-grid">{schools.slice(0, 3).map(school => <article className="school-directory-card" key={school.id}><h3>{school.name}</h3><p>Sign in or request access to this school.</p><Link className="school-public-portal-link" to={`/join-school/${encodeURIComponent(school.slug)}`}>Open school →</Link></article>)}</div>
              : <div className="school-directory-empty"><p>No active schools are listed yet. Register your school to create its workspace.</p><Link to="/register">Register a school →</Link></div>}
      </section></Reveal>





      <Reveal><section className="section school-tools-section" id="services" aria-labelledby="services-title"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">SERVICES</p><h2 id="services-title">The tools your school needs, together.</h2></div><p className="section-note">One connected system for learning, operations, finance, and communication.</p></div><div className="service-grid">{services.map(([title, text], index) => <article className="service school-tool" key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{text}</p></article>)}</div><Link className="school-home-section-link" to="/services">Explore all services <b aria-hidden="true">→</b></Link></section></Reveal>

      <Reveal><section className="school-home-story" id="about" aria-labelledby="school-home-story-title"><img src="/images/school-day/school-community.jpg" alt="School community members sharing ideas in a library" loading="lazy" /><div><p className="eyebrow blue-eyebrow">ABOUT SMARTSCHOOL</p><h2 id="school-home-story-title">One connected place for your school community.</h2><p>SmartSchool brings school leaders, teachers, students, families and staff into a shared workspace, with access shaped around each role.</p><Link className="school-home-section-link" to="/about">Learn about SmartSchool <b aria-hidden="true">→</b></Link></div></section></Reveal>

      <Reveal><section className="section school-home-portals" id="portals" aria-labelledby="school-home-portals-title"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">ROLE BASED ACCESS</p><h2 id="school-home-portals-title">A workspace for every part of school life.</h2></div><p className="section-note">Each person sees the tools and records assigned to their role.</p></div><div className="school-home-photo-strip" aria-label="Learning and school life"><figure><img src="/images/school-day/classroom-learning.jpg" alt="Students learning together in class" loading="lazy"/><figcaption>Teaching and learning</figcaption></figure><figure><img src="/images/school-day/school-community.jpg" alt="School community working together" loading="lazy"/><figcaption>School community</figcaption></figure><figure><img src="/images/school-day/school-library.jpg" alt="Books in a school library" loading="lazy"/><figcaption>Learning resources</figcaption></figure></div><div className="school-home-portal-grid">{homePortals.map(([title, text, path]) => <article key={title}><span aria-hidden="true">{title.slice(0, 1)}</span><div><h3>{title}</h3><p>{text}</p></div><Link to={path} aria-label={`Open ${title} sign in`}>Sign in <b aria-hidden="true">→</b></Link></article>)}</div><Link className="school-home-section-link" to="/portals">Find a school and view all portals <b aria-hidden="true">→</b></Link></section></Reveal>

      <Reveal><section className="school-home-pricing" id="pricing" aria-labelledby="school-home-pricing-title"><div><p className="eyebrow blue-eyebrow">PLANS FOR YOUR SCHOOL</p><h2 id="school-home-pricing-title">Start with the plan that fits.</h2><p>Choose a plan request when you register. The SmartSchool team will share subscription details with your school.</p><Link className="school-home-section-link" to="/pricing">See plans and request a trial <b aria-hidden="true">→</b></Link></div><img src="/images/school-day/school-library.jpg" alt="Shelves of books in a school library" loading="lazy" /></section></Reveal>





      <section className="school-cta-band" id="contact"><div><p className="eyebrow light-eyebrow">READY WHEN YOUR SCHOOL IS</p><h2>Bring your school’s<br/>everyday work together.</h2><p>Create your school workspace and start organising the routines that matter to you.</p></div><div className="actions"><Link className="button school-light-button" to="/register">Register your school <b>→</b></Link><Link className="school-cta-login" to="/login">Already have an account? Sign in</Link><Link className="school-cta-login" to="/contact">Contact SmartSchool</Link></div></section>
    </main>

    <PublicFooter />
  </div>
}
