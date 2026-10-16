package http

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/observability"
	"github.com/Harbour-Emerge/emerge-core/pkg/response"
)

const edgesKey = "edges"

var alwaysReadable = map[string]bool{
	"id":         true,
	"created_at": true,
	"updated_at": true,
}

func project(row any, policy *authorization.FieldPolicy) (any, error) {
	if policy.Unrestricted() {
		return row, nil
	}

	raw, err := json.Marshal(row)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return row, nil
	}

	for name := range fields {
		if name == edgesKey {
			delete(fields, name)
			continue
		}
		if alwaysReadable[name] || policy.Permits(name) {
			continue
		}
		delete(fields, name)
	}
	return fields, nil
}

func projectAll[T any](rows []T, policy *authorization.FieldPolicy) (any, error) {
	if policy.Unrestricted() {
		return rows, nil
	}

	out := make([]any, 0, len(rows))
	for _, row := range rows {
		projected, err := project(row, policy)
		if err != nil {
			return nil, err
		}
		out = append(out, projected)
	}
	return out, nil
}

func rejectUnauthorizedFields(w http.ResponseWriter, r *http.Request,
	decision authorization.Decision, registered, requested []string) bool {
	return rejectFields(w, r, decision.Fields, decision.Rule, registered, requested)
}

func rejectFields(w http.ResponseWriter, r *http.Request,
	policy *authorization.FieldPolicy, rule string, registered, requested []string) bool {
	denied := policy.Denied(registered, requested)
	if len(denied) == 0 {
		observability.Step(r.Context(), observability.ComponentFields, "write fields allowed",
			"requested", requested)
		return true
	}

	observability.Decision(r.Context(), false, "write refused on fields",
		"denied", denied, "requested", requested, "rule", rule)

	response.Error(w, http.StatusForbidden,
		"not permitted to write: "+strings.Join(denied, ", "))
	return false
}

func traceProjection(r *http.Request, policy *authorization.FieldPolicy, rows int) {
	if policy.Unrestricted() {
		return
	}
	observability.Step(r.Context(), observability.ComponentFields, "response projected",
		"mode", string(policy.Mode), "keys", policy.Keys,
		"profile", policy.Profile, "rows", rows)
}

func projectPerRow[T any](rows []T, decision authorization.Decision,
	id func(T) uuid.UUID, values map[uuid.UUID]authorization.RowValues) (any, int, error) {
	out := make([]any, 0, len(rows))
	dropped := 0

	for _, row := range rows {
		policy, covered := decision.FieldsForRow(values[id(row)])
		if !covered {
			dropped++
			continue
		}
		projected, err := project(row, policy)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, projected)
	}
	return out, dropped, nil
}

func tracePerRow(r *http.Request, decision authorization.Decision, rows, dropped int) {
	grants := make([]string, 0, len(decision.Grants))
	for _, g := range decision.Grants {
		grants = append(grants, g.Rule)
	}
	observability.Step(r.Context(), observability.ComponentFields, "projected per row",
		"grants", grants, "rows", rows, "dropped_uncovered", dropped)
}
