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

type ResultScheme struct{ ent.Schema }

func (ResultScheme) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ResultScheme) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.String("code").NotEmpty().MaxLen(32),
		field.Text("description").Optional().Nillable(),

		field.Float("total_marks").Default(100).SchemaType(pgNumeric(8, 2)),

		field.UUID("supersedes_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("status").Values("draft", "active", "inactive").Default("draft"),
	}
}

func (ResultScheme) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).
			Unique().Required().Immutable().Field("academic_session_id"),

		edge.To("superseded_by", ResultScheme.Type).
			From("supersedes").
			Unique().
			Field("supersedes_id"),

		edge.To("components", ResultComponent.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("subject_offerings", SubjectOffering.Type),
	}
}

func (ResultScheme) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "code").Unique(),
		index.Fields("academic_session_id", "status"),
	}
}

func (ResultScheme) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("result_schemes"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"result_schemes_total_marks_positive": "total_marks > 0",
		}),
	}
}

type ResultComponent struct{ ent.Schema }

func (ResultComponent) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ResultComponent) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("result_scheme_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().Validate(maxRunes(200)),

		field.Float("maximum_marks").SchemaType(pgNumeric(8, 2)),
		field.Float("weight").SchemaType(pgNumeric(8, 2)),

		field.Enum("aggregation").
			Values("single", "sum", "best_of", "average").
			Default("single"),

		field.Int("take_best").Optional().Nillable(),

		field.Int("position").Default(0).NonNegative(),
	}
}

func (ResultComponent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("result_scheme", ResultScheme.Type).Ref("components").
			Field("result_scheme_id").Unique().Required().Immutable(),

		edge.To("exams", ResultComponentExam.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("assignments", ResultComponentAssignment.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (ResultComponent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("result_scheme_id", "position"),
		index.Fields("result_scheme_id", "name").Unique(),
	}
}

func (ResultComponent) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("result_components"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"result_components_marks_positive":  "maximum_marks > 0 AND weight > 0",
			"result_components_take_best_range": "take_best IS NULL OR take_best > 0",
			"result_components_take_best_iff_best_of": "(aggregation = 'best_of' AND take_best IS NOT NULL) " +
				"OR (aggregation <> 'best_of' AND take_best IS NULL)",
		}),
	}
}

type ResultComponentExam struct{ ent.Schema }

func (ResultComponentExam) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ResultComponentExam) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("result_component_id", uuid.UUID{}).Immutable(),
		field.UUID("exam_id", uuid.UUID{}).Immutable(),
	}
}

func (ResultComponentExam) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("result_component", ResultComponent.Type).Ref("exams").
			Field("result_component_id").Unique().Required().Immutable(),

		edge.To("exam", Exam.Type).
			Unique().Required().Immutable().Field("exam_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ResultComponentExam) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("result_component_id", "exam_id").Unique(),
		index.Fields("exam_id"),
	}
}

func (ResultComponentExam) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("result_component_exams"),
		entsql.WithComments(true),
	}
}

type ResultComponentAssignment struct{ ent.Schema }

func (ResultComponentAssignment) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ResultComponentAssignment) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("result_component_id", uuid.UUID{}).Immutable(),
		field.UUID("assignment_id", uuid.UUID{}).Immutable(),
	}
}

func (ResultComponentAssignment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("result_component", ResultComponent.Type).Ref("assignments").
			Field("result_component_id").Unique().Required().Immutable(),

		edge.To("assignment", Assignment.Type).
			Unique().Required().Immutable().Field("assignment_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ResultComponentAssignment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("result_component_id", "assignment_id").Unique(),
		index.Fields("assignment_id"),
	}
}

func (ResultComponentAssignment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("result_component_assignments"),
		entsql.WithComments(true),
	}
}
