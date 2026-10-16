package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
)

type SchoolProfile struct {
	ent.Schema
}

func (SchoolProfile) Mixin() []ent.Mixin {
	return []ent.Mixin{BaseMixin{}}
}

func (SchoolProfile) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("school_id", uuid.UUID{}).
			Immutable().
			Comment("Owning school. A profile never moves between schools."),

		field.Enum("profile_type").
			Values("postgres", "mysql", "s3", "smtp").
			Comment("What kind of thing these credentials open."),

		field.String("name").
			Default("primary").
			NotEmpty().
			MaxLen(64).
			Comment("Lets a school hold several of a kind: primary, replica, reporting, legacy-2019."),

		field.Int("key_version").
			Default(1).
			Positive().
			Comment("Which master key encrypted this row. Enables rolling key rotation with no flag day."),

		field.Bytes("nonce").
			MinLen(12).
			MaxLen(12).
			Sensitive().
			Comment("AES-GCM nonce. Unique per encryption, never reused."),

		field.Bytes("ciphertext").
			NotEmpty().
			Sensitive().
			Comment("AES-256-GCM of a JSON credential blob. Never logged, never returned by the API."),

		field.JSON("metadata_json", shared.Metadata{}).
			Optional().
			SchemaType(map[string]string{dialect.Postgres: "jsonb"}).
			Comment("Non-secret connection hints only: host, port, database, region, bucket. NEVER a password."),

		field.Enum("status").
			Values("active", "inactive").
			Default("active"),

		field.Time("rotated_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("When these credentials were last re-encrypted or replaced."),
	}
}

func (SchoolProfile) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("school", School.Type).
			Ref("profiles").
			Field("school_id").
			Unique().
			Required().
			Immutable(),
	}
}

func (SchoolProfile) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("school_id", "profile_type", "name").Unique(),
		index.Fields("school_id", "profile_type", "status"),
	}
}

func (SchoolProfile) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("school_profiles"),
		entsql.WithComments(true),
	}
}
