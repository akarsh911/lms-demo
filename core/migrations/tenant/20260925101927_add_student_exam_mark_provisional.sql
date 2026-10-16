-- Modify "student_exam_marks" table
ALTER TABLE "student_exam_marks" ADD CONSTRAINT "student_exam_marks_provisional_only_when_marked" CHECK ((NOT provisional) OR ((status)::text = 'marked'::text)), ADD COLUMN "provisional" boolean NOT NULL DEFAULT false;
