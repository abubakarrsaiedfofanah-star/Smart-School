-- New tables for Enterprise features

-- Timetable
create table if not exists public.timetable (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  day_of_week integer not null check (day_of_week between 1 and 5), -- 1: Mon, 5: Fri
  start_time time not null,
  end_time time not null,
  room_number text,
  created_at timestamptz default now()
);

-- Resources (Library)
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  file_path text not null,
  file_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Security
alter table public.timetable enable row level security;
alter table public.resources enable row level security;

create policy "school members timetable" on public.timetable for all using (public.same_school(school_id)) with check (public.same_school(school_id));
create policy "school members resources" on public.resources for all using (public.same_school(school_id)) with check (public.same_school(school_id));
