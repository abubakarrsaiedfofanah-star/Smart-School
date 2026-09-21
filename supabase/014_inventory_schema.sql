-- Asset & Inventory Table
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  category text, -- 'Electronics', 'Furniture', 'Sports', 'Lab'
  serial_number text,
  status text default 'available', -- 'available', 'assigned', 'maintenance', 'lost'
  assigned_to uuid references public.profiles(id) on delete set null,
  purchase_date date,
  value numeric,
  created_at timestamptz default now()
);

alter table public.assets enable row level security;

create policy "school members view assets" on public.assets for select
using (public.same_school(school_id));

create policy "admins manage assets" on public.assets for all
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'))
with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'));
