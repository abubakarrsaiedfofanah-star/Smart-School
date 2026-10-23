-- Standardize class ordering and let class teachers publish class-only notices.
alter table public.classes
  add column if not exists education_stage text,
  add column if not exists level_order smallint;

update public.classes
set education_stage = case
      when lower(concat_ws(' ', name, grade)) ~ '(nursery|kindergarten|pre.?primary)' then 'pre_primary'
      when lower(concat_ws(' ', name, grade)) ~ '(jss|junior secondary)' then 'jss'
      when lower(concat_ws(' ', name, grade)) ~ '(sss|senior secondary)' then 'sss'
      when lower(concat_ws(' ', name, grade)) ~ '(primary|class)' then 'primary'
      else education_stage
    end,
    level_order = case
      when lower(concat_ws(' ', name, grade)) ~ 'nursery\s*1' then 1
      when lower(concat_ws(' ', name, grade)) ~ 'nursery\s*2' then 2
      when lower(concat_ws(' ', name, grade)) ~ 'kindergarten' then 3
      when lower(concat_ws(' ', name, grade)) ~ '(class|primary)\s*1' then 1
      when lower(concat_ws(' ', name, grade)) ~ '(class|primary)\s*2' then 2
      when lower(concat_ws(' ', name, grade)) ~ '(class|primary)\s*3' then 3
      when lower(concat_ws(' ', name, grade)) ~ '(class|primary)\s*4' then 4
      when lower(concat_ws(' ', name, grade)) ~ '(class|primary)\s*5' then 5
      when lower(concat_ws(' ', name, grade)) ~ '(class|primary)\s*6' then 6
      when lower(concat_ws(' ', name, grade)) ~ '(jss|junior secondary)\s*1' then 1
      when lower(concat_ws(' ', name, grade)) ~ '(jss|junior secondary)\s*2' then 2
      when lower(concat_ws(' ', name, grade)) ~ '(jss|junior secondary)\s*3' then 3
      when lower(concat_ws(' ', name, grade)) ~ '(sss|senior secondary)\s*1' then 1
      when lower(concat_ws(' ', name, grade)) ~ '(sss|senior secondary)\s*2' then 2
      when lower(concat_ws(' ', name, grade)) ~ '(sss|senior secondary)\s*3' then 3
      else level_order
    end
where education_stage is null or level_order is null;

alter table public.classes drop constraint if exists classes_education_stage_valid;
alter table public.classes add constraint classes_education_stage_valid
  check (education_stage is null or education_stage in ('pre_primary','primary','jss','sss'));
create index if not exists classes_school_stage_order_idx
  on public.classes(school_id, education_stage, level_order, name);

create or replace function private.validate_class_teacher()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.teacher_id is not null and not exists (
    select 1 from public.profiles p where p.id = new.teacher_id and p.school_id = new.school_id
      and p.role = 'teacher' and p.is_active is true
  ) then
    raise exception 'Choose an active teacher from this school.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.validate_class_teacher() from public, anon, authenticated;
drop trigger if exists validate_class_teacher on public.classes;
create trigger validate_class_teacher before insert or update of teacher_id, school_id on public.classes
for each row execute function private.validate_class_teacher();

