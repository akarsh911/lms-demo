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

type Teacher struct{ ent.Schema }

func (Teacher) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Teacher) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("staff_id", uuid.UUID{}).Unique().Immutable(),
		field.String("teacher_code").Optional().Nillable().MaxLen(64).Unique(),
		field.JSON("qualification_json", []shared.Qualification{}).Optional().SchemaType(pgJSONB()),
		field.String("specialization").Optional().Nillable().MaxLen(200),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Teacher) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("staff", Staff.Type).Ref("teacher").
			Field("staff_id").Unique().Required().Immutable(),
		edge.To("assignments", TeacherAssignment.Type),
	}
}

func (Teacher) Indexes() []ent.Index {
	return []ent.Index{index.Fields("status")}
}

func (Teacher) Annotations() []schema.Annotation {
	return []schema.Annotation{table("teachers"), entsql.WithComments(true)}
}
