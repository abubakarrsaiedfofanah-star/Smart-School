-- 1. Courses Table
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  thumbnail_url text,
  is_published boolean default false,
  created_at timestamptz default now()
);

-- 2. Course Chapters Table
create table if not exists public.course_chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  content_body text, -- Text/HTML content
  video_url text,
  file_path text, -- Attachment
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- 3. Course Progress Table
create table if not exists public.course_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  chapter_id uuid not null references public.course_chapters(id) on delete cascade,
  completed_at timestamptz default now(),
  primary key(student_id, chapter_id)
);

-- 4. Security
alter table public.courses enable row level security;
alter table public.course_chapters enable row level security;
alter table public.course_progress enable row level security;

create policy "school members view courses" on public.courses for select using (public.same_school(school_id));
create policy "teachers manage courses" on public.courses for all using (exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'school_admin')) and public.same_school(school_id));

create policy "school members view chapters" on public.course_chapters for select using (exists (select 1 from public.courses where id = course_id and public.same_school(school_id)));
create policy "teachers manage chapters" on public.course_chapters for all using (exists (select 1 from public.courses where id = course_id and exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'school_admin'))));

create policy "students track progress" on public.course_progress for all using (student_id in (select id from public.students where profile_id = auth.uid()));
