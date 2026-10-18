import RoleDashboard from './RoleDashboard'

// Keep the teacher route explicit while sharing the same dashboard shell as
// the other school roles. Teaching actions and metrics are configured by role.
export default function TeacherWorkspace() {
  return <RoleDashboard role="teacher" />
}
