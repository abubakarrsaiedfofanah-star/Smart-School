import {useEffect,useState} from 'react';import {useAuth} from '../context/AuthContext';import {useLanguage} from '../context/LanguageContext';import {Link, useNavigate, useSearchParams} from 'react-router-dom';import {supabase} from '../lib/supabase';import ModulePanel from '../components/ModulePanel';import SuperAdminOverview from '../components/SuperAdminOverview';import Analytics from '../components/Analytics';import NotificationHub from '../components/NotificationHub';


import SchoolSetupChecklist from '../components/SchoolSetupChecklist';
import PlatformManagement from '../components/PlatformManagement';
import { lazy, Suspense } from 'react'
import { accessibleBrandColor, normalizeBrandColor } from '../lib/brandColor';
import { formatCurrency } from '../lib/formatters';
const TeacherAttendance = lazy(() => import('./TeacherAttendance'))
const cfg={super_admin:{groups:[['Platform',['Dashboard','Schools','School approvals','School administrators','Users','Library','Quizzes','Courses']],['Billing',['Subscriptions','Payments','Revenue reports']],['Insights',['Analytics','Audit Trail','School reports','Student statistics','Teacher statistics','Subscription reports']],['System',['Plans & settings','System announcements']]],tables:{Dashboard:'schools',Schools:'schools','School approvals':'schools','School administrators':'profiles',Users:'profiles',Subscriptions:'subscriptions',Payments:'payments','Revenue reports':'payments','School reports':'schools','Student statistics':'students','Teacher statistics':'profiles','Subscription reports':'subscriptions','Plans & settings':'subscriptions','System announcements':'announcements',Quizzes:'quizzes','Audit Trail':'audit_logs',Courses:'courses'},stats:[['Total schools','—'],['Active schools','—'],['Pending schools','—'],['Suspended schools','—'],['Total students','—'],['Total teachers','—'],['Active subscriptions','—'],['Expiring soon','—']]},school_admin:{groups:[['Admin features',['Dashboard','Analytics','Audit Trail']],['People',['Students','Student guardians','Teachers','Portal accounts']],['Academics',['Classes','Subjects','Timetable','Class performance','Assignments','Exams','Results & report cards','Library','Quizzes','Courses']],['Operations',['Attendance','Behavior Log','Fees','Payments','Announcements','Messages','Events']]],tables:{Dashboard:'students',Students:'students','Student guardians':'student_guardians',Teachers:'profiles','Portal accounts':'profiles',Classes:'classes',Subjects:'subjects',Timetable:'timetable','Class performance':'results',Assignments:'assignments',Exams:'exams','Results & report cards':'results',Attendance:'attendance','Behavior Log':'behavior_records',Fees:'fees',Payments:'payments',Announcements:'announcements',Messages:'messages',Events:'events',Settings:'schools',Quizzes:'quizzes','Audit Trail':'audit_logs',Courses:'courses'},stats:[['Total students','—'],['Total teachers','—'],['Total classes','—'],['Total subjects','—'],["Attendance entries today",'—'],['Pending assignments','—'],['Upcoming exams','—'],['Pending payments','—']]},teacher:{groups:[['Teaching',['Dashboard','My classes','My subjects','Timetable','Gradebook','Lesson Plans','Students','Class performance','Library','Quizzes','Course Builder']],['Work',['Take attendance','Behavior Log','Assignments','Submissions','Exams','Results','Meetings']],['Communication',['Messages','Announcements']]],tables:{Dashboard:'classes','My classes':'classes','My subjects':'subjects',Timetable:'timetable',Gradebook:'results','Lesson Plans':'lesson_plans',Students:'students','Class performance':'results','Take attendance':'attendance','Behavior Log':'behavior_records',Assignments:'assignments',Submissions:'submissions',Exams:'exams',Results:'results',Meetings:'meetings',Messages:'messages',Announcements:'announcements',Quizzes:'quizzes','Course Builder':'courses'},stats:[['Classes taught','—'],['Subjects taught','—'],['Students in my classes','—'],["Attendance entries today",'—'],['Assignments created','—'],['Upcoming exams','—'],['Messages for me','—']]},student:{groups:[['My learning',['Dashboard','My profile','My subjects','Lesson Plans','Timetable','Assignments','My submissions','Exams','My results','Library','Quizzes','My Courses']],['My school',['Attendance','Fees & payments','Announcements','Messages','Events']]],tables:{Dashboard:'assignments','My profile':'profiles','My subjects':'subjects','Lesson Plans':'lesson_plans',Timetable:'timetable',Assignments:'assignments','My submissions':'submissions',Exams:'exams','My results':'results',Attendance:'attendance','Fees & payments':'payments',Announcements:'announcements',Messages:'messages',Events:'events',Quizzes:'quizzes','My Courses':'courses'},stats:[['Attendance','—'],['Results posted','—'],['Pending assignments','—'],['Upcoming exams','—'],['Pending payments','—']]},parent:{groups:[['Family',['Dashboard','My children','Child subjects','Child attendance','Child assignments','Child exams','Child results','Child fees','Meetings','Library']],['Communication',['Announcements','Messages','Events']]],tables:{Dashboard:'students','My children':'students','Child subjects':'subjects','Child attendance':'attendance','Child assignments':'assignments','Child exams':'exams','Child results':'results','Child fees':'payments',Meetings:'meetings',Announcements:'announcements',Messages:'messages',Events:'events'},stats:[['Children','—'],['Attendance entries','—'],['Results posted','—'],['Class assignments','—'],['Pending payments','—']]}}
export default function RoleDashboard({role, embedded = false}){const {logout,profile,school,setProfile,demo,staffRoles}=useAuth(),{lang, setLang, t}=useLanguage(),navigate=useNavigate(),settings=cfg[role],first=settings.groups[0][1][0],[searchParams,setSearchParams]=useSearchParams(),[selected,setSelected]=useState(()=>searchParams.get("module")||first),[mobileOpen,setMobileOpen]=useState(false),[liveStats,setLiveStats]=useState(()=>settings.stats.map(([label])=>[label,'—'])),[statsState,setStatsState]=useState(demo?'unavailable':'loading'),table=settings.tables[selected],[studentId,setStudentId]=useState(null),[parentChildren,setParentChildren]=useState([]),[notifOpen, setNotifOpen]=useState(false),[sidebarCollapsed,setSidebarCollapsed]=useState(false);

  useEffect(() => {
    const closeMenu = event => { if (event.key === 'Escape') setMobileOpen(false) };
    window.addEventListener('keydown', closeMenu);
    return () => window.removeEventListener('keydown', closeMenu);
  }, []);

  const icons = {
    Dashboard: '\u2302', Schools: '\u25a3', Users: '\u263a', Billing: '$', Payments: '$',
    Students: '\u25c9', Teachers: '\u263a', Classes: '\u25a6', Attendance: '\u2713', Assignments: '\u25a4',
    Exams: '\u25a4', Results: '\u25a5', Messages: '\u2709', Announcements: '\u25cf', Events: '\u25a6',
    Calendar: '\u25a6', Timetable: '\u25f7', Library: '\u25a7', Analytics: '\u25ce', Settings: '\u2699',
    Quizzes: '?', Gradebook: '\u25a5', Meetings: '\u25f7', 'Behavior Log': '\u2605',
    'Audit Trail': '\u2261', 'Course Builder': '\u25a6', 'My Courses': '\u25a6', Courses: '\u25a6',
    'My children': '\u263a', 'Child subjects': '\u25a4', 'Child attendance': '\u2713', 'Child assignments': '\u25a4',
    'Child exams': '\u25a4', 'Child results': '\u25a5', 'Child fees': '$', 'My classes': '\u25a6',
    'My subjects': '\u25a4', 'Take attendance': '\u2713', Submissions: '\u25a4', 'My profile': '\u263a',
    'My submissions': '\u25a4', 'My results': '\u25a5', 'Fees & payments': '$', 'Lesson Plans': '\u25a4', 'Staff portals': '\u25c8', 'Staff portal hub': '\u25c8', 'HR & Payroll': '\u25a4', 'Finance operations': '$', Admissions: '\u2197', 'Inventory & assets': '\u25a7'
  };

  const displayLabel = value => {
    const key = value.toLowerCase().replaceAll(' ', '_')
    const translated = t(key)
    return translated === key ? value : translated
  }
  const bottomNavLabel = item => item === 'School approvals' ? 'Approvals' : item === 'School administrators' ? 'School admins' : displayLabel(item)
  const specialistLabels = [...new Set([
    ...(staffRoles.some(item => ['principal', 'deputy_principal', 'hr_admin'].includes(item)) ? ['Staff attendance'] : []),
    ...(staffRoles.some(item => ['principal', 'hr_admin'].includes(item)) ? ['HR & Payroll'] : []),
    ...(staffRoles.some(item => ['principal', 'finance_officer'].includes(item)) ? ['Finance operations'] : []),
    ...(staffRoles.some(item => ['principal', 'deputy_principal', 'registrar'].includes(item)) ? ['Admissions'] : []),
    ...(staffRoles.some(item => ['principal', 'deputy_principal', 'inventory_manager', 'librarian'].includes(item)) ? ['Inventory & assets'] : [])
  ])]
  const navGroups = role === 'teacher'
    ? settings.groups.map(([group, items]) => group === 'Work' ? [group, [...items, ...specialistLabels]] : [group, items])
    : settings.groups
  useEffect(() => {
    const allowedModules = new Set(navGroups.flatMap(([, items]) => items))
    if (!allowedModules.has(selected)) {
      setSelected(first)
      setSearchParams({})
    }
  }, [first, navGroups, selected, setSearchParams])
  const mainNavItems = role === 'super_admin' ? ['Dashboard', 'Schools', 'School approvals'] : settings.groups[0][1].slice(0, 3)
  const settingsDestination = role === 'school_admin' ? '/settings' : role === 'super_admin' ? '/security' : '/profile';

  useEffect(() => {
    if (demo) { setLiveStats(settings.stats.map(([label]) => [label, '—'])); setStatsState('unavailable'); return; }
    if (!supabase || !profile) { setStatsState('unavailable'); return; }
    let cancelled = false;
    setStatsState('loading');
    const count = async (table, filters = []) => {
      let query = supabase.from(table).select('*', { count: 'exact', head: true });
      for (const [column, operator, value] of filters) query = query[operator](column, value);
      const { count: total, error } = await query;
      if (error) throw error;
      return total ?? 0;
    };
    const sum = async (table, column, filters = []) => {
      let query = supabase.from(table).select(column);
      for (const [filterColumn, operator, value] of filters) query = query[operator](filterColumn, value);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).reduce((total, row) => total + (Number(row[column]) || 0), 0);
    };
    const money = amount => formatCurrency(amount, school?.currency_code || 'KES', lang);
    const schoolFilter = profile.school_id ? [['school_id', 'eq', profile.school_id]] : [];
    const load = async () => {
      try {
        let values;
        if (role === 'super_admin') {
          const { data, error } = await supabase.rpc('platform_dashboard_counts');
          if (error) throw error;
          values = [data.schools, data.active_schools, data.pending_schools, data.suspended_schools, data.students, data.teachers, data.active_subscriptions, data.expiring_soon];
        } else if (role === 'school_admin') {
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: school?.timezone || 'Africa/Nairobi' }).format(new Date());
          const [students, teachers, classes, subjects, present, late, attendanceRecords, assignments, exams, pendingPayments] = await Promise.all([
            count('students', schoolFilter), count('profiles', [...schoolFilter, ['role', 'eq', 'teacher']]), count('classes', schoolFilter), count('subjects', schoolFilter),
            count('attendance', [...schoolFilter, ['attendance_date', 'eq', today], ['status', 'eq', 'present']]), count('attendance', [...schoolFilter, ['attendance_date', 'eq', today], ['status', 'eq', 'late']]), count('attendance', [...schoolFilter, ['attendance_date', 'eq', today]]), count('assignments', [...schoolFilter, ['due_date', 'gte', today]]),
            count('exams', [...schoolFilter, ['exam_date', 'gte', today]]), sum('payments', 'amount', [...schoolFilter, ['status', 'eq', 'pending']])
          ]);
          const attendanceRate = attendanceRecords ? `${(((present + late) / attendanceRecords) * 100).toFixed(1)}%` : '—';
          values = [students, teachers, classes, subjects, attendanceRate, assignments, exams, money(pendingPayments)];
        } else if (role === 'teacher') {
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: school?.timezone || 'Africa/Nairobi' }).format(new Date());
          const [classResult, subjectResult] = await Promise.all([
            supabase.from('classes').select('id').eq('school_id', profile.school_id).eq('teacher_id', profile.id),
            supabase.from('teacher_subject_assignments').select('class_id,subject_id').eq('school_id', profile.school_id).eq('teacher_id', profile.id)
          ]);
          if (classResult.error || subjectResult.error) throw classResult.error || subjectResult.error;
          const assignedRows = subjectResult.data || [];
          const classIds = [...new Set([...(classResult.data || []).map(item => item.id), ...assignedRows.map(item => item.class_id)])];
          const subjectsTaught = new Set(assignedRows.map(item => item.subject_id).filter(Boolean)).size;
          const [assignments, attendance, subjects, students, exams, messages] = await Promise.all([
            count('assignments', [...schoolFilter, ['created_by', 'eq', profile.id]]),
            count('attendance', [...schoolFilter, ['recorded_by', 'eq', profile.id], ['attendance_date', 'eq', today]]),
            Promise.resolve(subjectsTaught),
            classIds.length ? count('students', [...schoolFilter, ['class_id', 'in', classIds]]) : Promise.resolve(0),
            count('exams', [...schoolFilter, ['exam_date', 'gte', today]]),
            count('messages', [...schoolFilter, ['recipient_id', 'eq', profile.id]])
          ]);
          values = [classIds.length, subjects, students, attendance, assignments, exams, messages];
        } else if (role === 'student') {
          const { data: student, error } = await supabase.from('students').select('id,class_id').eq('profile_id', profile.id).maybeSingle();
          if (error) throw error;
          if (!student) values = [0, 0, 0, 0, 0];
          else {
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: school?.timezone || 'Africa/Nairobi' }).format(new Date());
            const studentFilter = [...schoolFilter, ['student_id', 'eq', student.id]];
            const [attendanceRows, results, assignments, pendingPayments] = await Promise.all([
              supabase.from('attendance').select('status').eq('school_id', profile.school_id).eq('student_id', student.id),
              count('results', studentFilter),
              student.class_id ? supabase.from('assignments').select('id').eq('school_id', profile.school_id).eq('class_id', student.class_id).gte('due_date', today) : Promise.resolve({ data: [], error: null }),
              sum('payments', 'amount', [...schoolFilter, ['student_id', 'eq', student.id], ['status', 'eq', 'pending']])
            ]);
            if (attendanceRows.error) throw attendanceRows.error;
            if (assignments.error) throw assignments.error;
            const assignmentIds = (assignments.data || []).map(item => item.id);
            const submissions = assignmentIds.length ? await supabase.from('submissions').select('assignment_id').eq('student_id', student.id).in('assignment_id', assignmentIds) : { data: [], error: null };
            if (submissions.error) throw submissions.error;
            const submittedIds = new Set((submissions.data || []).map(item => item.assignment_id));
            const attendance = attendanceRows.data || [];
            const attendanceRate = attendance.length ? `${((attendance.filter(item => item.status === 'present' || item.status === 'late').length / attendance.length) * 100).toFixed(1)}%` : '—';
            values = [attendanceRate, results, assignmentIds.filter(id => !submittedIds.has(id)).length, student.class_id ? await count('exams', [...schoolFilter, ['class_id', 'eq', student.class_id], ['exam_date', 'gte', today]]) : 0, money(pendingPayments)];
          }
        } else {
          const { data: links, error } = await supabase.from('student_guardians').select('student_id').eq('guardian_id', profile.id);
          if (error) throw error;
          const childIds = (links || []).map(item => item.student_id);
          const { data: children, error: childError } = childIds.length ? await supabase.from('students').select('id,class_id').eq('school_id', profile.school_id).in('id', childIds) : { data: [], error: null };
          if (childError) throw childError;
          const selectedChild = (children || []).find(child => child.id === studentId) || children?.[0];
          const [attendance, results, assignments, payments] = selectedChild ? await Promise.all([
            count('attendance', [...schoolFilter, ['student_id', 'eq', selectedChild.id]]), count('results', [...schoolFilter, ['student_id', 'eq', selectedChild.id]]),
            selectedChild.class_id ? count('assignments', [...schoolFilter, ['class_id', 'eq', selectedChild.class_id]]) : Promise.resolve(0),
            sum('payments', 'amount', [...schoolFilter, ['student_id', 'eq', selectedChild.id], ['status', 'eq', 'pending']])
          ]) : [0, 0, 0, 0];
          values = [childIds.length, attendance, results, assignments, money(payments)];
        }
        if (!cancelled) { setLiveStats(settings.stats.map(([label], index) => [label, values[index] ?? '—'])); setStatsState('ready'); }
      } catch (error) {
        console.error('Unable to load dashboard metrics:', error.message);
        if (!cancelled) { setLiveStats(settings.stats.map(([label]) => [label, '—'])); setStatsState('error'); }
      }
    };
    load();
    return () => { cancelled = true };
  }, [profile?.id, profile?.school_id, role, demo, studentId, school?.timezone, school?.currency_code]);

  useEffect(() => {
    if (school?.primary_color) document.documentElement.style.setProperty('--green', school.primary_color);
  }, [school]);

  useEffect(() => {
    const rolePrefix = role.split('_')[0];
    document.documentElement.setAttribute('data-role-theme', rolePrefix);
    return () => document.documentElement.removeAttribute('data-role-theme');
  }, [role]);
  useEffect(() => { setSelected(searchParams.get('module') || first) }, [searchParams, first]);

  useEffect(() => {
    if (!profile) return;
    if (role === 'student') {
        if (demo) { setStudentId(null); return; }
        const load = async () => { if(supabase){ const { data } = await supabase.from('students').select('id').eq('profile_id', profile.id).maybeSingle(); if (data) setStudentId(data.id); } };
        load();
    } else if (role === 'parent') {
      const loadChildren = async () => {
        if (demo) {
          setParentChildren([]);
          setStudentId(null);
          return;
        }
        if (!supabase || !profile.school_id) return;
        const { data: links, error } = await supabase.from('student_guardians').select('student_id').eq('guardian_id', profile.id);
        if (error) { console.error('Unable to load linked learners:', error.message); return; }
        const ids = (links || []).map(link => link.student_id);
        if (!ids.length) { setParentChildren([]); setStudentId(null); return; }
        const { data: children, error: childError } = await supabase.from('students').select('id,profile_id,admission_number,full_name,class_id').eq('school_id', profile.school_id).in('id', ids);
        if (childError) { console.error('Unable to load learner profiles:', childError.message); return; }
        const profileIds = (children || []).map(child => child.profile_id).filter(Boolean);
        const classIds = [...new Set((children || []).map(child => child.class_id).filter(Boolean))];
        const [{ data: childProfiles }, { data: childClasses }] = await Promise.all([
          profileIds.length ? supabase.from('profiles').select('id,full_name').in('id', profileIds) : Promise.resolve({ data: [] }),
          classIds.length ? supabase.from('classes').select('id,name,grade').eq('school_id', profile.school_id).in('id', classIds) : Promise.resolve({ data: [] })
        ]);
        const names = new Map((childProfiles || []).map(item => [item.id, item.full_name]));
        const classNames = new Map((childClasses || []).map(item => [item.id, `${item.name}${item.grade && item.grade !== item.name ? ` · ${item.grade}` : ''}`]));
        const linked = (children || []).map(child => ({ ...child, name: names.get(child.profile_id) || child.full_name || child.admission_number || 'Learner', className: classNames.get(child.class_id) || 'Class not assigned' }));
        setParentChildren(linked);
        setStudentId(current => linked.some(child => child.id === current) ? current : linked[0]?.id || null);
      };
      loadChildren();
    }
  }, [profile, role, demo]);

  const openPage = path => { setMobileOpen(false); navigate(path); };
  const choose=item=>{
    const destinations = {'Messages':'/chat','Portal accounts':'/school-accounts','Events':'/calendar','Timetable':'/timetable','Gradebook':'/gradebook','Meetings':'/meetings','Library':'/library','Lesson Plans':'/lessons','Course Builder':'/course-builder','My Courses':'/course-builder','Courses':'/course-builder','Quizzes':'/quizzes','Settings':'/settings','Security':'/security','My Profile':'/profile','Behavior Log':'/behavior-log','Audit Trail':'/audit-trail','Staff portals':'/staff-portals','Staff portal hub':'/staff-portals','HR & Payroll':'/hr-payroll','Finance operations':'/finance-operations','Admissions':'/admissions','Inventory & assets':'/inventory','Staff attendance':'/staff-attendance'};
    if (destinations[item]) return openPage(destinations[item]);
    setSelected(item);setSearchParams(item==="Dashboard"?{}:{module:item});setMobileOpen(false)
  };

  const portalTitle = role === 'school_admin' || role === 'super_admin' ? 'INSTITUTIONAL CONSOLE' : 'PERSONAL APP PORTAL';

