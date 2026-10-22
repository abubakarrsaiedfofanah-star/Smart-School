-- Monthly recurring school subscriptions, payment audit, and fail-closed access.

alter table public.schools
  add column if not exists suspension_reason text;

alter table public.profiles
  add column if not exists billing_suspended_at timestamptz;

alter table public.subscriptions
  add column if not exists billing_email text,
  add column if not exists billing_currency text,
  add column if not exists monthly_amount numeric(12,2),
  add column if not exists flutterwave_plan_id bigint,
  add column if not exists payment_failed_at timestamptz;

create unique index if not exists subscriptions_one_billing_school_per_email
  on public.subscriptions(lower(billing_email)) where billing_email is not null;

create table if not exists public.subscription_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('Starter','Professional','Enterprise')),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  monthly_amount numeric(12,2) not null check (monthly_amount > 0),
  flutterwave_plan_id bigint not null check (flutterwave_plan_id > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (plan, currency_code)
);
alter table public.subscription_plan_prices enable row level security;
revoke all on public.subscription_plan_prices from public, anon, authenticated;
grant select on public.subscription_plan_prices to authenticated;
create policy subscription_plan_prices_platform_read on public.subscription_plan_prices
  for select to authenticated using (public.is_super_admin());
create policy subscription_plan_prices_school_admin_read on public.subscription_plan_prices
  for select to authenticated using (auth.role() = 'authenticated');

create table if not exists public.subscription_billing_attempts (
  tx_ref text primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  plan text not null check (plan in ('Starter','Professional','Enterprise')),
  billing_email text not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','successful','failed')),
  flutterwave_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscription_billing_attempts_school_date
  on public.subscription_billing_attempts(school_id, created_at desc);
alter table public.subscription_billing_attempts enable row level security;
revoke all on public.subscription_billing_attempts from public, anon, authenticated;
grant select on public.subscription_billing_attempts to authenticated;
create policy subscription_billing_attempts_admin_read on public.subscription_billing_attempts
  for select to authenticated using (
    public.is_super_admin() or exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_active is true or p.billing_suspended_at is not null)
        and p.role = 'school_admin' and p.school_id = subscription_billing_attempts.school_id
    )
  );

create table if not exists public.subscription_billing_webhook_events (
  event_key text primary key,
  event_name text not null,
  received_at timestamptz not null default now()
);
alter table public.subscription_billing_webhook_events enable row level security;
revoke all on public.subscription_billing_webhook_events from public, anon, authenticated;

create or replace function public.platform_set_subscription_price(
  p_plan text, p_currency_code text, p_monthly_amount numeric, p_flutterwave_plan_id bigint
)
returns public.subscription_plan_prices language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.subscription_plan_prices;
begin
  select p.role into actor_role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true;
  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_plan not in ('Starter','Professional','Enterprise') or coalesce(p_currency_code,'') !~ '^[A-Z]{3}$'
     or p_monthly_amount is null or p_monthly_amount <= 0
     or p_flutterwave_plan_id is null or p_flutterwave_plan_id <= 0 then
    raise exception 'Enter a valid plan, currency, monthly price, and Flutterwave plan ID.';
  end if;
  insert into public.subscription_plan_prices(plan,currency_code,monthly_amount,flutterwave_plan_id,updated_by,updated_at)
  values (p_plan,p_currency_code,p_monthly_amount,p_flutterwave_plan_id,(select auth.uid()),now())
  on conflict (plan,currency_code) do update set monthly_amount=excluded.monthly_amount,
    flutterwave_plan_id=excluded.flutterwave_plan_id,updated_by=excluded.updated_by,updated_at=now()
  returning * into result;
  return result;
end $$;
revoke all on function public.platform_set_subscription_price(text,text,numeric,bigint) from public, anon;
grant execute on function public.platform_set_subscription_price(text,text,numeric,bigint) to authenticated;

