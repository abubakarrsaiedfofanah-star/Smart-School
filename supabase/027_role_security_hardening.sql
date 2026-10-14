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

