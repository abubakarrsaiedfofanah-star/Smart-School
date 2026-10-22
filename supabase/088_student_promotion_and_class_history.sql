-- Keep a dated record of each student's class and promote automatically once
-- every published exam in the configured promotion term has a passing result.
alter table public.classes
  add column if not exists next_class_id uuid references public.classes(id) on delete set null,
  add column if not exists promotion_minimum_percentage numeric(5,2) not null default 50
    check (promotion_minimum_percentage between 0 and 100),
  add column if not exists promotion_term text not null default 'Term 3';

create table if not exists public.student_class_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete restrict,
  academic_year text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  change_reason text not null default 'initial' check (change_reason in ('initial','promotion','transfer')),
  promotion_percentage numeric(5,2),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);
create unique index if not exists student_class_enrollments_one_current
  on public.student_class_enrollments(student_id) where ended_at is null;
create index if not exists student_class_enrollments_history
  on public.student_class_enrollments(student_id, started_at desc);
insert into public.student_class_enrollments(school_id,student_id,class_id,started_at,change_reason)
select s.school_id,s.id,s.class_id,coalesce(s.created_at,now()),'initial'
from public.students s where s.class_id is not null
  and not exists(select 1 from public.student_class_enrollments e where e.student_id=s.id and e.ended_at is null)
on conflict do nothing;

create table if not exists public.student_promotions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  from_class_id uuid not null references public.classes(id) on delete restrict,
  to_class_id uuid not null references public.classes(id) on delete restrict,
  academic_year text not null,
  term text not null,
  percentage numeric(5,2) not null,
  minimum_percentage numeric(5,2) not null,
  promoted_at timestamptz not null default now(),
  unique(student_id,from_class_id,academic_year,term)
);

alter table public.student_class_enrollments enable row level security;
revoke all on public.student_class_enrollments from public,anon,authenticated;
grant select on public.student_class_enrollments to authenticated;
create policy student_class_enrollments_read on public.student_class_enrollments for select to authenticated using (
  private.can_view_student(student_id)
);

create or replace function private.track_student_class_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reason_value text := 'transfer'; promotion_pct numeric(5,2); year_value text := extract(year from current_date)::text;
begin
  if tg_op='UPDATE' and new.class_id is not distinct from old.class_id then return new; end if;
  if tg_op='UPDATE' then
    update public.student_class_enrollments set ended_at=now()
    where student_id=new.id and ended_at is null;
    if exists(select 1 from public.student_promotions p where p.student_id=new.id and p.from_class_id=old.class_id
      and p.to_class_id=new.class_id and p.promoted_at >= now()-interval '2 minutes') then
      reason_value := 'promotion';
      select p.percentage into promotion_pct from public.student_promotions p where p.student_id=new.id
        and p.from_class_id=old.class_id and p.to_class_id=new.class_id
        order by p.promoted_at desc limit 1;
      select p.academic_year into year_value from public.student_promotions p where p.student_id=new.id
        and p.from_class_id=old.class_id and p.to_class_id=new.class_id
        order by p.promoted_at desc limit 1;
    end if;
  end if;
  if new.class_id is not null then
    insert into public.student_class_enrollments(school_id,student_id,class_id,academic_year,change_reason,promotion_percentage)
      values(new.school_id,new.id,new.class_id,year_value,reason_value,promotion_pct);
  end if;
  return new;
end $$;

alter table public.student_promotions enable row level security;
revoke all on public.student_promotions from public,anon,authenticated;
grant select on public.student_promotions to authenticated;
create policy student_promotions_read on public.student_promotions for select to authenticated using (
  private.can_view_student(student_id)
);

drop trigger if exists track_student_class_change on public.students;
create trigger track_student_class_change after insert or update of class_id on public.students
  for each row execute function private.track_student_class_change();
revoke all on function private.track_student_class_change() from public,anon,authenticated;

