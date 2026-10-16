-- Create "blueprints" table
CREATE TABLE "blueprints" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "code" character varying NOT NULL, "name" character varying NOT NULL, "description" text NULL, "total_marks" numeric(8,2) NOT NULL, "duration_minutes" bigint NOT NULL, "version" bigint NOT NULL DEFAULT 1, "status" character varying NOT NULL DEFAULT 'draft', "cognitive_scheme" jsonb NOT NULL, "unit_weightage" jsonb NULL, "academic_session_id" uuid NULL, "grade_level_id" uuid NOT NULL, "subject_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "blueprints_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "blueprints_grade_levels_grade_level" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "blueprints_subjects_subject" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "blueprint_academic_session_id" to table: "blueprints"
CREATE INDEX "blueprint_academic_session_id" ON "blueprints" ("academic_session_id");
-- Create index "blueprint_code_version" to table: "blueprints"
CREATE UNIQUE INDEX "blueprint_code_version" ON "blueprints" ("code", "version");
-- Create index "blueprint_status" to table: "blueprints"
CREATE INDEX "blueprint_status" ON "blueprints" ("status");
-- Create index "blueprint_subject_id_grade_level_id" to table: "blueprints"
CREATE INDEX "blueprint_subject_id_grade_level_id" ON "blueprints" ("subject_id", "grade_level_id");
-- Create "blueprint_sections" table
CREATE TABLE "blueprint_sections" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "section_code" character varying NOT NULL, "position" bigint NOT NULL, "question_count" bigint NOT NULL, "marks_per_question" numeric(8,2) NULL, "total_marks" numeric(8,2) NOT NULL, "duration_minutes" bigint NULL, "blueprint_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "blueprint_sections_blueprints_sections" FOREIGN KEY ("blueprint_id") REFERENCES "blueprints" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "blueprint_sections_marks_positive" CHECK ((marks_per_question IS NULL) OR (marks_per_question > (0)::numeric)));
-- Create index "blueprintsection_blueprint_id_position" to table: "blueprint_sections"
CREATE UNIQUE INDEX "blueprintsection_blueprint_id_position" ON "blueprint_sections" ("blueprint_id", "position");
-- Create index "blueprintsection_blueprint_id_section_code" to table: "blueprint_sections"
CREATE UNIQUE INDEX "blueprintsection_blueprint_id_section_code" ON "blueprint_sections" ("blueprint_id", "section_code");
-- Create "blueprint_constraints" table
CREATE TABLE "blueprint_constraints" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "constraint_type" character varying NOT NULL, "value_json" jsonb NOT NULL, "min_value" numeric(8,3) NULL, "max_value" numeric(8,3) NULL, "blueprint_section_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "blueprint_constraints_blueprint_sections_constraints" FOREIGN KEY ("blueprint_section_id") REFERENCES "blueprint_sections" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "blueprint_constraints_value_range" CHECK ((min_value IS NULL) OR (max_value IS NULL) OR (max_value >= min_value)));
-- Create index "blueprintconstraint_blueprint_section_id_constraint_type" to table: "blueprint_constraints"
CREATE INDEX "blueprintconstraint_blueprint_section_id_constraint_type" ON "blueprint_constraints" ("blueprint_section_id", "constraint_type");
-- Modify "calendar_days" table
ALTER TABLE "calendar_days" ADD COLUMN "substitute_day_of_week" bigint NULL;
-- Create "calendar_day_section_patterns" table
CREATE TABLE "calendar_day_section_patterns" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "substitute_day_of_week" bigint NOT NULL, "calendar_day_id" uuid NOT NULL, "section_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "calendar_day_section_patterns_calendar_days_section_patterns" FOREIGN KEY ("calendar_day_id") REFERENCES "calendar_days" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "calendar_day_section_patterns_sections_section" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "calendardaysectionpattern_calendar_day_id_section_id" to table: "calendar_day_section_patterns"
CREATE UNIQUE INDEX "calendardaysectionpattern_calendar_day_id_section_id" ON "calendar_day_section_patterns" ("calendar_day_id", "section_id");
-- Create index "calendardaysectionpattern_section_id" to table: "calendar_day_section_patterns"
CREATE INDEX "calendardaysectionpattern_section_id" ON "calendar_day_section_patterns" ("section_id");
-- Create "paper_generation_runs" table
CREATE TABLE "paper_generation_runs" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "generation_method" character varying NOT NULL DEFAULT 'ai', "algorithm" character varying NULL, "model_version" character varying NULL, "status" character varying NOT NULL DEFAULT 'queued', "started_at" timestamptz NULL, "completed_at" timestamptz NULL, "prompt" text NULL, "prompt_hash" character varying NULL, "input_tokens" bigint NULL, "output_tokens" bigint NULL, "cost_amount" numeric(12,6) NULL, "cost_currency" character varying NULL, "failure_reason" text NULL, "blueprint_id" uuid NOT NULL, "academic_session_id" uuid NULL, "requested_by" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "paper_generation_runs_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "paper_generation_runs_blueprints_blueprint" FOREIGN KEY ("blueprint_id") REFERENCES "blueprints" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "paper_generation_runs_persons_requester" FOREIGN KEY ("requested_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "paper_generation_runs_cost_not_negative" CHECK ((cost_amount IS NULL) OR (cost_amount >= (0)::numeric)), CONSTRAINT "paper_generation_runs_cost_paired" CHECK (((cost_amount IS NULL) AND (cost_currency IS NULL)) OR ((cost_amount IS NOT NULL) AND (cost_currency IS NOT NULL))), CONSTRAINT "paper_generation_runs_window_range" CHECK ((started_at IS NULL) OR (completed_at IS NULL) OR (completed_at >= started_at)));
-- Create index "papergenerationrun_academic_session_id" to table: "paper_generation_runs"
CREATE INDEX "papergenerationrun_academic_session_id" ON "paper_generation_runs" ("academic_session_id");
-- Create index "papergenerationrun_blueprint_id_status" to table: "paper_generation_runs"
CREATE INDEX "papergenerationrun_blueprint_id_status" ON "paper_generation_runs" ("blueprint_id", "status");
-- Create index "papergenerationrun_requested_by" to table: "paper_generation_runs"
CREATE INDEX "papergenerationrun_requested_by" ON "paper_generation_runs" ("requested_by");
-- Create index "papergenerationrun_status_created_at" to table: "paper_generation_runs"
CREATE INDEX "papergenerationrun_status_created_at" ON "paper_generation_runs" ("status", "created_at");
-- Create "papers" table
CREATE TABLE "papers" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "paper_code" character varying NOT NULL, "title" character varying NOT NULL, "version" bigint NOT NULL DEFAULT 1, "status" character varying NOT NULL DEFAULT 'draft', "total_marks" numeric(8,2) NOT NULL, "duration_minutes" bigint NULL, "approved_at" timestamptz NULL, "academic_session_id" uuid NOT NULL, "exam_id" uuid NULL, "blueprint_id" uuid NULL, "approved_by" uuid NULL, "generation_run_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "papers_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "papers_blueprints_blueprint" FOREIGN KEY ("blueprint_id") REFERENCES "blueprints" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "papers_exams_exam" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "papers_paper_generation_runs_papers" FOREIGN KEY ("generation_run_id") REFERENCES "paper_generation_runs" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "papers_persons_approver" FOREIGN KEY ("approved_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "papers_approval_paired" CHECK (((approved_by IS NULL) AND (approved_at IS NULL)) OR ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL))));
-- Create index "paper_academic_session_id_paper_code_version" to table: "papers"
CREATE UNIQUE INDEX "paper_academic_session_id_paper_code_version" ON "papers" ("academic_session_id", "paper_code", "version");
-- Create index "paper_academic_session_id_status" to table: "papers"
CREATE INDEX "paper_academic_session_id_status" ON "papers" ("academic_session_id", "status");
-- Create index "paper_blueprint_id" to table: "papers"
CREATE INDEX "paper_blueprint_id" ON "papers" ("blueprint_id");
-- Create index "paper_exam_id" to table: "papers"
CREATE INDEX "paper_exam_id" ON "papers" ("exam_id");
-- Create index "paper_generation_run_id" to table: "papers"
CREATE INDEX "paper_generation_run_id" ON "papers" ("generation_run_id");
-- Create "paper_sections" table
CREATE TABLE "paper_sections" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "position" bigint NOT NULL, "instructions" text NULL, "paper_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "paper_sections_papers_sections" FOREIGN KEY ("paper_id") REFERENCES "papers" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "papersection_paper_id_code" to table: "paper_sections"
CREATE UNIQUE INDEX "papersection_paper_id_code" ON "paper_sections" ("paper_id", "code");
-- Create index "papersection_paper_id_position" to table: "paper_sections"
CREATE UNIQUE INDEX "papersection_paper_id_position" ON "paper_sections" ("paper_id", "position");
-- Create "questions" table
CREATE TABLE "questions" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "canonical_key" character varying NOT NULL, "question_type" character varying NOT NULL DEFAULT 'mcq', "status" character varying NOT NULL DEFAULT 'draft', "difficulty_score" numeric(5,2) NULL, "difficulty_label" character varying NULL, "bloom_level" character varying NULL, "language" character varying NULL, "estimated_seconds" bigint NULL, "source_type" character varying NOT NULL DEFAULT 'original', "subject_id" uuid NULL, "grade_level_id" uuid NULL, "created_by" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "questions_grade_levels_grade_level" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "questions_persons_author" FOREIGN KEY ("created_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "questions_subjects_subject" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "questions_difficulty_score_range" CHECK ((difficulty_score IS NULL) OR ((difficulty_score >= (0)::numeric) AND (difficulty_score <= (100)::numeric))));
-- Create index "question_created_by" to table: "questions"
CREATE INDEX "question_created_by" ON "questions" ("created_by");
-- Create index "question_difficulty_label" to table: "questions"
CREATE INDEX "question_difficulty_label" ON "questions" ("difficulty_label");
-- Create index "question_source_type" to table: "questions"
CREATE INDEX "question_source_type" ON "questions" ("source_type");
-- Create index "question_status_question_type" to table: "questions"
CREATE INDEX "question_status_question_type" ON "questions" ("status", "question_type");
-- Create index "question_subject_id_grade_level_id" to table: "questions"
CREATE INDEX "question_subject_id_grade_level_id" ON "questions" ("subject_id", "grade_level_id");
-- Create index "questions_canonical_key_key" to table: "questions"
CREATE UNIQUE INDEX "questions_canonical_key_key" ON "questions" ("canonical_key");
-- Create "question_versions" table
CREATE TABLE "question_versions" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "version_number" bigint NOT NULL, "stem" text NOT NULL, "explanation" text NULL, "answer_data_json" jsonb NULL, "status" character varying NOT NULL DEFAULT 'draft', "question_id" uuid NOT NULL, "created_by" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "question_versions_persons_editor" FOREIGN KEY ("created_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "question_versions_questions_versions" FOREIGN KEY ("question_id") REFERENCES "questions" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "questionversion_created_by" to table: "question_versions"
CREATE INDEX "questionversion_created_by" ON "question_versions" ("created_by");
-- Create index "questionversion_question_id_status" to table: "question_versions"
CREATE INDEX "questionversion_question_id_status" ON "question_versions" ("question_id", "status");
-- Create index "questionversion_question_id_version_number" to table: "question_versions"
CREATE UNIQUE INDEX "questionversion_question_id_version_number" ON "question_versions" ("question_id", "version_number");
-- Create "paper_questions" table
CREATE TABLE "paper_questions" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "question_number" character varying NOT NULL, "marks" numeric(8,2) NOT NULL, "position" bigint NOT NULL, "variant_group" character varying NULL, "question_id" uuid NOT NULL, "question_version_id" uuid NOT NULL, "paper_section_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "paper_questions_paper_sections_questions" FOREIGN KEY ("paper_section_id") REFERENCES "paper_sections" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "paper_questions_question_versions_question_version" FOREIGN KEY ("question_version_id") REFERENCES "question_versions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "paper_questions_questions_question" FOREIGN KEY ("question_id") REFERENCES "questions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "paperquestion_paper_section_id_position" to table: "paper_questions"
CREATE UNIQUE INDEX "paperquestion_paper_section_id_position" ON "paper_questions" ("paper_section_id", "position");
-- Create index "paperquestion_paper_section_id_question_number" to table: "paper_questions"
CREATE INDEX "paperquestion_paper_section_id_question_number" ON "paper_questions" ("paper_section_id", "question_number");
-- Create index "paperquestion_question_id" to table: "paper_questions"
CREATE INDEX "paperquestion_question_id" ON "paper_questions" ("question_id");
-- Create index "paperquestion_question_version_id" to table: "paper_questions"
CREATE INDEX "paperquestion_question_version_id" ON "paper_questions" ("question_version_id");
-- Create index "paperquestion_variant_group" to table: "paper_questions"
CREATE INDEX "paperquestion_variant_group" ON "paper_questions" ("variant_group");
-- Create "timetable_sections" table
CREATE TABLE "timetable_sections" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "timetable_id" uuid NOT NULL, "section_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "timetable_sections_sections_section" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "timetable_sections_timetables_covered_sections" FOREIGN KEY ("timetable_id") REFERENCES "timetables" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "timetablesection_section_id" to table: "timetable_sections"
CREATE INDEX "timetablesection_section_id" ON "timetable_sections" ("section_id");
-- Create index "timetablesection_timetable_id_section_id" to table: "timetable_sections"
CREATE UNIQUE INDEX "timetablesection_timetable_id_section_id" ON "timetable_sections" ("timetable_id", "section_id");
