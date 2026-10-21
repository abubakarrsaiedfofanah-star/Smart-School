import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'

const services = [
  ['Attendance and timetable', 'Take attendance and keep class schedules clear.'],
  ['Teaching and assessment', 'Plan lessons, share assignments, and follow results.'],
  ['Student records and admissions', 'Manage learner information and new applications.'],
  ['Fees, expenses and payroll', 'Keep school finances and staff payments organised.'],
  ['School updates and calendar', 'Share announcements, events, and important dates.'],
  ['Library and courses', 'Keep learning materials easy for your community to find.'],
]

function DashboardPreview() {
  const features = [
    ['Attendance', "Today's register", '01'],
    ['Classwork', 'Assignments & results', '02'],
    ['School updates', 'Calendar & notices', '03'],
    ['School records', 'People & operations', '04'],
  ]

  return <figure className="hero-feature-showcase" aria-label="SmartSchool features for a connected school day">
    <img src="/images/school-day/classroom-learning.jpg" alt="Students learning together in a bright classroom" width="1440" height="810" fetchPriority="high" />
    <div className="hero-feature-shade" aria-hidden="true" />
    <div className="hero-feature-image-label"><span className="hero-feature-live-dot" /> A connected school day</div>
    <figcaption className="hero-feature-panel">
      <div className="hero-feature-brand"><span className="hero-feature-brand-mark" aria-hidden="true">S</span><div><small>SMARTSCHOOL</small><b>School overview</b></div><span className="hero-feature-status"><i /> Example workspace</span></div>
      <p className="hero-feature-eyebrow">YOUR SCHOOL, IN ONE VIEW</p>
      <h2>Keep the day moving.</h2>
      <p className="hero-feature-intro">The key tools your school team needs, together.</p>
      <ul className="hero-feature-list">{features.map(([title, detail, icon], index) => <li key={title}>
        <span className={'hero-feature-icon hero-feature-icon-' + index} aria-hidden="true">{icon}</span>
        <span><b>{title}</b><small>{detail}</small></span>
        <i aria-hidden="true" />
      </li>)}</ul>
      <div className="hero-feature-footnote"><span aria-hidden="true" /> For school leaders, teachers, learners and families</div>
    </figcaption>
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





      <Reveal><section className="section school-tools-section" id="services" aria-labelledby="services-title"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">SERVICES</p><h2 id="services-title">The tools your school needs, together.</h2></div><p className="section-note">One connected system for learning, operations, finance, and communication.</p></div><div className="service-grid">{services.map(([title, text], index) => <article className="service school-tool" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section></Reveal>





      <section className="school-cta-band"><div><p className="eyebrow light-eyebrow">READY WHEN YOUR SCHOOL IS</p><h2>Bring your school’s<br/>everyday work together.</h2><p>Create your school workspace and start organising the routines that matter to you.</p></div><div className="actions"><Link className="button school-light-button" to="/register">Register your school <b>→</b></Link><Link className="school-cta-login" to="/login">Already have an account? Sign in</Link></div></section>
    </main>

    <PublicFooter />
  </div>
}
