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
