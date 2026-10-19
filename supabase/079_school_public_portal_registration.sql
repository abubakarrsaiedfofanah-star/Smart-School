-- Public school directory and school-approved portal account registration.
-- Apply after migrations 001-078. School admins must review each request before
-- a new account becomes active. No public signup can create a school admin.

create table if not exists public.school_portal_signup_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  email text not null,
  requested_role public.user_role not null check (requested_role in ('teacher','student','parent','staff')),
  requested_access text check (requested_access is null or requested_access in ('hr','finance')),
  admission_number text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint portal_signup_access_only_staff check (requested_access is null or requested_role = 'staff'),
  constraint portal_signup_student_number_required check (requested_role not in ('student','parent') or nullif(trim(admission_number),'') is not null)
);

create index if not exists school_portal_signup_school_pending
  on public.school_portal_signup_requests(school_id, created_at desc) where status = 'pending';
create unique index if not exists school_portal_signup_one_pending_email
  on public.school_portal_signup_requests(school_id, lower(email)) where status = 'pending';

alter table public.school_portal_signup_requests enable row level security;
revoke all on public.school_portal_signup_requests from public, anon, authenticated;
grant select on public.school_portal_signup_requests to authenticated;
create policy portal_signup_admin_read on public.school_portal_signup_requests
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.is_active is true and p.role = 'school_admin' and p.school_id = school_id)
    or user_id = (select auth.uid())
  );

-- Expose only active school names and slugs to the public school picker.
create or replace function public.get_public_school_directory()
returns table(id uuid, name text, slug text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug from public.schools s
  where s.status = 'active' order by lower(s.name), s.id
$$;
revoke all on function public.get_public_school_directory() from public;
grant execute on function public.get_public_school_directory() to anon, authenticated;

-- Registration metadata is only a request. The account stays inactive until
-- an active administrator of the selected school approves it.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_school uuid;
  claimed_school uuid;
  requested_role public.user_role := 'student';
  requested_access text;
  school_name text;
begin
  if new.raw_user_meta_data->>'school_portal_signup' = 'true' then
    begin
      requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Choose a valid school.';
    end;
    begin
      requested_role := coalesce(nullif(new.raw_user_meta_data->>'requested_portal_role','')::public.user_role, 'student');
    exception when invalid_text_representation then
      raise exception 'Choose a valid school portal.';
    end;
    requested_access := nullif(new.raw_user_meta_data->>'requested_portal_access','');
    if requested_school is null or requested_role not in ('teacher','student','parent','staff')
       or (requested_access is not null and (requested_role <> 'staff' or requested_access not in ('hr','finance'))) then
      raise exception 'Choose a valid school and portal.';
    end if;
    select s.name into school_name from public.schools s where s.id = requested_school and s.status = 'active';
    if school_name is null then raise exception 'This school is not accepting portal registrations.'; end if;
    insert into public.profiles(id,school_id,full_name,phone,role,is_active)
    values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role,false);
    insert into public.school_portal_signup_requests(user_id,school_id,full_name,email,requested_role,requested_access,admission_number)
    values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),lower(new.email),requested_role,requested_access,
      nullif(trim(new.raw_user_meta_data->>'admission_number'),''));
    return new;
  end if;

  -- Preserve the existing one-time school administrator claim. This is the
  -- only public path that can create a school_admin profile.
  if new.raw_user_meta_data->>'role' = 'school_admin' then
    begin
      requested_school := nullif(new.raw_user_meta_data->>'school_id','')::uuid;
    exception when invalid_text_representation then
      requested_school := null;
    end;
    if requested_school is not null then
      perform set_config('app.school_claim_id',requested_school::text,true);
      perform set_config('app.school_claim_user',new.id::text,true);
      update public.schools set admin_user_id = new.id where id = requested_school and status = 'pending'
        and admin_user_id is null and lower(admin_email) = lower(new.email) returning id into claimed_school;
      if claimed_school is not null then requested_role := 'school_admin'; else requested_school := null; end if;
    end if;
  else
    requested_school := null;
  end if;
  insert into public.profiles(id,school_id,full_name,phone,role)
  values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role);
  return new;
end $$;

-- Enforce one school_admin profile per tenant, in addition to the unique
-- schools.admin_user_id registration claim.
create unique index if not exists profiles_one_school_admin_per_school
  on public.profiles(school_id) where role = 'school_admin' and school_id is not null;

