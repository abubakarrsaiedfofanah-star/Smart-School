-- Preserve actor and before/after evidence for staff attendance changes.
drop trigger if exists audit_school_staff_attendance on public.staff_attendance;
create trigger audit_school_staff_attendance
after insert or update or delete on public.staff_attendance
for each row execute function public.log_table_change();

-- Attendance managers may review attendance history for their school without
-- gaining access to other audit log categories.
drop policy if exists staff_attendance_audit_read on public.audit_logs;
create policy staff_attendance_audit_read on public.audit_logs
for select to authenticated using (
  table_name = 'staff_attendance'
  and school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.staff_attendance.manage')
);
