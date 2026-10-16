package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
)

type Person struct{ ent.Schema }

func (Person) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Person) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("cas_user_id", uuid.UUID{}).
			Unique().
			Immutable().
			Comment("CAS identity. Immutable: re-pointing a person at a different identity is a new person."),

		field.String("first_name").NotEmpty().MaxLen(120),
		field.String("middle_name").Optional().Nillable().MaxLen(120),
		field.String("last_name").Optional().Nillable().MaxLen(120),

		field.String("display_name").NotEmpty().MaxLen(200).
			Comment("Preferred name, shown in the UI. Not derived: people choose it."),

		field.Time("date_of_birth").Optional().Nillable().SchemaType(pgDate()),

		field.String("gender").Optional().Nillable().MaxLen(64),

		field.String("email").Optional().Nillable().MaxLen(320).
			Comment("Domain profile email. NOT the CAS login email."),
		field.String("phone").Optional().Nillable().MaxLen(32).
			Comment("Domain profile phone. NOT the CAS login phone."),

		field.UUID("profile_photo_asset_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("status").Values("active", "inactive").Default("active").
			Comment("Local status. CAS has its own (active|blocked|pending|disabled) which is NOT mirrored here."),

		field.JSON("metadata_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()).
			Comment("Extensible profile data. Anything promoted to a real column should leave here."),
	}
}

func (Person) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("students", Student.Type),
		edge.To("staff_records", Staff.Type),

		edge.To("guardian", Guardian.Type).Unique(),
		edge.To("authored_notes", StudentNote.Type),
	}
}

func (Person) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("last_name", "first_name"),
		index.Fields("status"),
		index.Fields("email"),
	}
}

func (Person) Annotations() []schema.Annotation {
	return []schema.Annotation{table("persons"), entsql.WithComments(true)}
}
