-- Subject and unit based assessments, secure server-side grading and learning resources.
alter table public.quizzes add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.quizzes add column if not exists unit_title text;
alter table public.quizzes add column if not exists assessment_type text not null default 'quiz';
alter table public.quizzes add column if not exists opens_at timestamptz;
alter table public.quizzes add column if not exists due_at timestamptz;
alter table public.quizzes add column if not exists max_attempts integer not null default 1;
alter table public.quizzes add column if not exists published boolean not null default true;
alter table public.quizzes add column if not exists shuffle_questions boolean not null default false;
alter table public.quizzes add column if not exists shuffle_options boolean not null default false;
alter table public.quizzes add column if not exists show_answers_after_submit boolean not null default false;
alter table public.quizzes add column if not exists weight numeric not null default 1;
update public.quizzes set time_limit_minutes = 30 where time_limit_minutes is null or time_limit_minutes < 1;
alter table public.quizzes add constraint quizzes_time_limit_check check (time_limit_minutes between 1 and 600);
alter table public.quizzes add constraint quizzes_weight_check check (weight >= 0);
alter table public.quizzes add constraint quizzes_assessment_type_check check (assessment_type in ('quiz','cat','test','exam'));
alter table public.quizzes add constraint quizzes_attempts_check check (max_attempts between 1 and 10);
alter table public.quiz_questions add column if not exists question_type text not null default 'mcq';
alter table public.quiz_questions add column if not exists sort_order integer not null default 0;
alter table public.quiz_questions add column if not exists explanation text;
alter table public.quiz_questions add constraint quiz_questions_type_check check (question_type in ('mcq','true_false','short_answer'));

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.quiz_results(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer_value text,
  earned_points numeric not null default 0,
  is_correct boolean,
  teacher_feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  unique(result_id, question_id)
);
alter table public.quiz_results add column if not exists attempt_number integer not null default 1;
alter table public.quiz_results add column if not exists submitted_at timestamptz not null default now();
alter table public.quiz_results add column if not exists needs_review boolean not null default false;
alter table public.quiz_results add column if not exists published boolean not null default true;
alter table public.quiz_results drop constraint if exists quiz_results_quiz_id_student_id_key;
create unique index if not exists quiz_results_quiz_student_attempt_key on public.quiz_results(quiz_id, student_id, attempt_number);
create table if not exists public.quiz_attempt_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attempt_number integer not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  unique(quiz_id, student_id, attempt_number)
);
alter table public.quiz_attempt_sessions enable row level security;
create policy quiz_attempt_sessions_read_own on public.quiz_attempt_sessions for select to authenticated using (
  private.current_role() = 'student' and exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
);
revoke insert, update, delete on public.quiz_attempt_sessions from authenticated;
alter table public.quiz_answers enable row level security;
create policy quiz_answers_read_related on public.quiz_answers for select to authenticated using (
  exists (select 1 from public.quiz_results r where r.id = result_id and private.can_view_student(r.student_id))
);
create policy quiz_answers_teacher_grade on public.quiz_answers for update to authenticated
  using (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id
    where r.id = result_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  ))
  with check (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id
    where r.id = result_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  ));
revoke insert, delete on public.quiz_answers from authenticated;

create table if not exists public.subject_resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  unit_title text not null,
  title text not null,
  description text,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.subject_resources enable row level security;
create policy subject_resources_read_scope on public.subject_resources for select to authenticated using (
  school_id = private.current_school_id() and (
    private.current_role() in ('school_admin','teacher') or class_id is null or private.can_view_class(class_id)
  )
);
create policy subject_resources_staff_insert on public.subject_resources for insert to authenticated with check (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and uploaded_by = (select auth.uid())
  and (private.current_role() = 'school_admin' or exists (
    select 1 from public.teacher_subject_assignments tsa where tsa.school_id = subject_resources.school_id
      and tsa.teacher_id = (select auth.uid()) and tsa.subject_id = subject_resources.subject_id
      and (subject_resources.class_id is null or tsa.class_id = subject_resources.class_id)
  ))
);
create policy subject_resources_staff_delete on public.subject_resources for delete to authenticated using (
  school_id = private.current_school_id() and (private.current_role() = 'school_admin' or uploaded_by = (select auth.uid()))
);

