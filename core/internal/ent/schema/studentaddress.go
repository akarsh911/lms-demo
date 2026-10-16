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

type StudentAddress struct{ ent.Schema }

func (StudentAddress) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentAddress) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.Enum("address_type").Values("home", "hostel", "other").Default("home"),
		field.JSON("address_json", &shared.Address{}).SchemaType(pgJSONB()),
		field.Bool("is_primary").Default(false).
			StructTag(`json:"is_primary"`),
		field.Time("valid_from").Optional().Nillable().SchemaType(pgDate()),
		field.Time("valid_to").Optional().Nillable().SchemaType(pgDate()),
	}
}

func (StudentAddress) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("student", Student.Type).Ref("addresses").
			Field("student_id").Unique().Required().Immutable(),
	}
}

func (StudentAddress) Indexes() []ent.Index {
	return []ent.Index{index.Fields("student_id", "address_type")}
}

func (StudentAddress) Annotations() []schema.Annotation {
	return []schema.Annotation{table("student_addresses"), entsql.WithComments(true)}
}
