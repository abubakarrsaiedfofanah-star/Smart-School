import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AIGuide from '../components/AI_Guide'
import VideoGuide from '../components/VideoGuide'
import { useAuth } from '../context/AuthContext'
import { roleRoute } from '../lib/roleRoute'
import toast from 'react-hot-toast'

const services=[['01','Academic operations','Plan classes, publish assignments, manage assessments and keep every result ready for review.'],['02','People and attendance','See who is present, support learners early and keep staff workflows simple from any device.'],['03','Finance and billing','Track fee structures, payments, balances and receipts with a clear view for every family.'],['04','Communication','Bring announcements, messages, events and school updates into one dependable rhythm.']]
const portals=[['School Admin','The command centre for your school','/school-admin','Students · Staff · Finance'],['Teacher','A calmer place to teach and assess','/teacher','Classes · Attendance · Results'],['Student','Everything your learning needs','/student','Assignments · Grades · Fees'],['Parent','A clear window into progress','/parent','Progress · Payments · Events']]
const plans=[['Starter','For schools getting organised','Core admissions, attendance, classes and communication.'],['Professional','For connected school teams','Everything in Starter plus deeper insights, fees and academic workflows.'],['Enterprise','For growing school groups','Multi-school oversight, advanced controls and dedicated support.']]

function DashboardPreview(){return <div className="floating-dashboard glass-card" aria-label="SchoolFlow dashboard preview"><div className="dash-bar"><b>Good morning, Sarah</b><span className="live-indicator">● Live Workspace</span></div><div className="dash-cards"><article><b>1,248</b><small>Total Students</small><i>↑ 8.4%</i></article><article><b>94%</b><small>Attendance</small><i>Stable</i></article><article><b>82%</b><small>Fees Collected</small><i>Term 2</i></article></div><div className="dash-chart"><div><p>Weekly Trend</p><b>94.2%</b></div><div className="blue-bars"><i style={{height:'40%'}}/><i style={{height:'60%'}}/><i style={{height:'45%'}}/><i style={{height:'80%'}}/><i style={{height:'65%'}}/><i style={{height:'95%'}}/><i style={{height:'75%'}}/></div></div><div className="dash-list"><span><i/> 12 Assignments due today</span><span><i/> 8 New parent messages</span></div></div>}
function Reveal({children,className=''}){const ref=useRef(null);useEffect(()=>{const node=ref.current;if(!node)return undefined;const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){node.classList.add('is-visible');observer.disconnect()}},{threshold:.14});observer.observe(node);return()=>observer.disconnect()},[]);return <div ref={ref} className={`scroll-reveal ${className}`}>{children}</div>}

