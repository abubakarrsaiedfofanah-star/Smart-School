-- Keep class and subject assignment authorization aligned with the active
-- profile checks used by the current role and school helpers.
create or replace function private.can_manage_class_subject(
  target_school uuid,
  target_class uuid,
  target_subject uuid
)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.role = 'school_admin' and p.school_id = target_school
  )
  or (
    private.current_role() = 'teacher'
    and private.current_school_id() = target_school
    and exists (
      select 1 from public.classes c
      join public.subjects s on s.school_id = c.school_id
      where c.id = target_class and c.school_id = target_school and s.id = target_subject
        and exists (
          select 1 from public.teacher_subject_assignments tsa
          where tsa.school_id = target_school and tsa.teacher_id = (select auth.uid())
            and tsa.class_id = c.id and tsa.subject_id = s.id
        )
    )
  )
  or (
    private.current_role() = 'teacher'
    and private.current_school_id() = target_school
    and target_subject is null
    and exists (
      select 1 from public.classes c
      where c.id = target_class and c.school_id = target_school and c.teacher_id = (select auth.uid())
    )
  )
  or (
    private.current_role() = 'teacher'
    and private.has_school_permission(target_school, 'school.assignments.manage')
    and exists (select 1 from public.classes c where c.id = target_class and c.school_id = target_school)
    and (target_subject is null or exists (
      select 1 from public.subjects s where s.id = target_subject and s.school_id = target_school
    ))
  )
$$;
revoke all on function private.can_manage_class_subject(uuid, uuid, uuid) from public, anon;
grant execute on function private.can_manage_class_subject(uuid, uuid, uuid) to authenticated;

create or replace function private.guard_teacher_subject_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = new.teacher_id and p.school_id = new.school_id
      and p.role = 'teacher' and p.is_active is true
  ) then
    raise exception 'Teaching assignments require an active teacher account in the same school.';
  end if;
  if not exists (select 1 from public.classes c where c.id = new.class_id and c.school_id = new.school_id) then
    raise exception 'Teaching class must belong to the same school.';
  end if;
  if not exists (select 1 from public.subjects s where s.id = new.subject_id and s.school_id = new.school_id) then
    raise exception 'Teaching subject must belong to the same school.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_teacher_subject_assignment() from public, anon, authenticated;
