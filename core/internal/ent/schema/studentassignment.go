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

type StudentAssignment struct{ ent.Schema }

func (StudentAssignment) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentAssignment) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("student_id", uuid.UUID{}).Immutable(),

		field.UUID("section_id", uuid.UUID{}).Optional().Nillable().Immutable(),

		field.UUID("subject_offering_id", uuid.UUID{}).Optional().Nillable(),

		field.String("role_type").NotEmpty().MaxLen(64),

		field.Bool("is_primary").Default(false),

		field.Time("valid_from").Optional().Nillable().SchemaType(pgDate()),
		field.Time("valid_to").Optional().Nillable().SchemaType(pgDate()),

		field.Enum("status").
			Values("active", "revoked", "completed").
			Default("active"),

		field.UUID("assigned_by", uuid.UUID{}).Optional().Nillable(),
	}
}

func (StudentAssignment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("academic_session", AcademicSession.Type).Ref("student_assignments").
			Field("academic_session_id").Unique().Required().Immutable(),
		edge.From("student", Student.Type).Ref("assignments").
			Field("student_id").Unique().Required().Immutable(),
		edge.From("section", Section.Type).Ref("student_assignments").
			Field("section_id").Unique().Immutable(),
		edge.From("subject_offering", SubjectOffering.Type).Ref("student_assignments").
			Field("subject_offering_id").Unique(),

		edge.To("assigner", Person.Type).Unique().Field("assigned_by"),
	}
}

func (StudentAssignment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "student_id", "status"),
		index.Fields("section_id", "status"),
		index.Fields("role_type", "status"),
	}
}

func (StudentAssignment) Annotations() []schema.Annotation {
	return []schema.Annotation{table("student_assignments"), entsql.WithComments(true)}
}
