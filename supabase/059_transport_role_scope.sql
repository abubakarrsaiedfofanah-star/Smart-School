-- Live routes and trip history disclose driver location and vehicle details.
-- Grant access to school operators and the driver assigned to each route only.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'bus_routes'
  loop execute format('drop policy %I on public.bus_routes', p.policyname); end loop;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'bus_logs'
  loop execute format('drop policy %I on public.bus_logs', p.policyname); end loop;
end $$;

create policy bus_routes_read_authorized on public.bus_routes for select to authenticated using (
  private.current_role() = 'super_admin'
  or (school_id = private.current_school_id() and (
    private.current_role() = 'school_admin'
    or private.has_school_permission(school_id, 'school.transport.manage')
    or driver_id = (select auth.uid())
  ))
);

create policy bus_routes_manage_authorized on public.bus_routes for all to authenticated
using (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.transport.manage')
)
with check (
  school_id = private.current_school_id()
  and private.has_school_permission(school_id, 'school.transport.manage')
);

create policy bus_routes_driver_update on public.bus_routes for update to authenticated
using (school_id = private.current_school_id() and driver_id = (select auth.uid()))
with check (school_id = private.current_school_id() and driver_id = (select auth.uid()));

create or replace function private.protect_assigned_driver_route_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.driver_id = (select auth.uid())
    and private.current_role() is distinct from 'school_admin'
    and not private.has_school_permission(old.school_id, 'school.transport.manage')
    and (
      new.id is distinct from old.id
      or new.school_id is distinct from old.school_id
      or new.route_name is distinct from old.route_name
      or new.driver_id is distinct from old.driver_id
      or new.vehicle_number is distinct from old.vehicle_number
    ) then
    raise exception 'Drivers may update only the status and live location of their assigned route.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_assigned_driver_route_update() from public, anon, authenticated;
drop trigger if exists protect_assigned_driver_route_update on public.bus_routes;
create trigger protect_assigned_driver_route_update before update on public.bus_routes
for each row execute function private.protect_assigned_driver_route_update();

create policy bus_logs_read_authorized on public.bus_logs for select to authenticated using (
  exists (
    select 1 from public.bus_routes r where r.id = bus_logs.route_id and (
      private.current_role() = 'super_admin'
      or (r.school_id = private.current_school_id() and (
        r.driver_id = (select auth.uid())
        or r.school_id = private.current_school_id() and private.has_school_permission(r.school_id, 'school.transport.manage')
        or r.school_id = private.current_school_id() and private.current_role() = 'school_admin'
      ))
    )
  )
);

create policy bus_logs_driver_insert on public.bus_logs for insert to authenticated with check (
  exists (
    select 1 from public.bus_routes r where r.id = bus_logs.route_id
      and r.school_id = private.current_school_id() and r.driver_id = (select auth.uid())
  )
);
