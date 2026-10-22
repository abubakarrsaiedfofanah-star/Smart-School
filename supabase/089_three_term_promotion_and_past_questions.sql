-- Promotion is a year-end decision: only Term 3 can trigger it.
update public.classes set promotion_term='Term 3' where promotion_term is distinct from 'Term 3';
alter table public.classes drop constraint if exists classes_promotion_term_check;
alter table public.classes add constraint classes_promotion_term_check check (promotion_term='Term 3');

create or replace function public.school_set_class_progression(
  p_class_id uuid,p_next_class_id uuid,p_minimum_percentage numeric,p_promotion_term text
)
returns public.classes language plpgsql security definer set search_path = '' as $$
declare actor public.profiles; source_class public.classes; target_class public.classes; year_value text;
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
  if p_promotion_term is distinct from 'Term 3' or not exists(
    select 1 from public.schools s where s.id=actor.school_id and 'Term 3'=any(s.academic_terms)
  ) then raise exception 'Promotion is processed only after Term 3, the final term of the academic year.'; end if;
  update public.classes set next_class_id=p_next_class_id,promotion_minimum_percentage=p_minimum_percentage,
    promotion_term='Term 3' where id=source_class.id returning * into source_class;
  if p_next_class_id is not null then
    for year_value in select distinct e.academic_year from public.exams e
      where e.class_id=source_class.id and e.school_id=actor.school_id and e.term='Term 3' and e.academic_year is not null
    loop
      perform private.auto_promote_class_students(source_class.id,year_value,'Term 3');
    end loop;
  end if;
  return source_class;
