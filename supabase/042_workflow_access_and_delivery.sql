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
