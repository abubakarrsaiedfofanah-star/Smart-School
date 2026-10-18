-- Assessment resume, controlled result release, question metadata and moderation support.
alter table public.quizzes add column if not exists results_release_at timestamptz;
alter table public.quiz_questions add column if not exists topic_tags text[] not null default '{}'::text[];
alter table public.quiz_questions add column if not exists difficulty text not null default 'medium'
  check (difficulty in ('easy','medium','hard'));
alter table public.quiz_questions add column if not exists rubric jsonb not null default '[]'::jsonb;
alter table public.quiz_questions add column if not exists pool_group text;
alter table public.quiz_questions add column if not exists pool_pick_count integer not null default 1 check (pool_pick_count between 1 and 100);
alter table public.quiz_question_bank add column if not exists topic_tags text[] not null default '{}'::text[];
alter table public.quiz_question_bank add column if not exists difficulty text not null default 'medium'
  check (difficulty in ('easy','medium','hard'));
alter table public.quiz_question_bank add column if not exists rubric jsonb not null default '[]'::jsonb;

-- Student scores are readable only after the teacher's release time (unless unreleased time is null).
drop policy if exists quiz_results_read_related on public.quiz_results;
create policy quiz_results_read_related on public.quiz_results for select to authenticated using (
  private.can_view_student(student_id) and exists (
    select 1 from public.quizzes q where q.id = quiz_id
      and (private.current_role() in ('teacher','school_admin','super_admin') or q.results_release_at is null or q.results_release_at <= now())
  )
);

