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

type StudentDocument struct{ ent.Schema }

func (StudentDocument) Mixin() []ent.Mixin { return []ent.Mixin{BaseMixin{}} }

func (StudentDocument) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("student_id", uuid.UUID{}).Immutable(),
		field.String("document_type").NotEmpty().MaxLen(64),
		field.UUID("asset_id", uuid.UUID{}).Immutable(),
		field.String("document_number").Optional().Nillable().MaxLen(128),
		field.String("issued_by").Optional().Nillable().MaxLen(255),
		field.Time("issued_at").Optional().Nillable().SchemaType(pgDate()),
		field.Time("expires_at").Optional().Nillable().SchemaType(pgDate()),
		field.UUID("academic_session_id", uuid.UUID{}).Optional().Nillable(),
		field.Enum("verification_status").
			Values("unverified", "pending", "verified", "rejected").
			Default("unverified"),
		field.UUID("verified_by", uuid.UUID{}).Optional().Nillable(),
		field.Time("verified_at").Optional().Nillable().SchemaType(pgTimestamptz()),
	}
}

func (StudentDocument) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("student", Student.Type).Ref("documents").
			Field("student_id").Unique().Required().Immutable(),
		edge.From("academic_session", AcademicSession.Type).Ref("student_documents").
			Field("academic_session_id").Unique(),

		edge.To("verifier", Person.Type).Unique().Field("verified_by"),
	}
}

func (StudentDocument) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("student_id", "document_type"),
		index.Fields("verification_status"),
		index.Fields("expires_at"),
	}
}

func (StudentDocument) Annotations() []schema.Annotation {
	return []schema.Annotation{table("student_documents"), entsql.WithComments(true)}
}
