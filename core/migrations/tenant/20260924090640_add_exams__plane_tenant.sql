-- Create "exams" table
CREATE TABLE "exams" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "exam_type" character varying NOT NULL DEFAULT 'unit_test', "start_at" timestamptz NULL, "end_at" timestamptz NULL, "instructions" text NULL, "status" character varying NOT NULL DEFAULT 'draft', "academic_session_id" uuid NOT NULL, "branch_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "exams_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "exams_branches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "exams_window_range" CHECK ((start_at IS NULL) OR (end_at IS NULL) OR (end_at >= start_at)));
-- Create index "exam_academic_session_id_branch_id_code" to table: "exams"
CREATE UNIQUE INDEX "exam_academic_session_id_branch_id_code" ON "exams" ("academic_session_id", "branch_id", "code");
-- Create index "exam_academic_session_id_branch_id_status" to table: "exams"
CREATE INDEX "exam_academic_session_id_branch_id_status" ON "exams" ("academic_session_id", "branch_id", "status");
-- Create index "exam_exam_type" to table: "exams"
CREATE INDEX "exam_exam_type" ON "exams" ("exam_type");
-- Create index "exam_start_at" to table: "exams"
CREATE INDEX "exam_start_at" ON "exams" ("start_at");
-- Create "exam_subjects" table
CREATE TABLE "exam_subjects" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "maximum_marks" numeric(8,2) NOT NULL, "pass_marks" numeric(8,2) NULL, "exam_id" uuid NOT NULL, "subject_offering_id" uuid NOT NULL, "grading_scheme_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "exam_subjects_exams_exam_subjects" FOREIGN KEY ("exam_id") REFERENCES "exams" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "exam_subjects_grading_schemes_grading_scheme" FOREIGN KEY ("grading_scheme_id") REFERENCES "grading_schemes" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "exam_subjects_subject_offerings_subject_offering" FOREIGN KEY ("subject_offering_id") REFERENCES "subject_offerings" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "exam_subjects_marks_range" CHECK ((pass_marks IS NULL) OR (pass_marks <= maximum_marks)));
-- Create index "examsubject_exam_id_subject_offering_id" to table: "exam_subjects"
CREATE UNIQUE INDEX "examsubject_exam_id_subject_offering_id" ON "exam_subjects" ("exam_id", "subject_offering_id");
-- Create index "examsubject_grading_scheme_id" to table: "exam_subjects"
CREATE INDEX "examsubject_grading_scheme_id" ON "exam_subjects" ("grading_scheme_id");
-- Create index "examsubject_subject_offering_id" to table: "exam_subjects"
CREATE INDEX "examsubject_subject_offering_id" ON "exam_subjects" ("subject_offering_id");
-- Create "exam_sittings" table
CREATE TABLE "exam_sittings" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "calendar_day_id" uuid NOT NULL, "period_id" uuid NOT NULL, "section_id" uuid NOT NULL, "room_id" uuid NULL, "exam_subject_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "exam_sittings_calendar_days_calendar_day" FOREIGN KEY ("calendar_day_id") REFERENCES "calendar_days" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "exam_sittings_exam_subjects_sittings" FOREIGN KEY ("exam_subject_id") REFERENCES "exam_subjects" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "exam_sittings_periods_period" FOREIGN KEY ("period_id") REFERENCES "periods" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "exam_sittings_rooms_room" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "exam_sittings_sections_section" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "examsitting_calendar_day_id_period_id" to table: "exam_sittings"
CREATE INDEX "examsitting_calendar_day_id_period_id" ON "exam_sittings" ("calendar_day_id", "period_id");
-- Create index "examsitting_exam_subject_id_calendar_day_id_period_id" to table: "exam_sittings"
CREATE UNIQUE INDEX "examsitting_exam_subject_id_calendar_day_id_period_id" ON "exam_sittings" ("exam_subject_id", "calendar_day_id", "period_id");
-- Create index "examsitting_period_id" to table: "exam_sittings"
CREATE INDEX "examsitting_period_id" ON "exam_sittings" ("period_id");
-- Create index "examsitting_room_id_calendar_day_id_period_id" to table: "exam_sittings"
CREATE INDEX "examsitting_room_id_calendar_day_id_period_id" ON "exam_sittings" ("room_id", "calendar_day_id", "period_id");
-- Create index "examsitting_section_id_calendar_day_id" to table: "exam_sittings"
CREATE INDEX "examsitting_section_id_calendar_day_id" ON "exam_sittings" ("section_id", "calendar_day_id");
