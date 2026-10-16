-- Create "schools" table
CREATE TABLE "schools" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "name" character varying NOT NULL, "legal_name" character varying NULL, "code" character varying NOT NULL, "cas_tenant_id" character varying NULL, "logo_asset_id" uuid NULL, "timezone" character varying NOT NULL DEFAULT 'Asia/Kolkata', "country" character varying NOT NULL DEFAULT 'IN', "state" character varying NULL, "city" character varying NULL, "address_json" jsonb NULL, "phone" character varying NULL, "email" character varying NULL, "website" character varying NULL, "status" character varying NOT NULL DEFAULT 'active', PRIMARY KEY ("id"));
-- Create index "school_status_created_at" to table: "schools"
CREATE INDEX "school_status_created_at" ON "schools" ("status", "created_at");
-- Create index "schools_cas_tenant_id_key" to table: "schools"
CREATE UNIQUE INDEX "schools_cas_tenant_id_key" ON "schools" ("cas_tenant_id");
-- Create index "schools_code_key" to table: "schools"
CREATE UNIQUE INDEX "schools_code_key" ON "schools" ("code");
-- Create index "schools_name_key" to table: "schools"
CREATE UNIQUE INDEX "schools_name_key" ON "schools" ("name");
-- Set comment to column: "name" on table: "schools"
COMMENT ON COLUMN "schools"."name" IS 'Display name.';
-- Set comment to column: "legal_name" on table: "schools"
COMMENT ON COLUMN "schools"."legal_name" IS 'Registered legal name, when it differs from the display name.';
-- Set comment to column: "code" on table: "schools"
COMMENT ON COLUMN "schools"."code" IS 'Short uppercase school code used in URLs and imports. Immutable: it leaks into external systems.';
-- Set comment to column: "cas_tenant_id" on table: "schools"
COMMENT ON COLUMN "schools"."cas_tenant_id" IS 'CAS tenant slug (^[a-z0-9][a-z0-9_-]{0,62}$). Null until the school is registered with CAS.';
-- Set comment to column: "logo_asset_id" on table: "schools"
COMMENT ON COLUMN "schools"."logo_asset_id" IS 'Logo asset. Assets are tenant-local, so this is an unenforced reference, not an FK.';
-- Set comment to column: "timezone" on table: "schools"
COMMENT ON COLUMN "schools"."timezone" IS 'IANA timezone. Drives every local-time rendering for this tenant.';
-- Set comment to column: "country" on table: "schools"
COMMENT ON COLUMN "schools"."country" IS 'ISO 3166-1 alpha-2.';
-- Set comment to column: "address_json" on table: "schools"
COMMENT ON COLUMN "schools"."address_json" IS 'Structured postal address. Display only, never used for lookup.';
-- Set comment to column: "status" on table: "schools"
COMMENT ON COLUMN "schools"."status" IS 'Only an active school may transact.';
-- Create "school_profiles" table
CREATE TABLE "school_profiles" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "profile_type" character varying NOT NULL, "name" character varying NOT NULL DEFAULT 'primary', "key_version" bigint NOT NULL DEFAULT 1, "nonce" bytea NOT NULL, "ciphertext" bytea NOT NULL, "metadata_json" jsonb NULL, "status" character varying NOT NULL DEFAULT 'active', "rotated_at" timestamptz NULL, "school_id" uuid NOT NULL, PRIMARY KEY ("id"), CONSTRAINT "school_profiles_schools_profiles" FOREIGN KEY ("school_id") REFERENCES "schools" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION);
-- Create index "schoolprofile_school_id_profile_type_name" to table: "school_profiles"
CREATE UNIQUE INDEX "schoolprofile_school_id_profile_type_name" ON "school_profiles" ("school_id", "profile_type", "name");
-- Create index "schoolprofile_school_id_profile_type_status" to table: "school_profiles"
CREATE INDEX "schoolprofile_school_id_profile_type_status" ON "school_profiles" ("school_id", "profile_type", "status");
-- Set comment to column: "profile_type" on table: "school_profiles"
COMMENT ON COLUMN "school_profiles"."profile_type" IS 'What kind of thing these credentials open.';
-- Set comment to column: "name" on table: "school_profiles"
COMMENT ON COLUMN "school_profiles"."name" IS 'Lets a school hold several of a kind: primary, replica, reporting, legacy-2019.';
-- Set comment to column: "key_version" on table: "school_profiles"
COMMENT ON COLUMN "school_profiles"."key_version" IS 'Which master key encrypted this row. Enables rolling key rotation with no flag day.';
-- Set comment to column: "nonce" on table: "school_profiles"
COMMENT ON COLUMN "school_profiles"."nonce" IS 'AES-GCM nonce. Unique per encryption, never reused.';
-- Set comment to column: "ciphertext" on table: "school_profiles"
COMMENT ON COLUMN "school_profiles"."ciphertext" IS 'AES-256-GCM of a JSON credential blob. Never logged, never returned by the API.';
-- Set comment to column: "metadata_json" on table: "school_profiles"
COMMENT ON COLUMN "school_profiles"."metadata_json" IS 'Non-secret connection hints only: host, port, database, region, bucket. NEVER a password.';
-- Set comment to column: "rotated_at" on table: "school_profiles"
COMMENT ON COLUMN "school_profiles"."rotated_at" IS 'When these credentials were last re-encrypted or replaced.';
-- Set comment to column: "school_id" on table: "school_profiles"
COMMENT ON COLUMN "school_profiles"."school_id" IS 'Owning school. A profile never moves between schools.';
