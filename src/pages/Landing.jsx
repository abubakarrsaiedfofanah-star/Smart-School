import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import PublicFooter from '../components/PublicFooter'
import { supabase } from '../lib/supabase'

const workflows = [
  { label: 'Run today', number: '01', title: 'Know what needs attention today.', copy: 'Check attendance, classes, notices and the school calendar before the day gets busy.', tasks: ['Record and review attendance', 'Check today’s timetable', 'Share a school update'], icon: '◷' },
  { label: 'Teach & learn', number: '02', title: 'Keep classwork moving.', copy: 'Organise lessons, assignments, submissions, quizzes and results around each class.', tasks: ['Prepare lessons and resources', 'Collect and review assignments', 'Track grades and progress'], icon: '▤' },
  { label: 'Manage school', number: '03', title: 'Keep records and operations together.', copy: 'Follow admissions, school records, fee activity and the work that keeps a school running.', tasks: ['Review admissions', 'Track fees and invoices', 'Manage school information'], icon: '⌂' },
  { label: 'Stay connected', number: '04', title: 'Keep the right people informed.', copy: 'Give staff, learners and families a clear place to find relevant school information.', tasks: ['Share announcements', 'Coordinate meetings and events', 'Keep families informed'], icon: '↗' },
]

const roles = [
  ['School Admin', 'Oversee school records, people and daily operations.', '⌂', '/school-admin'],
  ['Teacher', 'Manage classes, attendance, lessons and student work.', '▤', '/teacher'],
  ['Student', 'Keep up with assignments, timetables and results.', '✦', '/student'],
  ['Parent', 'Follow school updates and your learner’s progress.', '♡', '/parent'],
  ['HR & Payroll', 'Manage staff records and payroll workflows.', '♙', '/login/hr'],
  ['Finance', 'Manage school expenses and payment reconciliation.', '$', '/login/finance'],
]

const tools = [
  ['Attendance & timetable', 'Take attendance and keep class schedules visible.'],
  ['Assignments & results', 'Share classwork, review submissions and follow academic progress.'],
  ['Fees & invoices', 'Keep payment information and invoices organised.'],
  ['Admissions & records', 'Bring new admissions and school records into the same workflow.'],
  ['Calendar & communication', 'Coordinate school dates, meetings and announcements.'],
  ['Library & courses', 'Give learners and teachers a place for learning resources.'],
]

