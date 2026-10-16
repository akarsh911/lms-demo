package postgres

import (
	"context"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
)

type connCtxKey struct{}

var connKey connCtxKey

func WithConn(ctx context.Context, conn *TenantConn) context.Context {
	return context.WithValue(ctx, connKey, conn)
}

func ConnFromContext(ctx context.Context) (*TenantConn, error) {
	conn, ok := ctx.Value(connKey).(*TenantConn)
	if !ok || conn == nil {
		return nil, tenancy.ErrNoTenant
	}
	return conn, nil
}

func ClientFromContext(ctx context.Context) (*tenantent.Client, error) {
	conn, err := ConnFromContext(ctx)
	if err != nil {
		return nil, err
	}
	return conn.Client, nil
}
