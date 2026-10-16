package schema

import (
	"fmt"
	"unicode/utf8"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
)

func maxRunes(n int) func(string) error {
	return func(s string) error {
		if utf8.RuneCountInString(s) > n {
			return fmt.Errorf("value is longer than %d characters", n)
		}
		return nil
	}
}

type ContentItem struct{ ent.Schema }

func (ContentItem) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ContentItem) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("kind").Values("book", "note", "document", "paper").Default("document"),
		field.String("title").NotEmpty().Validate(maxRunes(255)),
		field.Text("description").Optional().Nillable(),

		field.UUID("subject_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("grade_level_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("section_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("subject_offering_id", uuid.UUID{}).Optional().Nillable(),

		field.String("language").Optional().Nillable().MaxLen(16),
		field.String("author").Optional().Nillable().Validate(maxRunes(255)),
		field.String("publisher").Optional().Nillable().Validate(maxRunes(255)),
		field.String("isbn").Optional().Nillable().MaxLen(20),

		field.UUID("asset_id", uuid.UUID{}).Optional().Nillable().Immutable(),
		field.UUID("owner_person_id", uuid.UUID{}).Immutable(),

		field.Enum("audience").Values("school", "grade", "section", "offering", "owner"),

		field.UUID("supersedes_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("status").Values("draft", "published", "archived").Default("draft"),

		field.Enum("ingest_mode").Values("now", "defer").Default("now"),

		field.Enum("index_status").Values("none", "pending", "indexed", "failed", "parked", "held").Default("none"),
		field.String("indexed_sha256").Optional().Nillable().MaxLen(64),
		field.Time("indexed_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.String("engine_document_id").Optional().Nillable().MaxLen(128),
		field.String("held_engine_document_id").Optional().Nillable().MaxLen(128),
		field.Int("index_attempts").Default(0).NonNegative(),

		field.JSON("metadata_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
	}
}

func (ContentItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("asset", Asset.Type).Ref("content_items").
			Field("asset_id").Unique().Immutable(),

		edge.To("subject", Subject.Type).Unique().Field("subject_id"),
		edge.To("grade_level", GradeLevel.Type).Unique().Field("grade_level_id"),
		edge.To("section", Section.Type).Unique().Field("section_id"),
		edge.To("subject_offering", SubjectOffering.Type).Unique().Field("subject_offering_id"),

		edge.To("owner", Person.Type).Unique().Required().Immutable().Field("owner_person_id"),

		edge.To("question_paper", QuestionPaper.Type).
			Unique().
			Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("superseded_by", ContentItem.Type).
			From("supersedes").
			Unique().
			Field("supersedes_id"),
	}
}

func (ContentItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("subject_id", "grade_level_id", "status"),
		index.Fields("kind", "status"),
		index.Fields("owner_person_id"),
		index.Fields("isbn"),
		index.Fields("index_status"),
		index.Fields("audience"),
		index.Fields("engine_document_id"),
	}
}

func (ContentItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("content_items"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"content_items_audience_scope": "(audience = 'grade' AND grade_level_id IS NOT NULL AND section_id IS NULL AND subject_offering_id IS NULL) OR (audience = 'section' AND section_id IS NOT NULL AND grade_level_id IS NULL AND subject_offering_id IS NULL) OR (audience = 'offering' AND subject_offering_id IS NOT NULL AND grade_level_id IS NULL AND section_id IS NULL) OR (audience IN ('school', 'owner') AND grade_level_id IS NULL AND section_id IS NULL AND subject_offering_id IS NULL)",
		}),
	}
}
