package middleware

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const SchoolHeader = "X-School-Id"

type connKey struct{}

var tenantConnKey connKey

func RequireTenant(registry *postgres.Registry) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := r.Header.Get(SchoolHeader)
			if raw == "" {
				response.Error(w, http.StatusBadRequest, SchoolHeader+" header is required")
				return
			}

			ctx := r.Context()
			conn, err := resolveTenant(ctx, registry, raw)
			if err != nil {
				observability.Problem(ctx, observability.ComponentTenancy,
					"tenant not resolved", err, "requested", raw)
				writeTenantErr(w, err)
				return
			}

			if subject, subErr := authorization.SubjectFrom(ctx); subErr == nil {
				if subject.TenantID != "" && conn.Tenant.CASTenantID != "" &&
					subject.TenantID != conn.Tenant.CASTenantID {
					response.Error(w, http.StatusForbidden, "token tenant does not match "+SchoolHeader)
					return
				}
			}

			observability.Step(ctx, observability.ComponentTenancy, "tenant resolved",
				"school_id", conn.Tenant.SchoolID, "code", conn.Tenant.Code,
				"cas_tenant_id", conn.Tenant.CASTenantID)

			ctx = tenancy.WithTenant(ctx, conn.Tenant)
			ctx = postgres.WithConn(ctx, conn)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func resolveTenant(ctx context.Context, registry *postgres.Registry, raw string) (*postgres.TenantConn, error) {
	var (
		conn *postgres.TenantConn
		err  error
	)
	if id, parseErr := uuid.Parse(raw); parseErr == nil {
		conn, err = registry.Get(ctx, id)
	} else {
		conn, err = registry.GetByCode(ctx, raw)
	}
	if !errors.Is(err, tenancy.ErrUnknownSchool) {
		return conn, err
	}

	slugConn, slugErr := registry.GetByCASTenant(ctx, raw)
	if errors.Is(slugErr, tenancy.ErrUnknownSchool) {
		return nil, err
	}
	return slugConn, slugErr
}

func writeTenantErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, tenancy.ErrUnknownSchool):
		response.Error(w, http.StatusNotFound, "unknown school")
	case errors.Is(err, tenancy.ErrSchoolInactive):
		response.Error(w, http.StatusForbidden, "school is not active")
	case errors.Is(err, tenancy.ErrNoProfile):
		response.Error(w, http.StatusServiceUnavailable, "school has no database profile configured")
	default:
		response.ServerError(w, err)
	}
}

func OptionalTenant(registry *postgres.Registry) func(http.Handler) http.Handler {
	required := RequireTenant(registry)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get(SchoolHeader) == "" {
				next.ServeHTTP(w, r)
				return
			}
			required(next).ServeHTTP(w, r)
		})
	}
}