-- A future score release must also redact the score from the submit RPC response.
create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns table(id uuid, question_text text, options jsonb, points integer, question_type text, sort_order integer, session_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; session public.quiz_attempt_sessions; accommodation public.quiz_accommodations;
  next_attempt integer; effective_due timestamptz; effective_attempts integer;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id=p_quiz_id and school_id=student.school_id and published=true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  select * into accommodation from public.quiz_accommodations a where a.quiz_id=quiz.id and a.student_id=student.id;
  effective_due:=coalesce(accommodation.deadline_override,quiz.due_at); effective_attempts:=quiz.max_attempts+coalesce(accommodation.extra_attempts,0);
  if quiz.opens_at is not null and now()<quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  if effective_due is not null and now()>effective_due then raise exception 'The submission deadline has passed.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text||student.id::text,0));
  select greatest((select count(*) from public.quiz_results r where r.quiz_id=quiz.id and r.student_id=student.id),(select count(*) from public.quiz_attempt_sessions a where a.quiz_id=quiz.id and a.student_id=student.id))+1 into next_attempt;
  select * into session from public.quiz_attempt_sessions a where a.quiz_id=quiz.id and a.student_id=student.id and a.submitted_at is null and a.expires_at>=now() order by a.started_at desc limit 1;
  if session.id is null and next_attempt>effective_attempts then raise exception 'No attempts remaining.'; end if;
  if session.id is null then
    insert into public.quiz_attempt_sessions(quiz_id,student_id,attempt_number,expires_at) values(quiz.id,student.id,next_attempt,least(now()+make_interval(mins=>quiz.time_limit_minutes+coalesce(accommodation.extra_time_minutes,0)),coalesce(effective_due,'infinity'::timestamptz))) returning * into session;
  end if;
  if session.selected_question_ids is null then
    if exists(select 1 from public.quiz_questions q where q.quiz_id=quiz.id and q.pool_group is not null group by q.pool_group having min(q.pool_pick_count)<>max(q.pool_pick_count) or min(q.pool_pick_count)>count(*)) then
      raise exception 'Assessment question pool configuration is invalid.';
    end if;
    update public.quiz_attempt_sessions a set selected_question_ids=array(
      select chosen.id from (
        select q.id from public.quiz_questions q where q.quiz_id=quiz.id and q.pool_group is null
        union all
        select ranked.id from (select q.id,min(q.pool_pick_count) over(partition by q.pool_group) as take_count,row_number() over(partition by q.pool_group order by md5(session.id::text||q.id::text)) as pos from public.quiz_questions q where q.quiz_id=quiz.id and q.pool_group is not null) ranked where ranked.pos<=ranked.take_count
      ) chosen
    ) where a.id=session.id returning * into session;
  end if;
  return query select q.id,q.question_text,
    case when quiz.shuffle_options then (select jsonb_agg(jsonb_build_object('index',x.orig,'text',x.val) order by x.k) from (select e.value val,e.ordinality-1 orig,md5(session.id::text||q.id::text||e.value::text) k from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) x)
    else (select jsonb_agg(jsonb_build_object('index',e.ordinality-1,'text',e.value)) from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) end,
    q.points,q.question_type,q.sort_order,session.id,session.expires_at from public.quiz_questions q where q.quiz_id=quiz.id and q.id=any(session.selected_question_ids)
    order by case when quiz.shuffle_questions then md5(quiz.id::text||student.id::text||q.id::text) else lpad(q.sort_order::text,10,'0') end;
end $$;
revoke all on function public.get_quiz_questions(uuid) from public,anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated;

create or replace function public.submit_quiz(p_quiz_id uuid, p_answers jsonb, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; question public.quiz_questions; answer text;
  points_total numeric := 0; score_total numeric := 0; attempt_no integer; has_review boolean := false;
  result public.quiz_results; correct boolean; earned numeric; session public.quiz_attempt_sessions;
  released_result jsonb;
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
  for question in select q.* from public.quiz_questions q where q.quiz_id = quiz.id and q.id = any(session.selected_question_ids) loop
    points_total := points_total + greatest(coalesce(question.points, 1), 0);
  end loop;
  if points_total = 0 then raise exception 'This assessment has no questions.'; end if;
  insert into public.quiz_results(quiz_id, student_id, score, total_points, attempt_number, needs_review, published)
  values (quiz.id, student.id, 0, points_total, attempt_no, false, true) returning * into result;
  for question in select q.* from public.quiz_questions q where q.quiz_id = quiz.id and q.id = any(session.selected_question_ids) loop
    answer := p_answers->>question.id::text; earned := 0; correct := null;
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
    case when quiz.results_release_at is not null and quiz.results_release_at > now() then 'Your submission was received. Scores will be available after ' || to_char(quiz.results_release_at,'YYYY-MM-DD HH24:MI') || '.'
      when has_review then 'Your MCQ score is ' || score_total || '/' || points_total || '. Written responses are awaiting teacher review.'
      else 'Your score is ' || score_total || '/' || points_total || '.' end,'academic');
  if quiz.results_release_at is not null and quiz.results_release_at > now() then
    released_result := jsonb_set(jsonb_set(to_jsonb(result),'{score}','null'::jsonb),'{total_points}','null'::jsonb);
    return jsonb_build_object('result',released_result,'answers',null,'release_at',quiz.results_release_at);
  end if;
  if quiz.show_answers_after_submit and not has_review then
    return jsonb_build_object('result',to_jsonb(result),'answers',(
      select jsonb_agg(jsonb_build_object('question_id',q.id,'correct_option_index',q.correct_option_index,'explanation',q.explanation))
      from public.quiz_questions q where q.quiz_id = quiz.id and q.question_type in ('mcq','true_false')
    ));
  end if;
  return jsonb_build_object('result',to_jsonb(result),'answers',null);
end $$;
revoke all on function public.submit_quiz(uuid,jsonb,uuid) from public,anon;
grant execute on function public.submit_quiz(uuid,jsonb,uuid) to authenticated;

create or replace function public.notify_assessment_result_to_families()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quiz_row public.quizzes; result_title text;
begin
  if tg_op = 'UPDATE' and old.score is not distinct from new.score and old.needs_review is not distinct from new.needs_review then return new; end if;
  select q.* into quiz_row from public.quizzes q where q.id = new.quiz_id;
  if quiz_row.results_release_at is not null and quiz_row.results_release_at > now() then return new; end if;
  result_title := case when new.needs_review then 'Assessment submitted for review: ' else 'Assessment marked: ' end || quiz_row.title;
  insert into public.notifications(school_id,user_id,title,body,type)
  select quiz_row.school_id,g.guardian_id,result_title,
    case when new.needs_review then 'MCQ score: ' || new.score || '/' || new.total_points || '. Written work is awaiting marking.'
      else 'Score: ' || new.score || '/' || new.total_points || '.' end,'academic'
  from public.student_guardians g where g.student_id = new.student_id;
  return new;
end $$;

create table if not exists public.quiz_answer_drafts (
  session_id uuid not null references public.quiz_attempt_sessions(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer_value text not null default '',
  updated_at timestamptz not null default now(),
  primary key(session_id, question_id)
);
alter table public.quiz_attempt_sessions add column if not exists selected_question_ids uuid[];
alter table public.quiz_answer_drafts enable row level security;
revoke all on public.quiz_answer_drafts from public, anon, authenticated;

create or replace function public.save_quiz_answer_drafts(p_session_id uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare student_id uuid; quiz_id uuid; question_entry record;
begin
  if (select private.current_role()) is distinct from 'student' or jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Student assessment draft is invalid.';
  end if;
  select a.student_id,a.quiz_id into student_id,quiz_id from public.quiz_attempt_sessions a
    join public.students s on s.id = a.student_id
    where a.id = p_session_id and s.profile_id = (select auth.uid()) and s.school_id = (select private.current_school_id())
      and a.submitted_at is null and a.expires_at >= now();
  if student_id is null then raise exception 'Assessment session has expired.'; end if;
  for question_entry in select key,value from jsonb_each_text(p_answers) loop
    if not exists (select 1 from public.quiz_questions q where q.id = question_entry.key::uuid and q.quiz_id = quiz_id) then
      raise exception 'Answer includes a question outside this assessment.';
    end if;
    insert into public.quiz_answer_drafts(session_id,question_id,answer_value)
      values (p_session_id,question_entry.key::uuid,question_entry.value)
      on conflict (session_id,question_id) do update set answer_value = excluded.answer_value,updated_at = now();
  end loop;
end $$;

create or replace function public.get_quiz_answer_drafts(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(d.question_id::text,d.answer_value),'{}'::jsonb)
  from public.quiz_answer_drafts d
  join public.quiz_attempt_sessions a on a.id = d.session_id
  join public.students s on s.id = a.student_id
  where a.id = p_session_id and s.profile_id = (select auth.uid())
    and s.school_id = (select private.current_school_id()) and a.submitted_at is null and a.expires_at >= now()
    and (select private.current_role()) = 'student';
$$;
revoke all on function public.save_quiz_answer_drafts(uuid,jsonb) from public, anon;
revoke all on function public.get_quiz_answer_drafts(uuid) from public, anon;
grant execute on function public.save_quiz_answer_drafts(uuid,jsonb) to authenticated;
grant execute on function public.get_quiz_answer_drafts(uuid) to authenticated;

create or replace function public.clear_quiz_answer_drafts_after_submit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.submitted_at is null and new.submitted_at is not null then
    delete from public.quiz_answer_drafts where session_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists clear_quiz_answer_drafts_after_submit on public.quiz_attempt_sessions;
create trigger clear_quiz_answer_drafts_after_submit after update of submitted_at on public.quiz_attempt_sessions
for each row execute function public.clear_quiz_answer_drafts_after_submit();

create table if not exists public.quiz_second_marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  answer_id uuid not null references public.quiz_answers(id) on delete cascade,
  marker_id uuid not null references public.profiles(id) on delete cascade,
  first_mark_points numeric not null,
  first_marker_id uuid references public.profiles(id) on delete set null,
  points numeric not null check (points >= 0),
  feedback text,
  created_at timestamptz not null default now(),
  unique(answer_id,marker_id)
);
alter table public.quiz_second_marks enable row level security;
create policy quiz_second_marks_staff_read on public.quiz_second_marks for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and exists (select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
    join public.quizzes z on z.id = q.quiz_id where a.id = answer_id
      and (private.current_role() = 'school_admin' or (z.created_by = (select auth.uid()) or marker_id = (select auth.uid())))
  )
);
revoke insert,update,delete on public.quiz_second_marks from public, anon, authenticated;

create or replace function public.submit_second_quiz_mark(p_answer_id uuid,p_points numeric,p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare answer_row public.quiz_answers; question_row public.quiz_questions; quiz_row public.quizzes; result_row public.quiz_results;
  original_mark record;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then raise exception 'Staff access is required.'; end if;
  select * into answer_row from public.quiz_answers where id = p_answer_id;
  select * into question_row from public.quiz_questions where id = answer_row.question_id;
  select * into quiz_row from public.quizzes where id = question_row.quiz_id;
  select * into result_row from public.quiz_results where id = answer_row.result_id;
  if answer_row.id is null or quiz_row.school_id is distinct from (select private.current_school_id())
    or (quiz_row.created_by = (select auth.uid()) and not exists(select 1 from public.quiz_second_marks own_mark where own_mark.answer_id = p_answer_id and own_mark.marker_id = (select auth.uid())))
    or (answer_row.graded_by = (select auth.uid()) and not exists(select 1 from public.quiz_second_marks own_mark where own_mark.answer_id = p_answer_id and own_mark.marker_id = (select auth.uid())))
    or (select private.current_role()) = 'teacher' and not exists (
      select 1 from public.teacher_subject_assignments t where t.school_id = quiz_row.school_id
        and t.teacher_id = (select auth.uid()) and t.subject_id = quiz_row.subject_id
    ) then raise exception 'Second marking is limited to another authorized teacher.'; end if;
  if p_points is null or p_points < 0 or p_points > question_row.points then raise exception 'Mark is outside the question point range.'; end if;
  insert into public.quiz_second_marks(school_id,answer_id,marker_id,first_mark_points,first_marker_id,points,feedback)
  values (quiz_row.school_id,p_answer_id,(select auth.uid()),answer_row.earned_points,answer_row.graded_by,p_points,p_feedback)
  on conflict (answer_id,marker_id) do update set points = excluded.points,feedback = excluded.feedback,created_at = now();
  select * into original_mark from public.quiz_second_marks m where m.answer_id = p_answer_id and m.marker_id = (select auth.uid());
  if original_mark.first_marker_id is distinct from (select auth.uid()) then
    update public.quiz_answers set earned_points = round((original_mark.first_mark_points + original_mark.points) / 2,2),
      teacher_feedback = coalesce(p_feedback,teacher_feedback),graded_at = now() where id = p_answer_id;
    update public.quiz_results r set score = (select coalesce(sum(a.earned_points),0) from public.quiz_answers a where a.result_id = r.id)
      where r.id = result_row.id;
  end if;
end $$;
revoke all on function public.submit_second_quiz_mark(uuid,numeric,text) from public,anon;
grant execute on function public.submit_second_quiz_mark(uuid,numeric,text) to authenticated;

create table if not exists public.quiz_key_corrections (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  previous_index integer not null,
  corrected_index integer not null,
  reason text not null,
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.quiz_key_corrections enable row level security;
create policy quiz_key_corrections_staff_read on public.quiz_key_corrections for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and (private.current_role() = 'school_admin' or exists(select 1 from public.quizzes q where q.id = quiz_id and q.created_by = (select auth.uid())))
);
revoke insert,update,delete on public.quiz_key_corrections from public,anon,authenticated;

create or replace function public.correct_mcq_answer_key(p_question_id uuid,p_correct_index integer,p_explanation text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare question_row public.quiz_questions; quiz_row public.quizzes;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then raise exception 'Staff access is required.'; end if;
  select * into question_row from public.quiz_questions where id = p_question_id for update;
  select * into quiz_row from public.quizzes where id = question_row.quiz_id;
  if question_row.id is null or quiz_row.school_id is distinct from (select private.current_school_id())
    or (select private.current_role()) = 'teacher' and quiz_row.created_by is distinct from (select auth.uid()) then raise exception 'Question not found or access denied.'; end if;
  if question_row.question_type not in ('mcq','true_false') or p_correct_index is null or p_correct_index < 0
    or p_correct_index >= jsonb_array_length(question_row.options) or length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Choose a valid answer and explain the correction.';
  end if;
  if p_correct_index = question_row.correct_option_index then raise exception 'The corrected answer must differ from the current key.'; end if;
  insert into public.quiz_key_corrections(school_id,quiz_id,question_id,previous_index,corrected_index,reason,changed_by)
  values (quiz_row.school_id,quiz_row.id,question_row.id,question_row.correct_option_index,p_correct_index,trim(p_reason),(select auth.uid()));
  update public.quiz_questions set correct_option_index = p_correct_index, explanation = p_explanation where id = question_row.id;
  update public.quiz_answers a set is_correct = case when a.answer_value ~ '^[0-9]+$' then a.answer_value::integer = p_correct_index else false end,
    earned_points = case when a.answer_value ~ '^[0-9]+$' then case when a.answer_value::integer = p_correct_index then question_row.points else 0 end else 0 end
    where a.question_id = question_row.id and a.graded_at is null;
  update public.quiz_results r set score = totals.score from (
    select a.result_id,coalesce(sum(a.earned_points),0) as score from public.quiz_answers a
    join public.quiz_results linked on linked.id = a.result_id where a.question_id = question_row.id group by a.result_id
  ) totals where r.id = totals.result_id;
end $$;
revoke all on function public.correct_mcq_answer_key(uuid,integer,text,text) from public,anon;
grant execute on function public.correct_mcq_answer_key(uuid,integer,text,text) to authenticated;
