-- Keep specialist permissions attached to a same-school teacher login, and
-- make accepted school applications enroll as a single, repeat-safe action.

delete from public.school_staff_role_assignments a
using public.profiles p
where p.id = a.profile_id
  and (p.role <> 'teacher' or p.school_id is distinct from a.school_id);

delete from public.school_hr_roles r
using public.profiles p
where p.id = r.profile_id
  and (p.role <> 'teacher' or p.school_id is distinct from r.school_id);

create or replace function private.validate_school_staff_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id
      and p.school_id = new.school_id
      and p.role = 'teacher'
  ) then
    raise exception 'Specialist roles can only be assigned to a teacher account in the same school.';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_school_staff_assignment() from public, anon, authenticated;

drop trigger if exists validate_school_staff_role_assignment on public.school_staff_role_assignments;
create trigger validate_school_staff_role_assignment
before insert or update of school_id, profile_id on public.school_staff_role_assignments
for each row execute function private.validate_school_staff_assignment();

drop trigger if exists validate_school_hr_role_assignment on public.school_hr_roles;
create trigger validate_school_hr_role_assignment
before insert or update of school_id, profile_id on public.school_hr_roles
for each row execute function private.validate_school_staff_assignment();

-- Carry forward valid assignments made through the legacy HR access screen.
insert into public.school_staff_role_assignments(school_id, profile_id, role_key, assigned_by, created_at)
select r.school_id, r.profile_id, r.hr_role, r.assigned_by, r.created_at
from public.school_hr_roles r
join public.profiles p on p.id = r.profile_id and p.school_id = r.school_id and p.role = 'teacher'
on conflict (school_id, profile_id, role_key) do nothing;

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
  ) or exists (
    select 1
    from public.school_hr_roles h
    join public.profiles p on p.id = h.profile_id and p.school_id = h.school_id and p.role = 'teacher'
    join public.school_role_permission_catalog c on c.role_key = h.hr_role
    where h.profile_id = (select auth.uid()) and h.school_id = target_school
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
    select 1 from public.school_hr_roles h
    join public.profiles p on p.id = h.profile_id and p.school_id = h.school_id and p.role = 'teacher'
    where h.profile_id = (select auth.uid()) and h.school_id = target_school and h.hr_role = any(allowed_roles)
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.role = 'teacher'
    where a.profile_id = (select auth.uid()) and a.school_id = target_school and a.role_key = any(allowed_roles)
  );
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

insert into public.school_role_permission_catalog(role_key, permission_key) values
  ('principal', 'school.inventory.view'),
  ('principal', 'school.finance.portal.view'),
  ('principal', 'school.hr.portal.view'),
  ('hr_admin', 'school.hr.portal.view'),
  ('finance_officer', 'school.finance.portal.view'),
  ('finance_officer', 'school.hr.portal.view')
on conflict do nothing;

-- Keep finance page access consistent with the role permission catalog.
drop policy if exists school_expenses_finance_read on public.school_expenses;
drop policy if exists school_expenses_finance_insert on public.school_expenses;
drop policy if exists school_expenses_finance_update on public.school_expenses;
drop policy if exists school_expenses_finance_delete on public.school_expenses;
create policy school_expenses_finance_read on public.school_expenses for select to authenticated
using (private.has_school_permission(school_id, 'school.expenses.manage'));
create policy school_expenses_finance_insert on public.school_expenses for insert to authenticated
with check (private.has_school_permission(school_id, 'school.expenses.manage')
  and created_by = (select auth.uid()) and approved_by is null and approved_at is null and status = 'recorded');
create policy school_expenses_finance_update on public.school_expenses for update to authenticated
using (private.has_school_permission(school_id, 'school.expenses.manage'))
with check (private.has_school_permission(school_id, 'school.expenses.manage')
  and (approved_by is null or (approved_by = (select auth.uid())
    and private.has_school_permission(school_id, 'school.hr.manage'))));
create policy school_expenses_finance_delete on public.school_expenses for delete to authenticated
using (private.has_school_permission(school_id, 'school.hr.manage') and status = 'recorded');

drop policy if exists assets_read_school on public.assets;
drop policy if exists "school members view assets" on public.assets;
drop policy if exists assets_admin_manage on public.assets;
drop policy if exists authorized_staff_view_assets on public.assets;
create policy authorized_staff_view_assets on public.assets for select to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id, 'school.inventory.view'));
drop policy if exists classes_read_for_admissions on public.classes;
create policy classes_read_for_admissions on public.classes for select to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id, 'school.admissions.manage'));
drop policy if exists asset_history_admin_read on public.asset_change_logs;
create policy asset_history_authorized_read on public.asset_change_logs for select to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id, 'school.inventory.manage'));

