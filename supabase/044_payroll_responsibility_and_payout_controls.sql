-- Keep salary preparation with HR, authorization with the principal, and
-- settlement recording with the finance officer.

alter table public.payment_transactions
  add column if not exists confirmed_by uuid references public.profiles(id);

-- Finance staff can view approved payroll and record its external settlement,
-- but cannot create or modify payroll runs or payroll items.
drop policy if exists payroll_prepare on public.payroll_runs;
create policy payroll_prepare on public.payroll_runs for insert to authenticated
with check (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  and prepared_by = (select auth.uid()) and status = 'draft'
);

drop policy if exists payroll_update on public.payroll_runs;
create policy payroll_update on public.payroll_runs for update to authenticated
using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  and status in ('draft','submitted','rejected')
)
with check (private.has_hr_role(school_id, array['principal','hr_admin']));

drop policy if exists payroll_items_prepare on public.payroll_items;
create policy payroll_items_prepare on public.payroll_items for all to authenticated
using (
  private.has_hr_role(school_id, array['principal','hr_admin']) and exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
      and r.status in ('draft','rejected')
  )
)
with check (
  private.has_hr_role(school_id, array['principal','hr_admin']) and exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
      and r.status in ('draft','rejected')
  )
);

-- All new payout records begin pending and must match the approved net salary.
drop policy if exists payments_manage on public.payment_transactions;
drop policy if exists payments_insert_authorized on public.payment_transactions;
revoke insert, update, delete on public.payment_transactions from public, anon, authenticated;

create or replace function public.record_salary_payment(
  target_item uuid,
  provider_value text,
  reference_value text,
  amount_value numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_row public.payroll_items%rowtype;
  run_status text;
  created_payment uuid;
  reference_clean text := nullif(trim(coalesce(reference_value, '')), '');
begin
  select * into item_row from public.payroll_items where id = target_item for update;
  if not found then raise exception 'Payroll item not found.'; end if;
  if not private.has_hr_role(item_row.school_id, array['finance_officer']) then
    raise exception 'Only the finance officer can record salary payouts.';
  end if;
  select status into run_status from public.payroll_runs
    where id = item_row.payroll_run_id and school_id = item_row.school_id;
  if run_status not in ('approved','paying') then
    raise exception 'Only an approved payroll can be paid.';
  end if;
  if amount_value is null or amount_value <> item_row.net_pay then
    raise exception 'The payout amount must equal the approved net salary.';
  end if;
  if provider_value not in ('bank','mobile_money','mpesa','cash','other') then
    raise exception 'Choose a valid payment method.';
  end if;
  if provider_value in ('bank','mobile_money','mpesa') and reference_clean is null then
    raise exception 'Enter the bank or mobile-money transaction reference.';
  end if;
  if length(coalesce(reference_clean, '')) > 160 then
    raise exception 'The transaction reference is too long.';
  end if;
  if exists (
    select 1 from public.payment_transactions p
    where p.payroll_item_id = target_item and p.status in ('pending','processing','paid')
  ) then raise exception 'This salary already has an open or completed payout record.'; end if;

  insert into public.payment_transactions(
    school_id, payroll_item_id, provider, transaction_reference, amount, status, initiated_by
  ) values (
    item_row.school_id, target_item, provider_value, reference_clean, amount_value, 'pending', (select auth.uid())
  ) returning id into created_payment;
  return created_payment;
end;
$$;
revoke all on function public.record_salary_payment(uuid,text,text,numeric) from public, anon;
grant execute on function public.record_salary_payment(uuid,text,text,numeric) to authenticated;

create or replace function public.confirm_salary_payment(target_payment uuid, decision_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payment_transactions%rowtype;
  item_row public.payroll_items%rowtype;
  run_status text;
begin
  if decision_value not in ('paid','failed') then raise exception 'Choose paid or failed.'; end if;
  select * into payment_row from public.payment_transactions where id = target_payment for update;
  if not found then raise exception 'Payout record not found.'; end if;
  if not private.has_hr_role(payment_row.school_id, array['finance_officer']) then
    raise exception 'Only the finance officer can confirm salary payouts.';
  end if;
  if payment_row.status not in ('pending','processing') then
    raise exception 'Only an open payout record can be confirmed.';
  end if;
  select * into item_row from public.payroll_items
    where id = payment_row.payroll_item_id and school_id = payment_row.school_id;
  if not found or payment_row.amount <> item_row.net_pay then
    raise exception 'Payout does not match the approved net salary.';
  end if;
  select status into run_status from public.payroll_runs
    where id = item_row.payroll_run_id and school_id = item_row.school_id;
  if run_status not in ('approved','paying') then raise exception 'The payroll is not approved for payment.'; end if;
  if decision_value = 'paid' and payment_row.provider in ('bank','mobile_money','mpesa')
    and nullif(trim(coalesce(payment_row.transaction_reference, '')), '') is null then
    raise exception 'A bank or mobile-money reference is required before confirming payment.';
  end if;
  if decision_value = 'paid' and exists (
    select 1 from public.payment_transactions p
    where p.payroll_item_id = payment_row.payroll_item_id and p.status = 'paid' and p.id <> payment_row.id
  ) then raise exception 'This salary already has a completed payout.'; end if;

  update public.payment_transactions set status = decision_value,
    confirmed_by = case when decision_value = 'paid' then (select auth.uid()) else null end,
    confirmed_at = case when decision_value = 'paid' then now() else null end
  where id = target_payment;
end;
$$;
revoke all on function public.confirm_salary_payment(uuid,text) from public, anon;
grant execute on function public.confirm_salary_payment(uuid,text) to authenticated;

-- Finance is a separate workspace; it does not grant access to HR records.
delete from public.school_role_permission_catalog
where role_key = 'finance_officer' and permission_key = 'school.hr.portal.view';
