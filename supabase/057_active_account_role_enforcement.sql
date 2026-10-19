-- Disabled profiles must lose app and data access, including through sessions
-- issued before their account was disabled.
create or replace function private.current_role()
returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true
  limit 1
$$;

create or replace function private.current_school_id()
returns uuid
language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true
  limit 1
$$;

create or replace function private.can_view_class(target_class uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor
    join public.classes c on c.id = target_class
    where actor.id = (select auth.uid()) and actor.is_active is true and (
      (c.school_id = actor.school_id and actor.role = 'school_admin')
      or (c.school_id = actor.school_id and actor.role = 'teacher' and (
        c.teacher_id = actor.id
        or exists (select 1 from public.teacher_subject_assignments tsa where tsa.class_id = c.id and tsa.teacher_id = actor.id)
      ))
      or exists (select 1 from public.students s where s.class_id = c.id and s.profile_id = actor.id and s.school_id = actor.school_id)
      or (actor.role = 'parent' and exists (
        select 1 from public.students s join public.student_guardians g on g.student_id = s.id
        where s.class_id = c.id and s.school_id = actor.school_id and g.guardian_id = actor.id
      ))
    )
  )
$$;

create or replace function private.can_view_student(target_student uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor
    join public.students s on s.id = target_student
    where actor.id = (select auth.uid()) and actor.is_active is true and (
      (s.school_id = actor.school_id and actor.role = 'school_admin')
      or (s.school_id = actor.school_id and s.profile_id = actor.id)
      or (s.school_id = actor.school_id and actor.role = 'teacher' and exists (
        select 1 from public.classes c where c.id = s.class_id and c.school_id = s.school_id and (
          c.teacher_id = actor.id or exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.teacher_id = actor.id and tsa.class_id = c.id and tsa.school_id = c.school_id
          )
        )
      ))
      or (s.school_id = actor.school_id and actor.role = 'parent' and exists (
        select 1 from public.student_guardians g where g.student_id = s.id and g.guardian_id = actor.id
      ))
    )
  )
$$;

create or replace function private.can_grade_student(target_student uuid, target_subject uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
    join public.profiles actor on actor.id = (select auth.uid()) and actor.is_active is true
    where s.id = target_student and s.school_id = actor.school_id and (
      (actor.role = 'school_admin')
      or (actor.role = 'teacher' and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.teacher_id = actor.id and tsa.school_id = actor.school_id
          and tsa.class_id = s.class_id and tsa.subject_id = target_subject
      ))
    )
  )
$$;

create or replace function public.same_school(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and (p.role = 'super_admin' or p.school_id = target_school)
  )
$$;
revoke all on function public.same_school(uuid) from public, anon;
grant execute on function public.same_school(uuid) to authenticated;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'super_admin')
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.request_school_plan(p_plan text)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; result public.subscriptions;
begin
  select * into actor from public.profiles where id = (select auth.uid()) and is_active is true;
  if actor.role is distinct from 'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator account is required.' using errcode = '42501';
  end if;
  if p_plan not in ('Starter','Professional','Enterprise') then raise exception 'Choose a valid SmartSchool plan.'; end if;
  update public.subscriptions set requested_plan = p_plan, request_status = 'pending', requested_at = now()
  where school_id = actor.school_id returning * into result;
  if result.id is null then raise exception 'Subscription record not found.'; end if;
  return result;
end;
$$;
revoke all on function public.request_school_plan(text) from public, anon;
grant execute on function public.request_school_plan(text) to authenticated;

create or replace function public.platform_set_subscription(p_school_id uuid, p_plan text, p_status text, p_ends_at timestamptz default null)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.subscriptions;
begin
  select role into actor_role from public.profiles where id = (select auth.uid()) and is_active is true;
  if actor_role is distinct from 'super_admin' then raise exception 'An active platform administrator account is required.' using errcode = '42501'; end if;
  if p_plan not in ('Starter','Professional','Enterprise') then raise exception 'Choose a valid plan.'; end if;
  if p_status not in ('pending','trial','active','suspended','expired','cancelled') then raise exception 'Choose a valid subscription status.'; end if;
  update public.subscriptions set plan=p_plan,status=p_status,
    starts_at=case when p_status in ('trial','active') then coalesce(starts_at,now()) else starts_at end,
    ends_at=p_ends_at,requested_plan=null,request_status=case when p_status='pending' then 'pending' else 'approved' end
  where school_id=p_school_id returning * into result;
  if result.id is null then raise exception 'Subscription not found.'; end if;
  update public.schools set subscription_plan=p_plan,
    status=case when p_status in ('trial','active') then 'active'::public.school_status
      when p_status in ('suspended','expired','cancelled') then 'suspended'::public.school_status
      else 'pending'::public.school_status end where id=p_school_id;
  return result;
end;
$$;
revoke all on function public.platform_set_subscription(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.platform_set_subscription(uuid,text,text,timestamptz) to authenticated;

create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.schools;
begin
  select role into actor_role from public.profiles where id = (select auth.uid()) and is_active is true;
  if actor_role is distinct from 'super_admin' then raise exception 'An active platform administrator account is required.' using errcode = '42501'; end if;
  update public.schools set status=p_status where id=p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end;
$$;
revoke all on function public.platform_set_school_status(uuid,public.school_status) from public, anon;
grant execute on function public.platform_set_school_status(uuid,public.school_status) to authenticated;

create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.is_active is true and p.role = 'teacher'
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school and c.permission_key = required_permission
  )
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.is_active is true and p.role = 'teacher'
    where a.profile_id = (select auth.uid()) and a.school_id = target_school and a.role_key = any(allowed_roles)
  )
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

