-- Teacher assessment banks and subject resources must follow the teacher's
-- current subject/class assignments, including after an assignment is revoked.

drop policy if exists quiz_question_bank_read_staff on public.quiz_question_bank;
create policy quiz_question_bank_read_staff on public.quiz_question_bank
for select to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = quiz_question_bank.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = quiz_question_bank.subject_id
      )
    )
  )
);

drop policy if exists quiz_question_bank_delete_staff on public.quiz_question_bank;
create policy quiz_question_bank_delete_staff on public.quiz_question_bank
for delete to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and created_by = (select auth.uid())
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = quiz_question_bank.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = quiz_question_bank.subject_id
      )
    )
  )
);

drop policy if exists quizzes_read_school on public.quizzes;
create policy quizzes_read_school on public.quizzes
for select to authenticated
using (
  private.current_role() = 'super_admin'
  or (
    school_id = private.current_school_id()
    and (
      private.current_role() = 'school_admin'
      or (
        private.current_role() = 'teacher'
        and exists (
          select 1 from public.teacher_subject_assignments tsa
          where tsa.school_id = quizzes.school_id
            and tsa.teacher_id = (select auth.uid())
            and tsa.subject_id = quizzes.subject_id
            and (quizzes.class_id is null or tsa.class_id = quizzes.class_id)
        )
      )
      or (
        private.current_role() in ('student','parent')
        and published = true
        and (class_id is null or private.can_view_class(class_id))
      )
    )
  )
);

drop policy if exists quiz_questions_staff_read on public.quiz_questions;
create policy quiz_questions_staff_read on public.quiz_questions
for select to authenticated
using (
  private.current_role() = 'super_admin'
  or exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_questions_staff_insert on public.quiz_questions;
create policy quiz_questions_staff_insert on public.quiz_questions
for insert to authenticated
with check (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_questions_staff_update on public.quiz_questions;
create policy quiz_questions_staff_update on public.quiz_questions
for update to authenticated
using (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
)
with check (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_questions_staff_delete on public.quiz_questions;
create policy quiz_questions_staff_delete on public.quiz_questions
for delete to authenticated
using (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_answers_teacher_grade on public.quiz_answers;
create policy quiz_answers_teacher_grade on public.quiz_answers
for update to authenticated
using (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quiz_results r
    join public.quizzes q on q.id = r.quiz_id
    where r.id = quiz_answers.result_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
)
with check (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quiz_results r
    join public.quizzes q on q.id = r.quiz_id
    where r.id = quiz_answers.result_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_accommodations_read_staff on public.quiz_accommodations;
create policy quiz_accommodations_read_staff on public.quiz_accommodations
for select to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and private.can_view_student(student_id)
      and exists (
        select 1 from public.quizzes q
        join public.teacher_subject_assignments tsa
          on tsa.school_id = q.school_id and tsa.subject_id = q.subject_id
        where q.id = quiz_accommodations.quiz_id
          and q.school_id = quiz_accommodations.school_id
          and q.created_by = (select auth.uid())
          and tsa.teacher_id = (select auth.uid())
          and (q.class_id is null or tsa.class_id = q.class_id)
      )
    )
  )
);

drop policy if exists quiz_accommodations_manage_staff on public.quiz_accommodations;
create policy quiz_accommodations_manage_staff on public.quiz_accommodations
for all to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and private.can_view_student(student_id)
      and exists (
        select 1 from public.quizzes q
        join public.teacher_subject_assignments tsa
          on tsa.school_id = q.school_id and tsa.subject_id = q.subject_id
        where q.id = quiz_accommodations.quiz_id
          and q.school_id = quiz_accommodations.school_id
          and q.created_by = (select auth.uid())
          and tsa.teacher_id = (select auth.uid())
          and (q.class_id is null or tsa.class_id = q.class_id)
      )
    )
  )
)
with check (
  school_id = private.current_school_id()
  and updated_by = (select auth.uid())
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and private.can_view_student(student_id)
      and exists (
        select 1 from public.quizzes q
        join public.teacher_subject_assignments tsa
          on tsa.school_id = q.school_id and tsa.subject_id = q.subject_id
        join public.students s on s.id = quiz_accommodations.student_id and s.school_id = q.school_id
        where q.id = quiz_accommodations.quiz_id
          and q.school_id = quiz_accommodations.school_id
          and q.created_by = (select auth.uid())
          and tsa.teacher_id = (select auth.uid())
          and (q.class_id is null or tsa.class_id = q.class_id)
          and (q.class_id is null or s.class_id = q.class_id)
      )
    )
  )
);

