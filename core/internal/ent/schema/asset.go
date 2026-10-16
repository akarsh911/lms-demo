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

type Asset struct{ ent.Schema }

func (Asset) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Asset) Fields() []ent.Field {
	return []ent.Field{
		field.String("storage_key").NotEmpty().MaxLen(1024).Unique().Immutable(),
		field.String("file_name").NotEmpty().Validate(maxRunes(255)),
		field.String("mime_type").NotEmpty().MaxLen(127),
		field.Int64("size_bytes").NonNegative().Immutable(),
		field.String("sha256").NotEmpty().MaxLen(64).Immutable(),
		field.UUID("uploaded_by", uuid.UUID{}).Optional().Nillable(),
		field.Enum("status").Values("pending", "ready", "deleted").Default("pending"),
		field.JSON("metadata_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
	}
}

func (Asset) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("uploader", Person.Type).Unique().Field("uploaded_by"),

		edge.To("content_items", ContentItem.Type).Annotations(entsql.OnDelete(entsql.Restrict)),
	}
}

func (Asset) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("sha256"),
		index.Fields("status"),
		index.Fields("uploaded_by"),
	}
}

func (Asset) Annotations() []schema.Annotation {
	return []schema.Annotation{table("assets"), entsql.WithComments(true)}
}
