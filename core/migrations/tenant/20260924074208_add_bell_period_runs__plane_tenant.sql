-- Modify "bell_schedule_periods" table
ALTER TABLE "bell_schedule_periods" ADD COLUMN "runs" boolean NOT NULL DEFAULT true;
-- Drop index "timetablegenerationjob_timetable_id" from table: "timetable_generation_jobs"
DROP INDEX "timetablegenerationjob_timetable_id";
-- Create index "timetablegenerationjob_timetable_id" to table: "timetable_generation_jobs"
CREATE UNIQUE INDEX "timetablegenerationjob_timetable_id" ON "timetable_generation_jobs" ("timetable_id") WHERE ((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying])::text[]));
