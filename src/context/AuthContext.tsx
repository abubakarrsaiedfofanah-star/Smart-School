import { createContext, useContext, useEffect, useState } from 'react'
import type { Dispatch, PropsWithChildren, SetStateAction } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { PortalRole, SchoolWorkspace, UserProfile } from '../types/portal'
import { clearOfflineDataForUser } from '../lib/offlineQueue'

interface DemoSession {
  user: { id: string; email: string }
  demo: true
}

interface AuthContextValue {
  session: Session | DemoSession | null
  profile: UserProfile | null
  school: SchoolWorkspace | null
  staffRoles: string[]
  setSchool: Dispatch<SetStateAction<SchoolWorkspace | null>>
  setProfile: Dispatch<SetStateAction<UserProfile | null>>
  loading: boolean
  demo: boolean
  login: (email: string, password: string) => Promise<{ profile: UserProfile; staffRoles: string[] }>
  loginDemo: (role: PortalRole, specialistRole?: string) => { profile: UserProfile }
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const roles: PortalRole[] = ['super_admin', 'school_admin', 'teacher', 'staff', 'student', 'parent']
const isPortalRole = (value: string | null): value is PortalRole => roles.includes(value as PortalRole)
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | DemoSession | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [school, setSchool] = useState<SchoolWorkspace | null>(null)
  const [staffRoles, setStaffRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [demo, setDemo] = useState(false)

  const loadStaffRoles = async (nextProfile: UserProfile | null) => {
    if (!nextProfile?.school_id || !supabase || !['teacher', 'staff'].includes(nextProfile.role)) { setStaffRoles([]); return }
    const { data: assigned, error } = await supabase.from('school_staff_role_assignments')
      .select('role_key').eq('school_id', nextProfile.school_id).eq('profile_id', nextProfile.id)
    if (error) throw error
    setStaffRoles([...new Set((assigned || []).map(row => row.role_key).filter(Boolean))])
  }

  const enterDemo = (role: PortalRole, specialistRole?: string): { profile: UserProfile } => {
    const labels: Record<PortalRole, string> = {
      super_admin: 'Platform Administrator', school_admin: 'Demo School Admin', teacher: 'Demo Teacher', staff: 'Demo Staff Member', student: 'Demo Student', parent: 'Demo Parent'
    }
    const demoProfile: UserProfile = {
      id: `demo-${role}`, full_name: labels[role], role,
      school_id: role === 'super_admin' ? null : 'demo-school-id',
      email: `${role}@demo.smartschool.local`
    }
    const demoSchool: SchoolWorkspace = {
      id: 'demo-school-id', name: 'Greenfield Academy', slug: 'greenfield-academy', status: 'active',
      school_level: 'Demo workspace', logo_url: null, primary_color: '#2375e1'
    }
    sessionStorage.setItem('smartschool_demo_role', role)
    setDemo(true)
    setProfile(demoProfile)
    setStaffRoles(role === 'staff' && specialistRole ? [specialistRole] : [])
    setSchool(role === 'super_admin' ? null : demoSchool)
    setSession({ user: { id: demoProfile.id, email: demoProfile.email! }, demo: true })
    return { profile: demoProfile }
  }

  const loadProfile = async (user: User | null): Promise<void> => {
    if (!user || !supabase) { setProfile(null); return }
    try {
      const { data: profileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (profileError) throw profileError
      const nextProfile = profileData as UserProfile | null
      setProfile(nextProfile)
      await loadStaffRoles(nextProfile)
      if (nextProfile?.school_id) {
        const { data: schoolData } = await supabase.from('schools').select('*').eq('id', nextProfile.school_id).maybeSingle()
        setSchool(schoolData as SchoolWorkspace | null)
      } else setSchool(null)
    } catch (error) {
      console.error('Failed to load user profile or school:', error instanceof Error ? error.message : error)
      setProfile(null)
      setStaffRoles([])
      setSchool(null)
    }
  }

  useEffect(() => {
    const savedDemoRole = sessionStorage.getItem('smartschool_demo_role')
    if (isPortalRole(savedDemoRole)) {
      enterDemo(savedDemoRole)
      setLoading(false)
    } else if (savedDemoRole) sessionStorage.removeItem('smartschool_demo_role')

    if (!supabase) {
      if (!isPortalRole(savedDemoRole)) setLoading(false)
      return
    }
    const client = supabase

    const initAuth = async () => {
      const { data: { session: authSession } } = await client.auth.getSession()
      if (authSession && !isPortalRole(savedDemoRole)) {
        setSession(authSession)
        await loadProfile(authSession.user)
      }
      if (!isPortalRole(savedDemoRole)) setLoading(false)
    }
    void initAuth()

    const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, nextSession) => {
      if (isPortalRole(sessionStorage.getItem('smartschool_demo_role'))) return
      setDemo(false)
      setSession(nextSession)
      if (nextSession?.user) await loadProfile(nextSession.user)
      else { setProfile(null); setSchool(null); setStaffRoles([]) }
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string): Promise<{ profile: UserProfile; staffRoles: string[] }> => {
    if (demo) throw new Error('Sign out of demo mode before signing in to a real account.')
    if (!supabase) throw new Error('School sign in is unavailable until the platform is connected.')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const { data: nextProfileData, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
    if (profileError) throw profileError
    if (!nextProfileData) throw new Error('Your account is active but has no school profile yet. Contact an administrator.')
    const nextProfile = nextProfileData as UserProfile
    if (nextProfile.is_active === false) {
      await supabase.auth.signOut()
      throw new Error('This account is disabled. Contact your school administrator.')
    }
    setProfile(nextProfile)
    const { data: assigned, error: rolesError } = nextProfile.school_id && ['teacher', 'staff'].includes(nextProfile.role)
      ? await supabase.from('school_staff_role_assignments').select('role_key').eq('school_id', nextProfile.school_id).eq('profile_id', nextProfile.id)
      : { data: [], error: null }
    if (rolesError) throw rolesError
    const nextStaffRoles = [...new Set((assigned || []).map((row: { role_key: string }) => row.role_key).filter(Boolean))]
    setStaffRoles(nextStaffRoles)
    if (nextProfile.school_id) {
      const { data: nextSchool } = await supabase.from('schools').select('*').eq('id', nextProfile.school_id).maybeSingle()
      setSchool(nextSchool as SchoolWorkspace | null)
    } else setSchool(null)
    return { profile: nextProfile, staffRoles: nextStaffRoles }
  }

  const resetPassword = async (email: string): Promise<void> => {
    if (!supabase) return
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` })
    if (error) throw error
  }

  const logout = async (): Promise<void> => {
    const userId = profile?.id
    if (userId && profile?.school_id && !demo && supabase) {
      await supabase.from('push_devices').update({ active: false }).eq('user_id', userId).eq('school_id', profile.school_id)
    }
    if (demo) sessionStorage.removeItem('smartschool_demo_role')
    else if (supabase) await supabase.auth.signOut({ scope: 'global' })
    if (userId && !userId.startsWith('demo-')) {
      await clearOfflineDataForUser(userId).catch(error => console.warn('Could not clear this user\'s offline school data:', error))
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index)
        if (key?.startsWith(`smartschool-assessment:${userId}:`)) localStorage.removeItem(key)
      }
    }
    setDemo(false); setSession(null); setProfile(null); setSchool(null); setStaffRoles([])
  }

  return <AuthContext.Provider value={{ session, profile, school, staffRoles, setSchool, setProfile, loading, demo, login, loginDemo: enterDemo, logout, resetPassword }}>
    {children}
  </AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