create or replace function public.school_set_class_progression(
  p_class_id uuid,p_next_class_id uuid,p_minimum_percentage numeric,p_promotion_term text
)
returns public.classes language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; source_class public.classes; target_class public.classes;
begin
  select * into actor from public.profiles p where p.id=(select auth.uid()) and p.is_active is true;
  if actor.id is null or actor.school_id is null or not (
    actor.role='school_admin' or private.has_hr_role(actor.school_id,array['principal'])
  ) then raise exception 'An active principal or school administrator is required.' using errcode='42501'; end if;
  select * into source_class from public.classes c where c.id=p_class_id and c.school_id=actor.school_id for update;
  if source_class.id is null then raise exception 'Class not found in your school.'; end if;
  if p_next_class_id is not null then
    select * into target_class from public.classes c where c.id=p_next_class_id and c.school_id=actor.school_id;
    if target_class.id is null or target_class.id=source_class.id then raise exception 'Choose a different next class from this school.'; end if;
  end if;
  if p_minimum_percentage is null or p_minimum_percentage<0 or p_minimum_percentage>100 then raise exception 'Pass mark must be between 0 and 100.'; end if;
  if nullif(trim(p_promotion_term),'') is null or not exists(select 1 from public.schools s where s.id=actor.school_id and p_promotion_term=any(s.academic_terms)) then
    raise exception 'Choose a promotion term configured for this school.';
  end if;
  update public.classes set next_class_id=p_next_class_id,promotion_minimum_percentage=p_minimum_percentage,
    promotion_term=trim(p_promotion_term) where id=source_class.id returning * into source_class;
  return source_class;
