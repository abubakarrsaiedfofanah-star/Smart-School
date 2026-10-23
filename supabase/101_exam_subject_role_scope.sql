-- Do not let the published learner-facing exam policy broaden a teacher's
-- access beyond the class/subject assignments used for staff access.
drop policy if exists exams_read_related on public.exams;
create policy exams_read_related on public.exams
for select to authenticated using (
  (school_id = private.current_school_id() and private.current_role() = 'school_admin')
  or (school_id = private.current_school_id() and private.current_role() = 'teacher'
    and private.can_manage_class_subject(school_id, class_id, subject_id))
  or (private.current_role() in ('student','parent') and published = true
    and class_id is not null and private.can_view_class(class_id))
  or (private.current_role() in ('student','parent') and published = true
    and class_id is not null and private.can_view_class_history_material(class_id, exam_date))
);
