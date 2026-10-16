package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

type row struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Phone     string `json:"phone"`
	CreatedAt string `json:"created_at"`
}

func sample() row {
	return row{ID: "abc", Name: "Aarav", Email: "a@example.com",
		Phone: "999", CreatedAt: "2026-04-01"}
}

func keysOf(t *testing.T, v any) map[string]bool {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	out := map[string]bool{}
	for k := range m {
		out[k] = true
	}
	return out
}

func TestProjectDropsUnauthorizedFields(t *testing.T) {
	policy := &authorization.FieldPolicy{
		Mode: authorization.FieldModeInclude,
		Keys: []string{"name"},
	}

	got, err := project(sample(), policy)
	if err != nil {
		t.Fatalf("project: %v", err)
	}
	keys := keysOf(t, got)

	if !keys["name"] {
		t.Fatal("a permitted field must survive")
	}
	for _, denied := range []string{"email", "phone"} {
		if keys[denied] {
			t.Fatalf("%s must not be returned", denied)
		}
	}
	if !keys["id"] || !keys["created_at"] {
		t.Fatal("id and created_at must always survive")
	}
}

func TestProjectLeavesUnrestrictedRowsAlone(t *testing.T) {
	for _, policy := range []*authorization.FieldPolicy{
		nil,
		{Mode: authorization.FieldModeAll},
	} {
		got, err := project(sample(), policy)
		if err != nil {
			t.Fatalf("project: %v", err)
		}
		if !keysOf(t, got)["email"] {
			t.Fatal("an unrestricted policy must not strip anything")
		}
	}
}

func TestProjectAllAppliesToEveryRow(t *testing.T) {
	policy := &authorization.FieldPolicy{
		Mode: authorization.FieldModeAllExcept,
		Keys: []string{"phone"},
	}

	got, err := projectAll([]row{sample(), sample()}, policy)
	if err != nil {
		t.Fatalf("projectAll: %v", err)
	}
	rows, ok := got.([]any)
	if !ok || len(rows) != 2 {
		t.Fatalf("expected 2 projected rows, got %#v", got)
	}
	for _, r := range rows {
		if keysOf(t, r)["phone"] {
			t.Fatal("an excluded field must be dropped from every row")
		}
	}
}

func TestRejectUnauthorizedFieldsNamesThemAndDoesNotStrip(t *testing.T) {
	decision := authorization.Decision{
		Allowed: true,
		Fields: &authorization.FieldPolicy{
			Mode: authorization.FieldModeInclude,
			Keys: []string{"phone"},
		},
	}
	registered := []string{"phone", "email", "name"}

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPatch, "/", nil)
	if rejectUnauthorizedFields(w, r, decision, registered, []string{"phone", "email"}) {
		t.Fatal("a payload touching an unauthorized field must be refused")
	}
	if w.Code != 403 {
		t.Fatalf("status = %d, want 403", w.Code)
	}
	if body := w.Body.String(); !contains(body, "email") {
		t.Fatalf("the refusal must name the field, got %s", body)
	}

	w = httptest.NewRecorder()
	r = httptest.NewRequest(http.MethodPatch, "/", nil)
	if !rejectUnauthorizedFields(w, r, decision, registered, []string{"phone"}) {
		t.Fatal("an authorized payload must be allowed")
	}
}

func TestUnregisteredFieldIsRefusedOnWrite(t *testing.T) {
	decision := authorization.Decision{Allowed: true}

	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPatch, "/", nil)
	if rejectUnauthorizedFields(w, r, decision, []string{"name"}, []string{"is_admin"}) {
		t.Fatal("an unregistered column must be refused")
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
