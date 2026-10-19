-- All school members may read official notices. Only school administrators
-- and assigned principals may publish, change, or remove them.

insert into public.school_role_permission_catalog(role_key, permission_key) values
  ('principal', 'school.announcements.manage')
on conflict do nothing;

drop policy if exists announcements_staff_insert on public.announcements;
create policy announcements_school_leadership_insert on public.announcements
for insert to authenticated
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.announcements.manage')
);

drop policy if exists announcements_staff_update on public.announcements;
create policy announcements_school_leadership_update on public.announcements
for update to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.announcements.manage')
)
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.announcements.manage')
);

drop policy if exists announcements_staff_delete on public.announcements;
create policy announcements_school_leadership_delete on public.announcements
for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.announcements.manage')
);
