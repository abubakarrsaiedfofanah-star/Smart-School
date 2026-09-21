-- Wellbeing Reports Table
create table if not exists public.wellbeing_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  type text not null, -- 'Bullying', 'Stress', 'Personal', 'General'
  severity text default 'Low', -- 'Low', 'Medium', 'High', 'Critical'
  body text not null,
  is_anonymous boolean default false,
  status text default 'new', -- 'new', 'in-progress', 'resolved'
  created_at timestamptz default now()
);

-- Counseling Notes (Private to Counselor/Admin)
create table if not exists public.counseling_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.wellbeing_reports(id) on delete cascade,
  counselor_id uuid references public.profiles(id) on delete set null,
  note text not null,
  created_at timestamptz default now()
);

alter table public.wellbeing_reports enable row level security;
alter table public.counseling_notes enable row level security;

-- Privacy Rules
create policy "students view/create own reports" on public.wellbeing_reports for all
using (student_id in (select id from public.students where profile_id = auth.uid()))
with check (student_id in (select id from public.students where profile_id = auth.uid()));

create policy "counselors view all reports" on public.wellbeing_reports for all
using (exists (select 1 from public.profiles where id = auth.uid() and role in ('school_admin', 'teacher')));

create policy "only counselors view notes" on public.counseling_notes for all
using (exists (select 1 from public.profiles where id = auth.uid() and role in ('school_admin', 'teacher')));
