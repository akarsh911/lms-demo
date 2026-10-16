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

type StudentExamMark struct{ ent.Schema }

func (StudentExamMark) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentExamMark) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("exam_subject_id", uuid.UUID{}).Immutable(),
		field.UUID("student_id", uuid.UUID{}).Immutable(),

		field.UUID("exam_sitting_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("status").Values("marked", "absent", "exempt").Default("marked"),

		field.Float("marks_obtained").Optional().Nillable().SchemaType(pgNumeric(8, 2)),

		field.Bool("provisional").Default(false),

		field.Text("remarks").Optional().Nillable(),

		field.UUID("marked_by", uuid.UUID{}).Optional().Nillable(),
		field.Time("marked_at").Optional().Nillable().SchemaType(pgTimestamptz()),
	}
}

func (StudentExamMark) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("exam_subject", ExamSubject.Type).
			Unique().Required().Immutable().Field("exam_subject_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),

		edge.To("student", Student.Type).
			Unique().Required().Immutable().Field("student_id").
			Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("exam_sitting", ExamSitting.Type).
			Unique().Field("exam_sitting_id").
			Annotations(entsql.OnDelete(entsql.SetNull)),

		edge.To("marker", Person.Type).Unique().Field("marked_by"),
	}
}

func (StudentExamMark) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_subject_id", "student_id").Unique(),
		index.Fields("student_id"),
		index.Fields("exam_subject_id", "status"),
		index.Fields("exam_sitting_id"),
	}
}

func (StudentExamMark) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("student_exam_marks"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"student_exam_marks_value_iff_marked": "(status = 'marked' AND marks_obtained IS NOT NULL) " +
				"OR (status <> 'marked' AND marks_obtained IS NULL)",
			"student_exam_marks_not_negative":                 "marks_obtained IS NULL OR marks_obtained >= 0",
			"student_exam_marks_provisional_only_when_marked": "NOT provisional OR status = 'marked'",
		}),
	}
}
