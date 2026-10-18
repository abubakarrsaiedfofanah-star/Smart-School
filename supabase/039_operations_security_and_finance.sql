-- School-scoped operations: staff attendance, expenses, payment reconciliation,
-- and durable inventory history. Requires migrations 027, 037, and 038.

create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  staff_profile_id uuid not null references public.profiles(id) on delete restrict,
  attendance_date date not null default current_date,
  status text not null check (status in ('present','late','absent','leave','half_day')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  note text,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, staff_profile_id, attendance_date),
  check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);

create table if not exists public.school_expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  category text not null,
  vendor text,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  incurred_on date not null default current_date,
  receipt_reference text,
  notes text,
  status text not null default 'recorded' check (status in ('recorded','approved','paid','void')),
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status not in ('approved','paid')) or approved_by is not null),
  check ((approved_by is null) = (approved_at is null)),
  check ((status <> 'paid') or paid_at is not null)
);

create table if not exists public.payment_reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  provider text not null,
  provider_reference text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  transaction_at timestamptz,
  payment_id uuid references public.payments(id) on delete set null,
  status text not null default 'unmatched' check (status in ('unmatched','matched','duplicate','reviewed')),
  note text,
  recorded_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, provider, provider_reference),
  check ((status <> 'matched') or payment_id is not null)
);

create table if not exists public.asset_change_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  asset_id uuid,
  asset_name text not null,
  action text not null check (action in ('insert','update','delete')),
  actor_id uuid references public.profiles(id) on delete set null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_attendance_school_day_idx on public.staff_attendance(school_id, attendance_date desc);
create index if not exists school_expenses_school_date_idx on public.school_expenses(school_id, incurred_on desc);
create index if not exists payment_reconciliation_school_status_idx on public.payment_reconciliation_records(school_id, status, created_at desc);
create index if not exists asset_change_logs_school_asset_idx on public.asset_change_logs(school_id, asset_id, created_at desc);

alter table public.staff_attendance enable row level security;
alter table public.school_expenses enable row level security;
alter table public.payment_reconciliation_records enable row level security;
alter table public.asset_change_logs enable row level security;
alter table public.finance_audit_events enable row level security;

drop policy if exists staff_attendance_self_read on public.staff_attendance;
drop policy if exists staff_attendance_admin_read on public.staff_attendance;
drop policy if exists staff_attendance_admin_manage on public.staff_attendance;
create policy staff_attendance_self_read on public.staff_attendance for select to authenticated using (
  school_id = private.current_school_id() and staff_profile_id = (select auth.uid())
);
create policy staff_attendance_admin_read on public.staff_attendance for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() = 'school_admin'
);
create policy staff_attendance_admin_manage on public.staff_attendance for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() = 'school_admin')
  with check (
    school_id = private.current_school_id() and private.current_role() = 'school_admin'
    and exists (select 1 from public.profiles p where p.id = staff_profile_id and p.school_id = staff_attendance.school_id and p.role in ('school_admin','teacher'))
    and recorded_by = (select auth.uid())
  );

drop policy if exists school_expenses_finance_read on public.school_expenses;
drop policy if exists school_expenses_finance_manage on public.school_expenses;
drop policy if exists school_expenses_finance_insert on public.school_expenses;
drop policy if exists school_expenses_finance_update on public.school_expenses;
drop policy if exists school_expenses_finance_delete on public.school_expenses;
create policy school_expenses_finance_read on public.school_expenses for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
);
create policy school_expenses_finance_insert on public.school_expenses for insert to authenticated with check (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) and created_by = (select auth.uid())
  and approved_by is null and approved_at is null and status = 'recorded'
);
create policy school_expenses_finance_update on public.school_expenses for update to authenticated
  using (private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']))
  with check (private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
    and (approved_by is null or (approved_by = (select auth.uid()) and private.has_hr_role(school_id, array['principal']))));
create policy school_expenses_finance_delete on public.school_expenses for delete to authenticated
  using (private.has_hr_role(school_id, array['principal','hr_admin']) and status = 'recorded');

drop policy if exists reconciliation_finance_read on public.payment_reconciliation_records;
drop policy if exists reconciliation_finance_manage on public.payment_reconciliation_records;
drop policy if exists reconciliation_finance_insert on public.payment_reconciliation_records;
drop policy if exists reconciliation_finance_update on public.payment_reconciliation_records;
drop policy if exists reconciliation_finance_delete on public.payment_reconciliation_records;
create policy reconciliation_finance_read on public.payment_reconciliation_records for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer'])
);
create policy reconciliation_finance_insert on public.payment_reconciliation_records for insert to authenticated with check (
  private.has_hr_role(school_id, array['principal','finance_officer']) and recorded_by = (select auth.uid())
  and (payment_id is null or exists (select 1 from public.payments p where p.id = payment_id and p.school_id = payment_reconciliation_records.school_id))
  and (reviewed_by is null or (reviewed_by = (select auth.uid()) and private.has_hr_role(school_id, array['principal','finance_officer'])))
);
create policy reconciliation_finance_update on public.payment_reconciliation_records for update to authenticated
  using (private.has_hr_role(school_id, array['principal','finance_officer']))
  with check (private.has_hr_role(school_id, array['principal','finance_officer'])
    and (payment_id is null or exists (select 1 from public.payments p where p.id = payment_id and p.school_id = payment_reconciliation_records.school_id))
    and (reviewed_by is null or (reviewed_by = (select auth.uid()) and private.has_hr_role(school_id, array['principal','finance_officer']))));
create policy reconciliation_finance_delete on public.payment_reconciliation_records for delete to authenticated
  using (private.has_hr_role(school_id, array['principal']) and status in ('unmatched','duplicate'));

