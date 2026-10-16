package http

import (
	"encoding/json"
	"testing"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

func TestProjectionDoesNotLeakEmbeddedRows(t *testing.T) {
	row := map[string]any{
		"id":               "s1",
		"admission_number": "ADM-1",
		"student_code":     "SC-1",
		"edges": map[string]any{
			"person": map[string]any{"email": "pupil@example.com", "phone": "555"},
		},
	}

	for name, policy := range map[string]*authorization.FieldPolicy{
		"all_except": {Mode: authorization.FieldModeAllExcept, Keys: []string{"admission_number"}},
		"include":    {Mode: authorization.FieldModeInclude, Keys: []string{"student_code"}},
	} {
		out, err := project(row, policy)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		raw, _ := json.Marshal(out)
		var got map[string]json.RawMessage
		_ = json.Unmarshal(raw, &got)

		if _, leaked := got["edges"]; leaked {
			t.Fatalf("%s: a restricted response must not carry embedded rows, got %s", name, raw)
		}
	}
}

func TestUnrestrictedResponsesKeepTheirEdges(t *testing.T) {
	row := map[string]any{"id": "s1", "edges": map[string]any{"person": map[string]any{"email": "x"}}}

	out, err := project(row, nil)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(out)
	var got map[string]json.RawMessage
	_ = json.Unmarshal(raw, &got)
	if _, ok := got["edges"]; !ok {
		t.Fatalf("an unrestricted response keeps its edges, got %s", raw)
	}
}
