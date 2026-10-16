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

type Question struct{ ent.Schema }

func (Question) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Question) Fields() []ent.Field {
	return []ent.Field{
		field.String("canonical_key").NotEmpty().Validate(maxRunes(200)).Unique().Immutable(),

		field.UUID("subject_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("grade_level_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("question_type").
			Values("mcq", "multi_select", "true_false", "fill_blank", "match",
				"short_answer", "long_answer", "numeric", "assertion_reason",
				"case_study", "code").
			Default("mcq"),

		field.Enum("status").
			Values("draft", "reviewed", "published", "retired").
			Default("draft"),

		field.Float("difficulty_score").Optional().Nillable().SchemaType(pgNumeric(5, 2)),
		field.Enum("difficulty_label").Values("easy", "medium", "hard").Optional().Nillable(),

		field.String("bloom_level").Optional().Nillable().Validate(maxRunes(64)),
		field.String("language").Optional().Nillable().Validate(maxRunes(32)),
		field.Int("estimated_seconds").Optional().Nillable().Positive(),

		field.Enum("source_type").
			Values("original", "pyq", "ai", "imported").
			Default("original"),

		field.UUID("created_by", uuid.UUID{}).Immutable(),
	}
}

func (Question) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("subject", Subject.Type).Unique().Field("subject_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("grade_level", GradeLevel.Type).Unique().Field("grade_level_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("author", Person.Type).Unique().Required().Immutable().Field("created_by").
			Annotations(entsql.OnDelete(entsql.NoAction)),

		edge.To("versions", QuestionVersion.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (Question) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("status", "question_type"),
		index.Fields("subject_id", "grade_level_id"),
		index.Fields("source_type"),
		index.Fields("difficulty_label"),
		index.Fields("created_by"),
	}
}

func (Question) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("questions"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"questions_difficulty_score_range": "difficulty_score IS NULL OR " +
				"(difficulty_score >= 0 AND difficulty_score <= 100)",
		}),
	}
}

type QuestionVersion struct{ ent.Schema }

func (QuestionVersion) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (QuestionVersion) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("question_id", uuid.UUID{}).Immutable(),

		field.Int("version_number").Positive().Immutable(),

		field.Text("stem").NotEmpty().Immutable(),
		field.Text("explanation").Optional().Nillable().Immutable(),

		field.JSON("answer_data_json", shared.Metadata{}).
			Optional().Immutable().SchemaType(pgJSONB()),

		field.Enum("status").Values("draft", "reviewed", "published").Default("draft"),

		field.UUID("created_by", uuid.UUID{}).Immutable(),
	}
}

func (QuestionVersion) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("question", Question.Type).Ref("versions").
			Field("question_id").Unique().Required().Immutable(),

		edge.To("editor", Person.Type).Unique().Required().Immutable().Field("created_by").
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (QuestionVersion) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("question_id", "version_number").Unique(),
		index.Fields("question_id", "status"),
		index.Fields("created_by"),
	}
}

func (QuestionVersion) Annotations() []schema.Annotation {
	return []schema.Annotation{table("question_versions"), entsql.WithComments(true)}
}
