package ent

//go:generate go run -mod=mod entgo.io/ent/cmd/ent generate --target ./generated --feature sql/upsert,sql/execquery,sql/versioned-migration,intercept ./schema
//go:generate go run -mod=mod entgo.io/ent/cmd/ent generate --target ./control/generated --feature sql/upsert,sql/execquery,sql/versioned-migration,intercept ./control/schema