const accent=normalizeBrandColor(school?.primary_color);
return <div className={`portal${embedded ? ' portal-embedded' : ''}`} style={{'--school-accent':accent,'--school-accent-strong':accessibleBrandColor(accent),'--green':accent}}>
  <aside className={'side '+(mobileOpen?'mobile-open':'') + (sidebarCollapsed?' collapsed':'')}>
    <div className="side-header">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <Link className="brand light" to="/">{role === 'super_admin' ? <img src="/smartschool-mark.svg" alt="SmartSchool logo" style={{height:'32px', width:'32px', padding:'2px', marginRight:'10px', background:'#fff', borderRadius:'6px'}} /> : school?.logo_url ? <img src={school.logo_url} alt={`${school.name} logo`} style={{height:'32px', width:'32px', marginRight:'10px', objectFit:'contain'}} /> : null}<span>{school?.name || 'SmartSchool'}</span></Link>
        <button className="side-close-btn" aria-label="Close dashboard menu" onClick={() => setMobileOpen(false)}>{'\u00d7'}</button>
      </div>
      <p className="portal-label">{portalTitle}</p>
    </div>
    <div className="side-content">
      {navGroups.map(([group,items])=><div className="nav-group" key={group}><small>{displayLabel(group)}</small>{items.map(item=><button className={item===selected?'active':''} onClick={()=>choose(item)} key={item} title={sidebarCollapsed ? displayLabel(item) : ''}>
        <i className="nav-icon">{icons[item] || '\u25a6'}</i> <span>{displayLabel(item)}</span>
      </button>)}</div>)}
    </div>
    <button className="sidebar-settings" onClick={() => openPage(settingsDestination)} title={sidebarCollapsed ? 'Settings' : undefined}><i className="nav-icon">{icons.Settings}</i> <span>Settings</span></button>
    <button className="signout" onClick={logout}><i className="nav-icon">&#8618;</i> <span>{t('logout')}</span></button>
  </aside>

  {mobileOpen && <button className="menu-scrim" type="button" aria-label="Close dashboard menu" onClick={() => setMobileOpen(false)} />}

  <nav className="mobile-bottom-nav">
    {mainNavItems.map(item => (
      <button key={item} className={item===selected?'active':''} onClick={() => choose(item)}>
        <i>{icons[item]}</i>
        <span>{bottomNavLabel(item)}</span>
      </button>
    ))}
    <button onClick={() => setMobileOpen(true)}><i>&#9776;</i><span>More</span></button>
  </nav>

  <main className="portal-main">
    <header className="main-header">
      <div className="header-left">
        <button className="menu-toggle-btn tactile-btn" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-label="Open navigation">&#9776;</button>
        <button className="desktop-hamburger tactile-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label="Toggle sidebar">&#9776;</button>
        <div className="title-stack">
          <p className="eyebrow">{school?.name || 'Institutional Access'}</p>
          <h1>{displayLabel(selected)}</h1>
        </div>
      </div>
      <div className="user-profile">
        <button className="notif-bell tactile-btn" onClick={() => setNotifOpen(true)} aria-label="Notifications">&#8226;</button>
        <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}><option value="en">EN</option><option value="sw">SW</option></select>
        <div className="user-info"><b>{profile?.full_name||'Authorized User'}</b><small>{role.replace('_',' ')}</small></div>
        <div className="avatar">{profile?.full_name?.[0]||'U'}</div>
      </div>
      <div className="mobile-user-summary"><span className="mobile-user-summary-avatar">{profile?.full_name?.[0]||'U'}</span><span><b>{profile?.full_name || 'Authorized User'}</b><small>{role.replace('_',' ')}</small></span></div>
    </header>

    <div className="content-area">
      {role === 'super_admin' && ['Schools', 'School approvals', 'Subscriptions'].includes(selected) ? (
        <PlatformManagement view={selected} />
      ) : selected === 'Analytics' && ['school_admin', 'super_admin'].includes(role) ? (
        <Analytics onBack={() => setSelected('Dashboard')} />
      ) : selected === 'Analytics' ? (
        <section className="portal-access-denied" role="alert"><h2>Analytics access is restricted</h2><p>This dashboard is not assigned to your school role.</p></section>
      ) : selected === 'Take attendance' && role === 'teacher' ? (
        <Suspense fallback={<div className="portal-loading" role="status"><div className="spinner" />Loading attendance…</div>}><TeacherAttendance /></Suspense>
      ) : selected === 'Dashboard' ? (
        <>
          {role === 'school_admin' && <SchoolSetupChecklist />}
          {role === 'parent' && (
            <div className="child-switch glass-card mini-switch">
              <b>{t('viewing_child')}:</b>
              <select value={studentId || ''} onChange={e => setStudentId(e.target.value || null)} aria-label="Choose a learner">
                {!parentChildren.length && <option value="">No learners linked to this account</option>}
                {parentChildren.map(child => <option value={child.id} key={child.id}>{child.name} · {child.className}</option>)}
              </select>
              {!!parentChildren.length && <small>Each page shows information for the selected child.</small>}
            </div>
          )}
          {demo && <div className="dashboard-data-note" role="status">Demo account · connect a school to load records.</div>}
          {statsState === 'error' && <div className="dashboard-data-note dashboard-data-note-error" role="status">Dashboard figures could not load. Refresh the page or check your connection.</div>}
          <DashboardIntro role={role} name={profile?.full_name} schoolName={school?.name} timezone={school?.timezone || 'Africa/Nairobi'} />
          <section className={`stats-grid ${statsState === 'loading' ? 'stats-loading' : ''}`} aria-label="Dashboard overview" aria-busy={statsState === 'loading'}>
            {liveStats.map(([label, value]) => (
              <article key={label} className="stat-card glass-card neumorph-flat">
                <p>{displayLabel(label)}</p>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
          {(role === 'student' || role === 'parent') && studentId && (
            <div className="quick-actions-bar page-transition">
                <Link to={`/report-card/${studentId}`} className="button blue-button tactile-btn">View Report Card </Link>
            </div>
          )}
          <DashboardQuickActions role={role} studentId={studentId} onSelect={choose} />
          <DashboardHighlights role={role} profile={profile} timezone={school?.timezone || 'Africa/Nairobi'} studentId={studentId} />
          {role === 'super_admin' && <SuperAdminOverview />}
        </>
      ) : (
        <div className="module-view-container">
          {role === 'parent' && <div className="child-switch glass-card mini-switch">
            <b>{t('viewing_child')}:</b>
            <select value={studentId || ''} onChange={event => setStudentId(event.target.value || null)} aria-label="Choose a learner">
              {!parentChildren.length && <option value="">No learners linked to this account</option>}
              {parentChildren.map(child => <option value={child.id} key={child.id}>{child.name} · {child.className}</option>)}
            </select>
            {!!parentChildren.length && <small>Records below belong to the selected child.</small>}
          </div>}
          <ModulePanel table={table} profile={profile} superAdmin={role === 'super_admin'} studentId={studentId} />
        </div>
      )}
    </div>
  </main>
  <NotificationHub isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
</div>}

function DashboardIntro({ role, name, schoolName, timezone }) {
  const firstName = name?.trim().split(/\s+/)[0] || 'there'
  const titles = {
    super_admin: 'Platform overview', school_admin: 'School overview',
    student: 'Your learning at a glance', parent: 'Your family’s school update'
  }
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date())
  return <section className={`dashboard-intro dashboard-intro-${role}`}>
    <div><p className="eyebrow">{role === 'teacher' ? 'TEACHER WORKSPACE' : schoolName || (role === 'super_admin' ? 'SMARTSCHOOL PLATFORM' : 'SCHOOL PORTAL')}</p><h2>{role === 'super_admin' ? titles[role] : role === 'teacher' ? `Your teaching day, ${firstName}` : `Good day, ${firstName}`}</h2></div>
    <div className="dashboard-intro-date"><span aria-hidden="true">◷</span><div><small>TODAY</small><b>{date}</b></div></div>
  </section>
}

function DashboardQuickActions({ role, studentId, onSelect }) {
  const actions = {
    super_admin: [['Schools', 'Manage school accounts', '▦', 'select'], ['School approvals', 'Review new applications', '✓', 'select'], ['Analytics', 'Explore platform trends', '↗', 'select'], ['Security', 'Review access settings', '◇', '/security']],
    school_admin: [['Students', 'Open learner records', '♧', 'select'], ['Teachers', 'Manage staff accounts', '♙', 'select'], ['Timetable', 'View or edit the schedule', '◷', '/timetable'], ['School accounts', 'Manage school access', '＋', '/school-accounts']],
    teacher: [['My classes', 'Open your assigned classes', '▦', 'select'], ['Take attendance', 'Record today’s attendance', '✓', 'select'], ['Assignments', 'Create work and review submissions', '✎', '/teacher-assignments'], ['Gradebook', 'Review marks and class results', '▤', '/gradebook'], ['Timetable', 'See your classes for the week', '◷', '/timetable'], ['Lesson plans', 'Prepare and organize lessons', '◈', '/lessons']],
    student: [['Timetable', 'See your lessons', '◷', '/timetable'], ['Assignments', 'Open classwork', '✎', 'select'], ['Quizzes', 'Practice and revise', '◇', '/quizzes'], ['My results', 'View your report card', '▤', studentId ? `/report-card/${studentId}` : 'select']],
    parent: [['Timetable', 'See your learner’s schedule', '◷', '/timetable'], ['Meetings', 'Connect with school staff', '▣', '/meetings'], ['Messages', 'Open school messages', '✉', '/chat'], ['Child fees', 'Review payments and balances', '¤', 'select']]
  }
  return <section className="dashboard-actions-section"><div className="dashboard-section-heading"><div><p className="eyebrow">{role === 'teacher' ? 'YOUR CLASSROOM' : 'SHORTCUTS'}</p><h2>{role === 'teacher' ? 'Teaching tools' : 'Quick actions'}</h2></div></div><div className={`dashboard-quick-actions ${role === 'teacher' ? 'teacher-actions' : ''}`}>
    {(actions[role] || []).map(([title, description, icon, target]) => target === 'select' ? <button type="button" className="dashboard-action-card" key={title} onClick={() => onSelect(title)}><i>{icon}</i><span><b>{title}</b><small>{description}</small></span><em aria-hidden="true">↗</em></button> : <Link className="dashboard-action-card" key={title} to={target}><i>{icon}</i><span><b>{title}</b><small>{description}</small></span><em aria-hidden="true">↗</em></Link>)}
  </div></section>
}

function DashboardHighlights({ role, profile, timezone, studentId }) {
  const [notices, setNotices] = useState([])
  const [assignments, setAssignments] = useState([])
  const [pulse, setPulse] = useState('—')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!supabase || !profile?.school_id || role === 'super_admin') { setLoading(false); return }
      setLoading(true)
      try {
        const schoolId = profile.school_id
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
        const noticeRequest = supabase.from('announcements').select('id,title,created_at').eq('school_id', schoolId).order('created_at', { ascending: false }).limit(3)
      let classIds = []
        let studentIds = []
        if (role === 'student') {
          const { data } = await supabase.from('students').select('id,class_id').eq('school_id', schoolId).eq('profile_id', profile.id).maybeSingle()
          if (data) { studentIds = [data.id]; classIds = data.class_id ? [data.class_id] : [] }
        } else if (role === 'parent') {
          const { data: links } = await supabase.from('student_guardians').select('student_id').eq('guardian_id', profile.id)
          const linkedIds = (links || []).map(row => row.student_id)
          if (linkedIds.length) {
            const { data: children } = await supabase.from('students').select('id,class_id').eq('school_id', schoolId).in('id', linkedIds)
            const selectedChild = (children || []).find(child => child.id === studentId) || children?.[0]
            if (selectedChild) {
              studentIds = [selectedChild.id]
              classIds = selectedChild.class_id ? [selectedChild.class_id] : []
            }
          }
        } else if (role === 'teacher') {
          const [classes, subjectClasses] = await Promise.all([
            supabase.from('classes').select('id').eq('school_id', schoolId).eq('teacher_id', profile.id),
            supabase.from('teacher_subject_assignments').select('class_id').eq('school_id', schoolId).eq('teacher_id', profile.id)
          ])
          if (classes.error || subjectClasses.error) throw classes.error || subjectClasses.error
          classIds = [...new Set([...(classes.data || []).map(row => row.id), ...(subjectClasses.data || []).map(row => row.class_id)])]
        }
        if (role === 'parent') noticeRequest.or(classIds.length ? `class_id.is.null,class_id.eq.${classIds[0]}` : 'class_id.is.null')
        let assignmentRequest = supabase.from('assignments').select('id,title,due_date').eq('school_id', schoolId).gte('due_date', today).order('due_date', { ascending: true }).limit(4)
        if (role === 'teacher') assignmentRequest = assignmentRequest.eq('created_by', profile.id)
        if ((role === 'student' || role === 'parent') && classIds.length) assignmentRequest = assignmentRequest.in('class_id', classIds)
        if ((role === 'student' || role === 'parent') && !classIds.length) assignmentRequest = null
        let attendanceRequest = supabase.from('attendance').select('status').eq('school_id', schoolId).eq('attendance_date', today)
        if (role === 'teacher') attendanceRequest = attendanceRequest.eq('recorded_by', profile.id)
        if (role === 'student' && studentIds.length) attendanceRequest = attendanceRequest.eq('student_id', studentIds[0])
        if (role === 'parent' && studentIds.length) attendanceRequest = attendanceRequest.in('student_id', studentIds)
        if ((role === 'student' || role === 'parent') && !studentIds.length) attendanceRequest = null
        const [noticeResult, assignmentResult, attendanceResult] = await Promise.all([
          noticeRequest, assignmentRequest || Promise.resolve({ data: [] }), attendanceRequest || Promise.resolve({ data: [] })
        ])
        if (noticeResult.error) throw noticeResult.error
        if (assignmentResult.error) throw assignmentResult.error
        if (attendanceResult.error) throw attendanceResult.error
        const attendanceRows = attendanceResult.data || []
        const present = attendanceRows.filter(row => row.status === 'present' || row.status === 'late').length
        if (!cancelled) {
          setNotices(noticeResult.data || [])
          setAssignments(assignmentResult.data || [])
          setPulse(attendanceRows.length ? `${Math.round((present / attendanceRows.length) * 100)}%` : '—')
        }
      } catch (error) {
        console.error('Could not load school dashboard activity:', error.message)
        if (!cancelled) { setNotices([]); setAssignments([]); setPulse('—') }
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [role, profile?.id, profile?.school_id, timezone, studentId])

  if (role === 'super_admin') return null
  const formatDate = value => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: timezone }).format(new Date(value))
  return <section className="dashboard-highlights">
    <div className="panel highlight-card glass-card neumorph-flat"><div className="dashboard-panel-title"><div><p className="eyebrow blue-eyebrow">SCHOOL FEED</p><h2>{role === 'parent' ? 'Your child’s upcoming assignments' : 'Updates & upcoming work'}</h2></div><span className="dashboard-panel-mark" aria-hidden="true">↗</span></div>{role === 'parent' && <p className="dashboard-empty-state">This is a reminder for you. Your child opens and submits the work in their student portal.</p>}
      {loading ? <p className="dashboard-empty-state">Loading your latest updates…</p> : notices.length || assignments.length ? <>
        {notices.map(row => <div className="highlight-row" key={`notice-${row.id}`}><i>N</i><span><small>School notice</small>{row.title}</span><time>{formatDate(row.created_at)}</time></div>)}
        {assignments.map(row => <div className="highlight-row" key={`assignment-${row.id}`}><i>A</i><span><small>{role === 'parent' ? 'Assigned to your learner · due' : 'Due'} {formatDate(row.due_date)}</small>{row.title}</span><time>{role === 'parent' ? 'Reminder' : 'Work'}</time></div>)}
      </> : <p className="dashboard-empty-state">There are no recent notices or upcoming class assignments.</p>}
    </div>
    <div className="panel pulse-card glass-card neumorph-flat"><p className="eyebrow blue-eyebrow">ATTENDANCE TODAY</p><h2>{role === 'parent' ? 'Learner attendance' : role === 'student' ? 'Your attendance' : 'Attendance activity'}</h2><div className="pulse-ring">{loading ? '…' : pulse}</div><p>{pulse === '—' ? 'No attendance today.' : 'Present or late today.'}</p></div>
  </section>
}
