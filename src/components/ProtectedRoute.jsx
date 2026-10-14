import { Link, Navigate, useLocation } from 'react-router-dom'; import {useAuth} from '../context/AuthContext'; import PortalLayout from './PortalLayout'
export default function ProtectedRoute({roles,children,shell=true}){
  const {session,profile,school,loading,logout}=useAuth();
  const location=useLocation();

  if(loading) return (
    <div className="portal-loading">
      <div className="spinner"></div>
      <p>Verifying secure session...</p>
    </div>
  );

  if(!session) return <Navigate to={roles?.length === 1 ? `/login/${roles[0]}` : '/login'} replace state={{ from: location }} />;

  if(roles?.length && (!profile || !roles.includes(profile.role))) {
    return <Navigate to="/portal" replace/>;
  }

  if(profile?.role !== 'super_admin' && !profile?.school_id) {
    return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'24px',background:'#f4f8fc'}}><section style={{width:'min(500px,100%)',padding:'32px',border:'1px solid #dce7f0',borderRadius:'16px',background:'#fff',boxShadow:'0 18px 50px #17344d12'}}><p className="eyebrow blue-eyebrow">SCHOOL WORKSPACE ACCESS</p><h1 style={{margin:'0 0 10px',color:'#17344d',fontSize:'1.6rem'}}>School access is not assigned</h1><p style={{color:'#60778e',lineHeight:1.7,fontSize:'.9rem'}}>This account is not linked to a school workspace. Ask your school administrator to invite you, or sign out and use the correct account.</p><button className="outline-button" onClick={logout} style={{padding:'12px 16px',borderRadius:'8px',cursor:'pointer'}}>Sign out</button></section></main>
  }

  const schoolAdmin = profile?.role === 'school_admin';
  const canManagePending = schoolAdmin && ['/subscription','/settings'].includes(location.pathname);
  if(profile?.role !== 'super_admin' && profile?.school_id && (!school || school.status !== 'active') && !canManagePending) {
    const status = school?.status || 'checking';
    return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'24px',background:'#f4f8fc'}}><section style={{width:'min(500px,100%)',padding:'32px',border:'1px solid #dce7f0',borderRadius:'16px',background:'#fff',boxShadow:'0 18px 50px #17344d12'}}><p className="eyebrow blue-eyebrow">SCHOOL WORKSPACE ACCESS</p><h1 style={{margin:'0 0 10px',color:'#17344d',fontSize:'1.6rem'}}>{status==='active'?'Loading school':status==='suspended'?'School access is suspended':status==='rejected'?'School registration was declined':'Waiting for school approval'}</h1><p style={{color:'#60778e',lineHeight:1.7,fontSize:'.9rem'}}>{status==='suspended'?'This school workspace is currently suspended. Contact the SmartSchool platform administrator for help.':status==='rejected'?'The platform administrator declined this school request. Contact SmartSchool if you need more information.':'The school workspace can open after the SmartSchool platform administrator approves the school and its subscription.'}</p>{schoolAdmin&&<Link className="button blue-button" to="/subscription" style={{marginRight:'12px'}}>View plan request →</Link>}<button className="outline-button" onClick={logout} style={{padding:'12px 16px',borderRadius:'8px',cursor:'pointer'}}>Sign out</button></section></main>
  }

  return shell ? <PortalLayout>{children}</PortalLayout> : children;
}
