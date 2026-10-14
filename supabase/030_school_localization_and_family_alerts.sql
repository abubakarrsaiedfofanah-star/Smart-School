-- School-level locale settings and parent absence alerts.
-- Apply after 029_school_registration_rate_limit.sql.

alter table public.schools
  add column if not exists timezone text not null default 'Africa/Nairobi',
  add column if not exists currency_code text not null default 'KES',
  add column if not exists academic_terms text[] not null default array['Term 1','Term 2','Term 3'],
  add column if not exists grading_scale jsonb not null default '[{"min":80,"grade":"A"},{"min":70,"grade":"B"},{"min":60,"grade":"C"},{"min":50,"grade":"D"},{"min":0,"grade":"E"}]'::jsonb;

alter table public.profiles
  add column if not exists notification_preferences jsonb not null default '{"absences":true,"announcements":true,"behavior":true}'::jsonb;

alter table public.profiles alter column notification_preferences
  set default '{"absences":true,"announcements":true,"behavior":true,"schoolwork":true}'::jsonb;
update public.profiles set notification_preferences = notification_preferences || '{"schoolwork":true}'::jsonb
  where not (notification_preferences ? 'schoolwork');

-- Keep sensitive changes visible in the existing school audit trail.
create or replace function public.log_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
  current_row jsonb;
  tenant_id uuid;
  changed_id uuid;
