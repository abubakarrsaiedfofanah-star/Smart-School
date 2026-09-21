-- New tables for Quiz, Badges, and Broadcasts

-- MCQ Quiz Engine
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  time_limit_minutes integer default 30,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  options jsonb not null, -- Array of strings
  correct_option_index integer not null,
  points integer default 1
);

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric not null,
  total_points integer not null,
  taken_at timestamptz default now()
);

-- Achievements / Badges
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  icon text not null, -- Emoji or URL
  description text
);

create table if not exists public.student_badges (
  student_id uuid not null references public.students(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz default now(),
  primary key(student_id, badge_id)
);

-- Broadcasts
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null, -- null for school-wide
  sender_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  created_at timestamptz default now()
);

-- Security
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_results enable row level security;
alter table public.badges enable row level security;
alter table public.student_badges enable row level security;
alter table public.broadcasts enable row level security;

create policy "school members quizzes" on public.quizzes for all using (public.same_school(school_id)) with check (public.same_school(school_id));
create policy "school members questions" on public.quiz_questions for all using (exists (select 1 from public.quizzes where id = quiz_id and public.same_school(school_id)));
create policy "school members quiz_results" on public.quiz_results for all using (exists (select 1 from public.quizzes where id = quiz_id and public.same_school(school_id)));
create policy "school members badges" on public.badges for all using (public.same_school(school_id)) with check (public.same_school(school_id));
create policy "school members student_badges" on public.student_badges for all using (exists (select 1 from public.students where id = student_id and public.same_school(school_id)));
create policy "school members broadcasts" on public.broadcasts for all using (public.same_school(school_id)) with check (public.same_school(school_id));
