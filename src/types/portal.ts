export type PortalRole = 'super_admin' | 'school_admin' | 'teacher' | 'staff' | 'student' | 'parent'

export interface UserProfile {
  id: string
  full_name: string
  role: PortalRole
  school_id: string | null
  is_active?: boolean
  billing_suspended_at?: string | null
  email?: string
  [field: string]: any
}

export interface SchoolWorkspace {
  id: string
  name: string
  slug?: string
  status?: string
  suspension_reason?: string | null
  currency_code?: string
  school_level?: string
  logo_url?: string | null
  primary_color?: string
  [field: string]: any
}
