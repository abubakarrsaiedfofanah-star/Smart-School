-- New table for Behavior Tracking
create table if not exists public.behavior_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('merit', 'demerit')),
  points integer not null default 1,
  category text not null, -- e.g., 'Helpfulness', 'Lateness', 'Participation'
  comment text,
  created_at timestamptz default now()
);

-- Security for behavior_records
alter table public.behavior_records enable row level security;

create policy "school members view behavior"
on public.behavior_records for select
using (public.same_school(school_id));

create policy "teachers manage behavior"
on public.behavior_records for all
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('teacher', 'school_admin')
    and school_id = public.behavior_records.school_id
  )
);
