-- Run in Supabase SQL Editor after migrations 027 and 039.
-- Needs two existing schools, each with a school_admin profile. All fixture
-- rows are created inside this transaction and rolled back at the end.
begin;

do $$
declare
  school_a uuid;
  admin_a uuid;
  school_b uuid;
  admin_b uuid;
  asset_fixture uuid := gen_random_uuid();
  expense_fixture uuid := gen_random_uuid();
  attendance_fixture uuid := gen_random_uuid();
  reconciliation_fixture uuid := gen_random_uuid();
begin
  select p.school_id, p.id into school_a, admin_a
  from public.profiles p where p.role = 'school_admin' and p.school_id is not null order by p.created_at limit 1;
  select p.school_id, p.id into school_b, admin_b
  from public.profiles p where p.role = 'school_admin' and p.school_id is not null and p.school_id <> school_a order by p.created_at limit 1;
  if school_a is null or school_b is null then
    raise exception 'Tenant isolation smoke test requires school_admin users from two different schools.';
  end if;

  perform set_config('tenant_test.school_a', school_a::text, true);
  perform set_config('tenant_test.admin_a', admin_a::text, true);
  perform set_config('tenant_test.school_b', school_b::text, true);
  perform set_config('tenant_test.admin_b', admin_b::text, true);
  perform set_config('tenant_test.asset_id', asset_fixture::text, true);
  perform set_config('tenant_test.expense_id', expense_fixture::text, true);
  perform set_config('tenant_test.attendance_id', attendance_fixture::text, true);
  perform set_config('tenant_test.reconciliation_id', reconciliation_fixture::text, true);
end $$;

insert into public.assets(id, school_id, name, status) values (
  current_setting('tenant_test.asset_id')::uuid,
  current_setting('tenant_test.school_b')::uuid,
  'tenant isolation fixture', 'available'
);
insert into public.school_expenses(id, school_id, title, category, amount, currency_code, created_by)
values (current_setting('tenant_test.expense_id')::uuid, current_setting('tenant_test.school_b')::uuid,
  'tenant isolation fixture', 'test', 1, 'KES', current_setting('tenant_test.admin_b')::uuid);
insert into public.staff_attendance(id, school_id, staff_profile_id, attendance_date, status, recorded_by)
values (current_setting('tenant_test.attendance_id')::uuid, current_setting('tenant_test.school_b')::uuid,
  current_setting('tenant_test.admin_b')::uuid, date '1900-01-01', 'present', current_setting('tenant_test.admin_b')::uuid);
insert into public.payment_reconciliation_records(id, school_id, provider, provider_reference, amount, currency_code, recorded_by)
values (current_setting('tenant_test.reconciliation_id')::uuid, current_setting('tenant_test.school_b')::uuid,
  'test', 'tenant-isolation-' || gen_random_uuid()::text, 1, 'KES', current_setting('tenant_test.admin_b')::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('tenant_test.admin_a'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('tenant_test.admin_a'), 'role', 'authenticated')::text, true);

do $$
declare
  visible_count integer;
  changed_count integer;
  denied boolean;
  school_b uuid := current_setting('tenant_test.school_b')::uuid;
  admin_a uuid := current_setting('tenant_test.admin_a')::uuid;
begin
  select count(*) into visible_count from public.assets where id = current_setting('tenant_test.asset_id')::uuid;
  if visible_count <> 0 then raise exception 'Cross-school asset read was not blocked.'; end if;
  select count(*) into visible_count from public.school_expenses where id = current_setting('tenant_test.expense_id')::uuid;
  if visible_count <> 0 then raise exception 'Cross-school expense read was not blocked.'; end if;
  select count(*) into visible_count from public.staff_attendance where id = current_setting('tenant_test.attendance_id')::uuid;
  if visible_count <> 0 then raise exception 'Cross-school staff-attendance read was not blocked.'; end if;
  select count(*) into visible_count from public.payment_reconciliation_records where id = current_setting('tenant_test.reconciliation_id')::uuid;
  if visible_count <> 0 then raise exception 'Cross-school reconciliation read was not blocked.'; end if;

  update public.assets set name = 'cross-school write attempt' where id = current_setting('tenant_test.asset_id')::uuid;
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then raise exception 'Cross-school asset update was not blocked.'; end if;
  update public.school_expenses set title = 'cross-school write attempt' where id = current_setting('tenant_test.expense_id')::uuid;
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then raise exception 'Cross-school expense update was not blocked.'; end if;

  denied := false;
  begin
    insert into public.assets(school_id, name) values (school_b, 'cross-school insert attempt');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cross-school asset insert was not blocked.'; end if;

  denied := false;
  begin
    insert into public.school_expenses(school_id, title, category, amount, currency_code, created_by)
    values (school_b, 'cross-school insert attempt', 'test', 1, 'KES', admin_a);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cross-school expense insert was not blocked.'; end if;

  denied := false;
  begin
    insert into public.staff_attendance(school_id, staff_profile_id, attendance_date, status, recorded_by)
    values (school_b, admin_a, date '1900-01-02', 'present', admin_a);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cross-school staff-attendance insert was not blocked.'; end if;

  denied := false;
  begin
    insert into public.payment_reconciliation_records(school_id, provider, provider_reference, amount, currency_code, recorded_by)
    values (school_b, 'test', 'cross-school-' || gen_random_uuid()::text, 1, 'KES', admin_a);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Cross-school reconciliation insert was not blocked.'; end if;
end $$;

reset role;
rollback;
