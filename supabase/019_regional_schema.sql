-- Add Region field to schools
alter table public.schools add column if not exists region text default 'Central';

-- Update some schools for demo
update public.schools set region = 'Nairobi' where name ilike '%Green Valley%';
update public.schools set region = 'Mombasa' where name ilike '%Bright Future%';
