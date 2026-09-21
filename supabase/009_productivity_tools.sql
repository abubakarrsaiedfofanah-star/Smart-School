-- New table for Parent-Teacher Meetings
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null, -- Null if slot is open
  student_id uuid references public.students(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'available', -- 'available', 'booked', 'cancelled', 'completed'
  meeting_link text, -- For virtual meetings
  notes text,
  created_at timestamptz default now()
);

-- Security for meetings
alter table public.meetings enable row level security;

create policy "school members view meetings"
on public.meetings for select
using (public.same_school(school_id));

create policy "teachers manage own meeting slots"
on public.meetings for all
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

create policy "parents book available slots"
on public.meetings for update
using (
  status = 'available'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'parent'
    and school_id = public.meetings.school_id
  )
);
