-- Protect the public school-registration endpoint from bulk account and tenant spam.
create table if not exists private.school_registration_attempts (
  requester_hash text not null,
  created_at timestamptz not null default now()
);
alter table private.school_registration_attempts enable row level security;
revoke all on table private.school_registration_attempts from public, anon, authenticated;

create index if not exists school_registration_attempts_created_at
  on private.school_registration_attempts (created_at);
create index if not exists school_registration_attempts_requester_created
  on private.school_registration_attempts (requester_hash, created_at desc);

create or replace function public.consume_school_registration_attempt(p_requester_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare recent_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Registration rate-limit access is restricted.';
  end if;
  if p_requester_hash is null or length(p_requester_hash) <> 64 then
    raise exception 'Invalid requester key.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_requester_hash, 0));
  delete from private.school_registration_attempts where created_at < now() - interval '24 hours';
  select count(*) into recent_attempts from private.school_registration_attempts
    where requester_hash = p_requester_hash and created_at > now() - interval '1 hour';
  if recent_attempts >= 5 then return false; end if;
  insert into private.school_registration_attempts(requester_hash) values (p_requester_hash);
  return true;
end
$$;

revoke all on function public.consume_school_registration_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_school_registration_attempt(text) to service_role;