-- Let the approval RPC perform exactly one inactive-to-active transition for
-- a pending account in the caller's own school.
create or replace function public.protect_profile_role_and_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles p where p.id = (select auth.uid());
  if coalesce((select auth.role()),'') = 'service_role' or actor.role = 'super_admin' then return new; end if;
  if new.role is not distinct from old.role and new.school_id is not distinct from old.school_id
     and old.is_active is false and new.is_active is true
     and current_setting('app.approve_school_portal_user',true) = old.id::text
     and actor.role = 'school_admin' and actor.is_active is true and actor.school_id = old.school_id
     and exists (select 1 from public.school_portal_signup_requests r
       where r.user_id = old.id and r.school_id = old.school_id and r.status = 'pending') then
    return new;
  end if;
  if new.role is distinct from old.role or new.school_id is distinct from old.school_id
     or new.is_active is distinct from old.is_active then
    raise exception 'Only the platform administrator or school approval workflow can change account role, school, or active status.';
  end if;
  return new;
end $$;

create or replace function public.approve_school_portal_signup(p_user_id uuid,p_student_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; request_row public.school_portal_signup_requests; auth_email_confirmed timestamptz;
  linked_student public.students; expected_admission text; role_key text;
begin
  select * into actor from public.profiles p where p.id = (select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role <> 'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.schools s where s.id=actor.school_id and s.status='active') then
    raise exception 'Only an active school can approve portal registrations.' using errcode = '42501';
  end if;
  select * into request_row from public.school_portal_signup_requests r
    where r.user_id = p_user_id and r.school_id = actor.school_id and r.status = 'pending' for update;
  if request_row.user_id is null then raise exception 'Pending registration request not found.'; end if;
  select u.email_confirmed_at into auth_email_confirmed from auth.users u where u.id = p_user_id;
  if auth_email_confirmed is null then raise exception 'The applicant must verify their email before approval.'; end if;
  if request_row.requested_role in ('student','parent') then
    if p_student_id is null then raise exception 'Choose the learner record to link to this account.'; end if;
    select * into linked_student from public.students s where s.id = p_student_id and s.school_id = actor.school_id for update;
    if linked_student.id is null or lower(trim(coalesce(linked_student.admission_number,''))) <> lower(trim(request_row.admission_number)) then
      raise exception 'The selected learner does not match the admission number submitted by the applicant.';
    end if;
    if request_row.requested_role = 'student' then
      if linked_student.profile_id is not null and linked_student.profile_id <> p_user_id then raise exception 'This learner already has a portal account.'; end if;
      update public.students set profile_id = p_user_id where id = linked_student.id and school_id = actor.school_id;
    else
      insert into public.student_guardians(student_id,guardian_id,relationship)
      values (linked_student.id,p_user_id,'parent/guardian') on conflict (student_id,guardian_id) do nothing;
    end if;
  end if;
  perform set_config('app.approve_school_portal_user',p_user_id::text,true);
  update public.profiles set is_active = true where id = p_user_id and school_id = actor.school_id
    and role = request_row.requested_role and is_active is false;
  if not found then raise exception 'The pending portal profile could not be activated.'; end if;
  if request_row.requested_role = 'staff' and request_row.requested_access is not null then
    role_key := case request_row.requested_access when 'hr' then 'hr_admin' when 'finance' then 'finance_officer' end;
    insert into public.school_staff_role_assignments(school_id,profile_id,role_key,assigned_by)
    values (actor.school_id,p_user_id,role_key,actor.id) on conflict (school_id,profile_id,role_key) do nothing;
  end if;
  update public.school_portal_signup_requests set status='approved',reviewed_by=actor.id,reviewed_at=now()
    where user_id=p_user_id and school_id=actor.school_id and status='pending';
end $$;
revoke all on function public.approve_school_portal_signup(uuid,uuid) from public,anon;
grant execute on function public.approve_school_portal_signup(uuid,uuid) to authenticated;

create or replace function public.reject_school_portal_signup(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role <> 'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator is required.' using errcode='42501';
  end if;
  if not exists (select 1 from public.schools s where s.id=actor.school_id and s.status='active') then
    raise exception 'Only an active school can review portal registrations.' using errcode='42501';
  end if;
  update public.school_portal_signup_requests set status='rejected',reviewed_by=actor.id,reviewed_at=now()
    where user_id=p_user_id and school_id=actor.school_id and status='pending';
  if not found then raise exception 'Pending registration request not found.'; end if;
end $$;
revoke all on function public.reject_school_portal_signup(uuid) from public,anon;
grant execute on function public.reject_school_portal_signup(uuid) to authenticated;