create or replace function private.school_subscription_entitled(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.schools s join public.subscriptions sub on sub.school_id = s.id
    where s.id = target_school and s.status = 'active'
      and sub.status in ('trial','active') and sub.ends_at is not null and sub.ends_at > now()
  )
$$;
revoke all on function private.school_subscription_entitled(uuid) from public, anon, authenticated;
grant execute on function private.school_subscription_entitled(uuid) to authenticated;

-- Keep the login picker usable for billing-suspended schools while only
-- exposing an active school directory to anonymous registration requests.
create or replace function public.get_public_school_login_directory()
returns table(id uuid, name text, slug text, status public.school_status)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug, s.status from public.schools s
  where s.status = 'active' or (s.status = 'suspended' and s.suspension_reason = 'payment_failed')
  order by lower(s.name), s.id
$$;
revoke all on function public.get_public_school_login_directory() from public;
grant execute on function public.get_public_school_login_directory() to anon, authenticated;

create or replace function public.same_school(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and (p.role = 'super_admin' or (p.school_id = target_school and private.school_subscription_entitled(target_school)))
  )
$$;
revoke all on function public.same_school(uuid) from public, anon;
grant execute on function public.same_school(uuid) to authenticated;

create or replace function private.current_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
    and (p.role = 'super_admin' or private.school_subscription_entitled(p.school_id)) limit 1
$$;
create or replace function private.current_school_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
    and p.role <> 'super_admin' and private.school_subscription_entitled(p.school_id) limit 1
$$;
revoke all on function private.current_role() from public, anon;
revoke all on function private.current_school_id() from public, anon;
grant execute on function private.current_role() to authenticated;
grant execute on function private.current_school_id() to authenticated;

create or replace function private.can_view_class(target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor join public.classes c on c.id=target_class
    where actor.id=(select auth.uid()) and actor.is_active is true
      and private.school_subscription_entitled(actor.school_id) and (
        (c.school_id=actor.school_id and actor.role='school_admin')
        or (c.school_id=actor.school_id and actor.role='teacher' and (
          c.teacher_id=actor.id or exists (select 1 from public.teacher_subject_assignments tsa where tsa.class_id=c.id and tsa.teacher_id=actor.id)
        ))
        or exists (select 1 from public.students s where s.class_id=c.id and s.profile_id=actor.id and s.school_id=actor.school_id)
        or (actor.role='parent' and exists (
          select 1 from public.students s join public.student_guardians g on g.student_id=s.id
          where s.class_id=c.id and s.school_id=actor.school_id and g.guardian_id=actor.id
        ))
      )
  )
$$;
create or replace function private.can_view_student(target_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor join public.students s on s.id=target_student
    where actor.id=(select auth.uid()) and actor.is_active is true
      and private.school_subscription_entitled(actor.school_id) and (
        (s.school_id=actor.school_id and actor.role='school_admin')
        or (s.school_id=actor.school_id and s.profile_id=actor.id)
        or (s.school_id=actor.school_id and actor.role='teacher' and exists (
          select 1 from public.classes c where c.id=s.class_id and c.school_id=s.school_id and (
            c.teacher_id=actor.id or exists (select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id=actor.id and tsa.class_id=c.id and tsa.school_id=c.school_id)
          )
        ))
        or (s.school_id=actor.school_id and actor.role='parent' and exists (
          select 1 from public.student_guardians g where g.student_id=s.id and g.guardian_id=actor.id
        ))
      )
  )
$$;
create or replace function private.can_grade_student(target_student uuid, target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s join public.profiles actor on actor.id=(select auth.uid()) and actor.is_active is true
    where s.id=target_student and s.school_id=actor.school_id and private.school_subscription_entitled(actor.school_id) and (
      actor.role='school_admin' or (actor.role='teacher' and exists (
        select 1 from public.teacher_subject_assignments tsa where tsa.teacher_id=actor.id
          and tsa.school_id=actor.school_id and tsa.class_id=s.class_id and tsa.subject_id=target_subject
      ))
    )
  )
