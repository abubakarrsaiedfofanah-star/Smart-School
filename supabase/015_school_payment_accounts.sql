-- Add payment account fields to schools
alter table public.schools
add column if not exists mpesa_paybill text,
add column if not exists mpesa_till text,
add column if not exists bank_name text,
add column if not exists bank_account_name text,
add column if not exists bank_account_number text;

-- Update existing demo school with some details for testing
update public.schools
set
  mpesa_paybill = '247247',
  mpesa_till = '5123456',
  bank_name = 'Equity Bank',
  bank_account_name = 'SmartSchool Academy Operations',
  bank_account_number = '0123456789012'
where slug = 'demo-school'; -- Assuming there's a demo school slug
