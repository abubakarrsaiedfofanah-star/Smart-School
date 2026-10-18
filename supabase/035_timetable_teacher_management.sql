-- Let teachers manage periods only for classes and subjects assigned to them.
drop policy if exists timetable_staff_insert on public.timetable;
drop policy if exists timetable_staff_update on public.timetable;
drop policy if exists timetable_staff_delete on public.timetable;

create policy timetable_staff_insert on public.timetable for insert to authenticated with check (
  school_id = private.current_school_id()
  and private.current_role() in ('school_admin', 'teacher')
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id
      and c.school_id = timetable.school_id
      and s.school_id = timetable.school_id
      and (
        private.current_role() = 'school_admin'
        or (
          timetable.teacher_id = (select auth.uid())
          and (
            c.teacher_id = (select auth.uid())
            or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id = (select auth.uid())
                and tsa.class_id = timetable.class_id
                and tsa.subject_id = timetable.subject_id
                and tsa.school_id = timetable.school_id
            )
          )
        )
      )
  )
);

create policy timetable_staff_update on public.timetable for update to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() in ('school_admin', 'teacher')
  and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid()))
)
with check (
  school_id = private.current_school_id()
  and private.current_role() in ('school_admin', 'teacher')
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id
      and c.school_id = timetable.school_id
      and s.school_id = timetable.school_id
      and (
        private.current_role() = 'school_admin'
        or (
          timetable.teacher_id = (select auth.uid())
          and (
            c.teacher_id = (select auth.uid())
            or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id = (select auth.uid())
                and tsa.class_id = timetable.class_id
                and tsa.subject_id = timetable.subject_id
                and tsa.school_id = timetable.school_id
            )
          )
        )
      )
  )
);

create policy timetable_staff_delete on public.timetable for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() in ('school_admin', 'teacher')
  and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid()))
);
