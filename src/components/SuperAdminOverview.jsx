import {useState} from 'react'
const pending=[['Green Valley Academy','Nairobi, Kenya','Starter'],['Future Minds School','Mombasa, Kenya','Professional'],['Hilltop Learning Centre','Kisumu, Kenya','Starter']]
export default function SuperAdminOverview(){const [schools,setSchools]=useState(pending);const review=(name)=>setSchools(schools.filter(([school])=>school!==name));const regions = [
  { name: 'Nairobi Region', schools: 12, revenue: 'KSh 420,000', growth: '+12%' },
  { name: 'Mombasa Region', schools: 8, revenue: 'KSh 285,000', growth: '+5%' },
  { name: 'Western Region', schools: 5, revenue: 'KSh 150,000', growth: '+18%' }
]; return <><section className="admin-insight">
  <article className="revenue-card"><p>Platform revenue</p><h2>KSh 855,400 <span>+14.8%</span></h2><small>Monthly recurring revenue · September 2026</small><div className="revenue-line"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="revenue-labels"><span>Jan</span><span>Jun</span><span>Dec</span></div></article>
  <article className="health-card"><p>Platform health</p><div><span><i className="healthy"/>Active schools <b>25</b></span><span><i className="pending"/>Pending review <b>3</b></span><span><i className="paused"/>Suspended <b>1</b></span></div><button className="outline">Open platform report</button></article>
</section>

<section className="panel regional-panel" style={{marginBottom: '30px'}}>
  <div className="panel-title">
    <div>
      <p className="eyebrow">REGIONAL OVERVIEW</p>
      <h2>Multi-Campus Performance</h2>
    </div>
  </div>
  <div className="regional-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px'}}>
    {regions.map(r => (
      <div key={r.name} className="region-stat glass-card" style={{padding: '20px', borderLeft: '4px solid #2375e1'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px'}}>
          <b>{r.name}</b>
          <span className="badge" style={{background: 'var(--cream)', color: 'var(--green)', fontSize: '0.7rem'}}>{r.schools} Schools</span>
        </div>
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem'}}>
          <span style={{color: 'var(--muted)'}}>Revenue:</span>
          <b>{r.revenue}</b>
        </div>
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '5px'}}>
          <span style={{color: 'var(--muted)'}}>Monthly Growth:</span>
          <b style={{color: '#11966a'}}>{r.growth}</b>
        </div>
      </div>
    ))}
  </div>
</section><section className="panel approval-panel"><div className="panel-title"><div><p className="eyebrow">REQUIRES ATTENTION</p><h2>School registration approvals</h2><p>Review new school applications before activating access.</p></div><button className="outline">View all schools</button></div><div className="approval-list">{schools.length?schools.map(([name,location,plan])=><div key={name}><span className="school-mark">S</span><section><b>{name}</b><small>{location} · {plan} plan</small></section><button className="mini reject" onClick={()=>review(name)}>Reject</button><button className="mini accept" onClick={()=>review(name)}>Approve</button></div>):<p className="all-clear">All school applications are reviewed.</p>}</div></section><section className="admin-bottom"><article className="panel"><div className="panel-title"><div><h2>Subscription activity</h2><p>Plan distribution across schools</p></div></div><div className="plan-row"><span>Professional</span><i><b style={{width:'54%'}}/></i><strong>54%</strong></div><div className="plan-row"><span>Starter</span><i><b style={{width:'30%'}}/></i><strong>30%</strong></div><div className="plan-row"><span>Enterprise</span><i><b style={{width:'16%'}}/></i><strong>16%</strong></div></article><article className="panel"><div className="panel-title"><div><h2>Quick actions</h2><p>Common platform tasks</p></div></div><div className="quick-actions"><button>+ Add school</button><button>Manage plans</button><button>System announcement</button><button>Export payment report</button></div></article></section></>}
