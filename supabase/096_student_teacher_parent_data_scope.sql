-- Tighten class membership helpers and ensure subject-specific learning
-- materials are visible only through a learner's or parent's class matrix.

create or replace function private.can_view_class(target_class uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.classes c
    join public.profiles actor on actor.id = (select auth.uid())
    where c.id = target_class
      and actor.is_active is true
      and actor.school_id = c.school_id
      and private.school_subscription_entitled(c.school_id)
      and (
        actor.role = 'school_admin'
        or (actor.role = 'teacher' and (
          c.teacher_id = actor.id
          or exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = c.school_id and tsa.class_id = c.id
              and tsa.teacher_id = actor.id
          )
        ))
        or (actor.role = 'student' and exists (
          select 1 from public.students s
          where s.school_id = c.school_id and s.class_id = c.id
            and s.profile_id = actor.id
        ))
        or (actor.role = 'parent' and exists (
          select 1 from public.student_guardians g
          join public.students s on s.id = g.student_id and s.school_id = c.school_id
          where g.guardian_id = actor.id and s.class_id = c.id
        ))
      )
  )
$$;

create or replace function private.can_view_student(target_student uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.students s
    join public.profiles actor on actor.id = (select auth.uid())
    where s.id = target_student
      and s.school_id = actor.school_id
      and actor.is_active is true
      and private.school_subscription_entitled(s.school_id)
      and (
        actor.role = 'school_admin'
        or (actor.role = 'student' and s.profile_id = actor.id)
        or (actor.role = 'teacher' and exists (
          select 1 from public.classes c
          where c.id = s.class_id and c.school_id = s.school_id
            and (c.teacher_id = actor.id or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.school_id = c.school_id and tsa.class_id = c.id
                and tsa.teacher_id = actor.id
            ))
        ))
        or (actor.role = 'parent' and exists (
          select 1 from public.student_guardians g
          where g.student_id = s.id and g.guardian_id = actor.id
        ))
      )
  )
$$;
revoke all on function private.can_view_class(uuid) from public, anon;
revoke all on function private.can_view_student(uuid) from public, anon;
grant execute on function private.can_view_class(uuid) to authenticated;
grant execute on function private.can_view_student(uuid) to authenticated;

-- Teachers see only subjects explicitly assigned to them. Homeroom access to
-- a class does not implicitly grant access to every subject taught there.
create or replace function private.can_view_school_subject(target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_role() = 'super_admin'
    or exists (
      select 1 from public.subjects subject_row
      join public.profiles actor on actor.school_id = subject_row.school_id
      where subject_row.id = target_subject
        and actor.id = (select auth.uid())
        and actor.is_active is true
        and private.school_subscription_entitled(actor.school_id)
        and (
          actor.role in ('school_admin','staff')
          or (actor.role = 'teacher' and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = actor.school_id and tsa.subject_id = subject_row.id
              and tsa.teacher_id = actor.id
          ))
          or (actor.role = 'student' and exists (
            select 1 from public.students learner
            join public.teacher_subject_assignments tsa on tsa.school_id = learner.school_id
              and tsa.class_id = learner.class_id and tsa.subject_id = subject_row.id
            where learner.school_id = actor.school_id and learner.profile_id = actor.id
          ))
          or (actor.role = 'parent' and exists (
            select 1 from public.student_guardians guardian
            join public.students learner on learner.id = guardian.student_id
            join public.teacher_subject_assignments tsa on tsa.school_id = learner.school_id
              and tsa.class_id = learner.class_id and tsa.subject_id = subject_row.id
            where learner.school_id = actor.school_id and guardian.guardian_id = actor.id
          ))
        )
    )
$$;
revoke all on function private.can_view_school_subject(uuid) from public, anon;
grant execute on function private.can_view_school_subject(uuid) to authenticated;

drop policy if exists teacher_subject_assignments_read_related on public.teacher_subject_assignments;
create policy teacher_subject_assignments_read_related on public.teacher_subject_assignments
for select to authenticated using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or private.has_school_permission(school_id, 'school.assignments.manage')
    or private.has_hr_role(school_id, array['principal'])
    or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))
    or (private.current_role() in ('student','parent') and private.can_view_class(class_id))
  )
);