$$;
create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.school_subscription_entitled(target_school) and (
    exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true
      and p.school_id=target_school and p.role='school_admin')
    or exists (select 1 from public.school_staff_role_assignments a
      join public.profiles p on p.id=a.profile_id and p.school_id=a.school_id and p.is_active is true and p.role='teacher'
      join public.school_role_permission_catalog c on c.role_key=a.role_key
      where a.profile_id=(select auth.uid()) and a.school_id=target_school and c.permission_key=required_permission)
  )
$$;
create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select private.school_subscription_entitled(target_school) and (
    exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true
      and p.school_id=target_school and p.role='school_admin')
    or exists (select 1 from public.school_staff_role_assignments a
      join public.profiles p on p.id=a.profile_id and p.school_id=a.school_id and p.is_active is true and p.role='teacher'
      where a.profile_id=(select auth.uid()) and a.school_id=target_school and a.role_key=any(allowed_roles))
  )
$$;

-- Keep a school's own administrator able to see its school and billing rows so
-- they can correct a failed payment; regular workspace access remains gated.
create policy schools_admin_billing_read on public.schools for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_active is true or p.billing_suspended_at is not null)
    and p.role = 'school_admin' and p.school_id = schools.id)
);
create policy subscriptions_admin_billing_read on public.subscriptions for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_active is true or p.billing_suspended_at is not null)
    and p.role = 'school_admin' and p.school_id = subscriptions.school_id)
);

create or replace function public.process_flutterwave_school_billing_event(
  p_event_key text, p_event_name text, p_tx_ref text, p_transaction_id text,
  p_status text, p_currency_code text, p_amount numeric, p_customer_email text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempt public.subscription_billing_attempts; sub public.subscriptions; target_school uuid;
  expected_amount numeric; expected_currency text; email_value text;
begin
  if nullif(trim(p_event_key),'') is null or nullif(trim(p_event_name),'') is null then
    raise exception 'Webhook event identity is required.';
  end if;
  insert into public.subscription_billing_webhook_events(event_key,event_name)
    values (p_event_key,p_event_name) on conflict do nothing;
  if not found then return false; end if;

  email_value := lower(trim(coalesce(p_customer_email,'')));
  if nullif(trim(coalesce(p_tx_ref,'')),'') is not null then
    select * into attempt from public.subscription_billing_attempts a where a.tx_ref=p_tx_ref for update;
  end if;
  if attempt.tx_ref is not null then
    target_school := attempt.school_id;
    expected_amount := attempt.amount;
    expected_currency := attempt.currency_code;
  else
    select * into sub from public.subscriptions s where lower(coalesce(s.billing_email,''))=email_value for update;
    if sub.id is null then return true; end if;
    target_school := sub.school_id;
    expected_amount := sub.monthly_amount;
    expected_currency := sub.billing_currency;
  end if;

  if p_status = 'successful' then
    if p_amount is null or expected_amount is null or abs(p_amount - expected_amount) > 0.01
       or upper(coalesce(p_currency_code,'')) <> upper(coalesce(expected_currency,'')) then
      raise exception 'Verified payment does not match the expected subscription amount and currency.';
    end if;
    if attempt.tx_ref is not null then
      update public.subscription_billing_attempts set status='successful',
        flutterwave_transaction_id=p_transaction_id,updated_at=now() where tx_ref=attempt.tx_ref;
      update public.subscriptions set plan=attempt.plan, status='active', starts_at=now(),
        ends_at=now()+interval '1 month', billing_email=attempt.billing_email,
        billing_currency=attempt.currency_code, monthly_amount=attempt.amount,
        payment_failed_at=null, request_status='approved', requested_plan=null
      where school_id=target_school;
    else
      update public.subscriptions set status='active', starts_at=now(), ends_at=now()+interval '1 month',
        payment_failed_at=null, request_status='approved' where school_id=target_school;
    end if;
    update public.schools set status='active', suspension_reason=null
      where id=target_school and status='suspended' and suspension_reason='payment_failed';
    update public.profiles set is_active=true, billing_suspended_at=null
      where school_id=target_school and billing_suspended_at is not null;
  elsif p_status in ('failed','cancelled') then
    if attempt.tx_ref is not null then
      update public.subscription_billing_attempts set status='failed',
        flutterwave_transaction_id=p_transaction_id,updated_at=now() where tx_ref=attempt.tx_ref;
    end if;
    update public.subscriptions set status='suspended', request_status='payment_failed', payment_failed_at=now()
      where school_id=target_school;
    update public.schools set status='suspended', suspension_reason='payment_failed'
      where id=target_school and status='active';
    update public.profiles set is_active=false, billing_suspended_at=now()
      where school_id=target_school and is_active is true;
  end if;
  return true;
end $$;
revoke all on function public.process_flutterwave_school_billing_event(text,text,text,text,text,text,numeric,text) from public, anon, authenticated;
grant execute on function public.process_flutterwave_school_billing_event(text,text,text,text,text,text,numeric,text) to service_role;

-- Preserve the reason for billing-based suspensions, so manual platform
-- suspensions are not lifted automatically by a later successful payment.
create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.schools;
begin
  select p.role into actor_role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true;
  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.subscriptions s where s.school_id = p_school_id
      and s.status in ('trial','active') and s.ends_at > now()
  ) then raise exception 'Start a free trial or activate a subscription before approving this school.'; end if;
  update public.schools set status=p_status,
    suspension_reason=case when p_status='suspended' then 'platform_admin' else null end
  where id=p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end $$;
