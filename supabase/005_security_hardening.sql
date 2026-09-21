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
