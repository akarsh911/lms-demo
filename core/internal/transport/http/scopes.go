package http

import (
	"context"
	"errors"
	"net/http"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/internal/retrieval"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	ScopeUnresolvedCode = "scope_unresolved"
	ScopePinnedCode     = "scope_pinned_unexpressible"
)

const scopeUnresolvedStatus = http.StatusConflict

func writeScopesErr(ctx context.Context, w http.ResponseWriter, err error) {
	if !errors.Is(err, retrieval.ErrUnresolved) {
		response.ServerError(w, err)
		return
	}

	code := ScopeUnresolvedCode
	message := "your scope set could not be resolved, so no scope set is being reported"
	if errors.Is(err, retrieval.ErrPinnedScopeUnresolved) {
		code = ScopePinnedCode
		message = "a constrained library grant cannot be expressed as scope labels; " +
			"an operator must widen or remove that grant"
	}

	observability.Problem(ctx, observability.ComponentAuthz, "scope set unresolved", err, "code", code)

	response.JSON(w, scopeUnresolvedStatus, response.Envelope{
		"error":   http.StatusText(scopeUnresolvedStatus),
		"message": message,
		"code":    code,
	})
}

func (s *Server) getLibraryScopes(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	tenant, err := tenancy.FromContext(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	viewer, decision, err := s.scopeFor(ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	scopes, err := retrieval.ScopesFor(viewer, decision, tenant.SchoolID)
	if err != nil {
		writeScopesErr(ctx, w, err)
		return
	}

	labels, err := scopes.Labels()
	if err != nil {
		writeScopesErr(ctx, w, err)
		return
	}
	if labels == nil {
		labels = []string{}
	}

	observability.Step(ctx, observability.ComponentAuthz, "scope set reported",
		"labels", len(labels), "unrestricted", scopes.Unrestricted())

	response.JSON(w, http.StatusOK, response.Envelope{
		"labels":       labels,
		"count":        len(labels),
		"unrestricted": scopes.Unrestricted(),
	})
}
