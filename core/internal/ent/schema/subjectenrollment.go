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

type StudentSubjectEnrollment struct{ ent.Schema }

func (StudentSubjectEnrollment) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentSubjectEnrollment) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_enrollment_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_offering_id", uuid.UUID{}).Immutable(),

		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),

		field.Bool("is_elective_choice").Default(false),

		field.Time("enrolled_on").Optional().Nillable().SchemaType(pgDate()),
		field.Time("dropped_on").Optional().Nillable().SchemaType(pgDate()),

		field.Enum("status").
			Values("active", "dropped", "completed").
			Default("active"),
	}
}

func (StudentSubjectEnrollment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("student_enrollment", StudentEnrollment.Type).Ref("subject_enrollments").
			Field("student_enrollment_id").Unique().Required().Immutable(),
		edge.From("subject_offering", SubjectOffering.Type).Ref("student_enrollments").
			Field("subject_offering_id").Unique().Required().Immutable(),
		edge.From("student", Student.Type).Ref("subject_enrollments").
			Field("student_id").Unique().Required().Immutable(),
		edge.From("academic_session", AcademicSession.Type).Ref("subject_enrollments").
			Field("academic_session_id").Unique().Required().Immutable(),
	}
}

func (StudentSubjectEnrollment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_enrollment_id", "subject_offering_id").Unique(),
		index.Fields("student_id", "academic_session_id", "status"),
		index.Fields("subject_offering_id", "status"),
	}
}

func (StudentSubjectEnrollment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("student_subject_enrollments"),
		entsql.WithComments(true),
	}
}
