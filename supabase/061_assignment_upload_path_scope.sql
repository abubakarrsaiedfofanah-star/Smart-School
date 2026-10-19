-- Replacing an owned storage object must preserve the same valid
-- student/assignment/class relationship enforced during the original upload.
drop policy if exists assignment_files_student_update on storage.objects;
create policy assignment_files_student_update on storage.objects for update to authenticated
using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'submissions'
  and exists (
    select 1 from public.students s
    join public.assignments a on a.id = (storage.foldername(name))[2]::uuid
      and a.school_id = s.school_id and a.class_id = s.class_id
    where s.id = (storage.foldername(name))[3]::uuid
      and s.profile_id = (select auth.uid())
      and a.published_at is not null
      and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))
  )
)
with check (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'submissions'
  and exists (
    select 1 from public.students s
    join public.assignments a on a.id = (storage.foldername(name))[2]::uuid
      and a.school_id = s.school_id and a.class_id = s.class_id
    where s.id = (storage.foldername(name))[3]::uuid
      and s.profile_id = (select auth.uid())
      and a.published_at is not null
      and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))
  )
);
