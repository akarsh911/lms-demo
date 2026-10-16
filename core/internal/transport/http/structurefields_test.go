package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

func routed(w *writeFieldsWorld, decision *authorization.Decision, handler http.HandlerFunc,
	method, target, body string, id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	ctx := w.ctx
	if decision != nil {
		ctx = authorization.WithDecision(ctx, *decision)
	}
	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest(method, target, strings.NewReader(body)).WithContext(ctx))
	return rec
}

func restrictedTo(keys ...string) *authorization.Decision {
	return &authorization.Decision{
		Allowed: true,
		Rule:    "structure write, restricted fields",
		Fields:  included(keys...),
	}
}

func unrestricted() *authorization.Decision {
	return &authorization.Decision{Allowed: true, Rule: "structure write, no field policy"}
}

func wantOK(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestUpdateSectionRefusesAFieldTheCallerMayNotWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	policy := restrictedTo("name", "code")

	rec := routed(w, policy, w.server.updateSection, "PATCH",
		"/api/v1/sections/"+w.sectionID.String(), `{"name":"B","capacity":40}`, w.sectionID)
	w.refused(rec, "capacity")

	wantOK(t, routed(w, policy, w.server.updateSection, "PATCH",
		"/api/v1/sections/"+w.sectionID.String(), `{"name":"B"}`, w.sectionID))
}

func TestCreateSectionRefusesAFieldTheCallerMayNotWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})

	body := `{"academic_session_id":"` + w.sessionID.String() +
		`","branch_id":"` + uuid.New().String() +
		`","grade_level_id":"` + uuid.New().String() +
		`","name":"C","code":"SEC-C","status":"active"}`
	rec := routed(w, restrictedTo("academic_session_id", "branch_id", "grade_level_id", "name", "code"),
		w.server.createSection, "POST", "/api/v1/sections", body, uuid.Nil)
	w.refused(rec, "status")
}

func TestUpdateSessionRefusesAFieldTheCallerMayNotWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	policy := restrictedTo("name")

	rec := routed(w, policy, w.server.updateSession, "PATCH",
		"/api/v1/academic-sessions/"+w.sessionID.String(),
		`{"name":"Renamed","is_current":true}`, w.sessionID)
	w.refused(rec, "is_current")

	wantOK(t, routed(w, policy, w.server.updateSession, "PATCH",
		"/api/v1/academic-sessions/"+w.sessionID.String(), `{"name":"Renamed"}`, w.sessionID))
}

func TestUpdateOfferingRefusesAFieldTheCallerMayNotWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})
	policy := restrictedTo("periods_per_week")

	rec := routed(w, policy, w.server.updateOffering, "PATCH",
		"/api/v1/subject-offerings/"+w.offeringID.String(),
		`{"periods_per_week":5,"maximum_marks":100}`, w.offeringID)
	w.refused(rec, "maximum_marks")

	wantOK(t, routed(w, policy, w.server.updateOffering, "PATCH",
		"/api/v1/subject-offerings/"+w.offeringID.String(), `{"periods_per_week":5}`, w.offeringID))
}

func TestStructureWritesAreUnrestrictedWithoutAFieldPolicy(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})

	wantOK(t, routed(w, unrestricted(), w.server.updateSection, "PATCH",
		"/api/v1/sections/"+w.sectionID.String(),
		`{"name":"D","capacity":41,"status":"active"}`, w.sectionID))

	wantOK(t, routed(w, unrestricted(), w.server.updateOffering, "PATCH",
		"/api/v1/subject-offerings/"+w.offeringID.String(),
		`{"periods_per_week":6,"maximum_marks":90}`, w.offeringID))
}

func TestStructureWritesRefuseWhenNoDecisionReachedTheHandler(t *testing.T) {
	w := newWriteFieldsWorld(t, writeFieldsGuard{})

	rec := routed(w, nil, w.server.updateSection, "PATCH",
		"/api/v1/sections/"+w.sectionID.String(), `{"name":"E"}`, w.sectionID)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a handler reached with no decision must refuse with 403, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "no authorization decision") {
		t.Fatalf("the refusal must say why, got %s", strings.TrimSpace(rec.Body.String()))
	}
}
