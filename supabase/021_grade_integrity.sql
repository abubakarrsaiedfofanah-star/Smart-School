-- Tightening grade integrity
-- Only the teacher assigned to the class can enter or update results for that class.

drop policy if exists "staff manage results" on public.results;
drop policy if exists "teachers manage own class results" on public.results;

create policy "teachers manage own class results" on public.results for all
using (
  exists (
    select 1 from public.exams e
    join public.classes c on e.class_id = c.id
    where e.id = public.results.exam_id
    and (c.teacher_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'))
  )
)
with check (
  exists (
    select 1 from public.exams e
    join public.classes c on e.class_id = c.id
    where e.id = public.results.exam_id
    and (c.teacher_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = 'school_admin'))
  )
);
