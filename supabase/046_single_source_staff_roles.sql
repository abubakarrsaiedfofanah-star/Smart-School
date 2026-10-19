-- Specialist access is managed only through school_staff_role_assignments.
-- Migrations 041 and 043 already copied valid legacy HR roles into that table.

create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.role = 'teacher'
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
  );
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.role = 'teacher'
    where a.profile_id = (select auth.uid()) and a.school_id = target_school and a.role_key = any(allowed_roles)
  );
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

create or replace function private.enforce_privileged_mfa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role;
  actor_school uuid;
  privileged boolean := false;
begin
  if actor_id is null or (select auth.role()) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select p.role, p.school_id into actor_role, actor_school
  from public.profiles p where p.id = actor_id;

  privileged := actor_role in ('super_admin','school_admin') or exists (
    select 1 from public.school_staff_role_assignments a
    where a.profile_id = actor_id and a.school_id = actor_school
      and a.role_key in ('principal','deputy_principal','hr_admin','finance_officer','registrar','inventory_manager','nurse','counsellor','transport_manager')
  );

  if privileged and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication is required for privileged changes.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_privileged_mfa() from public, anon, authenticated;

-- The legacy role table is no longer an access source. Remove rows after their
-- migrated assignments exist so unchecking a role revokes it everywhere.
drop policy if exists hr_roles_read on public.school_hr_roles;
drop policy if exists hr_roles_admin_manage on public.school_hr_roles;
revoke all on public.school_hr_roles from public, anon, authenticated;
delete from public.school_hr_roles;
