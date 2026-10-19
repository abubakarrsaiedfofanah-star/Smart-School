-- Only school administrators, principals, and librarians can publish library
-- resources. All school members with portal access can read their school's files.

drop policy if exists "school members resources" on public.resources;
drop policy if exists resources_read_school on public.resources;
drop policy if exists resources_staff_insert on public.resources;
drop policy if exists resources_staff_update on public.resources;
drop policy if exists resources_staff_delete on public.resources;

create policy resources_read_school on public.resources
for select to authenticated
using (school_id = private.current_school_id());

create policy resources_staff_insert on public.resources
for insert to authenticated
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.library.manage')
  and uploaded_by = (select auth.uid())
  and (subject_id is null or exists (
    select 1 from public.subjects s where s.id = resources.subject_id and s.school_id = resources.school_id
  ))
);

create policy resources_staff_update on public.resources
for update to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.library.manage')
)
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.library.manage')
  and (subject_id is null or exists (
    select 1 from public.subjects s where s.id = resources.subject_id and s.school_id = resources.school_id
  ))
);

create policy resources_staff_delete on public.resources
for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.library.manage')
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'resources', 'resources', false, 52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists school_library_files_read on storage.objects;
create policy school_library_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = private.current_school_id()::text
);

drop policy if exists school_library_files_insert on storage.objects;
create policy school_library_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and private.has_school_permission(private.current_school_id(), 'school.library.manage')
);

drop policy if exists school_library_files_delete on storage.objects;
create policy school_library_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and private.has_school_permission(private.current_school_id(), 'school.library.manage')
);
