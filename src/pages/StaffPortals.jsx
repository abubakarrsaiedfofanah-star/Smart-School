import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const portals = [
  { title: 'Academic leadership', roles: ['principal', 'deputy_principal'], description: 'Manage the school timetable, review attendance, and oversee academic delivery.', links: [['Timetable', '/timetable'], ['Staff attendance', '/staff-attendance']] },
  { title: 'Human resources', roles: ['principal', 'hr_admin'], description: 'Manage employee records, recruitment, leave, contracts, and payroll workflows.', links: [['HR & Payroll', '/hr-payroll'], ['Staff attendance', '/staff-attendance']] },
  { title: 'Finance operations', roles: ['principal', 'finance_officer'], description: 'Record expenses, review payment reconciliation, and prepare payroll.', links: [['Expenses & reconciliation', '/finance-operations'], ['HR & Payroll', '/hr-payroll']] },
  { title: 'Admissions', roles: ['principal', 'registrar'], description: 'Review applications and manage the school admissions pipeline.', links: [['Admissions', '/admissions']] },
  { title: 'Library services', roles: ['principal', 'librarian'], description: 'Open learning resources and library tools available to the school.', links: [['Library', '/library']] },
  { title: 'Inventory & assets', roles: ['principal', 'inventory_manager', 'librarian'], description: 'View school assets; assigned inventory managers can create and update records.', links: [['Inventory', '/inventory']] }
]

export default function StaffPortals() {
  const { profile, staffRoles } = useAuth()
  const isAdmin = profile?.role === 'school_admin'
  const available = portals.filter(portal => isAdmin || portal.roles.some(role => staffRoles.includes(role)))
  return <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px' }}>
    <p className="eyebrow">Your school workspace</p><h1>Staff portal hub</h1>
    <p>Open a specialist workspace assigned to your account. Access is based on your school role assignments.</p>
    {!available.length ? <section className="panel" style={{ padding: 22, marginTop: 20 }}><h2>No specialist portals assigned</h2><p>Ask your school administrator to assign your school responsibilities. Your teaching tools remain available from the teacher portal.</p></section> : <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginTop: 24 }}>{available.map(portal => <article className="panel" key={portal.title} style={{ padding: 22 }}><p className="eyebrow">{portal.roles.filter(role => isAdmin || staffRoles.includes(role)).map(role => role.replaceAll('_', ' ')).join(' · ')}</p><h2>{portal.title}</h2><p>{portal.description}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{portal.links.map(([label, href]) => <Link key={href} className="button outline-button" to={href}>{label}</Link>)}</div></article>)}</section>}
    <section style={{ marginTop: 28 }}><h2>More specialist portals</h2><p>Student health, counselling and safeguarding, transport, and boarding workflows can be added as separate permission-controlled portals when their school processes and records are ready.</p></section>
  </main>
}
