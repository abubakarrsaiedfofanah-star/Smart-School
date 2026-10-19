-- Keep lesson attachments private and scope file access to the lesson row.
drop policy if exists lesson_files_read_related on storage.objects;
create policy lesson_files_read_related on storage.objects
for select to authenticated
using (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'lessons'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and exists (
    select 1 from public.lesson_plans lp
    where lp.file_path = storage.objects.name
      and lp.school_id = private.current_school_id()
  )
);

drop policy if exists lesson_files_teacher_insert on storage.objects;
create policy lesson_files_teacher_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'lessons'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and split_part(name, '/', 5) = (select auth.uid())::text
  and split_part(name, '/', 6) <> ''
  and split_part(name, '/', 7) = ''
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.school_id = c.school_id
      and s.id::text = split_part(storage.objects.name, '/', 4)
    where c.school_id = private.current_school_id()
      and c.id::text = split_part(storage.objects.name, '/', 3)
      and private.can_manage_class_subject(c.school_id, c.id, s.id)
  )
);

drop policy if exists lesson_files_orphan_cleanup on storage.objects;
create policy lesson_files_orphan_cleanup on storage.objects
for delete to authenticated
using (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'lessons'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and (
    split_part(name, '/', 5) = (select auth.uid())::text
    or private.current_role() = 'school_admin'
  )
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.school_id = c.school_id
      and s.id::text = split_part(storage.objects.name, '/', 4)
    where c.school_id = private.current_school_id()
      and c.id::text = split_part(storage.objects.name, '/', 3)
      and private.can_manage_class_subject(c.school_id, c.id, s.id)
  )
  and not exists (
    select 1 from public.lesson_plans lp where lp.file_path = storage.objects.name
  )
);
