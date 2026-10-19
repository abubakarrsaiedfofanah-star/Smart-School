-- Remove legacy school-wide and teacher-owner write rules. Timetable writes
-- are managed through the principal/deputy permissions created in migration 041.

drop policy if exists "school members timetable" on public.timetable;
drop policy if exists timetable_staff_insert on public.timetable;
drop policy if exists timetable_staff_update on public.timetable;
drop policy if exists timetable_staff_delete on public.timetable;
