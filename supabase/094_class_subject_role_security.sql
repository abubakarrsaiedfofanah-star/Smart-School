-- Remove early broad same-school policies so class and subject access follows
-- the current school role and assignment model. The unused legacy
-- class_subjects mapping stays inaccessible; teaching uses
-- teacher_subject_assignments as the authoritative class/subject matrix.
do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('classes', 'subjects', 'teacher_subject_assignments', 'class_subjects')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

create policy classes_read_by_role on public.classes
for select to authenticated using (
  private.current_role() = 'super_admin'
  or (school_id = private.current_school_id() and private.can_view_class(id))
  or private.has_hr_role(school_id, array['principal'])
);
create policy classes_manage_by_role on public.classes
for all to authenticated using (
  school_id = private.current_school_id()
  and (private.current_role() = 'school_admin' or private.has_school_permission(school_id, 'school.assignments.manage')
    or private.has_hr_role(school_id, array['principal']))
)
with check (
  school_id = private.current_school_id()
  and (private.current_role() = 'school_admin' or private.has_school_permission(school_id, 'school.assignments.manage')
    or private.has_hr_role(school_id, array['principal']))
);

create policy subjects_read_by_role on public.subjects
for select to authenticated using (private.can_view_school_subject(id));
create policy subjects_manage_by_role on public.subjects
for all to authenticated using (
  school_id = private.current_school_id()
  and (private.current_role() = 'school_admin' or private.has_school_permission(school_id, 'school.assignments.manage')
    or private.has_hr_role(school_id, array['principal']))
)
with check (
  school_id = private.current_school_id()
  and (private.current_role() = 'school_admin' or private.has_school_permission(school_id, 'school.assignments.manage')
    or private.has_hr_role(school_id, array['principal']))
);

create policy teacher_subject_assignments_read_related on public.teacher_subject_assignments
for select to authenticated using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or private.has_school_permission(school_id, 'school.assignments.manage')
    or private.has_hr_role(school_id, array['principal'])
    or teacher_id = (select auth.uid())
    or (private.current_role() = 'teacher' and exists (
      select 1 from public.classes class_row where class_row.id = teacher_subject_assignments.class_id
        and class_row.school_id = teacher_subject_assignments.school_id
        and class_row.teacher_id = (select auth.uid())
    ))
    or (private.current_role() in ('student','parent') and private.can_view_class(class_id))
  )
);
create policy teacher_subject_assignments_manage_by_role on public.teacher_subject_assignments
for all to authenticated using (
  school_id = private.current_school_id()
  and (private.current_role() = 'school_admin' or private.has_school_permission(school_id, 'school.assignments.manage')
    or private.has_hr_role(school_id, array['principal']))
)
with check (
  school_id = private.current_school_id()
  and (private.current_role() = 'school_admin' or private.has_school_permission(school_id, 'school.assignments.manage')
    or private.has_hr_role(school_id, array['principal']))
);

-- A valid assignment must bind an active teacher, subject, and class from the
-- same school. Foreign keys alone do not prevent cross-school combinations.
create or replace function private.validate_teacher_subject_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1
    from public.profiles teacher
    join public.classes class_row on class_row.id = new.class_id and class_row.school_id = new.school_id
    join public.subjects subject_row on subject_row.id = new.subject_id and subject_row.school_id = new.school_id
    where teacher.id = new.teacher_id and teacher.school_id = new.school_id
      and teacher.role = 'teacher' and teacher.is_active is true
  ) then
    raise exception 'Choose an active teacher, class, and subject from the same school.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.validate_teacher_subject_assignment() from public, anon, authenticated;
drop trigger if exists validate_teacher_subject_assignment on public.teacher_subject_assignments;
create trigger validate_teacher_subject_assignment
before insert or update of school_id, teacher_id, class_id, subject_id
on public.teacher_subject_assignments
for each row execute function private.validate_teacher_subject_assignment();
