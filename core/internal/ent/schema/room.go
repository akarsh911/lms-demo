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

type Room struct{ ent.Schema }

func (Room) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Room) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("branch_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().MaxLen(120),
		field.String("code").NotEmpty().MaxLen(32),
		field.String("room_type").NotEmpty().MaxLen(64).Default("classroom"),

		field.String("building").Optional().Nillable().MaxLen(120),
		field.String("floor").Optional().Nillable().MaxLen(32),
		field.Int("capacity").Optional().Nillable().Positive(),

		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Room) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("branch", Branch.Type).Unique().Required().Immutable().Field("branch_id"),

		edge.To("sections", Section.Type).Annotations(entsql.OnDelete(entsql.SetNull)),
		edge.To("timetable_slots", TimetableSlot.Type).Annotations(entsql.OnDelete(entsql.SetNull)),
		edge.To("deviations", TimetableDeviation.Type).Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (Room) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("branch_id", "code").Unique(),
		index.Fields("branch_id", "status"),
		index.Fields("room_type"),
	}
}

func (Room) Annotations() []schema.Annotation {
	return []schema.Annotation{table("rooms"), entsql.WithComments(true)}
}
