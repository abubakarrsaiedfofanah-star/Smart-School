-- Replace legacy audit-log policies that still trusted a profile role after
-- its account had been disabled.
drop policy if exists "super admins view all logs" on public.audit_logs;
create policy "active super admins view all logs" on public.audit_logs
for select to authenticated
using (public.is_super_admin());

drop policy if exists "school admins view school logs" on public.audit_logs;
create policy "active school admins view school logs" on public.audit_logs
for select to authenticated
using (
  private.current_role() = 'school_admin'
  and school_id = private.current_school_id()
);