end $$;
revoke all on function public.school_set_class_progression(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.school_set_class_progression(uuid,uuid,numeric,text) to authenticated;

create or replace function private.auto_promote_class_students(p_class_id uuid,p_academic_year text,p_term text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.classes; learner record; total_exams integer; published_exams integer; terms_seen integer;
  total_scored integer; pct numeric(5,2);
begin
  select * into c from public.classes where id=p_class_id;
  if c.id is null or c.next_class_id is null or c.promotion_term<>'Term 3'
     or p_term<>'Term 3' or nullif(trim(p_academic_year),'') is null then return; end if;
  select count(*),count(*) filter(where e.published is true),count(distinct e.term)
    into total_exams,published_exams,terms_seen
    from public.exams e where e.class_id=c.id and e.school_id=c.school_id and e.max_score>0
      and e.academic_year=p_academic_year and e.term in ('Term 1','Term 2','Term 3');
  if total_exams=0 or terms_seen<3 or published_exams<>total_exams then return; end if;
  for learner in select s.id from public.students s where s.school_id=c.school_id and s.class_id=c.id loop
    select count(*) into total_scored from public.results r join public.exams e on e.id=r.exam_id
      where r.student_id=learner.id and r.published is true and r.score is not null and e.class_id=c.id
        and e.academic_year=p_academic_year and e.term in ('Term 1','Term 2','Term 3') and e.published is true and e.max_score>0;
    if total_scored<>total_exams then continue; end if;
    select round((sum(r.score)/nullif(sum(e.max_score),0)*100)::numeric,2) into pct
      from public.results r join public.exams e on e.id=r.exam_id
      where r.student_id=learner.id and r.published is true and r.score is not null and e.class_id=c.id
        and e.academic_year=p_academic_year and e.term in ('Term 1','Term 2','Term 3') and e.published is true and e.max_score>0;
    if pct>=c.promotion_minimum_percentage then
      insert into public.student_promotions(school_id,student_id,from_class_id,to_class_id,academic_year,term,percentage,minimum_percentage)
        values(c.school_id,learner.id,c.id,c.next_class_id,p_academic_year,'Term 3',pct,c.promotion_minimum_percentage)
        on conflict(student_id,from_class_id,academic_year,term) do nothing;
      if found then update public.students set class_id=c.next_class_id where id=learner.id and class_id=c.id; end if;
    end if;
  end loop;
end $$;
revoke all on function private.auto_promote_class_students(uuid,text,text) from public,anon,authenticated;

-- Permit one platform administrator identity, provisioned by the database
-- owner/service role. School and public signup can never create this role.
create unique index if not exists profiles_one_super_admin
  on public.profiles(role) where role='super_admin';

create or replace function private.guard_super_admin_account()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role='super_admin' and auth.role() is distinct from 'service_role'
     and current_user not in ('postgres','supabase_admin') then
    if tg_op='INSERT' or old.role is distinct from 'super_admin' then
      raise exception 'The platform administrator account is provisioned privately and cannot be created through signup.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_super_admin_account() from public,anon,authenticated;
drop trigger if exists guard_super_admin_account on public.profiles;
create trigger guard_super_admin_account before insert or update of role on public.profiles
  for each row execute function private.guard_super_admin_account();

-- Past quizzes, CATs, tests and exam-style assessments from ended class
-- periods are returned without answer keys and only to that learner.
create or replace function public.get_my_past_class_questions()
returns table(
  question_id uuid, quiz_id uuid, assessment_title text, assessment_type text,
  subject_id uuid, subject_name text, class_id uuid, class_name text,
  question_text text, options jsonb, points integer, question_type text,
  sort_order integer, explanation text, topic_tags text[], difficulty text
)
language plpgsql security definer set search_path = '' as $$
declare learner public.students;
begin
  if (select private.current_role()) is distinct from 'student' then
    raise exception 'Student portal access is required.' using errcode='42501';
  end if;
  select * into learner from public.students s where s.profile_id=(select auth.uid())
    and s.school_id=(select private.current_school_id()) limit 1;
  if learner.id is null then raise exception 'Student record not found.'; end if;
  return query
    select q.id,quiz.id,quiz.title,quiz.assessment_type,quiz.subject_id,sub.name,
      cls.id,cls.name,q.question_text,q.options,q.points,q.question_type,q.sort_order,q.explanation,
      q.topic_tags,q.difficulty
    from public.student_class_enrollments enrollment
    join public.quizzes quiz on quiz.class_id=enrollment.class_id and quiz.school_id=enrollment.school_id
    join public.classes cls on cls.id=enrollment.class_id
    join public.quiz_questions q on q.quiz_id=quiz.id
    left join public.subjects sub on sub.id=quiz.subject_id
    where enrollment.student_id=learner.id and enrollment.ended_at is not null
      and quiz.published is true and quiz.created_at < enrollment.ended_at
      and quiz.assessment_type in ('exam','cat','test','quiz')
      and (quiz.subject_id is null or exists(select 1 from public.subjects s where s.id=quiz.subject_id and s.school_id=learner.school_id))
    order by cls.name,sub.name,quiz.assessment_type,quiz.title,q.sort_order,q.id;
end $$;
revoke all on function public.get_my_past_class_questions() from public,anon;
grant execute on function public.get_my_past_class_questions() to authenticated;

-- Principals can organize multiple teacher/class/subject loads on the school's
-- behalf, while ordinary teachers retain read access only to their own loads.
create or replace function private.has_hr_role(target_school uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select private.school_subscription_entitled(target_school) and (
    exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active is true
      and p.school_id=target_school and p.role='school_admin')
    or exists(select 1 from public.school_staff_role_assignments a
      join public.profiles p on p.id=a.profile_id and p.school_id=a.school_id and p.is_active is true
        and p.role in ('teacher','staff')
      where a.profile_id=(select auth.uid()) and a.school_id=target_school and a.role_key=any(allowed_roles))
  )
$$;
revoke all on function private.has_hr_role(uuid,text[]) from public,anon;
grant execute on function private.has_hr_role(uuid,text[]) to authenticated;

drop policy if exists classes_principal_read on public.classes;
create policy classes_principal_read on public.classes for select to authenticated using (
  private.has_hr_role(school_id,array['principal'])
);
drop policy if exists profiles_principal_staff_read on public.profiles;
create policy profiles_principal_staff_read on public.profiles for select to authenticated using (
  school_id=private.current_school_id() and role in ('teacher','staff')
  and private.has_hr_role(school_id,array['principal'])
);

drop policy if exists teacher_subject_assignments_read_school on public.teacher_subject_assignments;
create policy teacher_subject_assignments_read_school on public.teacher_subject_assignments for select to authenticated using (
  school_id=private.current_school_id() and (
    private.current_role()='school_admin' or teacher_id=(select auth.uid())
    or private.has_hr_role(school_id,array['principal'])
  )
);
drop policy if exists teacher_subject_assignments_admin_manage on public.teacher_subject_assignments;
create policy teacher_subject_assignments_admin_manage on public.teacher_subject_assignments for all to authenticated
  using (school_id=private.current_school_id() and private.has_hr_role(school_id,array['principal']))
  with check (school_id=private.current_school_id() and private.has_hr_role(school_id,array['principal']));
