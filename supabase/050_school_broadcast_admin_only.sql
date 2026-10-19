-- Bulk school-wide communication is an administrator capability. Teachers
-- keep their normal one-to-one messages but cannot create bulk broadcasts.

drop policy if exists broadcasts_staff_manage on public.broadcasts;
create policy broadcasts_school_admin_manage on public.broadcasts
for all to authenticated
using (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
)
with check (
  school_id = private.current_school_id()
  and private.current_role() = 'school_admin'
);
