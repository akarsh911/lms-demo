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

type StreamPost struct{ ent.Schema }

func (StreamPost) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StreamPost) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("author_person_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("post_type").
			Values("announcement", "resource", "poll", "question").
			Default("announcement"),

		field.String("title").Optional().Nillable().Validate(maxRunes(200)),
		field.Text("body").NotEmpty(),

		field.Bool("pinned").Default(false),

		field.Time("published_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.Time("expires_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.Enum("status").Values("draft", "published", "archived").Default("draft"),
	}
}

func (StreamPost) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("author", Person.Type).Unique().Required().Immutable().Field("author_person_id"),
		edge.To("academic_session", AcademicSession.Type).Unique().Field("academic_session_id"),

		edge.To("targets", StreamTarget.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("comments", StreamComment.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (StreamPost) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("status", "published_at"),
		index.Fields("academic_session_id", "published_at"),
		index.Fields("author_person_id", "created_at"),
		index.Fields("pinned", "published_at"),
	}
}

func (StreamPost) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("stream_posts"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"stream_posts_window": "expires_at IS NULL OR published_at IS NULL OR expires_at > published_at",
		}),
	}
}

type StreamTarget struct{ ent.Schema }

func (StreamTarget) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StreamTarget) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("post_id", uuid.UUID{}).Immutable(),

		field.Enum("target_type").
			Values("school", "branch", "grade", "section", "offering", "student").
			Immutable(),

		field.UUID("target_id", uuid.UUID{}).Immutable(),
	}
}

func (StreamTarget) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("post", StreamPost.Type).Ref("targets").
			Field("post_id").Unique().Required().Immutable(),
	}
}

func (StreamTarget) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("post_id", "target_type", "target_id").Unique(),
		index.Fields("target_type", "target_id", "post_id"),
	}
}

func (StreamTarget) Annotations() []schema.Annotation {
	return []schema.Annotation{table("stream_targets"), entsql.WithComments(true)}
}

type StreamComment struct{ ent.Schema }

func (StreamComment) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StreamComment) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("post_id", uuid.UUID{}).Immutable(),
		field.UUID("author_person_id", uuid.UUID{}).Immutable(),

		field.Text("body").NotEmpty(),

		field.Enum("status").Values("visible", "hidden").Default("visible"),
	}
}

func (StreamComment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("post", StreamPost.Type).Ref("comments").
			Field("post_id").Unique().Required().Immutable(),
		edge.To("author", Person.Type).Unique().Required().Immutable().Field("author_person_id"),
	}
}

func (StreamComment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("post_id", "created_at"),
		index.Fields("author_person_id", "created_at"),
	}
}

func (StreamComment) Annotations() []schema.Annotation {
	return []schema.Annotation{table("stream_comments"), entsql.WithComments(true)}
}
