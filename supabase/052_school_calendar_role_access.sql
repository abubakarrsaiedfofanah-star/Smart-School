-- Keep the calendar readable across the school but reserve school-wide event
-- management for school admins, principals, and deputy principals.

insert into public.school_role_permission_catalog(role_key, permission_key) values
  ('principal', 'school.calendar.manage'),
  ('deputy_principal', 'school.calendar.manage')
on conflict do nothing;

drop policy if exists events_staff_insert on public.events;
create policy events_staff_insert on public.events
for insert to authenticated
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.calendar.manage')
);

drop policy if exists events_staff_update on public.events;
create policy events_staff_update on public.events
for update to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.calendar.manage')
)
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.calendar.manage')
);

drop policy if exists events_staff_delete on public.events;
create policy events_staff_delete on public.events
for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.calendar.manage')
);
