-- Generic HR and finance staff roles do not need the school's full subject
-- catalog. Allow it only to school admins, principals, staff with the explicit
-- assignment-management permission, teachers assigned to a class/subject, and
-- learners or parents linked to a class with that subject.
create or replace function private.can_view_school_subject(target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_role() = 'super_admin'
    or exists (
      select 1 from public.subjects subject_row
      join public.profiles actor on actor.school_id = subject_row.school_id
      where subject_row.id = target_subject
        and actor.id = (select auth.uid())
        and actor.is_active is true
        and private.school_subscription_entitled(actor.school_id)
        and (
          actor.role = 'school_admin'
          or (actor.role in ('teacher','staff') and (
            private.has_school_permission(actor.school_id, 'school.assignments.manage')
            or private.has_hr_role(actor.school_id, array['principal'])
          ))
          or (actor.role = 'teacher' and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = actor.school_id and tsa.subject_id = subject_row.id
              and tsa.teacher_id = actor.id
          ))
          or (actor.role = 'teacher' and exists (
            select 1 from public.teacher_subject_assignments tsa
            join public.classes class_row on class_row.id = tsa.class_id and class_row.school_id = tsa.school_id
            where tsa.school_id = actor.school_id and tsa.subject_id = subject_row.id
              and class_row.teacher_id = actor.id
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
