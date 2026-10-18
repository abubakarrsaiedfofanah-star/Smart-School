-- HR and payroll foundation. Sensitive payroll actions remain school-scoped.
create table if not exists public.school_hr_roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hr_role text not null check (hr_role in ('principal','hr_admin','finance_officer','staff_member')),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, profile_id)
);

create table if not exists public.job_vacancies (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  title text not null, department text, description text, requirements text,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  closes_at date, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  vacancy_id uuid not null references public.job_vacancies(id) on delete cascade,
  applicant_name text not null, email text not null, phone text, qualifications text, cv_path text,
  status text not null default 'received' check (status in ('received','shortlisted','interview','selected','rejected')),
  submitted_at timestamptz not null default now(), reviewed_by uuid references public.profiles(id), reviewed_at timestamptz
);
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null, staff_number text not null,
  full_name text not null, email text, phone text, department text, job_title text not null,
  employment_status text not null default 'active' check (employment_status in ('active','on_leave','probation','suspended','terminated')),
  hire_date date, next_of_kin_name text, next_of_kin_phone text, qualifications text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, staff_number), unique (school_id, profile_id)
);
create table if not exists public.employment_contracts (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade, contract_type text not null,
  start_date date not null, end_date date, probation_end date, status text not null default 'draft' check (status in ('draft','active','expired','terminated')),
  document_path text, signed_at timestamptz, signed_by uuid references public.profiles(id), created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade, leave_type text not null,
  start_date date not null, end_date date not null, reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create table if not exists public.salary_structures (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  basic_salary numeric(12,2) not null check (basic_salary >= 0), allowances jsonb not null default '[]'::jsonb,
  deductions jsonb not null default '[]'::jsonb, payment_method text check (payment_method in ('bank','mpesa','cash','other')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  effective_from date not null, effective_to date, approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  pay_period date not null, status text not null default 'draft' check (status in ('draft','submitted','approved','paying','paid','closed','rejected')),
  version integer not null default 1 check (version > 0), currency_code text not null default 'KES',
  prepared_by uuid references public.profiles(id), submitted_at timestamptz, approved_at timestamptz, paid_at timestamptz,
  created_at timestamptz not null default now(), unique (school_id, pay_period)
);
create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  basic_salary numeric(12,2) not null check (basic_salary >= 0), allowances jsonb not null default '[]'::jsonb,
  deductions jsonb not null default '[]'::jsonb, gross_pay numeric(12,2) not null check (gross_pay >= 0),
  total_deductions numeric(12,2) not null check (total_deductions >= 0), net_pay numeric(12,2) not null check (net_pay >= 0),
  created_at timestamptz not null default now(), unique (payroll_run_id, employee_id)
);
create table if not exists public.payroll_approvals (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  payroll_version integer not null, approver_id uuid not null references public.profiles(id),
  approval_hash text not null, assurance_level text not null, decision text not null check (decision in ('approved','rejected')),
  notes text, created_at timestamptz not null default now()
);
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  payroll_item_id uuid not null references public.payroll_items(id) on delete restrict,
  provider text not null check (provider in ('bank','mpesa','cash','other')),
  transaction_reference text, amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','reversed')),
  initiated_by uuid references public.profiles(id), confirmed_at timestamptz, created_at timestamptz not null default now()
);
create unique index if not exists payment_one_success_per_item on public.payment_transactions(payroll_item_id) where status = 'paid';
create unique index if not exists payment_reference_unique_per_school on public.payment_transactions(school_id, provider, transaction_reference) where transaction_reference is not null;
create table if not exists public.hr_audit_events (
  id bigint generated always as identity primary key, school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid references public.profiles(id), action text not null, entity_type text not null,
  entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_hr_roles r
    where r.profile_id = (select auth.uid()) and r.school_id = target_school and r.hr_role = any(allowed_roles)
  );
$$;
revoke all on function private.has_hr_role(uuid,text[]) from public, anon;
grant execute on function private.has_hr_role(uuid,text[]) to authenticated;

alter table public.school_hr_roles enable row level security;
alter table public.job_vacancies enable row level security;
alter table public.job_applications enable row level security;
alter table public.hr_employees enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.salary_structures enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.payroll_approvals enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.hr_audit_events enable row level security;

