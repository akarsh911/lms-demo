\set ON_ERROR_STOP on

\if :{?branch}
\else
  \set branch '62dda72a-03b6-4731-99a9-b39a6dd3f9b5'
\endif

with
branch as (
  select b.id, b.name, b.code from branches b where b.id = :'branch'::uuid
),
scheme as (
  select ps.id, ps.code, ps.name, ps.academic_session_id
  from period_schemes ps
  where ps.branch_id = :'branch'::uuid and ps.status = 'active'
  order by ps.code
  limit 1
),
tt as (
  select t.id, t.name, t.version, t.status, t.effective_from, t.effective_to
  from timetables t
  join scheme s on s.id = t.period_scheme_id
  where t.status = 'published'
  order by t.effective_from desc, t.version desc
  limit 1
),
win as (
  select
    greatest(coalesce((select effective_from from tt), (select min(calendar_date) from calendar_days where branch_id = :'branch'::uuid)),
             (select min(calendar_date) from calendar_days where branch_id = :'branch'::uuid)) as lo,
    least(coalesce((select effective_to from tt), (select max(calendar_date) from calendar_days where branch_id = :'branch'::uuid)),
          (select max(calendar_date) from calendar_days where branch_id = :'branch'::uuid)) as hi
),
open_cell as (
  select
    extract(isodow from cd.calendar_date)::int              as day_of_week,
    bsp.period_id                                           as period_id,
    bs.code                                                 as bell_code,
    bsp.start_minute                                        as start_minute,
    bsp.end_minute                                          as end_minute,
    cd.calendar_date                                        as on_date
  from calendar_days cd
  join win w on cd.calendar_date between w.lo and w.hi
  join calendar_day_schedules cds on cds.calendar_day_id = cd.id
  join scheme s on s.id = cds.period_scheme_id
  join bell_schedules bs on bs.id = cds.bell_schedule_id
  join bell_schedule_periods bsp on bsp.bell_schedule_id = bs.id
  join periods p on p.id = bsp.period_id
  where cd.branch_id = :'branch'::uuid
    and p.kind = 'teaching'
    and p.status = 'active'
    and ((bsp.start_minute <  720 and cd.forenoon_open)
      or (bsp.start_minute >= 720 and cd.afternoon_open))
),
cell as (
  select
    day_of_week,
    period_id,
    min(bell_code)                       as bell_code,
    min(start_minute)                    as start_minute,
    min(end_minute - start_minute)       as duration_minutes,
    max(end_minute - start_minute)       as duration_max,
    count(*)::int                        as occurrences
  from open_cell
  group by day_of_week, period_id
),
offering as (
  select
    so.id, so.section_id, so.subject_id, so.periods_per_week,
    (to_jsonb(so) ->> 'minutes_per_week')::int as minutes_per_week,
    sub.code as subject_code, sub.name as subject_name,
    sub.is_elective, sub.subject_type
  from subject_offerings so
  join subjects sub on sub.id = so.subject_id
  join sections sec on sec.id = so.section_id
  where sec.branch_id = :'branch'::uuid and so.status = 'active' and sec.status = 'active'
),
offering_teacher as (
  select ta.subject_offering_id as offering_id, ta.teacher_id
  from teacher_assignments ta
  where ta.status = 'active' and ta.subject_offering_id is not null
  group by 1, 2
),
enrolment as (
  select sse.student_id, sse.subject_offering_id as offering_id
  from student_subject_enrollments sse
  join offering o on o.id = sse.subject_offering_id
  where sse.status = 'active'
),
student_basket as (
  select
    e.student_id,
    array_agg(distinct e.offering_id::text order by e.offering_id::text) as offering_ids
  from enrolment e
  group by e.student_id
),
cohort as (
  select
    md5(array_to_string(offering_ids, ',')) as key,
    offering_ids,
    count(*)::int as size
  from student_basket
  group by offering_ids
),
roll as (
  select se.section_id, se.student_id
  from student_enrollments se
  join sections sec on sec.id = se.section_id
  where sec.branch_id = :'branch'::uuid and se.status = 'active'
),
incumbent as (
  select
    ts.subject_offering_id as offering_id,
    ts.teacher_id,
    ts.room_id,
    count(*)::int as slots
  from timetable_slots ts
  join tt on tt.id = ts.timetable_id
  where ts.subject_offering_id is not null
  group by 1, 2, 3
),
current as (
  select ts.subject_offering_id as offering_id, ts.section_id, ts.day_of_week,
         ts.period_id, ts.teacher_id, ts.room_id
  from timetable_slots ts
  join tt on tt.id = ts.timetable_id
  where ts.subject_offering_id is not null
),
fixed as (
  select ts.id, ts.section_id, ts.period_id, ts.day_of_week, ts.label, ts.teacher_id, ts.room_id
  from timetable_slots ts
  join tt on tt.id = ts.timetable_id
  where ts.subject_offering_id is null
)
select json_strip_nulls(json_build_object(
  'branch',            (select row_to_json(b) from branch b),
  'period_scheme',     (select row_to_json(s) from scheme s),
  'timetable',         (select row_to_json(t) from tt t),
  'window',            (select row_to_json(w) from win w),
  'periods',           (select coalesce(json_agg(row_to_json(x) order by x.sequence), '[]'::json)
                        from (select p.id, p.code, p.name, p.sequence, p.kind::text
                              from periods p join scheme s on s.id = p.period_scheme_id
                              where p.status = 'active') x),
  'cells',             (select coalesce(json_agg(row_to_json(x) order by x.day_of_week, x.start_minute), '[]'::json)
                        from cell x),
  'sections',          (select coalesce(json_agg(row_to_json(x) order by x.code), '[]'::json)
                        from (select sec.id, sec.code, sec.name, sec.room_id as home_room_id,
                                     gl.id as grade_level_id, gl.name as grade_name
                              from sections sec join grade_levels gl on gl.id = sec.grade_level_id
                              where sec.branch_id = :'branch'::uuid and sec.status = 'active') x),
  'rooms',             (select coalesce(json_agg(row_to_json(x) order by x.code), '[]'::json)
                        from (select r.id, r.code, r.name, r.room_type, r.capacity
                              from rooms r
                              where r.branch_id = :'branch'::uuid and r.status = 'active') x),
  'teachers',          (select coalesce(json_agg(row_to_json(x) order by x.name), '[]'::json)
                        from (select t.id, t.teacher_code as code, pe.display_name as name
                              from teachers t
                              join staff st on st.id = t.staff_id
                              join persons pe on pe.id = st.person_id
                              where t.status = 'active') x),
  'offerings',         (select coalesce(json_agg(row_to_json(x) order by x.subject_code), '[]'::json)
                        from (select o.*,
                                     (select coalesce(json_agg(ot.teacher_id order by ot.teacher_id), '[]'::json)
                                      from offering_teacher ot where ot.offering_id = o.id) as teacher_ids,
                                     (select count(*)::int from enrolment e where e.offering_id = o.id) as enrolled
                              from offering o) x),
  'cohorts',           (select coalesce(json_agg(row_to_json(x) order by x.key), '[]'::json) from cohort x),
  'incumbents',        (select coalesce(json_agg(row_to_json(x)), '[]'::json) from incumbent x),
  'fixed_slots',       (select coalesce(json_agg(row_to_json(x) order by x.day_of_week), '[]'::json) from fixed x),
  'enrolments',        (select coalesce(json_agg(json_build_array(e.student_id, e.offering_id)), '[]'::json) from enrolment e),
  'section_roll',      (select coalesce(json_agg(json_build_array(r.student_id, r.section_id)), '[]'::json) from roll r),
  'current_slots',     (select coalesce(json_agg(row_to_json(x) order by x.day_of_week), '[]'::json) from current x)
));
