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

type ExamOnlineDelivery struct{ ent.Schema }

func (ExamOnlineDelivery) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ExamOnlineDelivery) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("exam_subject_id", uuid.UUID{}).Immutable(),

		field.Time("opens_at").SchemaType(pgTimestamptz()),
		field.Time("closes_at").SchemaType(pgTimestamptz()),

		field.Int("duration_minutes").Optional().Nillable().Positive(),
		field.Int("attempts_allowed").Positive().Default(1),

		field.Bool("allow_late_submission").Default(false),

		field.Enum("status").Values("draft", "published", "closed").Default("draft"),

		field.Time("published_at").Optional().Nillable().SchemaType(pgTimestamptz()),
	}
}

func (ExamOnlineDelivery) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("exam_subject", ExamSubject.Type).
			Unique().Required().Immutable().Field("exam_subject_id").
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (ExamOnlineDelivery) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_subject_id").Unique(),
		index.Fields("status", "opens_at"),
		index.Fields("closes_at"),
	}
}

func (ExamOnlineDelivery) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("exam_online_deliveries"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"exam_online_deliveries_window_range": "closes_at > opens_at",
		}),
	}
}

type ExamQuestion struct{ ent.Schema }

func (ExamQuestion) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ExamQuestion) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("exam_subject_id", uuid.UUID{}).Immutable(),

		field.Int("position").Positive(),

		field.Enum("kind").Values("single_choice", "free_text").Default("single_choice"),

		field.Text("prompt").NotEmpty(),

		field.Float("marks").Positive().SchemaType(pgNumeric(8, 2)),
	}
}

func (ExamQuestion) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("exam_subject", ExamSubject.Type).
			Unique().Required().Immutable().Field("exam_subject_id").
			Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("options", ExamQuestionOption.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (ExamQuestion) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_subject_id", "position").Unique(),
		index.Fields("exam_subject_id", "kind"),
	}
}

func (ExamQuestion) Annotations() []schema.Annotation {
	return []schema.Annotation{table("exam_questions"), entsql.WithComments(true)}
}

type ExamQuestionOption struct{ ent.Schema }

func (ExamQuestionOption) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ExamQuestionOption) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("exam_question_id", uuid.UUID{}).Immutable(),

		field.Int("position").Positive(),

		field.Text("body").NotEmpty(),

		field.Bool("is_correct").Default(false),
	}
}

func (ExamQuestionOption) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("question", ExamQuestion.Type).Ref("options").
			Field("exam_question_id").Unique().Required().Immutable(),
	}
}

func (ExamQuestionOption) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_question_id", "position").Unique(),
		index.Fields("exam_question_id", "is_correct"),
	}
}

func (ExamQuestionOption) Annotations() []schema.Annotation {
	return []schema.Annotation{table("exam_question_options"), entsql.WithComments(true)}
}

type ExamAttempt struct{ ent.Schema }

func (ExamAttempt) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ExamAttempt) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("exam_subject_id", uuid.UUID{}).Immutable(),
		field.UUID("student_id", uuid.UUID{}).Immutable(),

		field.Int("attempt_no").Positive().Immutable(),

		field.Enum("status").Values("in_progress", "submitted", "expired").Default("in_progress"),

		field.Time("started_at").Immutable().SchemaType(pgTimestamptz()),
		field.Time("deadline_at").Immutable().SchemaType(pgTimestamptz()),
		field.Time("submitted_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.Bool("submitted_late").Default(false),
		field.Bool("awaiting_review").Default(false),

		field.Float("awarded_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),
	}
}

func (ExamAttempt) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("exam_subject", ExamSubject.Type).
			Unique().Required().Immutable().Field("exam_subject_id").
			Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("student", Student.Type).
			Unique().Required().Immutable().Field("student_id").
			Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("responses", ExamResponse.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (ExamAttempt) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_subject_id", "student_id", "attempt_no").Unique(),
		index.Fields("exam_subject_id", "status"),
		index.Fields("student_id"),
	}
}

func (ExamAttempt) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("exam_attempts"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"exam_attempts_submitted_iff_finished": "(status = 'in_progress' AND submitted_at IS NULL) " +
				"OR (status <> 'in_progress' AND submitted_at IS NOT NULL)",
			"exam_attempts_marks_not_negative": "awarded_marks IS NULL OR awarded_marks >= 0",
		}),
	}
}

type ExamResponse struct{ ent.Schema }

func (ExamResponse) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ExamResponse) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("exam_attempt_id", uuid.UUID{}).Immutable(),
		field.UUID("exam_question_id", uuid.UUID{}).Immutable(),

		field.UUID("selected_option_id", uuid.UUID{}).Optional().Nillable(),
		field.Text("answer_text").Optional().Nillable(),

		field.Enum("marking").Values("unmarked", "automatic", "manual").Default("unmarked"),

		field.Float("awarded_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),

		field.UUID("marked_by", uuid.UUID{}).Optional().Nillable(),
		field.Time("marked_at").Optional().Nillable().SchemaType(pgTimestamptz()),
	}
}

func (ExamResponse) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("attempt", ExamAttempt.Type).Ref("responses").
			Field("exam_attempt_id").Unique().Required().Immutable(),

		edge.To("question", ExamQuestion.Type).
			Unique().Required().Immutable().Field("exam_question_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),

		edge.To("selected_option", ExamQuestionOption.Type).
			Unique().Field("selected_option_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),

		edge.To("marker", Person.Type).Unique().Field("marked_by"),
	}
}

func (ExamResponse) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_attempt_id", "exam_question_id").Unique(),
		index.Fields("exam_question_id"),
		index.Fields("exam_attempt_id", "marking"),
	}
}

func (ExamResponse) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("exam_responses"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"exam_responses_value_iff_marked": "(marking = 'unmarked' AND awarded_marks IS NULL) " +
				"OR (marking <> 'unmarked' AND awarded_marks IS NOT NULL)",
			"exam_responses_marks_not_negative": "awarded_marks IS NULL OR awarded_marks >= 0",
		}),
	}
}
