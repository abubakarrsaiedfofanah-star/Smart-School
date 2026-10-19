-- Keep teacher course authoring limited to their currently assigned subjects.
-- Published courses remain readable by other members of the same school.

drop policy if exists courses_read_school on public.courses;
create policy courses_read_school on public.courses for select to authenticated using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or is_published = true
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = courses.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = courses.subject_id
      )
    )
  )
);

drop policy if exists courses_staff_manage on public.courses;
create policy courses_staff_manage on public.courses for all to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = courses.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = courses.subject_id
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
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = courses.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = courses.subject_id
      )
    )
  )
);

drop policy if exists course_chapters_read_school on public.course_chapters;
create policy course_chapters_read_school on public.course_chapters for select to authenticated using (
  exists (
    select 1 from public.courses c
    where c.id = course_chapters.course_id
      and c.school_id = private.current_school_id()
      and (
        c.is_published = true
        or private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and c.teacher_id = (select auth.uid())
          and c.subject_id is not null
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = c.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = c.subject_id
          )
        )
      )
  )
);

drop policy if exists course_chapters_staff_manage on public.course_chapters;
create policy course_chapters_staff_manage on public.course_chapters for all to authenticated
using (
  exists (
    select 1 from public.courses c
    where c.id = course_chapters.course_id
      and c.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and c.teacher_id = (select auth.uid())
          and c.subject_id is not null
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = c.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = c.subject_id
          )
        )
      )
  )
)
with check (
  exists (
    select 1 from public.courses c
    where c.id = course_chapters.course_id
      and c.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and c.teacher_id = (select auth.uid())
          and c.subject_id is not null
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = c.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = c.subject_id
          )
        )
      )
  )
);
