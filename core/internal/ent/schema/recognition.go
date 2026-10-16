package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/shared"
)

type Achievement struct{ ent.Schema }

func (Achievement) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Achievement) Fields() []ent.Field {
	return []ent.Field{
		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.String("code").NotEmpty().MaxLen(64).Unique(),
		field.Text("description").Optional().Nillable(),

		field.Enum("category").
			Values("academic", "attendance", "behavioral", "co_curricular", "leadership", "other").
			Default("academic"),

		field.Enum("tier").Values("bronze", "silver", "gold", "platinum").Optional().Nillable(),

		field.UUID("badge_asset_id", uuid.UUID{}).Optional().Nillable(),

		field.Int("points").Optional().Nillable().NonNegative(),

		field.Enum("award_mode").Values("manual", "auto_rule").Default("manual"),
		field.JSON("criteria_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),

		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Achievement) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("badge_asset", Asset.Type).Unique().Field("badge_asset_id"),

		edge.To("awards", StudentAchievement.Type),
	}
}

func (Achievement) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("category", "status"),
		index.Fields("badge_asset_id"),
	}
}

func (Achievement) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("achievements"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"achievements_auto_rule_has_criteria": "award_mode <> 'auto_rule' OR criteria_json IS NOT NULL",
		}),
	}
}

type StudentAchievement struct{ ent.Schema }

func (StudentAchievement) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentAchievement) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.UUID("achievement_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),

		field.UUID("awarded_by", uuid.UUID{}).Optional().Nillable().Immutable(),
		field.Time("awarded_at").Default(time.Now).Immutable().
			Annotations(entsql.Default("now()")).SchemaType(pgTimestamptz()),

		field.Enum("source_type").
			Values("assessment_instance", "attendance_record", "assignment_submission", "manual", "rule_engine").
			Optional().Nillable().Immutable(),
		field.UUID("source_id", uuid.UUID{}).Optional().Nillable().Immutable(),
		field.JSON("evidence_json", shared.Metadata{}).Optional().SchemaType(pgJSONB()),

		field.Bool("is_featured").Default(false),
		field.Int("display_order").Optional().Nillable().NonNegative(),

		field.Enum("status").Values("awarded", "revoked").Default("awarded"),
	}
}

func (StudentAchievement) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("student", Student.Type).Unique().Required().Immutable().Field("student_id"),
		edge.From("achievement", Achievement.Type).Ref("awards").
			Field("achievement_id").Unique().Required().Immutable(),
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().
			Field("academic_session_id"),
		edge.To("awarder", Person.Type).Unique().Immutable().Field("awarded_by"),
	}
}

func (StudentAchievement) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_id", "achievement_id", "academic_session_id").Unique(),
		index.Fields("student_id", "is_featured"),
		index.Fields("academic_session_id", "achievement_id"),
		index.Fields("achievement_id"),
		index.Fields("awarded_by"),
		index.Fields("status", "awarded_at"),
	}
}

func (StudentAchievement) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("student_achievements"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"student_achievements_evidence_paired": "(source_type IS NULL) = (source_id IS NULL)",
			"student_achievements_order_featured":  "display_order IS NULL OR is_featured",
		}),
	}
}

type Praise struct{ ent.Schema }

func (Praise) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Praise) Fields() []ent.Field {
	return []ent.Field{
		field.Enum("recipient_type").Values("student", "staff").Immutable(),
		field.UUID("recipient_id", uuid.UUID{}).Immutable(),

		field.UUID("given_by_person_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),

		field.Enum("category").
			Values("effort", "teamwork", "helpfulness", "leadership", "kindness", "improvement", "other").
			Optional().Nillable(),

		field.Text("message").NotEmpty(),

		field.UUID("related_achievement_id", uuid.UUID{}).Optional().Nillable(),

		field.Enum("visibility").Values("public", "class_only", "private").Default("class_only"),
		field.Enum("status").Values("active", "hidden", "removed").Default("active"),
	}
}

func (Praise) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("giver", Person.Type).Unique().Required().Immutable().Field("given_by_person_id"),
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().
			Field("academic_session_id"),
		edge.To("related_achievement", Achievement.Type).Unique().Field("related_achievement_id"),

		edge.To("reactions", PraiseReaction.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (Praise) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("recipient_type", "recipient_id", "created_at"),
		index.Fields("academic_session_id"),
		index.Fields("given_by_person_id", "created_at"),
		index.Fields("related_achievement_id"),
		index.Fields("status", "visibility"),
	}
}

func (Praise) Annotations() []schema.Annotation {
	return []schema.Annotation{table("praises"), entsql.WithComments(true)}
}

type PraiseReaction struct{ ent.Schema }

func (PraiseReaction) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (PraiseReaction) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("praise_id", uuid.UUID{}).Immutable(),
		field.UUID("reactor_person_id", uuid.UUID{}).Immutable(),

		field.Enum("reaction_type").
			Values("like", "heart", "clap", "celebrate", "insightful").
			Immutable(),
	}
}

func (PraiseReaction) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("praise", Praise.Type).Ref("reactions").
			Field("praise_id").Unique().Required().Immutable(),
		edge.To("reactor", Person.Type).Unique().Required().Immutable().Field("reactor_person_id"),
	}
}

func (PraiseReaction) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("praise_id", "reactor_person_id", "reaction_type").Unique(),
		index.Fields("reactor_person_id"),
	}
}

func (PraiseReaction) Annotations() []schema.Annotation {
	return []schema.Annotation{table("praise_reactions"), entsql.WithComments(true)}
}
