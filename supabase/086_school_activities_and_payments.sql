-- School activities, per-learner registrations, and verified payments.

create table if not exists public.school_activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 140),
  description text not null default '' check (length(description) <= 4000),
  activity_type text not null default 'other' check (activity_type in ('sports','trip','excursion','club','other')),
  starts_at timestamptz not null,
  location text not null default '' check (length(location) <= 240),
  class_id uuid references public.classes(id) on delete cascade,
  registration_deadline timestamptz,
  is_free boolean not null default true,
  amount numeric(12,2),
  currency_code text not null default 'KES' check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'published' check (status in ('published','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_free and (amount is null or amount = 0)) or (not is_free and amount is not null and amount > 0)),
  check (registration_deadline is null or registration_deadline <= starts_at)
);
create index if not exists school_activities_school_start
  on public.school_activities(school_id, starts_at);
create index if not exists school_activities_class_start
  on public.school_activities(class_id, starts_at);

create or replace function private.prepare_school_activity_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.school_id is distinct from old.school_id or new.created_by is distinct from old.created_by) then
    raise exception 'An activity cannot be reassigned to another school or creator.' using errcode = '42501';
  end if;
  if new.class_id is not null and not exists (
    select 1 from public.classes c where c.id = new.class_id and c.school_id = new.school_id
  ) then
    raise exception 'Choose a class from this school.';
  end if;
  select upper(coalesce(s.currency_code, 'KES')) into new.currency_code
    from public.schools s where s.id = new.school_id;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.prepare_school_activity_write() from public, anon, authenticated;
drop trigger if exists prepare_school_activity_write on public.school_activities;
create trigger prepare_school_activity_write before insert or update on public.school_activities
  for each row execute function private.prepare_school_activity_write();

create table if not exists public.school_activity_registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null,
  registered_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'registered' check (status in ('registered','pending_payment','paid','cancelled')),
  registered_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (activity_id, student_id)
);
create index if not exists school_activity_registrations_school_activity
  on public.school_activity_registrations(school_id, activity_id, status);
create index if not exists school_activity_registrations_student
  on public.school_activity_registrations(student_id, registered_at desc);

create table if not exists public.school_activity_payment_attempts (
  tx_ref text primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  registration_id uuid not null references public.school_activity_registrations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  student_reference text,
  parent_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','successful','failed')),
  flutterwave_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists school_activity_payment_attempts_school_date
  on public.school_activity_payment_attempts(school_id, created_at desc);
create index if not exists school_activity_payment_attempts_registration
  on public.school_activity_payment_attempts(registration_id, created_at desc);

create table if not exists public.school_activity_webhook_events (
  event_key text primary key,
  received_at timestamptz not null default now()
);

alter table public.school_activities enable row level security;
alter table public.school_activity_registrations enable row level security;
alter table public.school_activity_payment_attempts enable row level security;
alter table public.school_activity_webhook_events enable row level security;
revoke all on public.school_activities, public.school_activity_registrations,
  public.school_activity_payment_attempts, public.school_activity_webhook_events
  from public, anon, authenticated;
grant select, insert, update on public.school_activities to authenticated;
grant select on public.school_activity_registrations, public.school_activity_payment_attempts to authenticated;

create or replace function private.can_manage_school_activities(target_school uuid, target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school
      and private.school_subscription_entitled(target_school)
      and (
        p.role = 'school_admin'
        or private.has_hr_role(target_school, array['principal'])
        or (p.role = 'teacher' and target_class is not null and exists (
          select 1 from public.classes c where c.id = target_class and c.school_id = target_school
            and (c.teacher_id = p.id or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id = p.id and tsa.school_id = target_school and tsa.class_id = c.id
            ))
        ))
      )
  )
$$;
revoke all on function private.can_manage_school_activities(uuid,uuid) from public, anon;
grant execute on function private.can_manage_school_activities(uuid,uuid) to authenticated;

create or replace function private.can_oversee_school_activities(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and private.school_subscription_entitled(target_school)
      and (p.role = 'school_admin' or private.has_hr_role(target_school, array['principal']))
  )
