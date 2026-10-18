import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const RegisterSchool = lazy(() => import('./pages/RegisterSchool'))
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
const RoleDashboard = lazy(() => import('./pages/RoleDashboard'))
const TeacherWorkspace = lazy(() => import('./pages/TeacherWorkspace'))
const TeacherAssignments = lazy(() => import('./pages/TeacherAssignments'))
const TeacherLoads = lazy(() => import('./pages/TeacherLoads'))
import { roleRoute } from './lib/roleRoute'
const PublicPage = lazy(() => import('./pages/PublicPage'))
import { initPushNotifications } from './lib/notifications'
import { Toaster } from 'react-hot-toast'
const Chat = lazy(() => import('./pages/Chat'))
const AcademicReport = lazy(() => import('./pages/AcademicReport'))
const SubmissionPortal = lazy(() => import('./pages/SubmissionPortal'))
const TeacherReview = lazy(() => import('./pages/TeacherReview'))
const SchoolCalendar = lazy(() => import('./pages/SchoolCalendar'))
const Timetable = lazy(() => import('./pages/Timetable'))
const Library = lazy(() => import('./pages/Library'))
const Inventory = lazy(() => import('./pages/Inventory'))
const StaffAttendance = lazy(() => import('./pages/StaffAttendance'))
const FinanceOperations = lazy(() => import('./pages/FinanceOperations'))
const SchoolSettings = lazy(() => import('./pages/SchoolSettings'))
const QuizPortal = lazy(() => import('./pages/QuizPortal'))
const Broadcast = lazy(() => import('./pages/Broadcast'))
const InvoiceView = lazy(() => import('./pages/InvoiceView'))
const Gradebook = lazy(() => import('./pages/Gradebook'))
const MeetingScheduler = lazy(() => import('./pages/MeetingScheduler'))
const BehaviorLog = lazy(() => import('./pages/BehaviorLog'))
const AuditTrail = lazy(() => import('./pages/AuditTrail'))
const SecuritySettings = lazy(() => import('./pages/SecuritySettings'))
const AdmissionsPortal = lazy(() => import('./pages/AdmissionsPortal'))
const AdmissionsManager = lazy(() => import('./pages/AdmissionsManager'))
const CourseBuilder = lazy(() => import('./pages/CourseBuilder'))
const CourseView = lazy(() => import('./pages/CourseView'))
const CertificateGenerator = lazy(() => import('./pages/CertificateGenerator'))
const ProfileSettings = lazy(() => import('./pages/ProfileSettings'))
const LessonPlans = lazy(() => import('./pages/LessonPlans'))
const HrPayrollPortal = lazy(() => import('./pages/HrPayrollPortal'))
const SchoolSubscription = lazy(() => import('./pages/SchoolSubscription'))
const SchoolAccounts = lazy(() => import('./pages/SchoolAccounts'))
const SchoolStaffRoles = lazy(() => import('./pages/SchoolStaffRoles'))
const StaffPortals = lazy(() => import('./pages/StaffPortals'))
import AppInstallPrompt from './components/AppInstallPrompt'
import CommandPalette from './components/CommandPalette'

