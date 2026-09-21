import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import RegisterSchool from './pages/RegisterSchool'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import RoleDashboard from './pages/RoleDashboard'
import { roleRoute } from './lib/roleRoute'
import PublicPage from './pages/PublicPage'
import { initPushNotifications } from './lib/notifications'
import { Toaster } from 'react-hot-toast'
import Chat from './pages/Chat'
import AcademicReport from './pages/AcademicReport'
import SubmissionPortal from './pages/SubmissionPortal'
import TeacherReview from './pages/TeacherReview'
import SchoolCalendar from './pages/SchoolCalendar'
import Timetable from './pages/Timetable'
import Library from './pages/Library'
import SchoolSettings from './pages/SchoolSettings'
import QuizPortal from './pages/QuizPortal'
import Broadcast from './pages/Broadcast'
import InvoiceView from './pages/InvoiceView'
import Gradebook from './pages/Gradebook'
import MeetingScheduler from './pages/MeetingScheduler'
import BehaviorLog from './pages/BehaviorLog'
import AuditTrail from './pages/AuditTrail'
import SecuritySettings from './pages/SecuritySettings'
import AdmissionsPortal from './pages/AdmissionsPortal'
import AdmissionsManager from './pages/AdmissionsManager'
import CourseBuilder from './pages/CourseBuilder'
import CourseView from './pages/CourseView'
import CertificateGenerator from './pages/CertificateGenerator'
import ProfileSettings from './pages/ProfileSettings'
import LessonPlans from './pages/LessonPlans'

function Guard() { const {session,profile,loading}=useAuth(); if(loading)return <div className="portal-loading"><div className="spinner"></div></div>; if(!session)return <Navigate to="/login" replace/>; return profile?.role ? <Navigate to={roleRoute(profile.role)} replace/> : <Navigate to="/login" replace/> }
const roleRoutes=[['super-admin','super_admin'],['school-admin','school_admin'],['teacher','teacher'],['student','student'],['parent','parent']]
export default function App(){
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    initPushNotifications();
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle dark mode"
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
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
        <Route path="/chat" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><Chat /></ProtectedRoute>} />
        <Route path="/broadcast" element={<ProtectedRoute roles={['school_admin', 'teacher']}><Broadcast /></ProtectedRoute>} />
        <Route path="/report-card/:studentId" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><AcademicReport /></ProtectedRoute>} />
        <Route path="/invoice/:paymentId" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><InvoiceView /></ProtectedRoute>} />
        <Route path="/gradebook" element={<ProtectedRoute roles={['school_admin', 'teacher']}><Gradebook /></ProtectedRoute>} />
        <Route path="/meetings" element={<ProtectedRoute roles={['teacher', 'parent']}><MeetingScheduler /></ProtectedRoute>} />
        <Route path="/behavior-log" element={<ProtectedRoute roles={['school_admin', 'teacher']}><BehaviorLog /></ProtectedRoute>} />
        <Route path="/submit/:assignmentId" element={<ProtectedRoute roles={['student']}><SubmissionPortal /></ProtectedRoute>} />
        <Route path="/review/:assignmentId" element={<ProtectedRoute roles={['teacher', 'school_admin']}><TeacherReview /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><SchoolCalendar /></ProtectedRoute>} />
        <Route path="/timetable" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><Timetable /></ProtectedRoute>} />
        <Route path="/library" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><Library /></ProtectedRoute>} />
        <Route path="/quizzes" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student']}><QuizPortal /></ProtectedRoute>} />
        <Route path="/audit-trail" element={<ProtectedRoute roles={['super_admin', 'school_admin']}><AuditTrail /></ProtectedRoute>} />
        <Route path="/security" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><SecuritySettings /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><ProfileSettings /></ProtectedRoute>} />
        <Route path="/lessons" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student', 'parent']}><LessonPlans /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute roles={['school_admin']}><SchoolSettings /></ProtectedRoute>} />
        <Route path="/course-builder" element={<ProtectedRoute roles={['school_admin', 'teacher']}><CourseBuilder /></ProtectedRoute>} />
        <Route path="/course/:courseId" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student']}><CourseView /></ProtectedRoute>} />
        <Route path="/certificate/:courseId" element={<ProtectedRoute roles={['super_admin', 'school_admin', 'teacher', 'student']}><CertificateGenerator /></ProtectedRoute>} />
        <Route path="/apply" element={<AdmissionsPortal />} />
        <Route path="/admissions" element={<ProtectedRoute roles={['school_admin', 'super_admin']}><AdmissionsManager /></ProtectedRoute>} />
        <Route path="/portal" element={<Guard/>}/>
        {roleRoutes.map(([path,role])=>(
          <Route key={path} path={'/'+path} element={<ProtectedRoute roles={[role]}><RoleDashboard role={role}/></ProtectedRoute>}/>
        ))}
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </>
  )
}
