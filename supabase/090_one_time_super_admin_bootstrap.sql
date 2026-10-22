-- Allow the platform owner to create the first Super Admin through a guarded
-- Edge Function. The permanent claim row keeps registration closed even if
-- that profile is later deleted.
create table if not exists private.super_admin_bootstrap_state (
  singleton boolean primary key default true check (singleton is true),
  claimed_profile_id uuid not null,
  claimed_at timestamptz not null default now()
);
alter table private.super_admin_bootstrap_state enable row level security;
revoke all on private.super_admin_bootstrap_state from public,anon,authenticated;

-- Existing installations with a Super Admin are already claimed.
insert into private.super_admin_bootstrap_state(singleton,claimed_profile_id)
select true,p.id from public.profiles p where p.role='super_admin'
order by p.created_at,p.id limit 1
on conflict (singleton) do nothing;

create or replace function public.super_admin_bootstrap_available()
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from private.super_admin_bootstrap_state)
    and not exists(select 1 from public.profiles where role='super_admin')
$$;
revoke all on function public.super_admin_bootstrap_available() from public;
grant execute on function public.super_admin_bootstrap_available() to anon,authenticated;

create or replace function public.claim_first_super_admin(p_profile_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('smartschool-first-super-admin',0));
  if exists(select 1 from private.super_admin_bootstrap_state)
    or exists(select 1 from public.profiles where role='super_admin') then
    return false;
  end if;
  update public.profiles set role='super_admin',school_id=null,is_active=true
    where id=p_profile_id and role is distinct from 'super_admin';
  if not found then return false; end if;
  insert into private.super_admin_bootstrap_state(singleton,claimed_profile_id)
    values(true,p_profile_id);
  return true;
end $$;
revoke all on function public.claim_first_super_admin(uuid) from public,anon,authenticated;
grant execute on function public.claim_first_super_admin(uuid) to service_role;
