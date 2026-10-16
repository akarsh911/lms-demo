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

type Assignment struct{ ent.Schema }

func (Assignment) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Assignment) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("teacher_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_offering_id", uuid.UUID{}).Optional().Nillable().Immutable(),

		field.String("title").NotEmpty().Validate(maxRunes(200)),
		field.Text("description").Optional().Nillable(),
		field.Text("instructions").Optional().Nillable(),

		field.Enum("assignment_type").
			Values("worksheet", "project", "reading", "practice", "test").
			Default("worksheet"),

		field.UUID("content_id", uuid.UUID{}).Optional().Nillable(),

		field.Time("available_from").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.Time("due_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.Bool("late_submission_allowed").Default(true),
		field.Int("max_attempts").Optional().Nillable().Positive(),
		field.Float("maximum_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),

		field.Enum("status").Values("draft", "published", "closed").Default("draft"),
	}
}

func (Assignment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().
			Field("academic_session_id"),
		edge.To("teacher", Teacher.Type).Unique().Required().Immutable().Field("teacher_id"),
		edge.To("subject_offering", SubjectOffering.Type).Unique().Immutable().
			Field("subject_offering_id").Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("content", ContentItem.Type).Unique().Field("content_id"),

		edge.To("targets", AssignmentTarget.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("items", AssignmentItem.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("submissions", AssignmentSubmission.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (Assignment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("teacher_id", "academic_session_id", "due_at"),
		index.Fields("academic_session_id", "due_at"),
		index.Fields("subject_offering_id", "status"),
		index.Fields("status", "due_at"),
	}
}

func (Assignment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("assignments"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"assignments_marks_not_negative": "maximum_marks IS NULL OR maximum_marks >= 0",
			"assignments_window":             "available_from IS NULL OR due_at IS NULL OR due_at >= available_from",
		}),
	}
}

type AssignmentTarget struct{ ent.Schema }

func (AssignmentTarget) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (AssignmentTarget) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("assignment_id", uuid.UUID{}).Immutable(),

		field.Enum("target_type").Values("section", "student", "offering").Immutable(),

		field.UUID("target_id", uuid.UUID{}).Immutable(),
	}
}

func (AssignmentTarget) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("assignment", Assignment.Type).Ref("targets").
			Field("assignment_id").Unique().Required().Immutable(),
	}
}

func (AssignmentTarget) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("assignment_id", "target_type", "target_id").Unique(),
		index.Fields("target_type", "target_id", "assignment_id"),
	}
}

func (AssignmentTarget) Annotations() []schema.Annotation {
	return []schema.Annotation{table("assignment_targets"), entsql.WithComments(true)}
}

type AssignmentItem struct{ ent.Schema }

func (AssignmentItem) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (AssignmentItem) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("assignment_id", uuid.UUID{}).Immutable(),
		field.UUID("content_item_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("question_id", uuid.UUID{}).Optional().Nillable(),

		field.Int("position").NonNegative(),
		field.Float("marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),
		field.Bool("required").Default(true),
	}
}

func (AssignmentItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("assignment", Assignment.Type).Ref("items").
			Field("assignment_id").Unique().Required().Immutable(),
		edge.To("content_item", ContentItem.Type).Unique().Field("content_item_id"),

		edge.To("responses", AssignmentSubmissionItem.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (AssignmentItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("assignment_id", "position"),
	}
}

func (AssignmentItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("assignment_items"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"assignment_items_marks_not_negative": "marks IS NULL OR marks >= 0",
		}),
	}
}

type AssignmentSubmission struct{ ent.Schema }

func (AssignmentSubmission) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (AssignmentSubmission) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("assignment_id", uuid.UUID{}).Immutable(),
		field.UUID("student_id", uuid.UUID{}).Immutable(),

		field.Int("attempt_number").Positive().Default(1).Immutable(),

		field.Time("submitted_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.Enum("status").
			Values("draft", "submitted", "graded", "returned").
			Default("draft"),

		field.Bool("late").Default(false),

		field.Float("total_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),
		field.Float("marks_obtained").Optional().Nillable().SchemaType(pgNumeric(8, 2)),

		field.Time("graded_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.UUID("graded_by", uuid.UUID{}).Optional().Nillable(),
	}
}

func (AssignmentSubmission) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("assignment", Assignment.Type).Ref("submissions").
			Field("assignment_id").Unique().Required().Immutable(),
		edge.To("student", Student.Type).Unique().Required().Immutable().
			Field("student_id").Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("grader", Person.Type).Unique().Field("graded_by"),

		edge.To("items", AssignmentSubmissionItem.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (AssignmentSubmission) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("assignment_id", "student_id", "attempt_number").Unique(),
		index.Fields("assignment_id", "student_id", "status"),
		index.Fields("student_id", "status"),
	}
}

func (AssignmentSubmission) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("assignment_submissions"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"assignment_submissions_marks_not_negative": "marks_obtained IS NULL OR marks_obtained >= 0",
			"assignment_submissions_graded_has_marks":   "status <> 'graded' OR marks_obtained IS NOT NULL",
		}),
	}
}

type AssignmentSubmissionItem struct{ ent.Schema }

func (AssignmentSubmissionItem) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (AssignmentSubmissionItem) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("submission_id", uuid.UUID{}).Immutable(),
		field.UUID("assignment_item_id", uuid.UUID{}).Immutable(),

		field.Text("response_text").Optional().Nillable(),
		field.UUID("asset_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("question_response_id", uuid.UUID{}).Optional().Nillable(),

		field.Float("marks_obtained").Optional().Nillable().SchemaType(pgNumeric(8, 2)),
		field.Text("feedback").Optional().Nillable(),
	}
}

func (AssignmentSubmissionItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("submission", AssignmentSubmission.Type).Ref("items").
			Field("submission_id").Unique().Required().Immutable(),
		edge.From("assignment_item", AssignmentItem.Type).Ref("responses").
			Field("assignment_item_id").Unique().Required().Immutable(),
		edge.To("asset", Asset.Type).Unique().Field("asset_id"),
	}
}

func (AssignmentSubmissionItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("submission_id", "assignment_item_id").Unique(),
	}
}

func (AssignmentSubmissionItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("assignment_submission_items"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"assignment_submission_items_marks_not_negative": "marks_obtained IS NULL OR marks_obtained >= 0",
		}),
	}
}
