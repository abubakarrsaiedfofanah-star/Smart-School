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