create policy hr_roles_read on public.school_hr_roles for select to authenticated using (
  profile_id = (select auth.uid()) or private.has_hr_role(school_id, array['principal'])
);
create policy hr_roles_admin_manage on public.school_hr_roles for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.school_id = school_hr_roles.school_id and p.role = 'school_admin')
) with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.school_id = school_hr_roles.school_id and p.role = 'school_admin')
);

create policy vacancies_read on public.job_vacancies for select to authenticated using (
  school_id = private.current_school_id()
  and (status = 'published' or private.has_hr_role(school_id, array['principal','hr_admin']))
);
create policy vacancies_manage on public.job_vacancies for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));
create policy applications_manage on public.job_applications for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));

create policy employees_read on public.hr_employees for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) or profile_id = (select auth.uid())
);
create policy employees_manage on public.hr_employees for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));
create policy contracts_read on public.employment_contracts for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = employment_contracts.employee_id and e.profile_id = (select auth.uid())
  )
);
create policy contracts_manage on public.employment_contracts for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));
create policy leave_read on public.hr_leave_requests for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id and e.profile_id = (select auth.uid())
  )
);
create policy leave_create_self on public.hr_leave_requests for insert to authenticated with check (exists (
  select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id and e.profile_id = (select auth.uid()) and e.school_id = hr_leave_requests.school_id
));
create policy leave_review on public.hr_leave_requests for update to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));

create policy salary_read on public.salary_structures for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) or exists (
    select 1 from public.hr_employees e where e.id = salary_structures.employee_id and e.profile_id = (select auth.uid())
  )
);
create policy salary_manage on public.salary_structures for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  and approval_status = 'pending' and approved_by is null and approved_at is null
);
create or replace function private.guard_salary_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.approval_status = 'approved' then raise exception 'Approved salary structures cannot be deleted.'; end if;
    return old;
  end if;
  if old.approval_status = 'approved' then raise exception 'Approved salary structures are immutable. Create a new effective salary change.'; end if;
  if new.approval_status is distinct from old.approval_status
    and not (current_setting('app.hr_salary_approval', true) = 'yes' and new.approval_status in ('approved','rejected')) then
    raise exception 'Salary authorization must use the principal approval workflow.';
  end if;
  if (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at)
    and current_setting('app.hr_salary_approval', true) is distinct from 'yes' then
    raise exception 'Salary approval evidence is managed by the approval workflow.';
  end if;
  return new;
end; $$;
create trigger guard_salary_change before update or delete on public.salary_structures for each row execute function private.guard_salary_change();

create policy payroll_read on public.payroll_runs for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
);
create policy payroll_prepare on public.payroll_runs for insert to authenticated with check (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
);
create policy payroll_update on public.payroll_runs for update to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) and status in ('draft','submitted','rejected')
) with check (private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']));
create or replace function private.guard_payroll_run_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'submitted' then
    if current_setting('app.hr_payroll_approval', true) = 'yes' and new.status in ('approved','rejected') then
      return new;
    end if;
    raise exception 'Submitted payroll is locked until principal review.';
  end if;
  if new.version is distinct from old.version and current_setting('app.hr_payroll_approval', true) is distinct from 'yes' then
    raise exception 'Payroll version is managed by the approval workflow.';
  end if;
  if new.status is distinct from old.status then
    if old.status in ('draft','rejected') and new.status = 'submitted' then
      return new;
    end if;
    raise exception 'Payroll status changes must follow the review workflow.';
  end if;
  if old.status in ('approved','paying','paid','closed') then
    raise exception 'An approved payroll run is locked.';
  end if;
  return new;
end; $$;
drop trigger if exists guard_payroll_run_transition on public.payroll_runs;
create trigger guard_payroll_run_transition before update on public.payroll_runs
for each row execute function private.guard_payroll_run_transition();
create policy payroll_items_read on public.payroll_items for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) or exists (
    select 1 from public.hr_employees e join public.payroll_runs r on r.id = payroll_items.payroll_run_id
    where e.id = payroll_items.employee_id and e.profile_id = (select auth.uid())
      and r.status in ('approved','paying','paid','closed')
  )
);
create policy payroll_items_prepare on public.payroll_items for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) and exists (
    select 1 from public.payroll_runs r where r.id = payroll_items.payroll_run_id and r.status in ('draft','rejected')
  )
) with check (private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) and exists (
  select 1 from public.payroll_runs r where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id and r.status in ('draft','rejected')
));
create policy approvals_read on public.payroll_approvals for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
);
create policy approvals_insert on public.payroll_approvals for insert to authenticated with check (
  private.has_hr_role(school_id, array['principal']) and approver_id = (select auth.uid())
);
create policy payments_read on public.payment_transactions for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer']) or exists (
    select 1 from public.payroll_items i join public.hr_employees e on e.id = i.employee_id
    where i.id = payment_transactions.payroll_item_id and e.profile_id = (select auth.uid())
  )
);
create policy payments_manage on public.payment_transactions for all to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer'])
) with check (private.has_hr_role(school_id, array['principal','finance_officer']));
create policy hr_audit_read on public.hr_audit_events for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
);
revoke insert, update, delete on public.payroll_approvals, public.hr_audit_events from authenticated;

