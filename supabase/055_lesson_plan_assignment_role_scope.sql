-- Lesson plans are school-admin managed and teacher access follows current
-- class/subject assignments. Learners can read only public plans for classes
-- they are related to through private.can_view_class().

drop policy if exists lesson_plans_read_related on public.lesson_plans;
create policy lesson_plans_read_related on public.lesson_plans for select to authenticated using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and class_id is not null
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = lesson_plans.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.class_id = lesson_plans.class_id
          and tsa.subject_id = lesson_plans.subject_id
      )
    )
    or (
      private.current_role() = 'student'
      and is_public = true
      and class_id is not null
      and private.can_view_class(class_id)
    )
  )
);

drop policy if exists lesson_plans_staff_manage on public.lesson_plans;
create policy lesson_plans_staff_manage on public.lesson_plans for all to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and class_id is not null
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = lesson_plans.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.class_id = lesson_plans.class_id
          and tsa.subject_id = lesson_plans.subject_id
      )
    )
  )
)
with check (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and class_id is not null
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = lesson_plans.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.class_id = lesson_plans.class_id
          and tsa.subject_id = lesson_plans.subject_id
      )
    )
  )
);
