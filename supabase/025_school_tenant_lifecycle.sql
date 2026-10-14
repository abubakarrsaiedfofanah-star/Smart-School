-- Run after 024_security_geo_locking.sql. Adds secure school ownership,
-- subscription requests, and Super Admin controls for the multi-school app.

alter table public.schools
  add column if not exists admin_email text,
  add column if not exists admin_user_id uuid unique references auth.users(id) on delete set null;

alter table public.subscriptions
  add column if not exists requested_plan text,
  add column if not exists request_status text not null default 'approved',
  add column if not exists requested_at timestamptz;

drop policy if exists "public may register pending schools" on public.schools;
create policy "public may register pending schools" on public.schools
  for insert with check (
    status = 'pending'
    and length(trim(name)) between 2 and 160
    and admin_user_id is null
    and admin_email is not null
    and length(trim(admin_email)) between 3 and 254
    and subscription_plan in ('Starter', 'Professional', 'Enterprise')
  );

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_school uuid;
  claimed_school uuid;
  requested_role public.user_role := 'student';
begin
  requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
  if (new.raw_user_meta_data->>'role') = 'school_admin' and requested_school is not null then
    -- Let the protected school trigger verify this one-time, email-matched claim.
    perform set_config('app.school_claim_id', requested_school::text, true);
    perform set_config('app.school_claim_user', new.id::text, true);
    update public.schools
       set admin_user_id = new.id
     where id = requested_school
       and status = 'pending'
       and admin_user_id is null
       and lower(admin_email) = lower(new.email)
    returning id into claimed_school;
    if claimed_school is not null then
      requested_role := 'school_admin';
    else
      requested_school := null;
    end if;
  else
    requested_school := null;
  end if;

  insert into public.profiles(id, school_id, full_name, phone, role)
  values (new.id, requested_school,
    left(new.raw_user_meta_data->>'full_name', 160),
    left(new.raw_user_meta_data->>'phone', 40), requested_role);
  return new;
end;
$$;

create or replace function public.protect_school_platform_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if current_setting('app.school_claim_id', true) is distinct from old.id::text
     or current_setting('app.school_claim_user', true) is distinct from new.admin_user_id::text then
    if auth.role() is distinct from 'service_role' and actor_role is distinct from 'super_admin' then
      if new.status is distinct from old.status
         or new.subscription_plan is distinct from old.subscription_plan
         or new.admin_user_id is distinct from old.admin_user_id
         or new.admin_email is distinct from old.admin_email then
        raise exception 'Only the SmartSchool platform administrator can change school approval or ownership fields.';
      end if;
    end if;
  elsif new.admin_user_id is distinct from old.admin_user_id
        or new.admin_email is distinct from old.admin_email
        or new.status is distinct from old.status
        or new.subscription_plan is distinct from old.subscription_plan then
    if current_setting('app.school_claim_id', true) is distinct from old.id::text
       or current_setting('app.school_claim_user', true) is distinct from new.admin_user_id::text
       or lower(old.admin_email) is distinct from lower((select email from auth.users where id = new.admin_user_id))
       or new.admin_user_id is null then
      raise exception 'The school administrator account does not match the registration email.';
    end if;
    if new.status is distinct from old.status or new.subscription_plan is distinct from old.subscription_plan
       or new.admin_email is distinct from old.admin_email then
      raise exception 'School registration cannot change platform controlled fields.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_school_platform_fields on public.schools;
create trigger protect_school_platform_fields before update on public.schools
  for each row execute function public.protect_school_platform_fields();

create or replace function public.protect_profile_role_and_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if auth.role() <> 'service_role' and actor_role is distinct from 'super_admin'
     and (new.role is distinct from old.role or new.school_id is distinct from old.school_id) then
    raise exception 'Only the SmartSchool platform administrator can change account roles or school membership.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role_and_tenant on public.profiles;
create trigger protect_profile_role_and_tenant before update on public.profiles
  for each row execute function public.protect_profile_role_and_tenant();

create or replace function public.create_school_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions(school_id, plan, status, request_status, requested_at)
  values (new.id, new.subscription_plan, 'pending', 'pending', now())
  on conflict (school_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_school_subscription on public.schools;
create trigger create_school_subscription after insert on public.schools
  for each row execute function public.create_school_subscription();

insert into public.subscriptions(school_id, plan, status, request_status, requested_at)
select id, subscription_plan, 'pending', 'pending', now()
from public.schools
on conflict (school_id) do nothing;

drop policy if exists "school members subscriptions" on public.subscriptions;
drop policy if exists "members view subscriptions" on public.subscriptions;
create policy "school and platform admins view subscriptions" on public.subscriptions
  for select using (public.same_school(school_id));

create or replace function public.request_school_plan(p_plan text)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare actor public.profiles; result public.subscriptions;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role <> 'school_admin' or actor.school_id is null then
    raise exception 'Only a school administrator can request a plan change.';
  end if;
  if p_plan not in ('Starter', 'Professional', 'Enterprise') then
    raise exception 'Choose a valid SmartSchool plan.';
  end if;
  update public.subscriptions
     set requested_plan = p_plan, request_status = 'pending', requested_at = now()
   where school_id = actor.school_id
  returning * into result;
  if result.id is null then raise exception 'This school does not have a subscription record yet.'; end if;
  return result;
end;
$$;

create or replace function public.platform_set_subscription(
  p_school_id uuid, p_plan text, p_status text, p_ends_at timestamptz default null
)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role; result public.subscriptions;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role <> 'super_admin' then raise exception 'Platform administrator access is required.'; end if;
  if p_plan not in ('Starter', 'Professional', 'Enterprise') then raise exception 'Choose a valid plan.'; end if;
  if p_status not in ('pending', 'trial', 'active', 'suspended', 'expired', 'cancelled') then raise exception 'Choose a valid subscription status.'; end if;
  update public.subscriptions set plan = p_plan, status = p_status,
      starts_at = case when p_status in ('trial','active') then coalesce(starts_at, now()) else starts_at end,
      ends_at = p_ends_at, requested_plan = null,
      request_status = case when p_status = 'pending' then 'pending' else 'approved' end
   where school_id = p_school_id returning * into result;
  if result.id is null then raise exception 'Subscription not found for this school.'; end if;
  update public.schools set subscription_plan = p_plan,
      status = case when p_status in ('trial','active') then 'active'::public.school_status
                    when p_status in ('suspended','expired','cancelled') then 'suspended'::public.school_status
                    else 'pending'::public.school_status end
   where id = p_school_id;
  return result;
end;
$$;

create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role; result public.schools;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role <> 'super_admin' then raise exception 'Platform administrator access is required.'; end if;
  update public.schools set status = p_status where id = p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end;
$$;

revoke all on function public.request_school_plan(text) from public;
revoke all on function public.platform_set_subscription(uuid, text, text, timestamptz) from public;
revoke all on function public.platform_set_school_status(uuid, public.school_status) from public;
grant execute on function public.request_school_plan(text) to authenticated;
grant execute on function public.platform_set_subscription(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.platform_set_school_status(uuid, public.school_status) to authenticated;