const readTheme = () => {
  try {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function Guard() { const {session,profile,loading}=useAuth(); if(loading)return <div className="portal-loading"><div className="spinner"></div></div>; if(!session)return <Navigate to="/login" replace/>; return profile?.role ? <Navigate to={roleRoute(profile.role)} replace/> : <Navigate to="/login" replace/> }
const roleRoutes=[['super-admin','super_admin'],['school-admin','school_admin'],['teacher','teacher'],['student','student'],['parent','parent']]
export default function App(){
  const { profile } = useAuth()
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    let active = true
    let dispose = () => {}
    void initPushNotifications(profile).then(cleanup => { if (active) dispose = cleanup || dispose; else cleanup?.() })
    if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(error => console.error('SmartSchool app shell could not be registered:', error));
    return () => { active = false; dispose() }
  }, [profile?.id, profile?.school_id]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* Theme still works for this session. */ }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />
      <AppInstallPrompt />
      <CommandPalette />
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        aria-pressed={theme === 'dark'}
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
      <Suspense fallback={<div className="portal-loading" role="status" aria-live="polite"><div className="spinner" /><span>Loading page…</span></div>}>
      <Routes>
        <Route path="/" element={<Landing/>}/>
        <Route path="/welcome" element={<Landing/>}/>
        <Route path="/features" element={<PublicPage page="features"/>}/>
        <Route path="/portals" element={<PublicPage page="portals"/>}/>
        <Route path="/pricing" element={<PublicPage page="pricing"/>}/>
        <Route path="/about" element={<PublicPage page="about"/>}/>
        <Route path="/contact" element={<PublicPage page="contact"/>}/>
        <Route path="/register" element={<RegisterSchool/>}/>
        <Route path="/login" element={<Login/>}/>
        <Route path="/login/:portalRole" element={<Login/>}/>
        <Route path="/chat" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><Chat /></ProtectedRoute>} />
        <Route path="/broadcast" element={<ProtectedRoute roles={['school_admin', 'teacher']}><Broadcast /></ProtectedRoute>} />
        <Route path="/report-card/:studentId" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']} shell={false}><AcademicReport /></ProtectedRoute>} />
        <Route path="/invoice/:paymentId" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><InvoiceView /></ProtectedRoute>} />
        <Route path="/gradebook" element={<ProtectedRoute roles={['school_admin', 'teacher']}><Gradebook /></ProtectedRoute>} />
        <Route path="/teacher-assignments" element={<ProtectedRoute roles={['school_admin', 'teacher']}><TeacherAssignments /></ProtectedRoute>} />
        <Route path="/teacher-loads" element={<ProtectedRoute roles={['school_admin']}><TeacherLoads /></ProtectedRoute>} />
        <Route path="/meetings" element={<ProtectedRoute roles={['teacher', 'parent']}><MeetingScheduler /></ProtectedRoute>} />
        <Route path="/behavior-log" element={<ProtectedRoute roles={['school_admin', 'teacher']}><BehaviorLog /></ProtectedRoute>} />
        <Route path="/submit/:assignmentId" element={<ProtectedRoute roles={['student']}><SubmissionPortal /></ProtectedRoute>} />
        <Route path="/review/:assignmentId" element={<ProtectedRoute roles={['teacher', 'school_admin']}><TeacherReview /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><SchoolCalendar /></ProtectedRoute>} />
        <Route path="/timetable" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><Timetable /></ProtectedRoute>} />
        <Route path="/library" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><Library /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute roles={['school_admin', 'teacher']}><Inventory /></ProtectedRoute>} />
        <Route path="/staff-attendance" element={<ProtectedRoute roles={['school_admin', 'teacher']}><StaffAttendance /></ProtectedRoute>} />
        <Route path="/finance-operations" element={<ProtectedRoute roles={['school_admin', 'teacher']}><FinanceOperations /></ProtectedRoute>} />
        <Route path="/quizzes" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student']}><QuizPortal /></ProtectedRoute>} />
        <Route path="/audit-trail" element={<ProtectedRoute roles={['super_admin', 'school_admin']}><AuditTrail /></ProtectedRoute>} />
        <Route path="/security" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><SecuritySettings /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><ProfileSettings /></ProtectedRoute>} />
        <Route path="/lessons" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><LessonPlans /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute roles={['school_admin']}><SchoolSettings /></ProtectedRoute>} />
        <Route path="/subscription" element={<ProtectedRoute roles={['school_admin']}><SchoolSubscription /></ProtectedRoute>} />
        <Route path="/school-accounts" element={<ProtectedRoute roles={['school_admin']}><SchoolAccounts /></ProtectedRoute>} />
        <Route path="/staff-roles" element={<ProtectedRoute roles={['school_admin']}><SchoolStaffRoles /></ProtectedRoute>} />
        <Route path="/hr-payroll" element={<ProtectedRoute roles={['school_admin', 'teacher']}><HrPayrollPortal /></ProtectedRoute>} />
        <Route path="/course-builder" element={<ProtectedRoute roles={['school_admin', 'teacher']}><CourseBuilder /></ProtectedRoute>} />
        <Route path="/course/:courseId" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student']}><CourseView /></ProtectedRoute>} />
        <Route path="/certificate/:courseId" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student']}><CertificateGenerator /></ProtectedRoute>} />
        <Route path="/apply" element={<AdmissionsPortal />} />
        <Route path="/admissions" element={<ProtectedRoute roles={['school_admin', 'super_admin', 'teacher']} permission="school.admissions.manage"><AdmissionsManager /></ProtectedRoute>} />
        <Route path="/staff-portals" element={<ProtectedRoute roles={['school_admin', 'teacher']}><StaffPortals /></ProtectedRoute>} />
        <Route path="/portal" element={<Guard/>}/>
        {roleRoutes.map(([path,role])=>(
          <Route key={path} path={'/'+path} element={<ProtectedRoute roles={[role]} shell={role === 'teacher'}>{role === 'teacher' ? <TeacherWorkspace /> : <RoleDashboard role={role}/>}</ProtectedRoute>}/>
        ))}
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
      </Suspense>
    </>
  )
}
