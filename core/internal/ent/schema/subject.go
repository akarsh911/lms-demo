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

type Subject struct{ ent.Schema }

func (Subject) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Subject) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().MaxLen(200),
		field.String("short_name").Optional().Nillable().MaxLen(64),
		field.String("code").NotEmpty().MaxLen(32).Unique().Immutable(),
		field.Text("description").Optional().Nillable(),
		field.String("subject_type").NotEmpty().MaxLen(64).Default("academic"),
		field.Bool("is_elective").Default(false),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Subject) Edges() []ent.Edge {
	return []ent.Edge{edge.To("offerings", SubjectOffering.Type)}
}

func (Subject) Indexes() []ent.Index {
	return []ent.Index{index.Fields("status"), index.Fields("subject_type")}
}

func (Subject) Annotations() []schema.Annotation {
	return []schema.Annotation{table("subjects"), entsql.WithComments(true)}
}

type SubjectGroup struct{ ent.Schema }

func (SubjectGroup) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (SubjectGroup) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().MaxLen(200).Unique(),
		field.Text("description").Optional().Nillable(),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (SubjectGroup) Edges() []ent.Edge {
	return []ent.Edge{edge.To("offerings", SubjectOffering.Type)}
}

func (SubjectGroup) Annotations() []schema.Annotation {
	return []schema.Annotation{table("subject_groups"), entsql.WithComments(true)}
}

type SubjectOffering struct{ ent.Schema }

func (SubjectOffering) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (SubjectOffering) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_group_id", uuid.UUID{}).Optional().Nillable(),

		field.Int("periods_per_week").Optional().Nillable().NonNegative(),
		field.Int("minutes_per_week").Optional().Nillable().NonNegative(),
		field.Float("maximum_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),
		field.Float("pass_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),

		field.UUID("grading_scheme_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("result_scheme_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (SubjectOffering) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("academic_session", AcademicSession.Type).Ref("subject_offerings").
			Field("academic_session_id").Unique().Required().Immutable(),
		edge.From("section", Section.Type).Ref("subject_offerings").
			Field("section_id").Unique().Required().Immutable(),
		edge.From("subject", Subject.Type).Ref("offerings").
			Field("subject_id").Unique().Required().Immutable(),
		edge.From("subject_group", SubjectGroup.Type).Ref("offerings").
			Field("subject_group_id").Unique(),
		edge.From("grading_scheme", GradingScheme.Type).Ref("subject_offerings").
			Field("grading_scheme_id").Unique(),
		edge.From("result_scheme", ResultScheme.Type).Ref("subject_offerings").
			Field("result_scheme_id").Unique(),

		edge.To("teacher_assignments", TeacherAssignment.Type),
		edge.To("student_assignments", StudentAssignment.Type),
		edge.To("student_enrollments", StudentSubjectEnrollment.Type),
	}
}

func (SubjectOffering) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "section_id", "subject_id").Unique(),
		index.Fields("subject_id"),
	}
}

func (SubjectOffering) Annotations() []schema.Annotation {
	return []schema.Annotation{table("subject_offerings"), entsql.WithComments(true)}
}
