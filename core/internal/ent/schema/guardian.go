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

type Guardian struct{ ent.Schema }

func (Guardian) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (Guardian) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("person_id", uuid.UUID{}).Unique().Immutable(),
		field.String("occupation").Optional().Nillable().MaxLen(200),
		field.String("employer").Optional().Nillable().MaxLen(255),
		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (Guardian) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("person", Person.Type).Ref("guardian").
			Field("person_id").Unique().Required().Immutable(),
		edge.To("student_links", StudentGuardian.Type).Annotations(entsql.OnDelete(entsql.Cascade)),
	}
}

func (Guardian) Annotations() []schema.Annotation {
	return []schema.Annotation{table("guardians"), entsql.WithComments(true)}
}

type StudentGuardian struct{ ent.Schema }

func (StudentGuardian) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentGuardian) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.UUID("guardian_id", uuid.UUID{}).Immutable(),

		field.String("relationship_type").NotEmpty().MaxLen(64).
			Comment("mother/father/guardian/grandparent/sibling. Free text: family shapes vary."),

		field.Bool("is_primary").Default(false).
			StructTag(`json:"is_primary"`).
			Comment("At most one primary guardian per student; enforced by a partial unique index in SQL."),
		field.Bool("is_emergency_contact").Default(false).
			StructTag(`json:"is_emergency_contact"`),

		field.Bool("can_pickup").Default(false).
			StructTag(`json:"can_pickup"`),
		field.Bool("can_view_academic").Default(true).
			StructTag(`json:"can_view_academic"`),
		field.Bool("can_view_finance").Default(false).
			StructTag(`json:"can_view_finance"`),

		field.Enum("status").Values("active", "inactive").Default("active"),
	}
}

func (StudentGuardian) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("student", Student.Type).Ref("guardian_links").
			Field("student_id").Unique().Required().Immutable(),

		edge.From("guardian", Guardian.Type).Ref("student_links").
			Field("guardian_id").Unique().Required().Immutable(),
	}
}

func (StudentGuardian) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_id", "guardian_id").Unique(),
		index.Fields("guardian_id"),
	}
}

func (StudentGuardian) Annotations() []schema.Annotation {
	return []schema.Annotation{table("student_guardians"), entsql.WithComments(true)}
}
