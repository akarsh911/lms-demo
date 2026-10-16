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

type ElectiveGroup struct{ ent.Schema }

func (ElectiveGroup) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ElectiveGroup) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("academic_session_id", uuid.UUID{}).Immutable(),
		field.UUID("section_id", uuid.UUID{}).Immutable(),

		field.String("name").NotEmpty().Validate(maxRunes(200)),
		field.String("code").NotEmpty().MaxLen(32),
		field.Text("description").Optional().Nillable(),

		field.Int("position").Default(0).NonNegative(),

		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (ElectiveGroup) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("academic_session", AcademicSession.Type).
			Unique().Required().Immutable().Field("academic_session_id"),

		edge.To("section", Section.Type).
			Unique().Required().Immutable().Field("section_id"),

		edge.To("offerings", ElectiveGroupOffering.Type).
			Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (ElectiveGroup) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("section_id", "code").Unique(),
		index.Fields("section_id", "position"),
		index.Fields("academic_session_id", "status"),
	}
}

func (ElectiveGroup) Annotations() []schema.Annotation {
	return []schema.Annotation{table("elective_groups"), entsql.WithComments(true)}
}

type ElectiveGroupOffering struct{ ent.Schema }

func (ElectiveGroupOffering) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (ElectiveGroupOffering) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("elective_group_id", uuid.UUID{}).Immutable(),
		field.UUID("subject_offering_id", uuid.UUID{}).Immutable(),

		field.Int("position").Default(0).NonNegative(),
	}
}

func (ElectiveGroupOffering) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("elective_group", ElectiveGroup.Type).Ref("offerings").
			Field("elective_group_id").Unique().Required().Immutable(),

		edge.To("subject_offering", SubjectOffering.Type).
			Unique().Required().Immutable().Field("subject_offering_id").
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ElectiveGroupOffering) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("subject_offering_id").Unique(),
		index.Fields("elective_group_id", "position"),
	}
}

func (ElectiveGroupOffering) Annotations() []schema.Annotation {
	return []schema.Annotation{table("elective_group_offerings"), entsql.WithComments(true)}
}
