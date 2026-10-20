-- Store each school's mission and vision alongside its existing branding.
-- Apply after migrations 001-079.
alter table public.schools
  add column if not exists mission text not null default '',
  add column if not exists vision text not null default '';
