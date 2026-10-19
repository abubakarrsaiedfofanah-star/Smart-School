import type { PortalRole } from '../types/portal'

const routes: Record<PortalRole, string> = {
  super_admin: '/super-admin',
  school_admin: '/school-admin',
  teacher: '/teacher',
  staff: '/staff',
  student: '/student',
  parent: '/parent'
}

export const roleRoute = (role: PortalRole | string): string => routes[role as PortalRole] || '/portal'
