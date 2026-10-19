-- Track each school's one-time free trial and prevent trial restarts.
alter table public.subscriptions
  add column if not exists trial_started_at timestamptz;

update public.subscriptions
set trial_started_at = coalesce(starts_at, now())
where status = 'trial' and trial_started_at is null;

create or replace function public.platform_set_subscription(
  p_school_id uuid,
  p_plan text,
  p_status text,
  p_ends_at timestamptz default null
)
returns public.subscriptions
language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.user_role;
  result public.subscriptions;
begin
  select role into actor_role
  from public.profiles
  where id = (select auth.uid()) and is_active is true;

  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_plan not in ('Starter', 'Professional', 'Enterprise') then
    raise exception 'Choose a valid plan.';
  end if;
  if p_status not in ('pending', 'trial', 'active', 'suspended', 'expired', 'cancelled') then
    raise exception 'Choose a valid subscription status.';
  end if;

  if p_status = 'trial' then
    update public.subscriptions
    set plan = p_plan,
        status = 'trial',
        starts_at = now(),
        ends_at = now() + interval '14 days',
        trial_started_at = now(),
        requested_plan = null,
        request_status = 'approved'
    where school_id = p_school_id and trial_started_at is null
    returning * into result;

    if result.id is null then
      raise exception 'This school has already used its free trial or has no subscription record.';
    end if;
  else
    update public.subscriptions
    set plan = p_plan,
        status = p_status,
        starts_at = case when p_status = 'active' then now() else starts_at end,
        ends_at = case when p_status = 'active' then now() + interval '30 days' else p_ends_at end,
        requested_plan = null,
        request_status = case when p_status = 'pending' then 'pending' else 'approved' end
    where school_id = p_school_id
    returning * into result;

    if result.id is null then raise exception 'Subscription not found.'; end if;
  end if;

  update public.schools
  set subscription_plan = p_plan,
      status = case when p_status in ('trial', 'active') then 'active'::public.school_status
        when p_status in ('suspended', 'expired', 'cancelled') then 'suspended'::public.school_status
        else 'pending'::public.school_status end
  where id = p_school_id;

  return result;
end;
$$;

revoke all on function public.platform_set_subscription(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.platform_set_subscription(uuid, text, text, timestamptz) to authenticated;

create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.user_role;
  result public.schools;
begin
  select role into actor_role
  from public.profiles
  where id = (select auth.uid()) and is_active is true;

  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.subscriptions s
    where s.school_id = p_school_id and s.status in ('trial', 'active')
      and s.ends_at > now()
  ) then
    raise exception 'Start a free trial or activate a subscription before approving this school.';
  end if;

  update public.schools set status = p_status where id = p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end;
$$;

revoke all on function public.platform_set_school_status(uuid, public.school_status) from public, anon;
grant execute on function public.platform_set_school_status(uuid, public.school_status) to authenticated;
