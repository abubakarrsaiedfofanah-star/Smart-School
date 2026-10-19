-- Non-teaching staff accounts need the same assigned-workspace permissions as
-- teachers. Keep role assignment limited to active staff in the same school.
create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
  )
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and a.role_key = any(allowed_roles)
  )
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

-- The assignment guard was originally limited to teacher profiles. Permit an
-- active non-teaching staff profile to receive a specialist workspace role.
create or replace function private.validate_school_staff_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.school_id = new.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
  ) then
    raise exception 'Specialist roles require an active teacher or staff account in the same school.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_school_staff_assignment() from public, anon, authenticated;

drop policy if exists school_staff_roles_admin_manage on public.school_staff_role_assignments;
create policy school_staff_roles_admin_manage on public.school_staff_role_assignments
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'
  )
)
with check (
  exists (
    select 1 from public.profiles actor
    join public.profiles target on target.id = school_staff_role_assignments.profile_id
      and target.school_id = school_staff_role_assignments.school_id
    where actor.id = (select auth.uid()) and actor.is_active is true
      and actor.school_id = school_staff_role_assignments.school_id and actor.role = 'school_admin'
      and target.is_active is true and target.role in ('teacher', 'staff')
  )
);
