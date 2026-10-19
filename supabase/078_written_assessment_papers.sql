-- Add private downloadable question papers for written assessments.
alter table public.quizzes
  add column if not exists delivery_mode text not null default 'interactive',
  add column if not exists question_file_path text,
  add column if not exists question_file_name text,
  add column if not exists question_file_mime_type text;

alter table public.quizzes drop constraint if exists quizzes_delivery_mode_check;
alter table public.quizzes add constraint quizzes_delivery_mode_check
  check (delivery_mode in ('interactive', 'written_paper'));

alter table public.quizzes drop constraint if exists quizzes_question_file_metadata_check;
alter table public.quizzes add constraint quizzes_question_file_metadata_check
  check (
    (question_file_path is null and question_file_name is null and question_file_mime_type is null)
    or (question_file_path is not null and question_file_name is not null and question_file_mime_type is not null)
  );

alter table public.quizzes drop constraint if exists quizzes_paper_file_mode_check;
alter table public.quizzes add constraint quizzes_paper_file_mode_check
  check (delivery_mode = 'written_paper' or question_file_path is null);

alter table public.quizzes drop constraint if exists quizzes_question_file_path_scope_check;
alter table public.quizzes add constraint quizzes_question_file_path_scope_check
  check (question_file_path is null or question_file_path like (school_id::text || '/' || id::text || '/%'));

alter table public.quizzes drop constraint if exists quizzes_published_paper_has_file_check;
alter table public.quizzes add constraint quizzes_published_paper_has_file_check
  check (not published or delivery_mode <> 'written_paper' or question_file_path is not null);

create or replace function public.prevent_questions_on_written_paper()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.quizzes q
    where q.id = new.quiz_id and q.delivery_mode = 'written_paper'
  ) then
    raise exception 'Written paper assessments use a downloadable file instead of interactive questions.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_questions_on_written_paper on public.quiz_questions;
create trigger prevent_questions_on_written_paper
before insert or update of quiz_id on public.quiz_questions
for each row execute function public.prevent_questions_on_written_paper();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'assessment-papers', 'assessment-papers', false, 52428800,
  array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/rtf', 'text/rtf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists assessment_paper_file_read on storage.objects;
create policy assessment_paper_file_read on storage.objects
for select to authenticated using (
  bucket_id = 'assessment-papers'
  and exists (
    select 1 from public.quizzes q
    where q.question_file_path = storage.objects.name
      and q.school_id = private.current_school_id()
      and q.delivery_mode = 'written_paper'
      and (
        private.current_role() = 'school_admin'
        or (private.current_role() = 'teacher' and (
          q.created_by = (select auth.uid())
          or exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id and (q.class_id is null or tsa.class_id = q.class_id)
          )
        ))
        or (private.current_role() = 'student' and q.published
          and (q.class_id is null or private.can_view_class(q.class_id)))
      )
  )
);

drop policy if exists assessment_paper_file_upload on storage.objects;
create policy assessment_paper_file_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'assessment-papers'
  and (storage.foldername(name))[1] = private.current_school_id()::text
  and exists (
    select 1 from public.quizzes q
    where q.id::text = (storage.foldername(name))[2]
      and q.school_id = private.current_school_id()
      and q.delivery_mode = 'written_paper'
      and q.created_by = (select auth.uid())
      and (
        private.current_role() = 'school_admin'
        or (private.current_role() = 'teacher' and exists (
          select 1 from public.teacher_subject_assignments tsa
          where tsa.school_id = q.school_id and tsa.teacher_id = (select auth.uid())
            and tsa.subject_id = q.subject_id and (q.class_id is null or tsa.class_id = q.class_id)
        ))
      )
  )
);

drop policy if exists assessment_paper_file_delete on storage.objects;
create policy assessment_paper_file_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'assessment-papers'
  and exists (
    select 1 from public.quizzes q
    where q.id::text = (storage.foldername(name))[2]
      and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin'
        or (private.current_role() = 'teacher' and q.created_by = (select auth.uid())))
  )
);
