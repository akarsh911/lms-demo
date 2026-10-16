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

type CognitiveBand struct {
	Key           string   `json:"key"`
	Label         string   `json:"label"`
	WeightPercent *float64 `json:"weight_percent,omitempty"`
	MinPercent    *float64 `json:"min_percent,omitempty"`
	MaxPercent    *float64 `json:"max_percent,omitempty"`
}

type CognitiveScheme struct {
	Name  string          `json:"name"`
	Bands []CognitiveBand `json:"bands"`
}

type UnitWeight struct {
	Key           string   `json:"key"`
	Label         string   `json:"label,omitempty"`
	WeightPercent *float64 `json:"weight_percent,omitempty"`
	Marks         *float64 `json:"marks,omitempty"`
}

type UnitWeightage struct {
	Units []UnitWeight `json:"units"`
}

type Blueprint struct{ ent.Schema }

func (Blueprint) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Blueprint) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Optional().Nillable().Immutable(),
		field.UUID("grade_level_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_id", uuid.UUID{}).Immutable(),

		field.String("code").NotEmpty().MaxLen(64).Immutable(),
		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.Text("description").Optional().Nillable(),

		field.Float("total_marks").Positive().SchemaType(pgNumeric(8, 2)),
		field.Int("duration_minutes").Positive(),

		field.Int("version").Positive().Default(1).Immutable(),

		field.Enum("status").Values("draft", "published", "archived").Default("draft"),

		field.JSON("cognitive_scheme", CognitiveScheme{}).SchemaType(pgJSONB()),
		field.JSON("unit_weightage", &UnitWeightage{}).Optional().SchemaType(pgJSONB()),
	}
}

func (Blueprint) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).
			Unique().Immutable().Field("academic_session_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("grade_level", GradeLevel.Type).
			Unique().Required().Immutable().Field("grade_level_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("subject", Subject.Type).
			Unique().Required().Immutable().Field("subject_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),

		edge.To("sections", BlueprintSection.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (Blueprint) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code", "version").Unique(),
		index.Fields("subject_id", "grade_level_id"),
		index.Fields("academic_session_id"),
		index.Fields("status"),
	}
}

func (Blueprint) Annotations() []schema.Annotation {
	return []schema.Annotation{table("blueprints"), entsql.WithComments(true)}
}

type BlueprintSection struct{ ent.Schema }

func (BlueprintSection) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (BlueprintSection) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("blueprint_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.String("section_code").NotEmpty().MaxLen(32),

		field.Int("position").Positive(),
		field.Int("question_count").Positive(),

		field.Float("marks_per_question").Optional().Nillable().SchemaType(pgNumeric(8, 2)),
		field.Float("total_marks").Positive().SchemaType(pgNumeric(8, 2)),

		field.Int("duration_minutes").Optional().Nillable().Positive(),
	}
}

func (BlueprintSection) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("blueprint", Blueprint.Type).Ref("sections").
			Field("blueprint_id").Unique().Required().Immutable(),

		edge.To("constraints", BlueprintConstraint.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (BlueprintSection) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("blueprint_id", "section_code").Unique(),
		index.Fields("blueprint_id", "position").Unique(),
	}
}

func (BlueprintSection) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("blueprint_sections"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"blueprint_sections_marks_positive": "marks_per_question IS NULL OR marks_per_question > 0",
		}),
	}
}

type BlueprintConstraint struct{ ent.Schema }

func (BlueprintConstraint) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (BlueprintConstraint) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("blueprint_section_id", uuid.UUID{}).Immutable(),

		field.Enum("constraint_type").
			Values("difficulty", "bloom", "topic", "outcome", "type").
			Immutable(),

		field.JSON("value_json", shared.Metadata{}).SchemaType(pgJSONB()),

		field.Float("min_value").Optional().Nillable().SchemaType(pgNumeric(8, 3)),
		field.Float("max_value").Optional().Nillable().SchemaType(pgNumeric(8, 3)),
	}
}

func (BlueprintConstraint) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("section", BlueprintSection.Type).Ref("constraints").
			Field("blueprint_section_id").Unique().Required().Immutable(),
	}
}

func (BlueprintConstraint) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("blueprint_section_id", "constraint_type"),
	}
}

func (BlueprintConstraint) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("blueprint_constraints"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"blueprint_constraints_value_range": "min_value IS NULL OR max_value IS NULL OR " +
				"max_value >= min_value",
		}),
	}
}
