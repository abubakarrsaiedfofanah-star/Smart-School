import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { roleRoute } from '../lib/roleRoute'
import toast from 'react-hot-toast'

const pages = {
  features: ['Features', 'Everything your school needs in one clear workspace.', ['Academic operations', 'Attendance and people', 'Finance and billing', 'Announcements and communication']],
  portals: ['Portals', 'A focused experience for every person in your school.', ['School Admin', 'Teacher', 'Student', 'Parent']],
  pricing: ['Pricing', 'Choose a plan that grows with your school.', ['Starter', 'Professional', 'Enterprise']],
  about: ['About SmartSchool', 'A calmer digital home for the work behind great learning.', ['One shared school picture', 'Secure role-based access', 'Simple tools for every team']],
  contact: ['Contact', 'We are ready to help your school get started.', ['Register your school', 'Ask about setup', 'Get product guidance']],
}

const links = [['Home', '/'], ['Features', '/features'], ['Portals', '/portals'], ['Pricing', '/pricing'], ['About', '/about'], ['Contact', '/contact']]

export default function PublicPage({ page }) {
  const [title, intro, items] = pages[page]
  const { login } = useAuth();
  const navigate = useNavigate();

  const enterDemo = async (role) => {
    const emailMap = {
      'School Admin': 'school@demo.com',
      'Teacher': 'teacher@demo.com',
      'Student': 'student@demo.com',
      'Parent': 'parent@demo.com'
    };
    try {
      const result = await login(emailMap[role], 'password');
      navigate(roleRoute(result.profile.role));
    } catch (e) {
      toast.error('Could not enter demo portal');
    }
  };

  return <div className="public-page">
    <header className="nav blue-nav sticky-nav">
      <Link className="brand" to="/">Smart<span>School</span></Link>
      <nav aria-label="Public navigation">
        {links.map(([label, path]) => <Link className={page===label.toLowerCase()?'active':''} to={path} key={label}>{label}</Link>)}
        <Link to="/login">Login</Link>
        <Link className="button small blue-button" to="/register" style={{marginLeft: '15px'}}>Register school</Link>
      </nav>
    </header>

    <main className="public-page-main">
      <p className="eyebrow blue-eyebrow">SMARTSCHOOL 3.0</p>
      <h1>{title}</h1>
      <p className="public-page-intro">{intro}</p>
      <div className="public-page-grid">{items.map((item, index) => <article key={item}><span>0{index+1}</span><h2>{item}</h2><p>Designed to keep your school connected, informed and moving forward.</p></article>)}</div>
      <Link className="button blue-button" to="/register">Register your school <b>→</b></Link>
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
          {links.map(([label,path])=><Link to={path} key={label}>{label}</Link>)}
        </div>
        <div className="footer-column">
          <h4>Legal</h4>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Security</a>
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
        <span>© 2026 SmartSchool Enterprise.</span>
      </div>
    </footer>
  </div>
}