$$;
revoke all on function private.can_oversee_school_activities(uuid) from public, anon;
grant execute on function private.can_oversee_school_activities(uuid) to authenticated;

create or replace function private.can_view_school_activity(target_school uuid, target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true and p.school_id = target_school
      and private.school_subscription_entitled(target_school)
      and (
        target_class is null
        or p.role = 'school_admin'
        or private.has_hr_role(target_school, array['principal','finance_officer'])
        or (p.role = 'teacher' and exists (
          select 1 from public.classes c where c.id = target_class and c.school_id = target_school
            and (c.teacher_id = p.id or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id = p.id and tsa.school_id = target_school and tsa.class_id = c.id
            ))
        ))
        or (p.role = 'student' and exists (
          select 1 from public.students s where s.school_id = target_school
            and s.class_id = target_class and s.profile_id = p.id
        ))
        or (p.role = 'parent' and exists (
          select 1 from public.students s join public.student_guardians g on g.student_id = s.id
          where s.school_id = target_school and s.class_id = target_class and g.guardian_id = p.id
        ))
      )
  )
$$;
revoke all on function private.can_view_school_activity(uuid,uuid) from public, anon;
grant execute on function private.can_view_school_activity(uuid,uuid) to authenticated;

create or replace function private.can_view_school_activity_registration(
  target_school uuid, target_activity uuid, target_student uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_activities a join public.profiles p
      on p.id = (select auth.uid()) and p.is_active is true and p.school_id = a.school_id
    join public.students s on s.id = target_student and s.school_id = a.school_id
    where a.id = target_activity and a.school_id = target_school
      and private.school_subscription_entitled(target_school)
      and (
        p.role = 'school_admin'
        or private.has_hr_role(target_school, array['principal','finance_officer'])
        or (p.role = 'teacher' and a.created_by = p.id)
        or (p.role = 'student' and s.profile_id = p.id)
        or (p.role = 'parent' and exists (
          select 1 from public.student_guardians g where g.student_id = s.id and g.guardian_id = p.id
        ))
      )
  )
$$;
revoke all on function private.can_view_school_activity_registration(uuid,uuid,uuid) from public, anon;
grant execute on function private.can_view_school_activity_registration(uuid,uuid,uuid) to authenticated;

drop policy if exists school_activities_read on public.school_activities;
create policy school_activities_read on public.school_activities for select to authenticated using (
  status in ('published','cancelled') and private.can_view_school_activity(school_id, class_id)
);
drop policy if exists school_activities_create on public.school_activities;
create policy school_activities_create on public.school_activities for insert to authenticated with check (
  created_by = (select auth.uid()) and private.can_manage_school_activities(school_id, class_id)
);
drop policy if exists school_activities_update on public.school_activities;
create policy school_activities_update on public.school_activities for update to authenticated
  using (
    (created_by = (select auth.uid()) and private.can_manage_school_activities(school_id, class_id))
    or private.can_oversee_school_activities(school_id)
  )
  with check (
    (created_by = (select auth.uid()) and private.can_manage_school_activities(school_id, class_id))
    or private.can_oversee_school_activities(school_id)
  );

drop policy if exists school_activity_registrations_read on public.school_activity_registrations;
create policy school_activity_registrations_read on public.school_activity_registrations
  for select to authenticated using (
    private.can_view_school_activity_registration(school_id, activity_id, student_id)
  );

drop policy if exists school_activity_payment_attempts_read on public.school_activity_payment_attempts;
create policy school_activity_payment_attempts_read on public.school_activity_payment_attempts
  for select to authenticated using (
    private.can_view_school_activity_registration(school_id, activity_id, student_id)
  );

create or replace function public.register_for_free_school_activity(p_activity_id uuid, p_student_id uuid)
returns public.school_activity_registrations
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; activity public.school_activities; learner public.students;
  result public.school_activity_registrations; guardian boolean;
