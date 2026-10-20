-- Show saved finance and principal digital signatures on paid fee receipts,
-- and ensure the platform has only one Super Admin profile.

create unique index if not exists profiles_single_super_admin
  on public.profiles(role) where role = 'super_admin';

create or replace function public.get_payment_document_signatures(p_payment_id uuid)
returns table(
  finance_officer_name text,
  finance_officer_signature_url text,
  principal_name text,
  principal_signature_url text
)
language plpgsql stable security definer set search_path = '' as $$
declare target_school uuid; target_student uuid;
begin
  select p.school_id, p.student_id into target_school, target_student
  from public.payments p where p.id = p_payment_id;
  if target_school is null then raise exception 'Payment not found.'; end if;
  if (select private.current_role()) is null then
    raise exception 'An active signed-in account is required.' using errcode = '42501';
  end if;
  if (select private.current_role()) is distinct from 'super_admin'
     and (target_student is null or not (select private.can_view_student(target_student))) then
    raise exception 'You cannot view this payment receipt.' using errcode = '42501';
  end if;

  return query
  select finance.full_name, finance.signature_url,
    coalesce(principal.full_name,
      case when lower(coalesce(s.school_level, '')) like '%primary%' then 'Head teacher' else 'Principal' end),
    coalesce(principal.signature_url, s.principal_signature_url)
  from public.schools s
  left join lateral (
    select p.full_name, p.signature_url
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.is_active is true
    where a.school_id = s.id and a.role_key = 'finance_officer'
    order by a.created_at desc limit 1
  ) finance on true
  left join lateral (
    select p.full_name, p.signature_url
    from public.school_staff_role_assignments a
    join public.profiles p on p.id = a.profile_id and p.school_id = a.school_id and p.is_active is true
    where a.school_id = s.id and a.role_key = 'principal'
    order by a.created_at desc limit 1
  ) principal on true
  where s.id = target_school;
end;
$$;

revoke all on function public.get_payment_document_signatures(uuid) from public, anon;
grant execute on function public.get_payment_document_signatures(uuid) to authenticated;
