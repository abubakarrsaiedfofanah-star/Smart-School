import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../styles/staff-portals.css'

const portals = [
  { title: 'Academic leadership', icon: '▦', roles: ['principal', 'deputy_principal'], description: 'Oversee timetable planning, staff attendance, and academic delivery.', links: [['Timetable', '/timetable'], ['Staff attendance', '/staff-attendance']] },
  { title: 'Human resources', icon: '♙', roles: ['principal', 'hr_admin'], description: 'Manage staff records, recruitment, contracts, leave, and payroll approvals.', links: [['HR & Payroll', '/hr-payroll'], ['Staff attendance', '/staff-attendance']] },
  { title: 'Finance operations', icon: '¤', roles: ['principal', 'finance_officer'], description: 'Record expenses, review school payments, and reconcile provider statements.', links: [['Finance operations', '/finance-operations'], ['Payroll', '/hr-payroll']] },
  { title: 'Admissions', icon: '↗', roles: ['principal', 'deputy_principal', 'registrar'], description: 'Review applications and manage new student admissions.', links: [['Admissions workspace', '/admissions']] },
  { title: 'Library services', icon: '▤', roles: ['principal', 'librarian'], description: 'Manage learning resources and library access.', links: [['Open library', '/library']] },
  { title: 'Inventory & assets', icon: '▧', roles: ['principal', 'deputy_principal', 'inventory_manager', 'librarian'], description: 'View school equipment, assignments, condition, and value. Inventory managers maintain records.', links: [['Open inventory', '/inventory']] }
]

const plannedPortals = [
  ['Health services', 'Student health records and clinic workflows.'],
  ['Counselling & safeguarding', 'Restricted wellbeing cases and safeguarding follow-up.'],
  ['Transport operations', 'Routes, vehicles, drivers, and transport notices.'],
  ['Boarding & meals', 'Boarding house and meal planning workflows.']
]

export default function StaffPortals() {
  const { profile, staffRoles } = useAuth()
  const isAdmin = profile?.role === 'school_admin'
  const available = portals.filter(portal => isAdmin || portal.roles.some(role => staffRoles.includes(role)))

  return <main className="staff-portal-hub">
    <header className="staff-portal-hero">
      <div><p className="staff-portal-eyebrow">SCHOOL WORKSPACES</p><h1>Staff portal hub</h1><p>Separate workspaces for school responsibilities. You can open each portal assigned to your account.</p></div>
      {isAdmin && <Link className="staff-access-button" to="/staff-roles">Manage staff access <span aria-hidden="true">↗</span></Link>}
    </header>

    <section className="staff-portal-section" aria-labelledby="available-portals-title">
      <div className="staff-portal-section-head"><div><p className="staff-portal-eyebrow">ACTIVE WORKSPACES</p><h2 id="available-portals-title">Available portals</h2></div><span>{isAdmin ? 'School administrator access' : `${available.length} assigned`}</span></div>
      {available.length ? <div className="staff-portal-grid">{available.map(portal => <article className="staff-portal-card" key={portal.title}>
        <div className="staff-portal-card-top"><span className="staff-portal-icon" aria-hidden="true">{portal.icon}</span><span className="staff-portal-status">Available</span></div>
        <p className="staff-portal-roles">{portal.roles.filter(role => isAdmin || staffRoles.includes(role)).map(role => role.replaceAll('_', ' ')).join(' · ')}</p>
        <h3>{portal.title}</h3><p className="staff-portal-description">{portal.description}</p>
        <div className="staff-portal-links">{portal.links.map(([label, href]) => <Link className="staff-portal-link" key={href} to={href}>{label}<span aria-hidden="true">→</span></Link>)}</div>
      </article>)}</div> : <div className="staff-portal-empty"><span aria-hidden="true">◇</span><div><h3>No specialist portals assigned yet</h3><p>Your teacher workspace is still available. Ask the school administrator to grant you a staff responsibility to open HR, finance, admissions, or other specialist tools.</p></div></div>}
    </section>

    <section className="staff-portal-section planned-section" aria-labelledby="planned-portals-title">
      <div className="staff-portal-section-head"><div><p className="staff-portal-eyebrow">MORE SCHOOL SERVICES</p><h2 id="planned-portals-title">Additional portals</h2></div><span>Not available yet</span></div>
      <div className="staff-planned-grid">{plannedPortals.map(([title, description]) => <article className="staff-planned-card" key={title}><span aria-hidden="true">◌</span><div><h3>{title}</h3><p>{description}</p></div><small>Coming later</small></article>)}</div>
    </section>
  </main>
}
