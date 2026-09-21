-- Run after the previous migrations. Extends the academic, user-management and reporting model.
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.students add column if not exists date_of_birth date;
alter table public.students add column if not exists gender text;
alter table public.students add column if not exists document_path text;
alter table public.assignments add column if not exists attachment_path text;
alter table public.assignments add column if not exists published_at timestamptz;
alter table public.exams add column if not exists published boolean not null default false;
alter table public.results add column if not exists grade text;
alter table public.results add column if not exists published boolean not null default false;
alter table public.payments add column if not exists receipt_number text;
alter table public.payments add column if not exists payment_method text;
create table if not exists public.class_subjects (id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes(id) on delete cascade,subject_id uuid not null references public.subjects(id) on delete cascade,teacher_id uuid references public.profiles(id),unique(class_id,subject_id));
create table if not exists public.report_cards (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,student_id uuid not null references public.students(id) on delete cascade,term text not null,file_path text,generated_at timestamptz default now());
create table if not exists public.platform_settings (id boolean primary key default true check(id),platform_name text not null default 'SmartSchool',logo_path text,settings jsonb not null default '{}'::jsonb,updated_at timestamptz default now());
insert into public.platform_settings(id) values(true) on conflict do nothing;
alter table public.class_subjects enable row level security;alter table public.report_cards enable row level security;alter table public.platform_settings enable row level security;
create policy "school members class subjects" on public.class_subjects for all using (exists(select 1 from public.classes c where c.id=class_id and public.same_school(c.school_id))) with check (exists(select 1 from public.classes c where c.id=class_id and public.same_school(c.school_id)));
create policy "school members report cards" on public.report_cards for all using (public.same_school(school_id)) with check (public.same_school(school_id));
create policy "super admins manage platform settings" on public.platform_settings for all using (public.is_super_admin()) with check (public.is_super_admin());
-- Create private Storage buckets named student-documents, assignment-files and report-cards in Supabase Storage.