create or replace function public.grade_quiz_answer(p_answer_id uuid, p_points numeric, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  answer_row public.quiz_answers;
  result_row public.quiz_results;
  question_row public.quiz_questions;
  quiz_row public.quizzes;
  new_score numeric;
  still_pending boolean;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then
    raise exception 'Staff access is required.';
  end if;

  select a.* into answer_row from public.quiz_answers a where a.id = p_answer_id for update;
  select q.* into question_row from public.quiz_questions q where q.id = answer_row.question_id;
  select r.* into result_row from public.quiz_results r where r.id = answer_row.result_id;
  select q.* into quiz_row from public.quizzes q where q.id = result_row.quiz_id;

  if answer_row.id is null
    or quiz_row.school_id is distinct from (select private.current_school_id())
    or (
      (select private.current_role()) = 'teacher'
      and (
        quiz_row.created_by is distinct from (select auth.uid())
        or not exists (
          select 1 from public.teacher_subject_assignments tsa
          where tsa.school_id = quiz_row.school_id
            and tsa.teacher_id = (select auth.uid())
            and tsa.subject_id = quiz_row.subject_id
            and (quiz_row.class_id is null or tsa.class_id = quiz_row.class_id)
        )
      )
    ) then
    raise exception 'Answer not found or access denied.';
  end if;

  if p_points is null or p_points < 0 or p_points > greatest(question_row.points,0) then
    raise exception 'Mark is outside the question point range.';
  end if;

  update public.quiz_answers
  set earned_points = p_points, teacher_feedback = p_feedback, graded_by = (select auth.uid()), graded_at = now()
  where id = p_answer_id;

  select coalesce(sum(a.earned_points),0) into new_score
  from public.quiz_answers a where a.result_id = result_row.id;

  select exists(
    select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
    where a.result_id = result_row.id and q.question_type not in ('mcq','true_false') and a.graded_at is null
  ) into still_pending;

  update public.quiz_results set score = new_score, needs_review = still_pending where id = result_row.id;

  insert into public.notifications(school_id,user_id,title,body,type)
  select quiz_row.school_id, s.profile_id, 'Assessment feedback: ' || quiz_row.title,
    'Your written answer has been marked. Current score: ' || new_score || '/' || result_row.total_points || '.', 'academic'
  from public.students s where s.id = result_row.student_id and s.profile_id is not null;
end;
$$;
revoke all on function public.grade_quiz_answer(uuid,numeric,text) from public, anon;
grant execute on function public.grade_quiz_answer(uuid,numeric,text) to authenticated;

drop policy if exists subject_resources_read_scope on public.subject_resources;
create policy subject_resources_read_scope on public.subject_resources
for select to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = subject_resources.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = subject_resources.subject_id
          and (subject_resources.class_id is null or tsa.class_id = subject_resources.class_id)
      )
    )
    or (
      private.current_role() in ('student','parent')
      and (class_id is null or private.can_view_class(class_id))
    )
  )
);

drop policy if exists subject_resources_staff_delete on public.subject_resources;
create policy subject_resources_staff_delete on public.subject_resources
for delete to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and uploaded_by = (select auth.uid())
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = subject_resources.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = subject_resources.subject_id
          and (subject_resources.class_id is null or tsa.class_id = subject_resources.class_id)
      )
    )
  )
);

drop policy if exists subject_resource_files_delete on storage.objects;
create policy subject_resource_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'subject-resources'
  and (storage.foldername(name))[1] = private.current_school_id()::text
  and exists (
    select 1 from public.subject_resources r
    where r.file_path = name
      and r.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and r.uploaded_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = r.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = r.subject_id
              and (r.class_id is null or tsa.class_id = r.class_id)
          )
        )
      )
  )
);
