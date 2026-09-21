-- 1. Bus Routes Table
create table if not exists public.bus_routes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  route_name text not null,
  driver_id uuid references public.profiles(id) on delete set null,
  vehicle_number text,
  status text default 'inactive', -- 'active', 'inactive'
  last_lat numeric,
  last_lng numeric,
  last_updated timestamptz default now()
);

-- 2. Bus Logs (History of trips)
create table if not exists public.bus_logs (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references public.bus_routes(id) on delete cascade,
  log_type text not null, -- 'TRIP_START', 'TRIP_END', 'LOCATION_UPDATE'
  lat numeric,
  lng numeric,
  created_at timestamptz default now()
);

-- 3. Student Verified Credentials (Certificates)
create table if not exists public.verified_credentials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  credential_type text not null, -- 'COURSE_COMPLETION', 'GRADUATION'
  validation_hash text unique not null,
  issued_at timestamptz default now(),
  issued_by uuid references public.profiles(id)
);

-- 4. Security
alter table public.bus_routes enable row level security;
alter table public.bus_logs enable row level security;
alter table public.verified_credentials enable row level security;

create policy "school members view bus" on public.bus_routes for select using (public.same_school(school_id));
create policy "drivers manage bus" on public.bus_routes for all using (driver_id = auth.uid());

create policy "school members view logs" on public.bus_logs for select using (exists (select 1 from public.bus_routes where id = route_id and public.same_school(school_id)));
create policy "drivers insert logs" on public.bus_logs for insert with check (exists (select 1 from public.bus_routes where id = route_id and driver_id = auth.uid()));

create policy "anyone verify credential" on public.verified_credentials for select using (true);
create policy "school staff issue credentials" on public.verified_credentials for insert with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'school_admin')));
