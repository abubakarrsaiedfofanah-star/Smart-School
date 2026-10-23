-- Keep anonymous access limited to the minimum needed to choose and join an
-- active school. School records and student credential rows stay private.

create or replace function public.get_public_school_login_directory()
returns table(id uuid, name text, slug text, status public.school_status)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug, s.status
  from public.schools s
  where s.status = 'active'
  order by lower(s.name), s.id
$$;
revoke all on function public.get_public_school_login_directory() from public;
grant execute on function public.get_public_school_login_directory() to anon, authenticated;

-- Keep the public school landing page shape for compatibility, but do not
-- publish a school's address or school level before a person joins it.
create or replace function public.get_public_school_profiles()
returns table(id uuid, name text, slug text, school_level text, address text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug, null::text, null::text
  from public.schools s
  where s.status = 'active'
  order by lower(s.name), s.id
$$;
revoke all on function public.get_public_school_profiles() from public;
grant execute on function public.get_public_school_profiles() to anon, authenticated;

create or replace function public.get_public_school_profile(p_school_slug text)
returns table(id uuid, name text, slug text, school_level text, address text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug, null::text, null::text
  from public.schools s
  where s.status = 'active' and s.slug = p_school_slug
  limit 1
$$;
revoke all on function public.get_public_school_profile(text) from public;
grant execute on function public.get_public_school_profile(text) to anon, authenticated;

-- There is no public QR lookup endpoint in the app. A credential hash and its
-- student, course, and school relationships must not be enumerable directly.
drop policy if exists "anyone verify credential" on public.verified_credentials;
revoke select on table public.verified_credentials from public, anon;
grant select on table public.verified_credentials to authenticated;

-- Applicants can see only their request status, never the submitted national
-- ID or the school's internal review details.
drop policy if exists portal_signup_admin_read on public.school_portal_signup_requests;
create policy portal_signup_admin_read on public.school_portal_signup_requests
  for select to authenticated using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active is true
        and p.role = 'school_admin'
        and p.school_id = school_portal_signup_requests.school_id
    )
  );
revoke all on table public.school_portal_signup_requests from public, anon;
grant select on table public.school_portal_signup_requests to authenticated;

create or replace function public.get_my_school_portal_signup_status()
returns text language sql stable security definer set search_path = '' as $$
  select r.status
  from public.school_portal_signup_requests r
  where r.user_id = (select auth.uid())
  limit 1
$$;
revoke all on function public.get_my_school_portal_signup_status() from public, anon;
grant execute on function public.get_my_school_portal_signup_status() to authenticated;

-- Remove a declined applicant's national ID after the decision is recorded.
create or replace function public.reject_school_portal_signup(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role <> 'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator is required.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.schools s where s.id = actor.school_id and s.status = 'active'
  ) then
    raise exception 'Only an active school can review portal registrations.' using errcode = '42501';
  end if;
  update public.school_portal_signup_requests
  set status = 'rejected', reviewed_by = actor.id, reviewed_at = now(), parent_national_id = null
  where user_id = p_user_id and school_id = actor.school_id and status = 'pending';
  if not found then raise exception 'Pending registration request not found.'; end if;
end $$;
revoke all on function public.reject_school_portal_signup(uuid) from public, anon;
grant execute on function public.reject_school_portal_signup(uuid) to authenticated;
