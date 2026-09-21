-- Add primary color field to schools table
alter table public.schools
add column if not exists primary_color text default '#2375e1';

-- Allow admins to update their brand color
-- (Policy already exists for school_admin to update their school)
