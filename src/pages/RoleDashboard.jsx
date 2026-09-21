import {useEffect,useState} from 'react';import {useAuth} from '../context/AuthContext';import {useLanguage} from '../context/LanguageContext';import {Link, useNavigate} from 'react-router-dom';import {supabase} from '../lib/supabase';import ModulePanel from '../components/ModulePanel';import SuperAdminOverview from '../components/SuperAdminOverview';import Analytics from '../components/Analytics';import AIGuide from '../components/AI_Guide';import PerformanceSummary from '../components/PerformanceSummary';import BadgeSystem from '../components/BadgeSystem';import FinanceAI from '../components/FinanceAI';import CampusGeofence from '../components/CampusGeofence';import NotificationHub from '../components/NotificationHub';
const cfg={super_admin:{groups:[['Platform',['Dashboard','Schools','School approvals','School administrators','Users','Library','Quizzes','Courses']],['Billing',['Subscriptions','Payments','Revenue reports']],['Insights',['Analytics','Audit Trail','School reports','Student statistics','Teacher statistics','Subscription reports']],['System',['Plans & settings','System announcements']]],tables:{Dashboard:'schools',Schools:'schools','School approvals':'schools','School administrators':'profiles',Users:'profiles',Subscriptions:'subscriptions',Payments:'payments','Revenue reports':'payments','School reports':'schools','Student statistics':'students','Teacher statistics':'profiles','Subscription reports':'subscriptions','Plans & settings':'subscriptions','System announcements':'announcements',Quizzes:'quizzes','Audit Trail':'audit_logs',Courses:'courses'},stats:[['Total schools','12'],['Active schools','9'],['Pending schools','2'],['Suspended schools','1'],['Total students','4,826'],['Total teachers','318'],['Active subscriptions','8'],['Expiring soon','2']]},school_admin:{groups:[['Overview',['Dashboard','Analytics','Settings','Audit Trail']],['People',['Students','Student guardians','Teachers']],['Academics',['Classes','Subjects','Timetable','Class performance','Assignments','Exams','Results & report cards','Library','Quizzes','Courses']],['Operations',['Attendance','Behavior Log','Fees','Payments','Announcements','Messages','Events']]],tables:{Dashboard:'students',Students:'students','Student guardians':'student_guardians',Teachers:'profiles',Classes:'classes',Subjects:'subjects',Timetable:'timetable','Class performance':'results',Assignments:'assignments',Exams:'exams','Results & report cards':'results',Attendance:'attendance','Behavior Log':'behavior_records',Fees:'fees',Payments:'payments',Announcements:'announcements',Messages:'messages',Events:'events',Settings:'schools',Quizzes:'quizzes','Audit Trail':'audit_logs',Courses:'courses'},stats:[['Total students','1,248'],['Total teachers','86'],['Total classes','34'],['Total subjects','18'],["Today's attendance",'94.2%'],['Pending assignments','12'],['Upcoming exams','6'],['Outstanding fees','KSh 185k']]},teacher:{groups:[['Teaching',['Dashboard','My classes','My subjects','Timetable','Gradebook','Lesson Plans','Students','Class performance','Library','Quizzes','Course Builder']],['Work',['Take attendance','Behavior Log','Assignments','Submissions','Exams','Results','Meetings']],['Communication',['Messages','Announcements','Broadcast']]],tables:{Dashboard:'classes','My classes':'classes','My subjects':'subjects',Timetable:'timetable',Gradebook:'results','Lesson Plans':'lesson_plans',Students:'students','Class performance':'results','Take attendance':'attendance','Behavior Log':'behavior_records',Assignments:'assignments',Submissions:'submissions',Exams:'exams',Results:'results',Meetings:'meetings',Messages:'messages',Announcements:'announcements',Quizzes:'quizzes',Broadcast:'broadcasts','Course Builder':'courses'},stats:[['My classes','4'],['My subjects','5'],['Students','126'],["Today's classes",'3'],['Pending assignments','8'],['Upcoming exams','2'],['Recent messages','5']]},student:{groups:[['My learning',['Dashboard','My profile','My subjects','Lesson Plans','Timetable','Assignments','My submissions','Exams','My results','Library','Quizzes','My Courses']],['My school',['Attendance','Fees & payments','Announcements','Messages','Events']]],tables:{Dashboard:'assignments','My profile':'profiles','My subjects':'subjects','Lesson Plans':'lesson_plans',Timetable:'timetable',Assignments:'assignments','My submissions':'submissions',Exams:'exams','My results':'results',Attendance:'attendance','Fees & payments':'payments',Announcements:'announcements',Messages:'messages',Events:'events',Quizzes:'quizzes','My Courses':'courses'},stats:[['Attendance','85%'],['Recent grade','B+'],['Pending assignments','3'],['Upcoming exams','2'],['Outstanding fees','KSh 15k']]},parent:{groups:[['Family',['Dashboard','My children','Child subjects','Child attendance','Child assignments','Child exams','Child results','Child fees','Meetings','Library']],['Communication',['Announcements','Messages','Events']]],tables:{Dashboard:'students','My children':'students','Child subjects':'subjects','Child attendance':'attendance','Child assignments':'assignments','Child exams':'exams','Child results':'results','Child fees':'payments',Meetings:'meetings',Announcements:'announcements',Messages:'messages',Events:'events'},stats:[['Children','3'],['Attendance','91%'],['Average grade','B'],['Pending assignments','2'],['Balance due','KSh 15k']]}}
export default function RoleDashboard({role}){const {logout,profile,school,setProfile}=useAuth(),{lang, setLang, t}=useLanguage(),navigate=useNavigate(),settings=cfg[role],first=settings.groups[0][1][0],[selected,setSelected]=useState(first),[mobileOpen,setMobileOpen]=useState(false),[liveStats,setLiveStats]=useState(settings.stats),table=settings.tables[selected],canCreate=['school_admin','teacher','super_admin'].includes(role),[studentId,setStudentId]=useState(null),[notifOpen, setNotifOpen]=useState(false),[sidebarCollapsed, setSidebarCollapsed]=useState(false);

  const icons = {
    'Dashboard': '🏠', 'Schools': '🏢', 'Users': '👥', 'Billing': '💳', 'Payments': '💰',
    'Students': '🎓', 'Teachers': '👤', 'Classes': '🏫', 'Attendance': '📋', 'Assignments': '📚',
    'Exams': '📝', 'Results': '📊', 'Messages': '💬', 'Announcements': '🔔', 'Events': '📅',
    'Calendar': '🗓️', 'Timetable': '🕒', 'Library': '📖', 'Analytics': '📈', 'Settings': '⚙️',
    'Quizzes': '🧠', 'Gradebook': '📓', 'Meetings': '🤝', 'Broadcast': '📢', 'Behavior Log': '🌟',
    'Audit Trail': '🛡️', 'Course Builder': '🛠️', 'My Courses': '🎓', 'Courses': '📂',
    'My children': '🧒', 'Child subjects': '📚', 'Child attendance': '📋', 'Child assignments': '📖',
    'Child exams': '📝', 'Child results': '📊', 'Child fees': '💰', 'My classes': '🏫',
    'My subjects': '📚', 'Take attendance': '✅', 'Submissions': '📤', 'My profile': '👤',
    'My submissions': '📤', 'My results': '📊', 'Fees & payments': '💳', 'Lesson Plans': '📖'
  };

  const mainNavItems = settings.groups[0][1].slice(0, 4);

  useEffect(()=>{if(!profile?.school_id||role!=='school_admin'||!supabase)return;const load=async()=>{const tables=['students','profiles','classes','subjects'];const counts=await Promise.all(tables.map(table=>supabase.from(table).select('*',{count:'exact',head:true}).eq('school_id',profile.school_id)));setLiveStats(current=>current.map(([label,value],index)=>index<4?[label,counts[index].count??value]:[label,value]))};load()},[profile?.school_id,role]);

  useEffect(() => {
    if (school?.primary_color) document.documentElement.style.setProperty('--green', school.primary_color);
  }, [school]);

  useEffect(() => {
    const rolePrefix = role.split('_')[0];
    document.documentElement.setAttribute('data-role-theme', rolePrefix);
    return () => document.documentElement.removeAttribute('data-role-theme');
  }, [role]);

  useEffect(() => {
    if (!profile) return;
    if (role === 'student') {
        const load = async () => { if(supabase){ const { data } = await supabase.from('students').select('id').eq('profile_id', profile.id).maybeSingle(); if (data) setStudentId(data.id); } };
        load();
    } else if (role === 'parent') {
        setStudentId('ST-DEMO-1'); // Default for parent switcher
    }
  }, [profile, role]);

  const choose=item=>{
    if(item==='Messages')return navigate('/chat');
    if(item==='Events')return navigate('/calendar');
    if(item==='Timetable')return navigate('/timetable');
    if(item==='Gradebook')return navigate('/gradebook');
    if(item==='Meetings')return navigate('/meetings');
    if(item==='Broadcast')return navigate('/broadcast');
    if(item==='Library')return navigate('/library');
    if(item==='Lesson Plans')return navigate('/lessons');
    if(item==='Course Builder' || item==='My Courses' || item==='Courses')return navigate('/course-builder');
    if(item==='Quizzes')return navigate('/quizzes');
    if(item==='Settings')return navigate('/settings');
    if(item==='Security')return navigate('/security');
    if(item==='My Profile')return navigate('/profile');
    if(item==='Behavior Log')return navigate('/behavior-log');
    if(item==='Audit Trail')return navigate('/audit-trail');
    setSelected(item);setMobileOpen(false)
  };

  const portalTitle = role === 'school_admin' || role === 'super_admin' ? 'INSTITUTIONAL CONSOLE' : 'PERSONAL APP PORTAL';

return <div className="portal">
  <aside className={'side '+(mobileOpen?'mobile-open':'') + (sidebarCollapsed?' collapsed':'')}>
    <div className="side-header">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <Link className="brand light" to="/">{school?.logo_url ? <img src={school.logo_url} style={{height:'32px', marginRight:'10px'}} /> : null} <span>{school?.name || 'SmartSchool'}</span></Link>
        <button className="side-close-btn" onClick={() => setMobileOpen(false)}>×</button>
      </div>
      <p className="portal-label">{portalTitle}</p>
    </div>
    <div className="side-content">
      {settings.groups.map(([group,items])=><div className="nav-group" key={group}><small>{t(group.toLowerCase().replaceAll(' ', '_'))}</small>{items.map(item=><button className={item===selected?'active':''} onClick={()=>choose(item)} key={item} title={sidebarCollapsed ? t(item.toLowerCase().replaceAll(' ', '_')) : ''}>
        <i className="nav-icon">{icons[item] || '📁'}</i> <span>{t(item.toLowerCase().replaceAll(' ', '_'))}</span>
      </button>)}</div>)}
    </div>
    <button className="signout" onClick={logout}><i className="nav-icon">↪</i> <span>{t('logout')}</span></button>
  </aside>

  <nav className="mobile-bottom-nav">
    {mainNavItems.map(item => (
      <button key={item} className={item===selected?'active':''} onClick={() => choose(item)}>
        <i>{icons[item]}</i>
        <span>{t(item.toLowerCase().replaceAll(' ', '_'))}</span>
      </button>
    ))}
    <button onClick={() => setMobileOpen(true)}><i>☰</i><span>More</span></button>
  </nav>

  <main className="portal-main">
    <header className="main-header">
      <div className="header-left">
        <button className="menu-toggle-btn tactile-btn" onClick={() => setMobileOpen(true)}>☰</button>
        <button className="desktop-hamburger tactile-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>☰</button>
        <div className="title-stack">
          <p className="eyebrow">{school?.name || 'Institutional Access'}</p>
          <h1>{t(selected.toLowerCase().replaceAll(' ', '_'))}</h1>
        </div>
      </div>
      <div className="user-profile">
        <button className="notif-bell tactile-btn" onClick={() => setNotifOpen(true)}>🔔</button>
        <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}><option value="en">EN</option><option value="sw">SW</option></select>
        <div className="user-info"><b>{profile?.full_name||'Authorized User'}</b><small>{role.replace('_',' ')}</small></div>
        <div className="avatar">{profile?.full_name?.[0]||'U'}</div>
      </div>
    </header>

    <div className="content-area">
      {selected === 'Analytics' ? (
        <Analytics onBack={() => setSelected('Dashboard')} />
      ) : selected === 'Dashboard' ? (
        <>
          {role === 'parent' && (
            <div className="child-switch glass-card mini-switch">
              <b>{t('viewing_child')}:</b>
              <select onChange={e => setStudentId(e.target.value)}>
                <option value="ST-DEMO-1">Select Child</option>
              </select>
            </div>
          )}
          <section className="stats-grid">
            {liveStats.map(([label, value]) => (
              <article key={label} className="stat-card glass-card neumorph-flat">
                <p>{t(label.toLowerCase().replaceAll(' ', '_'))}</p>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
          <PerformanceSummary role={role} t={t} />
          {role === 'school_admin' && <FinanceAI />}
          {role === 'student' && <CampusGeofence />}
          {(role === 'student' || role === 'parent') && studentId && (
            <div className="quick-actions-bar page-transition">
                <Link to={`/report-card/${studentId}`} className="button blue-button tactile-btn">View Report Card 📊</Link>
            </div>
          )}
          <DashboardHighlights role={role} profile={profile} t={t} />
          {role === 'super_admin' ? <SuperAdminOverview /> : <ModulePanel table={table} profile={profile} canCreate={canCreate} superAdmin={false} studentId={studentId} />}
        </>
      ) : (
        <div className="module-view-container">
          <ModulePanel table={table} profile={profile} canCreate={canCreate} superAdmin={role === 'super_admin'} studentId={studentId} />
        </div>
      )}
    </div>
  </main>
  <AIGuide />
  <NotificationHub isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
</div>}

function DashboardHighlights({role,profile, t}){const [items,setItems]=useState([]),[pulse,setPulse]=useState('--');useEffect(()=>{if(!profile?.school_id||!supabase){setItems([]);return}const load=async()=>{const [announcements,assignments,results,attendance]=await Promise.all([supabase.from('announcements').select('title').eq('school_id',profile.school_id).order('created_at',{ascending:false}).limit(3),supabase.from('assignments').select('title').eq('school_id',profile.school_id).order('due_date').limit(3),supabase.from('results').select('id').eq('school_id',profile.school_id).limit(1),supabase.from('attendance').select('status').eq('school_id',profile.school_id).eq('attendance_date',new Date().toISOString().slice(0,10))]);const live=[...(announcements.data?.map(a=>a.title)||[]),...(assignments.data?.map(a=>a.title)||[])].slice(0,3);setItems(live);const present=attendance.data?.filter(row=>row.status==='present').length||0;setPulse(attendance.data?.length?`${Math.round((present/attendance.data.length)*100)}%`:'--')};load()},[role,profile?.school_id]);return <section className="dashboard-highlights"><div className="panel highlight-card glass-card neumorph-flat"><p className="eyebrow blue-eyebrow">RECENT</p><h2>{t('next_actions')}</h2>{items.length?items.map((item,index)=><div className="highlight-row" key={item}><i>0{index+1}</i><span>{item}</span><b>→</b></div>):<p style={{color:'var(--muted)'}}>All clear for today.</p>}</div><div className="panel pulse-card glass-card neumorph-flat"><p className="eyebrow blue-eyebrow">SCHOOL PULSE</p><h2>{t('attendance')}</h2><div className="pulse-ring">{pulse}</div><p>{pulse==='--'?'No attendance recorded':'Present today'}</p></div></section>}
