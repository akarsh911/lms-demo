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

type Student struct{ ent.Schema }

func (Student) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Student) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("person_id", uuid.UUID{}).Immutable(),
		field.String("admission_number").NotEmpty().MaxLen(64).Unique().Immutable(),
		field.String("student_code").Optional().Nillable().MaxLen(64).Unique(),
		field.Time("admission_date").Optional().Nillable().SchemaType(pgDate()),
		field.Enum("status").Values("active", "alumni", "withdrawn").Default("active"),
		field.Time("withdrawal_date").Optional().Nillable().SchemaType(pgDate()),
		field.String("withdrawal_reason").Optional().Nillable().MaxLen(500),
		field.UUID("house_id", uuid.UUID{}).Optional().Nillable(),
	}
}

func (Student) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("person", Person.Type).Ref("students").
			Field("person_id").Unique().Required().Immutable(),
		edge.To("house", SchoolHouse.Type).Unique().Field("house_id"),

		edge.To("addresses", StudentAddress.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("enrollments", StudentEnrollment.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("subject_enrollments", StudentSubjectEnrollment.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("notes", StudentNote.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("assignments", StudentAssignment.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("documents", StudentDocument.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("guardian_links", StudentGuardian.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (Student) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("status"),
		index.Fields("house_id"),
	}
}

func (Student) Annotations() []schema.Annotation {
	return []schema.Annotation{table("students"), entsql.WithComments(true)}
}
