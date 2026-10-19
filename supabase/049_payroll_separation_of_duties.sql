-- HR maintains personnel and salary records and prepares payroll. The
-- principal approves; Finance only receives the minimum payout information.

drop policy if exists employees_read on public.hr_employees;
create policy employees_read on public.hr_employees for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  or profile_id = (select auth.uid())
);

drop policy if exists salary_read on public.salary_structures;
create policy salary_read on public.salary_structures for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e
    where e.id = salary_structures.employee_id and e.profile_id = (select auth.uid())
  )
);

drop policy if exists salary_manage on public.salary_structures;
create policy salary_manage on public.salary_structures for all to authenticated
using (private.has_hr_role(school_id, array['hr_admin']))
with check (
  private.has_hr_role(school_id, array['hr_admin'])
  and approval_status = 'pending' and approved_by is null and approved_at is null
);

drop policy if exists payroll_prepare on public.payroll_runs;
create policy payroll_prepare on public.payroll_runs for insert to authenticated
with check (
  private.has_hr_role(school_id, array['hr_admin'])
  and prepared_by = (select auth.uid()) and status = 'draft'
);

drop policy if exists payroll_update on public.payroll_runs;
create policy payroll_update on public.payroll_runs for update to authenticated
using (
  private.has_hr_role(school_id, array['hr_admin'])
  and status in ('draft','submitted','rejected')
)
with check (private.has_hr_role(school_id, array['hr_admin']));

drop policy if exists payroll_items_prepare on public.payroll_items;
create policy payroll_items_prepare on public.payroll_items for all to authenticated
using (
  private.has_hr_role(school_id, array['hr_admin']) and exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
      and r.status in ('draft','rejected')
  )
)
with check (
  private.has_hr_role(school_id, array['hr_admin']) and exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
      and r.status in ('draft','rejected')
  )
);

drop policy if exists payroll_items_read on public.payroll_items;
create policy payroll_items_read on public.payroll_items for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e join public.payroll_runs r on r.id = payroll_items.payroll_run_id
    where e.id = payroll_items.employee_id and e.profile_id = (select auth.uid())
      and r.status in ('approved','paying','paid','closed')
  )
);

create or replace function public.list_salary_payout_items()
returns table (
  id uuid,
  net_pay numeric,
  pay_period date,
  payroll_status text,
  currency_code text,
  employee_name text,
  staff_number text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_school uuid := private.current_school_id();
begin
  if target_school is null or not private.has_hr_role(target_school, array['principal','finance_officer']) then
    raise exception 'Finance or principal portal access is required.';
  end if;

  return query
    select i.id, i.net_pay, r.pay_period, r.status, r.currency_code, e.full_name, e.staff_number
    from public.payroll_items i
    join public.payroll_runs r on r.id = i.payroll_run_id and r.school_id = i.school_id
    join public.hr_employees e on e.id = i.employee_id and e.school_id = i.school_id
    where i.school_id = target_school and r.status in ('approved','paying','paid','closed')
    order by r.pay_period desc, e.full_name;
end;
$$;
revoke all on function public.list_salary_payout_items() from public, anon;
grant execute on function public.list_salary_payout_items() to authenticated;
