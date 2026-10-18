-- Country-aware tenant settings and generic school-owned collection account details.
alter table public.schools
  add column if not exists country_code text not null default 'KE',
  add column if not exists mobile_money_provider text,
  add column if not exists mobile_money_number text,
  add column if not exists mobile_money_account_name text;

alter table public.schools drop constraint if exists schools_currency_code_check;
alter table public.schools add constraint schools_currency_code_check
  check (currency_code ~ '^[A-Z]{3}$');
alter table public.schools add constraint schools_country_code_check
  check (country_code ~ '^[A-Z]{2}$');

alter table public.salary_structures drop constraint if exists salary_structures_payment_method_check;
alter table public.salary_structures add constraint salary_structures_payment_method_check
  check (payment_method in ('bank','mobile_money','mpesa','cash','other'));
alter table public.payment_transactions drop constraint if exists payment_transactions_provider_check;
alter table public.payment_transactions add constraint payment_transactions_provider_check
  check (provider in ('bank','mobile_money','mpesa','cash','other'));

create table if not exists public.school_payroll_accounts (
  school_id uuid primary key references public.schools(id) on delete cascade,
  currency_code text not null,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_routing_code text,
  mobile_money_provider text,
  mobile_money_number text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (currency_code ~ '^[A-Z]{3}$')
);
alter table public.school_payroll_accounts enable row level security;
create policy school_payroll_accounts_read on public.school_payroll_accounts for select to authenticated
using (private.has_hr_role(school_id, array['principal','finance_officer']));
create policy school_payroll_accounts_manage on public.school_payroll_accounts for all to authenticated
using (private.has_hr_role(school_id, array['principal']))
with check (private.has_hr_role(school_id, array['principal']));
create trigger school_payroll_accounts_audit after insert or update or delete on public.school_payroll_accounts
for each row execute function private.log_hr_change();

update public.schools set country_code = case currency_code
  when 'KES' then 'KE' when 'UGX' then 'UG' when 'TZS' then 'TZ' when 'SLE' then 'SL' else country_code end;
update public.schools set currency_code = 'SLE' where country_code = 'SL' and currency_code = 'KES';

alter table public.payroll_runs alter column currency_code drop default;