alter table public.applications add column if not exists enrolled_student_id uuid references public.students(id) on delete set null;
create unique index if not exists applications_enrolled_student_unique
  on public.applications(enrolled_student_id) where enrolled_student_id is not null;
update public.applications set status = lower(status) where status <> lower(status);

drop policy if exists "public may apply" on public.applications;
drop policy if exists public_school_admission_insert on public.applications;
revoke insert on public.applications from anon, authenticated;

create or replace function public.submit_school_application(
  target_school_slug text,
  applicant_first_name text,
  applicant_last_name text,
  applicant_date_of_birth date,
  applicant_grade_level text,
  guardian_full_name text,
  guardian_email text,
  guardian_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school uuid;
  created_application uuid;
begin
  if nullif(trim(target_school_slug), '') is null
    or nullif(trim(applicant_first_name), '') is null
    or nullif(trim(applicant_last_name), '') is null
    or applicant_date_of_birth is null
    or applicant_date_of_birth > current_date
    or nullif(trim(applicant_grade_level), '') is null
    or nullif(trim(guardian_full_name), '') is null
    or nullif(trim(guardian_email), '') is null then
    raise exception 'Complete the school, learner, date of birth, grade, and guardian details.';
  end if;
  if length(trim(applicant_first_name)) > 100 or length(trim(applicant_last_name)) > 100
    or length(trim(applicant_grade_level)) > 40 or length(trim(guardian_full_name)) > 160
    or length(trim(guardian_email)) > 254 or length(coalesce(guardian_phone, '')) > 40 then
    raise exception 'One or more application fields are too long.';
  end if;
  if position('@' in trim(guardian_email)) < 2 then raise exception 'Enter a valid guardian email address.'; end if;

  select s.id into target_school from public.schools s
  where s.slug = lower(trim(target_school_slug)) and s.status = 'active';
  if target_school is null then raise exception 'We could not find an active school with that application link.'; end if;

  insert into public.applications(
    school_id, student_first_name, student_last_name, date_of_birth, grade_level,
    parent_name, parent_email, parent_phone, status
  ) values (
    target_school, trim(applicant_first_name), trim(applicant_last_name), applicant_date_of_birth,
    trim(applicant_grade_level), trim(guardian_full_name), lower(trim(guardian_email)),
    nullif(trim(coalesce(guardian_phone, '')), ''), 'pending'
  ) returning id into created_application;

  return created_application;
end;
$$;
revoke all on function public.submit_school_application(text, text, text, date, text, text, text, text) from public;
grant execute on function public.submit_school_application(text, text, text, date, text, text, text, text) to anon, authenticated;

create or replace function public.enroll_school_application(target_application uuid, target_class uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_school uuid := private.current_school_id();
  application_row public.applications%rowtype;
  created_student uuid;
  new_admission_number text;
begin
  if active_school is null or not private.has_school_permission(active_school, 'school.admissions.manage') then
    raise exception 'You do not have permission to enroll applicants.';
  end if;

  select * into application_row
  from public.applications a
  where a.id = target_application and a.school_id = active_school
  for update;
  if not found then raise exception 'Application not found in this school.'; end if;

  if application_row.status = 'enrolled' and application_row.enrolled_student_id is not null then
    return application_row.enrolled_student_id;
  end if;
  if application_row.status <> 'accepted' then
    raise exception 'Only accepted applications can be enrolled.';
  end if;
  if target_class is not null and not exists (
    select 1 from public.classes c where c.id = target_class and c.school_id = active_school
  ) then
    raise exception 'The selected class does not belong to this school.';
  end if;

  new_admission_number := 'ADM-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(application_row.id::text, '-', ''), 1, 8));
  insert into public.students(school_id, full_name, date_of_birth, admission_number, class_id)
  values (
    active_school,
    trim(application_row.student_first_name || ' ' || application_row.student_last_name),
    application_row.date_of_birth,
    new_admission_number,
    target_class
  ) returning id into created_student;

  update public.applications
  set status = 'enrolled', enrolled_student_id = created_student
  where id = application_row.id and school_id = active_school;

  return created_student;
end;
$$;
revoke all on function public.enroll_school_application(uuid, uuid) from public, anon;
grant execute on function public.enroll_school_application(uuid, uuid) to authenticated;
