-- SmartSchool complete Supabase setup
-- Includes schema.sql and numbered migrations 002-079 in order.
-- Run once in the SQL Editor of a NEW Supabase project.
-- Do not run over a database that already has any of these migrations applied.
-- Review README.md for required Edge Functions, Auth configuration, and secret setup.


-- ============================================================================
-- BEGIN supabase/schema.sql
-- ============================================================================

create extension if not exists pgcrypto;
create type public.user_role as enum ('super_admin','school_admin','teacher','student','parent');
create type public.school_status as enum ('pending','active','suspended','rejected');
create type public.attendance_status as enum ('present','absent','late','excused');
create table public.schools (id uuid primary key default gen_random_uuid(),name text not null,slug text unique not null,email text,phone text,address text,school_level text default 'both',subscription_plan text default 'Starter',status public.school_status not null default 'pending',created_at timestamptz default now());
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade,school_id uuid references public.schools(id) on delete set null,full_name text,phone text,role public.user_role not null default 'student',created_at timestamptz default now());
create table public.classes (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,name text not null,grade text,teacher_id uuid references public.profiles(id),created_at timestamptz default now());
create table public.subjects (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,name text not null,code text,created_at timestamptz default now());
create table public.students (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,profile_id uuid unique references public.profiles(id) on delete set null,admission_number text, class_id uuid references public.classes(id),created_at timestamptz default now(),unique(school_id,admission_number));
create table public.attendance (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,student_id uuid not null references public.students(id) on delete cascade,class_id uuid references public.classes(id),attendance_date date not null default current_date,status public.attendance_status not null,recorded_by uuid references public.profiles(id),unique(student_id,attendance_date));
create table public.assignments (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,class_id uuid references public.classes(id),subject_id uuid references public.subjects(id),title text not null,instructions text,due_date date,created_by uuid references public.profiles(id),created_at timestamptz default now());
create table public.exams (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,class_id uuid references public.classes(id),subject_id uuid references public.subjects(id),name text not null,exam_date date,max_score numeric default 100);
create table public.results (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,exam_id uuid not null references public.exams(id) on delete cascade,student_id uuid not null references public.students(id) on delete cascade,score numeric,remarks text,unique(exam_id,student_id));
create table public.fees (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,name text not null,amount numeric not null,due_date date,created_at timestamptz default now());
create table public.payments (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,student_id uuid references public.students(id),fee_id uuid references public.fees(id),amount numeric not null,reference text,status text default 'pending',paid_at timestamptz);
create table public.announcements (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,title text not null,body text,created_by uuid references public.profiles(id),created_at timestamptz default now());
create table public.events (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,title text not null,description text,event_date timestamptz not null,created_at timestamptz default now());
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,school_id,full_name,phone,role) values(new.id,nullif(new.raw_user_meta_data->>'school_id','')::uuid,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone',coalesce(nullif(new.raw_user_meta_data->>'role','')::public.user_role,'student')); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create or replace function public.same_school(target_school uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and (role='super_admin' or school_id=target_school)); $$;
alter table public.schools enable row level security; alter table public.profiles enable row level security; alter table public.classes enable row level security; alter table public.subjects enable row level security; alter table public.students enable row level security; alter table public.attendance enable row level security; alter table public.assignments enable row level security; alter table public.exams enable row level security; alter table public.results enable row level security; alter table public.fees enable row level security; alter table public.payments enable row level security; alter table public.announcements enable row level security; alter table public.events enable row level security;
create policy "public may register schools" on public.schools for insert with check (true); create policy "members view their school" on public.schools for select using (public.same_school(id)); create policy "members view profiles" on public.profiles for select using (public.same_school(school_id)); create policy "users update own profile" on public.profiles for update using (id=auth.uid());
create policy "school members classes" on public.classes for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members subjects" on public.subjects for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members students" on public.students for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members attendance" on public.attendance for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members assignments" on public.assignments for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members exams" on public.exams for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members results" on public.results for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members fees" on public.fees for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members payments" on public.payments for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members announcements" on public.announcements for all using (public.same_school(school_id)) with check (public.same_school(school_id)); create policy "school members events" on public.events for all using (public.same_school(school_id)) with check (public.same_school(school_id));

-- END supabase/schema.sql


-- ============================================================================
-- BEGIN supabase/002_extended_modules.sql
-- ============================================================================

-- Run after schema.sql. Adds relationship, submission, messaging and subscription records.
create table if not exists public.student_guardians (student_id uuid not null references public.students(id) on delete cascade,guardian_id uuid not null references public.profiles(id) on delete cascade,relationship text,primary key(student_id,guardian_id));
create table if not exists public.submissions (id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.assignments(id) on delete cascade,student_id uuid not null references public.students(id) on delete cascade,content text,file_path text,score numeric,feedback text,submitted_at timestamptz default now(),unique(assignment_id,student_id));
create table if not exists public.messages (id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id) on delete cascade,sender_id uuid references public.profiles(id),recipient_id uuid references public.profiles(id),body text not null,read_at timestamptz,created_at timestamptz default now());
create table if not exists public.subscriptions (id uuid primary key default gen_random_uuid(),school_id uuid not null unique references public.schools(id) on delete cascade,plan text not null,status text not null default 'trial',starts_at timestamptz default now(),ends_at timestamptz);
alter table public.student_guardians enable row level security; alter table public.submissions enable row level security; alter table public.messages enable row level security; alter table public.subscriptions enable row level security;
create policy "school members messages" on public.messages for all using (public.same_school(school_id)) with check (public.same_school(school_id));
create policy "school members subscriptions" on public.subscriptions for all using (public.same_school(school_id)) with check (public.same_school(school_id));

-- END supabase/002_extended_modules.sql


-- ============================================================================
-- BEGIN supabase/003_platform_controls.sql
-- ============================================================================

-- Run after schema.sql and 002_extended_modules.sql.
-- Super Admin workflow: pending schools can be approved, rejected or suspended.
create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='super_admin'); $$;
create or replace function public.review_school(target_school uuid,new_status public.school_status) returns public.schools language plpgsql security definer set search_path=public as $$ declare updated_school public.schools; begin if not public.is_super_admin() then raise exception 'Only Super Admins can review schools'; end if; update public.schools set status=new_status where id=target_school returning * into updated_school; if updated_school.id is null then raise exception 'School not found'; end if; return updated_school; end; $$;
grant execute on function public.review_school(uuid,public.school_status) to authenticated;
create policy "school members guardians" on public.student_guardians for select using (exists(select 1 from public.students s where s.id=student_id and public.same_school(s.school_id)));
create policy "school members submissions" on public.submissions for all using (exists(select 1 from public.assignments a where a.id=assignment_id and public.same_school(a.school_id))) with check (exists(select 1 from public.assignments a where a.id=assignment_id and public.same_school(a.school_id)));

-- END supabase/003_platform_controls.sql


-- ============================================================================
-- BEGIN supabase/004_academic_management.sql
-- ============================================================================

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

-- END supabase/004_academic_management.sql


-- ============================================================================
-- BEGIN supabase/005_security_hardening.sql
-- ============================================================================

-- Run after schema.sql and the module migrations.
-- Keep public registration limited to valid pending school records.
drop policy if exists "public may register schools" on public.schools;
create policy "public may register pending schools" on public.schools
  for insert with check (
    status = 'pending'
    and length(trim(name)) between 2 and 160
    and (email is null or length(email) <= 254)
    and (phone is null or length(phone) <= 40)
    and subscription_plan in ('Starter', 'Professional', 'Enterprise')
  );

-- Never trust a client-provided role. Registration may create only a school admin
-- for a pending school; every other client-created profile is a student.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.user_role := 'student';
  requested_school uuid;
begin
  requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
  if (new.raw_user_meta_data->>'role') = 'school_admin'
     and requested_school is not null
     and exists (select 1 from public.schools where id = requested_school and status = 'pending') then
    requested_role := 'school_admin';
  else
    requested_school := null;
  end if;

  insert into public.profiles(id, school_id, full_name, phone, role)
  values (
    new.id,
    requested_school,
    left(new.raw_user_meta_data->>'full_name', 160),
    left(new.raw_user_meta_data->>'phone', 40),
    requested_role
  );
  return new;
end;
$$;

-- Subscriptions are platform data and should not be exposed without membership.
alter table if exists public.subscriptions enable row level security;
drop policy if exists "members view subscriptions" on public.subscriptions;
create policy "members view subscriptions" on public.subscriptions
  for select using (public.same_school(school_id));

-- END supabase/005_security_hardening.sql


-- ============================================================================
-- BEGIN supabase/006_timetable_and_resources.sql
-- ============================================================================

-- New tables for Enterprise features

-- Timetable
create table if not exists public.timetable (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  day_of_week integer not null check (day_of_week between 1 and 5), -- 1: Mon, 5: Fri
  start_time time not null,
  end_time time not null,
  room_number text,
  created_at timestamptz default now()
);

-- Resources (Library)
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  file_path text not null,
  file_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- Security
alter table public.timetable enable row level security;
alter table public.resources enable row level security;

create policy "school members timetable" on public.timetable for all using (public.same_school(school_id)) with check (public.same_school(school_id));
create policy "school members resources" on public.resources for all using (public.same_school(school_id)) with check (public.same_school(school_id));

-- END supabase/006_timetable_and_resources.sql


-- ============================================================================
-- BEGIN supabase/007_school_branding.sql
-- ============================================================================

-- Add branding fields to schools table
alter table public.schools
add column if not exists logo_url text,
add column if not exists principal_signature_url text,
add column if not exists teacher_signature_url text,
add column if not exists school_motto text,
add column if not exists mission text not null default '',
add column if not exists vision text not null default '';

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

-- END supabase/007_school_branding.sql


-- ============================================================================
-- BEGIN supabase/008_ecosystem_expansion.sql
-- ============================================================================

-- New tables for Quiz, Badges, and Broadcasts

-- MCQ Quiz Engine
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  time_limit_minutes integer default 30,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  options jsonb not null, -- Array of strings
  correct_option_index integer not null,
  points integer default 1
);

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  score numeric not null,
  total_points integer not null,
  taken_at timestamptz default now()
);

-- Achievements / Badges
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  icon text not null, -- Emoji or URL
  description text
);

create table if not exists public.student_badges (
  student_id uuid not null references public.students(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz default now(),
  primary key(student_id, badge_id)
);

-- Broadcasts
create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null, -- null for school-wide
  sender_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  created_at timestamptz default now()
);

-- Security
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_results enable row level security;
alter table public.badges enable row level security;
alter table public.student_badges enable row level security;
alter table public.broadcasts enable row level security;

create policy "school members quizzes" on public.quizzes for all using (public.same_school(school_id)) with check (public.same_school(school_id));
create policy "school members questions" on public.quiz_questions for all using (exists (select 1 from public.quizzes where id = quiz_id and public.same_school(school_id)));
create policy "school members quiz_results" on public.quiz_results for all using (exists (select 1 from public.quizzes where id = quiz_id and public.same_school(school_id)));
create policy "school members badges" on public.badges for all using (public.same_school(school_id)) with check (public.same_school(school_id));
create policy "school members student_badges" on public.student_badges for all using (exists (select 1 from public.students where id = student_id and public.same_school(school_id)));
create policy "school members broadcasts" on public.broadcasts for all using (public.same_school(school_id)) with check (public.same_school(school_id));

-- END supabase/008_ecosystem_expansion.sql


-- ============================================================================
-- BEGIN supabase/009_productivity_tools.sql
-- ============================================================================

-- New table for Parent-Teacher Meetings
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null, -- Null if slot is open
  student_id uuid references public.students(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'available', -- 'available', 'booked', 'cancelled', 'completed'
  meeting_link text, -- For virtual meetings
  notes text,
  created_at timestamptz default now()
);

-- Security for meetings
alter table public.meetings enable row level security;

create policy "school members view meetings"
on public.meetings for select
using (public.same_school(school_id));

create policy "teachers manage own meeting slots"
on public.meetings for all
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

create policy "parents book available slots"
on public.meetings for update
using (
  status = 'available'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'parent'
    and school_id = public.meetings.school_id
  )
);

-- END supabase/009_productivity_tools.sql


-- ============================================================================
-- BEGIN supabase/010_behavioral_schema.sql
-- ============================================================================

-- New table for Behavior Tracking
create table if not exists public.behavior_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('merit', 'demerit')),
  points integer not null default 1,
  category text not null, -- e.g., 'Helpfulness', 'Lateness', 'Participation'
  comment text,
  created_at timestamptz default now()
);

-- Security for behavior_records
alter table public.behavior_records enable row level security;

create policy "school members view behavior"
on public.behavior_records for select
using (public.same_school(school_id));

create policy "teachers manage behavior"
on public.behavior_records for all
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('teacher', 'school_admin')
    and school_id = public.behavior_records.school_id
  )
);

-- END supabase/010_behavioral_schema.sql


-- ============================================================================
-- BEGIN supabase/011_fortress_security.sql
-- ============================================================================

-- 1. Security Audit Logs Table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz default now()
);

-- 2. Trigger Function to Log Changes
create or replace function public.log_table_change()
returns trigger as $$
begin
  insert into public.audit_logs (school_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (
    case when TG_OP = 'DELETE' then OLD.school_id else NEW.school_id end,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then OLD.id else NEW.id end,
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end
  );
  return null;
end;
$$ language plpgsql security definer;

-- Attach triggers to sensitive tables
create trigger audit_results after insert or update or delete on public.results for each row execute procedure public.log_table_change();
create trigger audit_payments after insert or update or delete on public.payments for each row execute procedure public.log_table_change();
create trigger audit_profiles after update or delete on public.profiles for each row execute procedure public.log_table_change();

-- 3. Granular Privacy Policies (RLS Tightening)
-- Results: Students only see their own, Teachers see school's
drop policy if exists "school members results" on public.results;
create policy "students view own results" on public.results for select using (
  exists (select 1 from public.students where id = student_id and profile_id = auth.uid())
);
create policy "staff manage results" on public.results for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'school_admin'))
  and public.same_school(school_id)
);

-- Payments: Parents only see their children's, Admins see school's
drop policy if exists "school members payments" on public.payments;
create policy "parents view children payments" on public.payments for select using (
  exists (select 1 from public.student_guardians where student_id = public.payments.student_id and guardian_id = auth.uid())
);
create policy "admins manage payments" on public.payments for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin')
  and public.same_school(school_id)
);

-- 4. Audit Log Permissions
alter table public.audit_logs enable row level security;
create policy "super admins view all logs" on public.audit_logs for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
);
create policy "school admins view school logs" on public.audit_logs for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin' and school_id = public.audit_logs.school_id)
);

-- END supabase/011_fortress_security.sql


-- ============================================================================
-- BEGIN supabase/012_admissions_schema.sql
-- ============================================================================

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

-- END supabase/012_admissions_schema.sql


-- ============================================================================
-- BEGIN supabase/013_wellbeing_schema.sql
-- ============================================================================

-- Wellbeing Reports Table
create table if not exists public.wellbeing_reports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  type text not null, -- 'Bullying', 'Stress', 'Personal', 'General'
  severity text default 'Low', -- 'Low', 'Medium', 'High', 'Critical'
  body text not null,
  is_anonymous boolean default false,
  status text default 'new', -- 'new', 'in-progress', 'resolved'
  created_at timestamptz default now()
);

-- Counseling Notes (Private to Counselor/Admin)
create table if not exists public.counseling_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.wellbeing_reports(id) on delete cascade,
  counselor_id uuid references public.profiles(id) on delete set null,
  note text not null,
  created_at timestamptz default now()
);

alter table public.wellbeing_reports enable row level security;
alter table public.counseling_notes enable row level security;

-- Privacy Rules
create policy "students view/create own reports" on public.wellbeing_reports for all
using (student_id in (select id from public.students where profile_id = auth.uid()))
with check (student_id in (select id from public.students where profile_id = auth.uid()));

create policy "counselors view all reports" on public.wellbeing_reports for all
using (exists (select 1 from public.profiles where id = auth.uid() and role in ('school_admin', 'teacher')));

create policy "only counselors view notes" on public.counseling_notes for all
using (exists (select 1 from public.profiles where id = auth.uid() and role in ('school_admin', 'teacher')));

-- END supabase/013_wellbeing_schema.sql


-- ============================================================================
-- BEGIN supabase/014_inventory_schema.sql
-- ============================================================================

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

-- END supabase/014_inventory_schema.sql


-- ============================================================================
-- BEGIN supabase/015_school_payment_accounts.sql
-- ============================================================================

-- Add payment account fields to schools
alter table public.schools
add column if not exists mpesa_paybill text,
add column if not exists mpesa_till text,
add column if not exists bank_name text,
add column if not exists bank_account_name text,
add column if not exists bank_account_number text;

-- END supabase/015_school_payment_accounts.sql


-- ============================================================================
-- BEGIN supabase/016_courseware_schema.sql
-- ============================================================================

-- 1. Courses Table
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  teacher_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  thumbnail_url text,
  is_published boolean default false,
  created_at timestamptz default now()
);

-- 2. Course Chapters Table
create table if not exists public.course_chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  content_body text, -- Text/HTML content
  video_url text,
  file_path text, -- Attachment
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- 3. Course Progress Table
create table if not exists public.course_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  chapter_id uuid not null references public.course_chapters(id) on delete cascade,
  completed_at timestamptz default now(),
  primary key(student_id, chapter_id)
);

-- 4. Security
alter table public.courses enable row level security;
alter table public.course_chapters enable row level security;
alter table public.course_progress enable row level security;

create policy "school members view courses" on public.courses for select using (public.same_school(school_id));
create policy "teachers manage courses" on public.courses for all using (exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'school_admin')) and public.same_school(school_id));

create policy "school members view chapters" on public.course_chapters for select using (exists (select 1 from public.courses where id = course_id and public.same_school(school_id)));
create policy "teachers manage chapters" on public.course_chapters for all using (exists (select 1 from public.courses where id = course_id and exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'school_admin'))));

create policy "students track progress" on public.course_progress for all using (student_id in (select id from public.students where profile_id = auth.uid()));

-- END supabase/016_courseware_schema.sql


-- ============================================================================
-- BEGIN supabase/017_mobility_schema.sql
-- ============================================================================

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

-- END supabase/017_mobility_schema.sql


-- ============================================================================
-- BEGIN supabase/018_notifications_schema.sql
-- ============================================================================

-- Notifications Table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text default 'general', -- 'academic', 'financial', 'behavioral', 'general'
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Security
alter table public.notifications enable row level security;

create policy "users view own notifications"
on public.notifications for select
using (user_id = auth.uid());

create policy "users update own notifications"
on public.notifications for update
using (user_id = auth.uid());

-- Automatic triggers for notifications
-- Example: Notify on new behavior record
create or replace function public.notify_behavior_change()
returns trigger as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  values (
    new.school_id,
    (select profile_id from public.students where id = new.student_id),
    'New Behavior Record: ' || upper(new.type),
    'Category: ' || new.category || '. Comment: ' || new.comment,
    'behavioral'
  );
  return null;
end;
$$ language plpgsql security definer;

create trigger tr_notify_behavior after insert on public.behavior_records for each row execute procedure public.notify_behavior_change();

-- END supabase/018_notifications_schema.sql


-- ============================================================================
-- BEGIN supabase/019_regional_schema.sql
-- ============================================================================

-- Add Region field to schools
alter table public.schools add column if not exists region text;

-- END supabase/019_regional_schema.sql


-- ============================================================================
-- BEGIN supabase/020_final_master_structure.sql
-- ============================================================================

-- 1. Individual Teacher Signatures
alter table public.profiles add column if not exists signature_url text;

-- 2. Lesson Plans & Academic Notes
create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  title text not null,
  content text,
  file_path text, -- PDF or document link
  is_public boolean default true,
  created_at timestamptz default now()
);

-- 3. Link Teachers to Subjects (Many-to-Many or Single)
-- We already have subjects and profiles. Let's ensure teachers are tied to subjects.
-- If not exists, create a mapping table for flexibility.
create table if not exists public.teacher_subjects (
  teacher_id uuid references public.profiles(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  primary key(teacher_id, subject_id)
);

-- 4. Security
alter table public.lesson_plans enable row level security;
alter table public.teacher_subjects enable row level security;

create policy "school members view lesson plans" on public.lesson_plans for select using (public.same_school(school_id));
create policy "teachers manage own lesson plans" on public.lesson_plans for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "school members view teacher subjects" on public.teacher_subjects for select using (true);
create policy "admins manage teacher subjects" on public.teacher_subjects for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'));

-- END supabase/020_final_master_structure.sql


-- ============================================================================
-- BEGIN supabase/021_grade_integrity.sql
-- ============================================================================

-- Tightening grade integrity
-- Only the teacher assigned to the class can enter or update results for that class.

drop policy if exists "staff manage results" on public.results;
drop policy if exists "teachers manage own class results" on public.results;

create policy "teachers manage own class results" on public.results for all
using (
  exists (
    select 1 from public.exams e
    join public.classes c on e.class_id = c.id
    where e.id = public.results.exam_id
    and (c.teacher_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'))
  )
)
with check (
  exists (
    select 1 from public.exams e
    join public.classes c on e.class_id = c.id
    where e.id = public.results.exam_id
    and (c.teacher_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'))
  )
);

-- END supabase/021_grade_integrity.sql


-- ============================================================================
-- BEGIN supabase/022_subject_specialization.sql
-- ============================================================================

-- 1. Subject Assignment Enhancement
-- Link teachers to multiple subjects they teach
create table if not exists public.teacher_subject_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_at timestamptz default now(),
  unique(teacher_id, subject_id, class_id)
);

-- 2. Security for Assignments
alter table public.teacher_subject_assignments enable row level security;

create policy "school members view assignments" on public.teacher_subject_assignments for select using (public.same_school(school_id));
create policy "admins manage assignments" on public.teacher_subject_assignments for all using (exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'));

-- 3. Extend Results to include Subject ID for better filtering
alter table public.results add column if not exists subject_id uuid references public.subjects(id) on delete set null;

-- 4. Tighten Gradebook Security further
-- Only allow grading if the teacher is assigned to that specific Subject + Class combination
drop policy if exists "teachers manage own class results" on public.results;

create policy "teachers manage assigned subjects" on public.results for all
using (
  exists (
    select 1 from public.teacher_subject_assignments tsa
    where tsa.teacher_id = auth.uid()
    and tsa.subject_id = public.results.subject_id
    and tsa.class_id = (select class_id from public.students where id = public.results.student_id)
  ) or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'school_admin'
  )
);

-- END supabase/022_subject_specialization.sql


-- ============================================================================
-- BEGIN supabase/023_school_theme_customization.sql
-- ============================================================================

-- Add primary color field to schools table
alter table public.schools
add column if not exists primary_color text default '#2375e1';

-- Allow admins to update their brand color
-- (Policy already exists for school_admin to update their school)

-- END supabase/023_school_theme_customization.sql


-- ============================================================================
-- BEGIN supabase/024_security_geo_locking.sql
-- ============================================================================

-- Security Enhancement: IP & Geo-Locking
-- Allows schools to restrict access to specific geographies or IP ranges.

alter table public.schools
add column if not exists allowed_countries text[] default '{}',
add column if not exists restricted_ips text[] default '{}',
add column if not exists security_level text default 'standard'; -- 'standard', 'elevated', 'maximum'

-- Index for faster lookup
create index if not exists idx_schools_security on public.schools(id, security_level);

-- END supabase/024_security_geo_locking.sql


-- ============================================================================
-- BEGIN supabase/025_school_tenant_lifecycle.sql
-- ============================================================================

-- Run after 024_security_geo_locking.sql. Adds secure school ownership,
-- subscription requests, and Super Admin controls for the multi-school app.

alter table public.schools
  add column if not exists admin_email text,
  add column if not exists admin_user_id uuid unique references auth.users(id) on delete set null;

alter table public.subscriptions
  add column if not exists requested_plan text,
  add column if not exists request_status text not null default 'approved',
  add column if not exists requested_at timestamptz;

drop policy if exists "public may register pending schools" on public.schools;
create policy "public may register pending schools" on public.schools
  for insert with check (
    status = 'pending'
    and length(trim(name)) between 2 and 160
    and admin_user_id is null
    and admin_email is not null
    and length(trim(admin_email)) between 3 and 254
    and subscription_plan in ('Starter', 'Professional', 'Enterprise')
  );

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_school uuid;
  claimed_school uuid;
  requested_role public.user_role := 'student';
begin
  requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
  if (new.raw_user_meta_data->>'role') = 'school_admin' and requested_school is not null then
    -- Let the protected school trigger verify this one-time, email-matched claim.
    perform set_config('app.school_claim_id', requested_school::text, true);
    perform set_config('app.school_claim_user', new.id::text, true);
    update public.schools
       set admin_user_id = new.id
     where id = requested_school
       and status = 'pending'
       and admin_user_id is null
       and lower(admin_email) = lower(new.email)
    returning id into claimed_school;
    if claimed_school is not null then
      requested_role := 'school_admin';
    else
      requested_school := null;
    end if;
  else
    requested_school := null;
  end if;

  insert into public.profiles(id, school_id, full_name, phone, role)
  values (new.id, requested_school,
    left(new.raw_user_meta_data->>'full_name', 160),
    left(new.raw_user_meta_data->>'phone', 40), requested_role);
  return new;
end;
$$;

create or replace function public.protect_school_platform_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if current_setting('app.school_claim_id', true) is distinct from old.id::text
     or current_setting('app.school_claim_user', true) is distinct from new.admin_user_id::text then
    if auth.role() is distinct from 'service_role' and actor_role is distinct from 'super_admin' then
      if new.status is distinct from old.status
         or new.subscription_plan is distinct from old.subscription_plan
         or new.admin_user_id is distinct from old.admin_user_id
         or new.admin_email is distinct from old.admin_email then
        raise exception 'Only the SmartSchool platform administrator can change school approval or ownership fields.';
      end if;
    end if;
  elsif new.admin_user_id is distinct from old.admin_user_id
        or new.admin_email is distinct from old.admin_email
        or new.status is distinct from old.status
        or new.subscription_plan is distinct from old.subscription_plan then
    if current_setting('app.school_claim_id', true) is distinct from old.id::text
       or current_setting('app.school_claim_user', true) is distinct from new.admin_user_id::text
       or lower(old.admin_email) is distinct from lower((select email from auth.users where id = new.admin_user_id))
       or new.admin_user_id is null then
      raise exception 'The school administrator account does not match the registration email.';
    end if;
    if new.status is distinct from old.status or new.subscription_plan is distinct from old.subscription_plan
       or new.admin_email is distinct from old.admin_email then
      raise exception 'School registration cannot change platform controlled fields.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_school_platform_fields on public.schools;
create trigger protect_school_platform_fields before update on public.schools
  for each row execute function public.protect_school_platform_fields();

create or replace function public.protect_profile_role_and_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if auth.role() <> 'service_role' and actor_role is distinct from 'super_admin'
     and (new.role is distinct from old.role or new.school_id is distinct from old.school_id) then
    raise exception 'Only the SmartSchool platform administrator can change account roles or school membership.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role_and_tenant on public.profiles;
create trigger protect_profile_role_and_tenant before update on public.profiles
  for each row execute function public.protect_profile_role_and_tenant();

create or replace function public.create_school_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions(school_id, plan, status, request_status, requested_at)
  values (new.id, new.subscription_plan, 'pending', 'pending', now())
  on conflict (school_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_school_subscription on public.schools;
create trigger create_school_subscription after insert on public.schools
  for each row execute function public.create_school_subscription();

insert into public.subscriptions(school_id, plan, status, request_status, requested_at)
select id, subscription_plan, 'pending', 'pending', now()
from public.schools
on conflict (school_id) do nothing;

drop policy if exists "school members subscriptions" on public.subscriptions;
drop policy if exists "members view subscriptions" on public.subscriptions;
create policy "school and platform admins view subscriptions" on public.subscriptions
  for select using (public.same_school(school_id));

create or replace function public.request_school_plan(p_plan text)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare actor public.profiles; result public.subscriptions;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.role <> 'school_admin' or actor.school_id is null then
    raise exception 'Only a school administrator can request a plan change.';
  end if;
  if p_plan not in ('Starter', 'Professional', 'Enterprise') then
    raise exception 'Choose a valid SmartSchool plan.';
  end if;
  update public.subscriptions
     set requested_plan = p_plan, request_status = 'pending', requested_at = now()
   where school_id = actor.school_id
  returning * into result;
  if result.id is null then raise exception 'This school does not have a subscription record yet.'; end if;
  return result;
end;
$$;

create or replace function public.platform_set_subscription(
  p_school_id uuid, p_plan text, p_status text, p_ends_at timestamptz default null
)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role; result public.subscriptions;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role <> 'super_admin' then raise exception 'Platform administrator access is required.'; end if;
  if p_plan not in ('Starter', 'Professional', 'Enterprise') then raise exception 'Choose a valid plan.'; end if;
  if p_status not in ('pending', 'trial', 'active', 'suspended', 'expired', 'cancelled') then raise exception 'Choose a valid subscription status.'; end if;
  update public.subscriptions set plan = p_plan, status = p_status,
      starts_at = case when p_status in ('trial','active') then coalesce(starts_at, now()) else starts_at end,
      ends_at = p_ends_at, requested_plan = null,
      request_status = case when p_status = 'pending' then 'pending' else 'approved' end
   where school_id = p_school_id returning * into result;
  if result.id is null then raise exception 'Subscription not found for this school.'; end if;
  update public.schools set subscription_plan = p_plan,
      status = case when p_status in ('trial','active') then 'active'::public.school_status
                    when p_status in ('suspended','expired','cancelled') then 'suspended'::public.school_status
                    else 'pending'::public.school_status end
   where id = p_school_id;
  return result;
end;
$$;

create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = public as $$
declare actor_role public.user_role; result public.schools;
begin
  select role into actor_role from public.profiles where id = auth.uid();
  if actor_role <> 'super_admin' then raise exception 'Platform administrator access is required.'; end if;
  update public.schools set status = p_status where id = p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end;
$$;

revoke all on function public.request_school_plan(text) from public;
revoke all on function public.platform_set_subscription(uuid, text, text, timestamptz) from public;
revoke all on function public.platform_set_school_status(uuid, public.school_status) from public;
grant execute on function public.request_school_plan(text) to authenticated;
grant execute on function public.platform_set_subscription(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.platform_set_school_status(uuid, public.school_status) to authenticated;

-- END supabase/025_school_tenant_lifecycle.sql


-- ============================================================================
-- BEGIN supabase/026_school_managed_portal_accounts.sql
-- ============================================================================

-- School administrators invite teachers, learners, and guardians into their own school.
-- Apply after 025_school_tenant_lifecycle.sql and deploy the manage-school-user function.

alter table public.students add column if not exists full_name text;

create table if not exists public.school_portal_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null check (role in ('teacher', 'student', 'parent')),
  student_id uuid references public.students(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint school_portal_invites_student_required check (role <> 'student' or student_id is not null),
  constraint school_portal_invites_parent_required check (role <> 'parent' or student_id is not null)
);

create unique index if not exists school_portal_invites_pending_email
  on public.school_portal_invites (school_id, lower(email)) where accepted_at is null;

alter table public.school_portal_invites enable row level security;
drop policy if exists "school admins view their portal invitations" on public.school_portal_invites;
create policy "school admins view their portal invitations" on public.school_portal_invites
  for select using (
    public.same_school(school_id)
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'school_admin')
  );

create or replace function public.mark_school_portal_invite_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.school_portal_invites set accepted_at = now() where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_school_portal_invite_accepted on auth.users;
create trigger mark_school_portal_invite_accepted after update of email_confirmed_at on auth.users
  for each row execute function public.mark_school_portal_invite_accepted();

-- END supabase/026_school_managed_portal_accounts.sql


-- ============================================================================
-- BEGIN supabase/027_role_security_hardening.sql
-- ============================================================================

-- Apply after 026_school_managed_portal_accounts.sql.
-- Replace permissive same-school access with role, school, and relationship checks.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.current_role()
returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) limit 1
$$;

create or replace function private.current_school_id()
returns uuid
language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p where p.id = (select auth.uid()) limit 1
$$;

create or replace function private.can_view_class(target_class uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classes c
    where c.id = target_class and (
      (c.school_id = private.current_school_id() and private.current_role() = 'school_admin')
      or (c.school_id = private.current_school_id() and private.current_role() = 'teacher' and (
        c.teacher_id = (select auth.uid())
        or exists (select 1 from public.teacher_subject_assignments tsa where tsa.class_id = c.id and tsa.teacher_id = (select auth.uid()))
      ))
      or exists (select 1 from public.students s where s.class_id = c.id and s.profile_id = (select auth.uid()))
      or (private.current_role() = 'parent' and exists (
        select 1 from public.students s join public.student_guardians g on g.student_id = s.id
        where s.class_id = c.id and g.guardian_id = (select auth.uid())
      ))
    )
  )
$$;

create or replace function private.can_view_student(target_student uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
    where s.id = target_student and (
      (s.school_id = private.current_school_id() and private.current_role() = 'school_admin')
      or s.profile_id = (select auth.uid())
      or (s.school_id = private.current_school_id() and private.current_role() = 'teacher' and exists (
        select 1 from public.classes c where c.id = s.class_id and (
          c.teacher_id = (select auth.uid())
          or exists (select 1 from public.teacher_subject_assignments tsa where tsa.class_id = c.id and tsa.teacher_id = (select auth.uid()))
        )
      ))
      or (private.current_role() = 'parent' and exists (
        select 1 from public.student_guardians g where g.student_id = s.id and g.guardian_id = (select auth.uid())
      ))
    )
  )
$$;

create or replace function private.can_grade_student(target_student uuid, target_subject uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s join public.profiles p on p.id = (select auth.uid())
    where s.id = target_student and (
      (p.role = 'school_admin' and p.school_id = s.school_id)
      or (p.role = 'teacher' and p.school_id = s.school_id and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.teacher_id = p.id and tsa.class_id = s.class_id and tsa.subject_id = target_subject
      ))
    )
  )
$$;

revoke all on function private.current_role() from public, anon;
revoke all on function private.current_school_id() from public, anon;
revoke all on function private.can_view_class(uuid) from public, anon;
revoke all on function private.can_view_student(uuid) from public, anon;
revoke all on function private.can_grade_student(uuid, uuid) from public, anon;
grant execute on function private.current_role() to authenticated;
grant execute on function private.current_school_id() to authenticated;
grant execute on function private.can_view_class(uuid) to authenticated;
grant execute on function private.can_view_student(uuid) to authenticated;
grant execute on function private.can_grade_student(uuid, uuid) to authenticated;

-- Drop every old policy on these tables. PostgreSQL permissive policies combine with OR.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename = any(array[
      'profiles','students','classes','subjects','student_guardians','attendance','assignments','exams','results',
      'fees','payments','announcements','events','messages','subscriptions','submissions','applications',
      'quizzes','quiz_questions','quiz_results','badges','student_badges','broadcasts','timetable','resources',
      'meetings','behavior_records','verified_credentials','bus_routes','bus_logs','wellbeing_reports','counseling_notes','assets',
      'courses','course_chapters','course_progress','lesson_plans','class_subjects','report_cards'
    ])
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Older assignment records predate the draft/publish timestamp and were visible to learners.
update public.assignments set published_at = coalesce(created_at, now()) where published_at is null;
-- The existing gradebook had no draft workflow and stored these records as visible results.
update public.exams set published = true where published = false;
update public.results set published = true where published = false;

-- Identity and school roster.
create policy profiles_read_by_role on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (school_id = private.current_school_id() and private.current_role() = 'school_admin')
  or (school_id = private.current_school_id() and private.current_role() = 'teacher' and role in ('school_admin','teacher'))
  or (private.current_role() = 'teacher' and exists (
    select 1 from public.students s where s.profile_id = profiles.id and private.can_view_class(s.class_id)
  ))
  or (private.current_role() in ('student','parent') and school_id = private.current_school_id() and role in ('school_admin','teacher'))
  or (private.current_role() = 'parent' and exists (
    select 1 from public.students s join public.student_guardians g on g.student_id = s.id
    where s.profile_id = profiles.id and g.guardian_id = (select auth.uid())
  ))
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy students_read_related on public.students for select to authenticated using (private.can_view_student(id));
create policy students_insert_admin on public.students for insert to authenticated
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy students_update_admin on public.students for update to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy students_delete_admin on public.students for delete to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id());

create policy classes_read_related on public.classes for select to authenticated using (private.can_view_class(id));
create policy classes_admin_insert on public.classes for insert to authenticated
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy classes_admin_update on public.classes for update to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy classes_admin_delete on public.classes for delete to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id());

create policy subjects_read_school on public.subjects for select to authenticated using (
  private.current_role() = 'super_admin' or school_id = private.current_school_id()
);
create policy subjects_admin_insert on public.subjects for insert to authenticated
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy subjects_admin_update on public.subjects for update to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy subjects_admin_delete on public.subjects for delete to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id());

create policy guardians_read_related on public.student_guardians for select to authenticated using (
  guardian_id = (select auth.uid())
  or (private.current_role() = 'school_admin' and exists (
    select 1 from public.students s where s.id = student_id and s.school_id = private.current_school_id()
  ))
);
create policy guardians_admin_manage on public.student_guardians for all to authenticated
  using (private.current_role() = 'school_admin' and exists (
    select 1 from public.students s where s.id = student_id and s.school_id = private.current_school_id()
  ))
  with check (private.current_role() = 'school_admin' and exists (
    select 1 from public.students s where s.id = student_id and s.school_id = private.current_school_id()
  ));

-- Attendance and classwork: learners and guardians see only their own related records.
create policy attendance_read_related on public.attendance for select to authenticated using (private.can_view_student(student_id));
create policy attendance_staff_insert on public.attendance for insert to authenticated with check (
  school_id = private.current_school_id() and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and recorded_by = (select auth.uid()) and private.can_view_student(student_id))
  )
);
create policy attendance_staff_update on public.attendance for update to authenticated
  using (school_id = private.current_school_id() and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and private.can_view_student(student_id))
  ))
  with check (school_id = private.current_school_id() and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and recorded_by = (select auth.uid()) and private.can_view_student(student_id))
  ));
create policy attendance_admin_delete on public.attendance for delete to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id());

create policy assignments_read_related on public.assignments for select to authenticated using (
  (class_id is not null and private.can_view_class(class_id) and (
    private.current_role() in ('school_admin','teacher') or published_at is not null
  ))
  or (class_id is null and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and created_by = (select auth.uid()))))
);
create policy assignments_staff_insert on public.assignments for insert to authenticated with check (
  school_id = private.current_school_id() and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and class_id is not null and private.can_view_class(class_id) and (created_by is null or created_by = (select auth.uid())))
  )
);
create policy assignments_staff_update on public.assignments for update to authenticated
  using (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and class_id is not null and private.can_view_class(class_id) and (created_by is null or created_by = (select auth.uid())))))
  with check (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and class_id is not null and private.can_view_class(class_id) and (created_by is null or created_by = (select auth.uid())))));
create policy assignments_staff_delete on public.assignments for delete to authenticated
  using (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and class_id is not null and private.can_view_class(class_id) and (created_by is null or created_by = (select auth.uid())))));

create policy exams_read_related on public.exams for select to authenticated using (
  (private.current_role() in ('school_admin','teacher') and school_id = private.current_school_id()
    and (private.current_role() = 'school_admin' or (class_id is not null and private.can_view_class(class_id))))
  or (published = true and class_id is not null and private.can_view_class(class_id))
);
create policy exams_staff_insert on public.exams for insert to authenticated with check (
  school_id = private.current_school_id() and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and class_id is not null and private.can_view_class(class_id))
  )
);
create policy exams_staff_update on public.exams for update to authenticated
  using (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and class_id is not null and private.can_view_class(class_id))))
  with check (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and class_id is not null and private.can_view_class(class_id))));
create policy exams_staff_delete on public.exams for delete to authenticated
  using (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and class_id is not null and private.can_view_class(class_id))));

create policy results_read_related on public.results for select to authenticated using (
  private.can_view_student(student_id) and (private.current_role() in ('school_admin','teacher') or published = true)
);
create policy results_staff_insert on public.results for insert to authenticated with check (
  school_id = private.current_school_id() and private.can_grade_student(student_id, subject_id)
);
create policy results_staff_update on public.results for update to authenticated
  using (school_id = private.current_school_id() and private.can_grade_student(student_id, subject_id))
  with check (school_id = private.current_school_id() and private.can_grade_student(student_id, subject_id));
create policy results_staff_delete on public.results for delete to authenticated
  using (school_id = private.current_school_id() and private.can_grade_student(student_id, subject_id));

-- Finance data and subscription details are limited to their intended users.
create policy fees_read_school on public.fees for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher','student','parent')
);
create policy fees_admin_insert on public.fees for insert to authenticated with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy fees_admin_update on public.fees for update to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy fees_admin_delete on public.fees for delete to authenticated using (private.current_role() = 'school_admin' and school_id = private.current_school_id());

create policy payments_read_related on public.payments for select to authenticated using (
  (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  or (student_id is not null and private.can_view_student(student_id) and private.current_role() in ('student','parent'))
);
create policy payments_admin_insert on public.payments for insert to authenticated with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy payments_admin_update on public.payments for update to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy payments_admin_delete on public.payments for delete to authenticated using (private.current_role() = 'school_admin' and school_id = private.current_school_id());

create policy announcements_read_school on public.announcements for select to authenticated using (
  private.current_role() = 'super_admin' or school_id = private.current_school_id()
);
create policy announcements_staff_insert on public.announcements for insert to authenticated with check (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
);
create policy announcements_staff_update on public.announcements for update to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'))
  with check (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'));
create policy announcements_staff_delete on public.announcements for delete to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'));

create policy events_read_school on public.events for select to authenticated using (
  private.current_role() = 'super_admin' or school_id = private.current_school_id()
);
create policy events_staff_insert on public.events for insert to authenticated with check (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
);
create policy events_staff_update on public.events for update to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'))
  with check (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'));
create policy events_staff_delete on public.events for delete to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'));

create policy messages_read_participants on public.messages for select to authenticated using (
  school_id = private.current_school_id() and (
    sender_id = (select auth.uid()) or recipient_id = (select auth.uid()) or private.current_role() = 'school_admin'
  )
);
create policy messages_send_school on public.messages for insert to authenticated with check (
  school_id = private.current_school_id() and sender_id = (select auth.uid()) and recipient_id is not null
  and exists (select 1 from public.profiles r where r.id = recipient_id and r.school_id = private.current_school_id())
);
create policy messages_mark_read on public.messages for update to authenticated
  using (school_id = private.current_school_id() and recipient_id = (select auth.uid()))
  with check (school_id = private.current_school_id() and recipient_id = (select auth.uid()));

create or replace function private.protect_message_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.current_role() <> 'school_admin' and (
    new.id is distinct from old.id or new.school_id is distinct from old.school_id
    or new.sender_id is distinct from old.sender_id or new.recipient_id is distinct from old.recipient_id
    or new.body is distinct from old.body or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Message participants may only update the read status.';
  end if;
  return new;
end $$;
drop trigger if exists protect_message_update on public.messages;
create trigger protect_message_update before update on public.messages for each row execute function private.protect_message_update();
revoke all on function private.protect_message_update() from public, anon, authenticated;

create policy subscriptions_admin_read on public.subscriptions for select to authenticated using (
  private.current_role() = 'super_admin'
  or (private.current_role() = 'school_admin' and school_id = private.current_school_id())
);

create policy submissions_read_related on public.submissions for select to authenticated using (private.can_view_student(student_id));
create policy submissions_student_insert on public.submissions for insert to authenticated with check (
  private.current_role() = 'student' and exists (
    select 1 from public.students s join public.assignments a on a.id = assignment_id
    where s.id = student_id and s.profile_id = (select auth.uid()) and s.school_id = a.school_id
      and (a.class_id is null or a.class_id = s.class_id)
  ) and score is null and feedback is null
);
create policy submissions_update_related on public.submissions for update to authenticated
  using (private.can_view_student(student_id) and private.current_role() in ('school_admin','teacher','student'))
  with check (private.can_view_student(student_id) and private.current_role() in ('school_admin','teacher','student'));
create policy submissions_staff_delete on public.submissions for delete to authenticated
  using (private.current_role() = 'school_admin' and private.can_view_student(student_id));

create or replace function private.protect_submission_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.current_role() = 'student' and exists (
    select 1 from public.students s where s.id = old.student_id and s.profile_id = (select auth.uid())
  ) then
    if new.assignment_id is distinct from old.assignment_id or new.student_id is distinct from old.student_id
       or new.score is distinct from old.score or new.feedback is distinct from old.feedback or new.id is distinct from old.id then
      raise exception 'Students may only revise their own submission content.';
    end if;
  elsif private.current_role() = 'teacher' then
    if new.assignment_id is distinct from old.assignment_id or new.student_id is distinct from old.student_id
       or new.content is distinct from old.content or new.file_path is distinct from old.file_path or new.id is distinct from old.id then
      raise exception 'Teachers may only update submission grades and feedback.';
    end if;
  elsif private.current_role() <> 'school_admin' then
    raise exception 'School staff access is required to update submissions.';
  end if;
  return new;
end $$;
drop trigger if exists protect_submission_update on public.submissions;
create trigger protect_submission_update before update on public.submissions for each row execute function private.protect_submission_update();
revoke all on function private.protect_submission_update() from public, anon, authenticated;

-- Admissions are the only public write path; keep public inserts pending and private.
create policy public_school_admission_insert on public.applications for insert to anon, authenticated with check (
  status = 'pending' and notes is null and exists (select 1 from public.schools s where s.id = school_id and s.status = 'active')
);
create policy school_admin_read_applications on public.applications for select to authenticated using (
  private.current_role() = 'school_admin' and school_id = private.current_school_id()
);
create policy school_admin_update_applications on public.applications for update to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());
create policy school_admin_delete_applications on public.applications for delete to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id());

-- Quiz answers stay server-side. Students receive sanitized questions and server-scored results.
create policy quizzes_read_school on public.quizzes for select to authenticated using (
  private.current_role() = 'super_admin' or school_id = private.current_school_id()
);
create policy quizzes_staff_insert on public.quizzes for insert to authenticated with check (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and (created_by is null or created_by = (select auth.uid()))
);
create policy quizzes_staff_update on public.quizzes for update to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher') and (private.current_role() = 'school_admin' or created_by = (select auth.uid())))
  with check (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher') and (private.current_role() = 'school_admin' or created_by = (select auth.uid())));
create policy quizzes_staff_delete on public.quizzes for delete to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher') and (private.current_role() = 'school_admin' or created_by = (select auth.uid())));

create policy quiz_questions_staff_read on public.quiz_questions for select to authenticated using (
  private.current_role() in ('super_admin','school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and (private.current_role() = 'super_admin' or q.school_id = private.current_school_id())
  )
);
create policy quiz_questions_staff_insert on public.quiz_questions for insert to authenticated with check (
  private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  )
);
create policy quiz_questions_staff_update on public.quiz_questions for update to authenticated
  using (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  ))
  with check (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  ));
create policy quiz_questions_staff_delete on public.quiz_questions for delete to authenticated using (
  private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  )
);

create policy quiz_results_read_related on public.quiz_results for select to authenticated using (
  private.can_view_student(student_id)
);

-- Keep school-wide teaching relationships and badge data private to their school.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename = any(array['teacher_subjects','teacher_subject_assignments'])
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;
create policy teacher_subjects_read_school on public.teacher_subjects for select to authenticated using (
  private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.subjects s where s.id = subject_id and s.school_id = private.current_school_id()
  )
);
create policy teacher_subjects_admin_manage on public.teacher_subjects for all to authenticated
  using (private.current_role() = 'school_admin' and exists (
    select 1 from public.subjects s where s.id = subject_id and s.school_id = private.current_school_id()
  ))
  with check (private.current_role() = 'school_admin' and exists (
    select 1 from public.subjects s where s.id = subject_id and s.school_id = private.current_school_id()
  ));
create policy teacher_subject_assignments_read_school on public.teacher_subject_assignments for select to authenticated using (
  school_id = private.current_school_id() and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid()))
);
create policy teacher_subject_assignments_admin_manage on public.teacher_subject_assignments for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() = 'school_admin')
  with check (school_id = private.current_school_id() and private.current_role() = 'school_admin');

create policy badges_read_school on public.badges for select to authenticated using (
  school_id = private.current_school_id()
);
create policy badges_admin_manage on public.badges for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() = 'school_admin')
  with check (school_id = private.current_school_id() and private.current_role() = 'school_admin');
create policy student_badges_read_related on public.student_badges for select to authenticated using (
  private.can_view_student(student_id)
);
create policy student_badges_staff_manage on public.student_badges for all to authenticated
  using (private.current_role() in ('school_admin','teacher') and private.can_view_student(student_id))
  with check (private.current_role() in ('school_admin','teacher') and private.can_view_student(student_id));
create policy broadcasts_read_school on public.broadcasts for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher','student','parent')
);
create policy broadcasts_staff_manage on public.broadcasts for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'))
  with check (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'));

-- Course content and generated reports follow the same school and learner boundaries.
create policy courses_read_school on public.courses for select to authenticated using (
  school_id = private.current_school_id() and (
    private.current_role() in ('school_admin','teacher') or is_published = true
  )
);
create policy courses_staff_manage on public.courses for all to authenticated
  using (school_id = private.current_school_id() and (
    private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))
  ))
  with check (school_id = private.current_school_id() and (
    private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))
  ));
create policy course_chapters_read_school on public.course_chapters for select to authenticated using (
  exists (select 1 from public.courses c where c.id = course_id and c.school_id = private.current_school_id()
    and (c.is_published = true or private.current_role() in ('school_admin','teacher')))
);
create policy course_chapters_staff_manage on public.course_chapters for all to authenticated
  using (exists (select 1 from public.courses c where c.id = course_id and c.school_id = private.current_school_id()
    and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and c.teacher_id = (select auth.uid())))))
  with check (exists (select 1 from public.courses c where c.id = course_id and c.school_id = private.current_school_id()
    and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and c.teacher_id = (select auth.uid())))));
create policy course_progress_read_related on public.course_progress for select to authenticated using (
  private.can_view_student(student_id)
);
create policy course_progress_student_insert on public.course_progress for insert to authenticated with check (
  private.current_role() = 'student' and exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
  and exists (select 1 from public.course_chapters ch join public.courses c on c.id = ch.course_id
    where ch.id = chapter_id and c.school_id = private.current_school_id() and c.is_published = true)
);
create policy course_progress_student_update on public.course_progress for update to authenticated
  using (private.current_role() = 'student' and exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid())))
  with check (private.current_role() = 'student' and exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
    and exists (select 1 from public.course_chapters ch join public.courses c on c.id = ch.course_id
      where ch.id = chapter_id and c.school_id = private.current_school_id() and c.is_published = true));
create policy lesson_plans_read_related on public.lesson_plans for select to authenticated using (
  school_id = private.current_school_id() and (
    private.current_role() in ('school_admin','teacher')
    or (is_public = true and class_id is not null and private.can_view_class(class_id))
  )
);
create policy lesson_plans_staff_manage on public.lesson_plans for all to authenticated
  using (school_id = private.current_school_id() and (
    private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))
  ))
  with check (school_id = private.current_school_id() and (
    private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))
  ));
create policy class_subjects_read_related on public.class_subjects for select to authenticated using (
  private.can_view_class(class_id)
);
create policy class_subjects_admin_manage on public.class_subjects for all to authenticated
  using (private.current_role() = 'school_admin' and private.can_view_class(class_id))
  with check (private.current_role() = 'school_admin' and private.can_view_class(class_id));
create policy report_cards_read_related on public.report_cards for select to authenticated using (
  private.can_view_student(student_id)
);
create policy report_cards_admin_manage on public.report_cards for all to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id()
    and private.can_view_student(student_id));

create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns table(id uuid, question_text text, options jsonb, points integer)
language plpgsql security definer set search_path = '' as $$
declare student public.students;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  if student.id is null then raise exception 'Student record not found.'; end if;
  if not exists (select 1 from public.quizzes q where q.id = p_quiz_id and q.school_id = student.school_id) then raise exception 'Quiz not found.'; end if;
  return query select q.id, q.question_text, q.options, q.points from public.quiz_questions q where q.quiz_id = p_quiz_id;
end $$;

create or replace function public.submit_quiz(p_quiz_id uuid, p_answers jsonb)
returns public.quiz_results
language plpgsql security definer set search_path = '' as $$
declare student public.students; question public.quiz_questions; answer text; points_total integer := 0; score_total integer := 0; result public.quiz_results;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Answers must be submitted as a question map.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  if student.id is null then raise exception 'Student record not found.'; end if;
  if not exists (select 1 from public.quizzes q where q.id = p_quiz_id and q.school_id = student.school_id) then raise exception 'Quiz not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || student.id::text, 0));
  if exists (select 1 from public.quiz_results r where r.quiz_id = p_quiz_id and r.student_id = student.id) then raise exception 'This quiz has already been submitted.'; end if;
  for question in select q.* from public.quiz_questions q where q.quiz_id = p_quiz_id loop
    points_total := points_total + greatest(coalesce(question.points, 1), 0);
    answer := p_answers->>question.id::text;
    if answer ~ '^[0-9]+$' and answer::integer = question.correct_option_index then
      score_total := score_total + greatest(coalesce(question.points, 1), 0);
    end if;
  end loop;
  if points_total = 0 then raise exception 'This quiz has no gradable questions.'; end if;
  insert into public.quiz_results(quiz_id, student_id, score, total_points)
  values (p_quiz_id, student.id, score_total, points_total) returning * into result;
  return result;
end $$;
revoke all on function public.get_quiz_questions(uuid) from public, anon;
revoke all on function public.submit_quiz(uuid, jsonb) from public, anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb) to authenticated;

-- Student results are read-only to clients. The submit_quiz function owns inserts.
revoke insert, update, delete on public.quiz_results from authenticated;

-- Restore scoped policies on school services and sensitive student records.
create policy timetable_read_related on public.timetable for select to authenticated using (private.can_view_class(class_id));
create policy timetable_staff_insert on public.timetable for insert to authenticated with check (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid()))
);
create policy timetable_staff_update on public.timetable for update to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher') and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid())))
  with check (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher') and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid())));
create policy timetable_staff_delete on public.timetable for delete to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher') and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid())));

create policy resources_read_school on public.resources for select to authenticated using (
  private.current_role() = 'super_admin' or school_id = private.current_school_id()
);
create policy resources_staff_insert on public.resources for insert to authenticated with check (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
);
create policy resources_staff_update on public.resources for update to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'))
  with check (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'));
create policy resources_staff_delete on public.resources for delete to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher'));

create policy meetings_read_related on public.meetings for select to authenticated using (
  school_id = private.current_school_id() and (
    private.current_role() in ('school_admin','teacher') and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid()))
    or parent_id = (select auth.uid())
    or private.can_view_student(student_id)
    or (private.current_role() = 'parent' and status = 'available')
  )
);
create policy meetings_teacher_manage on public.meetings for all to authenticated
  using (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))))
  with check (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))));
create policy meetings_parent_book on public.meetings for update to authenticated
  using (private.current_role() = 'parent' and school_id = private.current_school_id() and status = 'available')
  with check (private.current_role() = 'parent' and school_id = private.current_school_id() and parent_id = (select auth.uid()) and status = 'booked');

create policy behavior_read_related on public.behavior_records for select to authenticated using (private.can_view_student(student_id));
create policy behavior_staff_insert on public.behavior_records for insert to authenticated with check (
  school_id = private.current_school_id() and private.can_view_student(student_id)
  and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid())))
);
create policy behavior_staff_update on public.behavior_records for update to authenticated
  using (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))))
  with check (school_id = private.current_school_id() and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and teacher_id = (select auth.uid()))));
create policy behavior_staff_delete on public.behavior_records for delete to authenticated
  using (school_id = private.current_school_id() and private.current_role() = 'school_admin');

create policy credentials_read_private on public.verified_credentials for select to authenticated using (
  (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  or (private.current_role() = 'student' and private.can_view_student(student_id))
);
create policy credentials_staff_insert on public.verified_credentials for insert to authenticated with check (
  school_id = private.current_school_id() and (
    (private.current_role() in ('school_admin','teacher') and private.can_view_student(student_id))
    or (private.current_role() = 'student' and private.can_view_student(student_id)
      and exists (select 1 from public.courses c where c.id = course_id and c.school_id = private.current_school_id()
        and (select count(*) from public.course_chapters ch where ch.course_id = c.id) > 0
        and (select count(*) from public.course_chapters ch where ch.course_id = c.id) =
            (select count(*) from public.course_progress cp join public.course_chapters ch on ch.id = cp.chapter_id
              where cp.student_id = verified_credentials.student_id and ch.course_id = c.id)))
  )
);

create policy bus_routes_read_school on public.bus_routes for select to authenticated using (school_id = private.current_school_id());
create policy bus_routes_staff_manage on public.bus_routes for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() = 'school_admin')
  with check (school_id = private.current_school_id() and private.current_role() = 'school_admin');
create policy bus_logs_read_school on public.bus_logs for select to authenticated using (
  exists (select 1 from public.bus_routes r where r.id = route_id and r.school_id = private.current_school_id()
    and (private.current_role() = 'school_admin' or r.driver_id = (select auth.uid())))
);
create policy bus_logs_driver_insert on public.bus_logs for insert to authenticated with check (
  exists (select 1 from public.bus_routes r where r.id = route_id and r.school_id = private.current_school_id() and r.driver_id = (select auth.uid()))
);

create policy wellbeing_student_read on public.wellbeing_reports for select to authenticated using (
  private.current_role() = 'school_admin' and school_id = private.current_school_id()
  or (private.current_role() = 'student' and exists (
    select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid())
  ))
);
create policy wellbeing_student_insert on public.wellbeing_reports for insert to authenticated with check (
  private.current_role() = 'student' and private.can_view_student(student_id) and reporter_id = (select auth.uid())
);
create policy wellbeing_staff_manage on public.wellbeing_reports for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() = 'school_admin')
  with check (school_id = private.current_school_id() and private.current_role() = 'school_admin');
create policy counseling_notes_school_admin on public.counseling_notes for all to authenticated
  using (private.current_role() = 'school_admin' and exists (select 1 from public.wellbeing_reports w where w.id = report_id and w.school_id = private.current_school_id()))
  with check (private.current_role() = 'school_admin' and exists (select 1 from public.wellbeing_reports w where w.id = report_id and w.school_id = private.current_school_id()));

create policy assets_read_school on public.assets for select to authenticated using (
  private.current_role() = 'super_admin' or school_id = private.current_school_id()
);
create policy assets_admin_manage on public.assets for all to authenticated
  using (private.current_role() = 'school_admin' and school_id = private.current_school_id())
  with check (private.current_role() = 'school_admin' and school_id = private.current_school_id());

-- Lock down global helper and RPC execution. Triggers continue to run as their owner.
create or replace function public.same_school(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.role = 'super_admin' or p.school_id = target_school))
$$;
revoke all on function public.same_school(uuid) from public, anon;
grant execute on function public.same_school(uuid) to authenticated;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin')
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.review_school(target_school uuid, new_status public.school_status)
returns public.schools language plpgsql security definer set search_path = '' as $$
declare updated_school public.schools;
begin
  if not (select public.is_super_admin()) then raise exception 'Platform administrator access is required.'; end if;
  update public.schools set status = new_status where id = target_school returning * into updated_school;
  if updated_school.id is null then raise exception 'School not found.'; end if;
  return updated_school;
end $$;
revoke all on function public.review_school(uuid, public.school_status) from public, anon;
grant execute on function public.review_school(uuid, public.school_status) to authenticated;

-- Keep the actual auth trigger function pinned to an empty search path.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_school uuid; claimed_school uuid; requested_role public.user_role := 'student';
begin
  requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
  if (new.raw_user_meta_data->>'role') = 'school_admin' and requested_school is not null then
    perform set_config('app.school_claim_id', requested_school::text, true);
    perform set_config('app.school_claim_user', new.id::text, true);
    update public.schools set admin_user_id = new.id where id = requested_school and status = 'pending'
      and admin_user_id is null and lower(admin_email) = lower(new.email) returning id into claimed_school;
    if claimed_school is not null then requested_role := 'school_admin'; else requested_school := null; end if;
  else requested_school := null;
  end if;
  insert into public.profiles(id, school_id, full_name, phone, role)
  values (new.id, requested_school, left(new.raw_user_meta_data->>'full_name',160), left(new.raw_user_meta_data->>'phone',40), requested_role);
  return new;
end $$;

create or replace function public.protect_school_platform_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role;
begin
  select role into actor_role from public.profiles where id = (select auth.uid());
  if current_setting('app.school_claim_id', true) is not distinct from old.id::text
     and current_setting('app.school_claim_user', true) is not distinct from new.admin_user_id::text
     and new.admin_user_id is not null
     and lower(old.admin_email) is not distinct from lower((select u.email from auth.users u where u.id = new.admin_user_id)) then
    if new.status is distinct from old.status or new.subscription_plan is distinct from old.subscription_plan or new.admin_email is distinct from old.admin_email then
      raise exception 'School registration cannot change platform controlled fields.';
    end if;
    return new;
  end if;
  if auth.role() is distinct from 'service_role' and actor_role is distinct from 'super_admin'
     and (new.status is distinct from old.status or new.subscription_plan is distinct from old.subscription_plan
       or new.admin_user_id is distinct from old.admin_user_id or new.admin_email is distinct from old.admin_email) then
    raise exception 'Only the platform administrator can change school approval or ownership fields.';
  end if;
  return new;
end $$;

create or replace function public.protect_profile_role_and_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role;
begin
  select role into actor_role from public.profiles where id = (select auth.uid());
  if auth.role() is distinct from 'service_role' and actor_role is distinct from 'super_admin'
     and (new.role is distinct from old.role or new.school_id is distinct from old.school_id
       or new.is_active is distinct from old.is_active) then
    raise exception 'Only the platform administrator can change account roles, school membership, or account status.';
  end if;
  return new;
end $$;

create or replace function public.create_school_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subscriptions(school_id, plan, status, request_status, requested_at)
  values (new.id, new.subscription_plan, 'pending', 'pending', now()) on conflict (school_id) do nothing;
  return new;
end $$;

create or replace function public.request_school_plan(p_plan text)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; result public.subscriptions;
begin
  select * into actor from public.profiles where id = (select auth.uid());
  if actor.role <> 'school_admin' or actor.school_id is null then raise exception 'Only a school administrator can request a plan change.'; end if;
  if p_plan not in ('Starter','Professional','Enterprise') then raise exception 'Choose a valid SmartSchool plan.'; end if;
  update public.subscriptions set requested_plan = p_plan, request_status = 'pending', requested_at = now()
  where school_id = actor.school_id returning * into result;
  if result.id is null then raise exception 'Subscription record not found.'; end if;
  return result;
end $$;

create or replace function public.platform_set_subscription(p_school_id uuid, p_plan text, p_status text, p_ends_at timestamptz default null)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.subscriptions;
begin
  select role into actor_role from public.profiles where id = (select auth.uid());
  if actor_role is distinct from 'super_admin' then raise exception 'Platform administrator access is required.'; end if;
  if p_plan not in ('Starter','Professional','Enterprise') then raise exception 'Choose a valid plan.'; end if;
  if p_status not in ('pending','trial','active','suspended','expired','cancelled') then raise exception 'Choose a valid subscription status.'; end if;
  update public.subscriptions set plan=p_plan,status=p_status,
    starts_at=case when p_status in ('trial','active') then coalesce(starts_at,now()) else starts_at end,
    ends_at=p_ends_at,requested_plan=null,request_status=case when p_status='pending' then 'pending' else 'approved' end
  where school_id=p_school_id returning * into result;
  if result.id is null then raise exception 'Subscription not found.'; end if;
  update public.schools set subscription_plan=p_plan,
    status=case when p_status in ('trial','active') then 'active'::public.school_status
      when p_status in ('suspended','expired','cancelled') then 'suspended'::public.school_status
      else 'pending'::public.school_status end where id=p_school_id;
  return result;
end $$;

create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.schools;
begin
  select role into actor_role from public.profiles where id=(select auth.uid());
  if actor_role is distinct from 'super_admin' then raise exception 'Platform administrator access is required.'; end if;
  update public.schools set status=p_status where id=p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end $$;

create or replace function public.log_table_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(school_id,actor_id,action,table_name,record_id,old_data,new_data)
  values (case when tg_op='DELETE' then old.school_id else new.school_id end,(select auth.uid()),tg_op,tg_table_name,
    case when tg_op='DELETE' then old.id else new.id end,case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end);
  return null;
end $$;

create or replace function public.notify_behavior_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(school_id,user_id,title,body,type)
  values (new.school_id,(select s.profile_id from public.students s where s.id=new.student_id),
    'New Behavior Record: '||upper(new.type),'Category: '||new.category||'. Comment: '||coalesce(new.comment,''),'behavioral');
  return null;
end $$;

create or replace function public.mark_school_portal_invite_accepted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.school_portal_invites set accepted_at=now() where user_id=new.id;
  end if;
  return new;
end $$;

create or replace function public.platform_dashboard_counts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if (select private.current_role()) is distinct from 'super_admin' then raise exception 'Platform administrator access is required.'; end if;
  select jsonb_build_object(
    'schools', (select count(*) from public.schools),
    'active_schools', (select count(*) from public.schools where status = 'active'),
    'pending_schools', (select count(*) from public.schools where status = 'pending'),
    'suspended_schools', (select count(*) from public.schools where status = 'suspended'),
    'students', (select count(*) from public.students),
    'teachers', (select count(*) from public.profiles where role = 'teacher'),
    'active_subscriptions', (select count(*) from public.subscriptions where status in ('active','trial')),
    'expiring_soon', (select count(*) from public.subscriptions where ends_at >= now() and ends_at <= now() + interval '14 days')
  ) into result;
  return result;
end $$;

revoke all on function public.platform_dashboard_counts() from public, anon;
grant execute on function public.platform_dashboard_counts() to authenticated;

revoke all on function public.request_school_plan(text) from public, anon;
revoke all on function public.platform_set_subscription(uuid,text,text,timestamptz) from public, anon;
revoke all on function public.platform_set_school_status(uuid,public.school_status) from public, anon;
grant execute on function public.request_school_plan(text) to authenticated;
grant execute on function public.platform_set_subscription(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.platform_set_school_status(uuid,public.school_status) to authenticated;

-- END supabase/027_role_security_hardening.sql


-- ============================================================================
-- BEGIN supabase/028_school_report_periods.sql
-- ============================================================================

-- Add explicit academic period metadata so published school reports do not mix years or terms.
alter table public.exams
  add column if not exists academic_year text,
  add column if not exists term text;

update public.exams
set academic_year = extract(year from exam_date)::integer::text
where academic_year is null and exam_date is not null;

alter table public.exams
  add constraint exams_term_check
  check (term is null or term in ('Term 1', 'Term 2', 'Term 3'));

create index if not exists exams_school_period on public.exams (school_id, academic_year, term, exam_date);

-- END supabase/028_school_report_periods.sql


-- ============================================================================
-- BEGIN supabase/029_school_registration_rate_limit.sql
-- ============================================================================

-- Protect the public school-registration endpoint from bulk account and tenant spam.
create table if not exists private.school_registration_attempts (
  requester_hash text not null,
  created_at timestamptz not null default now()
);
alter table private.school_registration_attempts enable row level security;
revoke all on table private.school_registration_attempts from public, anon, authenticated;

create index if not exists school_registration_attempts_created_at
  on private.school_registration_attempts (created_at);
create index if not exists school_registration_attempts_requester_created
  on private.school_registration_attempts (requester_hash, created_at desc);

create or replace function public.consume_school_registration_attempt(p_requester_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare recent_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Registration rate-limit access is restricted.';
  end if;
  if p_requester_hash is null or length(p_requester_hash) <> 64 then
    raise exception 'Invalid requester key.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_requester_hash, 0));
  delete from private.school_registration_attempts where created_at < now() - interval '24 hours';
  select count(*) into recent_attempts from private.school_registration_attempts
    where requester_hash = p_requester_hash and created_at > now() - interval '1 hour';
  if recent_attempts >= 5 then return false; end if;
  insert into private.school_registration_attempts(requester_hash) values (p_requester_hash);
  return true;
end
$$;

revoke all on function public.consume_school_registration_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_school_registration_attempt(text) to service_role;

-- END supabase/029_school_registration_rate_limit.sql


-- ============================================================================
-- BEGIN supabase/030_school_localization_and_family_alerts.sql
-- ============================================================================

-- School-level locale settings and parent absence alerts.
-- Apply after 029_school_registration_rate_limit.sql.

alter table public.schools
  add column if not exists timezone text not null default 'Africa/Nairobi',
  add column if not exists currency_code text not null default 'KES',
  add column if not exists academic_terms text[] not null default array['Term 1','Term 2','Term 3'],
  add column if not exists grading_scale jsonb not null default '[{"min":80,"grade":"A"},{"min":70,"grade":"B"},{"min":60,"grade":"C"},{"min":50,"grade":"D"},{"min":0,"grade":"E"}]'::jsonb;

alter table public.profiles
  add column if not exists notification_preferences jsonb not null default '{"absences":true,"announcements":true,"behavior":true}'::jsonb;

alter table public.profiles alter column notification_preferences
  set default '{"absences":true,"announcements":true,"behavior":true,"schoolwork":true}'::jsonb;
update public.profiles set notification_preferences = notification_preferences || '{"schoolwork":true}'::jsonb
  where not (notification_preferences ? 'schoolwork');

-- Keep sensitive changes visible in the existing school audit trail.
create or replace function public.log_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
  current_row jsonb;
  tenant_id uuid;
  changed_id uuid;
begin
  before_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  current_row := coalesce(after_row, before_row);
  tenant_id := nullif(current_row ->> 'school_id', '')::uuid;
  if tenant_id is null and tg_table_name = 'schools' then
    tenant_id := nullif(current_row ->> 'id', '')::uuid;
  end if;
  changed_id := nullif(current_row ->> 'id', '')::uuid;

  insert into public.audit_logs (school_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (tenant_id, (select auth.uid()), tg_op, tg_table_name, changed_id, before_row, after_row);
  return null;
end;
$$;
revoke all on function public.log_table_change() from public, anon, authenticated;

do $$
declare table_to_audit text;
begin
  foreach table_to_audit in array array['schools','attendance','students','exams','announcements','behavior_records','subscriptions','classes'] loop
    execute format('drop trigger if exists audit_school_%I on public.%I', table_to_audit, table_to_audit);
    execute format('create trigger audit_school_%I after insert or update or delete on public.%I for each row execute function public.log_table_change()', table_to_audit, table_to_audit);
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schools_currency_code_check' and conrelid = 'public.schools'::regclass) then
    alter table public.schools add constraint schools_currency_code_check
      check (currency_code in ('KES','UGX','TZS','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'schools_timezone_check' and conrelid = 'public.schools'::regclass) then
    alter table public.schools add constraint schools_timezone_check
      check (timezone in ('Africa/Nairobi','Africa/Freetown','Africa/Kampala','Africa/Dar_es_Salaam','Africa/Accra','Africa/Lagos','Africa/Kigali','Africa/Lusaka','Africa/Blantyre','Africa/Johannesburg','Africa/Monrovia','Africa/Banjul','Africa/Dakar','Africa/Abidjan','Africa/Douala','Africa/Addis_Ababa','Africa/Cairo','America/New_York','Europe/London','UTC'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'schools_academic_terms_count_check' and conrelid = 'public.schools'::regclass) then
    alter table public.schools add constraint schools_academic_terms_count_check
      check (cardinality(academic_terms) between 2 and 6);
  end if;
end $$;

alter table public.exams drop constraint if exists exams_term_check;
alter table public.exams add constraint exams_term_check
  check (term is null or length(trim(term)) between 2 and 40);

create or replace function public.validate_school_exam_term()
returns trigger language plpgsql security definer set search_path = '' as $$
declare available_terms text[];
begin
  if new.term is null then return new; end if;
  select s.academic_terms into available_terms from public.schools s where s.id = new.school_id;
  if not (new.term = any(coalesce(available_terms, array['Term 1','Term 2','Term 3']))) then
    raise exception 'Choose one of this school’s configured academic terms.';
  end if;
  return new;
end $$;
revoke all on function public.validate_school_exam_term() from public, anon, authenticated;
drop trigger if exists validate_school_exam_term on public.exams;
create trigger validate_school_exam_term before insert or update of term, school_id on public.exams
  for each row execute function public.validate_school_exam_term();

create or replace function public.notify_guardians_of_absence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'absent' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'absent' then return new; end if;
  end if;

  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, g.guardian_id, 'Absence recorded',
    coalesce(p.full_name, s.admission_number, 'Your learner') || ' was marked absent on ' || new.attendance_date::text || '.',
    'attendance'
  from public.student_guardians g
  join public.students s on s.id = g.student_id and s.id = new.student_id
  join public.profiles p on p.id = g.guardian_id
  where p.notification_preferences -> 'absences' is distinct from 'false'::jsonb;

  return new;
end;
$$;

drop trigger if exists notify_guardians_of_absence on public.attendance;
create trigger notify_guardians_of_absence
  after insert or update of status on public.attendance
  for each row execute function public.notify_guardians_of_absence();

revoke all on function public.notify_guardians_of_absence() from public, anon, authenticated;

create or replace function public.notify_behavior_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, p.id,
    'New behavior record: ' || upper(new.type),
    'Category: ' || new.category || '. ' || coalesce(new.comment, ''),
    'behavioral'
  from public.profiles p
  where (p.id = (select s.profile_id from public.students s where s.id = new.student_id)
      or p.id in (select g.guardian_id from public.student_guardians g where g.student_id = new.student_id))
    and p.notification_preferences -> 'behavior' is distinct from 'false';
  return null;
end;
$$;
revoke all on function public.notify_behavior_change() from public, anon, authenticated;

create or replace function public.notify_class_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, recipients.user_id, 'New class assignment',
    new.title || case when new.due_date is null then '' else ' · Due ' || new.due_date::text end,
    'academic'
  from (
    select s.profile_id as user_id from public.students s where s.class_id = new.class_id and s.profile_id is not null
    union
    select g.guardian_id from public.student_guardians g join public.students s on s.id = g.student_id where s.class_id = new.class_id
  ) recipients
  join public.profiles p on p.id = recipients.user_id
  where p.school_id = new.school_id and p.notification_preferences -> 'schoolwork' is distinct from 'false';
  return new;
end $$;

create or replace function public.notify_class_exam()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, recipients.user_id, 'Upcoming class exam',
    new.name || case when new.exam_date is null then '' else ' · ' || new.exam_date::text end,
    'academic'
  from (
    select s.profile_id as user_id from public.students s where s.class_id = new.class_id and s.profile_id is not null
    union
    select g.guardian_id from public.student_guardians g join public.students s on s.id = g.student_id where s.class_id = new.class_id
  ) recipients
  join public.profiles p on p.id = recipients.user_id
  where p.school_id = new.school_id and p.notification_preferences -> 'schoolwork' is distinct from 'false';
  return new;
end $$;

create or replace function public.notify_published_result()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(new.published, false) then return new; end if;
  if tg_op = 'UPDATE' then
    if old.published is true and old.score is not distinct from new.score then return new; end if;
  end if;

  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, recipients.user_id, 'New result published',
    'A new result is available in the learner report card.', 'academic'
  from (
    select s.profile_id as user_id from public.students s where s.id = new.student_id and s.profile_id is not null
    union
    select g.guardian_id from public.student_guardians g where g.student_id = new.student_id
  ) recipients
  join public.profiles p on p.id = recipients.user_id
  where p.school_id = new.school_id and p.notification_preferences -> 'schoolwork' is distinct from 'false';
  return new;
end $$;

revoke all on function public.notify_class_assignment() from public, anon, authenticated;
revoke all on function public.notify_class_exam() from public, anon, authenticated;
revoke all on function public.notify_published_result() from public, anon, authenticated;

drop trigger if exists notify_class_assignment on public.assignments;
create trigger notify_class_assignment after insert on public.assignments
  for each row when (new.class_id is not null) execute function public.notify_class_assignment();
drop trigger if exists notify_class_exam on public.exams;
create trigger notify_class_exam after insert on public.exams
  for each row when (new.class_id is not null) execute function public.notify_class_exam();
drop trigger if exists notify_published_result on public.results;
create trigger notify_published_result after insert or update of published, score on public.results
  for each row execute function public.notify_published_result();

create or replace function public.notify_school_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (school_id, user_id, title, body, type)
  select new.school_id, p.id, new.title, left(coalesce(new.body, ''), 500), 'announcement'
  from public.profiles p
  where p.school_id = new.school_id
    and p.role in ('parent', 'student', 'teacher', 'school_admin')
    and p.notification_preferences -> 'announcements' is distinct from 'false';
  return new;
end;
$$;

drop trigger if exists notify_school_announcement on public.announcements;
create trigger notify_school_announcement
  after insert on public.announcements
  for each row execute function public.notify_school_announcement();

revoke all on function public.notify_school_announcement() from public, anon, authenticated;

-- END supabase/030_school_localization_and_family_alerts.sql


-- ============================================================================
-- BEGIN supabase/031_subject_assessments_and_resources.sql
-- ============================================================================

-- Subject and unit based assessments, secure server-side grading and learning resources.
alter table public.quizzes add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.quizzes add column if not exists unit_title text;
alter table public.quizzes add column if not exists assessment_type text not null default 'quiz';
alter table public.quizzes add column if not exists opens_at timestamptz;
alter table public.quizzes add column if not exists due_at timestamptz;
alter table public.quizzes add column if not exists max_attempts integer not null default 1;
alter table public.quizzes add column if not exists published boolean not null default true;
alter table public.quizzes add column if not exists shuffle_questions boolean not null default false;
alter table public.quizzes add column if not exists shuffle_options boolean not null default false;
alter table public.quizzes add column if not exists show_answers_after_submit boolean not null default false;
alter table public.quizzes add column if not exists weight numeric not null default 1;
update public.quizzes set time_limit_minutes = 30 where time_limit_minutes is null or time_limit_minutes < 1;
alter table public.quizzes add constraint quizzes_time_limit_check check (time_limit_minutes between 1 and 600);
alter table public.quizzes add constraint quizzes_weight_check check (weight >= 0);
alter table public.quizzes add constraint quizzes_assessment_type_check check (assessment_type in ('quiz','cat','test','exam'));
alter table public.quizzes add constraint quizzes_attempts_check check (max_attempts between 1 and 10);
alter table public.quiz_questions add column if not exists question_type text not null default 'mcq';
alter table public.quiz_questions add column if not exists sort_order integer not null default 0;
alter table public.quiz_questions add column if not exists explanation text;
alter table public.quiz_questions add constraint quiz_questions_type_check check (question_type in ('mcq','true_false','short_answer'));

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.quiz_results(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer_value text,
  earned_points numeric not null default 0,
  is_correct boolean,
  teacher_feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  unique(result_id, question_id)
);
alter table public.quiz_results add column if not exists attempt_number integer not null default 1;
alter table public.quiz_results add column if not exists submitted_at timestamptz not null default now();
alter table public.quiz_results add column if not exists needs_review boolean not null default false;
alter table public.quiz_results add column if not exists published boolean not null default true;
alter table public.quiz_results drop constraint if exists quiz_results_quiz_id_student_id_key;
create unique index if not exists quiz_results_quiz_student_attempt_key on public.quiz_results(quiz_id, student_id, attempt_number);
create table if not exists public.quiz_attempt_sessions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  attempt_number integer not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  unique(quiz_id, student_id, attempt_number)
);
alter table public.quiz_attempt_sessions enable row level security;
create policy quiz_attempt_sessions_read_own on public.quiz_attempt_sessions for select to authenticated using (
  private.current_role() = 'student' and exists (select 1 from public.students s where s.id = student_id and s.profile_id = (select auth.uid()))
);
revoke insert, update, delete on public.quiz_attempt_sessions from authenticated;
alter table public.quiz_answers enable row level security;
create policy quiz_answers_read_related on public.quiz_answers for select to authenticated using (
  exists (select 1 from public.quiz_results r where r.id = result_id and private.can_view_student(r.student_id))
);
create policy quiz_answers_teacher_grade on public.quiz_answers for update to authenticated
  using (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id
    where r.id = result_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  ))
  with check (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id
    where r.id = result_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  ));
revoke insert, delete on public.quiz_answers from authenticated;

create table if not exists public.subject_resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  unit_title text not null,
  title text not null,
  description text,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.subject_resources enable row level security;
create policy subject_resources_read_scope on public.subject_resources for select to authenticated using (
  school_id = private.current_school_id() and (
    private.current_role() in ('school_admin','teacher') or class_id is null or private.can_view_class(class_id)
  )
);
create policy subject_resources_staff_insert on public.subject_resources for insert to authenticated with check (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and uploaded_by = (select auth.uid())
  and (private.current_role() = 'school_admin' or exists (
    select 1 from public.teacher_subject_assignments tsa where tsa.school_id = subject_resources.school_id
      and tsa.teacher_id = (select auth.uid()) and tsa.subject_id = subject_resources.subject_id
      and (subject_resources.class_id is null or tsa.class_id = subject_resources.class_id)
  ))
);
create policy subject_resources_staff_delete on public.subject_resources for delete to authenticated using (
  school_id = private.current_school_id() and (private.current_role() = 'school_admin' or uploaded_by = (select auth.uid()))
);

drop policy if exists quizzes_read_school on public.quizzes;
create policy quizzes_read_school on public.quizzes for select to authenticated using (
  private.current_role() = 'super_admin' or (school_id = private.current_school_id() and (
    private.current_role() in ('school_admin','teacher') or (published = true and (class_id is null or private.can_view_class(class_id)))
  ))
);

drop policy if exists quizzes_staff_insert on public.quizzes;
create policy quizzes_staff_insert on public.quizzes for insert to authenticated with check (
  school_id = private.current_school_id()
  and (created_by is null or created_by = (select auth.uid()))
  and (
    private.current_role() = 'school_admin'
    or (private.current_role() = 'teacher' and exists (
      select 1 from public.teacher_subject_assignments tsa where tsa.school_id = quizzes.school_id
        and tsa.teacher_id = (select auth.uid()) and tsa.subject_id = quizzes.subject_id
        and (quizzes.class_id is null or tsa.class_id = quizzes.class_id)
    ))
  )
);
drop policy if exists quizzes_staff_update on public.quizzes;
create policy quizzes_staff_update on public.quizzes for update to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
    and (private.current_role() = 'school_admin' or created_by = (select auth.uid())))
  with check (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
    and (private.current_role() = 'school_admin' or created_by = (select auth.uid()))
    and (private.current_role() = 'school_admin' or exists (
      select 1 from public.teacher_subject_assignments tsa where tsa.school_id = quizzes.school_id
        and tsa.teacher_id = (select auth.uid()) and tsa.subject_id = quizzes.subject_id
        and (quizzes.class_id is null or tsa.class_id = quizzes.class_id)
    ))
  );

drop policy if exists quizzes_staff_delete on public.quizzes;
create policy quizzes_staff_delete on public.quizzes for delete to authenticated using (
  school_id = private.current_school_id() and (private.current_role() = 'school_admin' or created_by = (select auth.uid()))
  and not exists (select 1 from public.quiz_results r where r.quiz_id = quizzes.id)
);
drop policy if exists quiz_questions_staff_update on public.quiz_questions;
create policy quiz_questions_staff_update on public.quiz_questions for update to authenticated
  using (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
  ))
  with check (private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
  ));
drop policy if exists quiz_questions_staff_delete on public.quiz_questions;
create policy quiz_questions_staff_delete on public.quiz_questions for delete to authenticated using (
  private.current_role() in ('school_admin','teacher') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
  )
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('subject-resources','subject-resources',false,52428800,
  array['application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy subject_resource_files_read on storage.objects for select to authenticated using (
  bucket_id = 'subject-resources' and exists (
    select 1 from public.subject_resources r where r.file_path = name and r.school_id = private.current_school_id()
  )
);
create policy subject_resource_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'subject-resources' and (storage.foldername(name))[1] = private.current_school_id()::text
  and private.current_role() in ('school_admin','teacher')
);
create policy subject_resource_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'subject-resources' and (storage.foldername(name))[1] = private.current_school_id()::text
  and private.current_role() in ('school_admin','teacher')
);

drop function if exists public.get_quiz_questions(uuid);
drop function if exists public.submit_quiz(uuid,jsonb);
create function public.get_quiz_questions(p_quiz_id uuid)
returns table(id uuid, question_text text, options jsonb, points integer, question_type text, sort_order integer, session_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; session public.quiz_attempt_sessions; next_attempt integer;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id = p_quiz_id and school_id = student.school_id and published = true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  if quiz.opens_at is not null and now() < quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  if quiz.due_at is not null and now() > quiz.due_at then raise exception 'The submission deadline has passed.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || student.id::text, 0));
  select greatest(
    (select count(*) from public.quiz_results r where r.quiz_id = quiz.id and r.student_id = student.id),
    (select count(*) from public.quiz_attempt_sessions a where a.quiz_id = quiz.id and a.student_id = student.id)
  ) + 1 into next_attempt;
  select * into session from public.quiz_attempt_sessions a
    where a.quiz_id = quiz.id and a.student_id = student.id and a.submitted_at is null and a.expires_at >= now()
    order by a.started_at desc limit 1;
  if session.id is null and next_attempt > quiz.max_attempts then raise exception 'No attempts remaining.'; end if;
  if session.id is null then
    insert into public.quiz_attempt_sessions(quiz_id, student_id, attempt_number, expires_at)
    values (quiz.id, student.id, next_attempt, least(now() + make_interval(mins => quiz.time_limit_minutes), coalesce(quiz.due_at, 'infinity'::timestamptz)))
    returning * into session;
  end if;
  return query select q.id, q.question_text,
    case when quiz.shuffle_options then (
      select jsonb_agg(jsonb_build_object('index',x.original_index,'text',x.option_value) order by x.sort_key) from (
        select e.value as option_value, e.ordinality - 1 as original_index,
          md5(session.id::text || q.id::text || e.value::text) as sort_key
        from jsonb_array_elements(q.options) with ordinality e(value, ordinality)
      ) x
    ) else (select jsonb_agg(jsonb_build_object('index',e.ordinality - 1,'text',e.value)) from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) end,
    q.points, q.question_type, q.sort_order, session.id, session.expires_at
  from public.quiz_questions q where q.quiz_id = quiz.id order by
    case when quiz.shuffle_questions then md5(quiz.id::text || student.id::text || q.id::text) else lpad(q.sort_order::text, 10, '0') end;
end $$;

create function public.submit_quiz(p_quiz_id uuid, p_answers jsonb, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; question public.quiz_questions; answer text;
  points_total numeric := 0; score_total numeric := 0; attempt_no integer; has_review boolean := false;
  result public.quiz_results; correct boolean; earned numeric; session public.quiz_attempt_sessions;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Answers must be submitted as a question map.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id = p_quiz_id and school_id = student.school_id and published = true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  if quiz.opens_at is not null and now() < quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || student.id::text, 0));
  select * into session from public.quiz_attempt_sessions a where a.id = p_session_id and a.quiz_id = quiz.id and a.student_id = student.id for update;
  if session.id is null or session.submitted_at is not null then raise exception 'Assessment session is invalid or already submitted.'; end if;
  if now() > session.expires_at + interval '10 seconds' then raise exception 'Assessment time has expired. Contact your teacher if you were disconnected.'; end if;
  attempt_no := session.attempt_number;
  for question in select q.* from public.quiz_questions q where q.quiz_id = quiz.id loop
    points_total := points_total + greatest(coalesce(question.points, 1), 0);
  end loop;
  if points_total = 0 then raise exception 'This assessment has no questions.'; end if;
  insert into public.quiz_results(quiz_id, student_id, score, total_points, attempt_number, needs_review, published)
  values (quiz.id, student.id, 0, points_total, attempt_no, false, true) returning * into result;
  for question in select q.* from public.quiz_questions q where q.quiz_id = quiz.id loop
    answer := p_answers->>question.id::text;
    earned := 0; correct := null;
    if question.question_type in ('mcq','true_false') then
      if answer ~ '^[0-9]+$' then correct := answer::integer = question.correct_option_index; else correct := false; end if;
      if correct then earned := greatest(coalesce(question.points,1),0); end if;
      score_total := score_total + earned;
    elsif answer is not null and btrim(answer) <> '' then has_review := true;
    end if;
    insert into public.quiz_answers(result_id, question_id, answer_value, earned_points, is_correct)
    values (result.id, question.id, answer, earned, correct);
  end loop;
  update public.quiz_results set score = score_total, needs_review = has_review where id = result.id returning * into result;
  update public.quiz_attempt_sessions set submitted_at = now() where id = session.id;
  insert into public.notifications(school_id,user_id,title,body,type)
  values (quiz.school_id,(select auth.uid()),'Assessment submitted: ' || quiz.title,
    case when has_review then 'Your MCQ score is ' || score_total || '/' || points_total || '. Written responses are awaiting teacher review.'
      else 'Your score is ' || score_total || '/' || points_total || '.' end,'academic');
  if quiz.show_answers_after_submit and not has_review then
    return jsonb_build_object('result',to_jsonb(result),'answers',(
      select jsonb_agg(jsonb_build_object('question_id',q.id,'correct_option_index',q.correct_option_index,'explanation',q.explanation))
      from public.quiz_questions q where q.quiz_id = quiz.id and q.question_type in ('mcq','true_false')
    ));
  end if;
  return jsonb_build_object('result',to_jsonb(result),'answers',null);
end $$;
revoke all on function public.get_quiz_questions(uuid) from public, anon;
revoke all on function public.submit_quiz(uuid, jsonb, uuid) from public, anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb, uuid) to authenticated;

create or replace function public.grade_quiz_answer(p_answer_id uuid, p_points numeric, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare answer_row public.quiz_answers; result_row public.quiz_results; question_row public.quiz_questions; quiz_row public.quizzes;
  new_score numeric; still_pending boolean;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then raise exception 'Staff access is required.'; end if;
  select a.* into answer_row from public.quiz_answers a where a.id = p_answer_id for update;
  select q.* into question_row from public.quiz_questions q where q.id = answer_row.question_id;
  select r.* into result_row from public.quiz_results r where r.id = answer_row.result_id;
  select q.* into quiz_row from public.quizzes q where q.id = result_row.quiz_id;
  if answer_row.id is null or quiz_row.school_id is distinct from (select private.current_school_id())
    or ((select private.current_role()) = 'teacher' and quiz_row.created_by is distinct from (select auth.uid())) then raise exception 'Answer not found or access denied.'; end if;
  if p_points is null or p_points < 0 or p_points > greatest(question_row.points,0) then raise exception 'Mark is outside the question point range.'; end if;
  update public.quiz_answers set earned_points = p_points, teacher_feedback = p_feedback, graded_by = (select auth.uid()), graded_at = now()
    where id = p_answer_id;
  select coalesce(sum(a.earned_points),0) into new_score from public.quiz_answers a where a.result_id = result_row.id;
  select exists(select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
    where a.result_id = result_row.id and q.question_type not in ('mcq','true_false') and a.graded_at is null) into still_pending;
  update public.quiz_results set score = new_score, needs_review = still_pending where id = result_row.id;
  insert into public.notifications(school_id,user_id,title,body,type)
  select quiz_row.school_id,s.profile_id,'Assessment feedback: ' || quiz_row.title,
    'Your written answer has been marked. Current score: ' || new_score || '/' || result_row.total_points || '.', 'academic'
  from public.students s where s.id = result_row.student_id and s.profile_id is not null;
end $$;
revoke all on function public.grade_quiz_answer(uuid,numeric,text) from public, anon;
grant execute on function public.grade_quiz_answer(uuid,numeric,text) to authenticated;

create or replace function public.notify_new_assessment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.published then
      insert into public.notifications(school_id,user_id,title,body,type)
      select new.school_id,recipient.user_id,'New ' || upper(new.assessment_type) || ': ' || new.title,
        'Subject: ' || coalesce((select name from public.subjects where id = new.subject_id),'General') ||
        coalesce(' · Unit: ' || nullif(new.unit_title,''),'') || coalesce(' · Due: ' || to_char(new.due_at,'YYYY-MM-DD HH24:MI'),'') , 'academic'
      from (select distinct user_id from (
        select s.profile_id as user_id from public.students s where s.school_id = new.school_id and s.profile_id is not null and (new.class_id is null or s.class_id = new.class_id)
        union select g.guardian_id from public.student_guardians g join public.students s on s.id = g.student_id where s.school_id = new.school_id and (new.class_id is null or s.class_id = new.class_id)
      ) audience) recipient;
    end if;
  elsif new.published and old.published is distinct from new.published then
    insert into public.notifications(school_id,user_id,title,body,type)
    select new.school_id,recipient.user_id,'New ' || upper(new.assessment_type) || ': ' || new.title,
      'Subject: ' || coalesce((select name from public.subjects where id = new.subject_id),'General') ||
      coalesce(' · Unit: ' || nullif(new.unit_title,''),'') || coalesce(' · Due: ' || to_char(new.due_at,'YYYY-MM-DD HH24:MI'),'') , 'academic'
    from (select distinct user_id from (
      select s.profile_id as user_id from public.students s where s.school_id = new.school_id and s.profile_id is not null and (new.class_id is null or s.class_id = new.class_id)
      union select g.guardian_id from public.student_guardians g join public.students s on s.id = g.student_id where s.school_id = new.school_id and (new.class_id is null or s.class_id = new.class_id)
    ) audience) recipient;
  end if;
  return new;
end $$;
drop trigger if exists tr_notify_new_assessment on public.quizzes;
create trigger tr_notify_new_assessment after insert or update on public.quizzes
for each row execute function public.notify_new_assessment();

-- END supabase/031_subject_assessments_and_resources.sql


-- ============================================================================
-- BEGIN supabase/032_assessment_tools_and_integrity.sql
-- ============================================================================

-- Question bank, learner accommodations, review appeals, integrity events and assessment audit.
create table if not exists public.quiz_question_bank (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  unit_title text not null,
  question_text text not null,
  question_type text not null check (question_type in ('mcq','true_false','short_answer')),
  options jsonb not null default '[]'::jsonb,
  correct_option_index integer not null default 0,
  points integer not null default 1 check (points > 0),
  explanation text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.quiz_question_bank enable row level security;
create policy quiz_question_bank_read_staff on public.quiz_question_bank for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
);
create policy quiz_question_bank_insert_staff on public.quiz_question_bank for insert to authenticated with check (
  school_id = private.current_school_id() and created_by = (select auth.uid())
  and (private.current_role() = 'school_admin' or (private.current_role() = 'teacher' and exists (
    select 1 from public.teacher_subject_assignments tsa where tsa.school_id = quiz_question_bank.school_id
      and tsa.teacher_id = (select auth.uid()) and tsa.subject_id = quiz_question_bank.subject_id
  )))
);
create policy quiz_question_bank_delete_staff on public.quiz_question_bank for delete to authenticated using (
  school_id = private.current_school_id() and (private.current_role() = 'school_admin' or created_by = (select auth.uid()))
);

create table if not exists public.quiz_accommodations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  extra_time_minutes integer not null default 0 check (extra_time_minutes between 0 and 600),
  extra_attempts integer not null default 0 check (extra_attempts between 0 and 5),
  deadline_override timestamptz,
  note text,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique(quiz_id, student_id)
);
alter table public.quiz_accommodations enable row level security;
create policy quiz_accommodations_read_staff on public.quiz_accommodations for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and (private.current_role() = 'school_admin' or exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.created_by = (select auth.uid())
  ))
);
create policy quiz_accommodations_manage_staff on public.quiz_accommodations for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
    and (private.current_role() = 'school_admin' or (private.can_view_student(student_id) and exists (select 1 from public.quizzes q where q.id = quiz_id and q.created_by = (select auth.uid())))))
  with check (school_id = private.current_school_id() and updated_by = (select auth.uid()) and private.current_role() in ('school_admin','teacher')
    and (private.current_role() = 'school_admin' or (private.can_view_student(student_id) and exists (select 1 from public.quizzes q where q.id = quiz_id and q.created_by = (select auth.uid()))))
    and exists (select 1 from public.quizzes q join public.students s on s.school_id = q.school_id
      where q.id = quiz_id and s.id = student_id and q.school_id = quiz_accommodations.school_id));

create or replace function public.get_my_quiz_accommodations()
returns table(quiz_id uuid, extra_time_minutes integer, extra_attempts integer, deadline_override timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.quiz_id, a.extra_time_minutes, a.extra_attempts, a.deadline_override
  from public.quiz_accommodations a
  join public.students s on s.id = a.student_id
  where s.profile_id = (select auth.uid())
    and s.school_id = private.current_school_id()
    and private.current_role() = 'student';
$$;
revoke all on function public.get_my_quiz_accommodations() from public, anon;
grant execute on function public.get_my_quiz_accommodations() to authenticated;

create table if not exists public.quiz_appeals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  result_id uuid not null references public.quiz_results(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 5 and 1500),
  status text not null default 'pending' check (status in ('pending','reviewed','adjusted','declined')),
  response text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(result_id, student_id)
);
alter table public.quiz_appeals enable row level security;
create policy quiz_appeals_read_related on public.quiz_appeals for select to authenticated using (
  private.can_view_student(student_id)
);
create policy quiz_appeals_student_insert on public.quiz_appeals for insert to authenticated with check (
  private.current_role() = 'student' and student_id in (select s.id from public.students s where s.profile_id = (select auth.uid()) and s.school_id = private.current_school_id())
  and exists (select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id where r.id = quiz_appeals.result_id and r.student_id = quiz_appeals.student_id and q.school_id = quiz_appeals.school_id)
);
create policy quiz_appeals_staff_update on public.quiz_appeals for update to authenticated
  using (private.current_role() in ('teacher','school_admin') and school_id = private.current_school_id()
    and (private.current_role() = 'school_admin' or exists (select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id where r.id = result_id and q.created_by = (select auth.uid()))))
  with check (private.current_role() in ('teacher','school_admin') and school_id = private.current_school_id()
    and reviewed_by = (select auth.uid())
    and (private.current_role() = 'school_admin' or exists (select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id where r.id = result_id and q.created_by = (select auth.uid()))));
create unique index if not exists quiz_appeals_one_pending_per_result on public.quiz_appeals(result_id, student_id);

create table if not exists public.quiz_mark_changes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  appeal_id uuid not null references public.quiz_appeals(id) on delete cascade,
  result_id uuid not null references public.quiz_results(id) on delete cascade,
  previous_score numeric not null,
  adjusted_score numeric not null,
  reason text not null,
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.quiz_mark_changes enable row level security;
create policy quiz_mark_changes_read_staff on public.quiz_mark_changes for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and (private.current_role() = 'school_admin' or exists (
    select 1 from public.quiz_results r join public.quizzes q on q.id = r.quiz_id
    where r.id = result_id and q.created_by = (select auth.uid())
  ))
);
revoke insert, update, delete on public.quiz_mark_changes from authenticated;

create or replace function public.resolve_quiz_appeal(p_appeal_id uuid, p_status text, p_response text, p_adjusted_score numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare appeal_row public.quiz_appeals; result_row public.quiz_results; quiz_row public.quizzes;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then raise exception 'Staff access is required.'; end if;
  if p_status not in ('reviewed','adjusted','declined') or length(trim(coalesce(p_response,''))) < 3 then raise exception 'Provide a decision and response.'; end if;
  select * into appeal_row from public.quiz_appeals a where a.id = p_appeal_id for update;
  select * into result_row from public.quiz_results r where r.id = appeal_row.result_id for update;
  select * into quiz_row from public.quizzes q where q.id = result_row.quiz_id;
  if appeal_row.id is null or appeal_row.school_id is distinct from (select private.current_school_id())
    or ((select private.current_role()) = 'teacher' and quiz_row.created_by is distinct from (select auth.uid())) then raise exception 'Appeal not found or access denied.'; end if;
  if p_status = 'adjusted' then
    if p_adjusted_score is null or p_adjusted_score < 0 or p_adjusted_score > result_row.total_points then raise exception 'Adjusted score must be between zero and the assessment total.'; end if;
    if p_adjusted_score is distinct from result_row.score then
      insert into public.quiz_mark_changes(school_id,appeal_id,result_id,previous_score,adjusted_score,reason,changed_by)
      values (appeal_row.school_id,appeal_row.id,result_row.id,result_row.score,p_adjusted_score,trim(p_response),(select auth.uid()));
      update public.quiz_results set score = p_adjusted_score where id = result_row.id;
    end if;
  end if;
  update public.quiz_appeals set status = p_status,response = trim(p_response),reviewed_by = (select auth.uid()),reviewed_at = now() where id = appeal_row.id;
end $$;
revoke all on function public.resolve_quiz_appeal(uuid,text,text,numeric) from public, anon;
grant execute on function public.resolve_quiz_appeal(uuid,text,text,numeric) to authenticated;

create table if not exists public.quiz_integrity_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_attempt_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('tab_hidden','tab_visible','offline','online','window_blur','window_focus')),
  occurred_at timestamptz not null default now()
);
alter table public.quiz_integrity_events enable row level security;
create policy quiz_integrity_events_read_related on public.quiz_integrity_events for select to authenticated using (
  exists (select 1 from public.quiz_attempt_sessions a where a.id = session_id and private.can_view_student(a.student_id))
);
create policy quiz_attempt_sessions_read_staff on public.quiz_attempt_sessions for select to authenticated using (
  private.current_role() in ('teacher','school_admin') and exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin' or q.created_by = (select auth.uid()))
  )
);
revoke insert, update, delete on public.quiz_integrity_events from authenticated;

create or replace function public.record_quiz_integrity_event(p_session_id uuid, p_event_type text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select private.current_role()) is distinct from 'student'
    or p_event_type not in ('tab_hidden','tab_visible','offline','online','window_blur','window_focus')
    or not exists (select 1 from public.quiz_attempt_sessions a join public.students s on s.id = a.student_id
      where a.id = p_session_id and s.profile_id = (select auth.uid()) and a.submitted_at is null and a.expires_at >= now()) then
    raise exception 'Invalid assessment integrity event.';
  end if;
  insert into public.quiz_integrity_events(session_id,event_type) values (p_session_id,p_event_type);
end $$;
revoke all on function public.record_quiz_integrity_event(uuid,text) from public, anon;
grant execute on function public.record_quiz_integrity_event(uuid,text) to authenticated;

create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns table(id uuid, question_text text, options jsonb, points integer, question_type text, sort_order integer, session_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; session public.quiz_attempt_sessions;
  accommodation public.quiz_accommodations; next_attempt integer; effective_due timestamptz; effective_attempts integer;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id = p_quiz_id and school_id = student.school_id and published = true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  select * into accommodation from public.quiz_accommodations a where a.quiz_id = quiz.id and a.student_id = student.id;
  effective_due := coalesce(accommodation.deadline_override,quiz.due_at);
  effective_attempts := quiz.max_attempts + coalesce(accommodation.extra_attempts,0);
  if quiz.opens_at is not null and now() < quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  if effective_due is not null and now() > effective_due then raise exception 'The submission deadline has passed.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || student.id::text, 0));
  select greatest((select count(*) from public.quiz_results r where r.quiz_id = quiz.id and r.student_id = student.id),
    (select count(*) from public.quiz_attempt_sessions a where a.quiz_id = quiz.id and a.student_id = student.id)) + 1 into next_attempt;
  select * into session from public.quiz_attempt_sessions a where a.quiz_id = quiz.id and a.student_id = student.id and a.submitted_at is null and a.expires_at >= now() order by a.started_at desc limit 1;
  if session.id is null and next_attempt > effective_attempts then raise exception 'No attempts remaining.'; end if;
  if session.id is null then
    insert into public.quiz_attempt_sessions(quiz_id,student_id,attempt_number,expires_at)
    values (quiz.id,student.id,next_attempt,least(now() + make_interval(mins => quiz.time_limit_minutes + coalesce(accommodation.extra_time_minutes,0)),coalesce(effective_due,'infinity'::timestamptz))) returning * into session;
  end if;
  return query select q.id,q.question_text,
    case when quiz.shuffle_options then (select jsonb_agg(jsonb_build_object('index',x.original_index,'text',x.option_value) order by x.sort_key) from (
      select e.value as option_value,e.ordinality - 1 as original_index,md5(session.id::text || q.id::text || e.value::text) as sort_key
      from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) x)
      else (select jsonb_agg(jsonb_build_object('index',e.ordinality - 1,'text',e.value)) from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) end,
    q.points,q.question_type,q.sort_order,session.id,session.expires_at from public.quiz_questions q where q.quiz_id = quiz.id
    order by case when quiz.shuffle_questions then md5(quiz.id::text || student.id::text || q.id::text) else lpad(q.sort_order::text,10,'0') end;
end $$;
revoke all on function public.get_quiz_questions(uuid) from public, anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated;

create or replace function public.notify_assessment_result_to_families()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quiz_row public.quizzes; school uuid; result_title text;
begin
  if old.score is not distinct from new.score and old.needs_review is not distinct from new.needs_review then return new; end if;
  select q.* into quiz_row from public.quizzes q where q.id = new.quiz_id;
  result_title := case when new.needs_review then 'Assessment submitted for review: ' else 'Assessment marked: ' end || quiz_row.title;
  insert into public.notifications(school_id,user_id,title,body,type)
  select quiz_row.school_id,g.guardian_id,result_title,
    case when new.needs_review then 'MCQ score: ' || new.score || '/' || new.total_points || '. Written work is awaiting marking.'
      else 'Score: ' || new.score || '/' || new.total_points || '.' end,'academic'
  from public.student_guardians g where g.student_id = new.student_id;
  return new;
end $$;
drop trigger if exists tr_notify_assessment_result_to_families on public.quiz_results;
create trigger tr_notify_assessment_result_to_families after update on public.quiz_results
for each row execute function public.notify_assessment_result_to_families();

create or replace function public.notify_assessment_appeal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quiz_row public.quizzes; student_profile uuid;
begin
  select q.* into quiz_row from public.quiz_results r join public.quizzes q on q.id = r.quiz_id where r.id = new.result_id;
  if tg_op = 'INSERT' then
    if quiz_row.created_by is not null then
      insert into public.notifications(school_id,user_id,title,body,type)
      values (new.school_id,quiz_row.created_by,'Mark appeal: ' || quiz_row.title,'A student requested a review of their assessment mark.','academic');
    end if;
  elsif old.status is distinct from new.status then
    select profile_id into student_profile from public.students where id = new.student_id;
    if student_profile is not null then
      insert into public.notifications(school_id,user_id,title,body,type)
      values (new.school_id,student_profile,'Mark appeal updated: ' || quiz_row.title,coalesce(new.response,'Your mark review has been updated.'),'academic');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tr_notify_assessment_appeal on public.quiz_appeals;
create trigger tr_notify_assessment_appeal after insert or update on public.quiz_appeals
for each row execute function public.notify_assessment_appeal();

create or replace function public.audit_assessment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_row jsonb; new_row jsonb; row_data jsonb; quiz_key uuid; school_key uuid; result_key uuid; record_key uuid;
begin
  old_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_data := coalesce(new_row,old_row);
  if tg_table_name = 'quizzes' then quiz_key := (row_data->>'id')::uuid;
  elsif tg_table_name = 'quiz_questions' then quiz_key := (row_data->>'quiz_id')::uuid;
  elsif tg_table_name = 'quiz_results' then quiz_key := (row_data->>'quiz_id')::uuid; result_key := (row_data->>'id')::uuid;
  elsif tg_table_name = 'quiz_answers' then
    select r.quiz_id,r.id into quiz_key,result_key from public.quiz_results r where r.id = (row_data->>'result_id')::uuid;
  end if;
  select q.school_id into school_key from public.quizzes q where q.id = quiz_key;
  record_key := coalesce((row_data->>'id')::uuid,result_key,quiz_key);
  insert into public.audit_logs(school_id,actor_id,action,table_name,record_id,old_data,new_data)
  values (school_key,(select auth.uid()),tg_op,'assessment:' || tg_table_name,record_key,old_row,new_row);
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists audit_assessment_quizzes on public.quizzes;
create trigger audit_assessment_quizzes after insert or update or delete on public.quizzes for each row execute function public.audit_assessment_change();
drop trigger if exists audit_assessment_questions on public.quiz_questions;
create trigger audit_assessment_questions after insert or update or delete on public.quiz_questions for each row execute function public.audit_assessment_change();
drop trigger if exists audit_assessment_results on public.quiz_results;
create trigger audit_assessment_results after insert or update or delete on public.quiz_results for each row execute function public.audit_assessment_change();
drop trigger if exists audit_assessment_answers on public.quiz_answers;
create trigger audit_assessment_answers after insert or update or delete on public.quiz_answers for each row execute function public.audit_assessment_change();

-- END supabase/032_assessment_tools_and_integrity.sql


-- ============================================================================
-- BEGIN supabase/033_assessment_reliability_and_feedback.sql
-- ============================================================================

-- Assessment resume, controlled result release, question metadata and moderation support.
alter table public.quizzes add column if not exists results_release_at timestamptz;
alter table public.quiz_questions add column if not exists topic_tags text[] not null default '{}'::text[];
alter table public.quiz_questions add column if not exists difficulty text not null default 'medium'
  check (difficulty in ('easy','medium','hard'));
alter table public.quiz_questions add column if not exists rubric jsonb not null default '[]'::jsonb;
alter table public.quiz_questions add column if not exists pool_group text;
alter table public.quiz_questions add column if not exists pool_pick_count integer not null default 1 check (pool_pick_count between 1 and 100);
alter table public.quiz_question_bank add column if not exists topic_tags text[] not null default '{}'::text[];
alter table public.quiz_question_bank add column if not exists difficulty text not null default 'medium'
  check (difficulty in ('easy','medium','hard'));
alter table public.quiz_question_bank add column if not exists rubric jsonb not null default '[]'::jsonb;

-- Student scores are readable only after the teacher's release time (unless unreleased time is null).
drop policy if exists quiz_results_read_related on public.quiz_results;
create policy quiz_results_read_related on public.quiz_results for select to authenticated using (
  private.can_view_student(student_id) and exists (
    select 1 from public.quizzes q where q.id = quiz_id
      and (private.current_role() in ('teacher','school_admin','super_admin') or q.results_release_at is null or q.results_release_at <= now())
  )
);

-- A future score release must also redact the score from the submit RPC response.
create or replace function public.get_quiz_questions(p_quiz_id uuid)
returns table(id uuid, question_text text, options jsonb, points integer, question_type text, sort_order integer, session_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; session public.quiz_attempt_sessions; accommodation public.quiz_accommodations;
  next_attempt integer; effective_due timestamptz; effective_attempts integer;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id=p_quiz_id and school_id=student.school_id and published=true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  select * into accommodation from public.quiz_accommodations a where a.quiz_id=quiz.id and a.student_id=student.id;
  effective_due:=coalesce(accommodation.deadline_override,quiz.due_at); effective_attempts:=quiz.max_attempts+coalesce(accommodation.extra_attempts,0);
  if quiz.opens_at is not null and now()<quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  if effective_due is not null and now()>effective_due then raise exception 'The submission deadline has passed.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text||student.id::text,0));
  select greatest((select count(*) from public.quiz_results r where r.quiz_id=quiz.id and r.student_id=student.id),(select count(*) from public.quiz_attempt_sessions a where a.quiz_id=quiz.id and a.student_id=student.id))+1 into next_attempt;
  select * into session from public.quiz_attempt_sessions a where a.quiz_id=quiz.id and a.student_id=student.id and a.submitted_at is null and a.expires_at>=now() order by a.started_at desc limit 1;
  if session.id is null and next_attempt>effective_attempts then raise exception 'No attempts remaining.'; end if;
  if session.id is null then
    insert into public.quiz_attempt_sessions(quiz_id,student_id,attempt_number,expires_at) values(quiz.id,student.id,next_attempt,least(now()+make_interval(mins=>quiz.time_limit_minutes+coalesce(accommodation.extra_time_minutes,0)),coalesce(effective_due,'infinity'::timestamptz))) returning * into session;
  end if;
  if session.selected_question_ids is null then
    if exists(select 1 from public.quiz_questions q where q.quiz_id=quiz.id and q.pool_group is not null group by q.pool_group having min(q.pool_pick_count)<>max(q.pool_pick_count) or min(q.pool_pick_count)>count(*)) then
      raise exception 'Assessment question pool configuration is invalid.';
    end if;
    update public.quiz_attempt_sessions a set selected_question_ids=array(
      select chosen.id from (
        select q.id from public.quiz_questions q where q.quiz_id=quiz.id and q.pool_group is null
        union all
        select ranked.id from (select q.id,min(q.pool_pick_count) over(partition by q.pool_group) as take_count,row_number() over(partition by q.pool_group order by md5(session.id::text||q.id::text)) as pos from public.quiz_questions q where q.quiz_id=quiz.id and q.pool_group is not null) ranked where ranked.pos<=ranked.take_count
      ) chosen
    ) where a.id=session.id returning * into session;
  end if;
  return query select q.id,q.question_text,
    case when quiz.shuffle_options then (select jsonb_agg(jsonb_build_object('index',x.orig,'text',x.val) order by x.k) from (select e.value val,e.ordinality-1 orig,md5(session.id::text||q.id::text||e.value::text) k from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) x)
    else (select jsonb_agg(jsonb_build_object('index',e.ordinality-1,'text',e.value)) from jsonb_array_elements(q.options) with ordinality e(value,ordinality)) end,
    q.points,q.question_type,q.sort_order,session.id,session.expires_at from public.quiz_questions q where q.quiz_id=quiz.id and q.id=any(session.selected_question_ids)
    order by case when quiz.shuffle_questions then md5(quiz.id::text||student.id::text||q.id::text) else lpad(q.sort_order::text,10,'0') end;
end $$;
revoke all on function public.get_quiz_questions(uuid) from public,anon;
grant execute on function public.get_quiz_questions(uuid) to authenticated;

create or replace function public.submit_quiz(p_quiz_id uuid, p_answers jsonb, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare student public.students; quiz public.quizzes; question public.quiz_questions; answer text;
  points_total numeric := 0; score_total numeric := 0; attempt_no integer; has_review boolean := false;
  result public.quiz_results; correct boolean; earned numeric; session public.quiz_attempt_sessions;
  released_result jsonb;
begin
  if (select private.current_role()) is distinct from 'student' then raise exception 'Student portal access is required.'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then raise exception 'Answers must be submitted as a question map.'; end if;
  select * into student from public.students where profile_id = (select auth.uid()) and school_id = (select private.current_school_id()) limit 1;
  select * into quiz from public.quizzes where id = p_quiz_id and school_id = student.school_id and published = true;
  if student.id is null or quiz.id is null then raise exception 'Assessment not found.'; end if;
  if quiz.class_id is not null and quiz.class_id is distinct from student.class_id then raise exception 'This assessment is for another class.'; end if;
  if quiz.opens_at is not null and now() < quiz.opens_at then raise exception 'This assessment has not opened yet.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || student.id::text, 0));
  select * into session from public.quiz_attempt_sessions a where a.id = p_session_id and a.quiz_id = quiz.id and a.student_id = student.id for update;
  if session.id is null or session.submitted_at is not null then raise exception 'Assessment session is invalid or already submitted.'; end if;
  if now() > session.expires_at + interval '10 seconds' then raise exception 'Assessment time has expired. Contact your teacher if you were disconnected.'; end if;
  attempt_no := session.attempt_number;
  for question in select q.* from public.quiz_questions q where q.quiz_id = quiz.id and q.id = any(session.selected_question_ids) loop
    points_total := points_total + greatest(coalesce(question.points, 1), 0);
  end loop;
  if points_total = 0 then raise exception 'This assessment has no questions.'; end if;
  insert into public.quiz_results(quiz_id, student_id, score, total_points, attempt_number, needs_review, published)
  values (quiz.id, student.id, 0, points_total, attempt_no, false, true) returning * into result;
  for question in select q.* from public.quiz_questions q where q.quiz_id = quiz.id and q.id = any(session.selected_question_ids) loop
    answer := p_answers->>question.id::text; earned := 0; correct := null;
    if question.question_type in ('mcq','true_false') then
      if answer ~ '^[0-9]+$' then correct := answer::integer = question.correct_option_index; else correct := false; end if;
      if correct then earned := greatest(coalesce(question.points,1),0); end if;
      score_total := score_total + earned;
    elsif answer is not null and btrim(answer) <> '' then has_review := true;
    end if;
    insert into public.quiz_answers(result_id, question_id, answer_value, earned_points, is_correct)
    values (result.id, question.id, answer, earned, correct);
  end loop;
  update public.quiz_results set score = score_total, needs_review = has_review where id = result.id returning * into result;
  update public.quiz_attempt_sessions set submitted_at = now() where id = session.id;
  insert into public.notifications(school_id,user_id,title,body,type)
  values (quiz.school_id,(select auth.uid()),'Assessment submitted: ' || quiz.title,
    case when quiz.results_release_at is not null and quiz.results_release_at > now() then 'Your submission was received. Scores will be available after ' || to_char(quiz.results_release_at,'YYYY-MM-DD HH24:MI') || '.'
      when has_review then 'Your MCQ score is ' || score_total || '/' || points_total || '. Written responses are awaiting teacher review.'
      else 'Your score is ' || score_total || '/' || points_total || '.' end,'academic');
  if quiz.results_release_at is not null and quiz.results_release_at > now() then
    released_result := jsonb_set(jsonb_set(to_jsonb(result),'{score}','null'::jsonb),'{total_points}','null'::jsonb);
    return jsonb_build_object('result',released_result,'answers',null,'release_at',quiz.results_release_at);
  end if;
  if quiz.show_answers_after_submit and not has_review then
    return jsonb_build_object('result',to_jsonb(result),'answers',(
      select jsonb_agg(jsonb_build_object('question_id',q.id,'correct_option_index',q.correct_option_index,'explanation',q.explanation))
      from public.quiz_questions q where q.quiz_id = quiz.id and q.question_type in ('mcq','true_false')
    ));
  end if;
  return jsonb_build_object('result',to_jsonb(result),'answers',null);
end $$;
revoke all on function public.submit_quiz(uuid,jsonb,uuid) from public,anon;
grant execute on function public.submit_quiz(uuid,jsonb,uuid) to authenticated;

create or replace function public.notify_assessment_result_to_families()
returns trigger language plpgsql security definer set search_path = '' as $$
declare quiz_row public.quizzes; result_title text;
begin
  if tg_op = 'UPDATE' and old.score is not distinct from new.score and old.needs_review is not distinct from new.needs_review then return new; end if;
  select q.* into quiz_row from public.quizzes q where q.id = new.quiz_id;
  if quiz_row.results_release_at is not null and quiz_row.results_release_at > now() then return new; end if;
  result_title := case when new.needs_review then 'Assessment submitted for review: ' else 'Assessment marked: ' end || quiz_row.title;
  insert into public.notifications(school_id,user_id,title,body,type)
  select quiz_row.school_id,g.guardian_id,result_title,
    case when new.needs_review then 'MCQ score: ' || new.score || '/' || new.total_points || '. Written work is awaiting marking.'
      else 'Score: ' || new.score || '/' || new.total_points || '.' end,'academic'
  from public.student_guardians g where g.student_id = new.student_id;
  return new;
end $$;

create table if not exists public.quiz_answer_drafts (
  session_id uuid not null references public.quiz_attempt_sessions(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer_value text not null default '',
  updated_at timestamptz not null default now(),
  primary key(session_id, question_id)
);
alter table public.quiz_attempt_sessions add column if not exists selected_question_ids uuid[];
alter table public.quiz_answer_drafts enable row level security;
revoke all on public.quiz_answer_drafts from public, anon, authenticated;

create or replace function public.save_quiz_answer_drafts(p_session_id uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare student_id uuid; quiz_id uuid; question_entry record;
begin
  if (select private.current_role()) is distinct from 'student' or jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Student assessment draft is invalid.';
  end if;
  select a.student_id,a.quiz_id into student_id,quiz_id from public.quiz_attempt_sessions a
    join public.students s on s.id = a.student_id
    where a.id = p_session_id and s.profile_id = (select auth.uid()) and s.school_id = (select private.current_school_id())
      and a.submitted_at is null and a.expires_at >= now();
  if student_id is null then raise exception 'Assessment session has expired.'; end if;
  for question_entry in select key,value from jsonb_each_text(p_answers) loop
    if not exists (select 1 from public.quiz_questions q where q.id = question_entry.key::uuid and q.quiz_id = quiz_id) then
      raise exception 'Answer includes a question outside this assessment.';
    end if;
    insert into public.quiz_answer_drafts(session_id,question_id,answer_value)
      values (p_session_id,question_entry.key::uuid,question_entry.value)
      on conflict (session_id,question_id) do update set answer_value = excluded.answer_value,updated_at = now();
  end loop;
end $$;

create or replace function public.get_quiz_answer_drafts(p_session_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(d.question_id::text,d.answer_value),'{}'::jsonb)
  from public.quiz_answer_drafts d
  join public.quiz_attempt_sessions a on a.id = d.session_id
  join public.students s on s.id = a.student_id
  where a.id = p_session_id and s.profile_id = (select auth.uid())
    and s.school_id = (select private.current_school_id()) and a.submitted_at is null and a.expires_at >= now()
    and (select private.current_role()) = 'student';
$$;
revoke all on function public.save_quiz_answer_drafts(uuid,jsonb) from public, anon;
revoke all on function public.get_quiz_answer_drafts(uuid) from public, anon;
grant execute on function public.save_quiz_answer_drafts(uuid,jsonb) to authenticated;
grant execute on function public.get_quiz_answer_drafts(uuid) to authenticated;

create or replace function public.clear_quiz_answer_drafts_after_submit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.submitted_at is null and new.submitted_at is not null then
    delete from public.quiz_answer_drafts where session_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists clear_quiz_answer_drafts_after_submit on public.quiz_attempt_sessions;
create trigger clear_quiz_answer_drafts_after_submit after update of submitted_at on public.quiz_attempt_sessions
for each row execute function public.clear_quiz_answer_drafts_after_submit();

create table if not exists public.quiz_second_marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  answer_id uuid not null references public.quiz_answers(id) on delete cascade,
  marker_id uuid not null references public.profiles(id) on delete cascade,
  first_mark_points numeric not null,
  first_marker_id uuid references public.profiles(id) on delete set null,
  points numeric not null check (points >= 0),
  feedback text,
  created_at timestamptz not null default now(),
  unique(answer_id,marker_id)
);
alter table public.quiz_second_marks enable row level security;
create policy quiz_second_marks_staff_read on public.quiz_second_marks for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and exists (select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
    join public.quizzes z on z.id = q.quiz_id where a.id = answer_id
      and (private.current_role() = 'school_admin' or (z.created_by = (select auth.uid()) or marker_id = (select auth.uid())))
  )
);
revoke insert,update,delete on public.quiz_second_marks from public, anon, authenticated;

create or replace function public.submit_second_quiz_mark(p_answer_id uuid,p_points numeric,p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare answer_row public.quiz_answers; question_row public.quiz_questions; quiz_row public.quizzes; result_row public.quiz_results;
  original_mark record;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then raise exception 'Staff access is required.'; end if;
  select * into answer_row from public.quiz_answers where id = p_answer_id;
  select * into question_row from public.quiz_questions where id = answer_row.question_id;
  select * into quiz_row from public.quizzes where id = question_row.quiz_id;
  select * into result_row from public.quiz_results where id = answer_row.result_id;
  if answer_row.id is null or quiz_row.school_id is distinct from (select private.current_school_id())
    or (quiz_row.created_by = (select auth.uid()) and not exists(select 1 from public.quiz_second_marks own_mark where own_mark.answer_id = p_answer_id and own_mark.marker_id = (select auth.uid())))
    or (answer_row.graded_by = (select auth.uid()) and not exists(select 1 from public.quiz_second_marks own_mark where own_mark.answer_id = p_answer_id and own_mark.marker_id = (select auth.uid())))
    or (select private.current_role()) = 'teacher' and not exists (
      select 1 from public.teacher_subject_assignments t where t.school_id = quiz_row.school_id
        and t.teacher_id = (select auth.uid()) and t.subject_id = quiz_row.subject_id
    ) then raise exception 'Second marking is limited to another authorized teacher.'; end if;
  if p_points is null or p_points < 0 or p_points > question_row.points then raise exception 'Mark is outside the question point range.'; end if;
  insert into public.quiz_second_marks(school_id,answer_id,marker_id,first_mark_points,first_marker_id,points,feedback)
  values (quiz_row.school_id,p_answer_id,(select auth.uid()),answer_row.earned_points,answer_row.graded_by,p_points,p_feedback)
  on conflict (answer_id,marker_id) do update set points = excluded.points,feedback = excluded.feedback,created_at = now();
  select * into original_mark from public.quiz_second_marks m where m.answer_id = p_answer_id and m.marker_id = (select auth.uid());
  if original_mark.first_marker_id is distinct from (select auth.uid()) then
    update public.quiz_answers set earned_points = round((original_mark.first_mark_points + original_mark.points) / 2,2),
      teacher_feedback = coalesce(p_feedback,teacher_feedback),graded_at = now() where id = p_answer_id;
    update public.quiz_results r set score = (select coalesce(sum(a.earned_points),0) from public.quiz_answers a where a.result_id = r.id)
      where r.id = result_row.id;
  end if;
end $$;
revoke all on function public.submit_second_quiz_mark(uuid,numeric,text) from public,anon;
grant execute on function public.submit_second_quiz_mark(uuid,numeric,text) to authenticated;

create table if not exists public.quiz_key_corrections (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  previous_index integer not null,
  corrected_index integer not null,
  reason text not null,
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.quiz_key_corrections enable row level security;
create policy quiz_key_corrections_staff_read on public.quiz_key_corrections for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() in ('school_admin','teacher')
  and (private.current_role() = 'school_admin' or exists(select 1 from public.quizzes q where q.id = quiz_id and q.created_by = (select auth.uid())))
);
revoke insert,update,delete on public.quiz_key_corrections from public,anon,authenticated;

create or replace function public.correct_mcq_answer_key(p_question_id uuid,p_correct_index integer,p_explanation text,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare question_row public.quiz_questions; quiz_row public.quizzes;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then raise exception 'Staff access is required.'; end if;
  select * into question_row from public.quiz_questions where id = p_question_id for update;
  select * into quiz_row from public.quizzes where id = question_row.quiz_id;
  if question_row.id is null or quiz_row.school_id is distinct from (select private.current_school_id())
    or (select private.current_role()) = 'teacher' and quiz_row.created_by is distinct from (select auth.uid()) then raise exception 'Question not found or access denied.'; end if;
  if question_row.question_type not in ('mcq','true_false') or p_correct_index is null or p_correct_index < 0
    or p_correct_index >= jsonb_array_length(question_row.options) or length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'Choose a valid answer and explain the correction.';
  end if;
  if p_correct_index = question_row.correct_option_index then raise exception 'The corrected answer must differ from the current key.'; end if;
  insert into public.quiz_key_corrections(school_id,quiz_id,question_id,previous_index,corrected_index,reason,changed_by)
  values (quiz_row.school_id,quiz_row.id,question_row.id,question_row.correct_option_index,p_correct_index,trim(p_reason),(select auth.uid()));
  update public.quiz_questions set correct_option_index = p_correct_index, explanation = p_explanation where id = question_row.id;
  update public.quiz_answers a set is_correct = case when a.answer_value ~ '^[0-9]+$' then a.answer_value::integer = p_correct_index else false end,
    earned_points = case when a.answer_value ~ '^[0-9]+$' then case when a.answer_value::integer = p_correct_index then question_row.points else 0 end else 0 end
    where a.question_id = question_row.id and a.graded_at is null;
  update public.quiz_results r set score = totals.score from (
    select a.result_id,coalesce(sum(a.earned_points),0) as score from public.quiz_answers a
    join public.quiz_results linked on linked.id = a.result_id where a.question_id = question_row.id group by a.result_id
  ) totals where r.id = totals.result_id;
end $$;
revoke all on function public.correct_mcq_answer_key(uuid,integer,text,text) from public,anon;
grant execute on function public.correct_mcq_answer_key(uuid,integer,text,text) to authenticated;

-- END supabase/033_assessment_reliability_and_feedback.sql


-- ============================================================================
-- BEGIN supabase/034_notification_delivery_outbox.sql
-- ============================================================================

-- Queue outbound notification delivery without exposing provider credentials to
-- the browser. A server-side worker must claim and deliver these jobs.

alter table public.profiles
  add column if not exists delivery_preferences jsonb not null
  default '{"email":false,"sms":false,"whatsapp":false,"push":false}'::jsonb;

create schema if not exists private;
create table if not exists private.notification_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('email','sms','whatsapp','push')),
  state text not null default 'pending' check (state in ('pending','processing','sent','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)
);

create index if not exists notification_delivery_pending_idx
  on private.notification_delivery_outbox(available_at, created_at)
  where state in ('pending','failed');
create index if not exists notification_delivery_school_idx
  on private.notification_delivery_outbox(school_id, created_at desc);

alter table private.notification_delivery_outbox enable row level security;
revoke all on private.notification_delivery_outbox from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.notification_delivery_outbox to service_role;

create or replace function public.enqueue_notification_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare preferences jsonb;
begin
  select p.delivery_preferences into preferences
    from public.profiles p
    where p.id = new.user_id and p.school_id = new.school_id;

  if coalesce(preferences ->> 'email','false') = 'true' then
    insert into private.notification_delivery_outbox(notification_id,school_id,recipient_id,channel)
      values(new.id,new.school_id,new.user_id,'email') on conflict do nothing;
  end if;
  if coalesce(preferences ->> 'sms','false') = 'true' then
    insert into private.notification_delivery_outbox(notification_id,school_id,recipient_id,channel)
      values(new.id,new.school_id,new.user_id,'sms') on conflict do nothing;
  end if;
  if coalesce(preferences ->> 'whatsapp','false') = 'true' then
    insert into private.notification_delivery_outbox(notification_id,school_id,recipient_id,channel)
      values(new.id,new.school_id,new.user_id,'whatsapp') on conflict do nothing;
  end if;
  if coalesce(preferences ->> 'push','false') = 'true' then
    insert into private.notification_delivery_outbox(notification_id,school_id,recipient_id,channel)
      values(new.id,new.school_id,new.user_id,'push') on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_notification_delivery() from public, anon, authenticated;

drop trigger if exists enqueue_notification_delivery on public.notifications;
create trigger enqueue_notification_delivery
  after insert on public.notifications
  for each row execute function public.enqueue_notification_delivery();

-- Limit invitation bursts per school administrator without trusting browser
-- supplied limits or exposing the counter table to authenticated clients.
create table if not exists private.portal_invitation_attempts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  window_started_at timestamptz not null default date_trunc('hour',now()),
  attempts integer not null default 0 check (attempts >= 0),
  primary key(actor_id,school_id)
);
alter table private.portal_invitation_attempts enable row level security;
revoke all on private.portal_invitation_attempts from public, anon, authenticated;
grant select, insert, update, delete on private.portal_invitation_attempts to service_role;

create or replace function public.consume_portal_invitation_attempt(p_actor_id uuid,p_school_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_window timestamptz := date_trunc('hour',now()); next_attempt integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role is required.'; end if;
  insert into private.portal_invitation_attempts(actor_id,school_id,window_started_at,attempts)
    values(p_actor_id,p_school_id,current_window,1)
    on conflict(actor_id,school_id) do update set
      attempts = case when private.portal_invitation_attempts.window_started_at = current_window then private.portal_invitation_attempts.attempts + 1 else 1 end,
      window_started_at = current_window
    returning attempts into next_attempt;
  return next_attempt <= 20;
end;
$$;
revoke all on function public.consume_portal_invitation_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_portal_invitation_attempt(uuid,uuid) to service_role;

-- END supabase/034_notification_delivery_outbox.sql


-- ============================================================================
-- BEGIN supabase/035_timetable_teacher_management.sql
-- ============================================================================

-- Let teachers manage periods only for classes and subjects assigned to them.
drop policy if exists timetable_staff_insert on public.timetable;
drop policy if exists timetable_staff_update on public.timetable;
drop policy if exists timetable_staff_delete on public.timetable;

create policy timetable_staff_insert on public.timetable for insert to authenticated with check (
  school_id = private.current_school_id()
  and private.current_role() in ('school_admin', 'teacher')
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id
      and c.school_id = timetable.school_id
      and s.school_id = timetable.school_id
      and (
        private.current_role() = 'school_admin'
        or (
          timetable.teacher_id = (select auth.uid())
          and (
            c.teacher_id = (select auth.uid())
            or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id = (select auth.uid())
                and tsa.class_id = timetable.class_id
                and tsa.subject_id = timetable.subject_id
                and tsa.school_id = timetable.school_id
            )
          )
        )
      )
  )
);

create policy timetable_staff_update on public.timetable for update to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() in ('school_admin', 'teacher')
  and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid()))
)
with check (
  school_id = private.current_school_id()
  and private.current_role() in ('school_admin', 'teacher')
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id
      and c.school_id = timetable.school_id
      and s.school_id = timetable.school_id
      and (
        private.current_role() = 'school_admin'
        or (
          timetable.teacher_id = (select auth.uid())
          and (
            c.teacher_id = (select auth.uid())
            or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id = (select auth.uid())
                and tsa.class_id = timetable.class_id
                and tsa.subject_id = timetable.subject_id
                and tsa.school_id = timetable.school_id
            )
          )
        )
      )
  )
);

create policy timetable_staff_delete on public.timetable for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() in ('school_admin', 'teacher')
  and (private.current_role() = 'school_admin' or teacher_id = (select auth.uid()))
);

-- END supabase/035_timetable_teacher_management.sql


-- ============================================================================
-- BEGIN supabase/036_timetable_admin_only.sql
-- ============================================================================

-- Timetable editing belongs to school administrators (principal/head teacher accounts).
-- Teachers, students, and parents retain the relationship-based read policy.
drop policy if exists timetable_staff_insert on public.timetable;
drop policy if exists timetable_staff_update on public.timetable;
drop policy if exists timetable_staff_delete on public.timetable;

create policy timetable_admin_insert on public.timetable for insert to authenticated
with check (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id
      and c.school_id = timetable.school_id
      and s.school_id = timetable.school_id
  )
);

create policy timetable_admin_update on public.timetable for update to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
)
with check (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id
      and c.school_id = timetable.school_id
      and s.school_id = timetable.school_id
  )
);

create policy timetable_admin_delete on public.timetable for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
);

-- END supabase/036_timetable_admin_only.sql


-- ============================================================================
-- BEGIN supabase/037_hr_payroll_core.sql
-- ============================================================================

-- HR and payroll foundation. Sensitive payroll actions remain school-scoped.
create table if not exists public.school_hr_roles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hr_role text not null check (hr_role in ('principal','hr_admin','finance_officer','staff_member')),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, profile_id)
);

create table if not exists public.job_vacancies (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  title text not null, department text, description text, requirements text,
  status text not null default 'draft' check (status in ('draft','published','closed')),
  closes_at date, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  vacancy_id uuid not null references public.job_vacancies(id) on delete cascade,
  applicant_name text not null, email text not null, phone text, qualifications text, cv_path text,
  status text not null default 'received' check (status in ('received','shortlisted','interview','selected','rejected')),
  submitted_at timestamptz not null default now(), reviewed_by uuid references public.profiles(id), reviewed_at timestamptz
);
create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null, staff_number text not null,
  full_name text not null, email text, phone text, department text, job_title text not null,
  employment_status text not null default 'active' check (employment_status in ('active','on_leave','probation','suspended','terminated')),
  hire_date date, next_of_kin_name text, next_of_kin_phone text, qualifications text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, staff_number), unique (school_id, profile_id)
);
create table if not exists public.employment_contracts (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade, contract_type text not null,
  start_date date not null, end_date date, probation_end date, status text not null default 'draft' check (status in ('draft','active','expired','terminated')),
  document_path text, signed_at timestamptz, signed_by uuid references public.profiles(id), created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade, leave_type text not null,
  start_date date not null, end_date date not null, reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create table if not exists public.salary_structures (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  basic_salary numeric(12,2) not null check (basic_salary >= 0), allowances jsonb not null default '[]'::jsonb,
  deductions jsonb not null default '[]'::jsonb, payment_method text check (payment_method in ('bank','mpesa','cash','other')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  effective_from date not null, effective_to date, approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  pay_period date not null, status text not null default 'draft' check (status in ('draft','submitted','approved','paying','paid','closed','rejected')),
  version integer not null default 1 check (version > 0), currency_code text not null default 'KES',
  prepared_by uuid references public.profiles(id), submitted_at timestamptz, approved_at timestamptz, paid_at timestamptz,
  created_at timestamptz not null default now(), unique (school_id, pay_period)
);
create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  basic_salary numeric(12,2) not null check (basic_salary >= 0), allowances jsonb not null default '[]'::jsonb,
  deductions jsonb not null default '[]'::jsonb, gross_pay numeric(12,2) not null check (gross_pay >= 0),
  total_deductions numeric(12,2) not null check (total_deductions >= 0), net_pay numeric(12,2) not null check (net_pay >= 0),
  created_at timestamptz not null default now(), unique (payroll_run_id, employee_id)
);
create table if not exists public.payroll_approvals (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  payroll_version integer not null, approver_id uuid not null references public.profiles(id),
  approval_hash text not null, assurance_level text not null, decision text not null check (decision in ('approved','rejected')),
  notes text, created_at timestamptz not null default now()
);
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  payroll_item_id uuid not null references public.payroll_items(id) on delete restrict,
  provider text not null check (provider in ('bank','mpesa','cash','other')),
  transaction_reference text, amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','reversed')),
  initiated_by uuid references public.profiles(id), confirmed_at timestamptz, created_at timestamptz not null default now()
);
create unique index if not exists payment_one_success_per_item on public.payment_transactions(payroll_item_id) where status = 'paid';
create unique index if not exists payment_reference_unique_per_school on public.payment_transactions(school_id, provider, transaction_reference) where transaction_reference is not null;
create table if not exists public.hr_audit_events (
  id bigint generated always as identity primary key, school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid references public.profiles(id), action text not null, entity_type text not null,
  entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_hr_roles r
    where r.profile_id = (select auth.uid()) and r.school_id = target_school and r.hr_role = any(allowed_roles)
  );
$$;
revoke all on function private.has_hr_role(uuid,text[]) from public, anon;
grant execute on function private.has_hr_role(uuid,text[]) to authenticated;

alter table public.school_hr_roles enable row level security;
alter table public.job_vacancies enable row level security;
alter table public.job_applications enable row level security;
alter table public.hr_employees enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.salary_structures enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.payroll_approvals enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.hr_audit_events enable row level security;

create policy hr_roles_read on public.school_hr_roles for select to authenticated using (
  profile_id = (select auth.uid()) or private.has_hr_role(school_id, array['principal'])
);
create policy hr_roles_admin_manage on public.school_hr_roles for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.school_id = school_hr_roles.school_id and p.role = 'school_admin')
) with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.school_id = school_hr_roles.school_id and p.role = 'school_admin')
);

create policy vacancies_read on public.job_vacancies for select to authenticated using (
  school_id = private.current_school_id()
  and (status = 'published' or private.has_hr_role(school_id, array['principal','hr_admin']))
);
create policy vacancies_manage on public.job_vacancies for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));
create policy applications_manage on public.job_applications for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));

create policy employees_read on public.hr_employees for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) or profile_id = (select auth.uid())
);
create policy employees_manage on public.hr_employees for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));
create policy contracts_read on public.employment_contracts for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = employment_contracts.employee_id and e.profile_id = (select auth.uid())
  )
);
create policy contracts_manage on public.employment_contracts for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));
create policy leave_read on public.hr_leave_requests for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id and e.profile_id = (select auth.uid())
  )
);
create policy leave_create_self on public.hr_leave_requests for insert to authenticated with check (exists (
  select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id and e.profile_id = (select auth.uid()) and e.school_id = hr_leave_requests.school_id
));
create policy leave_review on public.hr_leave_requests for update to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (private.has_hr_role(school_id, array['principal','hr_admin']));

create policy salary_read on public.salary_structures for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) or exists (
    select 1 from public.hr_employees e where e.id = salary_structures.employee_id and e.profile_id = (select auth.uid())
  )
);
create policy salary_manage on public.salary_structures for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
) with check (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  and approval_status = 'pending' and approved_by is null and approved_at is null
);
create or replace function private.guard_salary_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.approval_status = 'approved' then raise exception 'Approved salary structures cannot be deleted.'; end if;
    return old;
  end if;
  if old.approval_status = 'approved' then raise exception 'Approved salary structures are immutable. Create a new effective salary change.'; end if;
  if new.approval_status is distinct from old.approval_status
    and not (current_setting('app.hr_salary_approval', true) = 'yes' and new.approval_status in ('approved','rejected')) then
    raise exception 'Salary authorization must use the principal approval workflow.';
  end if;
  if (new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at)
    and current_setting('app.hr_salary_approval', true) is distinct from 'yes' then
    raise exception 'Salary approval evidence is managed by the approval workflow.';
  end if;
  return new;
end; $$;
create trigger guard_salary_change before update or delete on public.salary_structures for each row execute function private.guard_salary_change();

create policy payroll_read on public.payroll_runs for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
);
create policy payroll_prepare on public.payroll_runs for insert to authenticated with check (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
);
create policy payroll_update on public.payroll_runs for update to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) and status in ('draft','submitted','rejected')
) with check (private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']));
create or replace function private.guard_payroll_run_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'submitted' then
    if current_setting('app.hr_payroll_approval', true) = 'yes' and new.status in ('approved','rejected') then
      return new;
    end if;
    raise exception 'Submitted payroll is locked until principal review.';
  end if;
  if new.version is distinct from old.version and current_setting('app.hr_payroll_approval', true) is distinct from 'yes' then
    raise exception 'Payroll version is managed by the approval workflow.';
  end if;
  if new.status is distinct from old.status then
    if old.status in ('draft','rejected') and new.status = 'submitted' then
      return new;
    end if;
    raise exception 'Payroll status changes must follow the review workflow.';
  end if;
  if old.status in ('approved','paying','paid','closed') then
    raise exception 'An approved payroll run is locked.';
  end if;
  return new;
end; $$;
drop trigger if exists guard_payroll_run_transition on public.payroll_runs;
create trigger guard_payroll_run_transition before update on public.payroll_runs
for each row execute function private.guard_payroll_run_transition();
create policy payroll_items_read on public.payroll_items for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) or exists (
    select 1 from public.hr_employees e join public.payroll_runs r on r.id = payroll_items.payroll_run_id
    where e.id = payroll_items.employee_id and e.profile_id = (select auth.uid())
      and r.status in ('approved','paying','paid','closed')
  )
);
create policy payroll_items_prepare on public.payroll_items for all to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) and exists (
    select 1 from public.payroll_runs r where r.id = payroll_items.payroll_run_id and r.status in ('draft','rejected')
  )
) with check (private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) and exists (
  select 1 from public.payroll_runs r where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id and r.status in ('draft','rejected')
));
create policy approvals_read on public.payroll_approvals for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
);
create policy approvals_insert on public.payroll_approvals for insert to authenticated with check (
  private.has_hr_role(school_id, array['principal']) and approver_id = (select auth.uid())
);
create policy payments_read on public.payment_transactions for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer']) or exists (
    select 1 from public.payroll_items i join public.hr_employees e on e.id = i.employee_id
    where i.id = payment_transactions.payroll_item_id and e.profile_id = (select auth.uid())
  )
);
create policy payments_manage on public.payment_transactions for all to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer'])
) with check (private.has_hr_role(school_id, array['principal','finance_officer']));
create policy hr_audit_read on public.hr_audit_events for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
);
revoke insert, update, delete on public.payroll_approvals, public.hr_audit_events from authenticated;

create or replace function private.log_hr_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; target_school uuid; target_id uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_school := (row_data->>'school_id')::uuid;
  target_id := (row_data->>'id')::uuid;
  insert into public.hr_audit_events(school_id, actor_id, action, entity_type, entity_id, details)
  values(target_school, (select auth.uid()), lower(tg_op), tg_table_name, target_id, '{}'::jsonb);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger hr_roles_audit after insert or update or delete on public.school_hr_roles for each row execute function private.log_hr_change();
create trigger hr_employee_audit after insert or update or delete on public.hr_employees for each row execute function private.log_hr_change();
create trigger hr_contract_audit after insert or update or delete on public.employment_contracts for each row execute function private.log_hr_change();
create trigger hr_leave_audit after insert or update or delete on public.hr_leave_requests for each row execute function private.log_hr_change();
create trigger hr_salary_audit after insert or update or delete on public.salary_structures for each row execute function private.log_hr_change();
create trigger hr_payroll_audit after insert or update or delete on public.payroll_runs for each row execute function private.log_hr_change();
create trigger hr_payroll_item_audit after insert or update or delete on public.payroll_items for each row execute function private.log_hr_change();
create trigger hr_payment_audit after insert or update or delete on public.payment_transactions for each row execute function private.log_hr_change();

create or replace function public.approve_school_payroll(target_run uuid, decision_value text, approval_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare run_row public.payroll_runs%rowtype; snapshot_hash text; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid payroll decision.'; end if;
  select * into run_row from public.payroll_runs where id = target_run for update;
  if not found then raise exception 'Payroll run not found.'; end if;
  if not private.has_hr_role(run_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before approving payroll.'; end if;
  if run_row.status <> 'submitted' then raise exception 'Only submitted payroll can be approved.'; end if;
  select md5(coalesce(string_agg(concat_ws('|', employee_id::text, basic_salary::text, allowances::text, deductions::text, gross_pay::text, total_deductions::text, net_pay::text), E'\n' order by employee_id), ''))
  into snapshot_hash from public.payroll_items where payroll_run_id = target_run;
  perform set_config('app.hr_payroll_approval','yes',true);
  update public.payroll_runs set status = decision_value, approved_at = case when decision_value = 'approved' then now() else null end, version = version + 1 where id = target_run;
  insert into public.payroll_approvals(school_id,payroll_run_id,payroll_version,approver_id,approval_hash,assurance_level,decision,notes)
  values(run_row.school_id,target_run,run_row.version,(select auth.uid()),snapshot_hash,aal,decision_value,approval_notes);
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(run_row.school_id,(select auth.uid()),decision_value,'payroll_run',target_run,jsonb_build_object('version',run_row.version,'approval_hash',snapshot_hash,'aal',aal));
end; $$;
revoke all on function public.approve_school_payroll(uuid,text,text) from public, anon;
grant execute on function public.approve_school_payroll(uuid,text,text) to authenticated;

create or replace function public.review_salary_change(target_salary uuid, decision_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare salary_row public.salary_structures%rowtype; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid salary decision.'; end if;
  select * into salary_row from public.salary_structures where id = target_salary for update;
  if not found then raise exception 'Salary change not found.'; end if;
  if not private.has_hr_role(salary_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before authorizing a salary change.'; end if;
  if salary_row.approval_status <> 'pending' then raise exception 'Only pending salary changes can be reviewed.'; end if;
  perform set_config('app.hr_salary_approval','yes',true);
  update public.salary_structures set approval_status = decision_value,
    approved_by = (select auth.uid()), approved_at = now() where id = target_salary;
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(salary_row.school_id,(select auth.uid()),decision_value,'salary_structure',target_salary,jsonb_build_object('effective_from',salary_row.effective_from,'aal',aal));
end; $$;
revoke all on function public.review_salary_change(uuid,text) from public, anon;
grant execute on function public.review_salary_change(uuid,text) to authenticated;

-- END supabase/037_hr_payroll_core.sql


-- ============================================================================
-- BEGIN supabase/038_country_and_school_payment_setup.sql
-- ============================================================================

-- Country-aware tenant settings and generic school-owned collection account details.
alter table public.schools
  add column if not exists country_code text not null default 'KE',
  add column if not exists mobile_money_provider text,
  add column if not exists mobile_money_number text,
  add column if not exists mobile_money_account_name text;

alter table public.schools drop constraint if exists schools_currency_code_check;
alter table public.schools add constraint schools_currency_code_check
  check (currency_code ~ '^[A-Z]{3}$');
alter table public.schools add constraint schools_country_code_check
  check (country_code ~ '^[A-Z]{2}$');

alter table public.salary_structures drop constraint if exists salary_structures_payment_method_check;
alter table public.salary_structures add constraint salary_structures_payment_method_check
  check (payment_method in ('bank','mobile_money','mpesa','cash','other'));
alter table public.payment_transactions drop constraint if exists payment_transactions_provider_check;
alter table public.payment_transactions add constraint payment_transactions_provider_check
  check (provider in ('bank','mobile_money','mpesa','cash','other'));

create table if not exists public.school_payroll_accounts (
  school_id uuid primary key references public.schools(id) on delete cascade,
  currency_code text not null,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_routing_code text,
  mobile_money_provider text,
  mobile_money_number text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (currency_code ~ '^[A-Z]{3}$')
);
alter table public.school_payroll_accounts enable row level security;
create policy school_payroll_accounts_read on public.school_payroll_accounts for select to authenticated
using (private.has_hr_role(school_id, array['principal','finance_officer']));
create policy school_payroll_accounts_manage on public.school_payroll_accounts for all to authenticated
using (private.has_hr_role(school_id, array['principal']))
with check (private.has_hr_role(school_id, array['principal']));
create trigger school_payroll_accounts_audit after insert or update or delete on public.school_payroll_accounts
for each row execute function private.log_hr_change();

update public.schools set country_code = case currency_code
  when 'KES' then 'KE' when 'UGX' then 'UG' when 'TZS' then 'TZ' when 'SLE' then 'SL' else country_code end;
update public.schools set currency_code = 'SLE' where country_code = 'SL' and currency_code = 'KES';

alter table public.payroll_runs alter column currency_code drop default;

-- END supabase/038_country_and_school_payment_setup.sql


-- ============================================================================
-- BEGIN supabase/039_operations_security_and_finance.sql
-- ============================================================================

-- School-scoped operations: staff attendance, expenses, payment reconciliation,
-- and durable inventory history. Requires migrations 027, 037, and 038.

create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  staff_profile_id uuid not null references public.profiles(id) on delete restrict,
  attendance_date date not null default current_date,
  status text not null check (status in ('present','late','absent','leave','half_day')),
  check_in_at timestamptz,
  check_out_at timestamptz,
  note text,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, staff_profile_id, attendance_date),
  check (check_out_at is null or check_in_at is null or check_out_at >= check_in_at)
);

create table if not exists public.school_expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  category text not null,
  vendor text,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  incurred_on date not null default current_date,
  receipt_reference text,
  notes text,
  status text not null default 'recorded' check (status in ('recorded','approved','paid','void')),
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status not in ('approved','paid')) or approved_by is not null),
  check ((approved_by is null) = (approved_at is null)),
  check ((status <> 'paid') or paid_at is not null)
);

create table if not exists public.payment_reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  provider text not null,
  provider_reference text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  transaction_at timestamptz,
  payment_id uuid references public.payments(id) on delete set null,
  status text not null default 'unmatched' check (status in ('unmatched','matched','duplicate','reviewed')),
  note text,
  recorded_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, provider, provider_reference),
  check ((status <> 'matched') or payment_id is not null)
);

create table if not exists public.asset_change_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  asset_id uuid,
  asset_name text not null,
  action text not null check (action in ('insert','update','delete')),
  actor_id uuid references public.profiles(id) on delete set null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists staff_attendance_school_day_idx on public.staff_attendance(school_id, attendance_date desc);
create index if not exists school_expenses_school_date_idx on public.school_expenses(school_id, incurred_on desc);
create index if not exists payment_reconciliation_school_status_idx on public.payment_reconciliation_records(school_id, status, created_at desc);
create index if not exists asset_change_logs_school_asset_idx on public.asset_change_logs(school_id, asset_id, created_at desc);

alter table public.staff_attendance enable row level security;
alter table public.school_expenses enable row level security;
alter table public.payment_reconciliation_records enable row level security;
alter table public.asset_change_logs enable row level security;
alter table public.finance_audit_events enable row level security;

drop policy if exists staff_attendance_self_read on public.staff_attendance;
drop policy if exists staff_attendance_admin_read on public.staff_attendance;
drop policy if exists staff_attendance_admin_manage on public.staff_attendance;
create policy staff_attendance_self_read on public.staff_attendance for select to authenticated using (
  school_id = private.current_school_id() and staff_profile_id = (select auth.uid())
);
create policy staff_attendance_admin_read on public.staff_attendance for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() = 'school_admin'
);
create policy staff_attendance_admin_manage on public.staff_attendance for all to authenticated
  using (school_id = private.current_school_id() and private.current_role() = 'school_admin')
  with check (
    school_id = private.current_school_id() and private.current_role() = 'school_admin'
    and exists (select 1 from public.profiles p where p.id = staff_profile_id and p.school_id = staff_attendance.school_id and p.role in ('school_admin','teacher'))
    and recorded_by = (select auth.uid())
  );

drop policy if exists school_expenses_finance_read on public.school_expenses;
drop policy if exists school_expenses_finance_manage on public.school_expenses;
drop policy if exists school_expenses_finance_insert on public.school_expenses;
drop policy if exists school_expenses_finance_update on public.school_expenses;
drop policy if exists school_expenses_finance_delete on public.school_expenses;
create policy school_expenses_finance_read on public.school_expenses for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
);
create policy school_expenses_finance_insert on public.school_expenses for insert to authenticated with check (
  private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']) and created_by = (select auth.uid())
  and approved_by is null and approved_at is null and status = 'recorded'
);
create policy school_expenses_finance_update on public.school_expenses for update to authenticated
  using (private.has_hr_role(school_id, array['principal','hr_admin','finance_officer']))
  with check (private.has_hr_role(school_id, array['principal','hr_admin','finance_officer'])
    and (approved_by is null or (approved_by = (select auth.uid()) and private.has_hr_role(school_id, array['principal']))));
create policy school_expenses_finance_delete on public.school_expenses for delete to authenticated
  using (private.has_hr_role(school_id, array['principal','hr_admin']) and status = 'recorded');

drop policy if exists reconciliation_finance_read on public.payment_reconciliation_records;
drop policy if exists reconciliation_finance_manage on public.payment_reconciliation_records;
drop policy if exists reconciliation_finance_insert on public.payment_reconciliation_records;
drop policy if exists reconciliation_finance_update on public.payment_reconciliation_records;
drop policy if exists reconciliation_finance_delete on public.payment_reconciliation_records;
create policy reconciliation_finance_read on public.payment_reconciliation_records for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer'])
);
create policy reconciliation_finance_insert on public.payment_reconciliation_records for insert to authenticated with check (
  private.has_hr_role(school_id, array['principal','finance_officer']) and recorded_by = (select auth.uid())
  and (payment_id is null or exists (select 1 from public.payments p where p.id = payment_id and p.school_id = payment_reconciliation_records.school_id))
  and (reviewed_by is null or (reviewed_by = (select auth.uid()) and private.has_hr_role(school_id, array['principal','finance_officer'])))
);
create policy reconciliation_finance_update on public.payment_reconciliation_records for update to authenticated
  using (private.has_hr_role(school_id, array['principal','finance_officer']))
  with check (private.has_hr_role(school_id, array['principal','finance_officer'])
    and (payment_id is null or exists (select 1 from public.payments p where p.id = payment_id and p.school_id = payment_reconciliation_records.school_id))
    and (reviewed_by is null or (reviewed_by = (select auth.uid()) and private.has_hr_role(school_id, array['principal','finance_officer']))));
create policy reconciliation_finance_delete on public.payment_reconciliation_records for delete to authenticated
  using (private.has_hr_role(school_id, array['principal']) and status in ('unmatched','duplicate'));

drop policy if exists payments_finance_reconciliation_read on public.payments;
create policy payments_finance_reconciliation_read on public.payments for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer'])
);

drop policy if exists asset_history_admin_read on public.asset_change_logs;
create policy asset_history_admin_read on public.asset_change_logs for select to authenticated using (
  school_id = private.current_school_id() and private.current_role() = 'school_admin'
);
drop policy if exists finance_audit_admin_read on public.finance_audit_events;
create policy finance_audit_admin_read on public.finance_audit_events for select to authenticated using (
  school_id = private.current_school_id() and private.has_hr_role(school_id, array['principal','hr_admin'])
);

revoke all on public.staff_attendance, public.school_expenses, public.payment_reconciliation_records,
  public.asset_change_logs, public.finance_audit_events from anon;
grant select, insert, update, delete on public.staff_attendance, public.school_expenses,
  public.payment_reconciliation_records to authenticated;
grant select on public.asset_change_logs, public.finance_audit_events to authenticated;
revoke insert, update, delete on public.asset_change_logs, public.finance_audit_events from authenticated;

create or replace function private.log_asset_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.asset_change_logs(school_id, asset_id, asset_name, action, actor_id, old_values, new_values)
  values (
    (row_data->>'school_id')::uuid, (row_data->>'id')::uuid, row_data->>'name', lower(tg_op),
    (select auth.uid()), case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.log_asset_change() from public, anon, authenticated;
drop trigger if exists log_asset_change on public.assets;
create trigger log_asset_change after insert or update or delete on public.assets
for each row execute function private.log_asset_change();

create or replace function private.log_finance_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; old_row jsonb; target_school uuid; target_id uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_row := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  target_school := (row_data->>'school_id')::uuid;
  target_id := (row_data->>'id')::uuid;
  insert into public.finance_audit_events(school_id, actor_id, entity_type, entity_id, action, details)
  values (target_school, (select auth.uid()), tg_table_name, target_id, lower(tg_op),
    jsonb_build_object('old', old_row, 'new', case when tg_op = 'DELETE' then null else to_jsonb(new) end));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.log_finance_change() from public, anon, authenticated;
drop trigger if exists audit_school_expenses on public.school_expenses;
create trigger audit_school_expenses after insert or update or delete on public.school_expenses
for each row execute function private.log_finance_change();
drop trigger if exists audit_payment_reconciliation on public.payment_reconciliation_records;
create trigger audit_payment_reconciliation after insert or update or delete on public.payment_reconciliation_records
for each row execute function private.log_finance_change();

create or replace function private.guard_reconciliation_match()
returns trigger language plpgsql security definer set search_path = '' as $$
declare matched_school uuid; matched_amount numeric;
begin
  if new.status <> 'matched' then return new; end if;
  if new.payment_id is null then raise exception 'Choose a school payment before marking this transaction matched.'; end if;
  select p.school_id, p.amount into matched_school, matched_amount from public.payments p where p.id = new.payment_id;
  if matched_school is distinct from new.school_id then raise exception 'Matched payment belongs to a different school.'; end if;
  if matched_amount is distinct from new.amount then raise exception 'Transaction amount must equal the school payment amount to match it.'; end if;
  return new;
end; $$;
revoke all on function private.guard_reconciliation_match() from public, anon, authenticated;
drop trigger if exists guard_reconciliation_match on public.payment_reconciliation_records;
create trigger guard_reconciliation_match before insert or update on public.payment_reconciliation_records
for each row execute function private.guard_reconciliation_match();

create or replace function private.guard_expense_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'recorded' then raise exception 'Approved, paid, or void expenses cannot be deleted.'; end if;
    return old;
  end if;
  if old.status = 'paid' or old.status = 'void' then
    raise exception 'Paid and void expenses are immutable.';
  end if;
  if old.status = 'approved' then
    if new.status not in ('paid','void') or new.title is distinct from old.title or new.category is distinct from old.category
      or new.vendor is distinct from old.vendor or new.amount is distinct from old.amount
      or new.currency_code is distinct from old.currency_code or new.incurred_on is distinct from old.incurred_on
      or new.receipt_reference is distinct from old.receipt_reference or new.notes is distinct from old.notes then
      raise exception 'Approved expense details are locked; only payment completion is allowed.';
    end if;
  end if;
  if new.status = 'approved' and new.approved_by is distinct from (select auth.uid()) then
    raise exception 'An authorized principal must record expense approval.';
  end if;
  if new.status = 'paid' and (old.status <> 'approved' or new.approved_by is null or new.paid_at is null) then
    raise exception 'Expense must be approved and have a payment date before it can be marked paid.';
  end if;
  return new;
end; $$;
revoke all on function private.guard_expense_transition() from public, anon, authenticated;
drop trigger if exists guard_expense_transition on public.school_expenses;
create trigger guard_expense_transition before update or delete on public.school_expenses
for each row execute function private.guard_expense_transition();

-- Fail the migration if any of the platform's core tenant tables lost RLS or all policies.
do $$
declare target text; enabled boolean; policy_count integer;
begin
  foreach target in array array[
    'schools','profiles','students','classes','subjects','attendance','fees','payments','subscriptions',
    'timetable','assets','bus_routes','wellbeing_reports','school_hr_roles','hr_employees',
    'payroll_runs','payroll_items','school_payroll_accounts'
  ] loop
    select c.relrowsecurity into enabled from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = target;
    if enabled is distinct from true then
      raise exception 'Tenant security check failed: public.% does not have row level security enabled', target;
    end if;
    select count(*) into policy_count from pg_policies where schemaname = 'public' and tablename = target;
    if policy_count = 0 then
      raise exception 'Tenant security check failed: public.% has no row security policies', target;
    end if;
  end loop;
end $$;

-- END supabase/039_operations_security_and_finance.sql


-- ============================================================================
-- BEGIN supabase/040_privileged_mfa_enforcement.sql
-- ============================================================================

-- Require an AAL2 Supabase session for privileged writes, including direct API
-- requests that bypass the React route guard. Service-role jobs are exempt.
create or replace function private.enforce_privileged_mfa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role;
  actor_school uuid;
  privileged boolean := false;
begin
  if actor_id is null or (select auth.role()) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select p.role, p.school_id into actor_role, actor_school
  from public.profiles p where p.id = actor_id;

  privileged := actor_role in ('super_admin','school_admin') or exists (
    select 1 from public.school_hr_roles r
    where r.profile_id = actor_id and r.school_id = actor_school
      and r.hr_role in ('principal','hr_admin','finance_officer')
  );

  if privileged and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication is required for privileged changes.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_privileged_mfa() from public, anon, authenticated;

do $$
declare target text;
begin
  foreach target in array array[
    'schools','profiles','students','classes','subjects','student_guardians','attendance',
    'assignments','exams','results','fees','payments','announcements','events','subscriptions',
    'applications','quizzes','quiz_questions','quiz_results','badges','student_badges','broadcasts',
    'timetable','resources','meetings','behavior_records','bus_routes','wellbeing_reports',
    'counseling_notes','assets','courses','course_chapters','course_progress','lesson_plans',
    'class_subjects','report_cards','school_hr_roles','job_vacancies','job_applications',
    'hr_employees','employment_contracts','hr_leave_requests','salary_structures','payroll_runs',
    'payroll_items','payment_transactions','school_payroll_accounts','staff_attendance',
    'school_expenses','payment_reconciliation_records'
  ] loop
    if to_regclass(format('public.%I', target)) is not null then
      execute format('drop trigger if exists enforce_privileged_mfa on public.%I', target);
      execute format(
        'create trigger enforce_privileged_mfa before insert or update or delete on public.%I for each row execute function private.enforce_privileged_mfa()',
        target
      );
    end if;
  end loop;
end $$;

-- END supabase/040_privileged_mfa_enforcement.sql


-- ============================================================================
-- BEGIN supabase/041_school_role_assignments.sql
-- ============================================================================

-- School portal roles stay in profiles.role. This table adds assignable,
-- combinable staff responsibilities without multiplying login portals.
create table if not exists public.school_staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_key text not null check (role_key in (
    'principal','deputy_principal','hr_admin','finance_officer','registrar',
    'librarian','inventory_manager','nurse','counsellor','transport_manager','staff_member'
  )),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, profile_id, role_key)
);

create table if not exists public.school_role_permission_catalog (
  role_key text not null,
  permission_key text not null,
  primary key (role_key, permission_key)
);
insert into public.school_role_permission_catalog(role_key, permission_key) values
 ('principal','school.timetable.manage'),('principal','school.attendance.manage'),('principal','school.staff_attendance.manage'),('principal','school.inventory.manage'),('principal','school.expenses.manage'),('principal','school.finance.reconcile'),('principal','school.hr.manage'),('principal','school.admissions.manage'),('principal','school.library.manage'),('principal','school.health.manage'),('principal','school.wellbeing.manage'),('principal','school.transport.manage'),('principal','school.reports.view'),('principal','school.hr.payroll'),
 ('deputy_principal','school.timetable.manage'),('deputy_principal','school.attendance.manage'),('deputy_principal','school.staff_attendance.manage'),('deputy_principal','school.inventory.view'),('deputy_principal','school.admissions.manage'),('deputy_principal','school.reports.view'),
 ('hr_admin','school.staff_attendance.manage'),('hr_admin','school.hr.manage'),('hr_admin','school.hr.payroll'),
 ('finance_officer','school.expenses.manage'),('finance_officer','school.finance.reconcile'),('finance_officer','school.hr.payroll'),
 ('registrar','school.admissions.manage'),('registrar','school.students.manage'),
 ('librarian','school.library.manage'),('librarian','school.inventory.view'),
 ('inventory_manager','school.inventory.manage'),('inventory_manager','school.inventory.view'),
 ('nurse','school.health.manage'),('counsellor','school.wellbeing.manage'),('transport_manager','school.transport.manage'),('staff_member','school.profile.view')
on conflict do nothing;

-- Preserve existing HR assignments and allow one person to hold several roles.
insert into public.school_staff_role_assignments(school_id, profile_id, role_key, assigned_by, created_at)
select school_id, profile_id, hr_role, assigned_by, created_at from public.school_hr_roles
on conflict (school_id, profile_id, role_key) do nothing;

create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
  ) or exists (
    select 1 from public.school_hr_roles h
    join public.school_role_permission_catalog c on c.role_key = h.hr_role
    where h.profile_id = (select auth.uid()) and h.school_id = target_school
      and c.permission_key = required_permission
  );
$$;
revoke all on function private.has_school_permission(uuid,text) from public, anon;
grant execute on function private.has_school_permission(uuid,text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.school_id = target_school and p.role = 'school_admin')
    or exists (select 1 from public.school_hr_roles h where h.profile_id = (select auth.uid())
      and h.school_id = target_school and h.hr_role = any(allowed_roles))
    or exists (select 1 from public.school_staff_role_assignments a
      where a.profile_id = (select auth.uid()) and a.school_id = target_school and a.role_key = any(allowed_roles));
$$;
revoke all on function private.has_hr_role(uuid,text[]) from public, anon;
grant execute on function private.has_hr_role(uuid,text[]) to authenticated;

alter table public.school_staff_role_assignments enable row level security;
alter table public.school_role_permission_catalog enable row level security;
create policy school_role_catalog_read on public.school_role_permission_catalog for select to authenticated using (true);
create policy school_staff_roles_read on public.school_staff_role_assignments for select to authenticated using (
  profile_id = (select auth.uid()) or exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'
  )
);
create policy school_staff_roles_admin_manage on public.school_staff_role_assignments for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'))
with check (exists (select 1 from public.profiles p join public.profiles target on target.id = school_staff_role_assignments.profile_id
  where p.id = (select auth.uid()) and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'
    and target.school_id = school_staff_role_assignments.school_id and target.role = 'teacher'));
revoke insert, update, delete on public.school_role_permission_catalog from authenticated;

-- Timetable rows can be managed by principals and deputies, with the school
-- admin retaining full control. Existing audience read policies stay intact.
drop policy if exists timetable_admin_insert on public.timetable;
drop policy if exists timetable_admin_update on public.timetable;
drop policy if exists timetable_admin_delete on public.timetable;
create policy timetable_admin_insert on public.timetable for insert to authenticated with check (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.timetable.manage')
  and exists (select 1 from public.classes c join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id and c.school_id = timetable.school_id and s.school_id = timetable.school_id)
);
create policy timetable_admin_update on public.timetable for update to authenticated using (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.timetable.manage')
) with check (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.timetable.manage')
  and exists (select 1 from public.classes c join public.subjects s on s.id = timetable.subject_id
    where c.id = timetable.class_id and c.school_id = timetable.school_id and s.school_id = timetable.school_id)
);
create policy timetable_admin_delete on public.timetable for delete to authenticated using (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.timetable.manage')
);

drop policy if exists "admins manage assets" on public.assets;
create policy "authorized staff manage assets" on public.assets for all to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.inventory.manage'))
with check (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.inventory.manage'));

drop policy if exists "admins manage applications" on public.applications;
create policy "authorized staff manage applications" on public.applications for all to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.admissions.manage'))
with check (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.admissions.manage'));

drop policy if exists staff_attendance_admin_read on public.staff_attendance;
drop policy if exists staff_attendance_admin_manage on public.staff_attendance;
create policy staff_attendance_admin_read on public.staff_attendance for select to authenticated using (
  school_id = private.current_school_id() and private.has_school_permission(school_id,'school.staff_attendance.manage')
);
create policy staff_attendance_admin_manage on public.staff_attendance for all to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.staff_attendance.manage'))
with check (school_id = private.current_school_id() and private.has_school_permission(school_id,'school.staff_attendance.manage')
  and exists (select 1 from public.profiles p where p.id = staff_profile_id and p.school_id = staff_attendance.school_id and p.role in ('school_admin','teacher'))
  and recorded_by = (select auth.uid()));

create or replace function private.enforce_privileged_mfa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); actor_role public.user_role; actor_school uuid; privileged boolean := false;
begin
  if actor_id is null or (select auth.role()) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if; return new;
  end if;
  select p.role, p.school_id into actor_role, actor_school from public.profiles p where p.id = actor_id;
  privileged := actor_role in ('super_admin','school_admin') or exists (
    select 1 from public.school_staff_role_assignments a where a.profile_id = actor_id and a.school_id = actor_school
      and a.role_key in ('principal','deputy_principal','hr_admin','finance_officer','registrar','inventory_manager','nurse','counsellor','transport_manager')
  ) or exists (select 1 from public.school_hr_roles h where h.profile_id = actor_id and h.school_id = actor_school
      and h.hr_role in ('principal','hr_admin','finance_officer'));
  if privileged and coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication is required for privileged changes.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end; $$;

drop trigger if exists enforce_privileged_mfa on public.school_staff_role_assignments;
create trigger enforce_privileged_mfa before insert or update or delete on public.school_staff_role_assignments
for each row execute function private.enforce_privileged_mfa();

-- END supabase/041_school_role_assignments.sql


-- ============================================================================
-- BEGIN supabase/042_workflow_access_and_delivery.sql
-- ============================================================================

-- Tighten assignment/submission access, secure assignment files and notification
-- mutations, and add a leased notification worker with bounded retries.

alter table public.assignments add column if not exists max_score numeric(8,2) not null default 100 check (max_score > 0);
alter table private.notification_delivery_outbox add column if not exists terminal_at timestamptz;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_token text not null check (length(device_token) between 16 and 4096),
  platform text not null check (platform in ('ios','android')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,device_token)
);
alter table public.push_devices enable row level security;
create policy push_devices_read_own on public.push_devices for select to authenticated using (
  user_id=(select auth.uid()) and school_id=private.current_school_id()
);
create policy push_devices_insert_own on public.push_devices for insert to authenticated with check (
  user_id=(select auth.uid()) and school_id=private.current_school_id()
);
create policy push_devices_update_own on public.push_devices for update to authenticated
using (user_id=(select auth.uid()) and school_id=private.current_school_id())
with check (user_id=(select auth.uid()) and school_id=private.current_school_id());
create policy push_devices_delete_own on public.push_devices for delete to authenticated using (
  user_id=(select auth.uid()) and school_id=private.current_school_id()
);
revoke all on public.push_devices from anon;
grant select,insert,update,delete on public.push_devices to authenticated;

create or replace function private.guard_push_device()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then return old; end if;
  if coalesce(auth.role(),'')<>'service_role' and (new.user_id is distinct from (select auth.uid()) or new.school_id is distinct from private.current_school_id()) then
    raise exception 'A device can only be registered to the signed-in user and their school.' using errcode='42501';
  end if;
  new.updated_at:=now();
  return new;
end $$;
drop trigger if exists guard_push_device on public.push_devices;
create trigger guard_push_device before insert or update on public.push_devices for each row execute function private.guard_push_device();
revoke all on function private.guard_push_device() from public,anon,authenticated;

insert into public.school_role_permission_catalog(role_key,permission_key) values
  ('principal','school.assignments.manage'),('principal','school.assessments.manage'),
  ('deputy_principal','school.assignments.manage'),('deputy_principal','school.assessments.manage')
on conflict do nothing;

create or replace function private.can_manage_class_subject(target_school uuid,target_class uuid,target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='school_admin' and p.school_id=target_school)
  or (private.current_role()='teacher' and private.current_school_id()=target_school and exists(
    select 1 from public.classes c join public.subjects s on s.school_id=c.school_id
    where c.id=target_class and c.school_id=target_school and s.id=target_subject
      and exists(select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id=target_school and tsa.teacher_id=(select auth.uid()) and tsa.class_id=c.id and tsa.subject_id=s.id))
  )
  or (private.current_role()='teacher' and private.current_school_id()=target_school and target_subject is null and exists(
    select 1 from public.classes c where c.id=target_class and c.school_id=target_school and c.teacher_id=(select auth.uid())
  ))
  or (private.current_role()='teacher' and private.has_school_permission(target_school,'school.assignments.manage')
    and exists(select 1 from public.classes c where c.id=target_class and c.school_id=target_school)
    and (target_subject is null or exists(select 1 from public.subjects s where s.id=target_subject and s.school_id=target_school)));
$$;
revoke all on function private.can_manage_class_subject(uuid,uuid,uuid) from public,anon;
grant execute on function private.can_manage_class_subject(uuid,uuid,uuid) to authenticated;

create or replace function private.guard_teacher_subject_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles p where p.id=new.teacher_id and p.school_id=new.school_id and p.role='teacher') then
    raise exception 'Teaching assignments require a teacher in the same school.';
  end if;
  if not exists(select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id) then
    raise exception 'Teaching class must belong to the same school.';
  end if;
  if not exists(select 1 from public.subjects s where s.id=new.subject_id and s.school_id=new.school_id) then
    raise exception 'Teaching subject must belong to the same school.';
  end if;
  return new;
end $$;
revoke all on function private.guard_teacher_subject_assignment() from public,anon,authenticated;
drop trigger if exists guard_teacher_subject_assignment on public.teacher_subject_assignments;
create trigger guard_teacher_subject_assignment before insert or update on public.teacher_subject_assignments
for each row execute function private.guard_teacher_subject_assignment();

create or replace function private.guard_exam_school_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.class_id is not null and not exists(select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id) then
    raise exception 'Exam class must belong to the same school.';
  end if;
  if new.subject_id is not null and not exists(select 1 from public.subjects s where s.id=new.subject_id and s.school_id=new.school_id) then
    raise exception 'Exam subject must belong to the same school.';
  end if;
  return new;
end $$;
revoke all on function private.guard_exam_school_links() from public,anon,authenticated;
drop trigger if exists guard_exam_school_links on public.exams;
create trigger guard_exam_school_links before insert or update on public.exams for each row execute function private.guard_exam_school_links();

create or replace function private.guard_result_school_links()
returns trigger language plpgsql security definer set search_path = '' as $$
declare exam_row public.exams; student_row public.students;
begin
  select * into exam_row from public.exams e where e.id=new.exam_id and e.school_id=new.school_id;
  select * into student_row from public.students s where s.id=new.student_id and s.school_id=new.school_id;
  if exam_row.id is null or student_row.id is null then raise exception 'Result exam and learner must belong to the same school.'; end if;
  if exam_row.class_id is not null and exam_row.class_id is distinct from student_row.class_id then raise exception 'Result learner is not in the exam class.'; end if;
  if exam_row.subject_id is not null and new.subject_id is distinct from exam_row.subject_id then raise exception 'Result subject must match the exam subject.'; end if;
  if new.score is not null and (new.score<0 or new.score>coalesce(exam_row.max_score,100)) then raise exception 'Result score must be within the exam maximum.'; end if;
  return new;
end $$;
revoke all on function private.guard_result_school_links() from public,anon,authenticated;
drop trigger if exists guard_result_school_links on public.results;
create trigger guard_result_school_links before insert or update on public.results for each row execute function private.guard_result_school_links();

create or replace function private.school_local_date(target_school uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select s.timezone from public.schools s where s.id=target_school),'UTC'))::date;
$$;
revoke all on function private.school_local_date(uuid) from public,anon;
grant execute on function private.school_local_date(uuid) to authenticated;

create or replace function private.can_manage_assignment(target_assignment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.assignments a where a.id=target_assignment
    and a.school_id=private.current_school_id()
    and private.can_manage_class_subject(a.school_id,a.class_id,a.subject_id));
$$;
revoke all on function private.can_manage_assignment(uuid) from public,anon;
grant execute on function private.can_manage_assignment(uuid) to authenticated;

create or replace function private.guard_assignment_school()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.schools s where s.id=new.school_id) then
    raise exception 'School not found.';
  end if;
  if new.class_id is not null and not exists(select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id) then
    raise exception 'Assignment class must belong to the same school.';
  end if;
  if new.subject_id is not null and not exists(select 1 from public.subjects s where s.id=new.subject_id and s.school_id=new.school_id) then
    raise exception 'Assignment subject must belong to the same school.';
  end if;
  if new.created_by is not null and not exists(select 1 from public.profiles p where p.id=new.created_by and p.school_id=new.school_id) then
    raise exception 'Assignment creator must belong to the same school.';
  end if;
  return new;
end $$;
revoke all on function private.guard_assignment_school() from public,anon,authenticated;
drop trigger if exists guard_assignment_school on public.assignments;
create trigger guard_assignment_school before insert or update on public.assignments for each row execute function private.guard_assignment_school();

drop policy if exists assignments_read_related on public.assignments;
drop policy if exists assignments_staff_insert on public.assignments;
drop policy if exists assignments_staff_update on public.assignments;
drop policy if exists assignments_staff_delete on public.assignments;
create policy assignments_read_related on public.assignments for select to authenticated using (
  (private.current_role() in ('school_admin','teacher') and school_id=private.current_school_id()
    and (private.current_role()='school_admin' or private.can_manage_assignment(id)))
  or (private.current_role() in ('student','parent') and published_at is not null and class_id is not null
    and private.can_view_class(class_id))
);
create policy assignments_staff_insert on public.assignments for insert to authenticated with check (
  school_id=private.current_school_id() and (private.current_role()='school_admin'
    or (created_by=(select auth.uid()) and published_at is not null and private.can_manage_class_subject(school_id,class_id,subject_id)))
);
create policy assignments_staff_update on public.assignments for update to authenticated
using (school_id=private.current_school_id() and (private.current_role()='school_admin' or (created_by=(select auth.uid()) and private.can_manage_assignment(id))))
with check (school_id=private.current_school_id() and (private.current_role()='school_admin' or (created_by=(select auth.uid()) and private.can_manage_class_subject(school_id,class_id,subject_id))));
create policy assignments_staff_delete on public.assignments for delete to authenticated
using (school_id=private.current_school_id() and (private.current_role()='school_admin' or (created_by=(select auth.uid()) and private.can_manage_assignment(id))));

create or replace function private.can_review_submission(target_submission uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.submissions sub join public.assignments a on a.id=sub.assignment_id
    join public.students s on s.id=sub.student_id where sub.id=target_submission and a.school_id=private.current_school_id()
    and s.school_id=a.school_id and a.class_id is not null and s.class_id=a.class_id
    and (private.current_role()='school_admin' or private.can_manage_assignment(a.id)));
$$;
revoke all on function private.can_review_submission(uuid) from public,anon;
grant execute on function private.can_review_submission(uuid) to authenticated;

drop policy if exists submissions_read_related on public.submissions;
drop policy if exists submissions_student_insert on public.submissions;
drop policy if exists submissions_update_related on public.submissions;
drop policy if exists submissions_staff_delete on public.submissions;
create policy submissions_read_related on public.submissions for select to authenticated using (
  (private.current_role() in ('student','parent') and private.can_view_student(student_id))
  or private.can_review_submission(id)
);
create policy submissions_student_insert on public.submissions for insert to authenticated with check (
  private.current_role()='student' and score is null and feedback is null and exists(
    select 1 from public.students s join public.assignments a on a.id=assignment_id
    where s.id=student_id and s.profile_id=(select auth.uid()) and s.school_id=a.school_id
      and a.published_at is not null and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))
      and a.class_id is not null and a.class_id=s.class_id
  )
);
create policy submissions_update_related on public.submissions for update to authenticated
using (
  private.can_review_submission(id)
  or (private.current_role()='student' and private.can_view_student(student_id) and score is null and feedback is null
    and exists(select 1 from public.assignments a where a.id=assignment_id and a.published_at is not null
      and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))))
)
with check (
  private.can_review_submission(id)
  or (private.current_role()='student' and private.can_view_student(student_id) and score is null and feedback is null
    and exists(select 1 from public.assignments a where a.id=assignment_id and a.published_at is not null
      and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))))
);
create policy submissions_staff_delete on public.submissions for delete to authenticated using (
  private.current_role()='school_admin' and private.can_view_student(student_id)
);

create or replace function private.protect_submission_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare assignment_row public.assignments;
begin
  if new.id is distinct from old.id or new.assignment_id is distinct from old.assignment_id
     or new.student_id is distinct from old.student_id then raise exception 'Submission identity cannot be changed.'; end if;
  select * into assignment_row from public.assignments a where a.id=old.assignment_id;
  if assignment_row.id is null then raise exception 'Assignment not found.'; end if;
  if private.current_role()='student' then
    if old.score is not null or old.feedback is not null then raise exception 'A graded submission can no longer be changed.'; end if;
    if new.score is distinct from old.score or new.feedback is distinct from old.feedback
       or new.submitted_at > now()+interval '1 minute' or new.submitted_at < now()-interval '5 minutes' then raise exception 'Students may only revise their own submission content.'; end if;
    if assignment_row.due_date is not null and assignment_row.due_date < private.school_local_date(assignment_row.school_id) then raise exception 'This assignment is closed for submissions.'; end if;
  elsif private.current_role()='teacher' then
    if not private.can_review_submission(old.id) then raise exception 'You are not assigned to this class and subject.' using errcode='42501'; end if;
    if new.content is distinct from old.content or new.file_path is distinct from old.file_path
       or new.submitted_at is distinct from old.submitted_at then raise exception 'Teachers may only update grades and feedback.'; end if;
    if new.score is not null and (new.score < 0 or new.score > assignment_row.max_score) then raise exception 'Grade must be between 0 and the assignment maximum.'; end if;
  elsif private.current_role()<>'school_admin' then raise exception 'School staff access is required.' using errcode='42501';
  end if;
  if new.score is not null and (new.score < 0 or new.score > assignment_row.max_score) then raise exception 'Grade must be between 0 and the assignment maximum.'; end if;
  return new;
end $$;

-- Private student work uploads; paths are submissions/<assignment>/<student>/<file>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('assignment-files','assignment-files',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','text/plain'])
on conflict(id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','text/plain'];
drop policy if exists assignment_files_student_upload on storage.objects;
drop policy if exists assignment_files_owner_read on storage.objects;
drop policy if exists assignment_files_teacher_read on storage.objects;
drop policy if exists assignment_files_student_update on storage.objects;
create policy assignment_files_student_upload on storage.objects for insert to authenticated with check (
  bucket_id='assignment-files' and (storage.foldername(name))[1]='submissions'
  and exists(select 1 from public.students s join public.assignments a on a.id=(storage.foldername(name))[2]::uuid
    where s.id=(storage.foldername(name))[3]::uuid and s.profile_id=(select auth.uid()) and s.school_id=a.school_id
      and a.published_at is not null and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))
      and a.class_id is not null and a.class_id=s.class_id)
);
create policy assignment_files_owner_read on storage.objects for select to authenticated using (
  bucket_id='assignment-files' and (storage.foldername(name))[1]='submissions'
  and exists(select 1 from public.students s where s.id=(storage.foldername(name))[3]::uuid and s.profile_id=(select auth.uid()))
);
create policy assignment_files_teacher_read on storage.objects for select to authenticated using (
  bucket_id='assignment-files' and (storage.foldername(name))[1]='submissions'
  and exists(select 1 from public.assignments a where a.id=(storage.foldername(name))[2]::uuid and private.can_manage_assignment(a.id))
);
create policy assignment_files_student_update on storage.objects for update to authenticated using (
  bucket_id='assignment-files' and (storage.foldername(name))[1]='submissions'
  and exists(select 1 from public.students s join public.assignments a on a.id=(storage.foldername(name))[2]::uuid
    where s.id=(storage.foldername(name))[3]::uuid and s.profile_id=(select auth.uid())
      and a.published_at is not null and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id)))
) with check (
  bucket_id='assignment-files' and (storage.foldername(name))[1]='submissions'
  and exists(select 1 from public.students s where s.id=(storage.foldername(name))[3]::uuid and s.profile_id=(select auth.uid()))
);

drop policy if exists "users view own notifications" on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (
  user_id=(select auth.uid()) and school_id=private.current_school_id()
);
create policy notifications_update_own on public.notifications for update to authenticated
using (user_id=(select auth.uid()) and school_id=private.current_school_id())
with check (user_id=(select auth.uid()) and school_id=private.current_school_id());
create or replace function private.protect_notification_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' and (
    new.id is distinct from old.id or new.school_id is distinct from old.school_id or new.user_id is distinct from old.user_id
    or new.title is distinct from old.title or new.body is distinct from old.body or new.type is distinct from old.type
    or new.created_at is distinct from old.created_at
  ) then raise exception 'Recipients may only mark their notification as read.'; end if;
  return new;
end $$;
drop trigger if exists protect_notification_update on public.notifications;
create trigger protect_notification_update before update on public.notifications for each row execute function private.protect_notification_update();
revoke all on function private.protect_notification_update() from public,anon,authenticated;

create or replace function public.claim_notification_delivery_jobs(p_limit integer default 25)
returns table(outbox_id uuid,notification_id uuid,school_id uuid,recipient_id uuid,channel text,title text,body text,attempts integer)
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role is required.'; end if;
  update private.notification_delivery_outbox o set state='cancelled',terminal_at=now(),claimed_at=null,last_error_code='recipient_opted_out'
  where o.terminal_at is null and o.state in ('pending','failed') and coalesce((
    select p.delivery_preferences->>o.channel from public.profiles p where p.id=o.recipient_id and p.school_id=o.school_id
  ),'false')<>'true';
  return query
  with candidates as (
    select o.id from private.notification_delivery_outbox o
    join public.profiles p on p.id=o.recipient_id and p.school_id=o.school_id
    where o.terminal_at is null and o.attempts<8 and (
      (o.state in ('pending','failed') and o.available_at<=now())
      or (o.state='processing' and o.claimed_at<now()-interval '15 minutes')
    ) and p.delivery_preferences->>o.channel='true'
    order by o.available_at,o.created_at limit greatest(1,least(coalesce(p_limit,25),100)) for update of o skip locked
  ), claimed as (
    update private.notification_delivery_outbox o set state='processing',claimed_at=now(),attempts=o.attempts+1
    from candidates c where o.id=c.id returning o.id,o.notification_id,o.school_id,o.recipient_id,o.channel,o.attempts
  )
  select c.id,c.notification_id,c.school_id,c.recipient_id,c.channel,n.title,n.body,c.attempts
  from claimed c join public.notifications n on n.id=c.notification_id and n.user_id=c.recipient_id and n.school_id=c.school_id;
end $$;
revoke all on function public.claim_notification_delivery_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_delivery_jobs(integer) to service_role;

create or replace function public.finish_notification_delivery_job(p_outbox_id uuid,p_success boolean,p_error_code text default null,p_retryable boolean default true,p_cancelled boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare job private.notification_delivery_outbox;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role is required.'; end if;
  select * into job from private.notification_delivery_outbox where id=p_outbox_id and state='processing' for update;
  if job.id is null then raise exception 'Notification delivery lease not found.'; end if;
  if p_cancelled then
    update private.notification_delivery_outbox set state='cancelled',claimed_at=null,last_error_code='recipient_opted_out',terminal_at=now() where id=job.id;
  elsif p_success then
    update private.notification_delivery_outbox set state='sent',sent_at=now(),claimed_at=null,last_error_code=null,terminal_at=now() where id=job.id;
  elsif not coalesce(p_retryable,true) or job.attempts>=8 then
    update private.notification_delivery_outbox set state='failed',claimed_at=null,last_error_code=left(regexp_replace(coalesce(p_error_code,'delivery_failed'),'[^a-zA-Z0-9_.-]','','g'),80),terminal_at=now() where id=job.id;
  else
    update private.notification_delivery_outbox set state='pending',claimed_at=null,
      available_at=now()+make_interval(secs=>least(3600,(30*power(2,job.attempts-1))::integer)),
      last_error_code=left(regexp_replace(coalesce(p_error_code,'delivery_failed'),'[^a-zA-Z0-9_.-]','','g'),80) where id=job.id;
  end if;
end $$;
revoke all on function public.finish_notification_delivery_job(uuid,boolean,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.finish_notification_delivery_job(uuid,boolean,text,boolean,boolean) to service_role;

drop policy if exists quiz_results_read_related on public.quiz_results;
create policy quiz_results_read_related on public.quiz_results for select to authenticated using (
  private.can_view_student(student_id) and exists(select 1 from public.quizzes q where q.id=quiz_id
    and ((private.current_role()='school_admin' and q.school_id=private.current_school_id())
      or (private.current_role()='teacher' and q.school_id=private.current_school_id()
        and private.can_manage_class_subject(q.school_id,q.class_id,q.subject_id))
      or (private.current_role() in ('student','parent') and (q.results_release_at is null or q.results_release_at<=now())
        and published=true)))
);

-- Only class/subject-assigned teachers may view exams, results, and quiz marks.
drop policy if exists exams_read_related on public.exams;
create policy exams_read_related on public.exams for select to authenticated using (
  (school_id=private.current_school_id() and private.current_role()='school_admin')
  or (school_id=private.current_school_id() and private.current_role()='teacher'
    and private.can_manage_class_subject(school_id,class_id,subject_id))
  or (published=true and class_id is not null and private.can_view_class(class_id))
);
drop policy if exists exams_staff_insert on public.exams;
create policy exams_staff_insert on public.exams for insert to authenticated with check (
  school_id=private.current_school_id() and (private.current_role()='school_admin'
    or (private.current_role()='teacher' and private.can_manage_class_subject(school_id,class_id,subject_id)))
);
drop policy if exists exams_staff_update on public.exams;
create policy exams_staff_update on public.exams for update to authenticated
using (school_id=private.current_school_id() and (private.current_role()='school_admin'
  or (private.current_role()='teacher' and private.can_manage_class_subject(school_id,class_id,subject_id))))
with check (school_id=private.current_school_id() and (private.current_role()='school_admin'
  or (private.current_role()='teacher' and private.can_manage_class_subject(school_id,class_id,subject_id))));
drop policy if exists exams_staff_delete on public.exams;
create policy exams_staff_delete on public.exams for delete to authenticated using (
  school_id=private.current_school_id() and (private.current_role()='school_admin'
    or (private.current_role()='teacher' and private.can_manage_class_subject(school_id,class_id,subject_id)))
);
drop policy if exists results_read_related on public.results;
create policy results_read_related on public.results for select to authenticated using (
  private.can_view_student(student_id) and (
    (private.current_role() in ('student','parent') and published=true)
    or (private.current_role()='school_admin' and school_id=private.current_school_id())
    or (private.current_role()='teacher' and school_id=private.current_school_id()
      and private.can_grade_student(student_id,subject_id))
  )
);

-- Wellbeing reports and notes are private to assigned specialists and the
-- school administration. Student reports remain visible to their reporter.
drop policy if exists wellbeing_student_read on public.wellbeing_reports;
drop policy if exists wellbeing_student_insert on public.wellbeing_reports;
drop policy if exists wellbeing_staff_manage on public.wellbeing_reports;
create policy wellbeing_report_read on public.wellbeing_reports for select to authenticated using (
  (private.current_role()='student' and reporter_id=(select auth.uid()))
  or (school_id=private.current_school_id() and private.has_school_permission(school_id,'school.wellbeing.manage'))
);
create policy wellbeing_report_insert on public.wellbeing_reports for insert to authenticated with check (
  school_id=private.current_school_id() and reporter_id=(select auth.uid())
  and (student_id is null or private.can_view_student(student_id))
);
create policy wellbeing_report_update on public.wellbeing_reports for update to authenticated
using (school_id=private.current_school_id() and private.has_school_permission(school_id,'school.wellbeing.manage'))
with check (school_id=private.current_school_id() and private.has_school_permission(school_id,'school.wellbeing.manage'));
create policy wellbeing_report_delete on public.wellbeing_reports for delete to authenticated using (
  school_id=private.current_school_id() and private.has_school_permission(school_id,'school.wellbeing.manage')
);
drop policy if exists counseling_notes_school_admin on public.counseling_notes;
create policy counseling_notes_read on public.counseling_notes for select to authenticated using (
  exists(select 1 from public.wellbeing_reports w where w.id=report_id and w.school_id=private.current_school_id()
    and private.has_school_permission(w.school_id,'school.wellbeing.manage'))
);
create policy counseling_notes_insert on public.counseling_notes for insert to authenticated with check (
  counselor_id=(select auth.uid()) and exists(select 1 from public.wellbeing_reports w where w.id=report_id
    and w.school_id=private.current_school_id() and private.has_school_permission(w.school_id,'school.wellbeing.manage'))
);
create policy counseling_notes_update on public.counseling_notes for update to authenticated
using (counselor_id=(select auth.uid()) and exists(select 1 from public.wellbeing_reports w where w.id=report_id
  and w.school_id=private.current_school_id() and private.has_school_permission(w.school_id,'school.wellbeing.manage')))
with check (counselor_id=(select auth.uid()) and exists(select 1 from public.wellbeing_reports w where w.id=report_id
  and w.school_id=private.current_school_id() and private.has_school_permission(w.school_id,'school.wellbeing.manage')));
create policy counseling_notes_delete on public.counseling_notes for delete to authenticated using (
  counselor_id=(select auth.uid()) and exists(select 1 from public.wellbeing_reports w where w.id=report_id
    and w.school_id=private.current_school_id() and private.has_school_permission(w.school_id,'school.wellbeing.manage'))
);

-- END supabase/042_workflow_access_and_delivery.sql


-- ============================================================================
-- BEGIN supabase/043_role_access_and_admissions_hardening.sql
-- ============================================================================

-- Keep specialist permissions attached to a same-school teacher login, and
-- make accepted school applications enroll as a single, repeat-safe action.

delete from public.school_staff_role_assignments a
using public.profiles p
where p.id = a.profile_id
  and (p.role <> 'teacher' or p.school_id is distinct from a.school_id);

delete from public.school_hr_roles r
using public.profiles p
where p.id = r.profile_id
  and (p.role <> 'teacher' or p.school_id is distinct from r.school_id);

create or replace function private.validate_school_staff_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id
      and p.school_id = new.school_id
      and p.role = 'teacher'
  ) then
    raise exception 'Specialist roles can only be assigned to a teacher account in the same school.';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_school_staff_assignment() from public, anon, authenticated;

drop trigger if exists validate_school_staff_role_assignment on public.school_staff_role_assignments;
create trigger validate_school_staff_role_assignment
before insert or update of school_id, profile_id on public.school_staff_role_assignments
for each row execute function private.validate_school_staff_assignment();

drop trigger if exists validate_school_hr_role_assignment on public.school_hr_roles;
create trigger validate_school_hr_role_assignment
before insert or update of school_id, profile_id on public.school_hr_roles
for each row execute function private.validate_school_staff_assignment();

-- Carry forward valid assignments made through the legacy HR access screen.
insert into public.school_staff_role_assignments(school_id, profile_id, role_key, assigned_by, created_at)
select r.school_id, r.profile_id, r.hr_role, r.assigned_by, r.created_at
from public.school_hr_roles r
join public.profiles p on p.id = r.profile_id and p.school_id = r.school_id and p.role = 'teacher'
on conflict (school_id, profile_id, role_key) do nothing;

create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.role = 'teacher'
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
  ) or exists (
    select 1
    from public.school_hr_roles h
    join public.profiles p on p.id = h.profile_id and p.school_id = h.school_id and p.role = 'teacher'
    join public.school_role_permission_catalog c on c.role_key = h.hr_role
    where h.profile_id = (select auth.uid()) and h.school_id = target_school
      and c.permission_key = required_permission
  );
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_hr_roles h
    join public.profiles p on p.id = h.profile_id and p.school_id = h.school_id and p.role = 'teacher'
    where h.profile_id = (select auth.uid()) and h.school_id = target_school and h.hr_role = any(allowed_roles)
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.role = 'teacher'
    where a.profile_id = (select auth.uid()) and a.school_id = target_school and a.role_key = any(allowed_roles)
  );
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

insert into public.school_role_permission_catalog(role_key, permission_key) values
  ('principal', 'school.inventory.view'),
  ('principal', 'school.finance.portal.view'),
  ('principal', 'school.hr.portal.view'),
  ('hr_admin', 'school.hr.portal.view'),
  ('finance_officer', 'school.finance.portal.view'),
  ('finance_officer', 'school.hr.portal.view')
on conflict do nothing;

-- Keep finance page access consistent with the role permission catalog.
drop policy if exists school_expenses_finance_read on public.school_expenses;
drop policy if exists school_expenses_finance_insert on public.school_expenses;
drop policy if exists school_expenses_finance_update on public.school_expenses;
drop policy if exists school_expenses_finance_delete on public.school_expenses;
create policy school_expenses_finance_read on public.school_expenses for select to authenticated
using (private.has_school_permission(school_id, 'school.expenses.manage'));
create policy school_expenses_finance_insert on public.school_expenses for insert to authenticated
with check (private.has_school_permission(school_id, 'school.expenses.manage')
  and created_by = (select auth.uid()) and approved_by is null and approved_at is null and status = 'recorded');
create policy school_expenses_finance_update on public.school_expenses for update to authenticated
using (private.has_school_permission(school_id, 'school.expenses.manage'))
with check (private.has_school_permission(school_id, 'school.expenses.manage')
  and (approved_by is null or (approved_by = (select auth.uid())
    and private.has_school_permission(school_id, 'school.hr.manage'))));
create policy school_expenses_finance_delete on public.school_expenses for delete to authenticated
using (private.has_school_permission(school_id, 'school.hr.manage') and status = 'recorded');

drop policy if exists assets_read_school on public.assets;
drop policy if exists "school members view assets" on public.assets;
drop policy if exists assets_admin_manage on public.assets;
drop policy if exists authorized_staff_view_assets on public.assets;
create policy authorized_staff_view_assets on public.assets for select to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id, 'school.inventory.view'));
drop policy if exists classes_read_for_admissions on public.classes;
create policy classes_read_for_admissions on public.classes for select to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id, 'school.admissions.manage'));
drop policy if exists asset_history_admin_read on public.asset_change_logs;
create policy asset_history_authorized_read on public.asset_change_logs for select to authenticated
using (school_id = private.current_school_id() and private.has_school_permission(school_id, 'school.inventory.manage'));

alter table public.applications add column if not exists enrolled_student_id uuid references public.students(id) on delete set null;
create unique index if not exists applications_enrolled_student_unique
  on public.applications(enrolled_student_id) where enrolled_student_id is not null;
update public.applications set status = lower(status) where status <> lower(status);

drop policy if exists "public may apply" on public.applications;
drop policy if exists public_school_admission_insert on public.applications;
revoke insert on public.applications from anon, authenticated;

create or replace function public.submit_school_application(
  target_school_slug text,
  applicant_first_name text,
  applicant_last_name text,
  applicant_date_of_birth date,
  applicant_grade_level text,
  guardian_full_name text,
  guardian_email text,
  guardian_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_school uuid;
  created_application uuid;
begin
  if nullif(trim(target_school_slug), '') is null
    or nullif(trim(applicant_first_name), '') is null
    or nullif(trim(applicant_last_name), '') is null
    or applicant_date_of_birth is null
    or applicant_date_of_birth > current_date
    or nullif(trim(applicant_grade_level), '') is null
    or nullif(trim(guardian_full_name), '') is null
    or nullif(trim(guardian_email), '') is null then
    raise exception 'Complete the school, learner, date of birth, grade, and guardian details.';
  end if;
  if length(trim(applicant_first_name)) > 100 or length(trim(applicant_last_name)) > 100
    or length(trim(applicant_grade_level)) > 40 or length(trim(guardian_full_name)) > 160
    or length(trim(guardian_email)) > 254 or length(coalesce(guardian_phone, '')) > 40 then
    raise exception 'One or more application fields are too long.';
  end if;
  if position('@' in trim(guardian_email)) < 2 then raise exception 'Enter a valid guardian email address.'; end if;

  select s.id into target_school from public.schools s
  where s.slug = lower(trim(target_school_slug)) and s.status = 'active';
  if target_school is null then raise exception 'We could not find an active school with that application link.'; end if;

  insert into public.applications(
    school_id, student_first_name, student_last_name, date_of_birth, grade_level,
    parent_name, parent_email, parent_phone, status
  ) values (
    target_school, trim(applicant_first_name), trim(applicant_last_name), applicant_date_of_birth,
    trim(applicant_grade_level), trim(guardian_full_name), lower(trim(guardian_email)),
    nullif(trim(coalesce(guardian_phone, '')), ''), 'pending'
  ) returning id into created_application;

  return created_application;
end;
$$;
revoke all on function public.submit_school_application(text, text, text, date, text, text, text, text) from public;
grant execute on function public.submit_school_application(text, text, text, date, text, text, text, text) to anon, authenticated;

create or replace function public.enroll_school_application(target_application uuid, target_class uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_school uuid := private.current_school_id();
  application_row public.applications%rowtype;
  created_student uuid;
  new_admission_number text;
begin
  if active_school is null or not private.has_school_permission(active_school, 'school.admissions.manage') then
    raise exception 'You do not have permission to enroll applicants.';
  end if;

  select * into application_row
  from public.applications a
  where a.id = target_application and a.school_id = active_school
  for update;
  if not found then raise exception 'Application not found in this school.'; end if;

  if application_row.status = 'enrolled' and application_row.enrolled_student_id is not null then
    return application_row.enrolled_student_id;
  end if;
  if application_row.status <> 'accepted' then
    raise exception 'Only accepted applications can be enrolled.';
  end if;
  if target_class is not null and not exists (
    select 1 from public.classes c where c.id = target_class and c.school_id = active_school
  ) then
    raise exception 'The selected class does not belong to this school.';
  end if;

  new_admission_number := 'ADM-' || to_char(current_date, 'YYYY') || '-' || upper(substr(replace(application_row.id::text, '-', ''), 1, 8));
  insert into public.students(school_id, full_name, date_of_birth, admission_number, class_id)
  values (
    active_school,
    trim(application_row.student_first_name || ' ' || application_row.student_last_name),
    application_row.date_of_birth,
    new_admission_number,
    target_class
  ) returning id into created_student;

  update public.applications
  set status = 'enrolled', enrolled_student_id = created_student
  where id = application_row.id and school_id = active_school;

  return created_student;
end;
$$;
revoke all on function public.enroll_school_application(uuid, uuid) from public, anon;
grant execute on function public.enroll_school_application(uuid, uuid) to authenticated;

-- END supabase/043_role_access_and_admissions_hardening.sql


-- ============================================================================
-- BEGIN supabase/044_payroll_responsibility_and_payout_controls.sql
-- ============================================================================

-- Keep salary preparation with HR, authorization with the principal, and
-- settlement recording with the finance officer.

alter table public.payment_transactions
  add column if not exists confirmed_by uuid references public.profiles(id);

-- Finance staff can view approved payroll and record its external settlement,
-- but cannot create or modify payroll runs or payroll items.
drop policy if exists payroll_prepare on public.payroll_runs;
create policy payroll_prepare on public.payroll_runs for insert to authenticated
with check (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  and prepared_by = (select auth.uid()) and status = 'draft'
);

drop policy if exists payroll_update on public.payroll_runs;
create policy payroll_update on public.payroll_runs for update to authenticated
using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  and status in ('draft','submitted','rejected')
)
with check (private.has_hr_role(school_id, array['principal','hr_admin']));

drop policy if exists payroll_items_prepare on public.payroll_items;
create policy payroll_items_prepare on public.payroll_items for all to authenticated
using (
  private.has_hr_role(school_id, array['principal','hr_admin']) and exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
      and r.status in ('draft','rejected')
  )
)
with check (
  private.has_hr_role(school_id, array['principal','hr_admin']) and exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
      and r.status in ('draft','rejected')
  )
);

-- All new payout records begin pending and must match the approved net salary.
drop policy if exists payments_manage on public.payment_transactions;
drop policy if exists payments_insert_authorized on public.payment_transactions;
revoke insert, update, delete on public.payment_transactions from public, anon, authenticated;

create or replace function public.record_salary_payment(
  target_item uuid,
  provider_value text,
  reference_value text,
  amount_value numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_row public.payroll_items%rowtype;
  run_status text;
  created_payment uuid;
  reference_clean text := nullif(trim(coalesce(reference_value, '')), '');
begin
  select * into item_row from public.payroll_items where id = target_item for update;
  if not found then raise exception 'Payroll item not found.'; end if;
  if not private.has_hr_role(item_row.school_id, array['finance_officer']) then
    raise exception 'Only the finance officer can record salary payouts.';
  end if;
  select status into run_status from public.payroll_runs
    where id = item_row.payroll_run_id and school_id = item_row.school_id;
  if run_status not in ('approved','paying') then
    raise exception 'Only an approved payroll can be paid.';
  end if;
  if amount_value is null or amount_value <> item_row.net_pay then
    raise exception 'The payout amount must equal the approved net salary.';
  end if;
  if provider_value not in ('bank','mobile_money','mpesa','cash','other') then
    raise exception 'Choose a valid payment method.';
  end if;
  if provider_value in ('bank','mobile_money','mpesa') and reference_clean is null then
    raise exception 'Enter the bank or mobile-money transaction reference.';
  end if;
  if length(coalesce(reference_clean, '')) > 160 then
    raise exception 'The transaction reference is too long.';
  end if;
  if exists (
    select 1 from public.payment_transactions p
    where p.payroll_item_id = target_item and p.status in ('pending','processing','paid')
  ) then raise exception 'This salary already has an open or completed payout record.'; end if;

  insert into public.payment_transactions(
    school_id, payroll_item_id, provider, transaction_reference, amount, status, initiated_by
  ) values (
    item_row.school_id, target_item, provider_value, reference_clean, amount_value, 'pending', (select auth.uid())
  ) returning id into created_payment;
  return created_payment;
end;
$$;
revoke all on function public.record_salary_payment(uuid,text,text,numeric) from public, anon;
grant execute on function public.record_salary_payment(uuid,text,text,numeric) to authenticated;

create or replace function public.confirm_salary_payment(target_payment uuid, decision_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payment_transactions%rowtype;
  item_row public.payroll_items%rowtype;
  run_status text;
begin
  if decision_value not in ('paid','failed') then raise exception 'Choose paid or failed.'; end if;
  select * into payment_row from public.payment_transactions where id = target_payment for update;
  if not found then raise exception 'Payout record not found.'; end if;
  if not private.has_hr_role(payment_row.school_id, array['finance_officer']) then
    raise exception 'Only the finance officer can confirm salary payouts.';
  end if;
  if payment_row.status not in ('pending','processing') then
    raise exception 'Only an open payout record can be confirmed.';
  end if;
  select * into item_row from public.payroll_items
    where id = payment_row.payroll_item_id and school_id = payment_row.school_id;
  if not found or payment_row.amount <> item_row.net_pay then
    raise exception 'Payout does not match the approved net salary.';
  end if;
  select status into run_status from public.payroll_runs
    where id = item_row.payroll_run_id and school_id = item_row.school_id;
  if run_status not in ('approved','paying') then raise exception 'The payroll is not approved for payment.'; end if;
  if decision_value = 'paid' and payment_row.provider in ('bank','mobile_money','mpesa')
    and nullif(trim(coalesce(payment_row.transaction_reference, '')), '') is null then
    raise exception 'A bank or mobile-money reference is required before confirming payment.';
  end if;
  if decision_value = 'paid' and exists (
    select 1 from public.payment_transactions p
    where p.payroll_item_id = payment_row.payroll_item_id and p.status = 'paid' and p.id <> payment_row.id
  ) then raise exception 'This salary already has a completed payout.'; end if;

  update public.payment_transactions set status = decision_value,
    confirmed_by = case when decision_value = 'paid' then (select auth.uid()) else null end,
    confirmed_at = case when decision_value = 'paid' then now() else null end
  where id = target_payment;
end;
$$;
revoke all on function public.confirm_salary_payment(uuid,text) from public, anon;
grant execute on function public.confirm_salary_payment(uuid,text) to authenticated;

-- Finance is a separate workspace; it does not grant access to HR records.
delete from public.school_role_permission_catalog
where role_key = 'finance_officer' and permission_key = 'school.hr.portal.view';

-- END supabase/044_payroll_responsibility_and_payout_controls.sql


-- ============================================================================
-- BEGIN supabase/045_staff_attendance_role_access.sql
-- ============================================================================

-- Match staff-attendance row-level security to the roles shown the management UI.
-- School administrators are already included by private.has_hr_role.

drop policy if exists staff_attendance_admin_read on public.staff_attendance;
create policy staff_attendance_admin_read on public.staff_attendance
for select to authenticated
using (
  school_id = private.current_school_id()
  and private.has_hr_role(school_id, array['principal','deputy_principal','hr_admin'])
);

drop policy if exists staff_attendance_admin_manage on public.staff_attendance;
create policy staff_attendance_admin_manage on public.staff_attendance
for all to authenticated
using (
  school_id = private.current_school_id()
  and private.has_hr_role(school_id, array['principal','deputy_principal','hr_admin'])
)
with check (
  school_id = private.current_school_id()
  and private.has_hr_role(school_id, array['principal','deputy_principal','hr_admin'])
  and exists (
    select 1 from public.profiles p
    where p.id = staff_profile_id
      and p.school_id = staff_attendance.school_id
      and p.role in ('school_admin','teacher')
  )
  and recorded_by = (select auth.uid())
);

-- END supabase/045_staff_attendance_role_access.sql


-- ============================================================================
-- BEGIN supabase/046_single_source_staff_roles.sql
-- ============================================================================

-- Specialist access is managed only through school_staff_role_assignments.
-- Migrations 041 and 043 already copied valid legacy HR roles into that table.

create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.role = 'teacher'
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
  );
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.role = 'teacher'
    where a.profile_id = (select auth.uid()) and a.school_id = target_school and a.role_key = any(allowed_roles)
  );
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

create or replace function private.enforce_privileged_mfa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role;
  actor_school uuid;
  privileged boolean := false;
begin
  if actor_id is null or (select auth.role()) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select p.role, p.school_id into actor_role, actor_school
  from public.profiles p where p.id = actor_id;

  privileged := actor_role in ('super_admin','school_admin') or exists (
    select 1 from public.school_staff_role_assignments a
    where a.profile_id = actor_id and a.school_id = actor_school
      and a.role_key in ('principal','deputy_principal','hr_admin','finance_officer','registrar','inventory_manager','nurse','counsellor','transport_manager')
  );

  if privileged and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication is required for privileged changes.' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_privileged_mfa() from public, anon, authenticated;

-- The legacy role table is no longer an access source. Remove rows after their
-- migrated assignments exist so unchecking a role revokes it everywhere.
drop policy if exists hr_roles_read on public.school_hr_roles;
drop policy if exists hr_roles_admin_manage on public.school_hr_roles;
revoke all on public.school_hr_roles from public, anon, authenticated;
delete from public.school_hr_roles;

-- END supabase/046_single_source_staff_roles.sql


-- ============================================================================
-- BEGIN supabase/047_library_role_access.sql
-- ============================================================================

-- Only school administrators, principals, and librarians can publish library
-- resources. All school members with portal access can read their school's files.

drop policy if exists "school members resources" on public.resources;
drop policy if exists resources_read_school on public.resources;
drop policy if exists resources_staff_insert on public.resources;
drop policy if exists resources_staff_update on public.resources;
drop policy if exists resources_staff_delete on public.resources;

create policy resources_read_school on public.resources
for select to authenticated
using (school_id = private.current_school_id());

create policy resources_staff_insert on public.resources
for insert to authenticated
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.library.manage')
  and uploaded_by = (select auth.uid())
  and (subject_id is null or exists (
    select 1 from public.subjects s where s.id = resources.subject_id and s.school_id = resources.school_id
  ))
);

create policy resources_staff_update on public.resources
for update to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.library.manage')
)
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.library.manage')
  and (subject_id is null or exists (
    select 1 from public.subjects s where s.id = resources.subject_id and s.school_id = resources.school_id
  ))
);

create policy resources_staff_delete on public.resources
for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.library.manage')
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'resources', 'resources', false, 52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists school_library_files_read on storage.objects;
create policy school_library_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = private.current_school_id()::text
);

drop policy if exists school_library_files_insert on storage.objects;
create policy school_library_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and private.has_school_permission(private.current_school_id(), 'school.library.manage')
);

drop policy if exists school_library_files_delete on storage.objects;
create policy school_library_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'library'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and private.has_school_permission(private.current_school_id(), 'school.library.manage')
);

-- END supabase/047_library_role_access.sql


-- ============================================================================
-- BEGIN supabase/048_timetable_role_access.sql
-- ============================================================================

-- Remove legacy school-wide and teacher-owner write rules. Timetable writes
-- are managed through the principal/deputy permissions created in migration 041.

drop policy if exists "school members timetable" on public.timetable;
drop policy if exists timetable_staff_insert on public.timetable;
drop policy if exists timetable_staff_update on public.timetable;
drop policy if exists timetable_staff_delete on public.timetable;

-- END supabase/048_timetable_role_access.sql


-- ============================================================================
-- BEGIN supabase/049_payroll_separation_of_duties.sql
-- ============================================================================

-- HR maintains personnel and salary records and prepares payroll. The
-- principal approves; Finance only receives the minimum payout information.

drop policy if exists employees_read on public.hr_employees;
create policy employees_read on public.hr_employees for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  or profile_id = (select auth.uid())
);

drop policy if exists salary_read on public.salary_structures;
create policy salary_read on public.salary_structures for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e
    where e.id = salary_structures.employee_id and e.profile_id = (select auth.uid())
  )
);

drop policy if exists salary_manage on public.salary_structures;
create policy salary_manage on public.salary_structures for all to authenticated
using (private.has_hr_role(school_id, array['hr_admin']))
with check (
  private.has_hr_role(school_id, array['hr_admin'])
  and approval_status = 'pending' and approved_by is null and approved_at is null
);

drop policy if exists payroll_prepare on public.payroll_runs;
create policy payroll_prepare on public.payroll_runs for insert to authenticated
with check (
  private.has_hr_role(school_id, array['hr_admin'])
  and prepared_by = (select auth.uid()) and status = 'draft'
);

drop policy if exists payroll_update on public.payroll_runs;
create policy payroll_update on public.payroll_runs for update to authenticated
using (
  private.has_hr_role(school_id, array['hr_admin'])
  and status in ('draft','submitted','rejected')
)
with check (private.has_hr_role(school_id, array['hr_admin']));

drop policy if exists payroll_items_prepare on public.payroll_items;
create policy payroll_items_prepare on public.payroll_items for all to authenticated
using (
  private.has_hr_role(school_id, array['hr_admin']) and exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
      and r.status in ('draft','rejected')
  )
)
with check (
  private.has_hr_role(school_id, array['hr_admin']) and exists (
    select 1 from public.payroll_runs r
    where r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
      and r.status in ('draft','rejected')
  )
);

drop policy if exists payroll_items_read on public.payroll_items;
create policy payroll_items_read on public.payroll_items for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e join public.payroll_runs r on r.id = payroll_items.payroll_run_id
    where e.id = payroll_items.employee_id and e.profile_id = (select auth.uid())
      and r.status in ('approved','paying','paid','closed')
  )
);

create or replace function public.list_salary_payout_items()
returns table (
  id uuid,
  net_pay numeric,
  pay_period date,
  payroll_status text,
  currency_code text,
  employee_name text,
  staff_number text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_school uuid := private.current_school_id();
begin
  if target_school is null or not private.has_hr_role(target_school, array['principal','finance_officer']) then
    raise exception 'Finance or principal portal access is required.';
  end if;

  return query
    select i.id, i.net_pay, r.pay_period, r.status, r.currency_code, e.full_name, e.staff_number
    from public.payroll_items i
    join public.payroll_runs r on r.id = i.payroll_run_id and r.school_id = i.school_id
    join public.hr_employees e on e.id = i.employee_id and e.school_id = i.school_id
    where i.school_id = target_school and r.status in ('approved','paying','paid','closed')
    order by r.pay_period desc, e.full_name;
end;
$$;
revoke all on function public.list_salary_payout_items() from public, anon;
grant execute on function public.list_salary_payout_items() to authenticated;

-- END supabase/049_payroll_separation_of_duties.sql


-- ============================================================================
-- BEGIN supabase/050_school_broadcast_admin_only.sql
-- ============================================================================

-- Bulk school-wide communication is an administrator capability. Teachers
-- keep their normal one-to-one messages but cannot create bulk broadcasts.

drop policy if exists broadcasts_staff_manage on public.broadcasts;
create policy broadcasts_school_admin_manage on public.broadcasts
for all to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
)
with check (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
);

-- END supabase/050_school_broadcast_admin_only.sql


-- ============================================================================
-- BEGIN supabase/051_assessment_resources_subject_scope.sql
-- ============================================================================

-- Teacher assessment banks and subject resources must follow the teacher's
-- current subject/class assignments, including after an assignment is revoked.

drop policy if exists quiz_question_bank_read_staff on public.quiz_question_bank;
create policy quiz_question_bank_read_staff on public.quiz_question_bank
for select to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = quiz_question_bank.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = quiz_question_bank.subject_id
      )
    )
  )
);

drop policy if exists quiz_question_bank_delete_staff on public.quiz_question_bank;
create policy quiz_question_bank_delete_staff on public.quiz_question_bank
for delete to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and created_by = (select auth.uid())
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = quiz_question_bank.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = quiz_question_bank.subject_id
      )
    )
  )
);

drop policy if exists quizzes_read_school on public.quizzes;
create policy quizzes_read_school on public.quizzes
for select to authenticated
using (
  private.current_role() = 'super_admin'
  or (
    school_id = private.current_school_id()
    and (
      private.current_role() = 'school_admin'
      or (
        private.current_role() = 'teacher'
        and exists (
          select 1 from public.teacher_subject_assignments tsa
          where tsa.school_id = quizzes.school_id
            and tsa.teacher_id = (select auth.uid())
            and tsa.subject_id = quizzes.subject_id
            and (quizzes.class_id is null or tsa.class_id = quizzes.class_id)
        )
      )
      or (
        private.current_role() in ('student','parent')
        and published = true
        and (class_id is null or private.can_view_class(class_id))
      )
    )
  )
);

drop policy if exists quiz_questions_staff_read on public.quiz_questions;
create policy quiz_questions_staff_read on public.quiz_questions
for select to authenticated
using (
  private.current_role() = 'super_admin'
  or exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_questions_staff_insert on public.quiz_questions;
create policy quiz_questions_staff_insert on public.quiz_questions
for insert to authenticated
with check (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_questions_staff_update on public.quiz_questions;
create policy quiz_questions_staff_update on public.quiz_questions
for update to authenticated
using (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
)
with check (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_questions_staff_delete on public.quiz_questions;
create policy quiz_questions_staff_delete on public.quiz_questions
for delete to authenticated
using (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quizzes q
    where q.id = quiz_questions.quiz_id
      and q.school_id = private.current_school_id()
      and not exists (select 1 from public.quiz_results r where r.quiz_id = q.id)
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_answers_teacher_grade on public.quiz_answers;
create policy quiz_answers_teacher_grade on public.quiz_answers
for update to authenticated
using (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quiz_results r
    join public.quizzes q on q.id = r.quiz_id
    where r.id = quiz_answers.result_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
)
with check (
  private.current_role() in ('school_admin','teacher')
  and exists (
    select 1 from public.quiz_results r
    join public.quizzes q on q.id = r.quiz_id
    where r.id = quiz_answers.result_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          q.created_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id
              and (q.class_id is null or tsa.class_id = q.class_id)
          )
        )
      )
  )
);

drop policy if exists quiz_accommodations_read_staff on public.quiz_accommodations;
create policy quiz_accommodations_read_staff on public.quiz_accommodations
for select to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and private.can_view_student(student_id)
      and exists (
        select 1 from public.quizzes q
        join public.teacher_subject_assignments tsa
          on tsa.school_id = q.school_id and tsa.subject_id = q.subject_id
        where q.id = quiz_accommodations.quiz_id
          and q.school_id = quiz_accommodations.school_id
          and q.created_by = (select auth.uid())
          and tsa.teacher_id = (select auth.uid())
          and (q.class_id is null or tsa.class_id = q.class_id)
      )
    )
  )
);

drop policy if exists quiz_accommodations_manage_staff on public.quiz_accommodations;
create policy quiz_accommodations_manage_staff on public.quiz_accommodations
for all to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and private.can_view_student(student_id)
      and exists (
        select 1 from public.quizzes q
        join public.teacher_subject_assignments tsa
          on tsa.school_id = q.school_id and tsa.subject_id = q.subject_id
        where q.id = quiz_accommodations.quiz_id
          and q.school_id = quiz_accommodations.school_id
          and q.created_by = (select auth.uid())
          and tsa.teacher_id = (select auth.uid())
          and (q.class_id is null or tsa.class_id = q.class_id)
      )
    )
  )
)
with check (
  school_id = private.current_school_id()
  and updated_by = (select auth.uid())
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and private.can_view_student(student_id)
      and exists (
        select 1 from public.quizzes q
        join public.teacher_subject_assignments tsa
          on tsa.school_id = q.school_id and tsa.subject_id = q.subject_id
        join public.students s on s.id = quiz_accommodations.student_id and s.school_id = q.school_id
        where q.id = quiz_accommodations.quiz_id
          and q.school_id = quiz_accommodations.school_id
          and q.created_by = (select auth.uid())
          and tsa.teacher_id = (select auth.uid())
          and (q.class_id is null or tsa.class_id = q.class_id)
          and (q.class_id is null or s.class_id = q.class_id)
      )
    )
  )
);

create or replace function public.grade_quiz_answer(p_answer_id uuid, p_points numeric, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  answer_row public.quiz_answers;
  result_row public.quiz_results;
  question_row public.quiz_questions;
  quiz_row public.quizzes;
  new_score numeric;
  still_pending boolean;
begin
  if (select private.current_role()) not in ('teacher','school_admin') then
    raise exception 'Staff access is required.';
  end if;

  select a.* into answer_row from public.quiz_answers a where a.id = p_answer_id for update;
  select q.* into question_row from public.quiz_questions q where q.id = answer_row.question_id;
  select r.* into result_row from public.quiz_results r where r.id = answer_row.result_id;
  select q.* into quiz_row from public.quizzes q where q.id = result_row.quiz_id;

  if answer_row.id is null
    or quiz_row.school_id is distinct from (select private.current_school_id())
    or (
      (select private.current_role()) = 'teacher'
      and (
        quiz_row.created_by is distinct from (select auth.uid())
        or not exists (
          select 1 from public.teacher_subject_assignments tsa
          where tsa.school_id = quiz_row.school_id
            and tsa.teacher_id = (select auth.uid())
            and tsa.subject_id = quiz_row.subject_id
            and (quiz_row.class_id is null or tsa.class_id = quiz_row.class_id)
        )
      )
    ) then
    raise exception 'Answer not found or access denied.';
  end if;

  if p_points is null or p_points < 0 or p_points > greatest(question_row.points,0) then
    raise exception 'Mark is outside the question point range.';
  end if;

  update public.quiz_answers
  set earned_points = p_points, teacher_feedback = p_feedback, graded_by = (select auth.uid()), graded_at = now()
  where id = p_answer_id;

  select coalesce(sum(a.earned_points),0) into new_score
  from public.quiz_answers a where a.result_id = result_row.id;

  select exists(
    select 1 from public.quiz_answers a join public.quiz_questions q on q.id = a.question_id
    where a.result_id = result_row.id and q.question_type not in ('mcq','true_false') and a.graded_at is null
  ) into still_pending;

  update public.quiz_results set score = new_score, needs_review = still_pending where id = result_row.id;

  insert into public.notifications(school_id,user_id,title,body,type)
  select quiz_row.school_id, s.profile_id, 'Assessment feedback: ' || quiz_row.title,
    'Your written answer has been marked. Current score: ' || new_score || '/' || result_row.total_points || '.', 'academic'
  from public.students s where s.id = result_row.student_id and s.profile_id is not null;
end;
$$;
revoke all on function public.grade_quiz_answer(uuid,numeric,text) from public, anon;
grant execute on function public.grade_quiz_answer(uuid,numeric,text) to authenticated;

drop policy if exists subject_resources_read_scope on public.subject_resources;
create policy subject_resources_read_scope on public.subject_resources
for select to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = subject_resources.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = subject_resources.subject_id
          and (subject_resources.class_id is null or tsa.class_id = subject_resources.class_id)
      )
    )
    or (
      private.current_role() in ('student','parent')
      and (class_id is null or private.can_view_class(class_id))
    )
  )
);

drop policy if exists subject_resources_staff_delete on public.subject_resources;
create policy subject_resources_staff_delete on public.subject_resources
for delete to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and uploaded_by = (select auth.uid())
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = subject_resources.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = subject_resources.subject_id
          and (subject_resources.class_id is null or tsa.class_id = subject_resources.class_id)
      )
    )
  )
);

drop policy if exists subject_resource_files_delete on storage.objects;
create policy subject_resource_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'subject-resources'
  and (storage.foldername(name))[1] = private.current_school_id()::text
  and exists (
    select 1 from public.subject_resources r
    where r.file_path = name
      and r.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and r.uploaded_by = (select auth.uid())
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = r.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = r.subject_id
              and (r.class_id is null or tsa.class_id = r.class_id)
          )
        )
      )
  )
);

-- END supabase/051_assessment_resources_subject_scope.sql


-- ============================================================================
-- BEGIN supabase/052_school_calendar_role_access.sql
-- ============================================================================

-- Keep the calendar readable across the school but reserve school-wide event
-- management for school admins, principals, and deputy principals.

insert into public.school_role_permission_catalog(role_key, permission_key) values
  ('principal', 'school.calendar.manage'),
  ('deputy_principal', 'school.calendar.manage')
on conflict do nothing;

drop policy if exists events_staff_insert on public.events;
create policy events_staff_insert on public.events
for insert to authenticated
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.calendar.manage')
);

drop policy if exists events_staff_update on public.events;
create policy events_staff_update on public.events
for update to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.calendar.manage')
)
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.calendar.manage')
);

drop policy if exists events_staff_delete on public.events;
create policy events_staff_delete on public.events
for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.calendar.manage')
);

-- END supabase/052_school_calendar_role_access.sql


-- ============================================================================
-- BEGIN supabase/053_school_announcement_role_access.sql
-- ============================================================================

-- All school members may read official notices. Only school administrators
-- and assigned principals may publish, change, or remove them.

insert into public.school_role_permission_catalog(role_key, permission_key) values
  ('principal', 'school.announcements.manage')
on conflict do nothing;

drop policy if exists announcements_staff_insert on public.announcements;
create policy announcements_school_leadership_insert on public.announcements
for insert to authenticated
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.announcements.manage')
);

drop policy if exists announcements_staff_update on public.announcements;
create policy announcements_school_leadership_update on public.announcements
for update to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.announcements.manage')
)
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.announcements.manage')
);

drop policy if exists announcements_staff_delete on public.announcements;
create policy announcements_school_leadership_delete on public.announcements
for delete to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.announcements.manage')
);

-- END supabase/053_school_announcement_role_access.sql


-- ============================================================================
-- BEGIN supabase/054_course_builder_subject_role_scope.sql
-- ============================================================================

-- Keep teacher course authoring limited to their currently assigned subjects.
-- Published courses remain readable by other members of the same school.

drop policy if exists courses_read_school on public.courses;
create policy courses_read_school on public.courses for select to authenticated using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or is_published = true
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = courses.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = courses.subject_id
      )
    )
  )
);

drop policy if exists courses_staff_manage on public.courses;
create policy courses_staff_manage on public.courses for all to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = courses.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = courses.subject_id
      )
    )
  )
)
with check (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = courses.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.subject_id = courses.subject_id
      )
    )
  )
);

drop policy if exists course_chapters_read_school on public.course_chapters;
create policy course_chapters_read_school on public.course_chapters for select to authenticated using (
  exists (
    select 1 from public.courses c
    where c.id = course_chapters.course_id
      and c.school_id = private.current_school_id()
      and (
        c.is_published = true
        or private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and c.teacher_id = (select auth.uid())
          and c.subject_id is not null
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = c.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = c.subject_id
          )
        )
      )
  )
);

drop policy if exists course_chapters_staff_manage on public.course_chapters;
create policy course_chapters_staff_manage on public.course_chapters for all to authenticated
using (
  exists (
    select 1 from public.courses c
    where c.id = course_chapters.course_id
      and c.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and c.teacher_id = (select auth.uid())
          and c.subject_id is not null
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = c.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = c.subject_id
          )
        )
      )
  )
)
with check (
  exists (
    select 1 from public.courses c
    where c.id = course_chapters.course_id
      and c.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (
          private.current_role() = 'teacher'
          and c.teacher_id = (select auth.uid())
          and c.subject_id is not null
          and exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = c.school_id
              and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = c.subject_id
          )
        )
      )
  )
);

-- END supabase/054_course_builder_subject_role_scope.sql


-- ============================================================================
-- BEGIN supabase/055_lesson_plan_assignment_role_scope.sql
-- ============================================================================

-- Lesson plans are school-admin managed and teacher access follows current
-- class/subject assignments. Learners can read only public plans for classes
-- they are related to through private.can_view_class().

drop policy if exists lesson_plans_read_related on public.lesson_plans;
create policy lesson_plans_read_related on public.lesson_plans for select to authenticated using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and class_id is not null
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = lesson_plans.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.class_id = lesson_plans.class_id
          and tsa.subject_id = lesson_plans.subject_id
      )
    )
    or (
      private.current_role() = 'student'
      and is_public = true
      and class_id is not null
      and private.can_view_class(class_id)
    )
  )
);

drop policy if exists lesson_plans_staff_manage on public.lesson_plans;
create policy lesson_plans_staff_manage on public.lesson_plans for all to authenticated
using (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and class_id is not null
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = lesson_plans.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.class_id = lesson_plans.class_id
          and tsa.subject_id = lesson_plans.subject_id
      )
    )
  )
)
with check (
  school_id = private.current_school_id()
  and (
    private.current_role() = 'school_admin'
    or (
      private.current_role() = 'teacher'
      and teacher_id = (select auth.uid())
      and class_id is not null
      and subject_id is not null
      and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.school_id = lesson_plans.school_id
          and tsa.teacher_id = (select auth.uid())
          and tsa.class_id = lesson_plans.class_id
          and tsa.subject_id = lesson_plans.subject_id
      )
    )
  )
);

-- END supabase/055_lesson_plan_assignment_role_scope.sql


-- ============================================================================
-- BEGIN supabase/056_non_teaching_staff_self_service_portal.sql
-- ============================================================================

-- Separate non-teaching staff accounts from teacher accounts. Apply after 055.
alter type public.user_role add value if not exists 'staff';

alter table public.school_portal_invites
  drop constraint if exists school_portal_invites_role_check;
alter table public.school_portal_invites
  add constraint school_portal_invites_role_check
  check (role::text in ('teacher', 'staff', 'student', 'parent'));

-- General staff now have a real base portal role instead of a teacher
-- specialist assignment that only granted a generic profile permission.
delete from public.school_staff_role_assignments where role_key = 'staff_member';
delete from public.school_role_permission_catalog where role_key = 'staff_member';

-- A profile owner may edit personal details, but cannot grant themselves a
-- different portal role or move their account into another school.
create or replace function private.prevent_self_role_or_school_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.id = (select auth.uid())
    and coalesce((select auth.role()), '') <> 'service_role'
    and (new.role is distinct from old.role or new.school_id is distinct from old.school_id) then
    raise exception 'Portal role and school membership can only be changed by an authorized school administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_self_role_or_school_change() from public, anon, authenticated;
drop trigger if exists prevent_self_role_or_school_change on public.profiles;
create trigger prevent_self_role_or_school_change
before update of role, school_id on public.profiles
for each row execute function private.prevent_self_role_or_school_change();

-- Keep each employee's existing self-service rows inside their own school.
drop policy if exists employees_read on public.hr_employees;
create policy employees_read on public.hr_employees for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin'])
  or (school_id = private.current_school_id() and profile_id = (select auth.uid()))
);
drop policy if exists contracts_read on public.employment_contracts;
create policy contracts_read on public.employment_contracts for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = employment_contracts.employee_id
      and e.school_id = employment_contracts.school_id and e.profile_id = (select auth.uid())
  )
);
drop policy if exists leave_read on public.hr_leave_requests;
create policy leave_read on public.hr_leave_requests for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id
      and e.school_id = hr_leave_requests.school_id and e.profile_id = (select auth.uid())
  )
);
drop policy if exists salary_read on public.salary_structures;
create policy salary_read on public.salary_structures for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = salary_structures.employee_id
      and e.school_id = salary_structures.school_id and e.profile_id = (select auth.uid())
  )
);
drop policy if exists payroll_items_read on public.payroll_items;
create policy payroll_items_read on public.payroll_items for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e join public.payroll_runs r
      on r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
    where e.id = payroll_items.employee_id and e.school_id = payroll_items.school_id
      and e.profile_id = (select auth.uid()) and r.status in ('approved','paying','paid','closed')
  )
);
drop policy if exists payments_read on public.payment_transactions;
create policy payments_read on public.payment_transactions for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer']) or exists (
    select 1 from public.payroll_items i join public.hr_employees e
      on e.id = i.employee_id and e.school_id = i.school_id
    where i.id = payment_transactions.payroll_item_id and i.school_id = payment_transactions.school_id
      and e.profile_id = (select auth.uid())
  )
);

-- Return only the signed-in employee's own approved/released payslip data.
create or replace function public.list_my_staff_payslips()
returns table (
  id uuid,
  pay_period date,
  currency_code text,
  basic_salary numeric,
  allowances jsonb,
  deductions jsonb,
  gross_pay numeric,
  total_deductions numeric,
  net_pay numeric,
  payout_status text,
  payout_provider text,
  payout_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_school uuid;
begin
  select p.school_id into actor_school
  from public.profiles p
  where p.id = actor_id and p.role::text = 'staff';

  if actor_id is null or actor_school is null then
    raise exception 'A school staff account is required.' using errcode = '42501';
  end if;

  return query
    select i.id, r.pay_period, r.currency_code, i.basic_salary, i.allowances, i.deductions,
      i.gross_pay, i.total_deductions, i.net_pay, payout.status, payout.provider, payout.transaction_reference
    from public.hr_employees e
    join public.payroll_items i on i.employee_id = e.id and i.school_id = e.school_id
    join public.payroll_runs r on r.id = i.payroll_run_id and r.school_id = i.school_id
    left join lateral (
      select t.status, t.provider, t.transaction_reference
      from public.payment_transactions t
      where t.payroll_item_id = i.id and t.school_id = i.school_id
      order by t.created_at desc limit 1
    ) payout on true
    where e.profile_id = actor_id and e.school_id = actor_school
      and r.status in ('approved', 'paying', 'paid', 'closed')
    order by r.pay_period desc;
end;
$$;
revoke all on function public.list_my_staff_payslips() from public, anon;
grant execute on function public.list_my_staff_payslips() to authenticated;

-- END supabase/056_non_teaching_staff_self_service_portal.sql


-- ============================================================================
-- BEGIN supabase/057_active_account_role_enforcement.sql
-- ============================================================================

-- Disabled profiles must lose app and data access, including through sessions
-- issued before their account was disabled.
create or replace function private.current_role()
returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true
  limit 1
$$;

create or replace function private.current_school_id()
returns uuid
language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true
  limit 1
$$;

create or replace function private.can_view_class(target_class uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor
    join public.classes c on c.id = target_class
    where actor.id = (select auth.uid()) and actor.is_active is true and (
      (c.school_id = actor.school_id and actor.role = 'school_admin')
      or (c.school_id = actor.school_id and actor.role = 'teacher' and (
        c.teacher_id = actor.id
        or exists (select 1 from public.teacher_subject_assignments tsa where tsa.class_id = c.id and tsa.teacher_id = actor.id)
      ))
      or exists (select 1 from public.students s where s.class_id = c.id and s.profile_id = actor.id and s.school_id = actor.school_id)
      or (actor.role = 'parent' and exists (
        select 1 from public.students s join public.student_guardians g on g.student_id = s.id
        where s.class_id = c.id and s.school_id = actor.school_id and g.guardian_id = actor.id
      ))
    )
  )
$$;

create or replace function private.can_view_student(target_student uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor
    join public.students s on s.id = target_student
    where actor.id = (select auth.uid()) and actor.is_active is true and (
      (s.school_id = actor.school_id and actor.role = 'school_admin')
      or (s.school_id = actor.school_id and s.profile_id = actor.id)
      or (s.school_id = actor.school_id and actor.role = 'teacher' and exists (
        select 1 from public.classes c where c.id = s.class_id and c.school_id = s.school_id and (
          c.teacher_id = actor.id or exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.teacher_id = actor.id and tsa.class_id = c.id and tsa.school_id = c.school_id
          )
        )
      ))
      or (s.school_id = actor.school_id and actor.role = 'parent' and exists (
        select 1 from public.student_guardians g where g.student_id = s.id and g.guardian_id = actor.id
      ))
    )
  )
$$;

create or replace function private.can_grade_student(target_student uuid, target_subject uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
    join public.profiles actor on actor.id = (select auth.uid()) and actor.is_active is true
    where s.id = target_student and s.school_id = actor.school_id and (
      (actor.role = 'school_admin')
      or (actor.role = 'teacher' and exists (
        select 1 from public.teacher_subject_assignments tsa
        where tsa.teacher_id = actor.id and tsa.school_id = actor.school_id
          and tsa.class_id = s.class_id and tsa.subject_id = target_subject
      ))
    )
  )
$$;

create or replace function public.same_school(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and (p.role = 'super_admin' or p.school_id = target_school)
  )
$$;
revoke all on function public.same_school(uuid) from public, anon;
grant execute on function public.same_school(uuid) to authenticated;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true and p.role = 'super_admin')
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.request_school_plan(p_plan text)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; result public.subscriptions;
begin
  select * into actor from public.profiles where id = (select auth.uid()) and is_active is true;
  if actor.role is distinct from 'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator account is required.' using errcode = '42501';
  end if;
  if p_plan not in ('Starter','Professional','Enterprise') then raise exception 'Choose a valid SmartSchool plan.'; end if;
  update public.subscriptions set requested_plan = p_plan, request_status = 'pending', requested_at = now()
  where school_id = actor.school_id returning * into result;
  if result.id is null then raise exception 'Subscription record not found.'; end if;
  return result;
end;
$$;
revoke all on function public.request_school_plan(text) from public, anon;
grant execute on function public.request_school_plan(text) to authenticated;

create or replace function public.platform_set_subscription(p_school_id uuid, p_plan text, p_status text, p_ends_at timestamptz default null)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.subscriptions;
begin
  select role into actor_role from public.profiles where id = (select auth.uid()) and is_active is true;
  if actor_role is distinct from 'super_admin' then raise exception 'An active platform administrator account is required.' using errcode = '42501'; end if;
  if p_plan not in ('Starter','Professional','Enterprise') then raise exception 'Choose a valid plan.'; end if;
  if p_status not in ('pending','trial','active','suspended','expired','cancelled') then raise exception 'Choose a valid subscription status.'; end if;
  update public.subscriptions set plan=p_plan,status=p_status,
    starts_at=case when p_status in ('trial','active') then coalesce(starts_at,now()) else starts_at end,
    ends_at=p_ends_at,requested_plan=null,request_status=case when p_status='pending' then 'pending' else 'approved' end
  where school_id=p_school_id returning * into result;
  if result.id is null then raise exception 'Subscription not found.'; end if;
  update public.schools set subscription_plan=p_plan,
    status=case when p_status in ('trial','active') then 'active'::public.school_status
      when p_status in ('suspended','expired','cancelled') then 'suspended'::public.school_status
      else 'pending'::public.school_status end where id=p_school_id;
  return result;
end;
$$;
revoke all on function public.platform_set_subscription(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.platform_set_subscription(uuid,text,text,timestamptz) to authenticated;

create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.schools;
begin
  select role into actor_role from public.profiles where id = (select auth.uid()) and is_active is true;
  if actor_role is distinct from 'super_admin' then raise exception 'An active platform administrator account is required.' using errcode = '42501'; end if;
  update public.schools set status=p_status where id=p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end;
$$;
revoke all on function public.platform_set_school_status(uuid,public.school_status) from public, anon;
grant execute on function public.platform_set_school_status(uuid,public.school_status) to authenticated;

create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.is_active is true and p.role = 'teacher'
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school and c.permission_key = required_permission
  )
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.is_active is true and p.role = 'teacher'
    where a.profile_id = (select auth.uid()) and a.school_id = target_school and a.role_key = any(allowed_roles)
  )
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

-- Account holders may edit ordinary profile fields, never their access state.
create or replace function private.prevent_self_role_or_school_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.id = (select auth.uid())
    and coalesce((select auth.role()), '') <> 'service_role'
    and (new.role is distinct from old.role or new.school_id is distinct from old.school_id
      or new.is_active is distinct from old.is_active) then
    raise exception 'Portal role, account status, and school membership can only be changed by an authorized administrator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_self_role_or_school_change on public.profiles;
create trigger prevent_self_role_or_school_change
before update of role, school_id, is_active on public.profiles
for each row execute function private.prevent_self_role_or_school_change();

-- Only active administrators can inspect or change specialist role grants.
drop policy if exists school_staff_roles_read on public.school_staff_role_assignments;
create policy school_staff_roles_read on public.school_staff_role_assignments for select to authenticated using (
  (profile_id = (select auth.uid()) and school_id = private.current_school_id())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
    and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin')
);
drop policy if exists school_staff_roles_admin_manage on public.school_staff_role_assignments;
create policy school_staff_roles_admin_manage on public.school_staff_role_assignments for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
  and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'))
with check (exists (select 1 from public.profiles p join public.profiles target
  on target.id = school_staff_role_assignments.profile_id and target.school_id = school_staff_role_assignments.school_id
  where p.id = (select auth.uid()) and p.is_active is true and p.school_id = school_staff_role_assignments.school_id
    and p.role = 'school_admin' and target.is_active is true and target.role = 'teacher'));

drop policy if exists "school admins view their portal invitations" on public.school_portal_invites;
create policy "school admins view their portal invitations" on public.school_portal_invites
for select to authenticated using (
  public.same_school(school_id) and exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true and p.role = 'school_admin')
);

-- Self-service HR rows remain available only to an active account in the row's school.
drop policy if exists contracts_read on public.employment_contracts;
create policy contracts_read on public.employment_contracts for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = employment_contracts.employee_id
      and e.school_id = employment_contracts.school_id and e.profile_id = (select auth.uid())
      and employment_contracts.school_id = private.current_school_id()
  )
);
drop policy if exists leave_read on public.hr_leave_requests;
create policy leave_read on public.hr_leave_requests for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id
      and e.school_id = hr_leave_requests.school_id and e.profile_id = (select auth.uid())
      and hr_leave_requests.school_id = private.current_school_id()
  )
);
drop policy if exists leave_create_self on public.hr_leave_requests;
create policy leave_create_self on public.hr_leave_requests for insert to authenticated with check (
  school_id = private.current_school_id() and exists (
    select 1 from public.hr_employees e where e.id = hr_leave_requests.employee_id
      and e.profile_id = (select auth.uid()) and e.school_id = hr_leave_requests.school_id
  )
);
drop policy if exists salary_read on public.salary_structures;
create policy salary_read on public.salary_structures for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e where e.id = salary_structures.employee_id
      and e.school_id = salary_structures.school_id and e.profile_id = (select auth.uid())
      and salary_structures.school_id = private.current_school_id()
  )
);
drop policy if exists payroll_items_read on public.payroll_items;
create policy payroll_items_read on public.payroll_items for select to authenticated using (
  private.has_hr_role(school_id, array['principal','hr_admin']) or exists (
    select 1 from public.hr_employees e join public.payroll_runs r
      on r.id = payroll_items.payroll_run_id and r.school_id = payroll_items.school_id
    where e.id = payroll_items.employee_id and e.school_id = payroll_items.school_id
      and e.profile_id = (select auth.uid()) and payroll_items.school_id = private.current_school_id()
      and r.status in ('approved','paying','paid','closed')
  )
);
drop policy if exists payments_read on public.payment_transactions;
create policy payments_read on public.payment_transactions for select to authenticated using (
  private.has_hr_role(school_id, array['principal','finance_officer']) or exists (
    select 1 from public.payroll_items i join public.hr_employees e
      on e.id = i.employee_id and e.school_id = i.school_id
    where i.id = payment_transactions.payroll_item_id and i.school_id = payment_transactions.school_id
      and e.profile_id = (select auth.uid()) and payment_transactions.school_id = private.current_school_id()
  )
);

-- A stale session cannot use the salary RPC after HR disables its profile.
create or replace function public.list_my_staff_payslips()
returns table (
  id uuid, pay_period date, currency_code text, basic_salary numeric, allowances jsonb,
  deductions jsonb, gross_pay numeric, total_deductions numeric, net_pay numeric,
  payout_status text, payout_provider text, payout_reference text
)
language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); actor_school uuid;
begin
  select p.school_id into actor_school from public.profiles p
  where p.id = actor_id and p.role::text = 'staff' and p.is_active is true;
  if actor_id is null or actor_school is null then
    raise exception 'An active school staff account is required.' using errcode = '42501';
  end if;
  return query
    select i.id, r.pay_period, r.currency_code, i.basic_salary, i.allowances, i.deductions,
      i.gross_pay, i.total_deductions, i.net_pay, payout.status, payout.provider, payout.transaction_reference
    from public.hr_employees e
    join public.payroll_items i on i.employee_id = e.id and i.school_id = e.school_id
    join public.payroll_runs r on r.id = i.payroll_run_id and r.school_id = i.school_id
    left join lateral (
      select t.status, t.provider, t.transaction_reference from public.payment_transactions t
      where t.payroll_item_id = i.id and t.school_id = i.school_id order by t.created_at desc limit 1
    ) payout on true
    where e.profile_id = actor_id and e.school_id = actor_school
      and r.status in ('approved','paying','paid','closed')
    order by r.pay_period desc;
end;
$$;
revoke all on function public.list_my_staff_payslips() from public, anon;
grant execute on function public.list_my_staff_payslips() to authenticated;

-- END supabase/057_active_account_role_enforcement.sql


-- ============================================================================
-- BEGIN supabase/058_inventory_read_role_scope.sql
-- ============================================================================

-- Keep school-wide asset details limited to people whose school role needs them.
-- Inventory includes serial numbers, assignees, purchase dates, and asset values.
drop policy if exists assets_read_school on public.assets;
create policy assets_read_school on public.assets for select to authenticated using (
  (private.current_role() = 'super_admin')
  or (
    school_id = private.current_school_id()
    and private.has_school_permission(school_id, 'school.inventory.view')
  )
);

-- Write access remains controlled by the existing inventory.manage policy;
-- an inventory.view assignment only grants read access.

-- END supabase/058_inventory_read_role_scope.sql


-- ============================================================================
-- BEGIN supabase/059_transport_role_scope.sql
-- ============================================================================

-- Live routes and trip history disclose driver location and vehicle details.
-- Grant access to school operators and the driver assigned to each route only.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'bus_routes'
  loop execute format('drop policy %I on public.bus_routes', p.policyname); end loop;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'bus_logs'
  loop execute format('drop policy %I on public.bus_logs', p.policyname); end loop;
end $$;

create policy bus_routes_read_authorized on public.bus_routes for select to authenticated using (
  private.current_role() = 'super_admin'
  or (school_id = private.current_school_id() and (
    private.current_role() = 'school_admin'
    or private.has_school_permission(school_id, 'school.transport.manage')
    or driver_id = (select auth.uid())
  ))
);

create policy bus_routes_manage_authorized on public.bus_routes for all to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.transport.manage')
)
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.transport.manage')
);

create policy bus_routes_driver_update on public.bus_routes for update to authenticated
using (school_id = private.current_school_id() and driver_id = (select auth.uid()))
with check (school_id = private.current_school_id() and driver_id = (select auth.uid()));

create or replace function private.protect_assigned_driver_route_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.driver_id = (select auth.uid())
    and private.current_role() is distinct from 'school_admin'
    and not private.has_school_permission(old.school_id, 'school.transport.manage')
    and (
      new.id is distinct from old.id
      or new.school_id is distinct from old.school_id
      or new.route_name is distinct from old.route_name
      or new.driver_id is distinct from old.driver_id
      or new.vehicle_number is distinct from old.vehicle_number
    ) then
    raise exception 'Drivers may update only the status and live location of their assigned route.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_assigned_driver_route_update() from public, anon, authenticated;
drop trigger if exists protect_assigned_driver_route_update on public.bus_routes;
create trigger protect_assigned_driver_route_update before update on public.bus_routes
for each row execute function private.protect_assigned_driver_route_update();

create policy bus_logs_read_authorized on public.bus_logs for select to authenticated using (
  exists (
    select 1 from public.bus_routes r where r.id = bus_logs.route_id and (
      private.current_role() = 'super_admin'
      or (r.school_id = private.current_school_id() and (
        r.driver_id = (select auth.uid())
        or r.school_id = private.current_school_id() and private.has_school_permission(r.school_id, 'school.transport.manage')
        or r.school_id = private.current_school_id() and private.current_role() = 'school_admin'
      ))
    )
  )
);

create policy bus_logs_driver_insert on public.bus_logs for insert to authenticated with check (
  exists (
    select 1 from public.bus_routes r where r.id = bus_logs.route_id
      and r.school_id = private.current_school_id() and r.driver_id = (select auth.uid())
  )
);

-- END supabase/059_transport_role_scope.sql


-- ============================================================================
-- BEGIN supabase/060_active_class_subject_authorization.sql
-- ============================================================================

-- Keep class and subject assignment authorization aligned with the active
-- profile checks used by the current role and school helpers.
create or replace function private.can_manage_class_subject(
  target_school uuid,
  target_class uuid,
  target_subject uuid
)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.role = 'school_admin' and p.school_id = target_school
  )
  or (
    private.current_role() = 'teacher'
    and private.current_school_id() = target_school
    and exists (
      select 1 from public.classes c
      join public.subjects s on s.school_id = c.school_id
      where c.id = target_class and c.school_id = target_school and s.id = target_subject
        and exists (
          select 1 from public.teacher_subject_assignments tsa
          where tsa.school_id = target_school and tsa.teacher_id = (select auth.uid())
            and tsa.class_id = c.id and tsa.subject_id = s.id
        )
    )
  )
  or (
    private.current_role() = 'teacher'
    and private.current_school_id() = target_school
    and target_subject is null
    and exists (
      select 1 from public.classes c
      where c.id = target_class and c.school_id = target_school and c.teacher_id = (select auth.uid())
    )
  )
  or (
    private.current_role() = 'teacher'
    and private.has_school_permission(target_school, 'school.assignments.manage')
    and exists (select 1 from public.classes c where c.id = target_class and c.school_id = target_school)
    and (target_subject is null or exists (
      select 1 from public.subjects s where s.id = target_subject and s.school_id = target_school
    ))
  )
$$;
revoke all on function private.can_manage_class_subject(uuid, uuid, uuid) from public, anon;
grant execute on function private.can_manage_class_subject(uuid, uuid, uuid) to authenticated;

create or replace function private.guard_teacher_subject_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = new.teacher_id and p.school_id = new.school_id
      and p.role = 'teacher' and p.is_active is true
  ) then
    raise exception 'Teaching assignments require an active teacher account in the same school.';
  end if;
  if not exists (select 1 from public.classes c where c.id = new.class_id and c.school_id = new.school_id) then
    raise exception 'Teaching class must belong to the same school.';
  end if;
  if not exists (select 1 from public.subjects s where s.id = new.subject_id and s.school_id = new.school_id) then
    raise exception 'Teaching subject must belong to the same school.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_teacher_subject_assignment() from public, anon, authenticated;

-- END supabase/060_active_class_subject_authorization.sql


-- ============================================================================
-- BEGIN supabase/061_assignment_upload_path_scope.sql
-- ============================================================================

-- Replacing an owned storage object must preserve the same valid
-- student/assignment/class relationship enforced during the original upload.
drop policy if exists assignment_files_student_update on storage.objects;
create policy assignment_files_student_update on storage.objects for update to authenticated
using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'submissions'
  and exists (
    select 1 from public.students s
    join public.assignments a on a.id = (storage.foldername(name))[2]::uuid
      and a.school_id = s.school_id and a.class_id = s.class_id
    where s.id = (storage.foldername(name))[3]::uuid
      and s.profile_id = (select auth.uid())
      and a.published_at is not null
      and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))
  )
)
with check (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'submissions'
  and exists (
    select 1 from public.students s
    join public.assignments a on a.id = (storage.foldername(name))[2]::uuid
      and a.school_id = s.school_id and a.class_id = s.class_id
    where s.id = (storage.foldername(name))[3]::uuid
      and s.profile_id = (select auth.uid())
      and a.published_at is not null
      and (a.due_date is null or a.due_date >= private.school_local_date(a.school_id))
  )
);

-- END supabase/061_assignment_upload_path_scope.sql


-- ============================================================================
-- BEGIN supabase/062_transport_location_integrity.sql
-- ============================================================================

-- Validate driver-controlled route fields so a driver cannot publish invalid
-- status/location values or forge the last-updated timestamp.
create or replace function private.protect_assigned_driver_route_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.driver_id = (select auth.uid())
    and private.current_role() is distinct from 'school_admin'
    and not private.has_school_permission(old.school_id, 'school.transport.manage') then
    if new.id is distinct from old.id
      or new.school_id is distinct from old.school_id
      or new.route_name is distinct from old.route_name
      or new.driver_id is distinct from old.driver_id
      or new.vehicle_number is distinct from old.vehicle_number then
      raise exception 'Drivers may update only the status and live location of their assigned route.'
        using errcode = '42501';
    end if;
    if new.status is null or new.status not in ('active', 'inactive') then
      raise exception 'Route status must be active or inactive.' using errcode = '22023';
    end if;
    if (new.last_lat is null) is distinct from (new.last_lng is null)
      or (new.last_lat is not null and (new.last_lat < -90 or new.last_lat > 90))
      or (new.last_lng is not null and (new.last_lng < -180 or new.last_lng > 180)) then
      raise exception 'Provide a valid latitude and longitude pair.' using errcode = '22023';
    end if;
    new.last_updated := now();
  end if;
  return new;
end;
$$;
revoke all on function private.protect_assigned_driver_route_update() from public, anon, authenticated;

-- END supabase/062_transport_location_integrity.sql


-- ============================================================================
-- BEGIN supabase/063_payroll_approval_rpc_integrity.sql
-- ============================================================================

-- Custom PostgreSQL settings are client-settable. Never treat the approval
-- GUC alone as proof that the principal approval RPC authorized this update.
create or replace function private.guard_payroll_run_transition()
returns trigger language plpgsql set search_path = '' as $$
declare approval_rpc_owner name;
begin
  if new.id is distinct from old.id
    or new.school_id is distinct from old.school_id
    or new.pay_period is distinct from old.pay_period
    or new.prepared_by is distinct from old.prepared_by then
    raise exception 'Payroll identity and preparer are immutable.' using errcode = '42501';
  end if;

  if old.status = 'submitted' then
    select pg_catalog.pg_get_userbyid(p.proowner)::name into approval_rpc_owner
    from pg_catalog.pg_proc p
    where p.oid = 'public.approve_school_payroll(uuid,text,text)'::pg_catalog.regprocedure;

    if approval_rpc_owner is not null
      and current_user = approval_rpc_owner
      and current_setting('app.hr_payroll_approval', true) = 'yes'
      and new.status in ('approved','rejected')
      and new.version = old.version + 1
      and new.submitted_at is not distinct from old.submitted_at
      and new.paid_at is not distinct from old.paid_at
      and ((new.status = 'approved' and new.approved_at is not null)
        or (new.status = 'rejected' and new.approved_at is null))
      and private.has_hr_role(old.school_id, array['principal'])
      and (select auth.jwt()->>'aal') = 'aal2'
      and old.prepared_by is distinct from (select auth.uid()) then
      return new;
    end if;
    raise exception 'Submitted payroll can only be approved or rejected by a different principal through the approval workflow.'
      using errcode = '42501';
  end if;

  if old.status in ('draft','rejected') then
    if new.status is distinct from old.status then
      if new.status = 'submitted'
        and new.version = old.version
        and new.approved_at is null
        and new.paid_at is not distinct from old.paid_at then
        new.submitted_at := now();
        return new;
      end if;
      raise exception 'Payroll status changes must follow the review workflow.' using errcode = '42501';
    end if;
    if new.version is distinct from old.version
      or new.submitted_at is distinct from old.submitted_at
      or new.approved_at is distinct from old.approved_at
      or new.paid_at is distinct from old.paid_at then
      raise exception 'Payroll workflow timestamps and version are managed by the review workflow.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Approved payroll runs are locked.' using errcode = '42501';
end;
$$;
revoke all on function private.guard_payroll_run_transition() from public, anon, authenticated;

create or replace function public.approve_school_payroll(target_run uuid, decision_value text, approval_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare run_row public.payroll_runs%rowtype; snapshot_hash text; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid payroll decision.'; end if;
  select * into run_row from public.payroll_runs where id = target_run for update;
  if not found then raise exception 'Payroll run not found.'; end if;
  if not private.has_hr_role(run_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  if run_row.prepared_by = (select auth.uid()) then raise exception 'The payroll preparer cannot approve their own payroll run.' using errcode = '42501'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before approving payroll.'; end if;
  if run_row.status <> 'submitted' then raise exception 'Only submitted payroll can be approved.'; end if;
  select md5(coalesce(string_agg(concat_ws('|', employee_id::text, basic_salary::text, allowances::text, deductions::text, gross_pay::text, total_deductions::text, net_pay::text), E'\n' order by employee_id), ''))
    into snapshot_hash from public.payroll_items where payroll_run_id = target_run;
  perform set_config('app.hr_payroll_approval','yes',true);
  update public.payroll_runs set status = decision_value,
    approved_at = case when decision_value = 'approved' then now() else null end,
    version = version + 1 where id = target_run;
  insert into public.payroll_approvals(school_id,payroll_run_id,payroll_version,approver_id,approval_hash,assurance_level,decision,notes)
  values(run_row.school_id,target_run,run_row.version,(select auth.uid()),snapshot_hash,aal,decision_value,approval_notes);
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(run_row.school_id,(select auth.uid()),decision_value,'payroll_run',target_run,jsonb_build_object('version',run_row.version,'approval_hash',snapshot_hash,'aal',aal));
end;
$$;
revoke all on function public.approve_school_payroll(uuid,text,text) from public, anon;
grant execute on function public.approve_school_payroll(uuid,text,text) to authenticated;

-- END supabase/063_payroll_approval_rpc_integrity.sql


-- ============================================================================
-- BEGIN supabase/064_payroll_self_approval_and_payout_controls.sql
-- ============================================================================

-- A privileged approver must not authorize their own compensation, and the
-- finance confirmer must be a different person from the payout initiator.
create or replace function public.approve_school_payroll(target_run uuid, decision_value text, approval_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare run_row public.payroll_runs%rowtype; snapshot_hash text; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid payroll decision.'; end if;
  select * into run_row from public.payroll_runs where id = target_run for update;
  if not found then raise exception 'Payroll run not found.'; end if;
  if not private.has_hr_role(run_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  if run_row.prepared_by = (select auth.uid()) then
    raise exception 'The payroll preparer cannot approve their own payroll run.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.payroll_items i
    join public.hr_employees e on e.id = i.employee_id and e.school_id = i.school_id
    where i.payroll_run_id = target_run and i.school_id = run_row.school_id
      and e.profile_id = (select auth.uid())
  ) then raise exception 'An employee cannot approve a payroll run that includes their own salary.' using errcode = '42501'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before approving payroll.'; end if;
  if run_row.status <> 'submitted' then raise exception 'Only submitted payroll can be approved.'; end if;
  select md5(coalesce(string_agg(concat_ws('|', employee_id::text, basic_salary::text, allowances::text, deductions::text, gross_pay::text, total_deductions::text, net_pay::text), E'\n' order by employee_id), ''))
    into snapshot_hash from public.payroll_items where payroll_run_id = target_run and school_id = run_row.school_id;
  perform set_config('app.hr_payroll_approval','yes',true);
  update public.payroll_runs set status = decision_value,
    approved_at = case when decision_value = 'approved' then now() else null end,
    version = version + 1 where id = target_run;
  insert into public.payroll_approvals(school_id,payroll_run_id,payroll_version,approver_id,approval_hash,assurance_level,decision,notes)
  values(run_row.school_id,target_run,run_row.version,(select auth.uid()),snapshot_hash,aal,decision_value,approval_notes);
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(run_row.school_id,(select auth.uid()),decision_value,'payroll_run',target_run,jsonb_build_object('version',run_row.version,'approval_hash',snapshot_hash,'aal',aal));
end;
$$;
revoke all on function public.approve_school_payroll(uuid,text,text) from public, anon;
grant execute on function public.approve_school_payroll(uuid,text,text) to authenticated;

create or replace function public.review_salary_change(target_salary uuid, decision_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare salary_row public.salary_structures%rowtype; aal text;
begin
  if decision_value not in ('approved','rejected') then raise exception 'Invalid salary decision.'; end if;
  select * into salary_row from public.salary_structures where id = target_salary for update;
  if not found then raise exception 'Salary change not found.'; end if;
  if not private.has_hr_role(salary_row.school_id, array['principal']) then raise exception 'Principal approval is required.'; end if;
  if salary_row.created_by = (select auth.uid()) or exists (
    select 1 from public.hr_employees e
    where e.id = salary_row.employee_id and e.school_id = salary_row.school_id
      and e.profile_id = (select auth.uid())
  ) then raise exception 'The salary change creator or beneficiary cannot approve it.' using errcode = '42501'; end if;
  aal := coalesce(auth.jwt()->>'aal','aal1');
  if aal <> 'aal2' then raise exception 'Complete multi-factor authentication before authorizing a salary change.'; end if;
  if salary_row.approval_status <> 'pending' then raise exception 'Only pending salary changes can be reviewed.'; end if;
  perform set_config('app.hr_salary_approval','yes',true);
  update public.salary_structures set approval_status = decision_value,
    approved_by = (select auth.uid()), approved_at = now() where id = target_salary;
  insert into public.hr_audit_events(school_id,actor_id,action,entity_type,entity_id,details)
  values(salary_row.school_id,(select auth.uid()),decision_value,'salary_structure',target_salary,jsonb_build_object('effective_from',salary_row.effective_from,'aal',aal));
end;
$$;
revoke all on function public.review_salary_change(uuid,text) from public, anon;
grant execute on function public.review_salary_change(uuid,text) to authenticated;

create or replace function public.confirm_salary_payment(target_payment uuid, decision_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare payment_row public.payment_transactions%rowtype; item_row public.payroll_items%rowtype; run_status text;
begin
  if decision_value not in ('paid','failed') then raise exception 'Choose paid or failed.'; end if;
  select * into payment_row from public.payment_transactions where id = target_payment for update;
  if not found then raise exception 'Payout record not found.'; end if;
  if not private.has_hr_role(payment_row.school_id, array['finance_officer']) then
    raise exception 'Only the finance officer can confirm salary payouts.';
  end if;
  if payment_row.initiated_by = (select auth.uid()) then
    raise exception 'The payout initiator cannot confirm their own payout.' using errcode = '42501';
  end if;
  if payment_row.status not in ('pending','processing') then raise exception 'Only an open payout record can be confirmed.'; end if;
  select * into item_row from public.payroll_items
  where id = payment_row.payroll_item_id and school_id = payment_row.school_id;
  if not found or payment_row.amount <> item_row.net_pay then raise exception 'Payout does not match the approved net salary.'; end if;
  if exists (
    select 1 from public.hr_employees e where e.id = item_row.employee_id
      and e.school_id = item_row.school_id and e.profile_id = (select auth.uid())
  ) then raise exception 'An employee cannot confirm payment of their own salary.' using errcode = '42501'; end if;
  select status into run_status from public.payroll_runs
  where id = item_row.payroll_run_id and school_id = item_row.school_id;
  if run_status not in ('approved','paying') then raise exception 'The payroll is not approved for payment.'; end if;
  if decision_value = 'paid' and payment_row.provider in ('bank','mobile_money','mpesa')
    and nullif(trim(coalesce(payment_row.transaction_reference, '')), '') is null then
    raise exception 'A bank or mobile-money reference is required before confirming payment.';
  end if;
  if decision_value = 'paid' and exists (
    select 1 from public.payment_transactions p
    where p.payroll_item_id = payment_row.payroll_item_id and p.status = 'paid' and p.id <> payment_row.id
  ) then raise exception 'This salary already has a completed payout.'; end if;
  update public.payment_transactions set status = decision_value,
    confirmed_by = case when decision_value = 'paid' then (select auth.uid()) else null end,
    confirmed_at = case when decision_value = 'paid' then now() else null end
  where id = target_payment;
end;
$$;
revoke all on function public.confirm_salary_payment(uuid,text) from public, anon;
grant execute on function public.confirm_salary_payment(uuid,text) to authenticated;

-- END supabase/064_payroll_self_approval_and_payout_controls.sql


-- ============================================================================
-- BEGIN supabase/065_expense_approval_and_payment_integrity.sql
-- ============================================================================

-- Separate expense entry/approval/payment roles and keep approval evidence
-- immutable after approval. Payment timestamps are set by the database.
drop policy if exists school_expenses_finance_update on public.school_expenses;
create policy school_expenses_finance_update on public.school_expenses for update to authenticated
using (private.has_school_permission(school_id, 'school.expenses.manage'))
with check (
  private.has_school_permission(school_id, 'school.expenses.manage')
  and ((approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null))
);

create or replace function private.guard_expense_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'recorded' then raise exception 'Approved, paid, or void expenses cannot be deleted.' using errcode = '42501'; end if;
    return old;
  end if;

  if new.id is distinct from old.id or new.school_id is distinct from old.school_id
    or new.created_by is distinct from old.created_by then
    raise exception 'Expense identity and creator are immutable.' using errcode = '42501';
  end if;

  if old.status in ('paid','void') then raise exception 'Paid and void expenses are immutable.' using errcode = '42501'; end if;

  if old.status = 'recorded' then
    if new.status = 'recorded' then
      if new.approved_by is not null or new.approved_at is not null or new.paid_at is not null then
        raise exception 'Unapproved expenses cannot carry approval or payment evidence.' using errcode = '42501';
      end if;
      return new;
    end if;
    if new.status = 'approved' then
      if old.created_by = (select auth.uid()) then
        raise exception 'The expense creator cannot approve their own expense.' using errcode = '42501';
      end if;
      if not private.has_hr_role(old.school_id, array['principal']) then
        raise exception 'Principal approval is required for expenses.' using errcode = '42501';
      end if;
      new.approved_by := (select auth.uid());
      new.approved_at := now();
      new.paid_at := null;
      return new;
    end if;
    if new.status = 'void' then
      if not private.has_hr_role(old.school_id, array['principal']) then
        raise exception 'Only a principal can void an expense.' using errcode = '42501';
      end if;
      if new.approved_by is not null or new.approved_at is not null or new.paid_at is not null then
        raise exception 'Unapproved expenses cannot carry approval or payment evidence.' using errcode = '42501';
      end if;
      return new;
    end if;
    raise exception 'Expense status transition is not allowed.' using errcode = '42501';
  end if;

  if old.status = 'approved' then
    if new.status not in ('paid','void')
      or new.title is distinct from old.title or new.category is distinct from old.category
      or new.vendor is distinct from old.vendor or new.amount is distinct from old.amount
      or new.currency_code is distinct from old.currency_code or new.incurred_on is distinct from old.incurred_on
      or new.receipt_reference is distinct from old.receipt_reference or new.notes is distinct from old.notes
      or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
      raise exception 'Approved expense details and approval evidence are locked; only payment completion or voiding is allowed.'
        using errcode = '42501';
    end if;
    if new.status = 'paid' then
      if not private.has_hr_role(old.school_id, array['finance_officer']) then
        raise exception 'Only Finance can mark an approved expense paid.' using errcode = '42501';
      end if;
      new.paid_at := now();
    else
      if not private.has_hr_role(old.school_id, array['principal']) then
        raise exception 'Only a principal can void an approved expense.' using errcode = '42501';
      end if;
      new.paid_at := old.paid_at;
    end if;
    return new;
  end if;

  raise exception 'Expense status transition is not allowed.' using errcode = '42501';
end;
$$;
revoke all on function private.guard_expense_transition() from public, anon, authenticated;

-- END supabase/065_expense_approval_and_payment_integrity.sql


-- ============================================================================
-- BEGIN supabase/066_transport_log_integrity.sql
-- ============================================================================

-- Keep driver trip history within valid event/coordinate bounds and set its
-- timestamp on the server so callers cannot backdate or future-date events.
create or replace function private.guard_bus_log_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare route_row public.bus_routes%rowtype;
begin
  select * into route_row from public.bus_routes where id = new.route_id;
  if not found
    or route_row.school_id is distinct from private.current_school_id()
    or route_row.driver_id is distinct from (select auth.uid()) then
    raise exception 'Trip logs can only be added by the route assigned driver.' using errcode = '42501';
  end if;

  if new.log_type not in ('TRIP_START', 'TRIP_END', 'LOCATION_UPDATE') then
    raise exception 'Unsupported trip log event.' using errcode = '22023';
  end if;
  if (new.lat is null) is distinct from (new.lng is null)
    or (new.lat is not null and (new.lat < -90 or new.lat > 90))
    or (new.lng is not null and (new.lng < -180 or new.lng > 180)) then
    raise exception 'Provide a valid latitude and longitude pair.' using errcode = '22023';
  end if;
  if new.log_type in ('TRIP_START', 'LOCATION_UPDATE') and new.lat is null then
    raise exception 'Trip start and location events require coordinates.' using errcode = '22023';
  end if;

  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.guard_bus_log_insert() from public, anon, authenticated;
drop trigger if exists guard_bus_log_insert on public.bus_logs;
create trigger guard_bus_log_insert before insert on public.bus_logs
for each row execute function private.guard_bus_log_insert();

-- END supabase/066_transport_log_integrity.sql


-- ============================================================================
-- BEGIN supabase/067_academic_role_separation.sql
-- ============================================================================

-- Timetable authoring belongs to school administrators, principals, and
-- heads of department. Deputy principals can still view the timetable.
alter table public.school_staff_role_assignments
  drop constraint if exists school_staff_role_assignments_role_key_check;
alter table public.school_staff_role_assignments
  add constraint school_staff_role_assignments_role_key_check
  check (role_key in (
    'principal','deputy_principal','head_of_department','hr_admin','finance_officer','registrar',
    'librarian','inventory_manager','nurse','counsellor','transport_manager','staff_member'
  ));

delete from public.school_role_permission_catalog
where role_key = 'deputy_principal' and permission_key = 'school.timetable.manage';
insert into public.school_role_permission_catalog(role_key, permission_key)
values ('head_of_department', 'school.timetable.manage')
on conflict do nothing;

-- Heads need the class list and schedule rows to build the full timetable.
-- Student/parent/teacher reads remain restricted to related classes.
drop policy if exists classes_read_related on public.classes;
create policy classes_read_related on public.classes for select to authenticated using (
  private.can_view_class(id)
  or (school_id = private.current_school_id()
    and private.has_school_permission(school_id, 'school.timetable.manage'))
);

drop policy if exists timetable_read_related on public.timetable;
create policy timetable_read_related on public.timetable for select to authenticated using (
  private.can_view_class(class_id)
  or (school_id = private.current_school_id()
    and private.has_school_permission(school_id, 'school.timetable.manage'))
);

-- Schedule changes are privileged actions and require an MFA-verified session.
create or replace function private.enforce_privileged_mfa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); actor_role public.user_role; actor_school uuid; privileged boolean := false;
begin
  if actor_id is null or (select auth.role()) = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select p.role, p.school_id into actor_role, actor_school from public.profiles p where p.id = actor_id;
  privileged := actor_role in ('super_admin','school_admin') or exists (
    select 1 from public.school_staff_role_assignments a
    where a.profile_id = actor_id and a.school_id = actor_school
      and a.role_key in ('principal','deputy_principal','head_of_department','hr_admin','finance_officer','registrar','inventory_manager','nurse','counsellor','transport_manager')
  );
  if privileged and coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Multi-factor authentication is required for privileged changes.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.enforce_privileged_mfa() from public, anon, authenticated;

-- END supabase/067_academic_role_separation.sql


-- ============================================================================
-- BEGIN supabase/068_staff_attendance_for_staff_accounts.sql
-- ============================================================================

-- Include non-teaching staff portal accounts in the managed attendance roster.
drop policy if exists staff_attendance_admin_manage on public.staff_attendance;
create policy staff_attendance_admin_manage on public.staff_attendance
for all to authenticated
using (
  school_id = private.current_school_id()
  and private.has_hr_role(school_id, array['principal','deputy_principal','hr_admin'])
)
with check (
  school_id = private.current_school_id()
  and private.has_hr_role(school_id, array['principal','deputy_principal','hr_admin'])
  and exists (
    select 1 from public.profiles p
    where p.id = staff_profile_id
      and p.school_id = staff_attendance.school_id
      and p.role in ('school_admin','teacher','staff')
      and p.is_active is true
  )
  and recorded_by = (select auth.uid())
);

-- END supabase/068_staff_attendance_for_staff_accounts.sql


-- ============================================================================
-- BEGIN supabase/069_staff_role_assignment_access.sql
-- ============================================================================

-- Non-teaching staff accounts need the same assigned-workspace permissions as
-- teachers. Keep role assignment limited to active staff in the same school.
create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
  )
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and p.role = 'school_admin'
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and a.role_key = any(allowed_roles)
  )
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

-- The assignment guard was originally limited to teacher profiles. Permit an
-- active non-teaching staff profile to receive a specialist workspace role.
create or replace function private.validate_school_staff_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.school_id = new.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
  ) then
    raise exception 'Specialist roles require an active teacher or staff account in the same school.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_school_staff_assignment() from public, anon, authenticated;

drop policy if exists school_staff_roles_admin_manage on public.school_staff_role_assignments;
create policy school_staff_roles_admin_manage on public.school_staff_role_assignments
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = school_staff_role_assignments.school_id and p.role = 'school_admin'
  )
)
with check (
  exists (
    select 1 from public.profiles actor
    join public.profiles target on target.id = school_staff_role_assignments.profile_id
      and target.school_id = school_staff_role_assignments.school_id
    where actor.id = (select auth.uid()) and actor.is_active is true
      and actor.school_id = school_staff_role_assignments.school_id and actor.role = 'school_admin'
      and target.is_active is true and target.role in ('teacher', 'staff')
  )
);

-- END supabase/069_staff_role_assignment_access.sql


-- ============================================================================
-- BEGIN supabase/070_admissions_submission_rate_limit.sql
-- ============================================================================

-- Bound public admission submissions even when callers invoke the RPC
-- directly instead of going through the school website UI.
create table if not exists private.school_application_attempts (
  requester_hash text not null,
  created_at timestamptz not null default now()
);
alter table private.school_application_attempts enable row level security;
revoke all on table private.school_application_attempts from public, anon, authenticated;
create index if not exists school_application_attempts_recent_idx
  on private.school_application_attempts (requester_hash, created_at desc);

create or replace function private.limit_school_application_submissions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  headers jsonb;
  requester_ip text;
  v_requester_hash text;
  recent_hour integer;
  recent_day integer;
begin
  -- Trusted service jobs are not public submissions.
  if coalesce((select auth.role()), '') = 'service_role' then return new; end if;

  begin
    headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    headers := '{}'::jsonb;
  end;
  requester_ip := coalesce(
    nullif(trim(headers->>'cf-connecting-ip'), ''),
    nullif(trim(headers->>'x-real-ip'), ''),
    nullif(trim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)), '')
  );
  v_requester_hash := md5(lower(coalesce(requester_ip, trim(new.parent_email))));

  perform pg_advisory_xact_lock(hashtextextended(v_requester_hash, 0));
  delete from private.school_application_attempts
  where created_at < now() - interval '24 hours';

  select count(*) into recent_hour from private.school_application_attempts a
  where a.requester_hash = v_requester_hash and a.created_at > now() - interval '1 hour';
  if recent_hour >= 10 then
    raise exception 'Too many applications from this connection. Please try again later.'
      using errcode = 'P0001';
  end if;

  select count(*) into recent_day from private.school_application_attempts a
  where a.requester_hash = v_requester_hash;
  if recent_day >= 25 then
    raise exception 'The daily application limit has been reached. Please try again tomorrow.'
      using errcode = 'P0001';
  end if;

  insert into private.school_application_attempts(requester_hash) values (v_requester_hash);
  return new;
end;
$$;
revoke all on function private.limit_school_application_submissions() from public, anon, authenticated;

drop trigger if exists limit_school_application_submissions on public.applications;
create trigger limit_school_application_submissions
before insert on public.applications
for each row execute function private.limit_school_application_submissions();

-- END supabase/070_admissions_submission_rate_limit.sql


-- ============================================================================
-- BEGIN supabase/071_staff_attendance_audit.sql
-- ============================================================================

-- Preserve actor and before/after evidence for staff attendance changes.
drop trigger if exists audit_school_staff_attendance on public.staff_attendance;
create trigger audit_school_staff_attendance
after insert or update or delete on public.staff_attendance
for each row execute function public.log_table_change();

-- Attendance managers may review attendance history for their school without
-- gaining access to other audit log categories.
drop policy if exists staff_attendance_audit_read on public.audit_logs;
create policy staff_attendance_audit_read on public.audit_logs
for select to authenticated using (
  table_name = 'staff_attendance'
  and school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.staff_attendance.manage')
);

-- END supabase/071_staff_attendance_audit.sql


-- ============================================================================
-- BEGIN supabase/072_isolated_hr_finance_portals.sql
-- ============================================================================

-- Allow assigned teachers and staff to open one specialist portal.
-- School administrators retain their separate school workspace.
create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (
    required_permission not in ('school.hr.portal.view', 'school.finance.portal.view')
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active is true
        and p.school_id = target_school and p.role = 'school_admin'
    )
  ) or exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
    join public.school_role_permission_catalog c on c.role_key = a.role_key
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and c.permission_key = required_permission
      and (
        required_permission not in ('school.hr.portal.view', 'school.finance.portal.view')
        or (p.role in ('teacher', 'staff') and required_permission = 'school.hr.portal.view' and a.role_key = 'hr_admin')
        or (p.role in ('teacher', 'staff') and required_permission = 'school.finance.portal.view' and a.role_key = 'finance_officer')
      )
      and (
        required_permission not in ('school.hr.portal.view', 'school.finance.portal.view')
        or not exists (
          select 1 from public.school_staff_role_assignments other
          where other.profile_id = a.profile_id and other.school_id = a.school_id
            and other.role_key = case required_permission
              when 'school.hr.portal.view' then 'finance_officer'
              else 'hr_admin'
            end
        )
      )
  )
$$;
revoke all on function private.has_school_permission(uuid, text) from public, anon;
grant execute on function private.has_school_permission(uuid, text) to authenticated;

create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id
      and p.is_active is true and p.role in ('teacher', 'staff')
    where a.profile_id = (select auth.uid()) and a.school_id = target_school
      and a.role_key = any(allowed_roles)
  )
$$;
revoke all on function private.has_hr_role(uuid, text[]) from public, anon;
grant execute on function private.has_hr_role(uuid, text[]) to authenticated;

-- END supabase/072_isolated_hr_finance_portals.sql


-- ============================================================================
-- BEGIN supabase/073_private_lesson_file_access.sql
-- ============================================================================

-- Keep lesson attachments private and scope file access to the lesson row.
drop policy if exists lesson_files_read_related on storage.objects;
create policy lesson_files_read_related on storage.objects
for select to authenticated
using (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'lessons'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and exists (
    select 1 from public.lesson_plans lp
    where lp.file_path = storage.objects.name
      and lp.school_id = private.current_school_id()
  )
);

drop policy if exists lesson_files_teacher_insert on storage.objects;
create policy lesson_files_teacher_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'lessons'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and split_part(name, '/', 5) = (select auth.uid())::text
  and split_part(name, '/', 6) <> ''
  and split_part(name, '/', 7) = ''
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.school_id = c.school_id
      and s.id::text = split_part(storage.objects.name, '/', 4)
    where c.school_id = private.current_school_id()
      and c.id::text = split_part(storage.objects.name, '/', 3)
      and private.can_manage_class_subject(c.school_id, c.id, s.id)
  )
);

drop policy if exists lesson_files_orphan_cleanup on storage.objects;
create policy lesson_files_orphan_cleanup on storage.objects
for delete to authenticated
using (
  bucket_id = 'resources'
  and split_part(name, '/', 1) = 'lessons'
  and split_part(name, '/', 2) = private.current_school_id()::text
  and (
    split_part(name, '/', 5) = (select auth.uid())::text
    or private.current_role() = 'school_admin'
  )
  and exists (
    select 1 from public.classes c
    join public.subjects s on s.school_id = c.school_id
      and s.id::text = split_part(storage.objects.name, '/', 4)
    where c.school_id = private.current_school_id()
      and c.id::text = split_part(storage.objects.name, '/', 3)
      and private.can_manage_class_subject(c.school_id, c.id, s.id)
  )
  and not exists (
    select 1 from public.lesson_plans lp where lp.file_path = storage.objects.name
  )
);

-- END supabase/073_private_lesson_file_access.sql


-- ============================================================================
-- BEGIN supabase/074_subscription_trial_lifecycle.sql
-- ============================================================================

-- Track each school's one-time free trial and prevent trial restarts.
alter table public.subscriptions
  add column if not exists trial_started_at timestamptz;

update public.subscriptions
set trial_started_at = coalesce(starts_at, now())
where status = 'trial' and trial_started_at is null;

create or replace function public.platform_set_subscription(
  p_school_id uuid,
  p_plan text,
  p_status text,
  p_ends_at timestamptz default null
)
returns public.subscriptions
language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.user_role;
  result public.subscriptions;
begin
  select role into actor_role
  from public.profiles
  where id = (select auth.uid()) and is_active is true;

  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_plan not in ('Starter', 'Professional', 'Enterprise') then
    raise exception 'Choose a valid plan.';
  end if;
  if p_status not in ('pending', 'trial', 'active', 'suspended', 'expired', 'cancelled') then
    raise exception 'Choose a valid subscription status.';
  end if;

  if p_status = 'trial' then
    update public.subscriptions
    set plan = p_plan,
        status = 'trial',
        starts_at = now(),
        ends_at = now() + interval '14 days',
        trial_started_at = now(),
        requested_plan = null,
        request_status = 'approved'
    where school_id = p_school_id and trial_started_at is null
    returning * into result;

    if result.id is null then
      raise exception 'This school has already used its free trial or has no subscription record.';
    end if;
  else
    update public.subscriptions
    set plan = p_plan,
        status = p_status,
        starts_at = case when p_status = 'active' then now() else starts_at end,
        ends_at = case when p_status = 'active' then now() + interval '30 days' else p_ends_at end,
        requested_plan = null,
        request_status = case when p_status = 'pending' then 'pending' else 'approved' end
    where school_id = p_school_id
    returning * into result;

    if result.id is null then raise exception 'Subscription not found.'; end if;
  end if;

  update public.schools
  set subscription_plan = p_plan,
      status = case when p_status in ('trial', 'active') then 'active'::public.school_status
        when p_status in ('suspended', 'expired', 'cancelled') then 'suspended'::public.school_status
        else 'pending'::public.school_status end
  where id = p_school_id;

  return result;
end;
$$;

revoke all on function public.platform_set_subscription(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.platform_set_subscription(uuid, text, text, timestamptz) to authenticated;

create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.user_role;
  result public.schools;
begin
  select role into actor_role
  from public.profiles
  where id = (select auth.uid()) and is_active is true;

  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.subscriptions s
    where s.school_id = p_school_id and s.status in ('trial', 'active')
      and s.ends_at > now()
  ) then
    raise exception 'Start a free trial or activate a subscription before approving this school.';
  end if;

  update public.schools set status = p_status where id = p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end;
$$;

revoke all on function public.platform_set_school_status(uuid, public.school_status) from public, anon;
grant execute on function public.platform_set_school_status(uuid, public.school_status) to authenticated;

-- END supabase/074_subscription_trial_lifecycle.sql


-- ============================================================================
-- BEGIN supabase/075_quiz_answer_release_access.sql
-- ============================================================================

-- Keep answer details behind the same release boundary as quiz scores.
-- The former related-student policy exposed earned points and correctness
-- flags through direct table queries before results_release_at.
drop policy if exists quiz_answers_read_related on public.quiz_answers;
drop policy if exists quiz_answers_read_released on public.quiz_answers;

create policy quiz_answers_read_released on public.quiz_answers
for select to authenticated
using (
  exists (
    select 1
    from public.quiz_results r
    join public.quizzes q on q.id = r.quiz_id
    where r.id = quiz_answers.result_id
      and private.can_view_student(r.student_id)
      and (
        private.current_role() in ('teacher', 'school_admin')
        or q.results_release_at is null
        or q.results_release_at <= now()
      )
  )
);

-- END supabase/075_quiz_answer_release_access.sql


-- ============================================================================
-- BEGIN supabase/076_active_audit_log_access.sql
-- ============================================================================

-- Replace legacy audit-log policies that still trusted a profile role after
-- its account had been disabled.
drop policy if exists "super admins view all logs" on public.audit_logs;
create policy "active super admins view all logs" on public.audit_logs
for select to authenticated
using (public.is_super_admin());

drop policy if exists "school admins view school logs" on public.audit_logs;
create policy "active school admins view school logs" on public.audit_logs
for select to authenticated
using (
  private.current_role() = 'school_admin'
  and school_id = private.current_school_id()
);

-- END supabase/076_active_audit_log_access.sql


-- ============================================================================
-- BEGIN supabase/077_quiz_integrity_event_privacy.sql
-- ============================================================================

-- Integrity events are proctoring signals for staff review. Students and
-- guardians can read their quiz results, but should not query monitoring logs.
drop policy if exists quiz_integrity_events_read_related on public.quiz_integrity_events;
drop policy if exists quiz_integrity_events_staff_read on public.quiz_integrity_events;

create policy quiz_integrity_events_staff_read
on public.quiz_integrity_events
for select to authenticated
using (
  exists (
    select 1
    from public.quiz_attempt_sessions a
    join public.quizzes q on q.id = a.quiz_id
    where a.id = quiz_integrity_events.session_id
      and q.school_id = private.current_school_id()
      and (
        private.current_role() = 'school_admin'
        or (private.current_role() = 'teacher' and q.created_by = (select auth.uid()))
      )
  )
);

-- END supabase/077_quiz_integrity_event_privacy.sql


-- ============================================================================
-- BEGIN supabase/078_written_assessment_papers.sql
-- ============================================================================

-- Add private downloadable question papers for written assessments.
alter table public.quizzes
  add column if not exists delivery_mode text not null default 'interactive',
  add column if not exists question_file_path text,
  add column if not exists question_file_name text,
  add column if not exists question_file_mime_type text;

alter table public.quizzes drop constraint if exists quizzes_delivery_mode_check;
alter table public.quizzes add constraint quizzes_delivery_mode_check
  check (delivery_mode in ('interactive', 'written_paper'));

alter table public.quizzes drop constraint if exists quizzes_question_file_metadata_check;
alter table public.quizzes add constraint quizzes_question_file_metadata_check
  check (
    (question_file_path is null and question_file_name is null and question_file_mime_type is null)
    or (question_file_path is not null and question_file_name is not null and question_file_mime_type is not null)
  );

alter table public.quizzes drop constraint if exists quizzes_paper_file_mode_check;
alter table public.quizzes add constraint quizzes_paper_file_mode_check
  check (delivery_mode = 'written_paper' or question_file_path is null);

alter table public.quizzes drop constraint if exists quizzes_question_file_path_scope_check;
alter table public.quizzes add constraint quizzes_question_file_path_scope_check
  check (question_file_path is null or question_file_path like (school_id::text || '/' || id::text || '/%'));

alter table public.quizzes drop constraint if exists quizzes_published_paper_has_file_check;
alter table public.quizzes add constraint quizzes_published_paper_has_file_check
  check (not published or delivery_mode <> 'written_paper' or question_file_path is not null);

create or replace function public.prevent_questions_on_written_paper()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.quizzes q
    where q.id = new.quiz_id and q.delivery_mode = 'written_paper'
  ) then
    raise exception 'Written paper assessments use a downloadable file instead of interactive questions.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_questions_on_written_paper on public.quiz_questions;
create trigger prevent_questions_on_written_paper
before insert or update of quiz_id on public.quiz_questions
for each row execute function public.prevent_questions_on_written_paper();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'assessment-papers', 'assessment-papers', false, 52428800,
  array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
    'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/rtf', 'text/rtf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists assessment_paper_file_read on storage.objects;
create policy assessment_paper_file_read on storage.objects
for select to authenticated using (
  bucket_id = 'assessment-papers'
  and exists (
    select 1 from public.quizzes q
    where q.question_file_path = storage.objects.name
      and q.school_id = private.current_school_id()
      and q.delivery_mode = 'written_paper'
      and (
        private.current_role() = 'school_admin'
        or (private.current_role() = 'teacher' and (
          q.created_by = (select auth.uid())
          or exists (
            select 1 from public.teacher_subject_assignments tsa
            where tsa.school_id = q.school_id and tsa.teacher_id = (select auth.uid())
              and tsa.subject_id = q.subject_id and (q.class_id is null or tsa.class_id = q.class_id)
          )
        ))
        or (private.current_role() = 'student' and q.published
          and (q.class_id is null or private.can_view_class(q.class_id)))
      )
  )
);

drop policy if exists assessment_paper_file_upload on storage.objects;
create policy assessment_paper_file_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'assessment-papers'
  and (storage.foldername(name))[1] = private.current_school_id()::text
  and exists (
    select 1 from public.quizzes q
    where q.id::text = (storage.foldername(name))[2]
      and q.school_id = private.current_school_id()
      and q.delivery_mode = 'written_paper'
      and q.created_by = (select auth.uid())
      and (
        private.current_role() = 'school_admin'
        or (private.current_role() = 'teacher' and exists (
          select 1 from public.teacher_subject_assignments tsa
          where tsa.school_id = q.school_id and tsa.teacher_id = (select auth.uid())
            and tsa.subject_id = q.subject_id and (q.class_id is null or tsa.class_id = q.class_id)
        ))
      )
  )
);

drop policy if exists assessment_paper_file_delete on storage.objects;
create policy assessment_paper_file_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'assessment-papers'
  and exists (
    select 1 from public.quizzes q
    where q.id::text = (storage.foldername(name))[2]
      and q.school_id = private.current_school_id()
      and (private.current_role() = 'school_admin'
        or (private.current_role() = 'teacher' and q.created_by = (select auth.uid())))
  )
);

-- END supabase/078_written_assessment_papers.sql


-- ============================================================================
-- BEGIN supabase/079_school_public_portal_registration.sql
-- ============================================================================

-- Public school directory and school-approved portal account registration.
-- Apply after migrations 001-078. School admins must review each request before
-- a new account becomes active. No public signup can create a school admin.

create table if not exists public.school_portal_signup_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  email text not null,
  requested_role public.user_role not null check (requested_role in ('teacher','student','parent','staff')),
  requested_access text check (requested_access is null or requested_access in ('hr','finance')),
  admission_number text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint portal_signup_access_only_staff check (requested_access is null or requested_role = 'staff'),
  constraint portal_signup_student_number_required check (requested_role not in ('student','parent') or nullif(trim(admission_number),'') is not null)
);

create index if not exists school_portal_signup_school_pending
  on public.school_portal_signup_requests(school_id, created_at desc) where status = 'pending';
create unique index if not exists school_portal_signup_one_pending_email
  on public.school_portal_signup_requests(school_id, lower(email)) where status = 'pending';

alter table public.school_portal_signup_requests enable row level security;
revoke all on public.school_portal_signup_requests from public, anon, authenticated;
grant select on public.school_portal_signup_requests to authenticated;
create policy portal_signup_admin_read on public.school_portal_signup_requests
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.is_active is true and p.role = 'school_admin' and p.school_id = school_id)
    or user_id = (select auth.uid())
  );

-- Expose only active school names and slugs to the public school picker.
create or replace function public.get_public_school_directory()
returns table(id uuid, name text, slug text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug from public.schools s
  where s.status = 'active' order by lower(s.name), s.id
$$;
revoke all on function public.get_public_school_directory() from public;
grant execute on function public.get_public_school_directory() to anon, authenticated;

-- Registration metadata is only a request. The account stays inactive until
-- an active administrator of the selected school approves it.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_school uuid;
  claimed_school uuid;
  requested_role public.user_role := 'student';
  requested_access text;
  school_name text;
begin
  if new.raw_user_meta_data->>'school_portal_signup' = 'true' then
    begin
      requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Choose a valid school.';
    end;
    begin
      requested_role := coalesce(nullif(new.raw_user_meta_data->>'requested_portal_role','')::public.user_role, 'student');
    exception when invalid_text_representation then
      raise exception 'Choose a valid school portal.';
    end;
    requested_access := nullif(new.raw_user_meta_data->>'requested_portal_access','');
    if requested_school is null or requested_role not in ('teacher','student','parent','staff')
       or (requested_access is not null and (requested_role <> 'staff' or requested_access not in ('hr','finance'))) then
      raise exception 'Choose a valid school and portal.';
    end if;
    select s.name into school_name from public.schools s where s.id = requested_school and s.status = 'active';
    if school_name is null then raise exception 'This school is not accepting portal registrations.'; end if;
    insert into public.profiles(id,school_id,full_name,phone,role,is_active)
    values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role,false);
    insert into public.school_portal_signup_requests(user_id,school_id,full_name,email,requested_role,requested_access,admission_number)
    values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),lower(new.email),requested_role,requested_access,
      nullif(trim(new.raw_user_meta_data->>'admission_number'),''));
    return new;
  end if;

  -- Preserve the existing one-time school administrator claim. This is the
  -- only public path that can create a school_admin profile.
  if new.raw_user_meta_data->>'role' = 'school_admin' then
    begin
      requested_school := nullif(new.raw_user_meta_data->>'school_id','')::uuid;
    exception when invalid_text_representation then
      requested_school := null;
    end;
    if requested_school is not null then
      perform set_config('app.school_claim_id',requested_school::text,true);
      perform set_config('app.school_claim_user',new.id::text,true);
      update public.schools set admin_user_id = new.id where id = requested_school and status = 'pending'
        and admin_user_id is null and lower(admin_email) = lower(new.email) returning id into claimed_school;
      if claimed_school is not null then requested_role := 'school_admin'; else requested_school := null; end if;
    end if;
  else
    requested_school := null;
  end if;
  insert into public.profiles(id,school_id,full_name,phone,role)
  values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role);
  return new;
end $$;

-- Enforce one school_admin profile per tenant, in addition to the unique
-- schools.admin_user_id registration claim.
create unique index if not exists profiles_one_school_admin_per_school
  on public.profiles(school_id) where role = 'school_admin' and school_id is not null;

-- Let the approval RPC perform exactly one inactive-to-active transition for
-- a pending account in the caller's own school.
create or replace function public.protect_profile_role_and_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles p where p.id = (select auth.uid());
  if coalesce((select auth.role()),'') = 'service_role' or actor.role = 'super_admin' then return new; end if;
  if new.role is not distinct from old.role and new.school_id is not distinct from old.school_id
     and old.is_active is false and new.is_active is true
     and current_setting('app.approve_school_portal_user',true) = old.id::text
     and actor.role = 'school_admin' and actor.is_active is true and actor.school_id = old.school_id
     and exists (select 1 from public.school_portal_signup_requests r
       where r.user_id = old.id and r.school_id = old.school_id and r.status = 'pending') then
    return new;
  end if;
  if new.role is distinct from old.role or new.school_id is distinct from old.school_id
     or new.is_active is distinct from old.is_active then
    raise exception 'Only the platform administrator or school approval workflow can change account role, school, or active status.';
  end if;
  return new;
end $$;

create or replace function public.approve_school_portal_signup(p_user_id uuid,p_student_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; request_row public.school_portal_signup_requests; auth_email_confirmed timestamptz;
  linked_student public.students; expected_admission text; role_key text;
begin
  select * into actor from public.profiles p where p.id = (select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role <> 'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator is required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.schools s where s.id=actor.school_id and s.status='active') then
    raise exception 'Only an active school can approve portal registrations.' using errcode = '42501';
  end if;
  select * into request_row from public.school_portal_signup_requests r
    where r.user_id = p_user_id and r.school_id = actor.school_id and r.status = 'pending' for update;
  if request_row.user_id is null then raise exception 'Pending registration request not found.'; end if;
  select u.email_confirmed_at into auth_email_confirmed from auth.users u where u.id = p_user_id;
  if auth_email_confirmed is null then raise exception 'The applicant must verify their email before approval.'; end if;
  if request_row.requested_role in ('student','parent') then
    if p_student_id is null then raise exception 'Choose the learner record to link to this account.'; end if;
    select * into linked_student from public.students s where s.id = p_student_id and s.school_id = actor.school_id for update;
    if linked_student.id is null or lower(trim(coalesce(linked_student.admission_number,''))) <> lower(trim(request_row.admission_number)) then
      raise exception 'The selected learner does not match the admission number submitted by the applicant.';
    end if;
    if request_row.requested_role = 'student' then
      if linked_student.profile_id is not null and linked_student.profile_id <> p_user_id then raise exception 'This learner already has a portal account.'; end if;
      update public.students set profile_id = p_user_id where id = linked_student.id and school_id = actor.school_id;
    else
      insert into public.student_guardians(student_id,guardian_id,relationship)
      values (linked_student.id,p_user_id,'parent/guardian') on conflict (student_id,guardian_id) do nothing;
    end if;
  end if;
  perform set_config('app.approve_school_portal_user',p_user_id::text,true);
  update public.profiles set is_active = true where id = p_user_id and school_id = actor.school_id
    and role = request_row.requested_role and is_active is false;
  if not found then raise exception 'The pending portal profile could not be activated.'; end if;
  if request_row.requested_role = 'staff' and request_row.requested_access is not null then
    role_key := case request_row.requested_access when 'hr' then 'hr_admin' when 'finance' then 'finance_officer' end;
    insert into public.school_staff_role_assignments(school_id,profile_id,role_key,assigned_by)
    values (actor.school_id,p_user_id,role_key,actor.id) on conflict (school_id,profile_id,role_key) do nothing;
  end if;
  update public.school_portal_signup_requests set status='approved',reviewed_by=actor.id,reviewed_at=now()
    where user_id=p_user_id and school_id=actor.school_id and status='pending';
end $$;
revoke all on function public.approve_school_portal_signup(uuid,uuid) from public,anon;
grant execute on function public.approve_school_portal_signup(uuid,uuid) to authenticated;

create or replace function public.reject_school_portal_signup(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role <> 'school_admin' or actor.school_id is null then
    raise exception 'An active school administrator is required.' using errcode='42501';
  end if;
  if not exists (select 1 from public.schools s where s.id=actor.school_id and s.status='active') then
    raise exception 'Only an active school can review portal registrations.' using errcode='42501';
  end if;
  update public.school_portal_signup_requests set status='rejected',reviewed_by=actor.id,reviewed_at=now()
    where user_id=p_user_id and school_id=actor.school_id and status='pending';
  if not found then raise exception 'Pending registration request not found.'; end if;
end $$;
revoke all on function public.reject_school_portal_signup(uuid) from public,anon;
grant execute on function public.reject_school_portal_signup(uuid) to authenticated;


-- END supabase/079_school_public_portal_registration.sql


-- ============================================================================
-- BEGIN supabase/082_document_signatures_and_single_super_admin.sql
-- ============================================================================

create unique index if not exists profiles_single_super_admin
  on public.profiles(role) where role = 'super_admin';

create or replace function public.get_payment_document_signatures(p_payment_id uuid)
returns table(
  finance_officer_name text,
  finance_officer_signature_url text,
  principal_name text,
  principal_signature_url text
)
language plpgsql stable security definer set search_path = '' as $$
declare target_school uuid; target_student uuid;
begin
  select p.school_id, p.student_id into target_school, target_student
  from public.payments p where p.id = p_payment_id;
  if target_school is null then raise exception 'Payment not found.'; end if;
  if (select private.current_role()) is null then
    raise exception 'An active signed-in account is required.' using errcode = '42501';
  end if;
  if (select private.current_role()) is distinct from 'super_admin'
     and (target_student is null or not (select private.can_view_student(target_student))) then
    raise exception 'You cannot view this payment receipt.' using errcode = '42501';
  end if;

  return query
  select finance.full_name, finance.signature_url,
    coalesce(principal.full_name,
      case when lower(coalesce(s.school_level, '')) like '%primary%' then 'Head teacher' else 'Principal' end),
    coalesce(principal.signature_url, s.principal_signature_url)
  from public.schools s
  left join lateral (
    select p.full_name, p.signature_url
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.is_active is true
    where a.school_id = s.id and a.role_key = 'finance_officer'
    order by a.created_at desc limit 1
  ) finance on true
  left join lateral (
    select p.full_name, p.signature_url
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.is_active is true
    where a.school_id = s.id and a.role_key = 'principal'
    order by a.created_at desc limit 1
  ) principal on true
  where s.id = target_school;
end;
$$;

revoke all on function public.get_payment_document_signatures(uuid) from public, anon;
grant execute on function public.get_payment_document_signatures(uuid) to authenticated;

-- END supabase/082_document_signatures_and_single_super_admin.sql


-- ============================================================================
-- BEGIN supabase/083_profile_photos.sql
-- ============================================================================

alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_photos_owner_insert on storage.objects;
create policy profile_photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists profile_photos_owner_read on storage.objects;
create policy profile_photos_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists profile_photos_owner_delete on storage.objects;
create policy profile_photos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- END supabase/083_profile_photos.sql

-- BEGIN supabase/084_google_school_signup_pending.sql
-- Google sign-ups must join an explicit school request and remain inactive
-- until that school's administrator reviews them.

create or replace function public.protect_profile_role_and_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles p where p.id = (select auth.uid());
  if coalesce((select auth.role()),'') = 'service_role' or actor.role = 'super_admin' then return new; end if;

  if new.role is not distinct from old.role and new.school_id is not distinct from old.school_id
     and old.is_active is false and new.is_active is true
     and current_setting('app.approve_school_portal_user',true) = old.id::text
     and actor.role = 'school_admin' and actor.is_active is true and actor.school_id = old.school_id
     and exists (select 1 from public.school_portal_signup_requests r
       where r.user_id = old.id and r.school_id = old.school_id and r.status = 'pending') then
    return new;
  end if;

  if actor.id = old.id and old.role = 'student' and old.school_id is null and old.is_active is true
     and new.role in ('teacher','student','parent','staff') and new.school_id is not null and new.is_active is false
     and current_setting('app.submit_school_portal_signup',true) = old.id::text
     and exists (select 1 from public.schools s where s.id = new.school_id and s.status = 'active') then
    return new;
  end if;

  if new.role is distinct from old.role or new.school_id is distinct from old.school_id
     or new.is_active is distinct from old.is_active then
    raise exception 'Only the platform administrator or school approval workflow can change account role, school, or active status.';
  end if;
  return new;
end $$;

create or replace function private.prevent_self_role_or_school_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.id = (select auth.uid())
    and coalesce((select auth.role()), '') <> 'service_role'
    and current_setting('app.submit_school_portal_signup',true) is distinct from old.id::text
    and (new.role is distinct from old.role or new.school_id is distinct from old.school_id
      or new.is_active is distinct from old.is_active) then
    raise exception 'Portal role, account status, and school membership can only be changed by an authorized administrator.'
      using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.submit_google_school_portal_signup(
  p_school_slug text,
  p_full_name text,
  p_requested_role text,
  p_requested_access text default null,
  p_admission_number text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; account auth.users; target_school public.schools;
  resolved_name text; resolved_role public.user_role; resolved_access text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in with Google before submitting a school request.' using errcode = '42501'; end if;
  select * into account from auth.users u where u.id = (select auth.uid());
  if account.id is null or account.email_confirmed_at is null then
    raise exception 'Verify your Google account email before submitting a school request.';
  end if;
  select * into actor from public.profiles p where p.id = account.id for update;
  if actor.id is null or actor.school_id is not null or actor.role <> 'student' or actor.is_active is not true then
    raise exception 'This Google account is already linked to a school or is not eligible for a new school request.';
  end if;
  select * into target_school from public.schools s where s.slug = p_school_slug and s.status = 'active';
  if target_school.id is null then raise exception 'This school is not accepting portal registrations.'; end if;
  begin
    resolved_role := p_requested_role::public.user_role;
  exception when invalid_text_representation then
    raise exception 'Choose a valid school portal.';
  end;
  resolved_access := nullif(trim(coalesce(p_requested_access,'')), '');
  if resolved_role not in ('teacher','student','parent','staff')
     or (resolved_access is not null and (resolved_role <> 'staff' or resolved_access not in ('hr','finance'))) then
    raise exception 'Choose a valid school portal.';
  end if;
  if resolved_role in ('student','parent') and nullif(trim(coalesce(p_admission_number,'')), '') is null then
    raise exception 'Enter the learner admission number provided by the school.';
  end if;
  resolved_name := left(trim(coalesce(nullif(p_full_name,''), actor.full_name, account.raw_user_meta_data->>'full_name', account.raw_user_meta_data->>'name', '')),160);
  if length(resolved_name) < 2 then raise exception 'Enter your full name before requesting a school account.'; end if;

  perform set_config('app.submit_school_portal_signup', account.id::text, true);
  update public.profiles set school_id = target_school.id, full_name = resolved_name,
    role = resolved_role, is_active = false
  where id = account.id and school_id is null and role = 'student' and is_active is true;
  if not found then raise exception 'This Google account is already linked to a school.'; end if;
  insert into public.school_portal_signup_requests(user_id,school_id,full_name,email,requested_role,requested_access,admission_number)
  values (account.id,target_school.id,resolved_name,lower(account.email),resolved_role,resolved_access,nullif(trim(coalesce(p_admission_number,'')),''));
end $$;

revoke all on function public.submit_google_school_portal_signup(text,text,text,text,text) from public, anon;
grant execute on function public.submit_google_school_portal_signup(text,text,text,text,text) to authenticated;
-- END supabase/084_google_school_signup_pending.sql

-- BEGIN supabase/085_monthly_school_billing.sql
-- Monthly recurring school subscriptions, payment audit, and fail-closed access.

alter table public.schools
  add column if not exists suspension_reason text;

alter table public.profiles
  add column if not exists billing_suspended_at timestamptz;

alter table public.subscriptions
  add column if not exists billing_email text,
  add column if not exists billing_currency text,
  add column if not exists monthly_amount numeric(12,2),
  add column if not exists flutterwave_plan_id bigint,
  add column if not exists payment_failed_at timestamptz;

create unique index if not exists subscriptions_one_billing_school_per_email
  on public.subscriptions(lower(billing_email)) where billing_email is not null;

create table if not exists public.subscription_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('Starter','Professional','Enterprise')),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  monthly_amount numeric(12,2) not null check (monthly_amount > 0),
  flutterwave_plan_id bigint not null check (flutterwave_plan_id > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (plan, currency_code)
);
alter table public.subscription_plan_prices enable row level security;
revoke all on public.subscription_plan_prices from public, anon, authenticated;
grant select on public.subscription_plan_prices to authenticated;
create policy subscription_plan_prices_platform_read on public.subscription_plan_prices
  for select to authenticated using (public.is_super_admin());
create policy subscription_plan_prices_school_admin_read on public.subscription_plan_prices
  for select to authenticated using (auth.role() = 'authenticated');

create table if not exists public.subscription_billing_attempts (
  tx_ref text primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  plan text not null check (plan in ('Starter','Professional','Enterprise')),
  billing_email text not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','successful','failed')),
  flutterwave_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscription_billing_attempts_school_date
  on public.subscription_billing_attempts(school_id, created_at desc);
alter table public.subscription_billing_attempts enable row level security;
revoke all on public.subscription_billing_attempts from public, anon, authenticated;
grant select on public.subscription_billing_attempts to authenticated;
create policy subscription_billing_attempts_admin_read on public.subscription_billing_attempts
  for select to authenticated using (
    public.is_super_admin() or exists (
      select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_active is true or p.billing_suspended_at is not null)
        and p.role = 'school_admin' and p.school_id = subscription_billing_attempts.school_id
    )
  );

create table if not exists public.subscription_billing_webhook_events (
  event_key text primary key,
  event_name text not null,
  received_at timestamptz not null default now()
);
alter table public.subscription_billing_webhook_events enable row level security;
revoke all on public.subscription_billing_webhook_events from public, anon, authenticated;

create or replace function public.platform_set_subscription_price(
  p_plan text, p_currency_code text, p_monthly_amount numeric, p_flutterwave_plan_id bigint
)
returns public.subscription_plan_prices language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.subscription_plan_prices;
begin
  select p.role into actor_role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true;
  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_plan not in ('Starter','Professional','Enterprise') or coalesce(p_currency_code,'') !~ '^[A-Z]{3}$'
     or p_monthly_amount is null or p_monthly_amount <= 0
     or p_flutterwave_plan_id is null or p_flutterwave_plan_id <= 0 then
    raise exception 'Enter a valid plan, currency, monthly price, and Flutterwave plan ID.';
  end if;
  insert into public.subscription_plan_prices(plan,currency_code,monthly_amount,flutterwave_plan_id,updated_by,updated_at)
  values (p_plan,p_currency_code,p_monthly_amount,p_flutterwave_plan_id,(select auth.uid()),now())
  on conflict (plan,currency_code) do update set monthly_amount=excluded.monthly_amount,
    flutterwave_plan_id=excluded.flutterwave_plan_id,updated_by=excluded.updated_by,updated_at=now()
  returning * into result;
  return result;
end $$;
revoke all on function public.platform_set_subscription_price(text,text,numeric,bigint) from public, anon;
grant execute on function public.platform_set_subscription_price(text,text,numeric,bigint) to authenticated;

create or replace function private.school_subscription_entitled(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.schools s join public.subscriptions sub on sub.school_id = s.id
    where s.id = target_school and s.status = 'active'
      and sub.status in ('trial','active') and sub.ends_at is not null and sub.ends_at > now()
  )
$$;
revoke all on function private.school_subscription_entitled(uuid) from public, anon, authenticated;
grant execute on function private.school_subscription_entitled(uuid) to authenticated;

-- Keep the login picker usable for billing-suspended schools while only
-- exposing an active school directory to anonymous registration requests.
create or replace function public.get_public_school_login_directory()
returns table(id uuid, name text, slug text, status public.school_status)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.slug, s.status from public.schools s
  where s.status = 'active' or (s.status = 'suspended' and s.suspension_reason = 'payment_failed')
  order by lower(s.name), s.id
$$;
revoke all on function public.get_public_school_login_directory() from public;
grant execute on function public.get_public_school_login_directory() to anon, authenticated;

create or replace function public.same_school(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and (p.role = 'super_admin' or (p.school_id = target_school and private.school_subscription_entitled(target_school)))
  )
$$;
revoke all on function public.same_school(uuid) from public, anon;
grant execute on function public.same_school(uuid) to authenticated;

create or replace function private.current_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
    and (p.role = 'super_admin' or private.school_subscription_entitled(p.school_id)) limit 1
$$;
create or replace function private.current_school_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.school_id from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
    and p.role <> 'super_admin' and private.school_subscription_entitled(p.school_id) limit 1
$$;
revoke all on function private.current_role() from public, anon;
revoke all on function private.current_school_id() from public, anon;
grant execute on function private.current_role() to authenticated;
grant execute on function private.current_school_id() to authenticated;

create or replace function private.can_view_class(target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor join public.classes c on c.id=target_class
    where actor.id=(select auth.uid()) and actor.is_active is true
      and private.school_subscription_entitled(actor.school_id) and (
        (c.school_id=actor.school_id and actor.role='school_admin')
        or (c.school_id=actor.school_id and actor.role='teacher' and (
          c.teacher_id=actor.id or exists (select 1 from public.teacher_subject_assignments tsa where tsa.class_id=c.id and tsa.teacher_id=actor.id)
        ))
        or exists (select 1 from public.students s where s.class_id=c.id and s.profile_id=actor.id and s.school_id=actor.school_id)
        or (actor.role='parent' and exists (
          select 1 from public.students s join public.student_guardians g on g.student_id=s.id
          where s.class_id=c.id and s.school_id=actor.school_id and g.guardian_id=actor.id
        ))
      )
  )
$$;
create or replace function private.can_view_student(target_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor join public.students s on s.id=target_student
    where actor.id=(select auth.uid()) and actor.is_active is true
      and private.school_subscription_entitled(actor.school_id) and (
        (s.school_id=actor.school_id and actor.role='school_admin')
        or (s.school_id=actor.school_id and s.profile_id=actor.id)
        or (s.school_id=actor.school_id and actor.role='teacher' and exists (
          select 1 from public.classes c where c.id=s.class_id and c.school_id=s.school_id and (
            c.teacher_id=actor.id or exists (select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id=actor.id and tsa.class_id=c.id and tsa.school_id=c.school_id)
          )
        ))
        or (s.school_id=actor.school_id and actor.role='parent' and exists (
          select 1 from public.student_guardians g where g.student_id=s.id and g.guardian_id=actor.id
        ))
      )
  )
$$;
create or replace function private.can_grade_student(target_student uuid, target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s join public.profiles actor on actor.id=(select auth.uid()) and actor.is_active is true
    where s.id=target_student and s.school_id=actor.school_id and private.school_subscription_entitled(actor.school_id) and (
      actor.role='school_admin' or (actor.role='teacher' and exists (
        select 1 from public.teacher_subject_assignments tsa where tsa.teacher_id=actor.id
          and tsa.school_id=actor.school_id and tsa.class_id=s.class_id and tsa.subject_id=target_subject
      ))
    )
  )
$$;
create or replace function private.has_school_permission(target_school uuid, required_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.school_subscription_entitled(target_school) and (
    exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true
      and p.school_id=target_school and p.role='school_admin')
    or exists (select 1 from public.school_staff_role_assignments a
      join public.profiles p on p.id=a.profile_id and p.school_id=a.school_id and p.is_active is true and p.role='teacher'
      join public.school_role_permission_catalog c on c.role_key=a.role_key
      where a.profile_id=(select auth.uid()) and a.school_id=target_school and c.permission_key=required_permission)
  )
$$;
create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select private.school_subscription_entitled(target_school) and (
    exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true
      and p.school_id=target_school and p.role='school_admin')
    or exists (select 1 from public.school_staff_role_assignments a
      join public.profiles p on p.id=a.profile_id and p.school_id=a.school_id and p.is_active is true and p.role='teacher'
      where a.profile_id=(select auth.uid()) and a.school_id=target_school and a.role_key=any(allowed_roles))
  )
$$;

-- Keep a school's own administrator able to see its school and billing rows so
-- they can correct a failed payment; regular workspace access remains gated.
create policy schools_admin_billing_read on public.schools for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_active is true or p.billing_suspended_at is not null)
    and p.role = 'school_admin' and p.school_id = schools.id)
);
create policy subscriptions_admin_billing_read on public.subscriptions for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and (p.is_active is true or p.billing_suspended_at is not null)
    and p.role = 'school_admin' and p.school_id = subscriptions.school_id)
);

create or replace function public.process_flutterwave_school_billing_event(
  p_event_key text, p_event_name text, p_tx_ref text, p_transaction_id text,
  p_status text, p_currency_code text, p_amount numeric, p_customer_email text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempt public.subscription_billing_attempts; sub public.subscriptions; target_school uuid;
  expected_amount numeric; expected_currency text; email_value text;
begin
  if nullif(trim(p_event_key),'') is null or nullif(trim(p_event_name),'') is null then
    raise exception 'Webhook event identity is required.';
  end if;
  insert into public.subscription_billing_webhook_events(event_key,event_name)
    values (p_event_key,p_event_name) on conflict do nothing;
  if not found then return false; end if;

  email_value := lower(trim(coalesce(p_customer_email,'')));
  if nullif(trim(coalesce(p_tx_ref,'')),'') is not null then
    select * into attempt from public.subscription_billing_attempts a where a.tx_ref=p_tx_ref for update;
  end if;
  if attempt.tx_ref is not null then
    target_school := attempt.school_id;
    expected_amount := attempt.amount;
    expected_currency := attempt.currency_code;
  else
    select * into sub from public.subscriptions s where lower(coalesce(s.billing_email,''))=email_value for update;
    if sub.id is null then return true; end if;
    target_school := sub.school_id;
    expected_amount := sub.monthly_amount;
    expected_currency := sub.billing_currency;
  end if;

  if p_status = 'successful' then
    if p_amount is null or expected_amount is null or abs(p_amount - expected_amount) > 0.01
       or upper(coalesce(p_currency_code,'')) <> upper(coalesce(expected_currency,'')) then
      raise exception 'Verified payment does not match the expected subscription amount and currency.';
    end if;
    if attempt.tx_ref is not null then
      update public.subscription_billing_attempts set status='successful',
        flutterwave_transaction_id=p_transaction_id,updated_at=now() where tx_ref=attempt.tx_ref;
      update public.subscriptions set plan=attempt.plan, status='active', starts_at=now(),
        ends_at=now()+interval '1 month', billing_email=attempt.billing_email,
        billing_currency=attempt.currency_code, monthly_amount=attempt.amount,
        payment_failed_at=null, request_status='approved', requested_plan=null
      where school_id=target_school;
    else
      update public.subscriptions set status='active', starts_at=now(), ends_at=now()+interval '1 month',
        payment_failed_at=null, request_status='approved' where school_id=target_school;
    end if;
    update public.schools set status='active', suspension_reason=null
      where id=target_school and status='suspended' and suspension_reason='payment_failed';
    update public.profiles set is_active=true, billing_suspended_at=null
      where school_id=target_school and billing_suspended_at is not null;
  elsif p_status in ('failed','cancelled') then
    if attempt.tx_ref is not null then
      update public.subscription_billing_attempts set status='failed',
        flutterwave_transaction_id=p_transaction_id,updated_at=now() where tx_ref=attempt.tx_ref;
    end if;
    update public.subscriptions set status='suspended', request_status='payment_failed', payment_failed_at=now()
      where school_id=target_school;
    update public.schools set status='suspended', suspension_reason='payment_failed'
      where id=target_school and status='active';
    update public.profiles set is_active=false, billing_suspended_at=now()
      where school_id=target_school and is_active is true;
  end if;
  return true;
end $$;
revoke all on function public.process_flutterwave_school_billing_event(text,text,text,text,text,text,numeric,text) from public, anon, authenticated;
grant execute on function public.process_flutterwave_school_billing_event(text,text,text,text,text,text,numeric,text) to service_role;

-- Preserve the reason for billing-based suspensions, so manual platform
-- suspensions are not lifted automatically by a later successful payment.
create or replace function public.platform_set_school_status(p_school_id uuid, p_status public.school_status)
returns public.schools language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.schools;
begin
  select p.role into actor_role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true;
  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.subscriptions s where s.school_id = p_school_id
      and s.status in ('trial','active') and s.ends_at > now()
  ) then raise exception 'Start a free trial or activate a subscription before approving this school.'; end if;
  update public.schools set status=p_status,
    suspension_reason=case when p_status='suspended' then 'platform_admin' else null end
  where id=p_school_id returning * into result;
  if result.id is null then raise exception 'School not found.'; end if;
  return result;
end $$;
revoke all on function public.platform_set_school_status(uuid,public.school_status) from public, anon;
grant execute on function public.platform_set_school_status(uuid,public.school_status) to authenticated;

-- Paid access is activated only by a verified payment webhook; the platform
-- admin can still start one free trial or suspend a workspace manually.
create or replace function public.platform_set_subscription(
  p_school_id uuid, p_plan text, p_status text, p_ends_at timestamptz default null
)
returns public.subscriptions language plpgsql security definer set search_path = '' as $$
declare actor_role public.user_role; result public.subscriptions;
begin
  select p.role into actor_role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active is true;
  if actor_role is distinct from 'super_admin' then
    raise exception 'An active platform administrator account is required.' using errcode = '42501';
  end if;
  if p_plan not in ('Starter','Professional','Enterprise') then raise exception 'Choose a valid plan.'; end if;
  if p_status = 'active' then raise exception 'Paid subscriptions activate only after the payment provider confirms the first charge.'; end if;
  if p_status not in ('pending','trial','suspended','expired','cancelled') then raise exception 'Choose a valid subscription status.'; end if;
  if p_status = 'trial' then
    update public.subscriptions set plan=p_plan,status='trial',starts_at=now(),ends_at=now()+interval '14 days',
      trial_started_at=now(),requested_plan=null,request_status='approved',payment_failed_at=null
    where school_id=p_school_id and trial_started_at is null returning * into result;
    if result.id is null then raise exception 'This school has already used its free trial or has no subscription record.'; end if;
  else
    update public.subscriptions set plan=p_plan,status=p_status,
      ends_at=case when p_status='pending' then p_ends_at else ends_at end,
      requested_plan=null,request_status=case when p_status='pending' then 'pending' else 'approved' end
    where school_id=p_school_id returning * into result;
    if result.id is null then raise exception 'Subscription not found.'; end if;
  end if;
  update public.schools set subscription_plan=p_plan,
    status=case when p_status='trial' then 'active'::public.school_status
      when p_status in ('suspended','expired','cancelled') then 'suspended'::public.school_status
      else 'pending'::public.school_status end,
    suspension_reason=case when p_status in ('suspended','expired','cancelled') then 'platform_admin' else null end
  where id=p_school_id;
  return result;
end $$;
revoke all on function public.platform_set_subscription(uuid,text,text,timestamptz) from public, anon;
grant execute on function public.platform_set_subscription(uuid,text,text,timestamptz) to authenticated;
-- END supabase/085_monthly_school_billing.sql

-- BEGIN supabase/086_school_activities_and_payments.sql
-- School activities, per-learner registrations, and verified payments.

create table if not exists public.school_activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 140),
  description text not null default '' check (length(description) <= 4000),
  activity_type text not null default 'other' check (activity_type in ('sports','trip','excursion','club','other')),
  starts_at timestamptz not null,
  location text not null default '' check (length(location) <= 240),
  class_id uuid references public.classes(id) on delete cascade,
  registration_deadline timestamptz,
  is_free boolean not null default true,
  amount numeric(12,2),
  currency_code text not null default 'KES' check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'published' check (status in ('published','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_free and (amount is null or amount = 0)) or (not is_free and amount is not null and amount > 0)),
  check (registration_deadline is null or registration_deadline <= starts_at)
);
create index if not exists school_activities_school_start
  on public.school_activities(school_id, starts_at);
create index if not exists school_activities_class_start
  on public.school_activities(class_id, starts_at);

create or replace function private.prepare_school_activity_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.school_id is distinct from old.school_id or new.created_by is distinct from old.created_by) then
    raise exception 'An activity cannot be reassigned to another school or creator.' using errcode = '42501';
  end if;
  if new.class_id is not null and not exists (
    select 1 from public.classes c where c.id = new.class_id and c.school_id = new.school_id
  ) then
    raise exception 'Choose a class from this school.';
  end if;
  select upper(coalesce(s.currency_code, 'KES')) into new.currency_code
    from public.schools s where s.id = new.school_id;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.prepare_school_activity_write() from public, anon, authenticated;
drop trigger if exists prepare_school_activity_write on public.school_activities;
create trigger prepare_school_activity_write before insert or update on public.school_activities
  for each row execute function private.prepare_school_activity_write();

create table if not exists public.school_activity_registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null,
  registered_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'registered' check (status in ('registered','pending_payment','paid','cancelled')),
  registered_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (activity_id, student_id)
);
create index if not exists school_activity_registrations_school_activity
  on public.school_activity_registrations(school_id, activity_id, status);
create index if not exists school_activity_registrations_student
  on public.school_activity_registrations(student_id, registered_at desc);

create table if not exists public.school_activity_payment_attempts (
  tx_ref text primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  activity_id uuid not null references public.school_activities(id) on delete cascade,
  registration_id uuid not null references public.school_activity_registrations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  student_reference text,
  parent_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','successful','failed')),
  flutterwave_transaction_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists school_activity_payment_attempts_school_date
  on public.school_activity_payment_attempts(school_id, created_at desc);
create index if not exists school_activity_payment_attempts_registration
  on public.school_activity_payment_attempts(registration_id, created_at desc);

create table if not exists public.school_activity_webhook_events (
  event_key text primary key,
  received_at timestamptz not null default now()
);

alter table public.school_activities enable row level security;
alter table public.school_activity_registrations enable row level security;
alter table public.school_activity_payment_attempts enable row level security;
alter table public.school_activity_webhook_events enable row level security;
revoke all on public.school_activities, public.school_activity_registrations,
  public.school_activity_payment_attempts, public.school_activity_webhook_events
  from public, anon, authenticated;
grant select, insert, update on public.school_activities to authenticated;
grant select on public.school_activity_registrations, public.school_activity_payment_attempts to authenticated;

create or replace function private.can_manage_school_activities(target_school uuid, target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school
      and private.school_subscription_entitled(target_school)
      and (
        p.role = 'school_admin'
        or private.has_hr_role(target_school, array['principal'])
        or (p.role = 'teacher' and target_class is not null and exists (
          select 1 from public.classes c where c.id = target_class and c.school_id = target_school
            and (c.teacher_id = p.id or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id = p.id and tsa.school_id = target_school and tsa.class_id = c.id
            ))
        ))
      )
  )
$$;
revoke all on function private.can_manage_school_activities(uuid,uuid) from public, anon;
grant execute on function private.can_manage_school_activities(uuid,uuid) to authenticated;

create or replace function private.can_oversee_school_activities(target_school uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active is true
      and p.school_id = target_school and private.school_subscription_entitled(target_school)
      and (p.role = 'school_admin' or private.has_hr_role(target_school, array['principal']))
  )
$$;
revoke all on function private.can_oversee_school_activities(uuid) from public, anon;
grant execute on function private.can_oversee_school_activities(uuid) to authenticated;

create or replace function private.can_view_school_activity(target_school uuid, target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true and p.school_id = target_school
      and private.school_subscription_entitled(target_school)
      and (
        target_class is null
        or p.role = 'school_admin'
        or private.has_hr_role(target_school, array['principal','finance_officer'])
        or (p.role = 'teacher' and exists (
          select 1 from public.classes c where c.id = target_class and c.school_id = target_school
            and (c.teacher_id = p.id or exists (
              select 1 from public.teacher_subject_assignments tsa
              where tsa.teacher_id = p.id and tsa.school_id = target_school and tsa.class_id = c.id
            ))
        ))
        or (p.role = 'student' and exists (
          select 1 from public.students s where s.school_id = target_school
            and s.class_id = target_class and s.profile_id = p.id
        ))
        or (p.role = 'parent' and exists (
          select 1 from public.students s join public.student_guardians g on g.student_id = s.id
          where s.school_id = target_school and s.class_id = target_class and g.guardian_id = p.id
        ))
      )
  )
$$;
revoke all on function private.can_view_school_activity(uuid,uuid) from public, anon;
grant execute on function private.can_view_school_activity(uuid,uuid) to authenticated;

create or replace function private.can_view_school_activity_registration(
  target_school uuid, target_activity uuid, target_student uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_activities a join public.profiles p
      on p.id = (select auth.uid()) and p.is_active is true and p.school_id = a.school_id
    join public.students s on s.id = target_student and s.school_id = a.school_id
    where a.id = target_activity and a.school_id = target_school
      and private.school_subscription_entitled(target_school)
      and (
        p.role = 'school_admin'
        or private.has_hr_role(target_school, array['principal','finance_officer'])
        or (p.role = 'teacher' and a.created_by = p.id)
        or (p.role = 'student' and s.profile_id = p.id)
        or (p.role = 'parent' and exists (
          select 1 from public.student_guardians g where g.student_id = s.id and g.guardian_id = p.id
        ))
      )
  )
$$;
revoke all on function private.can_view_school_activity_registration(uuid,uuid,uuid) from public, anon;
grant execute on function private.can_view_school_activity_registration(uuid,uuid,uuid) to authenticated;

drop policy if exists school_activities_read on public.school_activities;
create policy school_activities_read on public.school_activities for select to authenticated using (
  status in ('published','cancelled') and private.can_view_school_activity(school_id, class_id)
);
drop policy if exists school_activities_create on public.school_activities;
create policy school_activities_create on public.school_activities for insert to authenticated with check (
  created_by = (select auth.uid()) and private.can_manage_school_activities(school_id, class_id)
);
drop policy if exists school_activities_update on public.school_activities;
create policy school_activities_update on public.school_activities for update to authenticated
  using (
    (created_by = (select auth.uid()) and private.can_manage_school_activities(school_id, class_id))
    or private.can_oversee_school_activities(school_id)
  )
  with check (
    (created_by = (select auth.uid()) and private.can_manage_school_activities(school_id, class_id))
    or private.can_oversee_school_activities(school_id)
  );

drop policy if exists school_activity_registrations_read on public.school_activity_registrations;
create policy school_activity_registrations_read on public.school_activity_registrations
  for select to authenticated using (
    private.can_view_school_activity_registration(school_id, activity_id, student_id)
  );

drop policy if exists school_activity_payment_attempts_read on public.school_activity_payment_attempts;
create policy school_activity_payment_attempts_read on public.school_activity_payment_attempts
  for select to authenticated using (
    private.can_view_school_activity_registration(school_id, activity_id, student_id)
  );

create or replace function public.register_for_free_school_activity(p_activity_id uuid, p_student_id uuid)
returns public.school_activity_registrations
language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; activity public.school_activities; learner public.students;
  result public.school_activity_registrations; guardian boolean;
begin
  select * into actor from public.profiles p where p.id = (select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role not in ('parent','student') then
    raise exception 'Sign in as the learner or their parent to register.' using errcode = '42501';
  end if;
  select * into activity from public.school_activities a
    where a.id = p_activity_id and a.school_id = actor.school_id for update;
  if activity.id is null or activity.status <> 'published' or activity.is_free is not true then
    raise exception 'This free activity is not available for registration.';
  end if;
  if activity.starts_at <= now() then raise exception 'Registration has closed because this activity has started.'; end if;
  if activity.registration_deadline is not null and activity.registration_deadline <= now() then
    raise exception 'The registration deadline for this activity has passed.';
  end if;
  if not private.school_subscription_entitled(activity.school_id) then
    raise exception 'This school workspace is not currently active.';
  end if;
  select * into learner from public.students s where s.id = p_student_id and s.school_id = activity.school_id;
  if learner.id is null or (activity.class_id is not null and learner.class_id is distinct from activity.class_id) then
    raise exception 'Choose a learner who is eligible for this activity.';
  end if;
  select exists (select 1 from public.student_guardians g
    where g.student_id = learner.id and g.guardian_id = actor.id) into guardian;
  if not ((actor.role = 'parent' and guardian) or (actor.role = 'student' and learner.profile_id = actor.id)) then
    raise exception 'You can only register yourself or a learner linked to your parent account.' using errcode = '42501';
  end if;
  insert into public.school_activity_registrations(
    school_id, activity_id, student_id, parent_id, registered_by, status
  ) values (
    activity.school_id, activity.id, learner.id,
    case when actor.role = 'parent' then actor.id else null end,
    actor.id, 'registered'
  ) on conflict (activity_id, student_id) do update set
    parent_id = excluded.parent_id, registered_by = excluded.registered_by,
    status = 'registered', registered_at = now(), paid_at = null
  where public.school_activity_registrations.status = 'cancelled'
  returning * into result;
  if result.id is null then raise exception 'This learner already has a registration for the activity.'; end if;
  return result;
end $$;
revoke all on function public.register_for_free_school_activity(uuid,uuid) from public, anon;
grant execute on function public.register_for_free_school_activity(uuid,uuid) to authenticated;

create or replace function public.process_flutterwave_school_activity_event(
  p_event_key text, p_tx_ref text, p_transaction_id text,
  p_status text, p_currency_code text, p_amount numeric
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare attempt public.school_activity_payment_attempts;
begin
  if nullif(trim(p_event_key),'') is null or nullif(trim(p_tx_ref),'') is null then
    raise exception 'Activity payment event identity is required.';
  end if;
  insert into public.school_activity_webhook_events(event_key) values (p_event_key)
    on conflict do nothing;
  if not found then return false; end if;
  select * into attempt from public.school_activity_payment_attempts a
    where a.tx_ref = p_tx_ref for update;
  if attempt.tx_ref is null then return true; end if;
  if p_status not in ('successful','failed') then return true; end if;
  if p_status = 'successful' and (
    p_amount is null or abs(p_amount - attempt.amount) > 0.01
    or upper(coalesce(p_currency_code,'')) <> attempt.currency_code
  ) then
    raise exception 'Verified payment does not match the activity amount and currency.';
  end if;
  if attempt.status = 'successful' then return true; end if;
  if p_status = 'successful' then
    update public.school_activity_payment_attempts set status = 'successful',
      flutterwave_transaction_id = p_transaction_id, updated_at = now()
      where tx_ref = attempt.tx_ref;
    update public.school_activity_registrations set status = 'paid', paid_at = now(),
      parent_id = attempt.parent_id
      where id = attempt.registration_id and status in ('pending_payment','paid');
  elsif attempt.status = 'pending' then
    update public.school_activity_payment_attempts set status = 'failed',
      flutterwave_transaction_id = p_transaction_id, updated_at = now()
      where tx_ref = attempt.tx_ref;
  end if;
  return true;
end $$;
revoke all on function public.process_flutterwave_school_activity_event(text,text,text,text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.process_flutterwave_school_activity_event(text,text,text,text,text,numeric)
  to service_role;

-- END supabase/086_school_activities_and_payments.sql




-- BEGIN supabase/087_student_classes_subject_activities.sql
-- Capture the requested learner class during signup and scope activities by class/subject.

alter table public.school_portal_signup_requests
  add column if not exists requested_class_id uuid references public.classes(id) on delete set null;

create or replace function public.get_public_school_classes(p_school_slug text)
returns table(id uuid, name text, grade text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.grade
  from public.classes c join public.schools s on s.id = c.school_id
  where s.slug = p_school_slug and s.status = 'active'
  order by lower(coalesce(c.grade,'')), lower(c.name), c.id
$$;
revoke all on function public.get_public_school_classes(text) from public;
grant execute on function public.get_public_school_classes(text) to anon, authenticated;

create or replace function public.get_public_school_profiles()
returns table(id uuid, name text, slug text, school_level text, address text)
language sql stable security definer set search_path = '' as $$
  select s.id,s.name,s.slug,s.school_level,s.address from public.schools s
  where s.status='active' order by lower(s.name),s.id
$$;
revoke all on function public.get_public_school_profiles() from public;
grant execute on function public.get_public_school_profiles() to anon,authenticated;

create or replace function public.get_public_school_profile(p_school_slug text)
returns table(id uuid, name text, slug text, school_level text, address text)
language sql stable security definer set search_path = '' as $$
  select s.id,s.name,s.slug,s.school_level,s.address from public.schools s
  where s.status='active' and s.slug=p_school_slug limit 1
$$;
revoke all on function public.get_public_school_profile(text) from public;
grant execute on function public.get_public_school_profile(text) to anon,authenticated;

-- Public signup metadata is a request only. Approval validates the selected
-- class against this school's real learner record before linking the account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested_school uuid; claimed_school uuid; requested_role public.user_role := 'student';
  requested_access text; requested_class uuid; school_name text;
begin
  if new.raw_user_meta_data->>'school_portal_signup' = 'true' then
    begin
      requested_school := nullif(new.raw_user_meta_data->>'school_id', '')::uuid;
      requested_class := nullif(new.raw_user_meta_data->>'requested_class_id', '')::uuid;
    exception when invalid_text_representation then raise exception 'Choose a valid school and class.';
    end;
    begin requested_role := coalesce(nullif(new.raw_user_meta_data->>'requested_portal_role','')::public.user_role, 'student');
    exception when invalid_text_representation then raise exception 'Choose a valid school portal.'; end;
    requested_access := nullif(new.raw_user_meta_data->>'requested_portal_access','');
    if requested_school is null or requested_role not in ('teacher','student','parent','staff')
       or (requested_access is not null and (requested_role <> 'staff' or requested_access not in ('hr','finance'))) then
      raise exception 'Choose a valid school and portal.';
    end if;
    if requested_role in ('student','parent') and (requested_class is null or not exists (
      select 1 from public.classes c where c.id=requested_class and c.school_id=requested_school
    )) then raise exception 'Choose a class or level offered by this school.'; end if;
    select s.name into school_name from public.schools s where s.id=requested_school and s.status='active';
    if school_name is null then raise exception 'This school is not accepting portal registrations.'; end if;
    insert into public.profiles(id,school_id,full_name,phone,role,is_active)
    values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role,false);
    insert into public.school_portal_signup_requests(user_id,school_id,full_name,email,requested_role,requested_access,admission_number,requested_class_id)
    values (new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),lower(new.email),requested_role,requested_access,
      nullif(trim(new.raw_user_meta_data->>'admission_number'),''),requested_class);
    return new;
  end if;
  if new.raw_user_meta_data->>'role' = 'school_admin' then
    begin requested_school := nullif(new.raw_user_meta_data->>'school_id','')::uuid;
    exception when invalid_text_representation then requested_school := null; end;
    if requested_school is not null then
      perform set_config('app.school_claim_id',requested_school::text,true);
      perform set_config('app.school_claim_user',new.id::text,true);
      update public.schools set admin_user_id=new.id where id=requested_school and status='pending'
        and admin_user_id is null and lower(admin_email)=lower(new.email) returning id into claimed_school;
      if claimed_school is not null then requested_role := 'school_admin'; else requested_school := null; end if;
    end if;
  else requested_school := null; end if;
  insert into public.profiles(id,school_id,full_name,phone,role)
  values(new.id,requested_school,left(new.raw_user_meta_data->>'full_name',160),left(new.raw_user_meta_data->>'phone',40),requested_role);
  return new;
end $$;

drop function if exists public.submit_google_school_portal_signup(text,text,text,text,text);
create function public.submit_google_school_portal_signup(
  p_school_slug text, p_full_name text, p_requested_role text,
  p_requested_access text default null, p_admission_number text default null,
  p_requested_class_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; account auth.users; target_school public.schools;
  resolved_name text; resolved_role public.user_role; resolved_access text;
begin
  if (select auth.uid()) is null then raise exception 'Sign in with Google before submitting a school request.' using errcode='42501'; end if;
  select * into account from auth.users u where u.id=(select auth.uid());
  if account.id is null or account.email_confirmed_at is null then raise exception 'Verify your Google account email before submitting a school request.'; end if;
  select * into actor from public.profiles p where p.id=account.id for update;
  if actor.id is null or actor.school_id is not null or actor.role <> 'student' or actor.is_active is not true then raise exception 'This Google account is already linked to a school or is not eligible for a new school request.'; end if;
  select * into target_school from public.schools s where s.slug=p_school_slug and s.status='active';
  if target_school.id is null then raise exception 'This school is not accepting portal registrations.'; end if;
  begin resolved_role := p_requested_role::public.user_role;
  exception when invalid_text_representation then raise exception 'Choose a valid school portal.'; end;
  resolved_access := nullif(trim(coalesce(p_requested_access,'')), '');
  if resolved_role not in ('teacher','student','parent','staff') or
    (resolved_access is not null and (resolved_role <> 'staff' or resolved_access not in ('hr','finance'))) then raise exception 'Choose a valid school portal.'; end if;
  if resolved_role in ('student','parent') and nullif(trim(coalesce(p_admission_number,'')),'') is null then raise exception 'Enter the learner admission number provided by the school.'; end if;
  if resolved_role in ('student','parent') and (p_requested_class_id is null or not exists(
    select 1 from public.classes c where c.id=p_requested_class_id and c.school_id=target_school.id
  )) then raise exception 'Choose a class or level offered by this school.'; end if;
  resolved_name := left(trim(coalesce(nullif(p_full_name,''),actor.full_name,account.raw_user_meta_data->>'full_name',account.raw_user_meta_data->>'name','')),160);
  if length(resolved_name)<2 then raise exception 'Enter your full name before requesting a school account.'; end if;
  perform set_config('app.submit_school_portal_signup',account.id::text,true);
  update public.profiles set school_id=target_school.id,full_name=resolved_name,role=resolved_role,is_active=false
    where id=account.id and school_id is null and role='student' and is_active is true;
  if not found then raise exception 'This Google account is already linked to a school.'; end if;
  insert into public.school_portal_signup_requests(user_id,school_id,full_name,email,requested_role,requested_access,admission_number,requested_class_id)
  values(account.id,target_school.id,resolved_name,lower(account.email),resolved_role,resolved_access,nullif(trim(coalesce(p_admission_number,'')),''),p_requested_class_id);
end $$;
revoke all on function public.submit_google_school_portal_signup(text,text,text,text,text,uuid) from public,anon;
grant execute on function public.submit_google_school_portal_signup(text,text,text,text,text,uuid) to authenticated;

create or replace function public.approve_school_portal_signup(p_user_id uuid,p_student_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; request_row public.school_portal_signup_requests; auth_email_confirmed timestamptz;
  linked_student public.students; role_key text;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role<>'school_admin' or actor.school_id is null then raise exception 'An active school administrator is required.' using errcode='42501'; end if;
  if not exists(select 1 from public.schools s where s.id=actor.school_id and s.status='active') then raise exception 'Only an active school can approve portal registrations.' using errcode='42501'; end if;
  select * into request_row from public.school_portal_signup_requests r where r.user_id=p_user_id and r.school_id=actor.school_id and r.status='pending' for update;
  if request_row.user_id is null then raise exception 'Pending registration request not found.'; end if;
  select u.email_confirmed_at into auth_email_confirmed from auth.users u where u.id=p_user_id;
  if auth_email_confirmed is null then raise exception 'The applicant must verify their email before approval.'; end if;
  if request_row.requested_role in ('student','parent') then
    if p_student_id is null then raise exception 'Choose the learner record to link to this account.'; end if;
    select * into linked_student from public.students s where s.id=p_student_id and s.school_id=actor.school_id for update;
    if linked_student.id is null or lower(trim(coalesce(linked_student.admission_number,''))) <> lower(trim(request_row.admission_number)) then raise exception 'The selected learner does not match the admission number submitted by the applicant.'; end if;
    if request_row.requested_class_id is null or not exists(select 1 from public.classes c where c.id=request_row.requested_class_id and c.school_id=actor.school_id) then raise exception 'The requested class is no longer available. Ask the applicant to submit a new request.'; end if;
    if linked_student.class_id is not null and linked_student.class_id is distinct from request_row.requested_class_id then raise exception 'The selected learner record belongs to a different class. Correct the learner class or ask the applicant to choose again.'; end if;
    if linked_student.class_id is null then
      update public.students set class_id=request_row.requested_class_id where id=linked_student.id and school_id=actor.school_id;
    end if;
    if request_row.requested_role='student' then
      if linked_student.profile_id is not null and linked_student.profile_id<>p_user_id then raise exception 'This learner already has a portal account.'; end if;
      update public.students set profile_id=p_user_id where id=linked_student.id and school_id=actor.school_id;
    else
      insert into public.student_guardians(student_id,guardian_id,relationship) values(linked_student.id,p_user_id,'parent/guardian') on conflict(student_id,guardian_id) do nothing;
    end if;
  end if;
  perform set_config('app.approve_school_portal_user',p_user_id::text,true);
  update public.profiles set is_active=true where id=p_user_id and school_id=actor.school_id and role=request_row.requested_role and is_active is false;
  if not found then raise exception 'The pending portal profile could not be activated.'; end if;
  if request_row.requested_role='staff' and request_row.requested_access is not null then
    role_key:=case request_row.requested_access when 'hr' then 'hr_admin' when 'finance' then 'finance_officer' end;
    insert into public.school_staff_role_assignments(school_id,profile_id,role_key,assigned_by) values(actor.school_id,p_user_id,role_key,actor.id) on conflict(school_id,profile_id,role_key) do nothing;
  end if;
  update public.school_portal_signup_requests set status='approved',reviewed_by=actor.id,reviewed_at=now() where user_id=p_user_id and school_id=actor.school_id and status='pending';
end $$;
revoke all on function public.approve_school_portal_signup(uuid,uuid) from public,anon;
grant execute on function public.approve_school_portal_signup(uuid,uuid) to authenticated;

alter table public.school_activities add column if not exists subject_id uuid references public.subjects(id) on delete set null;
create index if not exists school_activities_subject_start on public.school_activities(subject_id,starts_at);

create or replace function private.prepare_school_activity_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.school_id is distinct from old.school_id or new.created_by is distinct from old.created_by) then raise exception 'An activity cannot be reassigned to another school or creator.' using errcode='42501'; end if;
  if new.class_id is not null and not exists(select 1 from public.classes c where c.id=new.class_id and c.school_id=new.school_id) then raise exception 'Choose a class from this school.'; end if;
  if new.subject_id is not null and (new.class_id is null or not exists(select 1 from public.subjects s where s.id=new.subject_id and s.school_id=new.school_id)) then raise exception 'Choose a subject from this school and assign it to a class.'; end if;
  select upper(coalesce(s.currency_code,'KES')) into new.currency_code from public.schools s where s.id=new.school_id;
  new.updated_at:=now(); return new;
end $$;

create or replace function private.can_manage_school_activities(target_school uuid,target_class uuid,target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.school_id=target_school
    and private.school_subscription_entitled(target_school) and (
      p.role='school_admin' or private.has_hr_role(target_school,array['principal'])
      or (p.role='teacher' and target_class is not null and exists(select 1 from public.classes c where c.id=target_class and c.school_id=target_school
        and ((target_subject is null and (c.teacher_id=p.id or exists(select 1 from public.teacher_subject_assignments tsa where tsa.teacher_id=p.id and tsa.school_id=target_school and tsa.class_id=c.id)))
          or (target_subject is not null and exists(select 1 from public.teacher_subject_assignments tsa where tsa.teacher_id=p.id and tsa.school_id=target_school and tsa.class_id=c.id and tsa.subject_id=target_subject)))))
    ))
$$;
revoke all on function private.can_manage_school_activities(uuid,uuid,uuid) from public,anon;
grant execute on function private.can_manage_school_activities(uuid,uuid,uuid) to authenticated;

create or replace function private.can_view_school_activity(target_school uuid,target_class uuid,target_subject uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true and p.school_id=target_school
    and private.school_subscription_entitled(target_school) and (
      target_class is null and target_subject is null
      or p.role='school_admin'
      or private.has_hr_role(target_school,array['principal','finance_officer'])
      or (p.role='teacher' and exists(select 1 from public.classes c where c.id=target_class and c.school_id=target_school and
        (c.teacher_id=p.id or exists(select 1 from public.teacher_subject_assignments tsa where tsa.teacher_id=p.id and tsa.school_id=target_school and tsa.class_id=c.id and
          (target_subject is null or tsa.subject_id=target_subject)))))
      or (p.role='student' and exists(select 1 from public.students s where s.school_id=target_school and s.class_id=target_class and s.profile_id=p.id))
      or (p.role='parent' and exists(select 1 from public.students s join public.student_guardians g on g.student_id=s.id where s.school_id=target_school and s.class_id=target_class and g.guardian_id=p.id))
    ))
$$;
revoke all on function private.can_view_school_activity(uuid,uuid,uuid) from public,anon;
grant execute on function private.can_view_school_activity(uuid,uuid,uuid) to authenticated;

create or replace function private.can_manage_school_activities(target_school uuid,target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select private.can_manage_school_activities(target_school,target_class,null::uuid) $$;
revoke all on function private.can_manage_school_activities(uuid,uuid) from public,anon;
grant execute on function private.can_manage_school_activities(uuid,uuid) to authenticated;
drop policy if exists school_activities_read on public.school_activities;
create policy school_activities_read on public.school_activities for select to authenticated using(status in ('published','cancelled') and private.can_view_school_activity(school_id,class_id,subject_id));
drop policy if exists school_activities_create on public.school_activities;
create policy school_activities_create on public.school_activities for insert to authenticated with check(created_by=(select auth.uid()) and private.can_manage_school_activities(school_id,class_id,subject_id));
drop policy if exists school_activities_update on public.school_activities;
create policy school_activities_update on public.school_activities for update to authenticated
  using((created_by=(select auth.uid()) and private.can_manage_school_activities(school_id,class_id,subject_id)) or private.can_oversee_school_activities(school_id))
  with check((created_by=(select auth.uid()) and private.can_manage_school_activities(school_id,class_id,subject_id)) or private.can_oversee_school_activities(school_id));

create or replace function public.register_for_free_school_activity(p_activity_id uuid,p_student_id uuid)
returns public.school_activity_registrations language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; activity public.school_activities; learner public.students; result public.school_activity_registrations; guardian boolean;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.role not in ('parent','student') then raise exception 'Sign in as the learner or their parent to register.' using errcode='42501'; end if;
  select * into activity from public.school_activities a where a.id=p_activity_id and a.school_id=actor.school_id for update;
  if activity.id is null or activity.status<>'published' or activity.is_free is not true then raise exception 'This free activity is not available for registration.'; end if;
  if activity.starts_at<=now() or (activity.registration_deadline is not null and activity.registration_deadline<=now()) then raise exception 'Registration for this activity has closed.'; end if;
  if not private.school_subscription_entitled(activity.school_id) then raise exception 'This school workspace is not currently active.'; end if;
  select * into learner from public.students s where s.id=p_student_id and s.school_id=activity.school_id;
  if learner.id is null or (activity.class_id is not null and learner.class_id is distinct from activity.class_id) then raise exception 'Choose a learner who is eligible for this activity.'; end if;
  select exists(select 1 from public.student_guardians g where g.student_id=learner.id and g.guardian_id=actor.id) into guardian;
  if not ((actor.role='parent' and guardian) or (actor.role='student' and learner.profile_id=actor.id)) then raise exception 'You can only register yourself or a learner linked to your parent account.' using errcode='42501'; end if;
  insert into public.school_activity_registrations(school_id,activity_id,student_id,parent_id,registered_by,status)
  values(activity.school_id,activity.id,learner.id,case when actor.role='parent' then actor.id else null end,actor.id,'registered')
  on conflict(activity_id,student_id) do update set parent_id=excluded.parent_id,registered_by=excluded.registered_by,status='registered',registered_at=now(),paid_at=null
  where public.school_activity_registrations.status='cancelled' returning * into result;
  if result.id is null then raise exception 'This learner already has a registration for the activity.'; end if;
  return result;
end $$;
revoke all on function public.register_for_free_school_activity(uuid,uuid) from public,anon;
grant execute on function public.register_for_free_school_activity(uuid,uuid) to authenticated;

-- END supabase/087_student_classes_subject_activities.sql
