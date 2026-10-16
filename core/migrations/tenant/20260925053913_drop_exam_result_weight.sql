-- Modify "exams" table
ALTER TABLE "exams" DROP CONSTRAINT "exams_practice_has_no_weight", DROP CONSTRAINT "exams_result_weight_positive", DROP COLUMN "result_weight";