-- Account holders may edit ordinary profile fields, never their access state.
create or replace function private.prevent_self_role_or_school_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.id = (select auth.uid())
    and coalesce((select auth.role()), '') <> 'service_role'
    and (new.role is distinct from old.role or new.school_id is distinct from old.school_id
      or new.is_active is distinct from old.is_active) then
    raise exception 'Portal role, account status, and school membership can only be changed by an authorized administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_self_role_or_school_change on public.profiles;
create trigger prevent_self_role_or_school_change
before update of role, school_id, is_active on public.profiles
for each row execute function private.prevent_self_role_or_school_change();

-- Only active administrators can inspect or change specialist role grants.
drop policy if exists school_staff_roles_read on public.school_staff_role_assignments;
create policy school_staff_roles_read on public.school_staff_role_assignments for select to authenticated using (
  (profile_id = (select auth.uid()) and school_id = private.current_school_id())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
    and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin')
);
drop policy if exists school_staff_roles_admin_manage on public.school_staff_role_assignments;
create policy school_staff_roles_admin_manage on public.school_staff_role_assignments for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
  and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'))
with check (exists (select 1 from public.profiles p join public.profiles target
  on target.id = school_staff_role_assignments.profile_id and target.school_id = school_staff_role_assignments.school_id
  where p.id = (select auth.uid()) and p.is_active is true and p.school_id = school_staff_role_assignments.school_id
    and p.role = 'school_admin' and target.is_active is true and target.role = 'teacher'));

drop policy if exists "school admins view their portal invitations" on public.school_portal_invites;
create policy "school admins view their portal invitations" on public.school_portal_invites
for select to authenticated using (
  public.same_school(school_id) and exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true and p.role = 'school_admin')
);

-- Self-service HR rows remain available only to an active account in the row's school.
drop policy if exists contracts_read on public.employment_contracts;
create policy contracts_read on public.employment_contracts for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = employment_contracts.employee_id
      and e.school_id = employment_contracts.school_id and e.profile_id = (select auth.uid())
      and employment_contracts.school_id = private.current_school_id()
  )
);
drop policy if exists leave_read on public.hr_leave_requests;
create policy leave_read on public.hr_leave_requests for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id
      and e.school_id = hr_leave_requests.school_id and e.profile_id = (select auth.uid())
      and hr_leave_requests.school_id = private.current_school_id()
  )
);
drop policy if exists leave_create_self on public.hr_leave_requests;
create policy leave_create_self on public.hr_leave_requests for insert to authenticated with check (
  school_id = private.current_school_id() and exists (
    select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id
      and e.profile_id = (select auth.uid()) and e.school_id = hr_leave_requests.school_id
  )
);
drop policy if exists salary_read on public.salary_structures;
create policy salary_read on public.salary_structures for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = salary_structures.employee_id
      and e.school_id = salary_structures.school_id and e.profile_id = (select auth.uid())
      and salary_structures.school_id = private.current_school_id()
  )
);
drop policy if exists payroll_items_read on public.payroll_items;
create policy payroll_items_read on public.payroll_items for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e join public.payroll_runs r
      on r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
    where e.id = payroll_items.employee_id and e.school_id = payroll_items.school_id
      and e.profile_id = (select auth.uid()) and payroll_items.school_id = private.current_school_id()
      and r.status in ('approved','paying','paid','closed')
  )
);
drop policy if exists payments_read on public.payment_transactions;
create policy payments_read on public.payment_transactions for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer']) or exists (
    select 1 from public.payroll_items i join public.hr_employees e
      on e.id = i.employee_id and e.school_id = i.school_id
    where i.id = payment_transactions.payroll_item_id and i.school_id = payment_transactions.school_id
      and e.profile_id = (select auth.uid()) and payment_transactions.school_id = private.current_school_id()
  )
);

-- A stale session cannot use the salary RPC after HR disables its profile.
create or replace function public.list_my_staff_payslips()
returns table (
  id uuid, pay_period date, currency_code text, basic_salary numeric, allowances jsonb,
  deductions jsonb, gross_pay numeric, total_deductions numeric, net_pay numeric,
  payout_status text, payout_provider text, payout_reference text
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); actor_school uuid;
begin
  select p.school_id into actor_school from public.profiles p
  where p.id = actor_id and p.role::text = 'staff' and p.is_active is true;
  if actor_id is null or actor_school is null then
    raise exception 'An active school staff account is required.' using errcode = '42501';
  end if;
  return query
    select i.id, r.pay_period, r.currency_code, i.basic_salary, i.allowances, i.deductions,
      i.gross_pay, i.total_deductions, i.net_pay, payout.status, payout.provider, payout.transaction_reference
    from public.hr_employees e
    join public.payroll_items i on i.employee_id = e.id and i.school_id = e.school_id
    join public.payroll_runs r on r.id = i.payroll_run_id and r.school_id = i.school_id
    left join lateral (
      select t.status, t.provider, t.transaction_reference from public.payment_transactions t
      where t.payroll_item_id = i.id and t.school_id = i.school_id order by t.created_at desc limit 1
    ) payout on true
    where e.profile_id = actor_id and e.school_id = actor_school
      and r.status in ('approved','paying','paid','closed')
    order by r.pay_period desc;
end;
$$;
revoke all on function public.list_my_staff_payslips() from public, anon;
grant execute on function public.list_my_staff_payslips() to authenticated;
