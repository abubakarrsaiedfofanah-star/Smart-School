import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null), [profile, setProfile] = useState(null), [school, setSchool] = useState(null), [loading, setLoading] = useState(true)

  const loadProfile = async user => {
    if (!user || !supabase) return setProfile(null);
    try {
      const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (profileError) throw profileError;
      setProfile(profileData || null);

      if (profileData?.school_id) {
        const { data: schoolData } = await supabase.from('schools').select('*').eq('id', profileData.school_id).maybeSingle();
        setSchool(schoolData || null);
      } else {
        setSchool(null);
      }
    } catch (e) {
      console.error('Failed to load user profile or school:', e.message);
      setProfile(null);
      setSchool(null);
    }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSession(session);
        await loadProfile(session.user);
      }
      setLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, next) => {
      setSession(next);
      if (next?.user) {
        await loadProfile(next.user);
      } else {
        setProfile(null);
        setSchool(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [])

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { data: nextProfile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!nextProfile) throw new Error('Your account is active but has no school profile yet. Contact an administrator.');

    setProfile(nextProfile);

    if (nextProfile.school_id) {
        const { data: nextSchool } = await supabase.from('schools').select('*').eq('id', nextProfile.school_id).maybeSingle();
        setSchool(nextSchool);
    }

    return { profile: nextProfile }
  }

  const resetPassword = async email => { if (!supabase) return; const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` }); if (error) throw error }

  const logout = async () => { if (supabase) await supabase.auth.signOut(); setSession(null); setProfile(null); setSchool(null) }

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      school,
      setProfile,
      loading,
      login,
      logout,
      resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