-- Public registration uses the same stable education-stage order as the school UI.
drop function if exists public.get_public_school_classes(text);
create or replace function public.get_public_school_classes(p_school_slug text)
returns table(id uuid, name text, grade text, education_stage text, level_order smallint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.grade, c.education_stage, c.level_order
  from public.classes c join public.schools s on s.id = c.school_id
  where s.slug = p_school_slug and s.status = 'active'
  order by case c.education_stage when 'pre_primary' then 1 when 'primary' then 2 when 'jss' then 3 when 'sss' then 4 else 5 end,
    c.level_order nulls last, lower(c.grade), lower(c.name), c.id
$$;
revoke all on function public.get_public_school_classes(text) from public;
grant execute on function public.get_public_school_classes(text) to anon, authenticated;

alter table public.announcements
  add column if not exists class_id uuid references public.classes(id) on delete cascade;
create index if not exists announcements_school_class_created_idx
  on public.announcements(school_id, class_id, created_at desc);

create or replace function private.validate_announcement_class()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.class_id is not null and not exists (
    select 1 from public.classes c where c.id = new.class_id and c.school_id = new.school_id
  ) then
    raise exception 'Choose a class from this school.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.school_id is distinct from old.school_id or new.created_by is distinct from old.created_by) then
    raise exception 'An announcement cannot be reassigned to another school or author.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.validate_announcement_class() from public, anon, authenticated;
drop trigger if exists validate_announcement_class on public.announcements;
create trigger validate_announcement_class before insert or update on public.announcements
for each row execute function private.validate_announcement_class();

drop policy if exists announcements_read_school on public.announcements;
drop policy if exists announcements_staff_insert on public.announcements;
drop policy if exists announcements_staff_update on public.announcements;
drop policy if exists announcements_staff_delete on public.announcements;
drop policy if exists announcements_school_leadership_insert on public.announcements;
drop policy if exists announcements_school_leadership_update on public.announcements;
drop policy if exists announcements_school_leadership_delete on public.announcements;
drop policy if exists "school members announcements" on public.announcements;
drop policy if exists announcements_read_related on public.announcements;
drop policy if exists announcements_insert_related on public.announcements;
drop policy if exists announcements_update_related on public.announcements;
drop policy if exists announcements_delete_related on public.announcements;

create policy announcements_read_related on public.announcements for select to authenticated using (
  private.current_role() = 'super_admin'
  or (school_id = private.current_school_id() and (
    class_id is null
    or private.has_school_permission(school_id, 'school.announcements.manage')
    or private.can_view_class(class_id)
  ))
);
create policy announcements_insert_related on public.announcements for insert to authenticated with check (
  school_id = private.current_school_id()
  and created_by = (select auth.uid())
  and (
    (class_id is null and private.has_school_permission(school_id, 'school.announcements.manage'))
    or (class_id is not null and private.current_role() = 'teacher' and private.can_view_class(class_id))
    or (class_id is not null and private.has_school_permission(school_id, 'school.announcements.manage') and private.can_view_class(class_id))
  )
);
create policy announcements_update_related on public.announcements for update to authenticated
using (
  school_id = private.current_school_id()
  and (private.has_school_permission(school_id, 'school.announcements.manage')
    or (created_by = (select auth.uid()) and class_id is not null and private.current_role() = 'teacher' and private.can_view_class(class_id)))
)
with check (
  school_id = private.current_school_id()
  and (private.has_school_permission(school_id, 'school.announcements.manage')
    or (created_by = (select auth.uid()) and class_id is not null and private.current_role() = 'teacher' and private.can_view_class(class_id)))
);
create policy announcements_delete_related on public.announcements for delete to authenticated using (
  school_id = private.current_school_id()
  and (private.has_school_permission(school_id, 'school.announcements.manage')
    or (created_by = (select auth.uid()) and class_id is not null and private.current_role() = 'teacher' and private.can_view_class(class_id)))
);

-- Parent accounts may view class posts for their linked children as well as school-wide notices.
drop policy if exists lesson_plans_read_related on public.lesson_plans;
create policy lesson_plans_read_related on public.lesson_plans for select to authenticated using (
  school_id = private.current_school_id() and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and class_id is not null and subject_id is not null and exists (
      select 1 from public.teacher_subject_assignments tsa where tsa.school_id = lesson_plans.school_id
        and tsa.teacher_id = (select auth.uid()) and tsa.class_id = lesson_plans.class_id and tsa.subject_id = lesson_plans.subject_id
    ))
    or (is_public = true and class_id is not null and private.can_view_class(class_id)
      and private.current_role() in ('student','parent'))
  )
);

