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

type CurriculumNode struct{ ent.Schema }

func (CurriculumNode) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (CurriculumNode) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("curriculum_id", uuid.UUID{}).Immutable(),
		field.UUID("parent_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("copied_from_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("kind").Values("unit", "chapter", "topic").Default("topic"),
		field.String("title").NotEmpty().Validate(maxRunes(255)),
		field.Int("sequence").NonNegative(),
		field.Text("description").Optional().Nillable(),

		field.Enum("status").Values("active", "inactive").Default("active"),

		field.JSON("metadata_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
	}
}

func (CurriculumNode) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("curriculum", Curriculum.Type).Ref("nodes").
			Field("curriculum_id").Unique().Required().Immutable(),

		edge.To("children", CurriculumNode.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)).
			From("parent").
			Unique().
			Field("parent_id"),

		edge.To("copies", CurriculumNode.Type).
			From("copied_from").
			Unique().
			Field("copied_from_id"),

		edge.To("placements", ContentPlacement.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
	}
}

func (CurriculumNode) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("curriculum_id", "parent_id", "sequence"),
		index.Fields("curriculum_id", "kind"),
		index.Fields("copied_from_id"),
	}
}

func (CurriculumNode) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("curriculum_nodes"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"curriculum_nodes_topic_has_parent": "kind <> 'topic' OR parent_id IS NOT NULL",
			"curriculum_nodes_unit_is_root":     "kind <> 'unit' OR parent_id IS NULL",
		}),
	}
}
