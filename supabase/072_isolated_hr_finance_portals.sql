-- Allow assigned teachers and staff to open one specialist portal.
-- School administrators retain their separate school workspace.
create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (
    required_permission not in ('school.hr.portal.view', 'school.finance.portal.view')
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active is true
        and p.school_id = target_school and p.role = 'school_admin'
    )
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
      and (
        required_permission not in ('school.hr.portal.view', 'school.finance.portal.view')
        or (p.role in ('teacher', 'staff') and required_permission = 'school.hr.portal.view' and a.role_key = 'hr_admin')
        or (p.role in ('teacher', 'staff') and required_permission = 'school.finance.portal.view' and a.role_key = 'finance_officer')
      )
      and (
        required_permission not in ('school.hr.portal.view', 'school.finance.portal.view')
        or not exists (
          select 1 from public.school_staff_role_assignments other
          where other.profile_id = a.profile_id and other.school_id = a.school_id
            and other.role_key = case required_permission
              when 'school.hr.portal.view' then 'finance_officer'
              else 'hr_admin'
            end
        )
      )
  )
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and a.role_key = any(allowed_roles)
  )
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;
