package http

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/authorization/catalog"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const (
	BreadthSchoolWide    = "school_wide"
	BreadthNarrowed      = "narrowed"
	BreadthNotApplicable = "not_applicable"
)

const breadthSuffix = "_all"

var errNoGuard = errors.New("capabilities: no guard is configured")

var catalogue = sync.OnceValue(catalog.Build)

var catalogueKeys = sync.OnceValue(func() map[authorization.Entity]bool {
	keys := map[authorization.Entity]bool{}
	for _, e := range catalogue().Entities {
		keys[authorization.Entity(e.Key)] = true
	}
	return keys
})

type capabilityFields struct {
	All        bool            `json:"all"`
	Enumerated bool            `json:"enumerated"`
	Permitted  []catalog.Field `json:"permitted"`
}

type capability struct {
	Key         string           `json:"key"`
	Area        string           `json:"area"`
	Action      string           `json:"action"`
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Reach       string           `json:"reach,omitempty"`
	Breadth     string           `json:"breadth"`
	RowPinned   bool             `json:"row_pinned"`
	Fields      capabilityFields `json:"fields"`
}

func (s *Server) getCapabilities(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := timeout(r)
	defer cancel()

	subject, err := authorization.SubjectFrom(ctx)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "authentication is required")
		return
	}

	held, err := s.heldEntities(ctx, subject)
	if err != nil {
		writeCapabilitiesErr(ctx, w, err)
		return
	}

	caps := capabilitiesFrom(held)

	observability.Step(ctx, observability.ComponentAuthz, "capabilities reported",
		"held", len(held), "reported", len(caps), "catalogue", len(catalogue().Entities))

	response.JSON(w, http.StatusOK, response.Envelope{
		"service":      authorization.Service,
		"capabilities": caps,
		"count":        len(caps),
	})
}

func (s *Server) heldEntities(ctx context.Context, subject *authorization.Subject) (
	map[authorization.Entity]authorization.Decision, error) {
	if s.guard == nil {
		return nil, errNoGuard
	}

	held := make(map[authorization.Entity]authorization.Decision)
	for _, e := range catalogue().Entities {
		entity := authorization.Entity(e.Key)
		decision, err := s.guard.Allow(ctx, subject, entity, nil)
		if err != nil {
			return nil, err
		}
		if decision.Allowed {
			held[entity] = decision
		}
	}
	return held, nil
}

func capabilitiesFrom(held map[authorization.Entity]authorization.Decision) []capability {
	out := make([]capability, 0, len(held))
	for _, e := range catalogue().Entities {
		decision, ok := held[authorization.Entity(e.Key)]
		if !ok {
			continue
		}
		area, action, ok := catalog.Split(e.Key)
		if !ok {
			continue
		}
		out = append(out, capability{
			Key:         e.Key,
			Area:        area,
			Action:      action,
			Name:        e.Name,
			Description: e.Description,
			Reach:       reachOf(decision),
			Breadth:     breadthOf(area, action, held),
			RowPinned:   len(decision.Constraints) > 0,
			Fields:      fieldsOf(e, decision),
		})
	}
	return out
}

func reachOf(decision authorization.Decision) string {
	if !decision.HasReach {
		return ""
	}
	return string(decision.Reach)
}

func breadthOf(area, action string, held map[authorization.Entity]authorization.Decision) string {
	if strings.HasSuffix(action, breadthSuffix) {
		return BreadthSchoolWide
	}

	wide := authorization.Entity(strings.Join(
		[]string{authorization.Service, area, action + breadthSuffix}, "."))
	if !catalogueKeys()[wide] {
		return BreadthNotApplicable
	}
	if decision, ok := held[wide]; ok && len(decision.Constraints) == 0 {
		return BreadthSchoolWide
	}
	return BreadthNarrowed
}

func fieldsOf(e catalog.Entity, decision authorization.Decision) capabilityFields {
	columns := e.ColumnFields()

	out := capabilityFields{
		All:        decision.Fields.Unrestricted(),
		Enumerated: len(columns) > 0,
		Permitted:  make([]catalog.Field, 0, len(columns)),
	}
	for _, f := range columns {
		if decision.Fields.Permits(f.Key) {
			out.Permitted = append(out.Permitted, f)
		}
	}
	return out
}

func writeCapabilitiesErr(ctx context.Context, w http.ResponseWriter, err error) {
	if errors.Is(err, authorization.ErrUpstream) {
		response.Error(w, http.StatusServiceUnavailable, "authorization service unavailable")
		return
	}
	observability.Problem(ctx, observability.ComponentAuthz,
		"capabilities could not be assembled", err)
	response.ServerError(w, err)
}
