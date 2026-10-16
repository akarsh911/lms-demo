-- Create "persons" table
CREATE TABLE "persons" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "cas_user_id" uuid NOT NULL, "first_name" character varying NOT NULL, "middle_name" character varying NULL, "last_name" character varying NULL, "display_name" character varying NOT NULL, "date_of_birth" date NULL, "gender" character varying NULL, "email" character varying NULL, "phone" character varying NULL, "profile_photo_asset_id" uuid NULL, "status" character varying NOT NULL DEFAULT 'active', "metadata_json" jsonb NULL, PRIMARY KEY ("id"));
-- Create index "person_email" to table: "persons"
CREATE INDEX "person_email" ON "persons" ("email");
-- Create index "person_last_name_first_name" to table: "persons"
CREATE INDEX "person_last_name_first_name" ON "persons" ("last_name", "first_name");
-- Create index "person_status" to table: "persons"
CREATE INDEX "person_status" ON "persons" ("status");
-- Create index "persons_cas_user_id_key" to table: "persons"
CREATE UNIQUE INDEX "persons_cas_user_id_key" ON "persons" ("cas_user_id");
-- Set comment to column: "cas_user_id" on table: "persons"
COMMENT ON COLUMN "persons"."cas_user_id" IS 'CAS identity. Immutable: re-pointing a person at a different identity is a new person.';
-- Set comment to column: "display_name" on table: "persons"
COMMENT ON COLUMN "persons"."display_name" IS 'Preferred name, shown in the UI. Not derived: people choose it.';
-- Set comment to column: "email" on table: "persons"
COMMENT ON COLUMN "persons"."email" IS 'Domain profile email. NOT the CAS login email.';
-- Set comment to column: "phone" on table: "persons"
COMMENT ON COLUMN "persons"."phone" IS 'Domain profile phone. NOT the CAS login phone.';
-- Set comment to column: "status" on table: "persons"
COMMENT ON COLUMN "persons"."status" IS 'Local status. CAS has its own (active|blocked|pending|disabled) which is NOT mirrored here.';
-- Set comment to column: "metadata_json" on table: "persons"
COMMENT ON COLUMN "persons"."metadata_json" IS 'Extensible profile data. Anything promoted to a real column should leave here.';
-- Create "guardians" table
CREATE TABLE "guardians" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "occupation" character varying NULL, "employer" character varying NULL, "status" character varying NOT NULL DEFAULT 'active', "person_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "guardians_persons_guardian" FOREIGN KEY ("person_id") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "guardians_person_id_key" to table: "guardians"
CREATE UNIQUE INDEX "guardians_person_id_key" ON "guardians" ("person_id");
-- Create "academic_sessions" table
CREATE TABLE "academic_sessions" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "status" character varying NOT NULL DEFAULT 'upcoming', "is_current" boolean NOT NULL DEFAULT false, "settings_json" jsonb NULL, "previous_session_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "academic_sessions_academic_sessions_next_sessions" FOREIGN KEY ("previous_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE SET NULL);
-- Create index "academic_sessions_code_key" to table: "academic_sessions"
CREATE UNIQUE INDEX "academic_sessions_code_key" ON "academic_sessions" ("code");
-- Create index "academic_sessions_name_key" to table: "academic_sessions"
CREATE UNIQUE INDEX "academic_sessions_name_key" ON "academic_sessions" ("name");
-- Create index "academicsession_start_date_end_date" to table: "academic_sessions"
CREATE INDEX "academicsession_start_date_end_date" ON "academic_sessions" ("start_date", "end_date");
-- Create "branches" table
CREATE TABLE "branches" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "address_json" jsonb NULL, "phone" character varying NULL, "email" character varying NULL, "status" character varying NOT NULL DEFAULT 'active', PRIMARY KEY ("id"));
-- Create index "branches_code_key" to table: "branches"
CREATE UNIQUE INDEX "branches_code_key" ON "branches" ("code");
-- Create "grade_levels" table
CREATE TABLE "grade_levels" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "sequence" bigint NOT NULL, "education_stage" character varying NULL, "status" character varying NOT NULL DEFAULT 'active', PRIMARY KEY ("id"));
-- Create index "grade_levels_code_key" to table: "grade_levels"
CREATE UNIQUE INDEX "grade_levels_code_key" ON "grade_levels" ("code");
-- Create index "gradelevel_sequence" to table: "grade_levels"
CREATE INDEX "gradelevel_sequence" ON "grade_levels" ("sequence");
-- Create "staff" table
CREATE TABLE "staff" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "employee_code" character varying NOT NULL, "department_id" uuid NULL, "designation" character varying NULL, "employment_type" character varying NULL, "joining_date" date NULL, "leaving_date" date NULL, "status" character varying NOT NULL DEFAULT 'active', "branch_id" uuid NULL, "person_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "staff_branches_staff" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "staff_persons_staff_records" FOREIGN KEY ("person_id") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "staff_branch_id" to table: "staff"
CREATE INDEX "staff_branch_id" ON "staff" ("branch_id");
-- Create index "staff_department_id" to table: "staff"
CREATE INDEX "staff_department_id" ON "staff" ("department_id");
-- Create index "staff_employee_code_key" to table: "staff"
CREATE UNIQUE INDEX "staff_employee_code_key" ON "staff" ("employee_code");
-- Create index "staff_status" to table: "staff"
CREATE INDEX "staff_status" ON "staff" ("status");
-- Create "teachers" table
CREATE TABLE "teachers" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "teacher_code" character varying NULL, "qualification_json" jsonb NULL, "specialization" character varying NULL, "status" character varying NOT NULL DEFAULT 'active', "staff_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "teachers_staff_teacher" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "teacher_status" to table: "teachers"
CREATE INDEX "teacher_status" ON "teachers" ("status");
-- Create index "teachers_staff_id_key" to table: "teachers"
CREATE UNIQUE INDEX "teachers_staff_id_key" ON "teachers" ("staff_id");
-- Create index "teachers_teacher_code_key" to table: "teachers"
CREATE UNIQUE INDEX "teachers_teacher_code_key" ON "teachers" ("teacher_code");
-- Create "sections" table
CREATE TABLE "sections" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "capacity" bigint NULL, "room_id" uuid NULL, "status" character varying NOT NULL DEFAULT 'active', "academic_session_id" uuid NOT NULL, "branch_id" uuid NOT NULL, "grade_level_id" uuid NOT NULL, "class_teacher_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "sections_academic_sessions_sections" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "sections_branches_sections" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "sections_grade_levels_sections" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "sections_teachers_class_teacher" FOREIGN KEY ("class_teacher_id") REFERENCES "teachers" ("id") ON UPDATE NO ACTION ON DELETE SET NULL);
-- Create index "section_academic_session_id_branch_id_grade_level_id" to table: "sections"
CREATE INDEX "section_academic_session_id_branch_id_grade_level_id" ON "sections" ("academic_session_id", "branch_id", "grade_level_id");
-- Create index "section_academic_session_id_code" to table: "sections"
CREATE UNIQUE INDEX "section_academic_session_id_code" ON "sections" ("academic_session_id", "code");
-- Create index "section_class_teacher_id" to table: "sections"
CREATE INDEX "section_class_teacher_id" ON "sections" ("class_teacher_id");
-- Create "school_houses" table
CREATE TABLE "school_houses" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NULL, "display_config_json" jsonb NULL, "status" character varying NOT NULL DEFAULT 'active', PRIMARY KEY ("id"));
-- Create index "school_houses_code_key" to table: "school_houses"
CREATE UNIQUE INDEX "school_houses_code_key" ON "school_houses" ("code");
-- Create index "school_houses_name_key" to table: "school_houses"
CREATE UNIQUE INDEX "school_houses_name_key" ON "school_houses" ("name");
-- Create "students" table
CREATE TABLE "students" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "admission_number" character varying NOT NULL, "student_code" character varying NULL, "admission_date" date NULL, "status" character varying NOT NULL DEFAULT 'active', "withdrawal_date" date NULL, "withdrawal_reason" character varying NULL, "person_id" uuid NOT NULL, "school_house_students" uuid NULL, "house_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "students_persons_students" FOREIGN KEY ("person_id") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "students_school_houses_house" FOREIGN KEY ("house_id") REFERENCES "school_houses" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "students_school_houses_students" FOREIGN KEY ("school_house_students") REFERENCES "school_houses" ("id") ON UPDATE NO ACTION ON DELETE SET NULL);
-- Create index "student_house_id" to table: "students"
CREATE INDEX "student_house_id" ON "students" ("house_id");
-- Create index "student_status" to table: "students"
CREATE INDEX "student_status" ON "students" ("status");
-- Create index "students_admission_number_key" to table: "students"
CREATE UNIQUE INDEX "students_admission_number_key" ON "students" ("admission_number");
-- Create index "students_student_code_key" to table: "students"
CREATE UNIQUE INDEX "students_student_code_key" ON "students" ("student_code");
-- Create "student_addresses" table
CREATE TABLE "student_addresses" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "address_type" character varying NOT NULL DEFAULT 'home', "address_json" jsonb NOT NULL, "is_primary" boolean NOT NULL DEFAULT false, "valid_from" date NULL, "valid_to" date NULL, "student_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "student_addresses_students_addresses" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "studentaddress_student_id_address_type" to table: "student_addresses"
CREATE INDEX "studentaddress_student_id_address_type" ON "student_addresses" ("student_id", "address_type");
-- Create "subject_groups" table
CREATE TABLE "subject_groups" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "description" text NULL, "status" character varying NOT NULL DEFAULT 'active', PRIMARY KEY ("id"));
-- Create index "subject_groups_name_key" to table: "subject_groups"
CREATE UNIQUE INDEX "subject_groups_name_key" ON "subject_groups" ("name");
-- Create "subjects" table
CREATE TABLE "subjects" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "short_name" character varying NULL, "code" character varying NOT NULL, "description" text NULL, "subject_type" character varying NOT NULL DEFAULT 'academic', "is_elective" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'active', PRIMARY KEY ("id"));
-- Create index "subject_status" to table: "subjects"
CREATE INDEX "subject_status" ON "subjects" ("status");
-- Create index "subject_subject_type" to table: "subjects"
CREATE INDEX "subject_subject_type" ON "subjects" ("subject_type");
-- Create index "subjects_code_key" to table: "subjects"
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects" ("code");
-- Create "subject_offerings" table
CREATE TABLE "subject_offerings" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "periods_per_week" bigint NULL, "maximum_marks" numeric(8,2) NULL, "pass_marks" numeric(8,2) NULL, "grading_scheme_id" uuid NULL, "status" character varying NOT NULL DEFAULT 'active', "academic_session_id" uuid NOT NULL, "section_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "subject_group_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "subject_offerings_academic_sessions_subject_offerings" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "subject_offerings_sections_subject_offerings" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "subject_offerings_subject_groups_offerings" FOREIGN KEY ("subject_group_id") REFERENCES "subject_groups" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "subject_offerings_subjects_offerings" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "subjectoffering_academic_session_id_section_id_subject_id" to table: "subject_offerings"
CREATE UNIQUE INDEX "subjectoffering_academic_session_id_section_id_subject_id" ON "subject_offerings" ("academic_session_id", "section_id", "subject_id");
-- Create index "subjectoffering_subject_id" to table: "subject_offerings"
CREATE INDEX "subjectoffering_subject_id" ON "subject_offerings" ("subject_id");
-- Create "student_assignments" table
CREATE TABLE "student_assignments" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "role_type" character varying NOT NULL, "is_primary" boolean NOT NULL DEFAULT false, "valid_from" date NULL, "valid_to" date NULL, "status" character varying NOT NULL DEFAULT 'active', "academic_session_id" uuid NOT NULL, "section_id" uuid NULL, "student_id" uuid NOT NULL, "assigned_by" uuid NULL, "subject_offering_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "student_assignments_academic_sessions_student_assignments" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_assignments_persons_assigner" FOREIGN KEY ("assigned_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "student_assignments_sections_student_assignments" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "student_assignments_students_assignments" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_assignments_subject_offerings_student_assignments" FOREIGN KEY ("subject_offering_id") REFERENCES "subject_offerings" ("id") ON UPDATE NO ACTION ON DELETE SET NULL);
-- Create index "studentassignment_academic_session_id_student_id_status" to table: "student_assignments"
CREATE INDEX "studentassignment_academic_session_id_student_id_status" ON "student_assignments" ("academic_session_id", "student_id", "status");
-- Create index "studentassignment_role_type_status" to table: "student_assignments"
CREATE INDEX "studentassignment_role_type_status" ON "student_assignments" ("role_type", "status");
-- Create index "studentassignment_section_id_status" to table: "student_assignments"
CREATE INDEX "studentassignment_section_id_status" ON "student_assignments" ("section_id", "status");
-- Create "student_documents" table
CREATE TABLE "student_documents" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "document_type" character varying NOT NULL, "asset_id" uuid NOT NULL, "document_number" character varying NULL, "issued_by" character varying NULL, "issued_at" date NULL, "expires_at" date NULL, "verification_status" character varying NOT NULL DEFAULT 'unverified', "verified_at" timestamptz NULL, "academic_session_id" uuid NULL, "student_id" uuid NOT NULL, "verified_by" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "student_documents_academic_sessions_student_documents" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "student_documents_persons_verifier" FOREIGN KEY ("verified_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "student_documents_students_documents" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "studentdocument_expires_at" to table: "student_documents"
CREATE INDEX "studentdocument_expires_at" ON "student_documents" ("expires_at");
-- Create index "studentdocument_student_id_document_type" to table: "student_documents"
CREATE INDEX "studentdocument_student_id_document_type" ON "student_documents" ("student_id", "document_type");
-- Create index "studentdocument_verification_status" to table: "student_documents"
CREATE INDEX "studentdocument_verification_status" ON "student_documents" ("verification_status");
-- Create "student_enrollments" table
CREATE TABLE "student_enrollments" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "roll_number" character varying NULL, "enrollment_number" character varying NULL, "enrollment_date" date NOT NULL, "exit_date" date NULL, "promotion_status" character varying NULL, "status" character varying NOT NULL DEFAULT 'active', "academic_session_id" uuid NOT NULL, "section_id" uuid NOT NULL, "student_id" uuid NOT NULL, "previous_enrollment_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "student_enrollments_academic_sessions_enrollments" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_enrollments_sections_enrollments" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_enrollments_student_enrollments_next_enrollments" FOREIGN KEY ("previous_enrollment_id") REFERENCES "student_enrollments" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "student_enrollments_students_enrollments" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "studentenrollment_academic_session_id_status" to table: "student_enrollments"
CREATE INDEX "studentenrollment_academic_session_id_status" ON "student_enrollments" ("academic_session_id", "status");
-- Create index "studentenrollment_section_id_status" to table: "student_enrollments"
CREATE INDEX "studentenrollment_section_id_status" ON "student_enrollments" ("section_id", "status");
-- Create index "studentenrollment_student_id_academic_session_id" to table: "student_enrollments"
CREATE UNIQUE INDEX "studentenrollment_student_id_academic_session_id" ON "student_enrollments" ("student_id", "academic_session_id");
-- Create "student_guardians" table
CREATE TABLE "student_guardians" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "relationship_type" character varying NOT NULL, "is_primary" boolean NOT NULL DEFAULT false, "is_emergency_contact" boolean NOT NULL DEFAULT false, "can_pickup" boolean NOT NULL DEFAULT false, "can_view_academic" boolean NOT NULL DEFAULT true, "can_view_finance" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'active', "guardian_id" uuid NOT NULL, "student_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "student_guardians_guardians_student_links" FOREIGN KEY ("guardian_id") REFERENCES "guardians" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_guardians_students_guardian_links" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "studentguardian_guardian_id" to table: "student_guardians"
CREATE INDEX "studentguardian_guardian_id" ON "student_guardians" ("guardian_id");
-- Create index "studentguardian_student_id_guardian_id" to table: "student_guardians"
CREATE UNIQUE INDEX "studentguardian_student_id_guardian_id" ON "student_guardians" ("student_id", "guardian_id");
-- Set comment to column: "relationship_type" on table: "student_guardians"
COMMENT ON COLUMN "student_guardians"."relationship_type" IS 'mother/father/guardian/grandparent/sibling. Free text: family shapes vary.';
-- Set comment to column: "is_primary" on table: "student_guardians"
COMMENT ON COLUMN "student_guardians"."is_primary" IS 'At most one primary guardian per student; enforced by a partial unique index in SQL.';
-- Create "student_notes" table
CREATE TABLE "student_notes" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "category" character varying NOT NULL, "title" character varying NULL, "body" text NOT NULL, "visibility" character varying NOT NULL DEFAULT 'staff', "academic_session_id" uuid NOT NULL, "author_person_id" uuid NOT NULL, "student_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "student_notes_academic_sessions_student_notes" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_notes_persons_authored_notes" FOREIGN KEY ("author_person_id") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_notes_students_notes" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "studentnote_category" to table: "student_notes"
CREATE INDEX "studentnote_category" ON "student_notes" ("category");
-- Create index "studentnote_student_id_academic_session_id" to table: "student_notes"
CREATE INDEX "studentnote_student_id_academic_session_id" ON "student_notes" ("student_id", "academic_session_id");
-- Create index "studentnote_visibility" to table: "student_notes"
CREATE INDEX "studentnote_visibility" ON "student_notes" ("visibility");
-- Create "student_subject_enrollments" table
CREATE TABLE "student_subject_enrollments" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "is_elective_choice" boolean NOT NULL DEFAULT false, "enrolled_on" date NULL, "dropped_on" date NULL, "status" character varying NOT NULL DEFAULT 'active', "academic_session_id" uuid NOT NULL, "student_id" uuid NOT NULL, "student_enrollment_id" uuid NOT NULL, "subject_offering_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "student_subject_enrollments_ac_4bf4e4cf8e3033764a6fd2e4cd60b9fa" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_subject_enrollments_st_cf911256de5133bdae295ba331803c86" FOREIGN KEY ("student_enrollment_id") REFERENCES "student_enrollments" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_subject_enrollments_students_subject_enrollments" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_subject_enrollments_su_823fa6be0856c5c487be82f894093e61" FOREIGN KEY ("subject_offering_id") REFERENCES "subject_offerings" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "studentsubjectenrollment_stude_dd0c77dec20d97c2bd4ba4364b87cbe7" to table: "student_subject_enrollments"
CREATE UNIQUE INDEX "studentsubjectenrollment_stude_dd0c77dec20d97c2bd4ba4364b87cbe7" ON "student_subject_enrollments" ("student_enrollment_id", "subject_offering_id");
-- Create index "studentsubjectenrollment_student_id_academic_session_id_status" to table: "student_subject_enrollments"
CREATE INDEX "studentsubjectenrollment_student_id_academic_session_id_status" ON "student_subject_enrollments" ("student_id", "academic_session_id", "status");
-- Create index "studentsubjectenrollment_subject_offering_id_status" to table: "student_subject_enrollments"
CREATE INDEX "studentsubjectenrollment_subject_offering_id_status" ON "student_subject_enrollments" ("subject_offering_id", "status");
-- Create "teacher_assignments" table
CREATE TABLE "teacher_assignments" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "role_type" character varying NOT NULL, "is_primary" boolean NOT NULL DEFAULT false, "valid_from" date NULL, "valid_to" date NULL, "status" character varying NOT NULL DEFAULT 'active', "academic_session_id" uuid NOT NULL, "section_id" uuid NOT NULL, "subject_offering_id" uuid NULL, "teacher_id" uuid NOT NULL, "assigned_by" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "teacher_assignments_academic_sessions_teacher_assignments" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "teacher_assignments_persons_assigner" FOREIGN KEY ("assigned_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "teacher_assignments_sections_teacher_assignments" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "teacher_assignments_subject_offerings_teacher_assignments" FOREIGN KEY ("subject_offering_id") REFERENCES "subject_offerings" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "teacher_assignments_teachers_assignments" FOREIGN KEY ("teacher_id") REFERENCES "teachers" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "teacherassignment_academic_session_id_teacher_id_status" to table: "teacher_assignments"
CREATE INDEX "teacherassignment_academic_session_id_teacher_id_status" ON "teacher_assignments" ("academic_session_id", "teacher_id", "status");
-- Create index "teacherassignment_section_id_status" to table: "teacher_assignments"
CREATE INDEX "teacherassignment_section_id_status" ON "teacher_assignments" ("section_id", "status");
-- Create index "teacherassignment_subject_offering_id" to table: "teacher_assignments"
CREATE INDEX "teacherassignment_subject_offering_id" ON "teacher_assignments" ("subject_offering_id");
