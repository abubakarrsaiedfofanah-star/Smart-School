-- Add payment account fields to schools
alter table public.schools
add column if not exists mpesa_paybill text,
add column if not exists mpesa_till text,
add column if not exists bank_name text,
add column if not exists bank_account_name text,
add column if not exists bank_account_number text;
