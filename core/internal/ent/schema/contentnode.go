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

type ContentNode struct{ ent.Schema }

func (ContentNode) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ContentNode) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("content_item_id", uuid.UUID{}).Immutable(),
		field.UUID("parent_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("kind").Values("part", "chapter", "section", "topic").Default("chapter"),
		field.String("title").NotEmpty().Validate(maxRunes(255)),
		field.Int("sequence").NonNegative(),

		field.Int("page_start").Optional().Nillable().Positive(),
		field.Int("page_end").Optional().Nillable().Positive(),

		field.String("engine_section_id").Optional().Nillable().MaxLen(128),
		field.Time("resolved_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.Enum("origin").Values("manual", "ingested").Default("manual"),

		field.JSON("locator_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
		field.JSON("metadata_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
	}
}

func (ContentNode) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("content_item", ContentItem.Type).
			Unique().Required().Immutable().Field("content_item_id"),

		edge.To("children", ContentNode.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)).
			From("parent").
			Unique().
			Field("parent_id"),

		edge.To("placements", ContentPlacement.Type).
			Annotations(entsql.OnDelete(entsql.Restrict)),
	}
}

func (ContentNode) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("content_item_id", "parent_id", "sequence"),
		index.Fields("engine_section_id"),
		index.Fields("resolved_at"),
	}
}

func (ContentNode) Annotations() []schema.Annotation {
	return []schema.Annotation{table("content_nodes"), entsql.WithComments(true)}
}
