-- Create "rooms" table
CREATE TABLE "rooms" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "room_type" character varying NOT NULL DEFAULT 'classroom', "building" character varying NULL, "floor" character varying NULL, "capacity" bigint NULL, "status" character varying NOT NULL DEFAULT 'active', "branch_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "rooms_branches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "room_branch_id_code" to table: "rooms"
CREATE UNIQUE INDEX "room_branch_id_code" ON "rooms" ("branch_id", "code");
-- Create index "room_branch_id_status" to table: "rooms"
CREATE INDEX "room_branch_id_status" ON "rooms" ("branch_id", "status");
-- Create index "room_room_type" to table: "rooms"
CREATE INDEX "room_room_type" ON "rooms" ("room_type");
-- Modify "sections" table
ALTER TABLE "sections" ADD CONSTRAINT "sections_rooms_sections" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON UPDATE NO ACTION ON DELETE SET NULL;
-- Create index "section_room_id" to table: "sections"
CREATE INDEX "section_room_id" ON "sections" ("room_id");
-- Create "attendance_days" table
CREATE TABLE "attendance_days" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "attendance_date" date NOT NULL, "forenoon_status" character varying NULL, "afternoon_status" character varying NULL, "reason_code" character varying NULL, "remarks" text NULL, "source" character varying NOT NULL DEFAULT 'manual', "marked_at" timestamptz NULL, "student_id" uuid NOT NULL, "academic_session_id" uuid NOT NULL, "section_id" uuid NOT NULL, "marked_by" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "attendance_days_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "attendance_days_persons_marker" FOREIGN KEY ("marked_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "attendance_days_sections_section" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "attendance_days_students_student" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "attendance_days_half_present" CHECK ((forenoon_status IS NOT NULL) OR (afternoon_status IS NOT NULL)));
-- Create index "attendanceday_academic_session_id_attendance_date" to table: "attendance_days"
CREATE INDEX "attendanceday_academic_session_id_attendance_date" ON "attendance_days" ("academic_session_id", "attendance_date");
-- Create index "attendanceday_section_id_attendance_date" to table: "attendance_days"
CREATE INDEX "attendanceday_section_id_attendance_date" ON "attendance_days" ("section_id", "attendance_date");
-- Create index "attendanceday_student_id_academic_session_id" to table: "attendance_days"
CREATE INDEX "attendanceday_student_id_academic_session_id" ON "attendance_days" ("student_id", "academic_session_id");
-- Create index "attendanceday_student_id_attendance_date" to table: "attendance_days"
CREATE UNIQUE INDEX "attendanceday_student_id_attendance_date" ON "attendance_days" ("student_id", "attendance_date");
-- Create "period_schemes" table
CREATE TABLE "period_schemes" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "description" text NULL, "status" character varying NOT NULL DEFAULT 'active', "academic_session_id" uuid NOT NULL, "branch_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "period_schemes_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "period_schemes_branches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "periodscheme_academic_session_id_branch_id_code" to table: "period_schemes"
CREATE UNIQUE INDEX "periodscheme_academic_session_id_branch_id_code" ON "period_schemes" ("academic_session_id", "branch_id", "code");
-- Create index "periodscheme_academic_session_id_branch_id_status" to table: "period_schemes"
CREATE INDEX "periodscheme_academic_session_id_branch_id_status" ON "period_schemes" ("academic_session_id", "branch_id", "status");
-- Create "periods" table
CREATE TABLE "periods" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "sequence" bigint NOT NULL, "kind" character varying NOT NULL DEFAULT 'teaching', "status" character varying NOT NULL DEFAULT 'active', "period_scheme_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "periods_period_schemes_periods" FOREIGN KEY ("period_scheme_id") REFERENCES "period_schemes" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "period_period_scheme_id_code" to table: "periods"
CREATE UNIQUE INDEX "period_period_scheme_id_code" ON "periods" ("period_scheme_id", "code");
-- Create index "period_period_scheme_id_sequence" to table: "periods"
CREATE UNIQUE INDEX "period_period_scheme_id_sequence" ON "periods" ("period_scheme_id", "sequence");
-- Create index "period_period_scheme_id_status" to table: "periods"
CREATE INDEX "period_period_scheme_id_status" ON "periods" ("period_scheme_id", "status");
-- Create "timetables" table
CREATE TABLE "timetables" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "version" bigint NOT NULL DEFAULT 1, "effective_from" date NOT NULL, "effective_to" date NULL, "status" character varying NOT NULL DEFAULT 'draft', "published_at" timestamptz NULL, "period_scheme_id" uuid NOT NULL, "academic_session_id" uuid NOT NULL, "supersedes_id" uuid NULL, "published_by" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "timetables_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "timetables_period_schemes_timetables" FOREIGN KEY ("period_scheme_id") REFERENCES "period_schemes" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "timetables_persons_publisher" FOREIGN KEY ("published_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "timetables_timetables_superseded_by" FOREIGN KEY ("supersedes_id") REFERENCES "timetables" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "timetables_effective_range" CHECK ((effective_to IS NULL) OR (effective_to >= effective_from)));
-- Create index "timetable_academic_session_id_status" to table: "timetables"
CREATE INDEX "timetable_academic_session_id_status" ON "timetables" ("academic_session_id", "status");
-- Create index "timetable_period_scheme_id_effective_from" to table: "timetables"
CREATE UNIQUE INDEX "timetable_period_scheme_id_effective_from" ON "timetables" ("period_scheme_id", "effective_from") WHERE ((status)::text = 'published'::text);
-- Create index "timetable_period_scheme_id_status_effective_from" to table: "timetables"
CREATE INDEX "timetable_period_scheme_id_status_effective_from" ON "timetables" ("period_scheme_id", "status", "effective_from");
-- Create index "timetable_supersedes_id" to table: "timetables"
CREATE INDEX "timetable_supersedes_id" ON "timetables" ("supersedes_id");
-- Create "timetable_slots" table
CREATE TABLE "timetable_slots" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "day_of_week" bigint NOT NULL, "label" character varying NULL, "period_id" uuid NOT NULL, "room_id" uuid NULL, "timetable_id" uuid NOT NULL, "section_id" uuid NOT NULL, "subject_offering_id" uuid NULL, "teacher_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "timetable_slots_periods_timetable_slots" FOREIGN KEY ("period_id") REFERENCES "periods" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "timetable_slots_rooms_timetable_slots" FOREIGN KEY ("room_id") REFERENCES "rooms" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "timetable_slots_sections_section" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "timetable_slots_subject_offerings_subject_offering" FOREIGN KEY ("subject_offering_id") REFERENCES "subject_offerings" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "timetable_slots_teachers_teacher" FOREIGN KEY ("teacher_id") REFERENCES "teachers" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "timetable_slots_timetables_slots" FOREIGN KEY ("timetable_id") REFERENCES "timetables" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "timetable_slots_subject_or_label" CHECK ((subject_offering_id IS NOT NULL) OR (label IS NOT NULL)));
-- Create index "timetableslot_section_id_day_of_week" to table: "timetable_slots"
CREATE INDEX "timetableslot_section_id_day_of_week" ON "timetable_slots" ("section_id", "day_of_week");
-- Create index "timetableslot_subject_offering_id" to table: "timetable_slots"
CREATE INDEX "timetableslot_subject_offering_id" ON "timetable_slots" ("subject_offering_id");
-- Create index "timetableslot_timetable_id_day_of_week_period_id" to table: "timetable_slots"
CREATE INDEX "timetableslot_timetable_id_day_of_week_period_id" ON "timetable_slots" ("timetable_id", "day_of_week", "period_id");
-- Create index "timetableslot_timetable_id_room_id_day_of_week_period_id" to table: "timetable_slots"
CREATE INDEX "timetableslot_timetable_id_room_id_day_of_week_period_id" ON "timetable_slots" ("timetable_id", "room_id", "day_of_week", "period_id");
-- Create index "timetableslot_timetable_id_sec_7fad4d8f0f9363a05ad429995a467e83" to table: "timetable_slots"
CREATE UNIQUE INDEX "timetableslot_timetable_id_sec_7fad4d8f0f9363a05ad429995a467e83" ON "timetable_slots" ("timetable_id", "section_id", "day_of_week", "period_id", "subject_offering_id");
-- Create index "timetableslot_timetable_id_teacher_id_day_of_week_period_id" to table: "timetable_slots"
CREATE INDEX "timetableslot_timetable_id_teacher_id_day_of_week_period_id" ON "timetable_slots" ("timetable_id", "teacher_id", "day_of_week", "period_id");
-- Create "attendance_periods" table
CREATE TABLE "attendance_periods" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "attendance_date" date NOT NULL, "status" character varying NOT NULL, "reason_code" character varying NULL, "remarks" text NULL, "source" character varying NOT NULL DEFAULT 'manual', "marked_at" timestamptz NULL, "student_id" uuid NOT NULL, "academic_session_id" uuid NOT NULL, "subject_offering_id" uuid NOT NULL, "teacher_id" uuid NULL, "marked_by" uuid NULL, "period_id" uuid NOT NULL, "timetable_slot_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "attendance_periods_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "attendance_periods_periods_period_attendance" FOREIGN KEY ("period_id") REFERENCES "periods" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "attendance_periods_persons_marker" FOREIGN KEY ("marked_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "attendance_periods_students_student" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "attendance_periods_subject_offerings_subject_offering" FOREIGN KEY ("subject_offering_id") REFERENCES "subject_offerings" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "attendance_periods_teachers_teacher" FOREIGN KEY ("teacher_id") REFERENCES "teachers" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "attendance_periods_timetable_slots_period_attendance" FOREIGN KEY ("timetable_slot_id") REFERENCES "timetable_slots" ("id") ON UPDATE NO ACTION ON DELETE SET NULL);
-- Create index "attendanceperiod_academic_session_id_attendance_date" to table: "attendance_periods"
CREATE INDEX "attendanceperiod_academic_session_id_attendance_date" ON "attendance_periods" ("academic_session_id", "attendance_date");
-- Create index "attendanceperiod_student_id_academic_session_id" to table: "attendance_periods"
CREATE INDEX "attendanceperiod_student_id_academic_session_id" ON "attendance_periods" ("student_id", "academic_session_id");
-- Create index "attendanceperiod_student_id_attendance_date_period_id" to table: "attendance_periods"
CREATE UNIQUE INDEX "attendanceperiod_student_id_attendance_date_period_id" ON "attendance_periods" ("student_id", "attendance_date", "period_id");
-- Create index "attendanceperiod_subject_offering_id_attendance_date" to table: "attendance_periods"
CREATE INDEX "attendanceperiod_subject_offering_id_attendance_date" ON "attendance_periods" ("subject_offering_id", "attendance_date");
-- Create index "attendanceperiod_timetable_slot_id" to table: "attendance_periods"
CREATE INDEX "attendanceperiod_timetable_slot_id" ON "attendance_periods" ("timetable_slot_id");
-- Create "bell_schedules" table
CREATE TABLE "bell_schedules" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "is_default" boolean NOT NULL DEFAULT false, "status" character varying NOT NULL DEFAULT 'active', "period_scheme_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "bell_schedules_period_schemes_bell_schedules" FOREIGN KEY ("period_scheme_id") REFERENCES "period_schemes" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "bellschedule_period_scheme_id" to table: "bell_schedules"
CREATE UNIQUE INDEX "bellschedule_period_scheme_id" ON "bell_schedules" ("period_scheme_id") WHERE is_default;
-- Create index "bellschedule_period_scheme_id_code" to table: "bell_schedules"
CREATE UNIQUE INDEX "bellschedule_period_scheme_id_code" ON "bell_schedules" ("period_scheme_id", "code");
-- Create "bell_schedule_periods" table
CREATE TABLE "bell_schedule_periods" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "start_minute" bigint NOT NULL, "end_minute" bigint NOT NULL, "bell_schedule_id" uuid NOT NULL, "period_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "bell_schedule_periods_bell_schedules_periods" FOREIGN KEY ("bell_schedule_id") REFERENCES "bell_schedules" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "bell_schedule_periods_periods_bell_schedule_periods" FOREIGN KEY ("period_id") REFERENCES "periods" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "bell_schedule_periods_minute_range" CHECK ((start_minute >= 0) AND (end_minute > start_minute) AND (end_minute <= 1440)));
-- Create index "bellscheduleperiod_bell_schedule_id_period_id" to table: "bell_schedule_periods"
CREATE UNIQUE INDEX "bellscheduleperiod_bell_schedule_id_period_id" ON "bell_schedule_periods" ("bell_schedule_id", "period_id");
-- Create index "bellscheduleperiod_bell_schedule_id_start_minute" to table: "bell_schedule_periods"
CREATE INDEX "bellscheduleperiod_bell_schedule_id_start_minute" ON "bell_schedule_periods" ("bell_schedule_id", "start_minute");
-- Create index "bellscheduleperiod_period_id" to table: "bell_schedule_periods"
CREATE INDEX "bellscheduleperiod_period_id" ON "bell_schedule_periods" ("period_id");
-- Create "calendar_days" table
CREATE TABLE "calendar_days" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "calendar_date" date NOT NULL, "day_type" character varying NOT NULL DEFAULT 'instructional', "forenoon_open" boolean NOT NULL DEFAULT true, "afternoon_open" boolean NOT NULL DEFAULT true, "name" character varying NULL, "notes" text NULL, "academic_session_id" uuid NOT NULL, "branch_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "calendar_days_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "calendar_days_branches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "calendar_days_instructional_open" CHECK (((day_type)::text <> 'instructional'::text) OR forenoon_open OR afternoon_open));
-- Create index "calendarday_academic_session_id_calendar_date" to table: "calendar_days"
CREATE INDEX "calendarday_academic_session_id_calendar_date" ON "calendar_days" ("academic_session_id", "calendar_date");
-- Create index "calendarday_branch_id_calendar_date" to table: "calendar_days"
CREATE UNIQUE INDEX "calendarday_branch_id_calendar_date" ON "calendar_days" ("branch_id", "calendar_date");
-- Create index "calendarday_day_type" to table: "calendar_days"
CREATE INDEX "calendarday_day_type" ON "calendar_days" ("day_type");
-- Create "calendar_day_schedules" table
CREATE TABLE "calendar_day_schedules" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "bell_schedule_id" uuid NOT NULL, "calendar_day_id" uuid NOT NULL, "period_scheme_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "calendar_day_schedules_bell_schedules_calendar_day_schedules" FOREIGN KEY ("bell_schedule_id") REFERENCES "bell_schedules" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "calendar_day_schedules_calendar_days_schedules" FOREIGN KEY ("calendar_day_id") REFERENCES "calendar_days" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "calendar_day_schedules_period_schemes_calendar_day_schedules" FOREIGN KEY ("period_scheme_id") REFERENCES "period_schemes" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "calendardayschedule_bell_schedule_id" to table: "calendar_day_schedules"
CREATE INDEX "calendardayschedule_bell_schedule_id" ON "calendar_day_schedules" ("bell_schedule_id");
-- Create index "calendardayschedule_calendar_day_id_period_scheme_id" to table: "calendar_day_schedules"
CREATE UNIQUE INDEX "calendardayschedule_calendar_day_id_period_scheme_id" ON "calendar_day_schedules" ("calendar_day_id", "period_scheme_id");
-- Create index "calendardayschedule_period_scheme_id" to table: "calendar_day_schedules"
CREATE INDEX "calendardayschedule_period_scheme_id" ON "calendar_day_schedules" ("period_scheme_id");
-- Create "period_scheme_grade_levels" table
CREATE TABLE "period_scheme_grade_levels" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "period_scheme_id" uuid NOT NULL, "grade_level_id" uuid NOT NULL, "academic_session_id" uuid NOT NULL, "branch_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "period_scheme_grade_levels_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "period_scheme_grade_levels_branches_branch" FOREIGN KEY ("branch_id") REFERENCES "branches" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "period_scheme_grade_levels_grade_levels_grade_level" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "period_scheme_grade_levels_period_schemes_grade_levels" FOREIGN KEY ("period_scheme_id") REFERENCES "period_schemes" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "periodschemegradelevel_academi_97775173b44d9ca82e9fdbaebd40b7a7" to table: "period_scheme_grade_levels"
CREATE UNIQUE INDEX "periodschemegradelevel_academi_97775173b44d9ca82e9fdbaebd40b7a7" ON "period_scheme_grade_levels" ("academic_session_id", "branch_id", "grade_level_id");
-- Create index "periodschemegradelevel_period_scheme_id_grade_level_id" to table: "period_scheme_grade_levels"
CREATE UNIQUE INDEX "periodschemegradelevel_period_scheme_id_grade_level_id" ON "period_scheme_grade_levels" ("period_scheme_id", "grade_level_id");
