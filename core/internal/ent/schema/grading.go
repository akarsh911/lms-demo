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

type GradingScheme struct{ ent.Schema }

func (GradingScheme) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (GradingScheme) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.String("code").NotEmpty().MaxLen(32),
		field.Text("description").Optional().Nillable(),

		field.Enum("kind").
			Values("marks", "grade", "gpa", "descriptive").
			Default("marks"),

		field.Float("maximum_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),
		field.Float("pass_marks").Optional().Nillable().SchemaType(pgNumeric(8, 2)),

		field.JSON("scale_json", []GradeBand{}).Optional().SchemaType(pgJSONB()),
		field.JSON("pass_rule_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),

		field.UUID("supersedes_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

type GradeBand struct {
	Label       string   `json:"label"`
	MinPercent  float64  `json:"min_percent"`
	MaxPercent  float64  `json:"max_percent"`
	Points      *float64 `json:"points,omitempty"`
	Description *string  `json:"description,omitempty"`
}

func (GradingScheme) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).
			Unique().Required().Immutable().Field("academic_session_id"),

		edge.To("superseded_by", GradingScheme.Type).
			From("supersedes").
			Unique().
			Field("supersedes_id"),

		edge.To("subject_offerings", SubjectOffering.Type),
	}
}

func (GradingScheme) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "code").Unique(),
		index.Fields("academic_session_id", "status"),
	}
}

func (GradingScheme) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("grading_schemes"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"grading_schemes_marks_range": "maximum_marks IS NULL OR pass_marks IS NULL OR pass_marks <= maximum_marks",
		}),
	}
}
