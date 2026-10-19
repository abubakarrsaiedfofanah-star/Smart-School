-- Keep answer details behind the same release boundary as quiz scores.
-- The former related-student policy exposed earned points and correctness
-- flags through direct table queries before results_release_at.
drop policy if exists quiz_answers_read_related on public.quiz_answers;
drop policy if exists quiz_answers_read_released on public.quiz_answers;

create policy quiz_answers_read_released on public.quiz_answers
for select to authenticated
using (
  exists (
    select 1
    from public.quiz_results r
    join public.quizzes q on q.id = r.quiz_id
    where r.id = quiz_answers.result_id
      and private.can_view_student(r.student_id)
      and (
        private.current_role() in ('teacher', 'school_admin')
        or q.results_release_at is null
        or q.results_release_at <= now()
      )
  )
);
