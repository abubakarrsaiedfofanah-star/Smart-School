-- 1. Subject Assignment Enhancement
-- Link teachers to multiple subjects they teach
create table if not exists public.teacher_subject_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz default now(),
  unique(teacher_id, subject_id, class_id)
);

-- 2. Security for Assignments
alter table public.teacher_subject_assignments enable row level security;

create policy "school members view assignments" on public.teacher_subject_assignments for select using (public.same_school(school_id));
create policy "admins manage assignments" on public.teacher_subject_assignments for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'));

-- 3. Extend Results to include Subject ID for better filtering
alter table public.results add column if not exists subject_id uuid references public.subjects(id) on delete set null;

-- 4. Tighten Gradebook Security further
-- Only allow grading if the teacher is assigned to that specific Subject + Class combination
drop policy if exists "teachers manage own class results" on public.results;

create policy "teachers manage assigned subjects" on public.results for all
using (
  exists (
    select 1 from public.teacher_subject_assignments tsa
    where tsa.teacher_id = auth.uid()
    and tsa.subject_id = public.results.subject_id
    and tsa.class_id = (select class_id from public.students where id = public.results.student_id)
  ) or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'school_admin'
  )
);
