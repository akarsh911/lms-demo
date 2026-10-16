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

type School struct {
	ent.Schema
}

func (School) Mixin() []ent.Mixin {
	return []ent.Mixin{BaseMixin{}}
}

func (School) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").
			NotEmpty().
			MaxLen(200).
			Unique().
			Comment("Display name."),

		field.String("legal_name").
			Optional().
			Nillable().
			MaxLen(300).
			Comment("Registered legal name, when it differs from the display name."),

		field.String("code").
			NotEmpty().
			MaxLen(32).
			Unique().
			Immutable().
			Comment("Short uppercase school code used in URLs and imports. Immutable: it leaks into external systems."),

		field.String("cas_tenant_id").
			Optional().
			Nillable().
			MaxLen(63).
			Unique().
			Comment("CAS tenant slug (^[a-z0-9][a-z0-9_-]{0,62}$). Null until the school is registered with CAS."),

		field.UUID("logo_asset_id", uuid.UUID{}).
			Optional().
			Nillable().
			Comment("Logo asset. Assets are tenant-local, so this is an unenforced reference, not an FK."),

		field.String("timezone").
			Default("Asia/Kolkata").
			NotEmpty().
			Comment("IANA timezone. Drives every local-time rendering for this tenant."),

		field.String("country").
			Default("IN").
			MinLen(2).
			MaxLen(2).
			Comment("ISO 3166-1 alpha-2."),

		field.String("state").Optional().Nillable().MaxLen(120),
		field.String("city").Optional().Nillable().MaxLen(120),

		field.JSON("address_json", &shared.Address{}).
			Optional().
			SchemaType(map[string]string{dialect.Postgres: "jsonb"}).
			Comment("Structured postal address. Display only, never used for lookup."),

		field.String("phone").Optional().Nillable().MaxLen(32),
		field.String("email").Optional().Nillable().MaxLen(320),
		field.String("website").Optional().Nillable().MaxLen(500),

		field.Enum("status").
			Values("active", "suspended", "closed").
			Default("active").
			Comment("Only an active school may transact."),
	}
}

func (School) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("profiles", SchoolProfile.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)).
			Comment("Encrypted credentials for this school's database, object storage and mail."),
	}
}

func (School) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("status", "created_at"),
	}
}

func (School) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("schools"),
		entsql.WithComments(true),
	}
}
