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
        <div className="hero-copy"><p className="eyebrow blue-eyebrow">A PRACTICAL HOME FOR YOUR SCHOOL</p><h1>Run your school.<br/>Keep learning<br/><span>moving.</span></h1><p>Manage the school day, support teaching and keep families connected from one shared system.</p><div className="actions"><Link className="button blue-button" to="/register">Set up your school <b>→</b></Link><Link className="button outline-hero" to="/portals">Choose your school to sign in</Link></div></div><DashboardPreview/>
      </section>

      <nav className="school-home-jump-nav" aria-label="Explore the public website">
        <p>Explore SmartSchool</p>
        <div>
          <a href="#schools"><span>01</span>Find your school <b aria-hidden="true">↓</b></a>
          <a href="#services"><span>02</span>Services <b aria-hidden="true">↓</b></a>
          <a href="#about"><span>03</span>About <b aria-hidden="true">↓</b></a>
          <a href="#portals"><span>04</span>Portals <b aria-hidden="true">↓</b></a>
          <a href="#pricing"><span>05</span>Plans <b aria-hidden="true">↓</b></a>
          <a href="#contact"><span>06</span>Contact <b aria-hidden="true">↓</b></a>
        </div>
      </nav>


      <Reveal><section className="section school-directory-section landing-school-directory" id="schools" aria-labelledby="landing-schools-title">
        <div className="school-directory-heading"><div><p className="eyebrow blue-eyebrow">SCHOOLS USING SMARTSCHOOL</p><h2 id="landing-schools-title">Find your school</h2><p>Open your school’s workspace or register a new school to get started.</p></div><Link to="/portals">View all schools and portals →</Link></div>
        {schoolsLoading ? <p className="school-directory-empty" role="status">Loading active schools…</p>
          : schoolsError ? <div className="school-directory-empty"><p>{schoolsError}</p><button type="button" onClick={() => void loadSchools()}>Try again</button></div>
            : schools.length ? <div className="school-directory-grid">{schools.slice(0, 3).map(school => <article className="school-directory-card" key={school.id}><h3><Link to={`/school/${encodeURIComponent(school.slug)}`}>{school.name}</Link></h3><div className="school-directory-actions"><Link className="button blue-button" to={'/login?school=' + encodeURIComponent(school.slug)}>Login</Link><Link className="school-public-portal-link" to={`/join-school/${encodeURIComponent(school.slug)}`}>Register for this school</Link></div></article>)}</div>
              : <div className="school-directory-empty"><p>No active schools are listed yet. Register your school to create its workspace.</p><Link to="/register">Register a school →</Link></div>}
      </section></Reveal>

      <Reveal><section className="section school-start-section" aria-labelledby="school-start-title">
        <div className="section-heading"><div><p className="eyebrow blue-eyebrow">GETTING STARTED</p><h2 id="school-start-title">A clear path to your school workspace.</h2></div><p className="section-note">Start with your school details, then use the portal that matches your role.</p></div>
        <div className="school-start-steps">
          <article><span>01</span><div><h3>Register your school</h3><p>Share the school and administrator details to create a setup request.</p></div></article>
          <article><span>02</span><div><h3>Submit it for review</h3><p>SmartSchool reviews the school and plan request before activation.</p></div></article>
          <article><span>03</span><div><h3>Open your role portal</h3><p>Once your school is active, sign in using the workspace for your role.</p></div></article>
        </div>
        <Link className="school-home-section-link" to="/register">Start your school registration <b aria-hidden="true">→</b></Link>
      </section></Reveal>





      <Reveal><section className="section school-tools-section" id="services" aria-labelledby="services-title"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">SERVICES</p><h2 id="services-title">The tools your school needs, together.</h2></div><p className="section-note">One connected system for learning, operations, finance, and communication.</p></div><div className="service-grid">{services.map(([title, text], index) => <article className="service school-tool" key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{text}</p></article>)}</div><Link className="school-home-section-link" to="/services">Explore all services <b aria-hidden="true">→</b></Link></section></Reveal>

      <Reveal><section className="school-home-story" id="about" aria-labelledby="school-home-story-title"><img src="/images/school-day/school-community.jpg" alt="School community members sharing ideas in a library" loading="lazy" /><div><p className="eyebrow blue-eyebrow">ABOUT SMARTSCHOOL</p><h2 id="school-home-story-title">One connected place for your school community.</h2><p>SmartSchool brings school leaders, teachers, students, families and staff into a shared workspace, with access shaped around each role.</p><Link className="school-home-section-link" to="/about">Learn about SmartSchool <b aria-hidden="true">→</b></Link></div></section></Reveal>

      <Reveal><section className="section school-home-portals" id="portals" aria-labelledby="school-home-portals-title"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">SCHOOL PORTALS</p><h2 id="school-home-portals-title">Sign in through your school.</h2></div><p className="section-note">Choose your school first. SmartSchool will open the portal assigned to your account.</p></div><Link className="school-home-section-link" to="/portals">Choose a school to sign in or register <b aria-hidden="true">→</b></Link></section></Reveal>

      <Reveal><section className="school-home-pricing" id="pricing" aria-labelledby="school-home-pricing-title"><div><p className="eyebrow blue-eyebrow">PLANS FOR YOUR SCHOOL</p><h2 id="school-home-pricing-title">Start with the plan that fits.</h2><p>Choose a plan request when you register. The SmartSchool team will share subscription details with your school.</p><Link className="school-home-section-link" to="/pricing">See plans and request a trial <b aria-hidden="true">→</b></Link></div><img src="/images/school-day/school-library.jpg" alt="Shelves of books in a school library" loading="lazy" /></section></Reveal>





      <section className="school-cta-band" id="contact"><div><p className="eyebrow light-eyebrow">READY WHEN YOUR SCHOOL IS</p><h2>Bring your school’s<br/>everyday work together.</h2><p>Create your school workspace and start organising the routines that matter to you.</p></div><div className="actions"><Link className="button school-light-button" to="/register">Register your school <b>→</b></Link><Link className="school-cta-login" to="/portals">Already have an account? Choose your school</Link><Link className="school-cta-login" to="/contact">Contact SmartSchool</Link></div></section>
    </main>

    <PublicFooter />
  </div>
}
