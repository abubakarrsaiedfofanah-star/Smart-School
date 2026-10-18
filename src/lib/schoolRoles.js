export const SCHOOL_STAFF_ROLES = [
  { key: 'principal', label: 'Principal / head teacher', description: 'School-wide oversight, timetable, approvals, and reports.' },
  { key: 'deputy_principal', label: 'Deputy principal', description: 'Academic oversight, attendance, timetable, and reports.' },
  { key: 'hr_admin', label: 'HR administrator', description: 'Staff records, recruitment, and leave administration.' },
  { key: 'finance_officer', label: 'Finance officer', description: 'Finance operations, payroll preparation, and reconciliation.' },
  { key: 'registrar', label: 'Registrar', description: 'Admissions and student records.' },
  { key: 'librarian', label: 'Librarian', description: 'Library resources and inventory.' },
  { key: 'inventory_manager', label: 'Inventory manager', description: 'School asset and stock records.' },
  { key: 'nurse', label: 'Nurse', description: 'Health portal is not available yet.', available: false },
  { key: 'counsellor', label: 'Counsellor', description: 'Counselling portal is not available yet.', available: false },
  { key: 'transport_manager', label: 'Transport manager', description: 'Transport portal is not available yet.', available: false },
  { key: 'staff_member', label: 'Staff member', description: 'Staff member portal is not available yet.', available: false }
]

export const ROLE_PERMISSIONS = {
  principal: ['school.timetable.manage', 'school.attendance.manage', 'school.staff_attendance.manage', 'school.inventory.manage', 'school.expenses.manage', 'school.finance.reconcile', 'school.hr.manage', 'school.admissions.manage', 'school.library.manage', 'school.health.manage', 'school.wellbeing.manage', 'school.transport.manage', 'school.reports.view'],
  deputy_principal: ['school.timetable.manage', 'school.attendance.manage', 'school.staff_attendance.manage', 'school.inventory.view', 'school.admissions.manage', 'school.reports.view'],
  hr_admin: ['school.staff_attendance.manage', 'school.hr.manage'],
  finance_officer: ['school.expenses.manage', 'school.finance.reconcile', 'school.hr.payroll'],
  registrar: ['school.admissions.manage', 'school.students.manage'],
  librarian: ['school.library.manage', 'school.inventory.view'],
  inventory_manager: ['school.inventory.manage', 'school.inventory.view'],
  nurse: ['school.health.manage'],
  counsellor: ['school.wellbeing.manage'],
  transport_manager: ['school.transport.manage'],
  staff_member: ['school.profile.view']
}

export function hasSchoolPermission(baseRole, staffRoles = [], permission) {
  if (baseRole === 'school_admin') return true
  return staffRoles.some(role => (ROLE_PERMISSIONS[role] || []).includes(permission))
}