function DashboardPreview() {
  return <div className="floating-dashboard glass-card" aria-label="Example school operations dashboard">
    <div className="dash-bar"><b>School overview</b><span className="live-indicator">● Example workspace</span></div>
    <div className="school-day-heading"><span>MONDAY · SCHOOL DAY</span><b>Good morning</b><small>Here’s what your team can keep in view.</small></div>
    <div className="dash-cards"><article><b>Attendance</b><small>Review today’s register</small><i>Open task ↗</i></article><article><b>Classwork</b><small>Assignments to review</small><i>View classes ↗</i></article><article><b>School updates</b><small>Notices and events</small><i>See calendar ↗</i></article></div>
    <div className="dash-chart"><div><p>Today at school</p><b>One clear view</b></div><div className="school-day-dots"><i>✓</i><i>02</i><i>03</i><i>04</i></div></div>
    <div className="dash-list"><span><i/> For school leaders, teachers, learners and families</span><span><i/> Each person sees the tools for their role</span></div>
  </div>
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
  const [activeWorkflow, setActiveWorkflow] = useState(0)
  const [schools, setSchools] = useState([])
  const [schoolsLoading, setSchoolsLoading] = useState(true)
  const [schoolsError, setSchoolsError] = useState('')

  const active = workflows[activeWorkflow]

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
        <div className="hero-copy"><p className="eyebrow blue-eyebrow">A PRACTICAL HOME FOR YOUR SCHOOL</p><h1>Run your school.<br/>Keep learning<br/><span>moving.</span></h1><p>Manage the school day, support teaching and keep families connected from one shared system.</p><div className="actions"><Link className="button blue-button" to="/register">Set up your school <b>→</b></Link><Link className="button outline-hero" to="/login">Sign in to your portal</Link></div><div className="hero-role-note"><span>One system</span><i/>School Admin <i/> Teacher <i/> Student <i/> Parent <i/> HR <i/> Finance</div></div>
        <DashboardPreview/>
      </section>

      <div className="hero-portals school-portal-shortcuts">{roles.map(([name, text, icon, href], index) => <Link className={`hero-portal portal-tone-${index}`} to={href} key={name}><span className="portal-icon">{icon}</span><b>{name}</b><small>{text}</small><span className="portal-link">Open portal →</span></Link>)}</div>

      <Reveal><section className="section school-directory-section landing-school-directory" id="schools" aria-labelledby="landing-schools-title">
        <div className="school-directory-heading"><div><p className="eyebrow blue-eyebrow">SCHOOLS USING SMARTSCHOOL</p><h2 id="landing-schools-title">Find your school</h2><p>Open your school’s workspace or register a new school to get started.</p></div><Link to="/portals">View all schools and portals →</Link></div>
        {schoolsLoading ? <p className="school-directory-empty" role="status">Loading active schools…</p>
          : schoolsError ? <div className="school-directory-empty"><p>{schoolsError}</p><button type="button" onClick={() => void loadSchools()}>Try again</button></div>
            : schools.length ? <div className="school-directory-grid">{schools.slice(0, 3).map(school => <article className="school-directory-card" key={school.id}><h3>{school.name}</h3><p>Sign in or request access to this school.</p><Link className="school-public-portal-link" to={`/join-school/${encodeURIComponent(school.slug)}`}>Open school →</Link></article>)}</div>
              : <div className="school-directory-empty"><p>No active schools are listed yet. Register your school to create its workspace.</p><Link to="/register">Register a school →</Link></div>}
      </section></Reveal>

      <Reveal><section className="section school-day-section" id="how-it-works"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">A SCHOOL DAY, STEP BY STEP</p><h2>From the first register<br/>to the last update.</h2></div><p className="section-note">Keep the work of running a school connected throughout the day.</p></div>
        <div className="school-workflow"><div className="workflow-tabs" role="tablist" aria-label="School workflows">{workflows.map((item, index) => <button className={activeWorkflow === index ? 'active' : ''} key={item.number} role="tab" aria-selected={activeWorkflow === index} type="button" onClick={() => setActiveWorkflow(index)}><span>{item.number}</span><b>{item.label}</b><i>↗</i></button>)}</div>
          <article className="workflow-detail" role="tabpanel" key={active.number}><div className="workflow-copy"><span className="workflow-icon">{active.icon}</span><p className="eyebrow blue-eyebrow">WORKFLOW {active.number}</p><h3>{active.title}</h3><p>{active.copy}</p><Link to="/login" className="text-link blue-text-link">Open your school portal <b>→</b></Link></div><ul>{active.tasks.map((task, index) => <li key={task}><span>0{index + 1}</span><b>{task}</b><i>↗</i></li>)}</ul></article>
        </div>
      </section></Reveal>

      <Reveal><section className="section school-tools-section" id="school-tools"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">SCHOOL OPERATIONS IN ONE PLACE</p><h2>Tools for the work<br/>your school does.</h2></div><p className="section-note">Move between day-to-day school needs without losing sight of the people behind them.</p></div><div className="service-grid">{tools.map(([title, text], index) => <article className="service school-tool" key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p><Link to="/portals">Choose a portal <b>↗</b></Link></article>)}</div></section></Reveal>

      <Reveal><section className="section about-section school-roles-section"><div className="section-intro"><p className="eyebrow blue-eyebrow">CLEAR ROLES. SHARED SCHOOL.</p><h2>Everyone gets a useful place in the system.</h2></div><div className="about-copy"><p>School leaders, teachers, students and parents each have a portal shaped around their work. Shared information helps the school stay coordinated while each person can focus on what they need to do.</p><p>Start by registering your school, then invite your team and set up the routines your school uses.</p><Link className="text-link blue-text-link" to="/portals">See how the portals work →</Link></div></section></Reveal>

      <Reveal><section className="section school-setup-section"><div className="section-heading"><div><p className="eyebrow blue-eyebrow">GETTING STARTED</p><h2>Set up the system<br/>around your school.</h2></div><p className="section-note">A straightforward path from a new school workspace to everyday use.</p></div><div className="setup-grid"><article><span>01</span><h3>Register your school</h3><p>Create your school workspace and add the details your community needs.</p></article><article><span>02</span><h3>Set up your team</h3><p>Bring in school leaders, teachers, students and families with role based access.</p></article><article><span>03</span><h3>Run your school day</h3><p>Use the portals to keep attendance, learning, records and updates moving.</p></article></div></section></Reveal>

      <section className="school-cta-band"><div><p className="eyebrow light-eyebrow">READY WHEN YOUR SCHOOL IS</p><h2>Bring your school’s<br/>everyday work together.</h2><p>Create your school workspace and start organising the routines that matter to you.</p></div><div className="actions"><Link className="button school-light-button" to="/register">Register your school <b>→</b></Link><Link className="school-cta-login" to="/login">Already have an account? Sign in</Link></div></section>
    </main>

    <PublicFooter />
  </div>
}
