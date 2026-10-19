-- Match staff-attendance row-level security to the roles shown the management UI.
-- School administrators are already included by private.has_hr_role.

drop policy if exists staff_attendance_admin_read on public.staff_attendance;
create policy staff_attendance_admin_read on public.staff_attendance
for select to authenticated
using (
  school_id = private.current_school_id()
  and private.has_hr_role(school_id, array['principal','deputy_principal','hr_admin'])
);

drop policy if exists staff_attendance_admin_manage on public.staff_attendance;
create policy staff_attendance_admin_manage on public.staff_attendance
for all to authenticated
using (
  school_id = private.current_school_id()
  and private.has_hr_role(school_id, array['principal','deputy_principal','hr_admin'])
)
with check (
  school_id = private.current_school_id()
  and private.has_hr_role(school_id, array['principal','deputy_principal','hr_admin'])
  and exists (
    select 1 from public.profiles p
    where p.id = staff_profile_id
      and p.school_id = staff_attendance.school_id
      and p.role in ('school_admin','teacher')
  )
  and recorded_by = (select auth.uid())
);
