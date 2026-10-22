-- Capture the requested learner class during signup and scope activities by class/subject.

alter table public.school_portal_signup_requests
  add column if not exists requested_class_id uuid references public.classes(id) on delete set null;

create or replace function public.get_public_school_classes(p_school_slug text)
returns table(id uuid, name text, grade text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.grade
  from public.classes c join public.schools s on s.id = c.school_id
  where s.slug = p_school_slug and s.status = 'active'
  order by lower(coalesce(c.grade,'')), lower(c.name), c.id
$$;
revoke all on function public.get_public_school_classes(text) from public;
grant execute on function public.get_public_school_classes(text) to anon, authenticated;

create or replace function public.get_public_school_profiles()
returns table(id uuid, name text, slug text, school_level text, address text)
language sql stable security definer set search_path = '' as $$
  select s.id,s.name,s.slug,s.school_level,s.address from public.schools s
  where s.status='active' order by lower(s.name),s.id
$$;
revoke all on function public.get_public_school_profiles() from public;
grant execute on function public.get_public_school_profiles() to anon,authenticated;

create or replace function public.get_public_school_profile(p_school_slug text)
returns table(id uuid, name text, slug text, school_level text, address text)
language sql stable security definer set search_path = '' as $$
  select s.id,s.name,s.slug,s.school_level,s.address from public.schools s
  where s.status='active' and s.slug=p_school_slug limit 1
$$;
revoke all on function public.get_public_school_profile(text) from public;
grant execute on function public.get_public_school_profile(text) to anon,authenticated;

-- Public signup metadata is a request only. Approval validates the selected
-- class against this school's real learner record before linking the account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_school uuid; claimed_school uuid; requested_role public.user_role := 'student';
  requested_access text; requested_class uuid; school_name text;
begin
  if new.raw_user_meta_data->>'school_portal_signup' = 'true' then
    begin
      requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
      requested_class := nullif(new.raw_user_meta_data->>'requested_class_id', '')::uuid;
    exception when invalid_text_representation then raise exception 'Choose a valid school and class.';
    end;
    begin requested_role := coalesce(nullif(new.raw_user_meta_data->>'requested_portal_role','')::public.user_role, 'student');
    exception when invalid_text_representation then raise exception 'Choose a valid school portal.'; end;
    requested_access := nullif(new.raw_user_meta_data->>'requested_portal_access','');
    if requested_school is null or requested_role not in ('teacher','student','parent','staff')
       or (requested_access is not null and (requested_role <> 'staff' or requested_access not in ('hr','finance'))) then
      raise exception 'Choose a valid school and portal.';
    end if;
    if requested_role in ('student','parent') and (requested_class is null or not exists (
      select 1 from public.classes c where c.id=requested_class and c.school_id=requested_school
    )) then raise exception 'Choose a class or level offered by this school.'; end if;
    select s.name into school_name from public.schools s where s.id=requested_school and s.status='active';
    if school_name is null then raise exception 'This school is not accepting portal registrations.'; end if;
    insert into public.profiles(id,school_id,full_name,phone,role,is_active)
    values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role,false);
    insert into public.school_portal_signup_requests(user_id,school_id,full_name,email,requested_role,requested_access,admission_number,requested_class_id)
    values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),lower(new.email),requested_role,requested_access,
      nullif(trim(new.raw_user_meta_data->>'admission_number'),''),requested_class);
    return new;
  end if;
  if new.raw_user_meta_data->>'role' = 'school_admin' then
    begin requested_school := nullif(new.raw_user_meta_data->>'school_id','')::uuid;
    exception when invalid_text_representation then requested_school := null; end;
    if requested_school is not null then
      perform set_config('app.school_claim_id',requested_school::text,true);
      perform set_config('app.school_claim_user',new.id::text,true);
      update public.schools set admin_user_id=new.id where id=requested_school and status='pending'
        and admin_user_id is null and lower(admin_email)=lower(new.email) returning id into claimed_school;
      if claimed_school is not null then requested_role := 'school_admin'; else requested_school := null; end if;
    end if;
  else requested_school := null; end if;
  insert into public.profiles(id,school_id,full_name,phone,role)
  values(new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role);
  return new;
end $$;