drop policy if exists quizzes_read_school on public.quizzes;
create policy quizzes_read_school on public.quizzes for select to authenticated using (
  private.current_role() = 'super_admin' or (school_id = private.current_school_id() and (
    private.current_role() in ('school_admin','teacher') or (published = true and (class_id is null or private.can_view_class(class_id)))
  ))
);

drop policy if exists quizzes_staff_insert on public.quizzes;
create policy quizzes_staff_insert on public.quizzes for insert to authenticated with check (
  school_id = private.current_school_id()
  and (created_by is null or created_by = (select auth.uid()))
  and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and exists (
      select 1 from public.teacher_subject_assignments tsa where tsa.school_id = quizzes.school_id
        and tsa.teacher_id = (select auth.uid()) and tsa.subject_id = quizzes.subject_id
        and (quizzes.class_id is null or tsa.class_id = quizzes.class_id)
    ))
  )
);
drop policy if exists quizzes_staff_update on public.quizzes;
create policy quizzes_staff_update on public.quizzes for update to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
    and (private.current_role() = 'school_admin' or created_by = (select auth.uid())))
  with check (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
    and (private.current_role() = 'school_admin' or created_by = (select auth.uid()))
    and (private.current_role() = 'school_admin' or exists (
      select 1 from public.teacher_subject_assignments tsa where tsa.school_id = quizzes.school_id
        and tsa.teacher_id = (select auth.uid()) and tsa.subject_id = quizzes.subject_id
        and (quizzes.class_id is null or tsa.class_id = quizzes.class_id)
    ))
  );

drop policy if exists quizzes_staff_delete on public.quizzes;
create policy quizzes_staff_delete on public.quizzes for delete to authenticated using (
  school_id = private.current_school_id() and (private.current_role() = 'school_admin' or created_by = (select auth.uid()))
  and not exists (select 1 from public.quiz_results r where r.quiz_id = quizzes.id)
);
drop policy if exists quiz_questions_staff_update on public.quiz_questions;
create policy quiz_questions_staff_update on public.quiz_questions for update to authenticated
  using (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
  ))
  with check (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
  ));
drop policy if exists quiz_questions_staff_delete on public.quiz_questions;
create policy quiz_questions_staff_delete on public.quiz_questions for delete to authenticated using (
  private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
  )
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('subject-resources','subject-resources',false,52428800,
  array['application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy subject_resource_files_read on storage.objects for select to authenticated using (
  bucket_id = 'subject-resources' and exists (
    select 1 from public.subject_resources r where r.file_path = name and r.school_id = private.current_school_id()
  )
);
create policy subject_resource_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'subject-resources' and (storage.foldername(name))[1] = private.current_school_id()::text
  and private.current_role() in ('school_admin','teacher')
);
create policy subject_resource_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'subject-resources' and (storage.foldername(name))[1] = private.current_school_id()::text
  and private.current_role() in ('school_admin','teacher')
);

