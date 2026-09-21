-- 1. Security Audit Logs Table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz default now()
);

-- 2. Trigger Function to Log Changes
create or replace function public.log_table_change()
returns trigger as $$
begin
  insert into public.audit_logs (school_id, actor_id, action, table_name, record_id, old_data, new_data)
  values (
    case when TG_OP = 'DELETE' then OLD.school_id else NEW.school_id end,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then OLD.id else NEW.id end,
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end
  );
  return null;
end;
$$ language plpgsql security definer;

-- Attach triggers to sensitive tables
create trigger audit_results after insert or update or delete on public.results for each row execute procedure public.log_table_change();
create trigger audit_payments after insert or update or delete on public.payments for each row execute procedure public.log_table_change();
create trigger audit_profiles after update or delete on public.profiles for each row execute procedure public.log_table_change();

-- 3. Granular Privacy Policies (RLS Tightening)
-- Results: Students only see their own, Teachers see school's
drop policy if exists "school members results" on public.results;
create policy "students view own results" on public.results for select using (
  exists (select 1 from public.students where id = student_id and profile_id = auth.uid())
);
create policy "staff manage results" on public.results for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'school_admin'))
  and public.same_school(school_id)
);

-- Payments: Parents only see their children's, Admins see school's
drop policy if exists "school members payments" on public.payments;
create policy "parents view children payments" on public.payments for select using (
  exists (select 1 from public.student_guardians where student_id = public.payments.student_id and guardian_id = auth.uid())
);
create policy "admins manage payments" on public.payments for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin')
  and public.same_school(school_id)
);

-- 4. Audit Log Permissions
alter table public.audit_logs enable row level security;
create policy "super admins view all logs" on public.audit_logs for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin')
);
create policy "school admins view school logs" on public.audit_logs for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin' and school_id = public.audit_logs.school_id)
);
