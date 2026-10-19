-- Keep driver trip history within valid event/coordinate bounds and set its
-- timestamp on the server so callers cannot backdate or future-date events.
create or replace function private.guard_bus_log_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare route_row public.bus_routes%rowtype;
begin
  select * into route_row from public.bus_routes where id = new.route_id;
  if not found
    or route_row.school_id is distinct from private.current_school_id()
    or route_row.driver_id is distinct from (select auth.uid()) then
    raise exception 'Trip logs can only be added by the route assigned driver.' using errcode = '42501';
  end if;

  if new.log_type not in ('TRIP_START', 'TRIP_END', 'LOCATION_UPDATE') then
    raise exception 'Unsupported trip log event.' using errcode = '22023';
  end if;
  if (new.lat is null) is distinct from (new.lng is null)
    or (new.lat is not null and (new.lat < -90 or new.lat > 90))
    or (new.lng is not null and (new.lng < -180 or new.lng > 180)) then
    raise exception 'Provide a valid latitude and longitude pair.' using errcode = '22023';
  end if;
  if new.log_type in ('TRIP_START', 'LOCATION_UPDATE') and new.lat is null then
    raise exception 'Trip start and location events require coordinates.' using errcode = '22023';
  end if;

  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.guard_bus_log_insert() from public, anon, authenticated;
drop trigger if exists guard_bus_log_insert on public.bus_logs;
create trigger guard_bus_log_insert before insert on public.bus_logs
for each row execute function private.guard_bus_log_insert();
