-- School portal roles stay in profiles.role. This table adds assignable,
-- combinable staff responsibilities without multiplying login portals.
create table if not exists public.school_staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null check (role_key in (
    'principal','deputy_principal','hr_admin','finance_officer','registrar',
    'librarian','inventory_manager','nurse','counsellor','transport_manager','staff_member'
  )),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, profile_id, role_key)
);

create table if not exists public.school_role_permission_catalog (
  role_key text not null,
  permission_key text not null,
  primary key (role_key, permission_key)
);
insert into public.school_role_permission_catalog(role_key, permission_key) values
 ('principal','school.timetable.manage'),('principal','school.attendance.manage'),('principal','school.staff_attendance.manage'),('principal','school.inventory.manage'),('principal','school.expenses.manage'),('principal','school.finance.reconcile'),('principal','school.hr.manage'),('principal','school.admissions.manage'),('principal','school.library.manage'),('principal','school.health.manage'),('principal','school.wellbeing.manage'),('principal','school.transport.manage'),('principal','school.reports.view'),('principal','school.hr.payroll'),
 ('deputy_principal','school.timetable.manage'),('deputy_principal','school.attendance.manage'),('deputy_principal','school.staff_attendance.manage'),('deputy_principal','school.inventory.view'),('deputy_principal','school.admissions.manage'),('deputy_principal','school.reports.view'),
 ('hr_admin','school.staff_attendance.manage'),('hr_admin','school.hr.manage'),('hr_admin','school.hr.payroll'),
 ('finance_officer','school.expenses.manage'),('finance_officer','school.finance.reconcile'),('finance_officer','school.hr.payroll'),
 ('registrar','school.admissions.manage'),('registrar','school.students.manage'),
 ('librarian','school.library.manage'),('librarian','school.inventory.view'),
 ('inventory_manager','school.inventory.manage'),('inventory_manager','school.inventory.view'),
 ('nurse','school.health.manage'),('counsellor','school.wellbeing.manage'),('transport_manager','school.transport.manage'),('staff_member','school.profile.view')
on conflict do nothing;

-- Preserve existing HR assignments and allow one person to hold several roles.
insert into public.school_staff_role_assignments(school_id, profile_id, role_key, assigned_by, created_at)
select school_id, profile_id, hr_role, assigned_by, created_at from public.school_hr_roles
on conflict (school_id, profile_id, role_key) do nothing;

create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
  ) or exists (
    select 1 from public.school_hr_roles h
    join public.school_role_permission_catalog c on c.role_key = h.hr_role
    where h.profile_id = (select auth.uid()) and h.school_id = target_school
      and c.permission_key = required_permission
  );
$$;
revoke all on function private.has_school_permission(uuid,text) from public, anon;
grant execute on function private.has_school_permission(uuid,text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.school_id = target_school and p.role = 'school_admin')
    or exists (select 1 from public.school_hr_roles h where h.profile_id = (select auth.uid())
      and h.school_id = target_school and h.hr_role = any(allowed_roles))
    or exists (select 1 from public.school_staff_role_assignments a
      where a.profile_id = (select auth.uid()) and a.school_id = target_school and a.role_key = any(allowed_roles));
$$;
revoke all on function private.has_hr_role(uuid,text[]) from public, anon;
grant execute on function private.has_hr_role(uuid,text[]) to authenticated;

alter table public.school_staff_role_assignments enable row level security;
alter table public.school_role_permission_catalog enable row level security;
create policy school_role_catalog_read on public.school_role_permission_catalog for select to authenticated using (true);
create policy school_staff_roles_read on public.school_staff_role_assignments for select to authenticated using (
  profile_id = (select auth.uid()) or exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'
  )
);
create policy school_staff_roles_admin_manage on public.school_staff_role_assignments for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'))
with check (exists (select 1 from public.profiles p join public.profiles target on target.id = school_staff_role_assignments.profile_id
  where p.id = (select auth.uid()) and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'
    and target.school_id = school_staff_role_assignments.school_id and target.role = 'teacher'));
revoke insert, update, delete on public.school_role_permission_catalog from authenticated;

-- Timetable rows can be managed by principals and deputies, with the school
-- admin retaining full control. Existing audience read policies stay intact.
drop policy if exists timetable_admin_insert on public.timetable;
drop policy if exists timetable_admin_update on public.timetable;
drop policy if exists timetable_admin_delete on public.timetable;
create policy timetable_admin_insert on public.timetable for insert to authenticated with check (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.timetable.manage')
  and exists (select 1 from public.classes c join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id and c.school_id = timetable.school_id and s.school_id = timetable.school_id)
);
create policy timetable_admin_update on public.timetable for update to authenticated using (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.timetable.manage')
) with check (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.timetable.manage')
  and exists (select 1 from public.classes c join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id and c.school_id = timetable.school_id and s.school_id = timetable.school_id)
);
create policy timetable_admin_delete on public.timetable for delete to authenticated using (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.timetable.manage')
);

drop policy if exists "admins manage assets" on public.assets;
create policy "authorized staff manage assets" on public.assets for all to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.inventory.manage'))
with check (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.inventory.manage'));

drop policy if exists "admins manage applications" on public.applications;
create policy "authorized staff manage applications" on public.applications for all to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.admissions.manage'))
with check (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.admissions.manage'));

drop policy if exists staff_attendance_admin_read on public.staff_attendance;
drop policy if exists staff_attendance_admin_manage on public.staff_attendance;
create policy staff_attendance_admin_read on public.staff_attendance for select to authenticated using (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.staff_attendance.manage')
);
create policy staff_attendance_admin_manage on public.staff_attendance for all to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.staff_attendance.manage'))
with check (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.staff_attendance.manage')
  and exists (select 1 from public.profiles p where p.id = staff_profile_id and p.school_id = staff_attendance.school_id and p.role in ('school_admin','teacher'))
  and recorded_by = (select auth.uid()));

create or replace function private.enforce_privileged_mfa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); actor_role public.user_role; actor_school uuid; privileged boolean := false;
begin
  if actor_id is null or (select auth.role()) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if; return new;
  end if;
  select p.role, p.school_id into actor_role, actor_school from public.profiles p where p.id = actor_id;
  privileged := actor_role in ('super_admin','school_admin') or exists (
    select 1 from public.school_staff_role_assignments a where a.profile_id = actor_id and a.school_id = actor_school
      and a.role_key in ('principal','deputy_principal','hr_admin','finance_officer','registrar','inventory_manager','nurse','counsellor','transport_manager')
  ) or exists (select 1 from public.school_hr_roles h where h.profile_id = actor_id and h.school_id = actor_school
      and h.hr_role in ('principal','hr_admin','finance_officer'));
  if privileged and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication is required for privileged changes.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end; $$;

drop trigger if exists enforce_privileged_mfa on public.school_staff_role_assignments;
create trigger enforce_privileged_mfa before insert or update or delete on public.school_staff_role_assignments
for each row execute function private.enforce_privileged_mfa();
