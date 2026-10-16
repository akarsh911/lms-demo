package http

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const dateLayout = "2006-01-02"

func tenantClient(ctx context.Context) (*tenantent.Client, error) {
	return postgres.ClientFromContext(ctx)
}

const (
	DefaultPageSize = 50
	MaxPageSize     = 200
)

func idParam(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		response.Error(w, http.StatusBadRequest, name+" must be a UUID")
		return uuid.Nil, false
	}
	return id, true
}

func parseDate(s *string) (*time.Time, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	t, err := time.Parse(dateLayout, *s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func writeTenantEntErr(w http.ResponseWriter, err error, notFound string) {
	switch {
	case tenantent.IsNotFound(err):
		response.Error(w, http.StatusNotFound, notFound)
	case tenantent.IsConstraintError(err):
		response.Error(w, http.StatusConflict, "that value is already taken, or it references a row that does not exist")
	case tenantent.IsValidationError(err):
		response.Error(w, http.StatusBadRequest, err.Error())
	default:
		writeTenancyErr(w, err)
	}
}

func deleteRow(w http.ResponseWriter, r *http.Request, notFound string,
	del func(context.Context, *tenantent.Client, uuid.UUID) error) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	if err := del(ctx, client, id); err != nil {
		writeTenantEntErr(w, err, notFound)
		return
	}
	response.NoContent(w)
}

func wroteScopedRow(w http.ResponseWriter, n int, err error, notFound string) bool {
	if err != nil {
		writeTenantEntErr(w, err, notFound)
		return false
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, notFound)
		return false
	}
	return true
}

func mustReach(w http.ResponseWriter, found bool, err error, notFound string) bool {
	if err != nil {
		writeTenancyErr(w, err)
		return false
	}
	if !found {
		response.Error(w, http.StatusNotFound, notFound)
		return false
	}
	return true
}

type scopedDelete func(context.Context, *tenantent.Client, uuid.UUID,
	*access.Viewer, authorization.Decision) (int, error)

func (s *Server) deleteScoped(w http.ResponseWriter, r *http.Request, notFound string,
	narrow, wide authorization.Entity, del scopedDelete) {
	ctx, cancel := timeout(r)
	defer cancel()

	client, err := tenantClient(ctx)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}
	id, ok := idParam(w, r, "id")
	if !ok {
		return
	}

	viewer, decision, err := s.scopeFor(ctx, narrow, wide)
	if err != nil {
		writeTenancyErr(w, err)
		return
	}

	n, err := del(ctx, client, id, viewer, decision)
	if err != nil {
		writeTenantEntErr(w, err, notFound)
		return
	}
	if n == 0 {
		response.Error(w, http.StatusNotFound, notFound)
		return
	}
	response.NoContent(w)
}

func nowUTC() time.Time { return time.Now().UTC() }

type page struct {
	Limit   int  `json:"limit"`
	Offset  int  `json:"offset"`
	HasMore bool `json:"has_more"`
}

func pageOf(limit, offset, returned int) page {
	return page{Limit: limit, Offset: offset, HasMore: returned == limit && limit > 0}
}

func wasCleared[T any](sent []string, name string, value *T) bool {
	return value == nil && wasSent(sent, name)
}

func rejectNull[T any](w http.ResponseWriter, sent []string, name string, value *T) bool {
	if wasCleared(sent, name, value) {
		response.Error(w, http.StatusBadRequest,
			name+" always has a value and cannot be set to null; omit it to leave it alone")
		return false
	}
	return true
}
