-- Create "outbox_messages" table
CREATE TABLE "outbox_messages" ("id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "channel" character varying NOT NULL DEFAULT 'email', "template_key" character varying NOT NULL, "recipient_hash" character varying NOT NULL, "recipient_hash_version" bigint NOT NULL DEFAULT 1, "recipient_redacted" character varying NOT NULL, "payload_key_version" bigint NULL, "payload_nonce" bytea NULL, "payload_ciphertext" bytea NULL, "status" character varying NOT NULL DEFAULT 'pending', "attempt_count" bigint NOT NULL DEFAULT 0, "max_attempts" bigint NOT NULL DEFAULT 5, "next_attempt_at" timestamptz NOT NULL DEFAULT now(), "expires_at" timestamptz NULL, "leased_by" character varying NULL, "lease_expires_at" timestamptz NULL, "last_attempt_at" timestamptz NULL, "completed_at" timestamptz NULL, "sender_kind" character varying NULL, "provider_message_id" character varying NULL, "failure_code" character varying NULL, "idempotency_key" character varying NULL, "school_id" uuid NULL, PRIMARY KEY ("id"), CONSTRAINT "outbox_messages_schools_school" FOREIGN KEY ("school_id") REFERENCES "schools" ("id") ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT "outbox_messages_failure_code_when_failed" CHECK (((status)::text <> 'failed'::text) OR (failure_code IS NOT NULL)), CONSTRAINT "outbox_messages_payload_absent_when_terminal" CHECK (((status)::text <> ALL ((ARRAY['sent'::character varying, 'failed'::character varying])::text[])) OR ((payload_ciphertext IS NULL) AND (payload_nonce IS NULL) AND (payload_key_version IS NULL))), CONSTRAINT "outbox_messages_payload_parts_together" CHECK (((payload_ciphertext IS NULL) AND (payload_nonce IS NULL) AND (payload_key_version IS NULL)) OR ((payload_ciphertext IS NOT NULL) AND (payload_nonce IS NOT NULL) AND (payload_key_version IS NOT NULL))));
-- Create index "outboxmessage_idempotency_key" to table: "outbox_messages"
CREATE UNIQUE INDEX "outboxmessage_idempotency_key" ON "outbox_messages" ("idempotency_key");
-- Create index "outboxmessage_lease_expires_at" to table: "outbox_messages"
CREATE INDEX "outboxmessage_lease_expires_at" ON "outbox_messages" ("lease_expires_at") WHERE ((status)::text = 'sending'::text);
-- Create index "outboxmessage_next_attempt_at" to table: "outbox_messages"
CREATE INDEX "outboxmessage_next_attempt_at" ON "outbox_messages" ("next_attempt_at") WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'retrying'::character varying])::text[]));
-- Create index "outboxmessage_recipient_hash_created_at" to table: "outbox_messages"
CREATE INDEX "outboxmessage_recipient_hash_created_at" ON "outbox_messages" ("recipient_hash", "created_at");
-- Create index "outboxmessage_school_id_created_at" to table: "outbox_messages"
CREATE INDEX "outboxmessage_school_id_created_at" ON "outbox_messages" ("school_id", "created_at") WHERE ((sender_kind)::text = 'platform_fallback'::text);
-- Create index "outboxmessage_school_id_status_created_at" to table: "outbox_messages"
CREATE INDEX "outboxmessage_school_id_status_created_at" ON "outbox_messages" ("school_id", "status", "created_at");
-- Set comment to column: "channel" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."channel" IS 'Transport family. Only email has a sender today; the other values reserve the shape so adding one is a sender change, not a migration.';
-- Set comment to column: "template_key" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."template_key" IS 'Which template to render. The rendered output is never stored here.';
-- Set comment to column: "recipient_hash" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."recipient_hash" IS 'HMAC-SHA256 of the normalised recipient, hex. Survives the send. Plain hashing is dictionary-reversible over a known population, so this is keyed, never a bare digest.';
-- Set comment to column: "recipient_hash_version" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."recipient_hash_version" IS 'Which pepper produced recipient_hash. Rotating it makes older rows stop matching newer ones; the version makes that legible instead of silent.';
-- Set comment to column: "recipient_redacted" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."recipient_redacted" IS 'Human-readable audit form, e.g. a***@example.com. The domain is kept deliberately: whole-domain delivery failures are the common operational question.';
-- Set comment to column: "payload_key_version" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."payload_key_version" IS 'Which master key encrypted the payload. Null once the payload is purged.';
-- Set comment to column: "payload_nonce" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."payload_nonce" IS 'AES-GCM nonce for the payload. Null once the payload is purged.';
-- Set comment to column: "payload_ciphertext" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."payload_ciphertext" IS 'AES-256-GCM of the in-flight payload: real recipient address, template variables, rendered body. Nulled in the same statement that moves the row to a terminal status, so the blast radius is what is queued, not what was ever sent.';
-- Set comment to column: "status" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."status" IS 'pending and retrying are claimable; sending is leased; sent and failed are terminal and carry no payload.';
-- Set comment to column: "attempt_count" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."attempt_count" IS 'Sends attempted so far.';
-- Set comment to column: "max_attempts" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."max_attempts" IS 'Retry budget, a property of the message rather than the sender. A fee reminder is worth five tries; a one-time code is worth one, because a code delivered late is worse than a code not delivered.';
-- Set comment to column: "next_attempt_at" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."next_attempt_at" IS 'Earliest time this row may be claimed. Also the scheduling handle for deferred mail.';
-- Set comment to column: "expires_at" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."expires_at" IS 'After this the message is abandoned rather than sent. Bounds how long a payload can sit encrypted in the queue.';
-- Set comment to column: "leased_by" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."leased_by" IS 'Identifier of the sender instance holding this row.';
-- Set comment to column: "lease_expires_at" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."lease_expires_at" IS 'When the lease lapses. A sender that crashes mid-send leaves rows that become claimable again on their own, with no operator step.';
-- Set comment to column: "last_attempt_at" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."last_attempt_at" IS 'When the most recent attempt started.';
-- Set comment to column: "completed_at" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."completed_at" IS 'When the row reached sent or failed. Non-null here means the payload columns are null; a table check enforces it.';
-- Set comment to column: "sender_kind" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."sender_kind" IS 'Which credentials carried the last attempt. A school quietly living on the platform fallback forever is the failure mode of having a fallback, so it has to be queryable.';
-- Set comment to column: "provider_message_id" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."provider_message_id" IS 'Provider-assigned id, for correlating with provider-side logs.';
-- Set comment to column: "failure_code" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."failure_code" IS 'Normalised reason, never the provider''s own text. Provider rejections quote the message they rejected, so a free-text column here would re-persist the token the payload purge just removed.';
-- Set comment to column: "idempotency_key" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."idempotency_key" IS 'Caller-supplied dedupe key, namespaced by the caller. Null skips deduplication, since Postgres does not collide nulls in a unique index.';
-- Set comment to column: "school_id" on table: "outbox_messages"
COMMENT ON COLUMN "outbox_messages"."school_id" IS 'Owning school, and the school whose SMTP profile should send this. Null for platform mail that belongs to no tenant: internal alerts, school-creation notices.';
