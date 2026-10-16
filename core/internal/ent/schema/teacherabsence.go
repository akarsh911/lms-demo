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

type TeacherAbsence struct{ ent.Schema }

func (TeacherAbsence) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (TeacherAbsence) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("teacher_id", uuid.UUID{}).Immutable(),

		field.Time("from_date").SchemaType(pgDate()),
		field.Time("to_date").SchemaType(pgDate()),

		field.Enum("from_half").Values("forenoon", "afternoon").Default("forenoon"),
		field.Enum("to_half").Values("forenoon", "afternoon").Default("afternoon"),

		field.Enum("status").Values("recorded", "withdrawn").Default("recorded"),

		field.Text("reason").Optional().Nillable(),

		field.UUID("recorded_by", uuid.UUID{}).Optional().Nillable(),

		field.Time("withdrawn_at").Optional().Nillable().SchemaType(pgTimestamptz()),
		field.UUID("withdrawn_by", uuid.UUID{}).Optional().Nillable(),
		field.Text("withdrawal_reason").Optional().Nillable(),
	}
}

func (TeacherAbsence) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("teacher", Teacher.Type).Unique().Required().Immutable().
			Field("teacher_id").Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("recorder", Person.Type).Unique().Field("recorded_by"),
		edge.To("withdrawer", Person.Type).Unique().Field("withdrawn_by"),
	}
}

func (TeacherAbsence) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("teacher_id", "from_date"),
		index.Fields("from_date", "to_date"),
		index.Fields("teacher_id", "from_date", "from_half", "to_date", "to_half").
			Unique().
			Annotations(entsql.IndexWhere("status = 'recorded'")),
	}
}

func (TeacherAbsence) Annotations() []schema.Annotation {
	return []schema.Annotation{
		table("teacher_absences"),
		entsql.WithComments(true),
		entsql.Checks(map[string]string{
			"teacher_absences_window_ordered": "to_date > from_date OR (to_date = from_date AND (from_half = 'forenoon' OR to_half = 'afternoon'))",
			"teacher_absences_withdrawal_dated": "(status = 'withdrawn' AND withdrawn_at IS NOT NULL) OR " +
				"(status <> 'withdrawn' AND withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdrawal_reason IS NULL)",
		}),
	}
}
