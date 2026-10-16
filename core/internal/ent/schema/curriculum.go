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

type Curriculum struct{ ent.Schema }

func (Curriculum) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Curriculum) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.String("code").NotEmpty().MaxLen(32).Unique().Immutable(),

		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_id", uuid.UUID{}).Immutable(),
		field.UUID("grade_level_id", uuid.UUID{}).Immutable(),

		field.String("board").Optional().Nillable().Validate(maxRunes(64)),
		field.Text("description").Optional().Nillable(),

		field.Enum("origin").Values("school", "imported").Default("school"),
		field.Enum("status").Values("draft", "active", "archived").Default("draft"),

		field.UUID("supersedes_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("copied_from_id", uuid.UUID{}).Optional().Nillable(),

		field.JSON("metadata_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),
	}
}

func (Curriculum) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().Field("academic_session_id"),
		edge.To("subject", Subject.Type).Unique().Required().Immutable().Field("subject_id"),
		edge.To("grade_level", GradeLevel.Type).Unique().Required().Immutable().Field("grade_level_id"),

		edge.To("nodes", CurriculumNode.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("placements", ContentPlacement.Type),

		edge.To("superseded_by", Curriculum.Type).
			From("supersedes").
			Unique().
			Field("supersedes_id"),

		edge.To("copies", Curriculum.Type).
			From("copied_from").
			Unique().
			Field("copied_from_id"),
	}
}

func (Curriculum) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "subject_id", "grade_level_id", "status"),
		index.Fields("academic_session_id", "subject_id", "grade_level_id").
			Unique().
			Annotations(entsql.IndexWhere("status = 'active'")),
		index.Fields("copied_from_id"),
	}
}

func (Curriculum) Annotations() []schema.Annotation {
	return []schema.Annotation{table("curricula"), entsql.WithComments(true)}
}
