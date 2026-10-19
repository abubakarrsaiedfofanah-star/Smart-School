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
