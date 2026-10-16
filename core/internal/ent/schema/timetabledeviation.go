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

type TimetableDeviation struct{ ent.Schema }

func (TimetableDeviation) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (TimetableDeviation) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("timetable_slot_id", uuid.UUID{}).Optional().Nillable(),

		field.Time("deviation_date").Immutable().SchemaType(pgDate()),

		field.Enum("kind").
			Values("cancelled", "substitution", "room_change", "time_change", "added"),

		field.UUID("section_id", uuid.UUID{}),
		field.UUID("period_id", uuid.UUID{}),
		field.UUID("subject_offering_id", uuid.UUID{}).Optional().Nillable(),

		field.UUID("substitute_teacher_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("room_id", uuid.UUID{}).Optional().Nillable(),

		field.Int("start_minute").Optional().Nillable().Min(0).Max(1440),
		field.Int("end_minute").Optional().Nillable().Min(0).Max(1440),

		field.Text("reason").Optional().Nillable(),

		field.UUID("created_by", uuid.UUID{}).Optional().Nillable(),

		field.UUID("exam_sitting_id", uuid.UUID{}).Optional().Nillable(),
	}
}

func (TimetableDeviation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("timetable_slot", TimetableSlot.Type).Ref("deviations").
			Field("timetable_slot_id").Unique(),
		edge.From("period", Period.Type).Ref("deviations").
			Field("period_id").Unique().Required(),
		edge.From("room", Room.Type).Ref("deviations").
			Field("room_id").Unique(),

		edge.To("section", Section.Type).Unique().Required().Field("section_id"),
		edge.To("subject_offering", SubjectOffering.Type).Unique().
			Field("subject_offering_id").Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("substitute_teacher", Teacher.Type).Unique().
			Field("substitute_teacher_id").Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("creator", Person.Type).Unique().Field("created_by"),
		edge.To("exam_sitting", ExamSitting.Type).Unique().
			Field("exam_sitting_id").Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (TimetableDeviation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("timetable_slot_id", "deviation_date").Unique(),
		index.Fields("section_id", "deviation_date", "period_id", "subject_offering_id").
			Unique().
			Annotations(entsql.IndexWhere("timetable_slot_id IS NULL")),
		index.Fields("deviation_date"),
		index.Fields("section_id", "deviation_date"),
		index.Fields("substitute_teacher_id", "deviation_date"),
		index.Fields("room_id", "deviation_date"),
		index.Fields("exam_sitting_id"),
	}
}

func (TimetableDeviation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("timetable_deviations"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"timetable_deviations_added_has_no_slot":  "(kind = 'added' AND timetable_slot_id IS NULL AND subject_offering_id IS NOT NULL) OR (kind <> 'added' AND timetable_slot_id IS NOT NULL)",
			"timetable_deviations_substitute_present": "kind <> 'substitution' OR substitute_teacher_id IS NOT NULL",
			"timetable_deviations_room_present":       "kind <> 'room_change' OR room_id IS NOT NULL",
			"timetable_deviations_time_present":       "kind <> 'time_change' OR (start_minute IS NOT NULL AND end_minute IS NOT NULL)",
			"timetable_deviations_minute_range":       "(start_minute IS NULL AND end_minute IS NULL) OR (start_minute >= 0 AND end_minute > start_minute AND end_minute <= 1440)",
		}),
	}
}
