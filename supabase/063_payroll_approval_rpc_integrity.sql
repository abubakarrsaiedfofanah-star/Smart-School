-- Custom PostgreSQL settings are client-settable. Never treat the approval
-- GUC alone as proof that the principal approval RPC authorized this update.
create or replace function private.guard_payroll_run_transition()
returns trigger language plpgsql set search_path = '' as $$
declare approval_rpc_owner name;
begin
  if new.id is distinct from old.id
    or new.school_id is distinct from old.school_id
    or new.pay_period is distinct from old.pay_period
    or new.prepared_by is distinct from old.prepared_by then
    raise exception 'Payroll identity and preparer are immutable.' using errcode = '42501';
  end if;

  if old.status = 'submitted' then
    select pg_catalog.pg_get_userbyid(p.proowner)::name into approval_rpc_owner
    from pg_catalog.pg_proc p
    where p.oid = 'public.approve_school_payroll(uuid,text,text)'::pg_catalog.regprocedure;

    if approval_rpc_owner is not null
      and current_user = approval_rpc_owner
      and current_setting('app.hr_payroll_approval', true) = 'yes'
      and new.status in ('approved','rejected')
      and new.version = old.version + 1
      and new.submitted_at is not distinct from old.submitted_at
      and new.paid_at is not distinct from old.paid_at
      and ((new.status = 'approved' and new.approved_at is not null)
        or (new.status = 'rejected' and new.approved_at is null))
      and private.has_hr_role(old.school_id, array['principal'])
      and (select auth.jwt()->>'aal') = 'aal2'
      and old.prepared_by is distinct from (select auth.uid()) then
      return new;
    end if;
    raise exception 'Submitted payroll can only be approved or rejected by a different principal through the approval workflow.'
      using errcode = '42501';
  end if;

  if old.status in ('draft','rejected') then
    if new.status is distinct from old.status then
      if new.status = 'submitted'
        and new.version = old.version
        and new.approved_at is null
        and new.paid_at is not distinct from old.paid_at then
        new.submitted_at := now();
        return new;
      end if;
      raise exception 'Payroll status changes must follow the review workflow.' using errcode = '42501';
    end if;
    if new.version is distinct from old.version
      or new.submitted_at is distinct from old.submitted_at
      or new.approved_at is distinct from old.approved_at
      or new.paid_at is distinct from old.paid_at then
      raise exception 'Payroll workflow timestamps and version are managed by the review workflow.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Approved payroll runs are locked.' using errcode = '42501';
end;
$$;
revoke all on function private.guard_payroll_run_transition() from public, anon, authenticated;

create or replace function public.approve_school_payroll(target_run uuid, decision_value text, approval_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare run_row public.payroll_runs%rowtype; snapshot_hash text; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid payroll decision.'; end if;
  select * into run_row from public.payroll_runs where id = target_run for update;
  if not found then raise exception 'Payroll run not found.'; end if;
  if not private.has_hr_role(run_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  if run_row.prepared_by = (select auth.uid()) then raise exception 'The payroll preparer cannot approve their own payroll run.' using errcode = '42501'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before approving payroll.'; end if;
  if run_row.status <> 'submitted' then raise exception 'Only submitted payroll can be approved.'; end if;
  select md5(coalesce(string_agg(concat_ws('|', employee_id::text, basic_salary::text, allowances::text, deductions::text, gross_pay::text, total_deductions::text, net_pay::text), E'\n' order by employee_id), ''))
    into snapshot_hash from public.payroll_items where payroll_run_id = target_run;
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
