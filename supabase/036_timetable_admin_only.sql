-- Timetable editing belongs to school administrators (principal/head teacher accounts).
-- Teachers, students, and parents retain the relationship-based read policy.
drop policy if exists timetable_staff_insert on public.timetable;
drop policy if exists timetable_staff_update on public.timetable;
drop policy if exists timetable_staff_delete on public.timetable;

create policy timetable_admin_insert on public.timetable for insert to authenticated
with check (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id
      and c.school_id = timetable.school_id
      and s.school_id = timetable.school_id
  )
);

create policy timetable_admin_update on public.timetable for update to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
)
with check (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id
      and c.school_id = timetable.school_id
      and s.school_id = timetable.school_id
  )
);

create policy timetable_admin_delete on public.timetable for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
);
