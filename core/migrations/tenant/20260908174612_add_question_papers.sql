-- Create "question_papers" table
CREATE TABLE "question_papers" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "exam_type" character varying NOT NULL, "board" character varying NULL, "exam_year" bigint NULL, "total_marks" bigint NULL, "duration_minutes" bigint NULL, "paper_set" character varying NULL, "attempt" character varying NULL, "metadata_json" jsonb NULL, "content_item_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "question_papers_content_items_question_paper" FOREIGN KEY ("content_item_id") REFERENCES "content_items" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "question_papers_content_item_id_key" to table: "question_papers"
CREATE UNIQUE INDEX "question_papers_content_item_id_key" ON "question_papers" ("content_item_id");
-- Create index "questionpaper_exam_type_exam_year" to table: "question_papers"
CREATE INDEX "questionpaper_exam_type_exam_year" ON "question_papers" ("exam_type", "exam_year");
-- Create index "questionpaper_exam_year" to table: "question_papers"
CREATE INDEX "questionpaper_exam_year" ON "question_papers" ("exam_year");
