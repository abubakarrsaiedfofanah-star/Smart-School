-- Require an AAL2 Supabase session for privileged writes, including direct API
-- requests that bypass the React route guard. Service-role jobs are exempt.
create or replace function private.enforce_privileged_mfa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role;
  actor_school uuid;
  privileged boolean := false;
begin
  if actor_id is null or (select auth.role()) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select p.role, p.school_id into actor_role, actor_school
  from public.profiles p where p.id = actor_id;

  privileged := actor_role in ('super_admin','school_admin') or exists (
    select 1 from public.school_hr_roles r
    where r.profile_id = actor_id and r.school_id = actor_school
      and r.hr_role in ('principal','hr_admin','finance_officer')
  );

  if privileged and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication is required for privileged changes.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_privileged_mfa() from public, anon, authenticated;

do $$
declare target text;
begin
  foreach target in array array[
    'schools','profiles','students','classes','subjects','student_guardians','attendance',
    'assignments','exams','results','fees','payments','announcements','events','subscriptions',
    'applications','quizzes','quiz_questions','quiz_results','badges','student_badges','broadcasts',
    'timetable','resources','meetings','behavior_records','bus_routes','wellbeing_reports',
    'counseling_notes','assets','courses','course_chapters','course_progress','lesson_plans',
    'class_subjects','report_cards','school_hr_roles','job_vacancies','job_applications',
    'hr_employees','employment_contracts','hr_leave_requests','salary_structures','payroll_runs',
    'payroll_items','payment_transactions','school_payroll_accounts','staff_attendance',
    'school_expenses','payment_reconciliation_records'
  ] loop
    if to_regclass(format('public.%I', target)) is not null then
      execute format('drop trigger if exists enforce_privileged_mfa on public.%I', target);
      execute format(
        'create trigger enforce_privileged_mfa before insert or update or delete on public.%I for each row execute function private.enforce_privileged_mfa()',
        target
      );
    end if;
  end loop;
end $$;
