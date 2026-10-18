-- Question bank, learner accommodations, review appeals, integrity events and assessment audit.
create table if not exists public.quiz_question_bank (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_title text not null,
  question_text text not null,
  question_type text not null check (question_type in ('mcq','true_false','short_answer')),
  options jsonb not null default '[]'::jsonb,
  correct_option_index integer not null default 0,
  points integer not null default 1 check (points > 0),
  explanation text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.quiz_question_bank enable row level security;
create policy quiz_question_bank_read_staff on public.quiz_question_bank for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
);
create policy quiz_question_bank_insert_staff on public.quiz_question_bank for insert to authenticated with check (
  school_id = private.current_school_id() and created_by = (select auth.uid())
  and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and exists (
    select 1 from public.teacher_subject_assignments tsa where tsa.school_id = quiz_question_bank.school_id
      and tsa.teacher_id = (select auth.uid()) and tsa.subject_id = quiz_question_bank.subject_id
  )))
);
create policy quiz_question_bank_delete_staff on public.quiz_question_bank for delete to authenticated using (
  school_id = private.current_school_id() and (private.current_role() = 'school_admin' or created_by = (select auth.uid()))
);

create table if not exists public.quiz_accommodations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  extra_time_minutes integer not null default 0 check (extra_time_minutes between 0 and 600),
  extra_attempts integer not null default 0 check (extra_attempts between 0 and 5),
  deadline_override timestamptz,
  note text,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique(quiz_id, student_id)
);
alter table public.quiz_accommodations enable row level security;
create policy quiz_accommodations_read_staff on public.quiz_accommodations for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and (private.current_role() = 'school_admin' or exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.created_by = (select auth.uid())
  ))
);
create policy quiz_accommodations_manage_staff on public.quiz_accommodations for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
    and (private.current_role() = 'school_admin' or (private.can_view_student(student_id) and exists (select 1 from public.quizzes q where q.id = quiz_id and q.created_by = (select auth.uid())))))
  with check (school_id = private.current_school_id() and updated_by = (select auth.uid()) and private.current_role() in ('school_admin','teacher')
    and (private.current_role() = 'school_admin' or (private.can_view_student(student_id) and exists (select 1 from public.quizzes q where q.id = quiz_id and q.created_by = (select auth.uid()))))
    and exists (select 1 from public.quizzes q join public.students s on s.school_id = q.school_id
      where q.id = quiz_id and s.id = student_id and q.school_id = quiz_accommodations.school_id));

create or replace function public.get_my_quiz_accommodations()
returns table(quiz_id uuid, extra_time_minutes integer, extra_attempts integer, deadline_override timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.quiz_id, a.extra_time_minutes, a.extra_attempts, a.deadline_override
  from public.quiz_accommodations a
  join public.students s on s.id = a.student_id
  where s.profile_id = (select auth.uid())
    and s.school_id = private.current_school_id()
    and private.current_role() = 'student';
$$;
revoke all on function public.get_my_quiz_accommodations() from public, anon;
grant execute on function public.get_my_quiz_accommodations() to authenticated;

create table if not exists public.quiz_appeals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  result_id uuid not null references public.quiz_results(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 5 and 1500),
  status text not null default 'pending' check (status in ('pending','reviewed','adjusted','declined')),
  response text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(result_id, student_id)
);
alter table public.quiz_appeals enable row level security;
create policy quiz_appeals_read_related on public.quiz_appeals for select to authenticated using (
  private.can_view_student(student_id)
);
create policy quiz_appeals_student_insert on public.quiz_appeals for insert to authenticated with check (
  private.current_role() = 'student' and student_id in (select s.id from public.students s where s.profile_id = (select auth.uid()) and s.school_id = private.current_school_id())
  and exists (select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id where r.id = quiz_appeals.result_id and r.student_id = quiz_appeals.student_id and q.school_id = quiz_appeals.school_id)
);
create policy quiz_appeals_staff_update on public.quiz_appeals for update to authenticated
  using (private.current_role() in ('teacher','school_admin') and school_id = private.current_school_id()
    and (private.current_role() = 'school_admin' or exists (select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id where r.id = result_id and q.created_by = (select auth.uid()))))
  with check (private.current_role() in ('teacher','school_admin') and school_id = private.current_school_id()
    and reviewed_by = (select auth.uid())
    and (private.current_role() = 'school_admin' or exists (select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id where r.id = result_id and q.created_by = (select auth.uid()))));
create unique index if not exists quiz_appeals_one_pending_per_result on public.quiz_appeals(result_id, student_id);

create table if not exists public.quiz_mark_changes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  appeal_id uuid not null references public.quiz_appeals(id) on delete cascade,
  result_id uuid not null references public.quiz_results(id) on delete cascade,
  previous_score numeric not null,
  adjusted_score numeric not null,
  reason text not null,
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.quiz_mark_changes enable row level security;
create policy quiz_mark_changes_read_staff on public.quiz_mark_changes for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and (private.current_role() = 'school_admin' or exists (
    select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id
    where r.id = result_id and q.created_by = (select auth.uid())
  ))
);
revoke insert, update, delete on public.quiz_mark_changes from authenticated;

