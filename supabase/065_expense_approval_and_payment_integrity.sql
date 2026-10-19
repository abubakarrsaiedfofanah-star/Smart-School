-- Separate expense entry/approval/payment roles and keep approval evidence
-- immutable after approval. Payment timestamps are set by the database.
drop policy if exists school_expenses_finance_update on public.school_expenses;
create policy school_expenses_finance_update on public.school_expenses for update to authenticated
using (private.has_school_permission(school_id, 'school.expenses.manage'))
with check (
  private.has_school_permission(school_id, 'school.expenses.manage')
  and ((approved_by is null and approved_at is null)
    or (approved_by is not null and approved_at is not null))
);

create or replace function private.guard_expense_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'recorded' then raise exception 'Approved, paid, or void expenses cannot be deleted.' using errcode = '42501'; end if;
    return old;
  end if;

  if new.id is distinct from old.id or new.school_id is distinct from old.school_id
    or new.created_by is distinct from old.created_by then
    raise exception 'Expense identity and creator are immutable.' using errcode = '42501';
  end if;

  if old.status in ('paid','void') then raise exception 'Paid and void expenses are immutable.' using errcode = '42501'; end if;

  if old.status = 'recorded' then
    if new.status = 'recorded' then
      if new.approved_by is not null or new.approved_at is not null or new.paid_at is not null then
        raise exception 'Unapproved expenses cannot carry approval or payment evidence.' using errcode = '42501';
      end if;
      return new;
    end if;
    if new.status = 'approved' then
      if old.created_by = (select auth.uid()) then
        raise exception 'The expense creator cannot approve their own expense.' using errcode = '42501';
      end if;
      if not private.has_hr_role(old.school_id, array['principal']) then
        raise exception 'Principal approval is required for expenses.' using errcode = '42501';
      end if;
      new.approved_by := (select auth.uid());
      new.approved_at := now();
      new.paid_at := null;
      return new;
    end if;
    if new.status = 'void' then
      if not private.has_hr_role(old.school_id, array['principal']) then
        raise exception 'Only a principal can void an expense.' using errcode = '42501';
      end if;
      if new.approved_by is not null or new.approved_at is not null or new.paid_at is not null then
        raise exception 'Unapproved expenses cannot carry approval or payment evidence.' using errcode = '42501';
      end if;
      return new;
    end if;
    raise exception 'Expense status transition is not allowed.' using errcode = '42501';
  end if;

  if old.status = 'approved' then
    if new.status not in ('paid','void')
      or new.title is distinct from old.title or new.category is distinct from old.category
      or new.vendor is distinct from old.vendor or new.amount is distinct from old.amount
      or new.currency_code is distinct from old.currency_code or new.incurred_on is distinct from old.incurred_on
      or new.receipt_reference is distinct from old.receipt_reference or new.notes is distinct from old.notes
      or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at then
      raise exception 'Approved expense details and approval evidence are locked; only payment completion or voiding is allowed.'
        using errcode = '42501';
    end if;
    if new.status = 'paid' then
      if not private.has_hr_role(old.school_id, array['finance_officer']) then
        raise exception 'Only Finance can mark an approved expense paid.' using errcode = '42501';
      end if;
      new.paid_at := now();
    else
      if not private.has_hr_role(old.school_id, array['principal']) then
        raise exception 'Only a principal can void an approved expense.' using errcode = '42501';
      end if;
      new.paid_at := old.paid_at;
    end if;
    return new;
  end if;

  raise exception 'Expense status transition is not allowed.' using errcode = '42501';
end;
$$;
revoke all on function private.guard_expense_transition() from public, anon, authenticated;
