import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import ContactMethods from '../components/ContactMethods'
import { supabase } from '../lib/supabase'
import { aboutHighlights, contactOptions, pricingPlans, serviceCatalog } from '../data/publicSiteContent'

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
          <a href="#start"><span>01</span>Getting started <b aria-hidden="true">↓</b></a>
          <a href="#services"><span>02</span>Services <b aria-hidden="true">↓</b></a>
          <a href="#about"><span>03</span>About <b aria-hidden="true">↓</b></a>
          <a href="#portals"><span>04</span>Portals <b aria-hidden="true">↓</b></a>
          <a href="#pricing"><span>05</span>Plans <b aria-hidden="true">↓</b></a>
          <a href="#contact"><span>06</span>Contact <b aria-hidden="true">↓</b></a>
        </div>
      </nav>


      <Reveal><section className="section school-start-section" id="start" aria-labelledby="school-start-title">
        <div className="section-heading"><div><p className="eyebrow blue-eyebrow">GETTING STARTED</p><h2 id="school-start-title">A clear path to your school workspace.</h2></div></div>
        <div className="school-start-steps">
          <article><span>01</span><div><h3>Register your school</h3><p>Share the school and administrator details to create a setup request.</p></div></article>
          <article><span>02</span><div><h3>Submit it for review</h3><p>SmartSchool reviews the school and plan request before activation.</p></div></article>
          <article><span>03</span><div><h3>Open your role portal</h3><p>Once your school is active, sign in using the workspace for your role.</p></div></article>
        </div>
        <Link className="school-home-section-link" to="/register">Start your school registration <b aria-hidden="true">→</b></Link>
      </section></Reveal>





      <Reveal><section className="section school-tools-section" id="services" aria-labelledby="services-title"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">SERVICES</p><h2 id="services-title">The tools your school needs, together.</h2></div><p className="section-note">Explore the learning, operations, finance, and communication tools available across SmartSchool.</p></div><div className="school-public-grid school-service-grid" aria-label="SmartSchool services and features">{serviceCatalog.map(({ title, summary, features }, index) => <article className={`school-public-card school-service-card school-service-card-${index + 1}`} key={title}><div className="school-service-card-top"><span className="school-service-icon" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="school-public-card-number">{String(index + 1).padStart(2, '0')}</span></div><h2>{title}</h2><p>{summary}</p><ul>{features.map(feature => <li key={feature}>{feature}</li>)}</ul></article>)}<p className="school-service-note">Tools are shown according to each person's role and the services enabled for their school.</p></div></section></Reveal>

      <Reveal><section className="school-home-story" id="about" aria-labelledby="school-home-story-title"><img src="/images/school-day/school-community.jpg" alt="School community members sharing ideas in a library" loading="lazy" /><div><p className="eyebrow blue-eyebrow">ABOUT SMARTSCHOOL</p><h2 id="school-home-story-title">One connected place for your school community.</h2><p>SmartSchool brings school leaders, teachers, students, families and staff into a shared workspace, with access shaped around each role.</p></div><div className="school-public-grid school-home-about-grid">{aboutHighlights.map(([title, text], index) => <article className="school-public-card" key={title}><span className="school-public-card-number">0{index + 1}</span><h2>{title}</h2><p>{text}</p></article>)}</div></section></Reveal>

      <Reveal><section className="section school-home-portals" id="portals" aria-labelledby="school-home-portals-title">
        <div className="section-heading"><div><p className="eyebrow blue-eyebrow">SCHOOL PORTALS</p><h2 id="school-home-portals-title">Find your school and open your portal.</h2></div><p className="section-note">Choose your school to sign in or request an account. Your access stays with the school you choose.</p></div>
        {schools.length > 0 && <label className="school-directory-search">Search schools<input type="search" value={schoolSearch} onChange={event => setSchoolSearch(event.target.value)} placeholder="Type a school name" aria-label="Search schools by name" /></label>}
        {schoolsLoading ? <p className="school-directory-empty" role="status">Loading schools...</p>
          : schoolsError ? <div className="school-directory-empty"><p>{schoolsError}</p><button type="button" onClick={() => void loadSchools()}>Try again</button></div>
            : schools.length ? filteredSchools.length ? <div className="school-directory-grid">{filteredSchools.map(school => <article className="school-directory-card" key={school.id}><h3>{school.status === 'active' ? <Link to={`/school/${encodeURIComponent(school.slug)}`}>{school.name}</Link> : school.name}</h3>{school.status === 'suspended' && <p className="school-directory-paused">Subscription payment is overdue. School access is paused.</p>}<div className="school-directory-actions"><Link className="button blue-button" to={'/login?school=' + encodeURIComponent(school.slug)}>Login</Link>{school.status === 'active' ? <Link className="school-public-portal-link" to={`/join-school/${encodeURIComponent(school.slug)}`}>Register for this school</Link> : <span className="school-directory-paused-label">New registrations paused</span>}</div></article>)}</div> : <p className="school-directory-empty" role="status">No schools match that name. Try another search.</p> : <p className="school-directory-empty">No approved schools are listed yet. A school appears here after approval and activation.</p>}
      </section></Reveal>

      <Reveal><section className="school-home-pricing" id="pricing" aria-labelledby="school-home-pricing-title"><div><p className="eyebrow blue-eyebrow">PLANS FOR YOUR SCHOOL</p><h2 id="school-home-pricing-title">Start with the plan that fits your school.</h2><p>Request a 14-day free trial. Subscription pricing is shared during registration.</p></div><img src="/images/school-day/school-library.jpg" alt="Shelves of books in a school library" loading="lazy" /><div className="school-public-grid school-pricing-grid">{pricingPlans.map(([plan, description]) => <article className="school-public-card" key={plan}><span className="school-public-card-number">{plan === 'Starter' ? '01' : plan === 'Professional' ? '02' : '03'}</span><h2>{plan}</h2><p>{description}</p><Link className="school-public-portal-link" to={`/register?trial=1&plan=${encodeURIComponent(plan)}`}>Choose {plan} for your school <b aria-hidden="true">&rarr;</b></Link></article>)}</div></section></Reveal>





      <Reveal><section className="section school-home-contact" id="contact" aria-labelledby="school-home-contact-title"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">CONTACT</p><h2 id="school-home-contact-title">Get started with SmartSchool</h2></div><p className="section-note">Create a school workspace or sign in to a portal your school has already set up.</p></div><div className="school-public-grid school-contact-grid">{contactOptions.map(([title, text], index) => <article className="school-public-card" key={title}><span className="school-public-card-number">0{index + 1}</span><h2>{title}</h2><p>{text}</p>{index === 0 ? <Link to="/register">Start registration <b aria-hidden="true">→</b></Link> : <Link to="/portals">{index === 1 ? 'Open sign in' : 'View portals'} <b aria-hidden="true">→</b></Link>}</article>)}</div><div className="school-cta-band"><div><p className="eyebrow light-eyebrow">CONTACT SMARTSCHOOL DIRECTLY</p><ContactMethods /></div></div></section></Reveal>
    </main>

    <PublicFooter />
  </div>
}