create or replace function public.resolve_quiz_appeal(p_appeal_id uuid, p_status text, p_response text, p_adjusted_score numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare appeal_row public.quiz_appeals; result_row public.quiz_results; quiz_row public.quizzes;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then raise exception 'Staff access is required.'; end if;
  if p_status not in ('reviewed','adjusted','declined') or length(trim(coalesce(p_response,''))) < 3 then raise exception 'Provide a decision and response.'; end if;
  select * into appeal_row from public.quiz_appeals a where a.id = p_appeal_id for update;
  select * into result_row from public.quiz_results r where r.id = appeal_row.result_id for update;
  select * into quiz_row from public.quizzes q where q.id = result_row.quiz_id;
  if appeal_row.id is null or appeal_row.school_id is distinct from (select private.current_school_id())
    or ((select private.current_role()) = 'teacher' and quiz_row.created_by is distinct from (select auth.uid())) then raise exception 'Appeal not found or access denied.'; end if;
  if p_status = 'adjusted' then
    if p_adjusted_score is null or p_adjusted_score < 0 or p_adjusted_score > result_row.total_points then raise exception 'Adjusted score must be between zero and the assessment total.'; end if;
    if p_adjusted_score is distinct from result_row.score then
      insert into public.quiz_mark_changes(school_id,appeal_id,result_id,previous_score,adjusted_score,reason,changed_by)
      values (appeal_row.school_id,appeal_row.id,result_row.id,result_row.score,p_adjusted_score,trim(p_response),(select auth.uid()));
      update public.quiz_results set score = p_adjusted_score where id = result_row.id;
    end if;
  end if;
  update public.quiz_appeals set status = p_status,response = trim(p_response),reviewed_by = (select auth.uid()),reviewed_at = now() where id = appeal_row.id;
end $$;
revoke all on function public.resolve_quiz_appeal(uuid,text,text,numeric) from public, anon;
grant execute on function public.resolve_quiz_appeal(uuid,text,text,numeric) to authenticated;

create table if not exists public.quiz_integrity_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_attempt_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('tab_hidden','tab_visible','offline','online','window_blur','window_focus')),
  occurred_at timestamptz not null default now()
);
alter table public.quiz_integrity_events enable row level security;
create policy quiz_integrity_events_read_related on public.quiz_integrity_events for select to authenticated using (
  exists (select 1 from public.quiz_attempt_sessions a where a.id = session_id and private.can_view_student(a.student_id))
);
create policy quiz_attempt_sessions_read_staff on public.quiz_attempt_sessions for select to authenticated using (
  private.current_role() in ('teacher','school_admin') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  )
);
revoke insert, update, delete on public.quiz_integrity_events from authenticated;

create or replace function public.record_quiz_integrity_event(p_session_id uuid, p_event_type text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.current_role()) is distinct from 'student'
    or p_event_type not in ('tab_hidden','tab_visible','offline','online','window_blur','window_focus')
    or not exists (select 1 from public.quiz_attempt_sessions a join public.students s on s.id = a.student_id
      where a.id = p_session_id and s.profile_id = (select auth.uid()) and a.submitted_at is null and a.expires_at >= now()) then
    raise exception 'Invalid assessment integrity event.';
  end if;
  insert into public.quiz_integrity_events(session_id,event_type) values (p_session_id,p_event_type);
end $$;
revoke all on function public.record_quiz_integrity_event(uuid,text) from public, anon;
grant execute on function public.record_quiz_integrity_event(uuid,text) to authenticated;

