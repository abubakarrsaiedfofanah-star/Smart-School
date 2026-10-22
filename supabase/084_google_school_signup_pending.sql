-- Google sign-ups must join an explicit school request and remain inactive
-- until that school's administrator reviews them.

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

  if actor.id = old.id and old.role = 'student' and old.school_id is null and old.is_active is true
     and new.role in ('teacher','student','parent','staff') and new.school_id is not null and new.is_active is false
     and current_setting('app.submit_school_portal_signup',true) = old.id::text
     and exists (select 1 from public.schools s where s.id = new.school_id and s.status = 'active') then
    return new;
  end if;

  if new.role is distinct from old.role or new.school_id is distinct from old.school_id
     or new.is_active is distinct from old.is_active then
    raise exception 'Only the platform administrator or school approval workflow can change account role, school, or active status.';
  end if;
  return new;
end $$;

create or replace function private.prevent_self_role_or_school_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.id = (select auth.uid())
    and coalesce((select auth.role()), '') <> 'service_role'
    and current_setting('app.submit_school_portal_signup',true) is distinct from old.id::text
    and (new.role is distinct from old.role or new.school_id is distinct from old.school_id
      or new.is_active is distinct from old.is_active) then
    raise exception 'Portal role, account status, and school membership can only be changed by an authorized administrator.'
      using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.submit_google_school_portal_signup(
  p_school_slug text,
  p_full_name text,
  p_requested_role text,
  p_requested_access text default null,
  p_admission_number text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; account auth.users; target_school public.schools;
  resolved_name text; resolved_role public.user_role; resolved_access text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in with Google before submitting a school request.' using errcode = '42501'; end if;
  select * into account from auth.users u where u.id = (select auth.uid());
  if account.id is null or account.email_confirmed_at is null then
    raise exception 'Verify your Google account email before submitting a school request.';
  end if;
  select * into actor from public.profiles p where p.id = account.id for update;
  if actor.id is null or actor.school_id is not null or actor.role <> 'student' or actor.is_active is not true then
    raise exception 'This Google account is already linked to a school or is not eligible for a new school request.';
  end if;
  select * into target_school from public.schools s where s.slug = p_school_slug and s.status = 'active';
  if target_school.id is null then raise exception 'This school is not accepting portal registrations.'; end if;
  begin
    resolved_role := p_requested_role::public.user_role;
  exception when invalid_text_representation then
    raise exception 'Choose a valid school portal.';
  end;
  resolved_access := nullif(trim(coalesce(p_requested_access,'')), '');
  if resolved_role not in ('teacher','student','parent','staff')
     or (resolved_access is not null and (resolved_role <> 'staff' or resolved_access not in ('hr','finance'))) then
    raise exception 'Choose a valid school portal.';
  end if;
  if resolved_role in ('student','parent') and nullif(trim(coalesce(p_admission_number,'')), '') is null then
    raise exception 'Enter the learner admission number provided by the school.';
  end if;
  resolved_name := left(trim(coalesce(nullif(p_full_name,''), actor.full_name, account.raw_user_meta_data->>'full_name', account.raw_user_meta_data->>'name', '')),160);
  if length(resolved_name) < 2 then raise exception 'Enter your full name before requesting a school account.'; end if;

  perform set_config('app.submit_school_portal_signup', account.id::text, true);
  update public.profiles set school_id = target_school.id, full_name = resolved_name,
    role = resolved_role, is_active = false
  where id = account.id and school_id is null and role = 'student' and is_active is true;
  if not found then raise exception 'This Google account is already linked to a school.'; end if;
  insert into public.school_portal_signup_requests(user_id,school_id,full_name,email,requested_role,requested_access,admission_number)
  values (account.id,target_school.id,resolved_name,lower(account.email),resolved_role,resolved_access,nullif(trim(coalesce(p_admission_number,'')),''));
end $$;

revoke all on function public.submit_google_school_portal_signup(text,text,text,text,text) from public, anon;
grant execute on function public.submit_google_school_portal_signup(text,text,text,text,text) to authenticated;
