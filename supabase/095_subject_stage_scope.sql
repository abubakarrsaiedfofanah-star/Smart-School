-- Restrict each school's subject catalog to the education stages where that
-- subject is taught, then enforce that scope when assigning a teacher.
alter table public.subjects
  add column if not exists education_stages text[] not null
    default array['pre_primary','primary','jss','sss']::text[];

alter table public.subjects drop constraint if exists subjects_education_stages_valid;
alter table public.subjects add constraint subjects_education_stages_valid check (
  cardinality(education_stages) > 0
  and education_stages <@ array['pre_primary','primary','jss','sss']::text[]
);

-- Homeroom teachers can see the subject catalog for their assigned class;
-- subject teachers can still see only subjects assigned to them or their class.
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
      and (class_row.education_stage is null or class_row.education_stage = any(subject_row.education_stages))
  ) then
    raise exception 'Choose an active teacher and a subject available for this class in the same school.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.prevent_subject_stage_assignment_conflicts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.teacher_subject_assignments assignment_row
    join public.classes class_row on class_row.id = assignment_row.class_id
    where assignment_row.subject_id = new.id and class_row.education_stage is not null
      and not (new.education_stages @> array[class_row.education_stage])
  ) then
    raise exception 'This subject is already assigned to a class outside the selected education stages.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.prevent_subject_stage_assignment_conflicts() from public, anon, authenticated;
drop trigger if exists prevent_subject_stage_assignment_conflicts on public.subjects;
create trigger prevent_subject_stage_assignment_conflicts
before update of education_stages on public.subjects
for each row execute function private.prevent_subject_stage_assignment_conflicts();

create or replace function private.prevent_class_stage_assignment_conflicts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.education_stage is not null and exists (
    select 1 from public.teacher_subject_assignments assignment_row
    join public.subjects subject_row on subject_row.id = assignment_row.subject_id
    where assignment_row.class_id = new.id
      and not (subject_row.education_stages @> array[new.education_stage])
  ) then
    raise exception 'This class has a teacher assignment for a subject not available at the selected education stage.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.prevent_class_stage_assignment_conflicts() from public, anon, authenticated;
drop trigger if exists prevent_class_stage_assignment_conflicts on public.classes;
create trigger prevent_class_stage_assignment_conflicts
before update of education_stage on public.classes
for each row execute function private.prevent_class_stage_assignment_conflicts();
