-- Create "achievements" table
CREATE TABLE "achievements" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "code" character varying NOT NULL, "description" text NULL, "category" character varying NOT NULL DEFAULT 'academic', "tier" character varying NULL, "points" bigint NULL, "award_mode" character varying NOT NULL DEFAULT 'manual', "criteria_json" jsonb NULL, "status" character varying NOT NULL DEFAULT 'active', "badge_asset_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "achievements_assets_badge_asset" FOREIGN KEY ("badge_asset_id") REFERENCES "assets" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "achievements_auto_rule_has_criteria" CHECK (((award_mode)::text <> 'auto_rule'::text) OR (criteria_json IS NOT NULL)));
-- Create index "achievement_badge_asset_id" to table: "achievements"
CREATE INDEX "achievement_badge_asset_id" ON "achievements" ("badge_asset_id");
-- Create index "achievement_category_status" to table: "achievements"
CREATE INDEX "achievement_category_status" ON "achievements" ("category", "status");
-- Create index "achievements_code_key" to table: "achievements"
CREATE UNIQUE INDEX "achievements_code_key" ON "achievements" ("code");
-- Create "praises" table
CREATE TABLE "praises" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "recipient_type" character varying NOT NULL, "recipient_id" uuid NOT NULL, "category" character varying NULL, "message" text NOT NULL, "visibility" character varying NOT NULL DEFAULT 'class_only', "status" character varying NOT NULL DEFAULT 'active', "given_by_person_id" uuid NOT NULL, "academic_session_id" uuid NOT NULL, "related_achievement_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "praises_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "praises_achievements_related_achievement" FOREIGN KEY ("related_achievement_id") REFERENCES "achievements" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "praises_persons_giver" FOREIGN KEY ("given_by_person_id") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "praise_academic_session_id" to table: "praises"
CREATE INDEX "praise_academic_session_id" ON "praises" ("academic_session_id");
-- Create index "praise_given_by_person_id_created_at" to table: "praises"
CREATE INDEX "praise_given_by_person_id_created_at" ON "praises" ("given_by_person_id", "created_at");
-- Create index "praise_recipient_type_recipient_id_created_at" to table: "praises"
CREATE INDEX "praise_recipient_type_recipient_id_created_at" ON "praises" ("recipient_type", "recipient_id", "created_at");
-- Create index "praise_related_achievement_id" to table: "praises"
CREATE INDEX "praise_related_achievement_id" ON "praises" ("related_achievement_id");
-- Create index "praise_status_visibility" to table: "praises"
CREATE INDEX "praise_status_visibility" ON "praises" ("status", "visibility");
-- Create "praise_reactions" table
CREATE TABLE "praise_reactions" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "reaction_type" character varying NOT NULL, "praise_id" uuid NOT NULL, "reactor_person_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "praise_reactions_persons_reactor" FOREIGN KEY ("reactor_person_id") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "praise_reactions_praises_reactions" FOREIGN KEY ("praise_id") REFERENCES "praises" ("id") ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "praisereaction_praise_id_reactor_person_id_reaction_type" to table: "praise_reactions"
CREATE UNIQUE INDEX "praisereaction_praise_id_reactor_person_id_reaction_type" ON "praise_reactions" ("praise_id", "reactor_person_id", "reaction_type");
-- Create index "praisereaction_reactor_person_id" to table: "praise_reactions"
CREATE INDEX "praisereaction_reactor_person_id" ON "praise_reactions" ("reactor_person_id");
-- Create "student_achievements" table
CREATE TABLE "student_achievements" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "awarded_at" timestamptz NOT NULL DEFAULT now(), "source_type" character varying NULL, "source_id" uuid NULL, "evidence_json" jsonb NULL, "is_featured" boolean NOT NULL DEFAULT false, "display_order" bigint NULL, "status" character varying NOT NULL DEFAULT 'awarded', "achievement_id" uuid NOT NULL, "student_id" uuid NOT NULL, "academic_session_id" uuid NOT NULL, "awarded_by" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "student_achievements_academic_sessions_academic_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_achievements_achievements_awards" FOREIGN KEY ("achievement_id") REFERENCES "achievements" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_achievements_persons_awarder" FOREIGN KEY ("awarded_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "student_achievements_students_student" FOREIGN KEY ("student_id") REFERENCES "students" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "student_achievements_evidence_paired" CHECK ((source_type IS NULL) = (source_id IS NULL)), CONSTRAINT "student_achievements_order_featured" CHECK ((display_order IS NULL) OR is_featured));
-- Create index "studentachievement_academic_session_id_achievement_id" to table: "student_achievements"
CREATE INDEX "studentachievement_academic_session_id_achievement_id" ON "student_achievements" ("academic_session_id", "achievement_id");
-- Create index "studentachievement_achievement_id" to table: "student_achievements"
CREATE INDEX "studentachievement_achievement_id" ON "student_achievements" ("achievement_id");
-- Create index "studentachievement_awarded_by" to table: "student_achievements"
CREATE INDEX "studentachievement_awarded_by" ON "student_achievements" ("awarded_by");
-- Create index "studentachievement_status_awarded_at" to table: "student_achievements"
CREATE INDEX "studentachievement_status_awarded_at" ON "student_achievements" ("status", "awarded_at");
-- Create index "studentachievement_student_id__3732db05aad2bb12678dc2666f8ef240" to table: "student_achievements"
CREATE UNIQUE INDEX "studentachievement_student_id__3732db05aad2bb12678dc2666f8ef240" ON "student_achievements" ("student_id", "achievement_id", "academic_session_id");
-- Create index "studentachievement_student_id_is_featured" to table: "student_achievements"
CREATE INDEX "studentachievement_student_id_is_featured" ON "student_achievements" ("student_id", "is_featured");
