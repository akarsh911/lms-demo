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

type ConceptMastery struct{ ent.Schema }

func (ConceptMastery) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ConceptMastery) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("content_item_id", uuid.UUID{}),

		field.String("engine_section_id").NotEmpty().MaxLen(255),
		field.String("node_id").NotEmpty().MaxLen(255),

		field.Enum("state").Values("read", "missed", "shaky", "known"),

		field.Float("score").Optional().Nillable(),
		field.Int("attempts").Default(0).NonNegative(),
		field.Time("last_attempt_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.String("structure_digest").Optional().Nillable().MaxLen(128),
		field.Int("structure_chunks").Optional().Nillable().NonNegative(),
	}
}

func (ConceptMastery) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("student", Student.Type).Unique().Required().Immutable().
			Field("student_id").Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().
			Field("academic_session_id"),
		edge.To("content_item", ContentItem.Type).Unique().Required().
			Field("content_item_id").Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (ConceptMastery) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_id", "academic_session_id", "content_item_id", "node_id").Unique(),
		index.Fields("content_item_id", "engine_section_id"),
		index.Fields("academic_session_id"),
	}
}

func (ConceptMastery) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("concept_mastery"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"concept_mastery_state_known":   "state IN ('read', 'missed', 'shaky', 'known')",
			"concept_mastery_score_in_unit": "score IS NULL OR (score >= 0 AND score <= 1)",
			"concept_mastery_attempts_sane": "attempts >= 0",
		}),
	}
}