-- A subject resource belongs to a subject and, optionally, one class. Learners
-- and parents can read it only if that subject is assigned to a class they can
-- access. A class-wide resource is still subject-scoped.
drop policy if exists subject_resources_read_scope on public.subject_resources;
create policy subject_resources_read_scope on public.subject_resources
for select to authenticated using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and exists (
      select 1 from public.teacher_subject_assignments tsa
      where tsa.school_id = subject_resources.school_id
        and tsa.teacher_id = (select auth.uid())
        and tsa.subject_id = subject_resources.subject_id
        and (subject_resources.class_id is null or tsa.class_id = subject_resources.class_id)
    ))
    or (private.current_role() in ('student','parent') and exists (
      select 1 from public.teacher_subject_assignments tsa
      where tsa.school_id = subject_resources.school_id
        and tsa.subject_id = subject_resources.subject_id
        and (subject_resources.class_id is null or tsa.class_id = subject_resources.class_id)
        and private.can_view_class(tsa.class_id)
    ))
  )
);

-- Give every school record a stable identifier that can be shared privately
-- with a parent for a supervised account link.
alter table public.students add column if not exists student_registration_id text;
update public.students
set student_registration_id = 'STU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
where student_registration_id is null or btrim(student_registration_id) = '';
alter table public.students alter column student_registration_id
  set default ('STU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)));
alter table public.students alter column student_registration_id set not null;
create unique index if not exists students_registration_id_unique
  on public.students(student_registration_id);

alter table public.school_portal_signup_requests
  add column if not exists student_registration_id text,
  add column if not exists parent_national_id text;

-- Rebuild signup capture so parent ID information is held only in the
-- school-scoped review request; public users cannot attach a guardian link.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_school uuid; claimed_school uuid; requested_role public.user_role := 'student';
  requested_access text; requested_class uuid; school_name text;
begin
  if new.raw_user_meta_data->>'school_portal_signup' = 'true' then
    begin
      requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
      requested_class := nullif(new.raw_user_meta_data->>'requested_class_id', '')::uuid;
    exception when invalid_text_representation then raise exception 'Choose a valid school and class.'; end;
    begin requested_role := coalesce(nullif(new.raw_user_meta_data->>'requested_portal_role','')::public.user_role, 'student');
    exception when invalid_text_representation then raise exception 'Choose a valid school portal.'; end;
    requested_access := nullif(new.raw_user_meta_data->>'requested_portal_access','');
    if requested_school is null or requested_role not in ('teacher','student','parent','staff')
       or (requested_access is not null and (requested_role <> 'staff' or requested_access not in ('hr','finance'))) then
      raise exception 'Choose a valid school and portal.';
    end if;
    if requested_role = 'student' and (requested_class is null or not exists (
      select 1 from public.classes c where c.id=requested_class and c.school_id=requested_school
    )) then raise exception 'Choose a class or level offered by this school.'; end if;
    if requested_role = 'parent' and (nullif(btrim(new.raw_user_meta_data->>'student_registration_id'),'') is null
      or nullif(btrim(new.raw_user_meta_data->>'parent_national_id'),'') is null) then
      raise exception 'Enter the learner registration ID and your national ID.';
    end if;
    if requested_role = 'student' and nullif(btrim(new.raw_user_meta_data->>'admission_number'),'') is null then
      raise exception 'Enter the admission number provided by the school.';
    end if;
    select s.name into school_name from public.schools s where s.id=requested_school and s.status='active';
    if school_name is null then raise exception 'This school is not accepting portal registrations.'; end if;
    insert into public.profiles(id,school_id,full_name,phone,role,is_active)
      values(new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role,false);
    insert into public.school_portal_signup_requests(
      user_id,school_id,full_name,email,requested_role,requested_access,admission_number,requested_class_id,
      student_registration_id,parent_national_id
    ) values (
      new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),lower(new.email),requested_role,requested_access,
      nullif(btrim(new.raw_user_meta_data->>'admission_number'),''),requested_class,
      nullif(upper(btrim(new.raw_user_meta_data->>'student_registration_id')),''),
      nullif(btrim(new.raw_user_meta_data->>'parent_national_id'),'')
    );
    if requested_role = 'parent' then
      update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'parent_national_id'
      where id = new.id;
    end if;
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

