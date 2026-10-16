package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
)

type Branch struct{ ent.Schema }

func (Branch) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Branch) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().MaxLen(200),
		field.String("code").NotEmpty().MaxLen(32).Unique().Immutable(),
		field.JSON("address_json", &shared.Address{}).Optional().SchemaType(pgJSONB()),
		field.String("phone").Optional().Nillable().MaxLen(32),
		field.String("email").Optional().Nillable().MaxLen(320),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Branch) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("staff", Staff.Type),
		edge.To("sections", Section.Type),
	}
}

func (Branch) Annotations() []schema.Annotation {
	return []schema.Annotation{table("branches"), entsql.WithComments(true)}
}