create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns table(id uuid, question_text text, options jsonb, points integer, question_type text, sort_order integer, session_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; session public.quiz_attempt_sessions;
  accommodation public.quiz_accommodations; next_attempt integer; effective_due timestamptz; effective_attempts integer;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id = p_quiz_id and school_id = student.school_id and published = true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  select * into accommodation from public.quiz_accommodations a where a.quiz_id = quiz.id and a.student_id = student.id;
  effective_due := coalesce(accommodation.deadline_override,quiz.due_at);
  effective_attempts := quiz.max_attempts + coalesce(accommodation.extra_attempts,0);
  if quiz.opens_at is not null and now() < quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  if effective_due is not null and now() > effective_due then raise exception 'The submission deadline has passed.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || student.id::text, 0));
  select greatest((select count(*) from public.quiz_results r where r.quiz_id = quiz.id and r.student_id = student.id),
    (select count(*) from public.quiz_attempt_sessions a where a.quiz_id = quiz.id and a.student_id = student.id)) + 1 into next_attempt;
  select * into session from public.quiz_attempt_sessions a where a.quiz_id = quiz.id and a.student_id = student.id and a.submitted_at is null and a.expires_at >= now() order by a.started_at desc limit 1;
  if session.id is null and next_attempt > effective_attempts then raise exception 'No attempts remaining.'; end if;
  if session.id is null then
    insert into public.quiz_attempt_sessions(quiz_id,student_id,attempt_number,expires_at)
    values (quiz.id,student.id,next_attempt,least(now() + make_interval(mins => quiz.time_limit_minutes + coalesce(accommodation.extra_time_minutes,0)),coalesce(effective_due,'infinity'::timestamptz))) returning * into session;
  end if;
  return query select q.id,q.question_text,
    case when quiz.shuffle_options then (select jsonb_agg(jsonb_build_object('index',x.original_index,'text',x.option_value) order by x.sort_key) from (
      select e.value as option_value,e.ordinality - 1 as original_index,md5(session.id::text || q.id::text || e.value::text) as sort_key
      from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) x)
      else (select jsonb_agg(jsonb_build_object('index',e.ordinality - 1,'text',e.value)) from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) end,
    q.points,q.question_type,q.sort_order,session.id,session.expires_at from public.quiz_questions q where q.quiz_id = quiz.id
    order by case when quiz.shuffle_questions then md5(quiz.id::text || student.id::text || q.id::text) else lpad(q.sort_order::text,10,'0') end;
end $$;
revoke all on function public.get_quiz_questions(uuid) from public, anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated;

create or replace function public.notify_assessment_result_to_families()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quiz_row public.quizzes; school uuid; result_title text;
begin
  if old.score is not distinct from new.score and old.needs_review is not distinct from new.needs_review then return new; end if;
  select q.* into quiz_row from public.quizzes q where q.id = new.quiz_id;
  result_title := case when new.needs_review then 'Assessment submitted for review: ' else 'Assessment marked: ' end || quiz_row.title;
  insert into public.notifications(school_id,user_id,title,body,type)
  select quiz_row.school_id,g.guardian_id,result_title,
    case when new.needs_review then 'MCQ score: ' || new.score || '/' || new.total_points || '. Written work is awaiting marking.'
      else 'Score: ' || new.score || '/' || new.total_points || '.' end,'academic'
  from public.student_guardians g where g.student_id = new.student_id;
  return new;
end $$;
drop trigger if exists tr_notify_assessment_result_to_families on public.quiz_results;
create trigger tr_notify_assessment_result_to_families after update on public.quiz_results
for each row execute function public.notify_assessment_result_to_families();

create or replace function public.notify_assessment_appeal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quiz_row public.quizzes; student_profile uuid;
begin
  select q.* into quiz_row from public.quiz_results r join public.quizzes q on q.id = r.quiz_id where r.id = new.result_id;
  if tg_op = 'INSERT' then
    if quiz_row.created_by is not null then
      insert into public.notifications(school_id,user_id,title,body,type)
      values (new.school_id,quiz_row.created_by,'Mark appeal: ' || quiz_row.title,'A student requested a review of their assessment mark.','academic');
    end if;
  elsif old.status is distinct from new.status then
    select profile_id into student_profile from public.students where id = new.student_id;
    if student_profile is not null then
      insert into public.notifications(school_id,user_id,title,body,type)
      values (new.school_id,student_profile,'Mark appeal updated: ' || quiz_row.title,coalesce(new.response,'Your mark review has been updated.'),'academic');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tr_notify_assessment_appeal on public.quiz_appeals;
create trigger tr_notify_assessment_appeal after insert or update on public.quiz_appeals
for each row execute function public.notify_assessment_appeal();

create or replace function public.audit_assessment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_row jsonb; new_row jsonb; row_data jsonb; quiz_key uuid; school_key uuid; result_key uuid; record_key uuid;
begin
  old_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_data := coalesce(new_row,old_row);
  if tg_table_name = 'quizzes' then quiz_key := (row_data->>'id')::uuid;
  elsif tg_table_name = 'quiz_questions' then quiz_key := (row_data->>'quiz_id')::uuid;
  elsif tg_table_name = 'quiz_results' then quiz_key := (row_data->>'quiz_id')::uuid; result_key := (row_data->>'id')::uuid;
  elsif tg_table_name = 'quiz_answers' then
    select r.quiz_id,r.id into quiz_key,result_key from public.quiz_results r where r.id = (row_data->>'result_id')::uuid;
  end if;
  select q.school_id into school_key from public.quizzes q where q.id = quiz_key;
  record_key := coalesce((row_data->>'id')::uuid,result_key,quiz_key);
  insert into public.audit_logs(school_id,actor_id,action,table_name,record_id,old_data,new_data)
  values (school_key,(select auth.uid()),tg_op,'assessment:' || tg_table_name,record_key,old_row,new_row);
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists audit_assessment_quizzes on public.quizzes;
create trigger audit_assessment_quizzes after insert or update or delete on public.quizzes for each row execute function public.audit_assessment_change();
drop trigger if exists audit_assessment_questions on public.quiz_questions;
create trigger audit_assessment_questions after insert or update or delete on public.quiz_questions for each row execute function public.audit_assessment_change();
drop trigger if exists audit_assessment_results on public.quiz_results;
create trigger audit_assessment_results after insert or update or delete on public.quiz_results for each row execute function public.audit_assessment_change();
drop trigger if exists audit_assessment_answers on public.quiz_answers;
create trigger audit_assessment_answers after insert or update or delete on public.quiz_answers for each row execute function public.audit_assessment_change();
