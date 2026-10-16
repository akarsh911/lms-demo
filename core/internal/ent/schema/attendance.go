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

type AttendanceDay struct{ ent.Schema }

func (AttendanceDay) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (AttendanceDay) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}),

		field.Time("attendance_date").Immutable().SchemaType(pgDate()),

		field.Enum("forenoon_status").
			Values("present", "absent", "late", "excused").
			Optional().Nillable(),
		field.Enum("afternoon_status").
			Values("present", "absent", "late", "excused").
			Optional().Nillable(),

		field.String("reason_code").Optional().Nillable().MaxLen(64),
		field.Text("remarks").Optional().Nillable(),

		field.Enum("source").Values("manual", "import", "device").Default("manual"),

		field.UUID("marked_by", uuid.UUID{}).Optional().Nillable(),
		field.Time("marked_at").Optional().Nillable().SchemaType(pgTimestamptz()),
	}
}

func (AttendanceDay) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("student", Student.Type).Unique().Required().Immutable().
			Field("student_id").Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().Field("academic_session_id"),
		edge.To("section", Section.Type).Unique().Required().Field("section_id"),
		edge.To("marker", Person.Type).Unique().Field("marked_by"),
	}
}

func (AttendanceDay) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_id", "attendance_date").Unique(),
		index.Fields("section_id", "attendance_date"),
		index.Fields("academic_session_id", "attendance_date"),
		index.Fields("student_id", "academic_session_id"),
	}
}

func (AttendanceDay) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("attendance_days"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"attendance_days_half_present": "forenoon_status IS NOT NULL OR afternoon_status IS NOT NULL",
		}),
	}
}

type AttendancePeriod struct{ ent.Schema }

func (AttendancePeriod) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (AttendancePeriod) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_offering_id", uuid.UUID{}),
		field.UUID("period_id", uuid.UUID{}),

		field.Time("attendance_date").Immutable().SchemaType(pgDate()),

		field.Enum("status").Values("present", "absent", "late", "excused"),

		field.UUID("timetable_slot_id", uuid.UUID{}).Optional().Nillable(),
		field.UUID("teacher_id", uuid.UUID{}).Optional().Nillable(),

		field.String("reason_code").Optional().Nillable().MaxLen(64),
		field.Text("remarks").Optional().Nillable(),

		field.Enum("source").Values("manual", "import", "device").Default("manual"),

		field.UUID("marked_by", uuid.UUID{}).Optional().Nillable(),
		field.Time("marked_at").Optional().Nillable().SchemaType(pgTimestamptz()),
	}
}

func (AttendancePeriod) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("period", Period.Type).Ref("period_attendance").
			Field("period_id").Unique().Required(),
		edge.From("timetable_slot", TimetableSlot.Type).Ref("period_attendance").
			Field("timetable_slot_id").Unique(),

		edge.To("student", Student.Type).Unique().Required().Immutable().
			Field("student_id").Annotations(entsql.OnDelete(entsql.Cascade)),
		edge.To("academic_session", AcademicSession.Type).Unique().Required().Immutable().Field("academic_session_id"),
		edge.To("subject_offering", SubjectOffering.Type).Unique().Required().Field("subject_offering_id"),
		edge.To("teacher", Teacher.Type).Unique().Field("teacher_id"),
		edge.To("marker", Person.Type).Unique().Field("marked_by"),
	}
}

func (AttendancePeriod) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_id", "attendance_date", "period_id").Unique(),
		index.Fields("subject_offering_id", "attendance_date", "period_id"),
		index.Fields("academic_session_id", "attendance_date"),
		index.Fields("student_id", "academic_session_id"),
		index.Fields("timetable_slot_id"),
	}
}

func (AttendancePeriod) Annotations() []schema.Annotation {
	return []schema.Annotation{table("attendance_periods"), entsql.WithComments(true)}
}
