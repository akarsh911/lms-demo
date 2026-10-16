-- Modify "exams" table
ALTER TABLE "exams" ADD COLUMN "delivery" character varying NOT NULL DEFAULT 'in_person';
-- Create index "exam_academic_session_id_branch_id_delivery" to table: "exams"
CREATE INDEX "exam_academic_session_id_branch_id_delivery" ON "exams" ("academic_session_id", "branch_id", "delivery");
-- Create "exam_attempts" table
CREATE TABLE "exam_attempts" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "attempt_no" bigint NOT NULL, "status" character varying NOT NULL DEFAULT 'in_progress', "started_at" timestamptz NOT NULL, "deadline_at" timestamptz NOT NULL, "submitted_at" timestamptz NULL, "submitted_late" boolean NOT NULL DEFAULT false, "awaiting_review" boolean NOT NULL DEFAULT false, "awarded_marks" numeric(8,2) NULL, "exam_subject_id" uuid NOT NULL, "student_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "exam_attempts_exam_subjects_exam_subject" FOREIGN KEY ("exam_subject_id") REFERENCES "exam_subjects" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "exam_attempts_students_student" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "exam_attempts_marks_not_negative" CHECK ((awarded_marks IS NULL) OR (awarded_marks >= (0)::numeric)), CONSTRAINT "exam_attempts_submitted_iff_finished" CHECK ((((status)::text = 'in_progress'::text) AND (submitted_at IS NULL)) OR (((status)::text <> 'in_progress'::text) AND (submitted_at IS NOT NULL))));
-- Create index "examattempt_exam_subject_id_status" to table: "exam_attempts"
CREATE INDEX "examattempt_exam_subject_id_status" ON "exam_attempts" ("exam_subject_id", "status");
-- Create index "examattempt_exam_subject_id_student_id_attempt_no" to table: "exam_attempts"
CREATE UNIQUE INDEX "examattempt_exam_subject_id_student_id_attempt_no" ON "exam_attempts" ("exam_subject_id", "student_id", "attempt_no");
-- Create index "examattempt_student_id" to table: "exam_attempts"
CREATE INDEX "examattempt_student_id" ON "exam_attempts" ("student_id");
-- Create "exam_online_deliveries" table
CREATE TABLE "exam_online_deliveries" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "opens_at" timestamptz NOT NULL, "closes_at" timestamptz NOT NULL, "duration_minutes" bigint NULL, "attempts_allowed" bigint NOT NULL DEFAULT 1, "allow_late_submission" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'draft', "published_at" timestamptz NULL, "exam_subject_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "exam_online_deliveries_exam_subjects_exam_subject" FOREIGN KEY ("exam_subject_id") REFERENCES "exam_subjects" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "exam_online_deliveries_window_range" CHECK (closes_at > opens_at));
-- Create index "examonlinedelivery_closes_at" to table: "exam_online_deliveries"
CREATE INDEX "examonlinedelivery_closes_at" ON "exam_online_deliveries" ("closes_at");
-- Create index "examonlinedelivery_exam_subject_id" to table: "exam_online_deliveries"
CREATE UNIQUE INDEX "examonlinedelivery_exam_subject_id" ON "exam_online_deliveries" ("exam_subject_id");
-- Create index "examonlinedelivery_status_opens_at" to table: "exam_online_deliveries"
CREATE INDEX "examonlinedelivery_status_opens_at" ON "exam_online_deliveries" ("status", "opens_at");
-- Create "exam_questions" table
CREATE TABLE "exam_questions" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "position" bigint NOT NULL, "kind" character varying NOT NULL DEFAULT 'single_choice', "prompt" text NOT NULL, "marks" numeric(8,2) NOT NULL, "exam_subject_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "exam_questions_exam_subjects_exam_subject" FOREIGN KEY ("exam_subject_id") REFERENCES "exam_subjects" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "examquestion_exam_subject_id_kind" to table: "exam_questions"
CREATE INDEX "examquestion_exam_subject_id_kind" ON "exam_questions" ("exam_subject_id", "kind");
-- Create index "examquestion_exam_subject_id_position" to table: "exam_questions"
CREATE UNIQUE INDEX "examquestion_exam_subject_id_position" ON "exam_questions" ("exam_subject_id", "position");
-- Create "exam_question_options" table
CREATE TABLE "exam_question_options" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "position" bigint NOT NULL, "body" text NOT NULL, "is_correct" boolean NOT NULL DEFAULT false, "exam_question_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "exam_question_options_exam_questions_options" FOREIGN KEY ("exam_question_id") REFERENCES "exam_questions" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "examquestionoption_exam_question_id_is_correct" to table: "exam_question_options"
CREATE INDEX "examquestionoption_exam_question_id_is_correct" ON "exam_question_options" ("exam_question_id", "is_correct");
-- Create index "examquestionoption_exam_question_id_position" to table: "exam_question_options"
CREATE UNIQUE INDEX "examquestionoption_exam_question_id_position" ON "exam_question_options" ("exam_question_id", "position");
-- Create "exam_responses" table
CREATE TABLE "exam_responses" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "answer_text" text NULL, "marking" character varying NOT NULL DEFAULT 'unmarked', "awarded_marks" numeric(8,2) NULL, "marked_at" timestamptz NULL, "exam_attempt_id" uuid NOT NULL, "exam_question_id" uuid NOT NULL, "selected_option_id" uuid NULL, "marked_by" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "exam_responses_exam_attempts_responses" FOREIGN KEY ("exam_attempt_id") REFERENCES "exam_attempts" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "exam_responses_exam_question_options_selected_option" FOREIGN KEY ("selected_option_id") REFERENCES "exam_question_options" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "exam_responses_exam_questions_question" FOREIGN KEY ("exam_question_id") REFERENCES "exam_questions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "exam_responses_persons_marker" FOREIGN KEY ("marked_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "exam_responses_marks_not_negative" CHECK ((awarded_marks IS NULL) OR (awarded_marks >= (0)::numeric)), CONSTRAINT "exam_responses_value_iff_marked" CHECK ((((marking)::text = 'unmarked'::text) AND (awarded_marks IS NULL)) OR (((marking)::text <> 'unmarked'::text) AND (awarded_marks IS NOT NULL))));
-- Create index "examresponse_exam_attempt_id_exam_question_id" to table: "exam_responses"
CREATE UNIQUE INDEX "examresponse_exam_attempt_id_exam_question_id" ON "exam_responses" ("exam_attempt_id", "exam_question_id");
-- Create index "examresponse_exam_attempt_id_marking" to table: "exam_responses"
CREATE INDEX "examresponse_exam_attempt_id_marking" ON "exam_responses" ("exam_attempt_id", "marking");
-- Create index "examresponse_exam_question_id" to table: "exam_responses"
CREATE INDEX "examresponse_exam_question_id" ON "exam_responses" ("exam_question_id");