-- Admin approval still verifies the selected school record; a parent request
-- is matched by the generated registration ID and does not alter the learner.
create or replace function public.approve_school_portal_signup(p_user_id uuid,p_student_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; request_row public.school_portal_signup_requests;
  auth_email_confirmed timestamptz; linked_student public.students; role_key text;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role<>'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator is required.' using errcode='42501';
  end if;
  if not exists(select 1 from public.schools s where s.id=actor.school_id and s.status='active') then
    raise exception 'Only an active school can approve portal registrations.' using errcode='42501';
  end if;
  select * into request_row from public.school_portal_signup_requests r
    where r.user_id=p_user_id and r.school_id=actor.school_id and r.status='pending' for update;
  if request_row.user_id is null then raise exception 'Pending registration request not found.'; end if;
  select u.email_confirmed_at into auth_email_confirmed from auth.users u where u.id=p_user_id;
  if auth_email_confirmed is null then raise exception 'The applicant must verify their email before approval.'; end if;
  if request_row.requested_role in ('student','parent') then
    if p_student_id is null then raise exception 'Choose the learner record to link to this account.'; end if;
    select * into linked_student from public.students s
      where s.id=p_student_id and s.school_id=actor.school_id for update;
    if linked_student.id is null then raise exception 'Choose a learner from this school.'; end if;
    if request_row.requested_role='student' then
      if lower(btrim(coalesce(linked_student.admission_number,''))) <> lower(btrim(coalesce(request_row.admission_number,''))) then
        raise exception 'The learner does not match the submitted admission number.';
      end if;
      if linked_student.class_id is distinct from request_row.requested_class_id then
        raise exception 'The learner class changed. Ask the applicant to submit an updated request.';
      end if;
      if linked_student.profile_id is not null and linked_student.profile_id<>p_user_id then
        raise exception 'This learner already has a portal account.';
      end if;
      update public.students set profile_id=p_user_id where id=linked_student.id and school_id=actor.school_id;
    else
      if nullif(btrim(request_row.parent_national_id),'') is null
        or upper(btrim(coalesce(linked_student.student_registration_id,''))) <> upper(btrim(coalesce(request_row.student_registration_id,''))) then
        raise exception 'Verify the parent ID and match the learner registration ID before approval.';
      end if;
      insert into public.student_guardians(student_id,guardian_id,relationship)
        values(linked_student.id,p_user_id,'parent/guardian') on conflict(student_id,guardian_id) do nothing;
    end if;
  end if;
  perform set_config('app.approve_school_portal_user',p_user_id::text,true);
  update public.profiles set is_active=true where id=p_user_id and school_id=actor.school_id
    and role=request_row.requested_role and is_active is false;
  if not found then raise exception 'The pending portal profile could not be activated.'; end if;
  if request_row.requested_role='staff' and request_row.requested_access is not null then
    role_key:=case request_row.requested_access when 'hr' then 'hr_admin' when 'finance' then 'finance_officer' end;
    insert into public.school_staff_role_assignments(school_id,profile_id,role_key,assigned_by)
      values(actor.school_id,p_user_id,role_key,actor.id) on conflict(school_id,profile_id,role_key) do nothing;
  end if;
  update public.school_portal_signup_requests set status='approved',reviewed_by=actor.id,reviewed_at=now(),parent_national_id=null
    where user_id=p_user_id and school_id=actor.school_id and status='pending';
end $$;
revoke all on function public.approve_school_portal_signup(uuid,uuid) from public,anon;
grant execute on function public.approve_school_portal_signup(uuid,uuid) to authenticated;

-- Existing parents can be linked to additional learners only by their active
-- school's administrator; this preserves one parent login for any number of children.
create or replace function public.admin_link_parent_student(p_parent_id uuid,p_student_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; parent_row public.profiles; student_school uuid;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role<>'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator is required.' using errcode='42501';
  end if;
  if not exists(select 1 from public.schools s where s.id=actor.school_id and s.status='active') then
    raise exception 'Only an active school can manage family links.' using errcode='42501';
  end if;
  select * into parent_row from public.profiles p
    where p.id=p_parent_id and p.school_id=actor.school_id and p.role='parent' and p.is_active is true;
  select s.school_id into student_school from public.students s where s.id=p_student_id;
  if parent_row.id is null or student_school is distinct from actor.school_id then
    raise exception 'Choose an active parent and a learner from your school.' using errcode='42501';
  end if;
  insert into public.student_guardians(student_id,guardian_id,relationship)
    values(p_student_id,p_parent_id,'parent/guardian') on conflict(student_id,guardian_id) do nothing;
end $$;
revoke all on function public.admin_link_parent_student(uuid,uuid) from public,anon;
grant execute on function public.admin_link_parent_student(uuid,uuid) to authenticated;

drop function if exists public.submit_google_school_portal_signup(text,text,text,text,text,uuid);
create or replace function public.submit_google_school_portal_signup(
  p_school_slug text, p_full_name text, p_requested_role text,
  p_requested_access text default null, p_admission_number text default null,
  p_requested_class_id uuid default null, p_student_registration_id text default null,
  p_parent_national_id text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; account auth.users; target_school public.schools;
  resolved_name text; resolved_role public.user_role; resolved_access text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in with Google before submitting a school request.' using errcode='42501'; end if;
  select * into account from auth.users u where u.id=(select auth.uid());
  if account.id is null or account.email_confirmed_at is null then raise exception 'Verify your Google account email before submitting a school request.'; end if;
  select * into actor from public.profiles p where p.id=account.id for update;
  if actor.id is null or actor.school_id is not null or actor.role<>'student' or actor.is_active is not true then
    raise exception 'This Google account is already linked to a school or is not eligible for a new school request.';
  end if;
  select * into target_school from public.schools s where s.slug=p_school_slug and s.status='active';
  if target_school.id is null then raise exception 'This school is not accepting portal registrations.'; end if;
  begin resolved_role:=p_requested_role::public.user_role;
  exception when invalid_text_representation then raise exception 'Choose a valid school portal.'; end;
  resolved_access:=nullif(btrim(coalesce(p_requested_access,'')), '');
  if resolved_role not in ('teacher','student','parent','staff') or
    (resolved_access is not null and (resolved_role<>'staff' or resolved_access not in ('hr','finance'))) then
    raise exception 'Choose a valid school portal.';
  end if;
  if resolved_role='student' and (nullif(btrim(coalesce(p_admission_number,'')),'') is null
    or p_requested_class_id is null or not exists(select 1 from public.classes c where c.id=p_requested_class_id and c.school_id=target_school.id)) then
    raise exception 'Enter the learner admission number and choose a class offered by this school.';
  end if;
  if resolved_role='parent' and (nullif(btrim(coalesce(p_student_registration_id,'')),'') is null
    or nullif(btrim(coalesce(p_parent_national_id,'')),'') is null) then
    raise exception 'Enter the learner registration ID and your national ID.';
  end if;
  if resolved_role='parent' and (length(btrim(p_student_registration_id))>40 or length(btrim(p_parent_national_id))>80) then
    raise exception 'Check the registration ID and national ID lengths.';
  end if;
  resolved_name:=left(trim(coalesce(nullif(p_full_name,''),actor.full_name,account.raw_user_meta_data->>'full_name',account.raw_user_meta_data->>'name','')),160);
  if length(resolved_name)<2 then raise exception 'Enter your full name before requesting a school account.'; end if;
  perform set_config('app.submit_school_portal_signup',account.id::text,true);
  update public.profiles set school_id=target_school.id,full_name=resolved_name,role=resolved_role,is_active=false
    where id=account.id and school_id is null and role='student' and is_active is true;
  if not found then raise exception 'This Google account is already linked to a school.'; end if;
  insert into public.school_portal_signup_requests(
    user_id,school_id,full_name,email,requested_role,requested_access,admission_number,requested_class_id,
    student_registration_id,parent_national_id
  ) values(account.id,target_school.id,resolved_name,lower(account.email),resolved_role,resolved_access,
    nullif(btrim(coalesce(p_admission_number,'')),''),p_requested_class_id,
    nullif(upper(btrim(coalesce(p_student_registration_id,''))),''),nullif(btrim(coalesce(p_parent_national_id,'')),''));
end $$;
revoke all on function public.submit_google_school_portal_signup(text,text,text,text,text,uuid,text,text) from public,anon;
grant execute on function public.submit_google_school_portal_signup(text,text,text,text,text,uuid,text,text) to authenticated;