drop function if exists public.get_quiz_questions(uuid);
drop function if exists public.submit_quiz(uuid,jsonb);
create function public.get_quiz_questions(p_quiz_id uuid)
returns table(id uuid, question_text text, options jsonb, points integer, question_type text, sort_order integer, session_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; session public.quiz_attempt_sessions; next_attempt integer;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id = p_quiz_id and school_id = student.school_id and published = true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  if quiz.opens_at is not null and now() < quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  if quiz.due_at is not null and now() > quiz.due_at then raise exception 'The submission deadline has passed.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || student.id::text, 0));
  select greatest(
    (select count(*) from public.quiz_results r where r.quiz_id = quiz.id and r.student_id = student.id),
    (select count(*) from public.quiz_attempt_sessions a where a.quiz_id = quiz.id and a.student_id = student.id)
  ) + 1 into next_attempt;
  select * into session from public.quiz_attempt_sessions a
    where a.quiz_id = quiz.id and a.student_id = student.id and a.submitted_at is null and a.expires_at >= now()
    order by a.started_at desc limit 1;
  if session.id is null and next_attempt > quiz.max_attempts then raise exception 'No attempts remaining.'; end if;
  if session.id is null then
    insert into public.quiz_attempt_sessions(quiz_id, student_id, attempt_number, expires_at)
    values (quiz.id, student.id, next_attempt, least(now() + make_interval(mins => quiz.time_limit_minutes), coalesce(quiz.due_at, 'infinity'::timestamptz)))
    returning * into session;
  end if;
  return query select q.id, q.question_text,
    case when quiz.shuffle_options then (
      select jsonb_agg(jsonb_build_object('index',x.original_index,'text',x.option_value) order by x.sort_key) from (
        select e.value as option_value, e.ordinality - 1 as original_index,
          md5(session.id::text || q.id::text || e.value::text) as sort_key
        from jsonb_array_elements(q.options) with ordinality e(value, ordinality)
      ) x
    ) else (select jsonb_agg(jsonb_build_object('index',e.ordinality - 1,'text',e.value)) from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) end,
    q.points, q.question_type, q.sort_order, session.id, session.expires_at
  from public.quiz_questions q where q.quiz_id = quiz.id order by
    case when quiz.shuffle_questions then md5(quiz.id::text || student.id::text || q.id::text) else lpad(q.sort_order::text, 10, '0') end;
end $$;

create function public.submit_quiz(p_quiz_id uuid, p_answers jsonb, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; question public.quiz_questions; answer text;
  points_total numeric := 0; score_total numeric := 0; attempt_no integer; has_review boolean := false;
  result public.quiz_results; correct boolean; earned numeric; session public.quiz_attempt_sessions;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Answers must be submitted as a question map.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id = p_quiz_id and school_id = student.school_id and published = true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  if quiz.opens_at is not null and now() < quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || student.id::text, 0));
  select * into session from public.quiz_attempt_sessions a where a.id = p_session_id and a.quiz_id = quiz.id and a.student_id = student.id for update;
  if session.id is null or session.submitted_at is not null then raise exception 'Assessment session is invalid or already submitted.'; end if;
  if now() > session.expires_at + interval '10 seconds' then raise exception 'Assessment time has expired. Contact your teacher if you were disconnected.'; end if;
  attempt_no := session.attempt_number;
  for question in select q.* from public.quiz_questions q where q.quiz_id = quiz.id loop
    points_total := points_total + greatest(coalesce(question.points, 1), 0);
  end loop;
  if points_total = 0 then raise exception 'This assessment has no questions.'; end if;
  insert into public.quiz_results(quiz_id, student_id, score, total_points, attempt_number, needs_review, published)
  values (quiz.id, student.id, 0, points_total, attempt_no, false, true) returning * into result;
  for question in select q.* from public.quiz_questions q where q.quiz_id = quiz.id loop
    answer := p_answers->>question.id::text;
    earned := 0; correct := null;
    if question.question_type in ('mcq','true_false') then
      if answer ~ '^[0-9]+$' then correct := answer::integer = question.correct_option_index; else correct := false; end if;
      if correct then earned := greatest(coalesce(question.points,1),0); end if;
      score_total := score_total + earned;
    elsif answer is not null and btrim(answer) <> '' then has_review := true;
    end if;
    insert into public.quiz_answers(result_id, question_id, answer_value, earned_points, is_correct)
    values (result.id, question.id, answer, earned, correct);
  end loop;
  update public.quiz_results set score = score_total, needs_review = has_review where id = result.id returning * into result;
  update public.quiz_attempt_sessions set submitted_at = now() where id = session.id;
  insert into public.notifications(school_id,user_id,title,body,type)
  values (quiz.school_id,(select auth.uid()),'Assessment submitted: ' || quiz.title,
    case when has_review then 'Your MCQ score is ' || score_total || '/' || points_total || '. Written responses are awaiting teacher review.'
      else 'Your score is ' || score_total || '/' || points_total || '.' end,'academic');
  if quiz.show_answers_after_submit and not has_review then
    return jsonb_build_object('result',to_jsonb(result),'answers',(
      select jsonb_agg(jsonb_build_object('question_id',q.id,'correct_option_index',q.correct_option_index,'explanation',q.explanation))
      from public.quiz_questions q where q.quiz_id = quiz.id and q.question_type in ('mcq','true_false')
    ));
  end if;
  return jsonb_build_object('result',to_jsonb(result),'answers',null);
end $$;
revoke all on function public.get_quiz_questions(uuid) from public, anon;
revoke all on function public.submit_quiz(uuid, jsonb, uuid) from public, anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb, uuid) to authenticated;

