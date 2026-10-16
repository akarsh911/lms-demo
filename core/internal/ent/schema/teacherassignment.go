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

type TeacherAssignment struct{ ent.Schema }

func (TeacherAssignment) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (TeacherAssignment) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("teacher_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}).Immutable(),
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

func (TeacherAssignment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("academic_session", AcademicSession.Type).Ref("teacher_assignments").
			Field("academic_session_id").Unique().Required().Immutable(),
		edge.From("teacher", Teacher.Type).Ref("assignments").
			Field("teacher_id").Unique().Required().Immutable(),
		edge.From("section", Section.Type).Ref("teacher_assignments").
			Field("section_id").Unique().Required().Immutable(),
		edge.From("subject_offering", SubjectOffering.Type).Ref("teacher_assignments").
			Field("subject_offering_id").Unique(),

		edge.To("assigner", Person.Type).Unique().Field("assigned_by"),
	}
}

func (TeacherAssignment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "teacher_id", "status"),
		index.Fields("section_id", "status"),
		index.Fields("subject_offering_id"),
	}
}

func (TeacherAssignment) Annotations() []schema.Annotation {
	return []schema.Annotation{table("teacher_assignments"), entsql.WithComments(true)}
}