create or replace function private.log_hr_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; target_school uuid; target_id uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_school := (row_data->>'school_id')::uuid;
  target_id := (row_data->>'id')::uuid;
  insert into public.hr_audit_events(school_id, actor_id, action, entity_type, entity_id, details)
  values(target_school, (select auth.uid()), lower(tg_op), tg_table_name, target_id, '{}'::jsonb);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger hr_roles_audit after insert or update or delete on public.school_hr_roles for each row execute function private.log_hr_change();
create trigger hr_employee_audit after insert or update or delete on public.hr_employees for each row execute function private.log_hr_change();
create trigger hr_contract_audit after insert or update or delete on public.employment_contracts for each row execute function private.log_hr_change();
create trigger hr_leave_audit after insert or update or delete on public.hr_leave_requests for each row execute function private.log_hr_change();
create trigger hr_salary_audit after insert or update or delete on public.salary_structures for each row execute function private.log_hr_change();
create trigger hr_payroll_audit after insert or update or delete on public.payroll_runs for each row execute function private.log_hr_change();
create trigger hr_payroll_item_audit after insert or update or delete on public.payroll_items for each row execute function private.log_hr_change();
create trigger hr_payment_audit after insert or update or delete on public.payment_transactions for each row execute function private.log_hr_change();

create or replace function public.approve_school_payroll(target_run uuid, decision_value text, approval_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare run_row public.payroll_runs%rowtype; snapshot_hash text; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid payroll decision.'; end if;
  select * into run_row from public.payroll_runs where id = target_run for update;
  if not found then raise exception 'Payroll run not found.'; end if;
  if not private.has_hr_role(run_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before approving payroll.'; end if;
  if run_row.status <> 'submitted' then raise exception 'Only submitted payroll can be approved.'; end if;
  select md5(coalesce(string_agg(concat_ws('|', employee_id::text, basic_salary::text, allowances::text, deductions::text, gross_pay::text, total_deductions::text, net_pay::text), E'\n' order by employee_id), ''))
  into snapshot_hash from public.payroll_items where payroll_run_id = target_run;
  perform set_config('app.hr_payroll_approval','yes',true);
  update public.payroll_runs set status = decision_value, approved_at = case when decision_value = 'approved' then now() else null end, version = version + 1 where id = target_run;
  insert into public.payroll_approvals(school_id,payroll_run_id,payroll_version,approver_id,approval_hash,assurance_level,decision,notes)
  values(run_row.school_id,target_run,run_row.version,(select auth.uid()),snapshot_hash,aal,decision_value,approval_notes);
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(run_row.school_id,(select auth.uid()),decision_value,'payroll_run',target_run,jsonb_build_object('version',run_row.version,'approval_hash',snapshot_hash,'aal',aal));
end; $$;
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
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before authorizing a salary change.'; end if;
  if salary_row.approval_status <> 'pending' then raise exception 'Only pending salary changes can be reviewed.'; end if;
  perform set_config('app.hr_salary_approval','yes',true);
  update public.salary_structures set approval_status = decision_value,
    approved_by = (select auth.uid()), approved_at = now() where id = target_salary;
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(salary_row.school_id,(select auth.uid()),decision_value,'salary_structure',target_salary,jsonb_build_object('effective_from',salary_row.effective_from,'aal',aal));
end; $$;
revoke all on function public.review_salary_change(uuid,text) from public, anon;
grant execute on function public.review_salary_change(uuid,text) to authenticated;
