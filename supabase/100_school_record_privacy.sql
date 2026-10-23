-- School rows contain payment destinations and platform billing metadata.
-- Keep full-row access for the school's active administrator and platform admins;
-- expose a deliberately small workspace profile to other active members.

drop policy if exists "members view their school" on public.schools;
drop policy if exists schools_platform_or_admin_read on public.schools;
create policy schools_platform_or_admin_read on public.schools
for select to authenticated using (
  exists (
    select 1 from public.profiles actor
    where actor.id = (select auth.uid()) and actor.is_active is true
      and actor.role = 'super_admin'
  )
  or exists (
    select 1 from public.profiles actor
    where actor.id = (select auth.uid()) and actor.is_active is true
      and actor.role = 'school_admin' and actor.school_id = schools.id
  )
);

-- Billing suspended administrators retain the existing billing read policy.
-- Replace the original admin update policy so disabled accounts cannot edit
-- school settings using an unexpired JWT.
drop policy if exists "school admins update their school" on public.schools;
drop policy if exists schools_active_admin_update on public.schools;
create policy schools_active_admin_update on public.schools
for update to authenticated
using (exists (
  select 1 from public.profiles actor
  where actor.id = (select auth.uid()) and actor.is_active is true
    and actor.role = 'school_admin' and actor.school_id = schools.id
))
with check (exists (
  select 1 from public.profiles actor
  where actor.id = (select auth.uid()) and actor.is_active is true
    and actor.role = 'school_admin' and actor.school_id = schools.id
));

create or replace function public.get_my_school_workspace()
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'slug', s.slug,
    'status', s.status,
    'school_level', s.school_level,
    'logo_url', s.logo_url,
    'principal_signature_url', s.principal_signature_url,
    'teacher_signature_url', s.teacher_signature_url,
    'school_motto', s.school_motto,
    'mission', s.mission,
    'vision', s.vision,
    'primary_color', s.primary_color,
    'country_code', s.country_code,
    'currency_code', s.currency_code,
    'timezone', s.timezone,
    'academic_terms', s.academic_terms,
    'grading_scale', s.grading_scale
  )
  from public.profiles actor
  join public.schools s on s.id = actor.school_id
  where actor.id = (select auth.uid()) and actor.is_active is true
    and actor.role <> 'super_admin'
  limit 1
$$;
revoke all on function public.get_my_school_workspace() from public, anon;
grant execute on function public.get_my_school_workspace() to authenticated;

-- A school payment record is the authorization anchor for disclosure of
-- payment destinations. Parents must be linked to its student; students may
-- see only their own; school admins and finance staff may support the payer.
create or replace function public.get_my_payment_school_details(p_payment_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'address', s.address,
    'logo_url', s.logo_url,
    'currency_code', s.currency_code,
    'country_code', s.country_code,
    'mobile_money_provider', s.mobile_money_provider,
    'mobile_money_number', s.mobile_money_number,
    'mobile_money_account_name', s.mobile_money_account_name,
    'mpesa_paybill', s.mpesa_paybill,
    'mpesa_till', s.mpesa_till,
    'bank_name', s.bank_name,
    'bank_account_name', s.bank_account_name,
    'bank_account_number', s.bank_account_number
  )
  from public.payments payment_row
  join public.schools s on s.id = payment_row.school_id
  where payment_row.id = p_payment_id
    and payment_row.school_id = private.current_school_id()
    and private.current_role() is not null
    and (
      private.current_role() = 'school_admin'
      or private.has_hr_role(payment_row.school_id, array['finance'])
      or (payment_row.student_id is not null and private.can_view_student(payment_row.student_id)
        and private.current_role() in ('student','parent'))
    )
  limit 1
$$;
revoke all on function public.get_my_payment_school_details(uuid) from public, anon;
grant execute on function public.get_my_payment_school_details(uuid) to authenticated;