export default function Landing(){
  const [menuOpen,setMenuOpen]=useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const enterDemo = async (role) => {
    const emailMap = {
      'School Admin': 'school@demo.com',
      'Teacher': 'teacher@demo.com',
      'Student': 'student@demo.com',
      'Parent': 'parent@demo.com',
      'Super Admin': 'super@demo.com'
    };
    const id = toast.loading(`Entering ${role} Portal...`);
    try {
      const result = await login(emailMap[role], 'password');
      toast.success(`Welcome to the ${role} Dashboard`, { id });
      navigate(roleRoute(result.profile.role));
    } catch (e) {
      toast.error('Could not enter demo portal', { id });
    }
  };

  return <div className="public-site">
    <header className="nav blue-nav sticky-nav">
      <Link className="brand" to="/">Smart<span>School</span></Link>
      <button className="public-menu" type="button" onClick={()=>setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={menuOpen?'Close navigation':'Open navigation'}>{menuOpen?'×':'☰'}</button>
      <nav className={menuOpen?'public-nav-open':''} aria-label="Main navigation">
        <Link to="/">Home</Link>
        <Link to="/features">Features</Link>
        <Link to="/portals">Portals</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/about">About</Link>
        <Link to="/contact">Contact</Link>
        <Link to="/login">Login</Link>
        <Link className="button small blue-button" to="/register" style={{marginLeft: '15px'}}>Register school</Link>
      </nav>
    </header>

    <main>
      <section id="home" className="sky-hero screenshot-hero">
        <div className="hero-product-backdrop"><div/><div/><div/><div/></div>
        <div className="video-wash"/>
        <div className="ambient-grid"/>
        <div className="ambient-ring ring-one"/>
        <div className="ambient-ring ring-two"/>
        <div className="hero-copy">
          <p className="eyebrow blue-eyebrow">WELCOME TO SMARTSCHOOL 3.0</p>
          <h1>Intelligence.<br/>Globalization.<br/>Excellence.</h1>
          <p>The world's most advanced school platform is here. Now with AI Intelligence and Global Localization.</p>
          <div className="actions">
            <Link className="button blue-button" to="/register">Start free trial <b>→</b></Link>
            <a className="button outline-hero" href="#guide">Watch 3.0 Tour</a>
          </div>
        </div>
        <DashboardPreview />
        <div className="new-badge-container">
          <div className="hero-new-label">NEW IN 3.0: AI ASSISTANT & SWAHILI SUPPORT</div>
        </div>
      </section>

      <div className="hero-portals">
        {[
          ['School Admin','Manage your school'],
          ['Teacher','Teach, assess and connect'],
          ['Student','Learn and submit work'],
          ['Parent','Follow progress and fees']
        ].map(([name,text],index)=>(
          <button className={`hero-portal portal-tone-${index}`} onClick={()=>enterDemo(name)} key={name}>
            <span className="portal-icon">{['⌂','◆','●','♟'][index]}</span>
            <b>{name}</b>
            <small>{text}</small>
            <span className="portal-link">Enter Portal →</span>
          </button>
        ))}
      </div>

      <Reveal>
        <section id="about" className="section about-section">
          <div className="section-intro">
            <p className="eyebrow blue-eyebrow">ONE SHARED PICTURE</p>
            <h2>Good schools run on good connections.</h2>
          </div>
          <div className="about-copy">
            <p>SchoolFlow gives everyone the right view at the right moment. Leaders get the overview, teachers get time back, families get clarity, and students stay focused on their next step.</p>
            <p>It is a practical digital home for the everyday work that makes a school feel alive, with permissions and data kept carefully in place.</p>
            <Link className="text-link blue-text-link" to="/register">Bring your school together →</Link>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="features" className="section services-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow blue-eyebrow">THE SCHOOL DAY, CONNECTED</p>
              <h2>Everything you need to move forward.</h2>
            </div>
            <p className="section-note">One flexible system for the details, decisions and conversations behind great learning.</p>
          </div>
          <div className="service-grid">
            {services.map(([number,title,text])=>(
              <article className="service" key={title}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
                <a href="#contact">Learn more <b>↗</b></a>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="portals" className="section portals-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow blue-eyebrow">DESIGNED FOR EVERY ROLE</p>
              <h2>One school. Four clear portals.</h2>
            </div>
            <p className="section-note">A focused experience for each person, with the whole community still connected.</p>
          </div>
          <div className="portal-grid">
            {portals.map(([title,text,path,details])=>(
              <Link className="portal-card" to={path} key={title}>
                <div><span>{title}</span><b>↗</b></div>
                <h3>{text}</h3>
                <p>{details}</p>
              </Link>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="pricing" className="section pricing-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow blue-eyebrow">PLANS THAT GROW WITH YOU</p>
              <h2>Choose the right school rhythm.</h2>
            </div>
            <p className="section-note">Start simple, then add the depth your school needs. Every plan includes secure role-based access.</p>
          </div>
          <div className="pricing-grid">
            {plans.map(([name,tagline,description],index)=>(
              <article className={`pricing-card ${index===1?'featured':''}`} key={name}>
                {index===1&&<span className="plan-badge">MOST POPULAR</span>}
                <p className="plan-number">0{index+1}</p>
                <h3>{name}</h3>
                <b className="plan-tagline">{tagline}</b>
                <p>{description}</p>
                <Link className={index===1?'button blue-button':'text-link blue-text-link'} to="/register">Choose {name} <b>→</b></Link>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section id="details" className="detail-band">
          <div>
            <p className="eyebrow light-eyebrow">CLEARER EVERY DAY</p>
            <h2>See the school, not just the spreadsheet.</h2>
          </div>
          <div className="detail-stats">
            <span><b>94%</b> average attendance visibility</span>
            <span><b>4×</b> connected school roles</span>
            <span><b>1</b> shared source of truth</span>
          </div>
        </section>
      </Reveal>

      <section id="contact" className="contact-section">
        <div>
          <p className="eyebrow blue-eyebrow">LET'S TALK</p>
          <h2>Ready to make school life flow?</h2>
          <p>Start with a guided setup for your school, or jump straight into the product tour.</p>
        </div>
        <div className="actions">
          <Link className="button blue-button" to="/register">Register your school <b>→</b></Link>
          <Link className="text-link" to="/login">Sign in to SmartSchool</Link>
        </div>
      </section>

      <section id="ai-guide"><AIGuide/></section>
    </main>

    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-brand">
          <Link className="brand" to="/">Smart<span>School</span></Link>
          <p>Intelligence. Globalization. Excellence. The next generation of school management.</p>
          <div className="footer-socials">
            <span>𝕏</span> <span>🌐</span> <span>📸</span> <span>💼</span>
          </div>
        </div>

        <div className="footer-column">
          <h4>Product</h4>
          <Link to="/features">Features</Link>
          <Link to="/portals">Portals</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/welcome">AI Guide</Link>
        </div>

        <div className="footer-column">
          <h4>Support</h4>
          <Link to="/contact">Contact Us</Link>
          <Link to="/about">About</Link>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
        </div>

        <div className="footer-column">
          <h4>Portals</h4>
          <button onClick={() => enterDemo('School Admin')}>Admin Portal</button>
          <button onClick={() => enterDemo('Teacher')}>Teacher Portal</button>
          <button onClick={() => enterDemo('Student')}>Student Portal</button>
          <button onClick={() => enterDemo('Parent')}>Parent Portal</button>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 SmartSchool Enterprise. All rights reserved.</span>
        <div className="footer-badges">
          <span>Google Play</span>
          <span>App Store</span>
        </div>
      </div>
    </footer>
  </div>}