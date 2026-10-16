-- Modify "papers" table
ALTER TABLE "papers" ADD COLUMN "subject_id" uuid NULL, ADD CONSTRAINT "papers_subjects_subject" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "paper_subject_id_status" to table: "papers"
CREATE INDEX "paper_subject_id_status" ON "papers" ("subject_id", "status");
