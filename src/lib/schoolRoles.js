export const SCHOOL_STAFF_ROLES = [
  { key: 'principal', label: 'Principal / head teacher', description: 'School-wide oversight, timetable, salary and payroll approval, and reports.' },
  { key: 'deputy_principal', label: 'Deputy principal', description: 'Academic oversight, attendance, and reports.' },
  { key: 'head_of_department', label: 'Head of department', description: 'Create and maintain the school timetable.' },
  { key: 'hr_admin', label: 'HR administrator', description: 'Staff records, recruitment, leave, salary records, and payroll preparation.' },
  { key: 'finance_officer', label: 'Finance officer', description: 'Fee collections, expenses, reconciliation, and recording approved salary payouts.' },
  { key: 'registrar', label: 'Registrar', description: 'Admissions and student records.' },
  { key: 'librarian', label: 'Librarian', description: 'Library resources and inventory.' },
  { key: 'inventory_manager', label: 'Inventory manager', description: 'School asset and stock records.' },
  { key: 'nurse', label: 'Nurse', description: 'Health portal is not available yet.', available: false },
  { key: 'counsellor', label: 'Counsellor', description: 'Counselling portal is not available yet.', available: false },
  { key: 'transport_manager', label: 'Transport manager', description: 'Transport portal is not available yet.', available: false }
]

export const ROLE_PERMISSIONS = {
  principal: ['school.timetable.manage', 'school.attendance.manage', 'school.staff_attendance.manage', 'school.inventory.manage', 'school.inventory.view', 'school.expenses.manage', 'school.finance.reconcile', 'school.finance.portal.view', 'school.hr.manage', 'school.hr.payroll', 'school.hr.portal.view', 'school.admissions.manage', 'school.library.manage', 'school.health.manage', 'school.wellbeing.manage', 'school.transport.manage', 'school.reports.view', 'school.calendar.manage', 'school.announcements.manage'],
  deputy_principal: ['school.attendance.manage', 'school.staff_attendance.manage', 'school.inventory.view', 'school.admissions.manage', 'school.reports.view', 'school.calendar.manage'],
  head_of_department: ['school.timetable.manage'],
  hr_admin: ['school.staff_attendance.manage', 'school.hr.manage', 'school.hr.payroll', 'school.hr.portal.view'],
  finance_officer: ['school.expenses.manage', 'school.finance.reconcile', 'school.finance.portal.view', 'school.hr.payroll'],
  registrar: ['school.admissions.manage', 'school.students.manage'],
  librarian: ['school.library.manage', 'school.inventory.view'],
  inventory_manager: ['school.inventory.manage', 'school.inventory.view'],
  nurse: ['school.health.manage'],
  counsellor: ['school.wellbeing.manage'],
  transport_manager: ['school.transport.manage']
}

export function hasSchoolPermission(baseRole, staffRoles = [], permission) {
  const isolatedPortalRole = permission === 'school.hr.portal.view' ? 'hr_admin'
    : permission === 'school.finance.portal.view' ? 'finance_officer' : null
  if (isolatedPortalRole) {
    const otherPortalRole = isolatedPortalRole === 'hr_admin' ? 'finance_officer' : 'hr_admin'
    return ['teacher', 'staff'].includes(baseRole) && staffRoles.includes(isolatedPortalRole) && !staffRoles.includes(otherPortalRole)
  }
  if (baseRole === 'school_admin') return true
  return staffRoles.some(role => (ROLE_PERMISSIONS[role] || []).includes(permission))
}
