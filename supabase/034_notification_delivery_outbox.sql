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