create or replace function public.grade_quiz_answer(p_answer_id uuid, p_points numeric, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare answer_row public.quiz_answers; result_row public.quiz_results; question_row public.quiz_questions; quiz_row public.quizzes;
  new_score numeric; still_pending boolean;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then raise exception 'Staff access is required.'; end if;
  select a.* into answer_row from public.quiz_answers a where a.id = p_answer_id for update;
  select q.* into question_row from public.quiz_questions q where q.id = answer_row.question_id;
  select r.* into result_row from public.quiz_results r where r.id = answer_row.result_id;
  select q.* into quiz_row from public.quizzes q where q.id = result_row.quiz_id;
  if answer_row.id is null or quiz_row.school_id is distinct from (select private.current_school_id())
    or ((select private.current_role()) = 'teacher' and quiz_row.created_by is distinct from (select auth.uid())) then raise exception 'Answer not found or access denied.'; end if;
  if p_points is null or p_points < 0 or p_points > greatest(question_row.points,0) then raise exception 'Mark is outside the question point range.'; end if;
  update public.quiz_answers set earned_points = p_points, teacher_feedback = p_feedback, graded_by = (select auth.uid()), graded_at = now()
    where id = p_answer_id;
  select coalesce(sum(a.earned_points),0) into new_score from public.quiz_answers a where a.result_id = result_row.id;
  select exists(select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
    where a.result_id = result_row.id and q.question_type not in ('mcq','true_false') and a.graded_at is null) into still_pending;
  update public.quiz_results set score = new_score, needs_review = still_pending where id = result_row.id;
  insert into public.notifications(school_id,user_id,title,body,type)
  select quiz_row.school_id,s.profile_id,'Assessment feedback: ' || quiz_row.title,
    'Your written answer has been marked. Current score: ' || new_score || '/' || result_row.total_points || '.', 'academic'
  from public.students s where s.id = result_row.student_id and s.profile_id is not null;
end $$;
revoke all on function public.grade_quiz_answer(uuid,numeric,text) from public, anon;
grant execute on function public.grade_quiz_answer(uuid,numeric,text) to authenticated;

create or replace function public.notify_new_assessment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.published then
      insert into public.notifications(school_id,user_id,title,body,type)
      select new.school_id,recipient.user_id,'New ' || upper(new.assessment_type) || ': ' || new.title,
        'Subject: ' || coalesce((select name from public.subjects where id = new.subject_id),'General') ||
        coalesce(' · Unit: ' || nullif(new.unit_title,''),'') || coalesce(' · Due: ' || to_char(new.due_at,'YYYY-MM-DD HH24:MI'),'') , 'academic'
      from (select distinct user_id from (
        select s.profile_id as user_id from public.students s where s.school_id = new.school_id and s.profile_id is not null and (new.class_id is null or s.class_id = new.class_id)
        union select g.guardian_id from public.student_guardians g join public.students s on s.id = g.student_id where s.school_id = new.school_id and (new.class_id is null or s.class_id = new.class_id)
      ) audience) recipient;
    end if;
  elsif new.published and old.published is distinct from new.published then
    insert into public.notifications(school_id,user_id,title,body,type)
    select new.school_id,recipient.user_id,'New ' || upper(new.assessment_type) || ': ' || new.title,
      'Subject: ' || coalesce((select name from public.subjects where id = new.subject_id),'General') ||
      coalesce(' · Unit: ' || nullif(new.unit_title,''),'') || coalesce(' · Due: ' || to_char(new.due_at,'YYYY-MM-DD HH24:MI'),'') , 'academic'
    from (select distinct user_id from (
      select s.profile_id as user_id from public.students s where s.school_id = new.school_id and s.profile_id is not null and (new.class_id is null or s.class_id = new.class_id)
      union select g.guardian_id from public.student_guardians g join public.students s on s.id = g.student_id where s.school_id = new.school_id and (new.class_id is null or s.class_id = new.class_id)
    ) audience) recipient;
  end if;
  return new;
end $$;
drop trigger if exists tr_notify_new_assessment on public.quizzes;
create trigger tr_notify_new_assessment after insert or update on public.quizzes
for each row execute function public.notify_new_assessment();
