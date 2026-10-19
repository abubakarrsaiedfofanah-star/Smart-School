-- Timetable authoring belongs to school administrators, principals, and
-- heads of department. Deputy principals can still view the timetable.
alter table public.school_staff_role_assignments
  drop constraint if exists school_staff_role_assignments_role_key_check;
alter table public.school_staff_role_assignments
  add constraint school_staff_role_assignments_role_key_check
  check (role_key in (
    'principal','deputy_principal','head_of_department','hr_admin','finance_officer','registrar',
    'librarian','inventory_manager','nurse','counsellor','transport_manager','staff_member'
  ));

delete from public.school_role_permission_catalog
where role_key = 'deputy_principal' and permission_key = 'school.timetable.manage';
insert into public.school_role_permission_catalog(role_key, permission_key)
values ('head_of_department', 'school.timetable.manage')
on conflict do nothing;

-- Heads need the class list and schedule rows to build the full timetable.
-- Student/parent/teacher reads remain restricted to related classes.
drop policy if exists classes_read_related on public.classes;
create policy classes_read_related on public.classes for select to authenticated using (
  private.can_view_class(id)
  or (school_id = private.current_school_id()
    and private.has_school_permission(school_id, 'school.timetable.manage'))
);

drop policy if exists timetable_read_related on public.timetable;
create policy timetable_read_related on public.timetable for select to authenticated using (
  private.can_view_class(class_id)
  or (school_id = private.current_school_id()
    and private.has_school_permission(school_id, 'school.timetable.manage'))
);

-- Schedule changes are privileged actions and require an MFA-verified session.
create or replace function private.enforce_privileged_mfa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); actor_role public.user_role; actor_school uuid; privileged boolean := false;
begin
  if actor_id is null or (select auth.role()) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select p.role, p.school_id into actor_role, actor_school from public.profiles p where p.id = actor_id;
  privileged := actor_role in ('super_admin','school_admin') or exists (
    select 1 from public.school_staff_role_assignments a
    where a.profile_id = actor_id and a.school_id = actor_school
      and a.role_key in ('principal','deputy_principal','head_of_department','hr_admin','finance_officer','registrar','inventory_manager','nurse','counsellor','transport_manager')
  );
  if privileged and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication is required for privileged changes.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_privileged_mfa() from public, anon, authenticated;
