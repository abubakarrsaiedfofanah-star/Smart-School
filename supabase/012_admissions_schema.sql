-- Admission CRM Table
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_first_name text not null,
  student_last_name text not null,
  date_of_birth date not null,
  grade_level text not null,
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  status text not null default 'pending', -- 'pending', 'interview', 'accepted', 'rejected', 'enrolled'
  notes text,
  created_at timestamptz default now()
);

alter table public.applications enable row level security;

-- Public can insert (Apply)
create policy "public may apply" on public.applications for insert with check (true);

-- Admins manage applications
create policy "admins manage applications" on public.applications for all
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'school_admin'
    and school_id = public.applications.school_id
  )
);
