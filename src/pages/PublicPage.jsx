import { Link } from 'react-router-dom'

const links = [['Features', '/features'], ['Portals', '/portals'], ['Pricing', '/pricing'], ['About', '/about'], ['Contact', '/contact']]

const pages = {
  features: ['Unified Features', 'Everything you need to move forward.', [['Academic operations', 'Plan classes, publish assignments, manage assessments.'], ['People and attendance', 'See who is present, support learners early.'], ['Finance and billing', 'Track fee structures, payments, and receipts.'], ['Communication', 'Bring announcements and school updates into one rhythm.']]],
  portals: ['Dedicated Portals', 'A focused experience for each person.', [['School Admin', 'The command centre for your school.'], ['Teacher', 'A calmer place to teach and assess.'], ['Student', 'Everything your learning needs.'], ['Parent', 'A clear window into progress.']]],
  pricing: ['Flexible Plans', 'Choose the right school rhythm.', [['Starter', 'For schools getting organised.'], ['Professional', 'For connected school teams.'], ['Enterprise', 'For growing school groups.']]],
  about: ['Our Vision', 'Good schools run on good connections.', [['Global Intelligence', 'AI-powered tools for every role.'], ['Reliable Foundations', 'Permissions and data kept carefully in place.'], ['Institutional Growth', 'Built to scale with your institution.']]],
  contact: ['Get in Touch', 'Ready to make school life flow?', [['Email Support', 'support@smartschool.com'], ['Phone', '+1 (555) 000-0000'], ['Office', '123 Educational Blvd, Global City']]]
}

export default function PublicPage({ page }) {
  const [title, intro, items] = pages[page] || pages.features

  return <div className="public-page page-transition">
    <header className="nav blue-nav sticky-nav">
      <Link className="brand" to="/">Smart<span>School</span></Link>
      <nav aria-label="Public navigation">
        <Link to="/">Home</Link>
        {links.map(([label, path]) => <Link className={page===label.toLowerCase()?'active':''} to={path} key={label}>{label}</Link>)}
        <Link to="/login">Login</Link>
        <Link className="button small blue-button" to="/register" style={{marginLeft: '15px'}}>Register school</Link>
      </nav>
    </header>

    <main className="public-content">
      <section className="sky-hero screenshot-hero" style={{ minHeight: '55vh', display: 'flex', alignItems: 'center' }}>
        <div className="hero-product-backdrop"><div/><div/><div/><div/></div>
        <div className="video-wash"/>
        <div className="ambient-grid"/>
        <div className="hero-copy">
          <p className="eyebrow blue-eyebrow">SMARTSCHOOL PLATFORM</p>
          <h1>{title}</h1>
          <p>{intro}</p>
          <div className="actions" style={{ marginTop: '30px' }}>
            <Link className="button blue-button" to="/register">Start free trial <b>→</b></Link>
            <Link className="button outline-hero" to="/login">Member Login</Link>
          </div>
        </div>
      </section>

      <section className="section" style={{ padding: '80px 40px', maxWidth: '1200px', margin: '0 auto' }}>
        <div className="service-grid">
          {items.map(([label, text]) => (
            <article className="service glass-card interactive-card" key={label} style={{ background: 'var(--panel)', border: '1px solid var(--line)', padding: '40px' }}>
              <span style={{ color: 'var(--green)', fontWeight: '800', fontSize: '0.8rem', letterSpacing: '1px' }}>MODULE</span>
              <h3 style={{ fontSize: '1.4rem', margin: '15px 0 10px' }}>{label}</h3>
              <p style={{ color: 'var(--muted)', lineHeight: '1.6' }}>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>

    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-brand">
          <Link className="brand" to="/">Smart<span>School</span></Link>
          <p>The world's most advanced management platform. Now with AI Intelligence and Global Localization.</p>
          <div className="footer-socials">
            <span>𝕏</span> <span>🌐</span> <span>📸</span> <span>💼</span>
          </div>
        </div>
        <div className="footer-column">
          <h4>Explore</h4>
          <Link to="/">Home</Link>
          {links.map(([label,path])=><Link to={path} key={label}>{label}</Link>)}
        </div>
        <div className="footer-column">
          <h4>Legal</h4>
          <Link to="/">Privacy</Link>
          <Link to="/">Terms</Link>
          <Link to="/">Security</Link>
        </div>
        <div className="footer-column">
          <h4>Institutional</h4>
          <Link to="/login">Admin Portal</Link>
          <Link to="/login">Staff Access</Link>
          <Link to="/login">Student Area</Link>
          <Link to="/login">Parent Login</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 SmartSchool Enterprise. All rights reserved.</span>
      </div>
    </footer>
  </div>
}
