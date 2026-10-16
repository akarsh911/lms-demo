package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
)

type Staff struct{ ent.Schema }

func (Staff) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Staff) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("person_id", uuid.UUID{}).Immutable(),
		field.String("employee_code").NotEmpty().MaxLen(64).Unique().Immutable(),
		field.UUID("department_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("branch_id", uuid.UUID{}).Optional().Nillable(),
		field.String("designation").Optional().Nillable().MaxLen(120),
		field.Enum("employment_type").
			Values("full_time", "part_time", "contract", "visiting", "intern").
			Optional().Nillable(),
		field.Time("joining_date").Optional().Nillable().SchemaType(pgDate()),
		field.Time("leaving_date").Optional().Nillable().SchemaType(pgDate()),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Staff) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("person", Person.Type).Ref("staff_records").
			Field("person_id").Unique().Required().Immutable(),
		edge.From("branch", Branch.Type).Ref("staff").
			Field("branch_id").Unique(),
		edge.To("teacher", Teacher.Type).Unique(),
	}
}

func (Staff) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("status"),
		index.Fields("branch_id"),
		index.Fields("department_id"),
	}
}

func (Staff) Annotations() []schema.Annotation {
	return []schema.Annotation{table("staff"), entsql.WithComments(true)}
}
