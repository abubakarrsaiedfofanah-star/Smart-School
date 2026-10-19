-- Keep school-wide asset details limited to people whose school role needs them.
-- Inventory includes serial numbers, assignees, purchase dates, and asset values.
drop policy if exists assets_read_school on public.assets;
create policy assets_read_school on public.assets for select to authenticated using (
  (private.current_role() = 'super_admin')
  or (
    school_id = private.current_school_id()
    and private.has_school_permission(school_id, 'school.inventory.view')
  )
);

-- Write access remains controlled by the existing inventory.manage policy;
-- an inventory.view assignment only grants read access.
