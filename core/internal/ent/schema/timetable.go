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

type Timetable struct{ ent.Schema }

func (Timetable) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Timetable) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("period_scheme_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().MaxLen(120),
		field.Int("version").Positive().Default(1),

		field.Time("effective_from").SchemaType(pgDate()),
		field.Time("effective_to").Optional().Nillable().SchemaType(pgDate()),

		field.Enum("status").
			Values("draft", "published", "superseded", "archived").
			Default("draft"),

		field.UUID("supersedes_id", uuid.UUID{}).Optional().Nillable(),

		field.Time("published_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.UUID("published_by", uuid.UUID{}).Optional().Nillable(),
	}
}

func (Timetable) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().Field("academic_session_id"),
		edge.From("period_scheme", PeriodScheme.Type).Ref("timetables").
			Field("period_scheme_id").Unique().Required().Immutable(),

		edge.To("slots", TimetableSlot.Type).Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("covered_sections", TimetableSection.Type).Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("generation_jobs", TimetableGenerationJob.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("superseded_by", Timetable.Type).
			From("supersedes").
			Unique().
			Field("supersedes_id"),

		edge.To("publisher", Person.Type).Unique().Field("published_by"),
	}
}

func (Timetable) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("period_scheme_id", "status", "effective_from"),
		index.Fields("period_scheme_id", "effective_from").
			Unique().
			Annotations(entsql.IndexWhere("status = 'published'")),
		index.Fields("academic_session_id", "status"),
		index.Fields("supersedes_id"),
	}
}

func (Timetable) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("timetables"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"timetables_effective_range": "effective_to IS NULL OR effective_to >= effective_from",
		}),
	}
}

type TimetableSection struct{ ent.Schema }

func (TimetableSection) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (TimetableSection) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("timetable_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}).Immutable(),
	}
}

func (TimetableSection) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("timetable", Timetable.Type).Ref("covered_sections").
			Field("timetable_id").Unique().Required().Immutable(),
		edge.To("section", Section.Type).Unique().Required().Immutable().Field("section_id"),
	}
}

func (TimetableSection) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("timetable_id", "section_id").Unique(),
		index.Fields("section_id"),
	}
}

func (TimetableSection) Annotations() []schema.Annotation {
	return []schema.Annotation{table("timetable_sections"), entsql.WithComments(true)}
}

type TimetableSlot struct{ ent.Schema }

func (TimetableSlot) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (TimetableSlot) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("timetable_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}),
		field.UUID("period_id", uuid.UUID{}),

		field.Int("day_of_week").Min(1).Max(7),

		field.UUID("subject_offering_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("teacher_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("room_id", uuid.UUID{}).Optional().Nillable(),

		field.String("label").Optional().Nillable().MaxLen(120),

		field.Bool("clash_override").Default(false),
		field.String("clash_override_reason").Optional().Nillable().MaxLen(500),
		field.UUID("clash_overridden_by", uuid.UUID{}).Optional().Nillable(),
		field.Time("clash_overridden_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.JSON("clash_override_json", []shared.AcceptedClash{}).Optional().SchemaType(pgJSONB()),
	}
}

func (TimetableSlot) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("timetable", Timetable.Type).Ref("slots").
			Field("timetable_id").Unique().Required().Immutable(),
		edge.From("period", Period.Type).Ref("timetable_slots").
			Field("period_id").Unique().Required(),
		edge.From("room", Room.Type).Ref("timetable_slots").
			Field("room_id").Unique(),

		edge.To("section", Section.Type).Unique().Required().Field("section_id"),
		edge.To("subject_offering", SubjectOffering.Type).Unique().Field("subject_offering_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("teacher", Teacher.Type).Unique().Field("teacher_id"),

		edge.To("period_attendance", AttendancePeriod.Type).Annotations(entsql.OnDelete(entsql.SetNull)),
		edge.To("deviations", TimetableDeviation.Type).Annotations(entsql.OnDelete(entsql.Cascade)),

		edge.To("clash_override_author", Person.Type).Unique().Field("clash_overridden_by"),
	}
}

func (TimetableSlot) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("timetable_id", "section_id", "day_of_week", "period_id", "subject_offering_id").Unique(),
		index.Fields("timetable_id", "day_of_week", "period_id"),
		index.Fields("timetable_id", "teacher_id", "day_of_week", "period_id"),
		index.Fields("timetable_id", "room_id", "day_of_week", "period_id"),
		index.Fields("section_id", "day_of_week"),
		index.Fields("subject_offering_id"),
		index.Fields("timetable_id", "clash_override").
			Annotations(entsql.IndexWhere("clash_override")),
	}
}

func (TimetableSlot) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("timetable_slots"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"timetable_slots_subject_or_label": "subject_offering_id IS NOT NULL OR label IS NOT NULL",
			"timetable_slots_override_reason": "clash_override IS FALSE OR " +
				"(clash_override_reason IS NOT NULL AND btrim(clash_override_reason) <> '')",
			"timetable_slots_day_of_week": "day_of_week >= 1 AND day_of_week <= 7",
		}),
	}
}
