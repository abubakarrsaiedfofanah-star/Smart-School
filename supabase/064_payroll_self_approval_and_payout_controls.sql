-- A privileged approver must not authorize their own compensation, and the
-- finance confirmer must be a different person from the payout initiator.
create or replace function public.approve_school_payroll(target_run uuid, decision_value text, approval_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare run_row public.payroll_runs%rowtype; snapshot_hash text; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid payroll decision.'; end if;
  select * into run_row from public.payroll_runs where id = target_run for update;
  if not found then raise exception 'Payroll run not found.'; end if;
  if not private.has_hr_role(run_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  if run_row.prepared_by = (select auth.uid()) then
    raise exception 'The payroll preparer cannot approve their own payroll run.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.payroll_items i
    join public.hr_employees e on e.id = i.employee_id and e.school_id = i.school_id
    where i.payroll_run_id = target_run and i.school_id = run_row.school_id
      and e.profile_id = (select auth.uid())
  ) then raise exception 'An employee cannot approve a payroll run that includes their own salary.' using errcode = '42501'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before approving payroll.'; end if;
  if run_row.status <> 'submitted' then raise exception 'Only submitted payroll can be approved.'; end if;
  select md5(coalesce(string_agg(concat_ws('|', employee_id::text, basic_salary::text, allowances::text, deductions::text, gross_pay::text, total_deductions::text, net_pay::text), E'\n' order by employee_id), ''))
    into snapshot_hash from public.payroll_items where payroll_run_id = target_run and school_id = run_row.school_id;
  perform set_config('app.hr_payroll_approval','yes',true);
  update public.payroll_runs set status = decision_value,
    approved_at = case when decision_value = 'approved' then now() else null end,
    version = version + 1 where id = target_run;
  insert into public.payroll_approvals(school_id,payroll_run_id,payroll_version,approver_id,approval_hash,assurance_level,decision,notes)
  values(run_row.school_id,target_run,run_row.version,(select auth.uid()),snapshot_hash,aal,decision_value,approval_notes);
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(run_row.school_id,(select auth.uid()),decision_value,'payroll_run',target_run,jsonb_build_object('version',run_row.version,'approval_hash',snapshot_hash,'aal',aal));
end;
$$;
revoke all on function public.approve_school_payroll(uuid,text,text) from public, anon;
grant execute on function public.approve_school_payroll(uuid,text,text) to authenticated;

create or replace function public.review_salary_change(target_salary uuid, decision_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare salary_row public.salary_structures%rowtype; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid salary decision.'; end if;
  select * into salary_row from public.salary_structures where id = target_salary for update;
  if not found then raise exception 'Salary change not found.'; end if;
  if not private.has_hr_role(salary_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  if salary_row.created_by = (select auth.uid()) or exists (
    select 1 from public.hr_employees e
    where e.id = salary_row.employee_id and e.school_id = salary_row.school_id
      and e.profile_id = (select auth.uid())
  ) then raise exception 'The salary change creator or beneficiary cannot approve it.' using errcode = '42501'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before authorizing a salary change.'; end if;
  if salary_row.approval_status <> 'pending' then raise exception 'Only pending salary changes can be reviewed.'; end if;
  perform set_config('app.hr_salary_approval','yes',true);
  update public.salary_structures set approval_status = decision_value,
    approved_by = (select auth.uid()), approved_at = now() where id = target_salary;
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(salary_row.school_id,(select auth.uid()),decision_value,'salary_structure',target_salary,jsonb_build_object('effective_from',salary_row.effective_from,'aal',aal));
end;
$$;
revoke all on function public.review_salary_change(uuid,text) from public, anon;
grant execute on function public.review_salary_change(uuid,text) to authenticated;

create or replace function public.confirm_salary_payment(target_payment uuid, decision_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare payment_row public.payment_transactions%rowtype; item_row public.payroll_items%rowtype; run_status text;
begin
  if decision_value not in ('paid','failed') then raise exception 'Choose paid or failed.'; end if;
  select * into payment_row from public.payment_transactions where id = target_payment for update;
  if not found then raise exception 'Payout record not found.'; end if;
  if not private.has_hr_role(payment_row.school_id, array['finance_officer']) then
    raise exception 'Only the finance officer can confirm salary payouts.';
  end if;
  if payment_row.initiated_by = (select auth.uid()) then
    raise exception 'The payout initiator cannot confirm their own payout.' using errcode = '42501';
  end if;
  if payment_row.status not in ('pending','processing') then raise exception 'Only an open payout record can be confirmed.'; end if;
  select * into item_row from public.payroll_items
  where id = payment_row.payroll_item_id and school_id = payment_row.school_id;
  if not found or payment_row.amount <> item_row.net_pay then raise exception 'Payout does not match the approved net salary.'; end if;
  if exists (
    select 1 from public.hr_employees e where e.id = item_row.employee_id
      and e.school_id = item_row.school_id and e.profile_id = (select auth.uid())
  ) then raise exception 'An employee cannot confirm payment of their own salary.' using errcode = '42501'; end if;
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
