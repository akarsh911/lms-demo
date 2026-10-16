-- Modify "timetable_deviations" table
ALTER TABLE "timetable_deviations" ADD COLUMN "exam_sitting_id" uuid NULL, ADD CONSTRAINT "timetable_deviations_exam_sittings_exam_sitting" FOREIGN KEY ("exam_sitting_id") REFERENCES "exam_sittings" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Create index "timetabledeviation_exam_sitting_id" to table: "timetable_deviations"
CREATE INDEX "timetabledeviation_exam_sitting_id" ON "timetable_deviations" ("exam_sitting_id");
