-- Modify "papers" table
ALTER TABLE "papers" ADD COLUMN "engine_document_id" character varying NULL, ADD COLUMN "provenance_json" jsonb NULL, ADD COLUMN "grade_level_id" uuid NULL, ADD CONSTRAINT "papers_grade_levels_grade_level" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION;
-- Create index "paper_engine_document_id" to table: "papers"
CREATE INDEX "paper_engine_document_id" ON "papers" ("engine_document_id");
-- Create index "paper_grade_level_id_status" to table: "papers"
CREATE INDEX "paper_grade_level_id_status" ON "papers" ("grade_level_id", "status");
-- Create "paper_target_sections" table
CREATE TABLE "paper_target_sections" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "paper_id" uuid NOT NULL, "section_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "paper_target_sections_papers_target_sections" FOREIGN KEY ("paper_id") REFERENCES "papers" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "paper_target_sections_sections_section" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "papertargetsection_paper_id_section_id" to table: "paper_target_sections"
CREATE UNIQUE INDEX "papertargetsection_paper_id_section_id" ON "paper_target_sections" ("paper_id", "section_id");
-- Create index "papertargetsection_section_id" to table: "paper_target_sections"
CREATE INDEX "papertargetsection_section_id" ON "paper_target_sections" ("section_id");
