-- Security Enhancement: IP & Geo-Locking
-- Allows schools to restrict access to specific geographies or IP ranges.

alter table public.schools
add column if not exists allowed_countries text[] default '{}',
add column if not exists restricted_ips text[] default '{}',
add column if not exists security_level text default 'standard'; -- 'standard', 'elevated', 'maximum'

-- Index for faster lookup
create index if not exists idx_schools_security on public.schools(id, security_level);