end $$;
revoke all on function public.school_set_class_progression(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.school_set_class_progression(uuid,uuid,numeric,text) to authenticated;

create or replace function private.auto_promote_class_students(p_class_id uuid,p_academic_year text,p_term text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.classes; learner record; total_exams integer; published_exams integer; total_scored integer; pct numeric(5,2);
begin
  select * into c from public.classes where id=p_class_id;
  if c.id is null or c.next_class_id is null or c.promotion_term<>p_term or nullif(trim(p_academic_year),'') is null then return; end if;
  select count(*) filter(where e.max_score>0),count(*) filter(where e.published is true and e.max_score>0)
    into total_exams,published_exams from public.exams e where e.class_id=c.id and e.school_id=c.school_id
      and e.academic_year=p_academic_year and e.term=p_term;
  if total_exams=0 or published_exams<>total_exams then return; end if;
  for learner in select s.id from public.students s where s.school_id=c.school_id and s.class_id=c.id loop
    select count(*) into total_scored from public.results r join public.exams e on e.id=r.exam_id
      where r.student_id=learner.id and r.published is true and r.score is not null and e.class_id=c.id
        and e.academic_year=p_academic_year and e.term=p_term and e.published is true and e.max_score>0;
    if total_scored<>total_exams then continue; end if;
    select round((sum(r.score)/nullif(sum(e.max_score),0)*100)::numeric,2) into pct
      from public.results r join public.exams e on e.id=r.exam_id
      where r.student_id=learner.id and r.published is true and r.score is not null and e.class_id=c.id
        and e.academic_year=p_academic_year and e.term=p_term and e.published is true and e.max_score>0;
    if pct>=c.promotion_minimum_percentage then
      insert into public.student_promotions(school_id,student_id,from_class_id,to_class_id,academic_year,term,percentage,minimum_percentage)
        values(c.school_id,learner.id,c.id,c.next_class_id,p_academic_year,p_term,pct,c.promotion_minimum_percentage)
        on conflict(student_id,from_class_id,academic_year,term) do nothing;
      if found then update public.students set class_id=c.next_class_id where id=learner.id and class_id=c.id; end if;
    end if;
  end loop;
end $$;
revoke all on function private.auto_promote_class_students(uuid,text,text) from public,anon,authenticated;

create or replace function private.maybe_auto_promote_result()
returns trigger language plpgsql security definer set search_path = '' as $$
declare e public.exams;
begin
  select * into e from public.exams where id=new.exam_id;
  if e.published is true and e.class_id is not null and e.academic_year is not null and e.term is not null then
    perform private.auto_promote_class_students(e.class_id,e.academic_year,e.term);
  end if;
  return new;
end $$;
drop trigger if exists maybe_auto_promote_result on public.results;
create trigger maybe_auto_promote_result after insert or update of published,score on public.results
  for each row execute function private.maybe_auto_promote_result();
revoke all on function private.maybe_auto_promote_result() from public,anon,authenticated;

create or replace function private.maybe_auto_promote_exam()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.published is true and new.class_id is not null and new.academic_year is not null and new.term is not null then
    perform private.auto_promote_class_students(new.class_id,new.academic_year,new.term);
  end if;
  return new;
end $$;
drop trigger if exists maybe_auto_promote_exam on public.exams;
create trigger maybe_auto_promote_exam after update of published on public.exams
  for each row execute function private.maybe_auto_promote_exam();
revoke all on function private.maybe_auto_promote_exam() from public,anon,authenticated;

-- Historical class material is read-only and bounded by the learner's
-- enrollment end date. The current-class permissions remain unchanged.
create or replace function private.can_view_class_history_material(target_class uuid, material_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles actor join public.student_class_enrollments e
      on e.class_id=target_class and e.school_id=actor.school_id and e.ended_at is not null
    join public.students s on s.id=e.student_id and s.school_id=e.school_id
    where actor.id=(select auth.uid()) and actor.is_active is true
      and actor.role in ('student','parent') and private.school_subscription_entitled(actor.school_id)
      and material_date is not null and material_date < e.ended_at::date
      and ((actor.role='student' and s.profile_id=actor.id) or (actor.role='parent' and exists(
        select 1 from public.student_guardians g where g.student_id=s.id and g.guardian_id=actor.id
      )))
  )
$$;
revoke all on function private.can_view_class_history_material(uuid,date) from public,anon;
grant execute on function private.can_view_class_history_material(uuid,date) to authenticated;

drop policy if exists exams_read_related on public.exams;
create policy exams_read_related on public.exams for select to authenticated using (
  (school_id=private.current_school_id() and private.current_role()='school_admin')
  or (school_id=private.current_school_id() and private.current_role()='teacher' and private.can_manage_class_subject(school_id,class_id,subject_id))
  or (published=true and class_id is not null and private.can_view_class(class_id))
  or (published=true and class_id is not null and private.current_role() in ('student','parent')
    and private.can_view_class_history_material(class_id,exam_date))
);

drop policy if exists assignments_read_related on public.assignments;
create policy assignments_read_related on public.assignments for select to authenticated using (
  (private.current_role() in ('school_admin','teacher') and school_id=private.current_school_id()
    and (private.current_role()='school_admin' or private.can_manage_assignment(id)))
  or (private.current_role() in ('student','parent') and published_at is not null and class_id is not null
    and private.can_view_class(class_id))
  or (private.current_role() in ('student','parent') and published_at is not null and class_id is not null
    and private.can_view_class_history_material(class_id,due_date))
);

drop policy if exists lesson_plans_read_related on public.lesson_plans;
create policy lesson_plans_read_related on public.lesson_plans for select to authenticated using (
  school_id=private.current_school_id() and (
    private.current_role()='school_admin'
    or (private.current_role()='teacher' and class_id is not null and subject_id is not null and exists(
      select 1 from public.teacher_subject_assignments tsa where tsa.school_id=lesson_plans.school_id
        and tsa.teacher_id=(select auth.uid()) and tsa.class_id=lesson_plans.class_id and tsa.subject_id=lesson_plans.subject_id
    ))
    or (private.current_role()='student' and is_public=true and class_id is not null and private.can_view_class(class_id))
    or (private.current_role() in ('student','parent') and is_public=true and class_id is not null
      and private.can_view_class_history_material(class_id,created_at::date))
  )
);
