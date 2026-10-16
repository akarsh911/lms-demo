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

type Exam struct{ ent.Schema }

func (Exam) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Exam) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("branch_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.String("code").NotEmpty().MaxLen(32),

		field.Enum("exam_type").
			Values("unit_test", "term", "practice", "board").
			Default("unit_test"),

		field.Time("start_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.Time("end_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.Text("instructions").Optional().Nillable(),

		field.Enum("status").Values("draft", "published", "archived").Default("draft"),

		field.Enum("assessment_kind").
			Values("evaluative", "practice").
			Default("evaluative"),

		field.Enum("delivery").
			Values("in_person", "online").
			Default("in_person"),
	}
}

func (Exam) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).
			Unique().Required().Immutable().Field("academic_session_id"),
		edge.To("branch", Branch.Type).
			Unique().Required().Immutable().Field("branch_id"),

		edge.To("exam_subjects", ExamSubject.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (Exam) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "branch_id", "code").Unique(),
		index.Fields("academic_session_id", "branch_id", "status"),
		index.Fields("exam_type"),
		index.Fields("start_at"),
		index.Fields("academic_session_id", "branch_id", "delivery"),
	}
}

func (Exam) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("exams"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"exams_window_range": "start_at IS NULL OR end_at IS NULL OR end_at >= start_at",
		}),
	}
}

type ExamSubject struct{ ent.Schema }

func (ExamSubject) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ExamSubject) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("exam_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_offering_id", uuid.UUID{}).Immutable(),

		field.Float("maximum_marks").Positive().SchemaType(pgNumeric(8, 2)),
		field.Float("pass_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),

		field.UUID("grading_scheme_id", uuid.UUID{}).Optional().Nillable(),
	}
}

func (ExamSubject) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("exam", Exam.Type).Ref("exam_subjects").
			Field("exam_id").Unique().Required().Immutable(),

		edge.To("subject_offering", SubjectOffering.Type).
			Unique().Required().Immutable().Field("subject_offering_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("grading_scheme", GradingScheme.Type).
			Unique().Field("grading_scheme_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),

		edge.To("sittings", ExamSitting.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (ExamSubject) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_id", "subject_offering_id").Unique(),
		index.Fields("subject_offering_id"),
		index.Fields("grading_scheme_id"),
	}
}

func (ExamSubject) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("exam_subjects"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"exam_subjects_marks_range": "pass_marks IS NULL OR pass_marks <= maximum_marks",
		}),
	}
}

type ExamSitting struct{ ent.Schema }

func (ExamSitting) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ExamSitting) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("exam_subject_id", uuid.UUID{}).Immutable(),
		field.UUID("calendar_day_id", uuid.UUID{}).Immutable(),
		field.UUID("period_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}).Immutable(),

		field.UUID("room_id", uuid.UUID{}).Optional().Nillable(),
	}
}

func (ExamSitting) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("exam_subject", ExamSubject.Type).Ref("sittings").
			Field("exam_subject_id").Unique().Required().Immutable(),

		edge.To("calendar_day", CalendarDay.Type).
			Unique().Required().Immutable().Field("calendar_day_id"),
		edge.To("period", Period.Type).
			Unique().Required().Immutable().Field("period_id"),
		edge.To("section", Section.Type).
			Unique().Required().Immutable().Field("section_id"),
		edge.To("room", Room.Type).
			Unique().Field("room_id"),
	}
}

func (ExamSitting) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_subject_id", "calendar_day_id", "period_id").Unique(),
		index.Fields("calendar_day_id", "period_id"),
		index.Fields("section_id", "calendar_day_id"),
		index.Fields("room_id", "calendar_day_id", "period_id"),
		index.Fields("period_id"),
	}
}

func (ExamSitting) Annotations() []schema.Annotation {
	return []schema.Annotation{table("exam_sittings"), entsql.WithComments(true)}
}
