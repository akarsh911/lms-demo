package tenancy

import "context"

type contextKey struct{}

var tenantKey contextKey

func WithTenant(ctx context.Context, t *Tenant) context.Context {
	return context.WithValue(ctx, tenantKey, t)
}

func FromContext(ctx context.Context) (*Tenant, error) {
	t, ok := ctx.Value(tenantKey).(*Tenant)
	if !ok || t == nil {
		return nil, ErrNoTenant
	}
	return t, nil
}