begin
  select * into actor from public.profiles p where p.id = (select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role not in ('parent','student') then
    raise exception 'Sign in as the learner or their parent to register.' using errcode = '42501';
  end if;
  select * into activity from public.school_activities a
    where a.id = p_activity_id and a.school_id = actor.school_id for update;
  if activity.id is null or activity.status <> 'published' or activity.is_free is not true then
    raise exception 'This free activity is not available for registration.';
  end if;
  if activity.starts_at <= now() then raise exception 'Registration has closed because this activity has started.'; end if;
  if activity.registration_deadline is not null and activity.registration_deadline <= now() then
    raise exception 'The registration deadline for this activity has passed.';
  end if;
  if not private.school_subscription_entitled(activity.school_id) then
    raise exception 'This school workspace is not currently active.';
  end if;
  select * into learner from public.students s where s.id = p_student_id and s.school_id = activity.school_id;
  if learner.id is null or (activity.class_id is not null and learner.class_id is distinct from activity.class_id) then
    raise exception 'Choose a learner who is eligible for this activity.';
  end if;
  select exists (select 1 from public.student_guardians g
    where g.student_id = learner.id and g.guardian_id = actor.id) into guardian;
  if not ((actor.role = 'parent' and guardian) or (actor.role = 'student' and learner.profile_id = actor.id)) then
    raise exception 'You can only register yourself or a learner linked to your parent account.' using errcode = '42501';
  end if;
  insert into public.school_activity_registrations(
    school_id, activity_id, student_id, parent_id, registered_by, status
  ) values (
    activity.school_id, activity.id, learner.id,
    case when actor.role = 'parent' then actor.id else null end,
    actor.id, 'registered'
  ) on conflict (activity_id, student_id) do update set
    parent_id = excluded.parent_id, registered_by = excluded.registered_by,
    status = 'registered', registered_at = now(), paid_at = null
  where public.school_activity_registrations.status = 'cancelled'
  returning * into result;
  if result.id is null then raise exception 'This learner already has a registration for the activity.'; end if;
  return result;
end $$;
revoke all on function public.register_for_free_school_activity(uuid,uuid) from public, anon;
grant execute on function public.register_for_free_school_activity(uuid,uuid) to authenticated;

create or replace function public.process_flutterwave_school_activity_event(
  p_event_key text, p_tx_ref text, p_transaction_id text,
  p_status text, p_currency_code text, p_amount numeric
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempt public.school_activity_payment_attempts;
begin
  if nullif(trim(p_event_key),'') is null or nullif(trim(p_tx_ref),'') is null then
    raise exception 'Activity payment event identity is required.';
  end if;
  insert into public.school_activity_webhook_events(event_key) values (p_event_key)
    on conflict do nothing;
  if not found then return false; end if;
  select * into attempt from public.school_activity_payment_attempts a
    where a.tx_ref = p_tx_ref for update;
  if attempt.tx_ref is null then return true; end if;
  if p_status not in ('successful','failed') then return true; end if;
  if p_status = 'successful' and (
    p_amount is null or abs(p_amount - attempt.amount) > 0.01
    or upper(coalesce(p_currency_code,'')) <> attempt.currency_code
  ) then
    raise exception 'Verified payment does not match the activity amount and currency.';
  end if;
  if attempt.status = 'successful' then return true; end if;
  if p_status = 'successful' then
    update public.school_activity_payment_attempts set status = 'successful',
      flutterwave_transaction_id = p_transaction_id, updated_at = now()
      where tx_ref = attempt.tx_ref;
    update public.school_activity_registrations set status = 'paid', paid_at = now(),
      parent_id = attempt.parent_id
      where id = attempt.registration_id and status in ('pending_payment','paid');
  elsif attempt.status = 'pending' then
    update public.school_activity_payment_attempts set status = 'failed',
      flutterwave_transaction_id = p_transaction_id, updated_at = now()
      where tx_ref = attempt.tx_ref;
  end if;
  return true;
end $$;
revoke all on function public.process_flutterwave_school_activity_event(text,text,text,text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.process_flutterwave_school_activity_event(text,text,text,text,text,numeric)
  to service_role;
