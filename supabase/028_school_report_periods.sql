-- Add explicit academic period metadata so published school reports do not mix years or terms.
alter table public.exams
  add column if not exists academic_year text,
  add column if not exists term text;

update public.exams
set academic_year = extract(year from exam_date)::integer::text
where academic_year is null and exam_date is not null;

alter table public.exams
  add constraint exams_term_check
  check (term is null or term in ('Term 1', 'Term 2', 'Term 3'));

create index if not exists exams_school_period on public.exams (school_id, academic_year, term, exam_date);
