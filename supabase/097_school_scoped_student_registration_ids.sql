-- Give each school a stable human-readable code and issue learner IDs from a
-- per-school counter. The ID stays fixed when a learner changes class/stage.

create sequence if not exists private.school_registration_code_seq;

alter table public.schools add column if not exists school_code text;
update public.schools
set school_code = 'SCH-' || lpad(nextval('private.school_registration_code_seq')::text, 6, '0')
where school_code is null or btrim(school_code) = '';
alter table public.schools alter column school_code drop default;
alter table public.schools alter column school_code set not null;
create unique index if not exists schools_school_code_unique on public.schools(school_code);

create or replace function private.assign_school_code()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.school_code is distinct from old.school_code then
      raise exception 'A school code is permanent and cannot be changed.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.school_code is null or btrim(new.school_code) = '' then
    new.school_code := 'SCH-' || lpad(nextval('private.school_registration_code_seq')::text, 6, '0');
  end if;
  return new;
end $$;
revoke all on function private.assign_school_code() from public, anon, authenticated;
drop trigger if exists assign_school_code on public.schools;
create trigger assign_school_code
before insert or update of school_code on public.schools
for each row execute function private.assign_school_code();

create table if not exists private.school_student_registration_counters (
  school_id uuid primary key references public.schools(id) on delete cascade,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);
revoke all on private.school_student_registration_counters from public, anon, authenticated;

-- Stage old IDs into a private one-run map so pending parent requests can be
-- carried forward when the identifiers are upgraded.
create table if not exists private.student_registration_id_rollout_map (
  student_id uuid primary key,
  school_id uuid not null,
  old_registration_id text not null,
  new_registration_id text not null
);
revoke all on private.student_registration_id_rollout_map from public, anon, authenticated;
truncate table private.student_registration_id_rollout_map;

with legacy_students as (
  select s.id as student_id, s.school_id, s.student_registration_id as old_registration_id,
    coalesce(counter.last_number, 0) + row_number() over (
      partition by s.school_id order by s.created_at nulls first, s.id
    ) as next_number,
    school.school_code
  from public.students s
  join public.schools school on school.id = s.school_id
  left join private.school_student_registration_counters counter on counter.school_id = s.school_id
  where s.student_registration_id not like 'STU-' || school.school_code || '-%'
)
insert into private.student_registration_id_rollout_map(
  student_id, school_id, old_registration_id, new_registration_id
)
select student_id, school_id, old_registration_id,
  'STU-' || school_code || '-' || lpad(next_number::text, greatest(6, length(next_number::text)), '0')
from legacy_students;

update public.school_portal_signup_requests request
set student_registration_id = remap.new_registration_id
from private.student_registration_id_rollout_map remap
where request.school_id = remap.school_id
  and upper(btrim(request.student_registration_id)) = upper(btrim(remap.old_registration_id));

update public.students learner
set student_registration_id = remap.new_registration_id
from private.student_registration_id_rollout_map remap
where learner.id = remap.student_id;

insert into private.school_student_registration_counters(school_id, last_number, updated_at)
select school_id, max(split_part(new_registration_id, '-', 4)::bigint), now()
from private.student_registration_id_rollout_map
group by school_id
on conflict (school_id) do update
set last_number = greatest(private.school_student_registration_counters.last_number, excluded.last_number),
    updated_at = now();

-- Recover the high-water mark from issued IDs as well, so an interrupted SQL
-- editor run cannot cause the counter to start over on a later attempt.
insert into private.school_student_registration_counters(school_id, last_number, updated_at)
select learner.school_id,
  max(substring(learner.student_registration_id from ('^STU-' || school.school_code || '-([0-9]+)$'))::bigint), now()
from public.students learner
join public.schools school on school.id = learner.school_id
where learner.student_registration_id ~ ('^STU-' || school.school_code || '-[0-9]+$')
group by learner.school_id
on conflict (school_id) do update
set last_number = greatest(private.school_student_registration_counters.last_number, excluded.last_number),
    updated_at = now();

drop table private.student_registration_id_rollout_map;

create or replace function private.assign_student_registration_id()
returns trigger language plpgsql security definer set search_path = '' as $$
declare issued_number bigint; target_school_code text;
begin
  if tg_op = 'UPDATE' then
    if new.school_id is distinct from old.school_id then
      raise exception 'A learner record cannot be moved to another school.' using errcode = '42501';
    end if;
    if new.student_registration_id is distinct from old.student_registration_id then
      raise exception 'A student registration ID is permanent and cannot be changed.' using errcode = '42501';
    end if;
    return new;
  end if;

  insert into private.school_student_registration_counters(school_id, last_number, updated_at)
  values (new.school_id, 1, now())
  on conflict (school_id) do update
    set last_number = private.school_student_registration_counters.last_number + 1,
        updated_at = now()
  returning last_number into issued_number;

  select s.school_code into target_school_code from public.schools s where s.id = new.school_id;
  if target_school_code is null then raise exception 'Choose a valid school for this learner.'; end if;
  new.student_registration_id := 'STU-' || target_school_code || '-'
    || lpad(issued_number::text, greatest(6, length(issued_number::text)), '0');
  return new;
end $$;
revoke all on function private.assign_student_registration_id() from public, anon, authenticated;
drop trigger if exists assign_student_registration_id on public.students;
create trigger assign_student_registration_id
before insert or update of school_id, student_registration_id on public.students
for each row execute function private.assign_student_registration_id();

