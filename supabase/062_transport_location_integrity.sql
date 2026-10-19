-- Validate driver-controlled route fields so a driver cannot publish invalid
-- status/location values or forge the last-updated timestamp.
create or replace function private.protect_assigned_driver_route_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.driver_id = (select auth.uid())
    and private.current_role() is distinct from 'school_admin'
    and not private.has_school_permission(old.school_id, 'school.transport.manage') then
    if new.id is distinct from old.id
      or new.school_id is distinct from old.school_id
      or new.route_name is distinct from old.route_name
      or new.driver_id is distinct from old.driver_id
      or new.vehicle_number is distinct from old.vehicle_number then
      raise exception 'Drivers may update only the status and live location of their assigned route.'
        using errcode = '42501';
    end if;
    if new.status is null or new.status not in ('active', 'inactive') then
      raise exception 'Route status must be active or inactive.' using errcode = '22023';
    end if;
    if (new.last_lat is null) is distinct from (new.last_lng is null)
      or (new.last_lat is not null and (new.last_lat < -90 or new.last_lat > 90))
      or (new.last_lng is not null and (new.last_lng < -180 or new.last_lng > 180)) then
      raise exception 'Provide a valid latitude and longitude pair.' using errcode = '22023';
    end if;
    new.last_updated := now();
  end if;
  return new;
end;
$$;
revoke all on function private.protect_assigned_driver_route_update() from public, anon, authenticated;
