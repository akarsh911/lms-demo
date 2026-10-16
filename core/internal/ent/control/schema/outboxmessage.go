package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

type OutboxMessage struct {
	ent.Schema
}

func (OutboxMessage) Mixin() []ent.Mixin {
	return []ent.Mixin{BaseMixin{}}
}

func (OutboxMessage) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("school_id", uuid.UUID{}).
			Optional().
			Nillable().
			Immutable().
			Comment("Owning school, and the school whose SMTP profile should send this. Null for platform mail that belongs to no tenant: internal alerts, school-creation notices."),

		field.Enum("channel").
			Values("email", "sms", "whatsapp").
			Default("email").
			Immutable().
			Comment("Transport family. Only email has a sender today; the other values reserve the shape so adding one is a sender change, not a migration."),

		field.String("template_key").
			NotEmpty().
			MaxLen(128).
			Immutable().
			Comment("Which template to render. The rendered output is never stored here."),

		field.String("recipient_hash").
			NotEmpty().
			MaxLen(64).
			Immutable().
			Comment("HMAC-SHA256 of the normalised recipient, hex. Survives the send. Plain hashing is dictionary-reversible over a known population, so this is keyed, never a bare digest."),

		field.Int("recipient_hash_version").
			Default(1).
			Positive().
			Immutable().
			Comment("Which pepper produced recipient_hash. Rotating it makes older rows stop matching newer ones; the version makes that legible instead of silent."),

		field.String("recipient_redacted").
			NotEmpty().
			MaxLen(320).
			Immutable().
			Comment("Human-readable audit form, e.g. a***@example.com. The domain is kept deliberately: whole-domain delivery failures are the common operational question."),

		field.Int("payload_key_version").
			Optional().
			Nillable().
			Positive().
			Comment("Which master key encrypted the payload. Null once the payload is purged."),

		field.Bytes("payload_nonce").
			Optional().
			MinLen(12).
			MaxLen(12).
			Sensitive().
			Comment("AES-GCM nonce for the payload. Null once the payload is purged."),

		field.Bytes("payload_ciphertext").
			Optional().
			Sensitive().
			Comment("AES-256-GCM of the in-flight payload: real recipient address, template variables, rendered body. Nulled in the same statement that moves the row to a terminal status, so the blast radius is what is queued, not what was ever sent."),

		field.Enum("status").
			Values("pending", "sending", "sent", "retrying", "failed").
			Default("pending").
			Comment("pending and retrying are claimable; sending is leased; sent and failed are terminal and carry no payload."),

		field.Int("attempt_count").
			Default(0).
			NonNegative().
			Comment("Sends attempted so far."),

		field.Int("max_attempts").
			Default(5).
			Positive().
			Immutable().
			Comment("Retry budget, a property of the message rather than the sender. A fee reminder is worth five tries; a one-time code is worth one, because a code delivered late is worse than a code not delivered."),

		field.Time("next_attempt_at").
			Default(time.Now).
			Annotations(entsql.Default("now()")).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("Earliest time this row may be claimed. Also the scheduling handle for deferred mail."),

		field.Time("expires_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("After this the message is abandoned rather than sent. Bounds how long a payload can sit encrypted in the queue."),

		field.String("leased_by").
			Optional().
			Nillable().
			MaxLen(128).
			Comment("Identifier of the sender instance holding this row."),

		field.Time("lease_expires_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("When the lease lapses. A sender that crashes mid-send leaves rows that become claimable again on their own, with no operator step."),

		field.Time("last_attempt_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("When the most recent attempt started."),

		field.Time("completed_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("When the row reached sent or failed. Non-null here means the payload columns are null; a table check enforces it."),

		field.Enum("sender_kind").
			Values("school_smtp", "platform_fallback").
			Optional().
			Nillable().
			Comment("Which credentials carried the last attempt. A school quietly living on the platform fallback forever is the failure mode of having a fallback, so it has to be queryable."),

		field.String("provider_message_id").
			Optional().
			Nillable().
			MaxLen(255).
			Comment("Provider-assigned id, for correlating with provider-side logs."),

		field.Enum("failure_code").
			Values(
				"invalid_recipient",
				"mailbox_unavailable",
				"rejected_by_provider",
				"sender_auth_failed",
				"sender_unavailable",
				"sender_not_configured",
				"no_reply_address",
				"rate_limited",
				"timeout",
				"expired",
				"internal_error",
			).
			Optional().
			Nillable().
			Comment("Normalised reason, never the provider's own text. Provider rejections quote the message they rejected, so a free-text column here would re-persist the token the payload purge just removed."),

		field.String("idempotency_key").
			Optional().
			Nillable().
			MaxLen(128).
			Immutable().
			Comment("Caller-supplied dedupe key, namespaced by the caller. Null skips deduplication, since Postgres does not collide nulls in a unique index."),
	}
}

func (OutboxMessage) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("school", School.Type).
			Field("school_id").
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.Cascade)).
			Comment("Unidirectional: the School schema is not modified by the outbox."),
	}
}

func (OutboxMessage) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("next_attempt_at").
			Annotations(entsql.IndexWhere("status = 'pending' OR status = 'retrying'")),

		index.Fields("lease_expires_at").
			Annotations(entsql.IndexWhere("status = 'sending'")),

		index.Fields("school_id", "status", "created_at"),

		index.Fields("recipient_hash", "created_at"),

		index.Fields("idempotency_key").Unique(),

		index.Fields("school_id", "created_at").
			Annotations(entsql.IndexWhere("sender_kind = 'platform_fallback'")),
	}
}

func (OutboxMessage) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("outbox_messages"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"outbox_messages_payload_absent_when_terminal": "status NOT IN ('sent', 'failed') OR (payload_ciphertext IS NULL AND payload_nonce IS NULL AND payload_key_version IS NULL)",
			"outbox_messages_payload_parts_together":       "(payload_ciphertext IS NULL AND payload_nonce IS NULL AND payload_key_version IS NULL) OR (payload_ciphertext IS NOT NULL AND payload_nonce IS NOT NULL AND payload_key_version IS NOT NULL)",
			"outbox_messages_failure_code_when_failed":     "status <> 'failed' OR failure_code IS NOT NULL",
		}),
	}
}
