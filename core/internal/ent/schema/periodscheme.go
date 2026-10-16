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

type PeriodScheme struct{ ent.Schema }

func (PeriodScheme) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (PeriodScheme) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("branch_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().MaxLen(120),
		field.String("code").NotEmpty().MaxLen(32),
		field.Text("description").Optional().Nillable(),

		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (PeriodScheme) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().Field("academic_session_id"),
		edge.To("branch", Branch.Type).Unique().Required().Immutable().Field("branch_id"),

		edge.To("grade_levels", PeriodSchemeGradeLevel.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("periods", Period.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("bell_schedules", BellSchedule.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("timetables", Timetable.Type),
		edge.To("calendar_day_schedules", CalendarDaySchedule.Type),
	}
}

func (PeriodScheme) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("academic_session_id", "branch_id", "code").Unique(),
		index.Fields("academic_session_id", "branch_id", "status"),
	}
}

func (PeriodScheme) Annotations() []schema.Annotation {
	return []schema.Annotation{table("period_schemes"), entsql.WithComments(true)}
}

type PeriodSchemeGradeLevel struct{ ent.Schema }

func (PeriodSchemeGradeLevel) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (PeriodSchemeGradeLevel) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("period_scheme_id", uuid.UUID{}).Immutable(),
		field.UUID("grade_level_id", uuid.UUID{}).Immutable(),

		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("branch_id", uuid.UUID{}).Immutable(),
	}
}

func (PeriodSchemeGradeLevel) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("period_scheme", PeriodScheme.Type).Ref("grade_levels").
			Field("period_scheme_id").Unique().Required().Immutable(),

		edge.To("grade_level", GradeLevel.Type).Unique().Required().Immutable().Field("grade_level_id"),
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().Field("academic_session_id"),
		edge.To("branch", Branch.Type).Unique().Required().Immutable().Field("branch_id"),
	}
}

func (PeriodSchemeGradeLevel) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("period_scheme_id", "grade_level_id").Unique(),
		index.Fields("academic_session_id", "branch_id", "grade_level_id").Unique(),
	}
}

func (PeriodSchemeGradeLevel) Annotations() []schema.Annotation {
	return []schema.Annotation{table("period_scheme_grade_levels"), entsql.WithComments(true)}
}

type Period struct{ ent.Schema }

func (Period) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Period) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("period_scheme_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().MaxLen(64),
		field.String("code").NotEmpty().MaxLen(32),
		field.Int("sequence").NonNegative(),

		field.Enum("kind").Values("teaching", "break", "assembly", "other").Default("teaching"),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Period) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("period_scheme", PeriodScheme.Type).Ref("periods").
			Field("period_scheme_id").Unique().Required().Immutable(),

		edge.To("bell_schedule_periods", BellSchedulePeriod.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("timetable_slots", TimetableSlot.Type),
		edge.To("period_attendance", AttendancePeriod.Type),
		edge.To("deviations", TimetableDeviation.Type).Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (Period) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("period_scheme_id", "sequence").Unique(),
		index.Fields("period_scheme_id", "code").Unique(),
		index.Fields("period_scheme_id", "status"),
	}
}

func (Period) Annotations() []schema.Annotation {
	return []schema.Annotation{table("periods"), entsql.WithComments(true)}
}

type BellSchedule struct{ ent.Schema }

func (BellSchedule) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (BellSchedule) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("period_scheme_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().MaxLen(120),
		field.String("code").NotEmpty().MaxLen(32),
		field.Bool("is_default").Default(false).StructTag(`json:"is_default"`),

		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (BellSchedule) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("period_scheme", PeriodScheme.Type).Ref("bell_schedules").
			Field("period_scheme_id").Unique().Required().Immutable(),

		edge.To("periods", BellSchedulePeriod.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("calendar_day_schedules", CalendarDaySchedule.Type),
	}
}

func (BellSchedule) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("period_scheme_id", "code").Unique(),
		index.Fields("period_scheme_id").
			Unique().
			Annotations(entsql.IndexWhere("is_default")),
	}
}

func (BellSchedule) Annotations() []schema.Annotation {
	return []schema.Annotation{table("bell_schedules"), entsql.WithComments(true)}
}

type BellSchedulePeriod struct{ ent.Schema }

func (BellSchedulePeriod) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (BellSchedulePeriod) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("bell_schedule_id", uuid.UUID{}).Immutable(),
		field.UUID("period_id", uuid.UUID{}).Immutable(),

		field.Int("start_minute").Min(0).Max(1440),
		field.Int("end_minute").Min(0).Max(1440),

		field.Bool("runs").Default(true).StructTag(`json:"runs"`),
	}
}

func (BellSchedulePeriod) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("bell_schedule", BellSchedule.Type).Ref("periods").
			Field("bell_schedule_id").Unique().Required().Immutable(),
		edge.From("period", Period.Type).Ref("bell_schedule_periods").
			Field("period_id").Unique().Required().Immutable(),
	}
}

func (BellSchedulePeriod) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("bell_schedule_id", "period_id").Unique(),
		index.Fields("bell_schedule_id", "start_minute"),
		index.Fields("period_id"),
	}
}

func (BellSchedulePeriod) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("bell_schedule_periods"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"bell_schedule_periods_minute_range": "start_minute >= 0 AND end_minute > start_minute AND end_minute <= 1440",
		}),
	}
}