begin
  before_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  current_row := coalesce(after_row, before_row);
  tenant_id := nullif(current_row ->> 'school_id', '')::uuid;
  if tenant_id is null and tg_table_name = 'schools' then
    tenant_id := nullif(current_row ->> 'id', '')::uuid;
  end if;
  changed_id := nullif(current_row ->> 'id', '')::uuid;

  insert into public.audit_logs (school_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (tenant_id, (select auth.uid()), tg_op, tg_table_name, changed_id, before_row, after_row);
  return null;
end;
$$;
revoke all on function public.log_table_change() from public, anon, authenticated;

do $$
declare table_to_audit text;
begin
  foreach table_to_audit in array array['schools','attendance','students','exams','announcements','behavior_records','subscriptions','classes'] loop
    execute format('drop trigger if exists audit_school_%I on public.%I', table_to_audit, table_to_audit);
    execute format('create trigger audit_school_%I after insert or update or delete on public.%I for each row execute function public.log_table_change()', table_to_audit, table_to_audit);
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schools_currency_code_check' and conrelid = 'public.schools'::regclass) then
    alter table public.schools add constraint schools_currency_code_check
      check (currency_code in ('KES','UGX','TZS','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'schools_timezone_check' and conrelid = 'public.schools'::regclass) then
    alter table public.schools add constraint schools_timezone_check
      check (timezone in ('Africa/Nairobi','Africa/Kampala','Africa/Dar_es_Salaam','Africa/Johannesburg','UTC'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'schools_academic_terms_count_check' and conrelid = 'public.schools'::regclass) then
    alter table public.schools add constraint schools_academic_terms_count_check
      check (cardinality(academic_terms) between 2 and 6);
  end if;
end $$;

alter table public.exams drop constraint if exists exams_term_check;
alter table public.exams add constraint exams_term_check
  check (term is null or length(trim(term)) between 2 and 40);

create or replace function public.validate_school_exam_term()
returns trigger language plpgsql security definer set search_path = '' as $$
declare available_terms text[];
begin
  if new.term is null then return new; end if;
  select s.academic_terms into available_terms from public.schools s where s.id = new.school_id;
  if not (new.term = any(coalesce(available_terms, array['Term 1','Term 2','Term 3']))) then
    raise exception 'Choose one of this school’s configured academic terms.';
  end if;
  return new;
end $$;
revoke all on function public.validate_school_exam_term() from public, anon, authenticated;
drop trigger if exists validate_school_exam_term on public.exams;
create trigger validate_school_exam_term before insert or update of term, school_id on public.exams
  for each row execute function public.validate_school_exam_term();

create or replace function public.notify_guardians_of_absence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'absent' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'absent' then return new; end if;
  end if;

  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, g.guardian_id, 'Absence recorded',
    coalesce(p.full_name, s.admission_number, 'Your learner') || ' was marked absent on ' || new.attendance_date::text || '.',
    'attendance'
  from public.student_guardians g
  join public.students s on s.id = g.student_id and s.id = new.student_id
  join public.profiles p on p.id = g.guardian_id
  where p.notification_preferences -> 'absences' is distinct from 'false'::jsonb;

  return new;
end;
$$;

drop trigger if exists notify_guardians_of_absence on public.attendance;
create trigger notify_guardians_of_absence
  after insert or update of status on public.attendance
  for each row execute function public.notify_guardians_of_absence();

revoke all on function public.notify_guardians_of_absence() from public, anon, authenticated;

create or replace function public.notify_behavior_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, p.id,
    'New behavior record: ' || upper(new.type),
    'Category: ' || new.category || '. ' || coalesce(new.comment, ''),
    'behavioral'
  from public.profiles p
  where (p.id = (select s.profile_id from public.students s where s.id = new.student_id)
      or p.id in (select g.guardian_id from public.student_guardians g where g.student_id = new.student_id))
    and p.notification_preferences -> 'behavior' is distinct from 'false';
  return null;
end;
$$;
revoke all on function public.notify_behavior_change() from public, anon, authenticated;

create or replace function public.notify_class_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, recipients.user_id, 'New class assignment',
    new.title || case when new.due_date is null then '' else ' · Due ' || new.due_date::text end,
    'academic'
  from (
    select s.profile_id as user_id from public.students s where s.class_id = new.class_id and s.profile_id is not null
    union
    select g.guardian_id from public.student_guardians g join public.students s on s.id = g.student_id where s.class_id = new.class_id
  ) recipients
  join public.profiles p on p.id = recipients.user_id
  where p.school_id = new.school_id and p.notification_preferences -> 'schoolwork' is distinct from 'false';
  return new;
end $$;

create or replace function public.notify_class_exam()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, recipients.user_id, 'Upcoming class exam',
    new.name || case when new.exam_date is null then '' else ' · ' || new.exam_date::text end,
    'academic'
  from (
    select s.profile_id as user_id from public.students s where s.class_id = new.class_id and s.profile_id is not null
    union
    select g.guardian_id from public.student_guardians g join public.students s on s.id = g.student_id where s.class_id = new.class_id
  ) recipients
  join public.profiles p on p.id = recipients.user_id
  where p.school_id = new.school_id and p.notification_preferences -> 'schoolwork' is distinct from 'false';
  return new;
end $$;

create or replace function public.notify_published_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(new.published, false) then return new; end if;
  if tg_op = 'UPDATE' then
    if old.published is true and old.score is not distinct from new.score then return new; end if;
  end if;

  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, recipients.user_id, 'New result published',
    'A new result is available in the learner report card.', 'academic'
  from (
    select s.profile_id as user_id from public.students s where s.id = new.student_id and s.profile_id is not null
    union
    select g.guardian_id from public.student_guardians g where g.student_id = new.student_id
  ) recipients
  join public.profiles p on p.id = recipients.user_id
  where p.school_id = new.school_id and p.notification_preferences -> 'schoolwork' is distinct from 'false';
  return new;
end $$;

revoke all on function public.notify_class_assignment() from public, anon, authenticated;
revoke all on function public.notify_class_exam() from public, anon, authenticated;
revoke all on function public.notify_published_result() from public, anon, authenticated;

drop trigger if exists notify_class_assignment on public.assignments;
create trigger notify_class_assignment after insert on public.assignments
  for each row when (new.class_id is not null) execute function public.notify_class_assignment();
drop trigger if exists notify_class_exam on public.exams;
create trigger notify_class_exam after insert on public.exams
  for each row when (new.class_id is not null) execute function public.notify_class_exam();
drop trigger if exists notify_published_result on public.results;
create trigger notify_published_result after insert or update of published, score on public.results
  for each row execute function public.notify_published_result();

create or replace function public.notify_school_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, p.id, new.title, left(coalesce(new.body, ''), 500), 'announcement'
  from public.profiles p
  where p.school_id = new.school_id
    and p.role in ('parent', 'student', 'teacher', 'school_admin')
    and p.notification_preferences -> 'announcements' is distinct from 'false';
  return new;
end;
$$;

drop trigger if exists notify_school_announcement on public.announcements;
create trigger notify_school_announcement
  after insert on public.announcements
  for each row execute function public.notify_school_announcement();

revoke all on function public.notify_school_announcement() from public, anon, authenticated;
