package schema

import (
	"fmt"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/mixin"
	"github.com/google/uuid"
)

type BaseMixin struct {
	mixin.Schema
}

func (BaseMixin) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("id", uuid.UUID{}).
			Default(uuid.New).
			Immutable().
			SchemaType(map[string]string{dialect.Postgres: "uuid"}),
		field.Time("created_at").
			Default(time.Now).
			Immutable().
			Annotations(entsql.Default("now()")).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now).
			Annotations(entsql.Default("now()")).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
	}
}

func pgDate() map[string]string {
	return map[string]string{dialect.Postgres: "date"}
}

func pgTimestamptz() map[string]string {
	return map[string]string{dialect.Postgres: "timestamptz"}
}

func pgJSONB() map[string]string {
	return map[string]string{dialect.Postgres: "jsonb"}
}

func table(name string) schema.Annotation {
	return entsql.Annotation{Table: name}
}

func pgNumeric(precision, scale int) map[string]string {
	return map[string]string{
		dialect.Postgres: fmt.Sprintf("numeric(%d,%d)", precision, scale),
	}
}
