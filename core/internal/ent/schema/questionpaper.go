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

type QuestionPaper struct{ ent.Schema }

func (QuestionPaper) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (QuestionPaper) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("content_item_id", uuid.UUID{}).Immutable(),

		field.String("exam_type").NotEmpty().Validate(maxRunes(64)),
		field.String("board").Optional().Nillable().Validate(maxRunes(64)),

		field.Int("exam_year").Optional().Nillable().Positive(),
		field.Int("total_marks").Optional().Nillable().Positive(),
		field.Int("duration_minutes").Optional().Nillable().Positive(),

		field.String("paper_set").Optional().Nillable().Validate(maxRunes(64)),
		field.String("attempt").Optional().Nillable().Validate(maxRunes(64)),

		field.JSON("metadata_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
	}
}

func (QuestionPaper) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("content_item", ContentItem.Type).Ref("question_paper").
			Field("content_item_id").Unique().Required().Immutable(),
	}
}

func (QuestionPaper) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("exam_year"),
		index.Fields("exam_type", "exam_year"),
	}
}

func (QuestionPaper) Annotations() []schema.Annotation {
	return []schema.Annotation{table("question_papers"), entsql.WithComments(true)}
}
