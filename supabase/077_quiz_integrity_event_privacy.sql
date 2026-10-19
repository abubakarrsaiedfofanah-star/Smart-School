-- Integrity events are proctoring signals for staff review. Students and
-- guardians can read their quiz results, but should not query monitoring logs.
drop policy if exists quiz_integrity_events_read_related on public.quiz_integrity_events;
drop policy if exists quiz_integrity_events_staff_read on public.quiz_integrity_events;

create policy quiz_integrity_events_staff_read
on public.quiz_integrity_events
for select to authenticated
using (
  exists (
    select 1
    from public.quiz_attempt_sessions a
    join public.quizzes q on q.id = a.quiz_id
    where a.id = quiz_integrity_events.session_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (private.current_role() = 'teacher' and q.created_by = (select auth.uid()))
      )
  )
);
