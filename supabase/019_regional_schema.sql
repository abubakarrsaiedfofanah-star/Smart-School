-- Add Region field to schools
alter table public.schools add column if not exists region text;
