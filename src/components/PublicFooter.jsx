import { Link } from 'react-router-dom'

export default function PublicFooter() {
  return <footer className="site-footer school-footer">
    <div className="footer-container">
      <div className="footer-brand">
        <Link className="brand" to="/">Smart<span>School</span></Link>
        <p>A practical home for the people who run a school, teach a class, and help students grow.</p>
        <Link className="footer-start-link" to="/register">Set up your school <b aria-hidden="true">→</b></Link>
      </div>
      <div className="footer-column"><h4>School system</h4><Link to="/features">School tools</Link><Link to="/portals">Role portals</Link><Link to="/#how-it-works">How it works</Link></div>
      <div className="footer-column"><h4>Get started</h4><Link to="/register">Register school</Link><Link to="/pricing">Plans</Link><Link to="/contact">Contact</Link></div>
      <div className="footer-column"><h4>Portal access</h4><Link to="/super-admin">Platform Admin</Link><Link to="/school-admin">School Admin</Link><Link to="/teacher">Teacher</Link><Link to="/student">Student</Link><Link to="/parent">Parent</Link></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} SmartSchool</span><span>School operations, connected.</span></div>
  </footer>
}