drop policy if exists payments_finance_reconciliation_read on public.payments;
create policy payments_finance_reconciliation_read on public.payments for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer'])
);

drop policy if exists asset_history_admin_read on public.asset_change_logs;
create policy asset_history_admin_read on public.asset_change_logs for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() = 'school_admin'
);
drop policy if exists finance_audit_admin_read on public.finance_audit_events;
create policy finance_audit_admin_read on public.finance_audit_events for select to authenticated using (
  school_id = private.current_school_id() and private.has_hr_role(school_id, array['principal','hr_admin'])
);

revoke all on public.staff_attendance, public.school_expenses, public.payment_reconciliation_records,
  public.asset_change_logs, public.finance_audit_events from anon;
grant select, insert, update, delete on public.staff_attendance, public.school_expenses,
  public.payment_reconciliation_records to authenticated;
grant select on public.asset_change_logs, public.finance_audit_events to authenticated;
revoke insert, update, delete on public.asset_change_logs, public.finance_audit_events from authenticated;

create or replace function private.log_asset_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.asset_change_logs(school_id, asset_id, asset_name, action, actor_id, old_values, new_values)
  values (
    (row_data->>'school_id')::uuid, (row_data->>'id')::uuid, row_data->>'name', lower(tg_op),
    (select auth.uid()), case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.log_asset_change() from public, anon, authenticated;
drop trigger if exists log_asset_change on public.assets;
create trigger log_asset_change after insert or update or delete on public.assets
for each row execute function private.log_asset_change();

create or replace function private.log_finance_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; old_row jsonb; target_school uuid; target_id uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  target_school := (row_data->>'school_id')::uuid;
  target_id := (row_data->>'id')::uuid;
  insert into public.finance_audit_events(school_id, actor_id, entity_type, entity_id, action, details)
  values (target_school, (select auth.uid()), tg_table_name, target_id, lower(tg_op),
    jsonb_build_object('old', old_row, 'new', case when tg_op = 'DELETE' then null else to_jsonb(new) end));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.log_finance_change() from public, anon, authenticated;
drop trigger if exists audit_school_expenses on public.school_expenses;
create trigger audit_school_expenses after insert or update or delete on public.school_expenses
for each row execute function private.log_finance_change();
drop trigger if exists audit_payment_reconciliation on public.payment_reconciliation_records;
create trigger audit_payment_reconciliation after insert or update or delete on public.payment_reconciliation_records
for each row execute function private.log_finance_change();

create or replace function private.guard_reconciliation_match()
returns trigger language plpgsql security definer set search_path = '' as $$
declare matched_school uuid; matched_amount numeric;
begin
  if new.status <> 'matched' then return new; end if;
  if new.payment_id is null then raise exception 'Choose a school payment before marking this transaction matched.'; end if;
  select p.school_id, p.amount into matched_school, matched_amount from public.payments p where p.id = new.payment_id;
  if matched_school is distinct from new.school_id then raise exception 'Matched payment belongs to a different school.'; end if;
  if matched_amount is distinct from new.amount then raise exception 'Transaction amount must equal the school payment amount to match it.'; end if;
  return new;
end; $$;
revoke all on function private.guard_reconciliation_match() from public, anon, authenticated;
drop trigger if exists guard_reconciliation_match on public.payment_reconciliation_records;
create trigger guard_reconciliation_match before insert or update on public.payment_reconciliation_records
for each row execute function private.guard_reconciliation_match();

create or replace function private.guard_expense_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'recorded' then raise exception 'Approved, paid, or void expenses cannot be deleted.'; end if;
    return old;
  end if;
  if old.status = 'paid' or old.status = 'void' then
    raise exception 'Paid and void expenses are immutable.';
  end if;
  if old.status = 'approved' then
    if new.status not in ('paid','void') or new.title is distinct from old.title or new.category is distinct from old.category
      or new.vendor is distinct from old.vendor or new.amount is distinct from old.amount
      or new.currency_code is distinct from old.currency_code or new.incurred_on is distinct from old.incurred_on
      or new.receipt_reference is distinct from old.receipt_reference or new.notes is distinct from old.notes then
      raise exception 'Approved expense details are locked; only payment completion is allowed.';
    end if;
  end if;
  if new.status = 'approved' and new.approved_by is distinct from (select auth.uid()) then
    raise exception 'An authorized principal must record expense approval.';
  end if;
  if new.status = 'paid' and (old.status <> 'approved' or new.approved_by is null or new.paid_at is null) then
    raise exception 'Expense must be approved and have a payment date before it can be marked paid.';
  end if;
  return new;
end; $$;
revoke all on function private.guard_expense_transition() from public, anon, authenticated;
drop trigger if exists guard_expense_transition on public.school_expenses;
create trigger guard_expense_transition before update or delete on public.school_expenses
for each row execute function private.guard_expense_transition();

-- Fail the migration if any of the platform's core tenant tables lost RLS or all policies.
do $$
declare target text; enabled boolean; policy_count integer;
begin
  foreach target in array array[
    'schools','profiles','students','classes','subjects','attendance','fees','payments','subscriptions',
    'timetable','assets','bus_routes','wellbeing_reports','school_hr_roles','hr_employees',
    'payroll_runs','payroll_items','school_payroll_accounts'
  ] loop
    select c.relrowsecurity into enabled from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = target;
    if enabled is distinct from true then
      raise exception 'Tenant security check failed: public.% does not have row level security enabled', target;
    end if;
    select count(*) into policy_count from pg_policies where schemaname = 'public' and tablename = target;
    if policy_count = 0 then
      raise exception 'Tenant security check failed: public.% has no row security policies', target;
    end if;
  end loop;
end $$;
