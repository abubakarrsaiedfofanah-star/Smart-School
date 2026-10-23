-- Storage policies need the same active-account and school checks as table
-- policies because signed-in JWTs can remain valid until expiry.

drop policy if exists assignment_files_student_upload on storage.objects;
create policy assignment_files_student_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'submissions'
  and private.current_role() = 'student'
  and exists (
    select 1 from public.students s
    join public.assignments a on a.id = (storage.foldername(name))[2]::uuid
      and a.school_id = s.school_id and a.class_id = s.class_id
    where s.id = (storage.foldername(name))[3]::uuid
      and s.profile_id = (select auth.uid())
      and s.school_id = private.current_school_id()
      and private.can_view_student(s.id)
      and a.published_at is not null
      and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))
  )
);

drop policy if exists assignment_files_owner_read on storage.objects;
create policy assignment_files_owner_read on storage.objects
for select to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'submissions'
  and private.current_role() = 'student'
  and exists (
    select 1 from public.students s
    join public.assignments a on a.id = (storage.foldername(name))[2]::uuid
      and a.school_id = s.school_id and a.class_id = s.class_id
    where s.id = (storage.foldername(name))[3]::uuid
      and s.profile_id = (select auth.uid())
      and s.school_id = private.current_school_id()
      and private.can_view_student(s.id)
  )
);

drop policy if exists assignment_files_student_update on storage.objects;
create policy assignment_files_student_update on storage.objects
for update to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'submissions'
  and private.current_role() = 'student'
  and exists (
    select 1 from public.students s
    join public.assignments a on a.id = (storage.foldername(name))[2]::uuid
      and a.school_id = s.school_id and a.class_id = s.class_id
    where s.id = (storage.foldername(name))[3]::uuid
      and s.profile_id = (select auth.uid())
      and s.school_id = private.current_school_id()
      and private.can_view_student(s.id)
      and a.published_at is not null
      and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))
  )
) with check (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'submissions'
  and private.current_role() = 'student'
  and exists (
    select 1 from public.students s
    join public.assignments a on a.id = (storage.foldername(name))[2]::uuid
      and a.school_id = s.school_id and a.class_id = s.class_id
    where s.id = (storage.foldername(name))[3]::uuid
      and s.profile_id = (select auth.uid())
      and s.school_id = private.current_school_id()
      and private.can_view_student(s.id)
  )
);

-- Profiles photos are private too. Inactive accounts cannot use an old JWT to
-- fetch, replace, or remove their photo after suspension.
drop policy if exists profile_photos_owner_insert on storage.objects;
create policy profile_photos_owner_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_role() is not null
);

drop policy if exists profile_photos_owner_read on storage.objects;
create policy profile_photos_owner_read on storage.objects
for select to authenticated using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_role() is not null
);

drop policy if exists profile_photos_owner_delete on storage.objects;
create policy profile_photos_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.current_role() is not null
);
