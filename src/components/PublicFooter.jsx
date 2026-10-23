import { Link } from 'react-router-dom'

export default function PublicFooter() {
  return <footer className="site-footer school-footer">
    <div className="footer-container">
      <div className="footer-brand">
        <Link className="brand footer-platform-logo" to="/" aria-label="SmartSchool home"><img src="/smartschool-logo.svg" alt="" aria-hidden="true" /></Link>
        <p>A practical home for the people who run a school, teach a class, and help students grow.</p>
        <Link className="footer-start-link" to="/register">Set up your school <b aria-hidden="true">→</b></Link>
      </div>
      <div className="footer-column"><h4>SmartSchool</h4><Link to="/#services">Services</Link><Link to="/#portals">Portals</Link><Link to="/#about">About</Link></div>
      <div className="footer-column"><h4>Get started</h4><Link to="/register">Register school</Link><Link to="/#portals">Login</Link><Link to="/#pricing">Plans</Link><Link to="/#contact">Contact</Link></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} SmartSchool</span><span>School operations, connected.</span></div>
  </footer>
}