revoke all on function public.platform_set_school_status(uuid,public.school_status) from public, anon;
grant execute on function public.platform_set_school_status(uuid,public.school_status) to authenticated;

-- Paid access is activated only by a verified payment webhook; the platform
-- admin can still start one free trial or suspend a workspace manually.
create or replace function public.platform_set_subscription(
  p_school_id uuid, p_plan text, p_status text, p_ends_at timestamptz default null
)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.subscriptions;
begin
  select p.role into actor_role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true;
  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_plan not in ('Starter','Professional','Enterprise') then raise exception 'Choose a valid plan.'; end if;
  if p_status = 'active' then raise exception 'Paid subscriptions activate only after the payment provider confirms the first charge.'; end if;
  if p_status not in ('pending','trial','suspended','expired','cancelled') then raise exception 'Choose a valid subscription status.'; end if;
  if p_status = 'trial' then
    update public.subscriptions set plan=p_plan,status='trial',starts_at=now(),ends_at=now()+interval '14 days',
      trial_started_at=now(),requested_plan=null,request_status='approved',payment_failed_at=null
    where school_id=p_school_id and trial_started_at is null returning * into result;
    if result.id is null then raise exception 'This school has already used its free trial or has no subscription record.'; end if;
  else
    update public.subscriptions set plan=p_plan,status=p_status,
      ends_at=case when p_status='pending' then p_ends_at else ends_at end,
      requested_plan=null,request_status=case when p_status='pending' then 'pending' else 'approved' end
    where school_id=p_school_id returning * into result;
    if result.id is null then raise exception 'Subscription not found.'; end if;
  end if;
  update public.schools set subscription_plan=p_plan,
    status=case when p_status='trial' then 'active'::public.school_status
      when p_status in ('suspended','expired','cancelled') then 'suspended'::public.school_status
      else 'pending'::public.school_status end,
    suspension_reason=case when p_status in ('suspended','expired','cancelled') then 'platform_admin' else null end
  where id=p_school_id;
  return result;
end $$;
revoke all on function public.platform_set_subscription(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.platform_set_subscription(uuid,text,text,timestamptz) to authenticated;
