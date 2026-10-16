-- Create "assets" table
CREATE TABLE "assets" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "storage_key" character varying NOT NULL, "file_name" character varying NOT NULL, "mime_type" character varying NOT NULL, "size_bytes" bigint NOT NULL, "sha256" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "metadata_json" jsonb NULL, "uploaded_by" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "assets_persons_uploader" FOREIGN KEY ("uploaded_by") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE SET NULL);
-- Create index "asset_sha256" to table: "assets"
CREATE INDEX "asset_sha256" ON "assets" ("sha256");
-- Create index "asset_status" to table: "assets"
CREATE INDEX "asset_status" ON "assets" ("status");
-- Create index "asset_uploaded_by" to table: "assets"
CREATE INDEX "asset_uploaded_by" ON "assets" ("uploaded_by");
-- Create index "assets_storage_key_key" to table: "assets"
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets" ("storage_key");
-- Create "content_items" table
CREATE TABLE "content_items" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "kind" character varying NOT NULL DEFAULT 'document', "title" character varying NOT NULL, "description" text NULL, "language" character varying NULL, "author" character varying NULL, "publisher" character varying NULL, "isbn" character varying NULL, "audience" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'draft', "index_status" character varying NOT NULL DEFAULT 'none', "indexed_sha256" character varying NULL, "indexed_at" timestamptz NULL, "engine_document_id" character varying NULL, "metadata_json" jsonb NULL, "asset_id" uuid NULL, "subject_id" uuid NULL, "grade_level_id" uuid NULL, "section_id" uuid NULL, "subject_offering_id" uuid NULL, "owner_person_id" uuid NOT NULL, "supersedes_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "content_items_assets_content_items" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON UPDATE NO ACTION ON DELETE RESTRICT, CONSTRAINT "content_items_content_items_superseded_by" FOREIGN KEY ("supersedes_id") REFERENCES "content_items" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "content_items_grade_levels_grade_level" FOREIGN KEY ("grade_level_id") REFERENCES "grade_levels" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "content_items_persons_owner" FOREIGN KEY ("owner_person_id") REFERENCES "persons" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION, CONSTRAINT "content_items_sections_section" FOREIGN KEY ("section_id") REFERENCES "sections" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "content_items_subject_offerings_subject_offering" FOREIGN KEY ("subject_offering_id") REFERENCES "subject_offerings" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "content_items_subjects_subject" FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT "content_items_audience_scope" CHECK ((((audience)::text = 'grade'::text) AND (grade_level_id IS NOT NULL) AND (section_id IS NULL) AND (subject_offering_id IS NULL)) OR (((audience)::text = 'section'::text) AND (section_id IS NOT NULL) AND (grade_level_id IS NULL) AND (subject_offering_id IS NULL)) OR (((audience)::text = 'offering'::text) AND (subject_offering_id IS NOT NULL) AND (grade_level_id IS NULL) AND (section_id IS NULL)) OR (((audience)::text = ANY ((ARRAY['school'::character varying, 'owner'::character varying])::text[])) AND (grade_level_id IS NULL) AND (section_id IS NULL) AND (subject_offering_id IS NULL))));
-- Create index "content_items_engine_document_id_key" to table: "content_items"
CREATE UNIQUE INDEX "content_items_engine_document_id_key" ON "content_items" ("engine_document_id");
-- Create index "contentitem_audience" to table: "content_items"
CREATE INDEX "contentitem_audience" ON "content_items" ("audience");
-- Create index "contentitem_index_status" to table: "content_items"
CREATE INDEX "contentitem_index_status" ON "content_items" ("index_status");
-- Create index "contentitem_isbn" to table: "content_items"
CREATE INDEX "contentitem_isbn" ON "content_items" ("isbn");
-- Create index "contentitem_kind_status" to table: "content_items"
CREATE INDEX "contentitem_kind_status" ON "content_items" ("kind", "status");
-- Create index "contentitem_owner_person_id" to table: "content_items"
CREATE INDEX "contentitem_owner_person_id" ON "content_items" ("owner_person_id");
-- Create index "contentitem_subject_id_grade_level_id_status" to table: "content_items"
CREATE INDEX "contentitem_subject_id_grade_level_id_status" ON "content_items" ("subject_id", "grade_level_id", "status");
