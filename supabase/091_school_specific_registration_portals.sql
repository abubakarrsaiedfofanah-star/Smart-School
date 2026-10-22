-- Let each school choose which portal types accept public registration.
-- Existing schools keep the current five options until an administrator changes them.
create table if not exists private.school_signup_portal_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  enabled_portals text[] not null default array['student','parent','teacher','hr','finance']::text[],
  updated_at timestamptz not null default now(),
  constraint school_signup_portals_valid check (
    cardinality(enabled_portals) > 0
    and enabled_portals <@ array['student','parent','teacher','hr','finance']::text[]
  )
);
alter table private.school_signup_portal_settings enable row level security;
revoke all on private.school_signup_portal_settings from public, anon, authenticated;

create or replace function public.get_public_school_registration_portals(p_school_slug text)
returns table(portal text)
language sql stable security definer set search_path = '' as $$
  select available.portal
  from public.schools s
  cross join lateral pg_catalog.unnest(coalesce(
    (select settings.enabled_portals
     from private.school_signup_portal_settings settings
     where settings.school_id = s.id),
    array['student','parent','teacher','hr','finance']::text[]
  )) as available(portal)
  where s.slug = p_school_slug and s.status = 'active'
  order by pg_catalog.array_position(
    array['student','parent','teacher','hr','finance']::text[], available.portal
  )
$$;
revoke all on function public.get_public_school_registration_portals(text) from public;
grant execute on function public.get_public_school_registration_portals(text) to anon, authenticated;

create or replace function public.get_my_school_registration_portals()
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare actor_school_id uuid; configured_portals text[];
begin
  select p.school_id into actor_school_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'school_admin' and p.is_active is true;
  if actor_school_id is null then
    raise exception 'An active school administrator is required.' using errcode = '42501';
  end if;
  select settings.enabled_portals into configured_portals
  from private.school_signup_portal_settings settings
  where settings.school_id = actor_school_id;
  return coalesce(configured_portals, array['student','parent','teacher','hr','finance']::text[]);
end $$;
revoke all on function public.get_my_school_registration_portals() from public, anon;
grant execute on function public.get_my_school_registration_portals() to authenticated;

create or replace function public.set_my_school_registration_portals(p_enabled_portals text[])
returns void language plpgsql security definer set search_path = '' as $$
declare actor_school_id uuid; allowed_portals constant text[] := array['student','parent','teacher','hr','finance']::text[];
begin
  select p.school_id into actor_school_id
  from public.profiles p
  where p.id = (select auth.uid()) and p.role = 'school_admin' and p.is_active is true;
  if actor_school_id is null then
    raise exception 'An active school administrator is required.' using errcode = '42501';
  end if;
  if p_enabled_portals is null or cardinality(p_enabled_portals) = 0
    or not (p_enabled_portals <@ allowed_portals)
    or cardinality(p_enabled_portals) <> (
      select count(distinct portal) from pg_catalog.unnest(p_enabled_portals) as selected(portal)
    ) then
    raise exception 'Choose at least one valid registration portal.';
  end if;
  insert into private.school_signup_portal_settings(school_id, enabled_portals, updated_at)
    values(actor_school_id, p_enabled_portals, now())
  on conflict (school_id) do update
    set enabled_portals = excluded.enabled_portals, updated_at = now();
end $$;
revoke all on function public.set_my_school_registration_portals(text[]) from public, anon;
grant execute on function public.set_my_school_registration_portals(text[]) to authenticated;

-- Enforce school portal availability for both email signup and Google signup.
create or replace function private.enforce_school_signup_portal_enabled()
returns trigger language plpgsql security definer set search_path = '' as $$
declare portal_key text; enabled_portals text[];
begin
  portal_key := case when new.requested_role = 'staff'
    then new.requested_access else new.requested_role::text end;
  if portal_key is null or portal_key not in ('student','parent','teacher','hr','finance') then
    raise exception 'Choose a valid school portal.';
  end if;
  select settings.enabled_portals into enabled_portals
  from private.school_signup_portal_settings settings
  where settings.school_id = new.school_id;
  enabled_portals := coalesce(enabled_portals, array['student','parent','teacher','hr','finance']::text[]);
  if not (enabled_portals @> array[portal_key]) then
    raise exception 'This portal is not open for registration at this school.';
  end if;
  return new;
end $$;
revoke all on function private.enforce_school_signup_portal_enabled() from public, anon, authenticated;
drop trigger if exists enforce_school_signup_portal_enabled on public.school_portal_signup_requests;
create trigger enforce_school_signup_portal_enabled
  before insert or update of school_id, requested_role, requested_access
  on public.school_portal_signup_requests
  for each row execute function private.enforce_school_signup_portal_enabled();
