import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import ContactMethods from '../components/ContactMethods'
import { supabase } from '../lib/supabase'
import { aboutHighlights, contactOptions, pricingPlans, serviceCatalog } from '../data/publicSiteContent'

const pages = {
  features: ['Services', 'Explore the tools SmartSchool brings together for learning, school operations and family engagement.'],
  portals: ['Choose your school', 'Sign in to your school or request an account.'],
  pricing: ['Plans for your school', 'Request a 14-day free trial. Subscription pricing is shared during registration.', pricingPlans],
  about: ['About SmartSchool', 'A shared system for the people who make a school work.', aboutHighlights],
  contact: ['Get started with SmartSchool', 'Create a school workspace or sign in to a portal your school has already set up.', contactOptions],
}

export default function PublicPage({ page }) {
  const [title, intro, configuredItems] = pages[page] || pages.features
  const items = page === 'portals' ? [] : configuredItems
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
      {page !== 'portals' && <section className="school-public-hero school-public-hero-text-only">
        <div className="school-public-intro">
        <p className="eyebrow">SMARTSCHOOL · {page === 'features' ? 'SERVICES' : page.replaceAll('-', ' ').toUpperCase()}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="school-public-actions">
          {page === 'pricing' && <Link className="button blue-button" to="/register?trial=1">Start a school trial <b aria-hidden="true">→</b></Link>}
          <Link className="button outline-hero" to="/portals">Sign in</Link>
        </div>
        </div>
      </section>}
      {page === 'portals' && <section className="school-public-intro school-directory-intro">
        <p className="eyebrow">SMARTSCHOOL · SCHOOL PORTALS</p>
        <h1>Find your school</h1>
        <p>Choose your school to sign in or request an account. Your access stays with the school you choose.</p>
        <div className="school-public-actions"><Link className="button blue-button" to="/register">Register a new school</Link></div>
      </section>}
      {page === 'portals' && <section className="school-directory-section" id="schools" aria-labelledby="school-directory-title">
        <div className="school-directory-heading"><div><p className="eyebrow">SCHOOL DIRECTORY</p><h2 id="school-directory-title">Choose a school</h2><p>Use Login for an existing account, or register for access to the selected school.</p></div></div>
        {schoolsLoading ? <p className="school-directory-empty" role="status">Loading active schools…</p>
          : schoolsError ? <div className="school-directory-empty"><p>{schoolsError}</p><button type="button" onClick={() => void loadSchools()}>Try again</button></div>
            : schools.length ? <><label className="school-directory-search">Search schools<input type="search" value={schoolSearch} onChange={event => setSchoolSearch(event.target.value)} placeholder="Type a school name" aria-label="Search schools by name" /></label>{filteredSchools.length ? <div className="school-directory-grid">{filteredSchools.map(school => <article className="school-directory-card" key={school.id}><h3>{school.status === 'active' ? <Link to={`/school/${encodeURIComponent(school.slug)}`}>{school.name}</Link> : school.name}</h3>{school.status === 'suspended' && <p className="school-directory-paused">Subscription payment is overdue. School access is paused.</p>}<div className="school-directory-actions"><Link className="button blue-button" to={'/login?school=' + encodeURIComponent(school.slug)}>Login</Link>{school.status === 'active' ? <Link className="school-public-portal-link" to={`/join-school/${encodeURIComponent(school.slug)}`}>Register for this school</Link> : <span className="school-directory-paused-label">New registrations paused</span>}</div></article>)}</div> : <p className="school-directory-empty" role="status">No schools match “{schoolSearch}”. Try another name.</p>}</>
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
      {page === 'contact' && <ContactMethods className="school-public-contact-methods" />}
    </main>
    <PublicFooter />
  </div>
}
