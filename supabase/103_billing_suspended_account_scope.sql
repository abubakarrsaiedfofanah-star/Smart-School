-- A billing-suspended school administrator needs a checkout path, not direct
-- access to full school, provider, and payment-attempt rows.
drop policy if exists schools_admin_billing_read on public.schools;

drop policy if exists subscriptions_admin_billing_read on public.subscriptions;
drop policy if exists subscriptions_admin_read on public.subscriptions;
drop policy if exists "school and platform admins view subscriptions" on public.subscriptions;
create policy subscriptions_admin_billing_read on public.subscriptions
for select to authenticated using (
  private.current_role() = 'super_admin'
  or exists (
    select 1 from public.profiles actor
    where actor.id = (select auth.uid()) and actor.is_active is true
      and actor.role = 'school_admin' and actor.school_id = subscriptions.school_id
  )
);

drop policy if exists subscription_billing_attempts_admin_read on public.subscription_billing_attempts;
create policy subscription_billing_attempts_admin_read on public.subscription_billing_attempts
for select to authenticated using (
  private.current_role() = 'super_admin'
  or exists (
    select 1 from public.profiles actor
    where actor.id = (select auth.uid()) and actor.is_active is true
      and actor.role = 'school_admin' and actor.school_id = subscription_billing_attempts.school_id
  )
);

-- Flutterwave plan identifiers are used only by trusted platform code. School
-- administrators receive display prices through the scoped RPC below.
drop policy if exists subscription_plan_prices_platform_read on public.subscription_plan_prices;
drop policy if exists subscription_plan_prices_school_admin_read on public.subscription_plan_prices;
create policy subscription_plan_prices_platform_read on public.subscription_plan_prices
for select to authenticated using (private.current_role() = 'super_admin');

create or replace function public.get_my_school_billing_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor public.profiles; school_row public.schools; subscription_row public.subscriptions;
  result jsonb;
begin
  select * into actor from public.profiles p where p.id = (select auth.uid());
  if actor.id is null or actor.role <> 'school_admin' or actor.school_id is null
    or not (
      actor.is_active is true
      or (actor.billing_suspended_at is not null and exists (
        select 1 from public.schools s where s.id = actor.school_id
          and s.status = 'suspended' and s.suspension_reason = 'payment_failed'
      ))
    ) then
    raise exception 'School billing access is unavailable.' using errcode = '42501';
  end if;

  select * into school_row from public.schools s where s.id = actor.school_id;
  select * into subscription_row from public.subscriptions sub where sub.school_id = actor.school_id;
  select pg_catalog.jsonb_build_object(
    'school', pg_catalog.jsonb_build_object(
      'id', school_row.id,
      'name', school_row.name,
      'currency_code', school_row.currency_code,
      'subscription_plan', school_row.subscription_plan,
      'status', school_row.status,
      'suspension_reason', school_row.suspension_reason
    ),
    'subscription', case when subscription_row.id is null then null else pg_catalog.jsonb_build_object(
      'id', subscription_row.id,
      'plan', subscription_row.plan,
      'status', subscription_row.status,
      'starts_at', subscription_row.starts_at,
      'ends_at', subscription_row.ends_at,
      'request_status', subscription_row.request_status,
      'requested_plan', subscription_row.requested_plan,
      'monthly_amount', subscription_row.monthly_amount,
      'billing_email', subscription_row.billing_email,
      'payment_failed_at', subscription_row.payment_failed_at,
      'monthly_recurring', subscription_row.flutterwave_plan_id is not null and subscription_row.status = 'active'
    ) end,
    'prices', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'plan', price.plan, 'currency_code', price.currency_code, 'monthly_amount', price.monthly_amount
      ) order by price.plan)
      from public.subscription_plan_prices price
      where price.currency_code = school_row.currency_code
    ), '[]'::jsonb),
    'attempts', coalesce((
      select pg_catalog.jsonb_agg(recent.attempt order by recent.created_at desc)
      from (
        select pg_catalog.jsonb_build_object(
          'tx_ref', attempt.tx_ref, 'plan', attempt.plan, 'currency_code', attempt.currency_code,
          'amount', attempt.amount, 'status', attempt.status, 'created_at', attempt.created_at
        ) as attempt, attempt.created_at
        from public.subscription_billing_attempts attempt
        where attempt.school_id = actor.school_id
        order by attempt.created_at desc limit 5
      ) recent
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.get_my_school_billing_overview() from public, anon;
grant execute on function public.get_my_school_billing_overview() to authenticated;