drop function if exists public.submit_google_school_portal_signup(text,text,text,text,text);
create function public.submit_google_school_portal_signup(
  p_school_slug text, p_full_name text, p_requested_role text,
  p_requested_access text default null, p_admission_number text default null,
  p_requested_class_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; account auth.users; target_school public.schools;
  resolved_name text; resolved_role public.user_role; resolved_access text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in with Google before submitting a school request.' using errcode='42501'; end if;
  select * into account from auth.users u where u.id=(select auth.uid());
  if account.id is null or account.email_confirmed_at is null then raise exception 'Verify your Google account email before submitting a school request.'; end if;
  select * into actor from public.profiles p where p.id=account.id for update;
  if actor.id is null or actor.school_id is not null or actor.role <> 'student' or actor.is_active is not true then raise exception 'This Google account is already linked to a school or is not eligible for a new school request.'; end if;
  select * into target_school from public.schools s where s.slug=p_school_slug and s.status='active';
  if target_school.id is null then raise exception 'This school is not accepting portal registrations.'; end if;
  begin resolved_role := p_requested_role::public.user_role;
  exception when invalid_text_representation then raise exception 'Choose a valid school portal.'; end;
  resolved_access := nullif(trim(coalesce(p_requested_access,'')), '');
  if resolved_role not in ('teacher','student','parent','staff') or
    (resolved_access is not null and (resolved_role <> 'staff' or resolved_access not in ('hr','finance'))) then raise exception 'Choose a valid school portal.'; end if;
  if resolved_role in ('student','parent') and nullif(trim(coalesce(p_admission_number,'')),'') is null then raise exception 'Enter the learner admission number provided by the school.'; end if;
  if resolved_role in ('student','parent') and (p_requested_class_id is null or not exists(
    select 1 from public.classes c where c.id=p_requested_class_id and c.school_id=target_school.id
  )) then raise exception 'Choose a class or level offered by this school.'; end if;
  resolved_name := left(trim(coalesce(nullif(p_full_name,''),actor.full_name,account.raw_user_meta_data->>'full_name',account.raw_user_meta_data->>'name','')),160);
  if length(resolved_name)<2 then raise exception 'Enter your full name before requesting a school account.'; end if;
  perform set_config('app.submit_school_portal_signup',account.id::text,true);
  update public.profiles set school_id=target_school.id,full_name=resolved_name,role=resolved_role,is_active=false
    where id=account.id and school_id is null and role='student' and is_active is true;
  if not found then raise exception 'This Google account is already linked to a school.'; end if;
  insert into public.school_portal_signup_requests(user_id,school_id,full_name,email,requested_role,requested_access,admission_number,requested_class_id)
  values(account.id,target_school.id,resolved_name,lower(account.email),resolved_role,resolved_access,nullif(trim(coalesce(p_admission_number,'')),''),p_requested_class_id);
end $$;
revoke all on function public.submit_google_school_portal_signup(text,text,text,text,text,uuid) from public,anon;
grant execute on function public.submit_google_school_portal_signup(text,text,text,text,text,uuid) to authenticated;

create or replace function public.approve_school_portal_signup(p_user_id uuid,p_student_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; request_row public.school_portal_signup_requests; auth_email_confirmed timestamptz;
  linked_student public.students; role_key text;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role<>'school_admin' or actor.school_id is null then raise exception 'An active school administrator is required.' using errcode='42501'; end if;
  if not exists(select 1 from public.schools s where s.id=actor.school_id and s.status='active') then raise exception 'Only an active school can approve portal registrations.' using errcode='42501'; end if;
  select * into request_row from public.school_portal_signup_requests r where r.user_id=p_user_id and r.school_id=actor.school_id and r.status='pending' for update;
  if request_row.user_id is null then raise exception 'Pending registration request not found.'; end if;
  select u.email_confirmed_at into auth_email_confirmed from auth.users u where u.id=p_user_id;
  if auth_email_confirmed is null then raise exception 'The applicant must verify their email before approval.'; end if;
  if request_row.requested_role in ('student','parent') then
    if p_student_id is null then raise exception 'Choose the learner record to link to this account.'; end if;
    select * into linked_student from public.students s where s.id=p_student_id and s.school_id=actor.school_id for update;
    if linked_student.id is null or lower(trim(coalesce(linked_student.admission_number,''))) <> lower(trim(request_row.admission_number)) then raise exception 'The selected learner does not match the admission number submitted by the applicant.'; end if;
    if request_row.requested_class_id is null or not exists(select 1 from public.classes c where c.id=request_row.requested_class_id and c.school_id=actor.school_id) then raise exception 'The requested class is no longer available. Ask the applicant to submit a new request.'; end if;
    if linked_student.class_id is not null and linked_student.class_id is distinct from request_row.requested_class_id then raise exception 'The selected learner record belongs to a different class. Correct the learner class or ask the applicant to choose again.'; end if;
    if linked_student.class_id is null then
      update public.students set class_id=request_row.requested_class_id where id=linked_student.id and school_id=actor.school_id;
    end if;
    if request_row.requested_role='student' then
      if linked_student.profile_id is not null and linked_student.profile_id<>p_user_id then raise exception 'This learner already has a portal account.'; end if;
      update public.students set profile_id=p_user_id where id=linked_student.id and school_id=actor.school_id;
    else
      insert into public.student_guardians(student_id,guardian_id,relationship) values(linked_student.id,p_user_id,'parent/guardian') on conflict(student_id,guardian_id) do nothing;
    end if;
  end if;
  perform set_config('app.approve_school_portal_user',p_user_id::text,true);
  update public.profiles set is_active=true where id=p_user_id and school_id=actor.school_id and role=request_row.requested_role and is_active is false;
  if not found then raise exception 'The pending portal profile could not be activated.'; end if;
  if request_row.requested_role='staff' and request_row.requested_access is not null then
    role_key:=case request_row.requested_access when 'hr' then 'hr_admin' when 'finance' then 'finance_officer' end;
    insert into public.school_staff_role_assignments(school_id,profile_id,role_key,assigned_by) values(actor.school_id,p_user_id,role_key,actor.id) on conflict(school_id,profile_id,role_key) do nothing;
  end if;
  update public.school_portal_signup_requests set status='approved',reviewed_by=actor.id,reviewed_at=now() where user_id=p_user_id and school_id=actor.school_id and status='pending';
end $$;
revoke all on function public.approve_school_portal_signup(uuid,uuid) from public,anon;
grant execute on function public.approve_school_portal_signup(uuid,uuid) to authenticated;

alter table public.school_activities add column if not exists subject_id uuid references public.subjects(id) on delete set null;
create index if not exists school_activities_subject_start on public.school_activities(subject_id,starts_at);

create or replace function private.prepare_school_activity_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.school_id is distinct from old.school_id or new.created_by is distinct from old.created_by) then raise exception 'An activity cannot be reassigned to another school or creator.' using errcode='42501'; end if;
  if new.class_id is not null and not exists(select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id) then raise exception 'Choose a class from this school.'; end if;
  if new.subject_id is not null and (new.class_id is null or not exists(select 1 from public.subjects s where s.id=new.subject_id and s.school_id=new.school_id)) then raise exception 'Choose a subject from this school and assign it to a class.'; end if;
  select upper(coalesce(s.currency_code,'KES')) into new.currency_code from public.schools s where s.id=new.school_id;
  new.updated_at:=now(); return new;
end $$;

create or replace function private.can_manage_school_activities(target_school uuid,target_class uuid,target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.school_id=target_school
    and private.school_subscription_entitled(target_school) and (
      p.role='school_admin' or private.has_hr_role(target_school,array['principal'])
      or (p.role='teacher' and target_class is not null and exists(select 1 from public.classes c where c.id=target_class and c.school_id=target_school
        and ((target_subject is null and (c.teacher_id=p.id or exists(select 1 from public.teacher_subject_assignments tsa where tsa.teacher_id=p.id and tsa.school_id=target_school and tsa.class_id=c.id)))
          or (target_subject is not null and exists(select 1 from public.teacher_subject_assignments tsa where tsa.teacher_id=p.id and tsa.school_id=target_school and tsa.class_id=c.id and tsa.subject_id=target_subject)))))
    ))
$$;
revoke all on function private.can_manage_school_activities(uuid,uuid,uuid) from public,anon;
grant execute on function private.can_manage_school_activities(uuid,uuid,uuid) to authenticated;

create or replace function private.can_view_school_activity(target_school uuid,target_class uuid,target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.school_id=target_school
    and private.school_subscription_entitled(target_school) and (
      target_class is null and target_subject is null
      or p.role='school_admin'
      or private.has_hr_role(target_school,array['principal','finance_officer'])
      or (p.role='teacher' and exists(select 1 from public.classes c where c.id=target_class and c.school_id=target_school and
        (c.teacher_id=p.id or exists(select 1 from public.teacher_subject_assignments tsa where tsa.teacher_id=p.id and tsa.school_id=target_school and tsa.class_id=c.id and
          (target_subject is null or tsa.subject_id=target_subject)))))
      or (p.role='student' and exists(select 1 from public.students s where s.school_id=target_school and s.class_id=target_class and s.profile_id=p.id))
      or (p.role='parent' and exists(select 1 from public.students s join public.student_guardians g on g.student_id=s.id where s.school_id=target_school and s.class_id=target_class and g.guardian_id=p.id))
    ))
$$;
revoke all on function private.can_view_school_activity(uuid,uuid,uuid) from public,anon;
grant execute on function private.can_view_school_activity(uuid,uuid,uuid) to authenticated;

create or replace function private.can_manage_school_activities(target_school uuid,target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select private.can_manage_school_activities(target_school,target_class,null::uuid) $$;
revoke all on function private.can_manage_school_activities(uuid,uuid) from public,anon;
grant execute on function private.can_manage_school_activities(uuid,uuid) to authenticated;
drop policy if exists school_activities_read on public.school_activities;
create policy school_activities_read on public.school_activities for select to authenticated using(status in ('published','cancelled') and private.can_view_school_activity(school_id,class_id,subject_id));
drop policy if exists school_activities_create on public.school_activities;
create policy school_activities_create on public.school_activities for insert to authenticated with check(created_by=(select auth.uid()) and private.can_manage_school_activities(school_id,class_id,subject_id));
drop policy if exists school_activities_update on public.school_activities;
create policy school_activities_update on public.school_activities for update to authenticated
  using((created_by=(select auth.uid()) and private.can_manage_school_activities(school_id,class_id,subject_id)) or private.can_oversee_school_activities(school_id))
  with check((created_by=(select auth.uid()) and private.can_manage_school_activities(school_id,class_id,subject_id)) or private.can_oversee_school_activities(school_id));

create or replace function public.register_for_free_school_activity(p_activity_id uuid,p_student_id uuid)
returns public.school_activity_registrations language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; activity public.school_activities; learner public.students; result public.school_activity_registrations; guardian boolean;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role not in ('parent','student') then raise exception 'Sign in as the learner or their parent to register.' using errcode='42501'; end if;
  select * into activity from public.school_activities a where a.id=p_activity_id and a.school_id=actor.school_id for update;
  if activity.id is null or activity.status<>'published' or activity.is_free is not true then raise exception 'This free activity is not available for registration.'; end if;
  if activity.starts_at<=now() or (activity.registration_deadline is not null and activity.registration_deadline<=now()) then raise exception 'Registration for this activity has closed.'; end if;
  if not private.school_subscription_entitled(activity.school_id) then raise exception 'This school workspace is not currently active.'; end if;
  select * into learner from public.students s where s.id=p_student_id and s.school_id=activity.school_id;
  if learner.id is null or (activity.class_id is not null and learner.class_id is distinct from activity.class_id) then raise exception 'Choose a learner who is eligible for this activity.'; end if;
  select exists(select 1 from public.student_guardians g where g.student_id=learner.id and g.guardian_id=actor.id) into guardian;
  if not ((actor.role='parent' and guardian) or (actor.role='student' and learner.profile_id=actor.id)) then raise exception 'You can only register yourself or a learner linked to your parent account.' using errcode='42501'; end if;
  insert into public.school_activity_registrations(school_id,activity_id,student_id,parent_id,registered_by,status)
  values(activity.school_id,activity.id,learner.id,case when actor.role='parent' then actor.id else null end,actor.id,'registered')
  on conflict(activity_id,student_id) do update set parent_id=excluded.parent_id,registered_by=excluded.registered_by,status='registered',registered_at=now(),paid_at=null
  where public.school_activity_registrations.status='cancelled' returning * into result;
  if result.id is null then raise exception 'This learner already has a registration for the activity.'; end if;
  return result;
end $$;
revoke all on function public.register_for_free_school_activity(uuid,uuid) from public,anon;
grant execute on function public.register_for_free_school_activity(uuid,uuid) to authenticated;
