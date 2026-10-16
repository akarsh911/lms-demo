-- Create "elective_groups" table
CREATE TABLE "elective_groups" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "description" text NULL, "position" bigint NOT NULL DEFAULT 0, "status" character varying NOT NULL DEFAULT 'active', "academic_session_id" uuid NOT NULL, "section_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "elective_groups_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "elective_groups_sections_section" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "electivegroup_academic_session_id_status" to table: "elective_groups"
CREATE INDEX "electivegroup_academic_session_id_status" ON "elective_groups" ("academic_session_id", "status");
-- Create index "electivegroup_section_id_code" to table: "elective_groups"
CREATE UNIQUE INDEX "electivegroup_section_id_code" ON "elective_groups" ("section_id", "code");
-- Create index "electivegroup_section_id_position" to table: "elective_groups"
CREATE INDEX "electivegroup_section_id_position" ON "elective_groups" ("section_id", "position");
-- Create "elective_group_offerings" table
CREATE TABLE "elective_group_offerings" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "position" bigint NOT NULL DEFAULT 0, "elective_group_id" uuid NOT NULL, "subject_offering_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "elective_group_offerings_elective_groups_offerings" FOREIGN KEY ("elective_group_id") REFERENCES "elective_groups" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "elective_group_offerings_subject_offerings_subject_offering" FOREIGN KEY ("subject_offering_id") REFERENCES "subject_offerings" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "electivegroupoffering_elective_group_id_position" to table: "elective_group_offerings"
CREATE INDEX "electivegroupoffering_elective_group_id_position" ON "elective_group_offerings" ("elective_group_id", "position");
-- Create index "electivegroupoffering_subject_offering_id" to table: "elective_group_offerings"
CREATE UNIQUE INDEX "electivegroupoffering_subject_offering_id" ON "elective_group_offerings" ("subject_offering_id");
