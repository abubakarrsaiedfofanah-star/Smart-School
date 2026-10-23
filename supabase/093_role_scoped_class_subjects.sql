-- Keep subject catalogs visible by role and expose learner subjects through
-- the class/subject/teacher assignment matrix.
create or replace function private.validate_student_class_school()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.class_id is not null and not exists (
    select 1 from public.classes c where c.id = new.class_id and c.school_id = new.school_id
  ) then
    raise exception 'A learner must be enrolled in a class from the same school.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.validate_student_class_school() from public, anon, authenticated;
drop trigger if exists validate_student_class_school on public.students;
create trigger validate_student_class_school before insert or update of school_id, class_id on public.students
for each row execute function private.validate_student_class_school();

create or replace function private.can_view_school_subject(target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    private.current_role() = 'super_admin'
    or exists (
      select 1 from public.subjects subject_row
      join public.profiles actor on actor.school_id = subject_row.school_id
      where subject_row.id = target_subject
        and actor.id = (select auth.uid())
        and actor.is_active is true
        and private.school_subscription_entitled(actor.school_id)
        and (
          actor.role in ('school_admin','staff')
          or (actor.role = 'teacher' and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = actor.school_id and tsa.subject_id = subject_row.id and tsa.teacher_id = actor.id
          ))
          or (actor.role = 'student' and exists (
            select 1 from public.students learner
            join public.teacher_subject_assignments tsa on tsa.school_id = learner.school_id
              and tsa.class_id = learner.class_id and tsa.subject_id = subject_row.id
            where learner.school_id = actor.school_id and learner.profile_id = actor.id
          ))
          or (actor.role = 'parent' and exists (
            select 1 from public.student_guardians guardian
            join public.students learner on learner.id = guardian.student_id
            join public.teacher_subject_assignments tsa on tsa.school_id = learner.school_id
              and tsa.class_id = learner.class_id and tsa.subject_id = subject_row.id
            where learner.school_id = actor.school_id and guardian.guardian_id = actor.id
          ))
        )
    )
$$;
revoke all on function private.can_view_school_subject(uuid) from public, anon;
grant execute on function private.can_view_school_subject(uuid) to authenticated;

drop policy if exists subjects_read_school on public.subjects;
drop policy if exists subjects_read_by_role on public.subjects;
create policy subjects_read_by_role on public.subjects for select to authenticated
using (private.can_view_school_subject(id));

drop policy if exists teacher_subject_assignments_read_school on public.teacher_subject_assignments;
drop policy if exists teacher_subject_assignments_read_related on public.teacher_subject_assignments;
create policy teacher_subject_assignments_read_related on public.teacher_subject_assignments
for select to authenticated using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or private.has_school_permission(school_id, 'school.assignments.manage')
    or teacher_id = (select auth.uid())
    or (private.current_role() in ('student','parent') and private.can_view_class(class_id))
  )
);

drop policy if exists teacher_subject_assignments_admin_manage on public.teacher_subject_assignments;
create policy teacher_subject_assignments_admin_manage on public.teacher_subject_assignments
for all to authenticated
using (
  school_id = private.current_school_id()
  and (private.current_role() = 'school_admin' or private.has_school_permission(school_id, 'school.assignments.manage'))
)
with check (
  school_id = private.current_school_id()
  and (private.current_role() = 'school_admin' or private.has_school_permission(school_id, 'school.assignments.manage'))
);
