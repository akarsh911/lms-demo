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

type CalendarDay struct{ ent.Schema }

func (CalendarDay) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (CalendarDay) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("branch_id", uuid.UUID{}).Immutable(),

		field.Time("calendar_date").Immutable().SchemaType(pgDate()),

		field.Enum("day_type").
			Values("instructional", "exam", "event", "holiday", "weekend", "vacation").
			Default("instructional"),

		field.Bool("forenoon_open").Default(true).StructTag(`json:"forenoon_open"`),
		field.Bool("afternoon_open").Default(true).StructTag(`json:"afternoon_open"`),

		field.Int("substitute_day_of_week").Optional().Nillable().Min(1).Max(7),

		field.String("name").Optional().Nillable().MaxLen(200),
		field.Text("notes").Optional().Nillable(),
	}
}

func (CalendarDay) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().Field("academic_session_id"),
		edge.To("branch", Branch.Type).Unique().Required().Immutable().Field("branch_id"),

		edge.To("schedules", CalendarDaySchedule.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("section_patterns", CalendarDaySectionPattern.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (CalendarDay) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("branch_id", "calendar_date").Unique(),
		index.Fields("academic_session_id", "calendar_date"),
		index.Fields("day_type"),
	}
}

func (CalendarDay) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("calendar_days"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"calendar_days_instructional_open": "day_type <> 'instructional' OR forenoon_open OR afternoon_open",
			"calendar_days_substitute_day_of_week": "substitute_day_of_week IS NULL OR " +
				"substitute_day_of_week BETWEEN 1 AND 7",
		}),
	}
}

type CalendarDaySectionPattern struct{ ent.Schema }

func (CalendarDaySectionPattern) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (CalendarDaySectionPattern) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("calendar_day_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}).Immutable(),

		field.Int("substitute_day_of_week").Min(1).Max(7),
	}
}

func (CalendarDaySectionPattern) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("calendar_day", CalendarDay.Type).Ref("section_patterns").
			Field("calendar_day_id").Unique().Required().Immutable(),
		edge.To("section", Section.Type).Unique().Required().Immutable().Field("section_id"),
	}
}

func (CalendarDaySectionPattern) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("calendar_day_id", "section_id").Unique(),
		index.Fields("section_id"),
	}
}

func (CalendarDaySectionPattern) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("calendar_day_section_patterns"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"calendar_day_section_patterns_day_of_week": "substitute_day_of_week BETWEEN 1 AND 7",
		}),
	}
}

type CalendarDaySchedule struct{ ent.Schema }

func (CalendarDaySchedule) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (CalendarDaySchedule) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("calendar_day_id", uuid.UUID{}).Immutable(),
		field.UUID("period_scheme_id", uuid.UUID{}).Immutable(),
		field.UUID("bell_schedule_id", uuid.UUID{}),
	}
}

func (CalendarDaySchedule) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("calendar_day", CalendarDay.Type).Ref("schedules").
			Field("calendar_day_id").Unique().Required().Immutable(),
		edge.From("period_scheme", PeriodScheme.Type).Ref("calendar_day_schedules").
			Field("period_scheme_id").Unique().Required().Immutable(),
		edge.From("bell_schedule", BellSchedule.Type).Ref("calendar_day_schedules").
			Field("bell_schedule_id").Unique().Required(),
	}
}

func (CalendarDaySchedule) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("calendar_day_id", "period_scheme_id").Unique(),
		index.Fields("period_scheme_id"),
		index.Fields("bell_schedule_id"),
	}
}

func (CalendarDaySchedule) Annotations() []schema.Annotation {
	return []schema.Annotation{table("calendar_day_schedules"), entsql.WithComments(true)}
}
