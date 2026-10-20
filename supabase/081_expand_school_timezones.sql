-- Allow every IANA timezone offered by the school registration form.
-- Apply after migrations 001-080.
alter table public.schools
  drop constraint if exists schools_timezone_check;

alter table public.schools
  add constraint schools_timezone_check check (
    timezone in (
      'Africa/Nairobi',
      'Africa/Freetown',
      'Africa/Kampala',
      'Africa/Dar_es_Salaam',
      'Africa/Accra',
      'Africa/Lagos',
      'Africa/Kigali',
      'Africa/Lusaka',
      'Africa/Blantyre',
      'Africa/Johannesburg',
      'Africa/Monrovia',
      'Africa/Banjul',
      'Africa/Dakar',
      'Africa/Abidjan',
      'Africa/Douala',
      'Africa/Addis_Ababa',
      'Africa/Cairo',
      'America/New_York',
      'Europe/London',
      'UTC'
    )
  );
