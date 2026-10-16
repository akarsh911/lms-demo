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

type AcademicSession struct{ ent.Schema }

func (AcademicSession) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (AcademicSession) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().MaxLen(64).Unique(),
		field.String("code").NotEmpty().MaxLen(32).Unique().Immutable(),
		field.Time("start_date").SchemaType(pgDate()),
		field.Time("end_date").SchemaType(pgDate()),
		field.Enum("status").Values("upcoming", "active", "closed").Default("upcoming"),
		field.Bool("is_current").Default(false).
			StructTag(`json:"is_current"`),
		field.UUID("previous_session_id", uuid.UUID{}).Optional().Nillable(),
		field.JSON("settings_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
	}
}

func (AcademicSession) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("next_sessions", AcademicSession.Type).
			From("previous_session").
			Unique().
			Field("previous_session_id"),

		edge.To("sections", Section.Type),
		edge.To("enrollments", StudentEnrollment.Type),
		edge.To("subject_enrollments", StudentSubjectEnrollment.Type),
		edge.To("subject_offerings", SubjectOffering.Type),
		edge.To("teacher_assignments", TeacherAssignment.Type),
		edge.To("student_assignments", StudentAssignment.Type),
		edge.To("student_notes", StudentNote.Type),
		edge.To("student_documents", StudentDocument.Type),
	}
}

func (AcademicSession) Indexes() []ent.Index {
	return []ent.Index{index.Fields("start_date", "end_date")}
}

func (AcademicSession) Annotations() []schema.Annotation {
	return []schema.Annotation{table("academic_sessions"), entsql.WithComments(true)}
}

type GradeLevel struct{ ent.Schema }

func (GradeLevel) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (GradeLevel) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().MaxLen(120),
		field.String("code").NotEmpty().MaxLen(32).Unique().Immutable(),
		field.Int("sequence").NonNegative(),
		field.String("education_stage").Optional().Nillable().MaxLen(64),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (GradeLevel) Edges() []ent.Edge {
	return []ent.Edge{edge.To("sections", Section.Type)}
}

func (GradeLevel) Indexes() []ent.Index {
	return []ent.Index{index.Fields("sequence")}
}

func (GradeLevel) Annotations() []schema.Annotation {
	return []schema.Annotation{table("grade_levels"), entsql.WithComments(true)}
}

type SchoolHouse struct{ ent.Schema }

func (SchoolHouse) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (SchoolHouse) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().MaxLen(120).Unique(),
		field.String("code").Optional().Nillable().MaxLen(32).Unique(),
		field.JSON("display_config_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (SchoolHouse) Edges() []ent.Edge {
	return []ent.Edge{edge.To("students", Student.Type)}
}

func (SchoolHouse) Annotations() []schema.Annotation {
	return []schema.Annotation{table("school_houses"), entsql.WithComments(true)}
}

type Section struct{ ent.Schema }

func (Section) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Section) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("branch_id", uuid.UUID{}).Immutable(),
		field.UUID("grade_level_id", uuid.UUID{}).Immutable(),
		field.String("name").NotEmpty().MaxLen(32),
		field.String("code").NotEmpty().MaxLen(64),
		field.Int("capacity").Optional().Nillable().Positive(),
		field.UUID("room_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("class_teacher_id", uuid.UUID{}).Optional().Nillable(),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Section) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("academic_session", AcademicSession.Type).Ref("sections").
			Field("academic_session_id").Unique().Required().Immutable(),
		edge.From("branch", Branch.Type).Ref("sections").
			Field("branch_id").Unique().Required().Immutable(),
		edge.From("grade_level", GradeLevel.Type).Ref("sections").
			Field("grade_level_id").Unique().Required().Immutable(),

		edge.From("room", Room.Type).Ref("sections").
			Field("room_id").Unique(),

		edge.To("class_teacher", Teacher.Type).Unique().Field("class_teacher_id"),

		edge.To("enrollments", StudentEnrollment.Type),
		edge.To("subject_offerings", SubjectOffering.Type),
		edge.To("teacher_assignments", TeacherAssignment.Type),
		edge.To("student_assignments", StudentAssignment.Type),
	}
}

func (Section) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "code").Unique(),
		index.Fields("academic_session_id", "branch_id", "grade_level_id"),
		index.Fields("class_teacher_id"),
		index.Fields("room_id"),
	}
}

func (Section) Annotations() []schema.Annotation {
	return []schema.Annotation{table("sections"), entsql.WithComments(true)}
}
