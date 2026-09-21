import { Navigate } from 'react-router-dom'; import {useAuth} from '../context/AuthContext'
export default function ProtectedRoute({roles,children}){
  const {session,profile,loading}=useAuth();

  if(loading) return (
    <div className="portal-loading">
      <div className="spinner"></div>
      <p>Verifying secure session...</p>
    </div>
  );

  if(!session) return <Navigate to="/login" replace/>;

  if(roles?.length && (!profile || !roles.includes(profile.role))) {
    return <Navigate to="/portal" replace/>;
  }

  return children;
}
