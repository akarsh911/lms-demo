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

type ContentPlacement struct{ ent.Schema }

func (ContentPlacement) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ContentPlacement) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("curriculum_id", uuid.UUID{}).Immutable(),
		field.UUID("curriculum_node_id", uuid.UUID{}).Optional().Nillable().Immutable(),
		field.UUID("content_item_id", uuid.UUID{}).Immutable(),
		field.UUID("content_node_id", uuid.UUID{}).Optional().Nillable().Immutable(),
		field.UUID("copied_from_placement_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("grain").Values("curriculum", "node"),

		field.Int("page_start").Optional().Nillable().Positive(),
		field.Int("page_end").Optional().Nillable().Positive(),

		field.Enum("origin").Values("manual", "inferred").Default("manual"),
		field.Float("confidence").Optional().Nillable(),

		field.Enum("status").Values("proposed", "confirmed", "rejected").Default("proposed"),

		field.UUID("created_by", uuid.UUID{}).Optional().Nillable(),
		field.UUID("confirmed_by", uuid.UUID{}).Optional().Nillable(),
		field.Time("confirmed_at").Optional().Nillable().SchemaType(pgTimestamptz()),
	}
}

func (ContentPlacement) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("curriculum", Curriculum.Type).Ref("placements").
			Field("curriculum_id").Unique().Required().Immutable(),
		edge.From("curriculum_node", CurriculumNode.Type).Ref("placements").
			Field("curriculum_node_id").Unique().Immutable(),
		edge.From("content_node", ContentNode.Type).Ref("placements").
			Field("content_node_id").Unique().Immutable(),

		edge.To("content_item", ContentItem.Type).
			Unique().Required().Immutable().Field("content_item_id"),

		edge.To("copies", ContentPlacement.Type).
			From("copied_from_placement").
			Unique().
			Field("copied_from_placement_id"),

		edge.To("creator", Person.Type).Unique().Field("created_by"),
		edge.To("confirmer", Person.Type).Unique().Field("confirmed_by"),
	}
}

func (ContentPlacement) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("curriculum_node_id", "status"),
		index.Fields("curriculum_id", "status"),
		index.Fields("content_item_id"),
		index.Fields("content_node_id"),
		index.Fields("copied_from_placement_id"),
	}
}

func (ContentPlacement) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("content_placements"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"content_placements_grain_node": "(grain = 'curriculum' AND curriculum_node_id IS NULL) OR (grain = 'node' AND curriculum_node_id IS NOT NULL)",
		}),
	}
}
