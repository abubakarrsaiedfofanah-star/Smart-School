-- Separate non-teaching staff accounts from teacher accounts. Apply after 055.
alter type public.user_role add value if not exists 'staff';

alter table public.school_portal_invites
  drop constraint if exists school_portal_invites_role_check;
alter table public.school_portal_invites
  add constraint school_portal_invites_role_check
  check (role::text in ('teacher', 'staff', 'student', 'parent'));

-- General staff now have a real base portal role instead of a teacher
-- specialist assignment that only granted a generic profile permission.
delete from public.school_staff_role_assignments where role_key = 'staff_member';
delete from public.school_role_permission_catalog where role_key = 'staff_member';

-- A profile owner may edit personal details, but cannot grant themselves a
-- different portal role or move their account into another school.
create or replace function private.prevent_self_role_or_school_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.id = (select auth.uid())
    and coalesce((select auth.role()), '') <> 'service_role'
    and (new.role is distinct from old.role or new.school_id is distinct from old.school_id) then
    raise exception 'Portal role and school membership can only be changed by an authorized school administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_self_role_or_school_change() from public, anon, authenticated;
drop trigger if exists prevent_self_role_or_school_change on public.profiles;
create trigger prevent_self_role_or_school_change
before update of role, school_id on public.profiles
for each row execute function private.prevent_self_role_or_school_change();

-- Keep each employee's existing self-service rows inside their own school.
drop policy if exists employees_read on public.hr_employees;
create policy employees_read on public.hr_employees for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  or (school_id = private.current_school_id() and profile_id = (select auth.uid()))
);
drop policy if exists contracts_read on public.employment_contracts;
create policy contracts_read on public.employment_contracts for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = employment_contracts.employee_id
      and e.school_id = employment_contracts.school_id and e.profile_id = (select auth.uid())
  )
);
drop policy if exists leave_read on public.hr_leave_requests;
create policy leave_read on public.hr_leave_requests for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id
      and e.school_id = hr_leave_requests.school_id and e.profile_id = (select auth.uid())
  )
);
drop policy if exists salary_read on public.salary_structures;
create policy salary_read on public.salary_structures for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = salary_structures.employee_id
      and e.school_id = salary_structures.school_id and e.profile_id = (select auth.uid())
  )
);
drop policy if exists payroll_items_read on public.payroll_items;
create policy payroll_items_read on public.payroll_items for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e join public.payroll_runs r
      on r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
    where e.id = payroll_items.employee_id and e.school_id = payroll_items.school_id
      and e.profile_id = (select auth.uid()) and r.status in ('approved','paying','paid','closed')
  )
);
drop policy if exists payments_read on public.payment_transactions;
create policy payments_read on public.payment_transactions for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer']) or exists (
    select 1 from public.payroll_items i join public.hr_employees e
      on e.id = i.employee_id and e.school_id = i.school_id
    where i.id = payment_transactions.payroll_item_id and i.school_id = payment_transactions.school_id
      and e.profile_id = (select auth.uid())
  )
);

-- Return only the signed-in employee's own approved/released payslip data.
create or replace function public.list_my_staff_payslips()
returns table (
  id uuid,
  pay_period date,
  currency_code text,
  basic_salary numeric,
  allowances jsonb,
  deductions jsonb,
  gross_pay numeric,
  total_deductions numeric,
  net_pay numeric,
  payout_status text,
  payout_provider text,
  payout_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_school uuid;
begin
  select p.school_id into actor_school
  from public.profiles p
  where p.id = actor_id and p.role::text = 'staff';

  if actor_id is null or actor_school is null then
    raise exception 'A school staff account is required.' using errcode = '42501';
  end if;

  return query
    select i.id, r.pay_period, r.currency_code, i.basic_salary, i.allowances, i.deductions,
      i.gross_pay, i.total_deductions, i.net_pay, payout.status, payout.provider, payout.transaction_reference
    from public.hr_employees e
    join public.payroll_items i on i.employee_id = e.id and i.school_id = e.school_id
    join public.payroll_runs r on r.id = i.payroll_run_id and r.school_id = i.school_id
    left join lateral (
      select t.status, t.provider, t.transaction_reference
      from public.payment_transactions t
      where t.payroll_item_id = i.id and t.school_id = i.school_id
      order by t.created_at desc limit 1
    ) payout on true
    where e.profile_id = actor_id and e.school_id = actor_school
      and r.status in ('approved', 'paying', 'paid', 'closed')
    order by r.pay_period desc;
end;
$$;
revoke all on function public.list_my_staff_payslips() from public, anon;
grant execute on function public.list_my_staff_payslips() to authenticated;
