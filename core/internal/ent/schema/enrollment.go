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

type StudentEnrollment struct{ ent.Schema }

func (StudentEnrollment) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentEnrollment) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}),

		field.String("roll_number").Optional().Nillable().MaxLen(32),
		field.String("enrollment_number").Optional().Nillable().MaxLen(64),

		field.Time("enrollment_date").SchemaType(pgDate()),
		field.Time("exit_date").Optional().Nillable().SchemaType(pgDate()),

		field.Enum("promotion_status").
			Values("promoted", "retained", "withdrawn").
			Optional().Nillable(),

		field.Enum("status").
			Values("active", "completed", "withdrawn").
			Default("active"),

		field.UUID("previous_enrollment_id", uuid.UUID{}).Optional().Nillable(),
	}
}

func (StudentEnrollment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("student", Student.Type).Ref("enrollments").
			Field("student_id").Unique().Required().Immutable(),
		edge.From("academic_session", AcademicSession.Type).Ref("enrollments").
			Field("academic_session_id").Unique().Required().Immutable(),
		edge.From("section", Section.Type).Ref("enrollments").
			Field("section_id").Unique().Required(),

		edge.To("subject_enrollments", StudentSubjectEnrollment.Type).Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("next_enrollments", StudentEnrollment.Type).
			From("previous_enrollment").
			Unique().
			Field("previous_enrollment_id"),
	}
}

func (StudentEnrollment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_id", "academic_session_id").Unique(),
		index.Fields("section_id", "status"),
		index.Fields("academic_session_id", "status"),
	}
}

func (StudentEnrollment) Annotations() []schema.Annotation {
	return []schema.Annotation{table("student_enrollments"), entsql.WithComments(true)}
}

type StudentNote struct{ ent.Schema }

func (StudentNote) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentNote) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("author_person_id", uuid.UUID{}).Immutable(),

		field.String("category").NotEmpty().MaxLen(64),
		field.String("title").Optional().Nillable().MaxLen(255),
		field.Text("body").NotEmpty(),

		field.Enum("visibility").
			Values("private", "staff", "guardian").
			Default("staff"),
	}
}

func (StudentNote) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("student", Student.Type).Ref("notes").
			Field("student_id").Unique().Required().Immutable(),
		edge.From("academic_session", AcademicSession.Type).Ref("student_notes").
			Field("academic_session_id").Unique().Required().Immutable(),
		edge.From("author", Person.Type).Ref("authored_notes").
			Field("author_person_id").Unique().Required().Immutable(),
	}
}

func (StudentNote) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_id", "academic_session_id"),
		index.Fields("visibility"),
		index.Fields("category"),
	}
}

func (StudentNote) Annotations() []schema.Annotation {
	return []schema.Annotation{table("student_notes"), entsql.WithComments(true)}
}
