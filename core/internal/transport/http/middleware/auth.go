package middleware

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/cas"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

func Authenticate(verifier *cas.Verifier, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := r.Header.Get("Authorization")
			if raw == "" {
				response.Error(w, http.StatusUnauthorized, "an Authorization bearer token is required")
				return
			}

			subject, err := verifier.VerifyAccessToken(r.Context(), raw)
			if err != nil {
				if errors.Is(err, authorization.ErrUpstream) {
					logger.Warn("token not verified", "error", err, "path", r.URL.Path)
					response.Error(w, http.StatusServiceUnavailable, "identity service unavailable")
					return
				}
				logger.Warn("token rejected", "error", err, "path", r.URL.Path)
				response.Error(w, http.StatusUnauthorized, "token is not valid")
				return
			}

			ctx := observability.With(r.Context(),
				"cas_user_id", subject.CASUserID, "session_id", subject.SessionID)
			observability.Step(ctx, observability.ComponentCAS, "token verified",
				"tenant_claim", subject.TenantID, "client_id", subject.ClientID)

			next.ServeHTTP(w, r.WithContext(authorization.WithSubject(ctx, subject)))
		})
	}
}

func DevSubject(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			subject := &authorization.Subject{ClientID: "development"}
			ctx := observability.With(r.Context(),
				"cas_user_id", subject.CASUserID, "session_id", subject.SessionID)
			observability.Step(ctx, observability.ComponentCAS, "token verified",
				"tenant_claim", subject.TenantID, "client_id", subject.ClientID)

			next.ServeHTTP(w, r.WithContext(authorization.WithSubject(ctx, subject)))
		})
	}
}

func Authorize(guard authorization.Guard, entity authorization.Entity) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			subject, err := authorization.SubjectFrom(r.Context())
			if err != nil {
				response.Error(w, http.StatusUnauthorized, "authentication is required")
				return
			}

			decision, err := guard.Allow(r.Context(), subject, entity, nil)
			observability.Decision(r.Context(), decision.Allowed && err == nil,
				"authorization checked",
				"entity", string(entity), "allowed", decision.Allowed && err == nil,
				"rule", decision.Rule, "reason", decision.Reason,
				"scope", string(decision.Reach), "has_scope", decision.HasReach)
			if err != nil {
				if errors.Is(err, authorization.ErrUpstream) {
					response.Error(w, http.StatusServiceUnavailable, "authorization service unavailable")
					return
				}
				observability.Problem(r.Context(), observability.ComponentAuthz,
					"the guard could not reach a decision", err, "entity", string(entity))
				response.ServerError(w, err)
				return
			}
			if !decision.Allowed {
				response.Error(w, http.StatusForbidden, "not permitted: "+string(entity))
				return
			}

			next.ServeHTTP(w, r.WithContext(authorization.WithDecision(r.Context(), decision)))
		})
	}
}
