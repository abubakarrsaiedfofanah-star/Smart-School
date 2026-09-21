-- Add branding fields to schools table
alter table public.schools
add column if not exists logo_url text,
add column if not exists principal_signature_url text,
add column if not exists teacher_signature_url text,
add column if not exists school_motto text;

-- Policy to allow school admins to update their own school details
create policy "school admins update their school"
on public.schools
for update
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'school_admin'
    and school_id = public.schools.id
  )
);
