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

type PaperGenerationRun struct{ ent.Schema }

func (PaperGenerationRun) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (PaperGenerationRun) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("blueprint_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Optional().Nillable().Immutable(),

		field.Enum("generation_method").Values("ai", "manual", "hybrid").Default("ai").Immutable(),

		field.String("algorithm").Optional().Nillable().Validate(maxRunes(64)),
		field.String("model_version").Optional().Nillable().Validate(maxRunes(128)),

		field.Enum("status").Values("queued", "running", "completed", "failed").Default("queued"),

		field.UUID("requested_by", uuid.UUID{}).Immutable(),

		field.Time("started_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.Time("completed_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.Text("prompt").Optional().Nillable(),
		field.String("prompt_hash").Optional().Nillable().MaxLen(64),

		field.Int("input_tokens").Optional().Nillable().NonNegative(),
		field.Int("output_tokens").Optional().Nillable().NonNegative(),

		field.Float("cost_amount").Optional().Nillable().SchemaType(pgNumeric(12, 6)),
		field.String("cost_currency").Optional().Nillable().MaxLen(3),

		field.Text("failure_reason").Optional().Nillable(),
	}
}

func (PaperGenerationRun) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("blueprint", Blueprint.Type).
			Unique().Required().Immutable().Field("blueprint_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("academic_session", AcademicSession.Type).
			Unique().Immutable().Field("academic_session_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("requester", Person.Type).
			Unique().Required().Immutable().Field("requested_by").
			Annotations(entsql.OnDelete(entsql.NoAction)),

		edge.To("papers", Paper.Type),
	}
}

func (PaperGenerationRun) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("blueprint_id", "status"),
		index.Fields("academic_session_id"),
		index.Fields("requested_by"),
		index.Fields("status", "created_at"),
	}
}

func (PaperGenerationRun) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("paper_generation_runs"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"paper_generation_runs_window_range": "started_at IS NULL OR completed_at IS NULL OR " +
				"completed_at >= started_at",
			"paper_generation_runs_cost_paired": "(cost_amount IS NULL AND cost_currency IS NULL) " +
				"OR (cost_amount IS NOT NULL AND cost_currency IS NOT NULL)",
			"paper_generation_runs_cost_not_negative": "cost_amount IS NULL OR cost_amount >= 0",
		}),
	}
}

type Paper struct{ ent.Schema }

func (Paper) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Paper) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),

		field.UUID("exam_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("blueprint_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("generation_run_id", uuid.UUID{}).Optional().Nillable().Immutable(),
		field.UUID("grade_level_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("subject_id", uuid.UUID{}).Optional().Nillable(),

		field.String("paper_code").NotEmpty().MaxLen(64).Immutable(),
		field.String("title").NotEmpty().Validate(maxRunes(200)),

		field.Int("version").Positive().Default(1).Immutable(),

		field.Enum("status").
			Values("draft", "reviewed", "approved", "published").
			Default("draft"),

		field.Float("total_marks").Positive().SchemaType(pgNumeric(8, 2)),
		field.Int("duration_minutes").Optional().Nillable().Positive(),

		field.UUID("approved_by", uuid.UUID{}).Optional().Nillable(),
		field.Time("approved_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.String("engine_document_id").Optional().Nillable().MaxLen(128),
		field.JSON("provenance_json", &shared.PaperProvenance{}).Optional().SchemaType(pgJSONB()),
	}
}

func (Paper) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).
			Unique().Required().Immutable().Field("academic_session_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("exam", Exam.Type).Unique().Field("exam_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("blueprint", Blueprint.Type).Unique().Field("blueprint_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("generation_run", PaperGenerationRun.Type).Ref("papers").
			Field("generation_run_id").Unique().Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("approver", Person.Type).Unique().Field("approved_by").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("grade_level", GradeLevel.Type).Unique().Field("grade_level_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("subject", Subject.Type).Unique().Field("subject_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),

		edge.To("sections", PaperSection.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("target_sections", PaperTargetSection.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (Paper) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "paper_code", "version").Unique(),
		index.Fields("academic_session_id", "status"),
		index.Fields("exam_id"),
		index.Fields("blueprint_id"),
		index.Fields("generation_run_id"),
		index.Fields("grade_level_id", "status"),
		index.Fields("subject_id", "status"),
		index.Fields("engine_document_id"),
	}
}

func (Paper) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("papers"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"papers_approval_paired": "(approved_by IS NULL AND approved_at IS NULL) " +
				"OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)",
		}),
	}
}

type PaperTargetSection struct{ ent.Schema }

func (PaperTargetSection) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (PaperTargetSection) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("paper_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}).Immutable(),
	}
}

func (PaperTargetSection) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("paper", Paper.Type).Ref("target_sections").
			Field("paper_id").Unique().Required().Immutable(),

		edge.To("section", Section.Type).
			Unique().Required().Immutable().Field("section_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (PaperTargetSection) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("paper_id", "section_id").Unique(),
		index.Fields("section_id"),
	}
}

func (PaperTargetSection) Annotations() []schema.Annotation {
	return []schema.Annotation{table("paper_target_sections"), entsql.WithComments(true)}
}

type PaperSection struct{ ent.Schema }

func (PaperSection) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (PaperSection) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("paper_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.String("code").NotEmpty().MaxLen(32),

		field.Int("position").Positive(),

		field.Text("instructions").Optional().Nillable(),
	}
}

func (PaperSection) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("paper", Paper.Type).Ref("sections").
			Field("paper_id").Unique().Required().Immutable(),

		edge.To("questions", PaperQuestion.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (PaperSection) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("paper_id", "code").Unique(),
		index.Fields("paper_id", "position").Unique(),
	}
}

func (PaperSection) Annotations() []schema.Annotation {
	return []schema.Annotation{table("paper_sections"), entsql.WithComments(true)}
}

type PaperQuestion struct{ ent.Schema }

func (PaperQuestion) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (PaperQuestion) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("paper_section_id", uuid.UUID{}).Immutable(),
		field.UUID("question_id", uuid.UUID{}).Immutable(),
		field.UUID("question_version_id", uuid.UUID{}).Immutable(),

		field.String("question_number").NotEmpty().MaxLen(32),
		field.Float("marks").Positive().SchemaType(pgNumeric(8, 2)),
		field.Int("position").Positive(),

		field.String("variant_group").Optional().Nillable().MaxLen(64),
	}
}

func (PaperQuestion) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("section", PaperSection.Type).Ref("questions").
			Field("paper_section_id").Unique().Required().Immutable(),

		edge.To("question", Question.Type).
			Unique().Required().Immutable().Field("question_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("question_version", QuestionVersion.Type).
			Unique().Required().Immutable().Field("question_version_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (PaperQuestion) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("paper_section_id", "position").Unique(),
		index.Fields("paper_section_id", "question_number"),
		index.Fields("question_id"),
		index.Fields("question_version_id"),
		index.Fields("variant_group"),
	}
}

func (PaperQuestion) Annotations() []schema.Annotation {
	return []schema.Annotation{table("paper_questions"), entsql.WithComments(true)}
}
