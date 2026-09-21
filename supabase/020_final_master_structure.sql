-- 1. Individual Teacher Signatures
alter table public.profiles add column if not exists signature_url text;

-- 2. Lesson Plans & Academic Notes
create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  title text not null,
  content text,
  file_path text, -- PDF or document link
  is_public boolean default true,
  created_at timestamptz default now()
);

-- 3. Link Teachers to Subjects (Many-to-Many or Single)
-- We already have subjects and profiles. Let's ensure teachers are tied to subjects.
-- If not exists, create a mapping table for flexibility.
create table if not exists public.teacher_subjects (
  teacher_id uuid references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  primary key(teacher_id, subject_id)
);

-- 4. Security
alter table public.lesson_plans enable row level security;
alter table public.teacher_subjects enable row level security;

create policy "school members view lesson plans" on public.lesson_plans for select using (public.same_school(school_id));
create policy "teachers manage own lesson plans" on public.lesson_plans for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "school members view teacher subjects" on public.teacher_subjects for select using (true);
create policy "admins manage teacher subjects" on public.teacher_subjects for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'));
