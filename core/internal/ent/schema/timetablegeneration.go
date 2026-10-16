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

type TimetableGenerationJob struct{ ent.Schema }

func (TimetableGenerationJob) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (TimetableGenerationJob) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("timetable_id", uuid.UUID{}).Immutable(),

		field.Enum("status").
			Values("queued", "running", "succeeded", "infeasible", "failed").
			Default("queued"),

		field.UUID("requested_by", uuid.UUID{}).Optional().Nillable(),

		field.Int("max_seconds").Min(1).Max(120).Default(60).Immutable(),

		field.JSON("options", shared.GenerationOptions{}).Optional().SchemaType(pgJSONB()),

		field.Time("started_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.Time("finished_at").Optional().Nillable().SchemaType(pgTimestamptz()),

		field.Int("slots_written").NonNegative().Default(0),
		field.Int("wall_time_ms").NonNegative().Default(0),

		field.String("solver_status").Optional().Nillable().MaxLen(32),
		field.String("verdict").Optional().Nillable().MaxLen(64),
		field.Float("objective").Optional().Nillable(),

		field.Enum("failure_reason").
			Values("invalid", "unreachable", "refused", "timeout", "clash", "internal").
			Optional().Nillable(),

		field.String("detail").Optional().Nillable().MaxLen(2000),

		field.JSON("core_keys", []string{}).Optional().SchemaType(pgJSONB()),
		field.JSON("warnings", []string{}).Optional().SchemaType(pgJSONB()),
		field.JSON("soft_violations", []shared.SolverViolation{}).Optional().SchemaType(pgJSONB()),
	}
}

func (TimetableGenerationJob) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("timetable", Timetable.Type).Ref("generation_jobs").
			Field("timetable_id").Unique().Required().Immutable(),
		edge.To("requester", Person.Type).Unique().Field("requested_by"),
	}
}

func (TimetableGenerationJob) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("timetable_id", "created_at"),
		index.Fields("status", "created_at"),
		index.Fields("timetable_id").
			Unique().
			Annotations(entsql.IndexWhere("(status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying])::text[])")),
	}
}

func (TimetableGenerationJob) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("timetable_generation_jobs"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"timetable_generation_jobs_terminal_finished": "status IN ('queued', 'running') OR finished_at IS NOT NULL",
			"timetable_generation_jobs_failure_named":     "status <> 'failed' OR failure_reason IS NOT NULL",
			"timetable_generation_jobs_success_is_silent": "status = 'failed' OR failure_reason IS NULL",
		}),
	}
}
