package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
)

type assignmentEditorGuard struct{}

func (assignmentEditorGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.AssignmentsRead, authorization.AssignmentsWrite:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "assignment maximum test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (assignmentEditorGuard) Name() string { return "assignment maximum database test guard" }

type assignmentMaximumWorld struct {
	*compositionWorld
	editor *Server
}

func newAssignmentMaximumWorld(t *testing.T) *assignmentMaximumWorld {
	t.Helper()

	w := &assignmentMaximumWorld{
		compositionWorld: newCompositionWorld(t),
		editor:           &Server{guard: assignmentEditorGuard{}},
	}
	w.requireGenuineAssignmentScope()
	return w
}

func (w *assignmentMaximumWorld) requireGenuineAssignmentScope() {
	w.t.Helper()

	viewer, decision, audience, err := w.editor.assignmentWrite(w.ctx,
		authorization.AssignmentsWrite, authorization.AssignmentsWriteAll)
	if err != nil {
		w.t.Fatalf("the editor scope could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer would skip the scoped lookup and prove nothing")
	}
	if decision.Reach != authorization.ReachTenant || !audience.All {
		w.t.Fatalf("the editor must reach the tenant's assignments, got %+v", decision)
	}
}

func (w *assignmentMaximumWorld) patchAssignment(id uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.editor.updateAssignment, http.MethodPatch,
		"/api/v1/assignments/"+id.String(), body, map[string]string{"id": id.String()})
}

func (w *assignmentMaximumWorld) storedMaximum(id uuid.UUID) *float64 {
	w.t.Helper()

	row, err := w.db.Client.Assignment.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("the assignment %s could not be read back: %v", id, err)
	}
	return row.MaximumMarks
}

func (w *assignmentMaximumWorld) requireMaximum(id uuid.UUID, want float64) {
	w.t.Helper()

	got := w.storedMaximum(id)
	if got == nil || *got != want {
		w.t.Fatalf("the stored %s must be %v, got %v",
			"maximum_marks", want, got)
	}
}

func (w *assignmentMaximumWorld) requireNoMaximum(id uuid.UUID) {
	w.t.Helper()

	if got := w.storedMaximum(id); got != nil {
		w.t.Fatalf("the assignment must be marked out of nothing, got %v", *got)
	}
}

func TestTheMaximumOfAnAssignmentNothingComposesMayBeWithdrawn(t *testing.T) {
	w := newAssignmentMaximumWorld(t)

	homework := w.newAssignment("Spelling list 2", markedOutOf(20))

	rec := w.patchAssignment(homework, `{"maximum_marks":null}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("an assignment no result draws on may be unmarked, got %d: %s",
			rec.Code, rec.Body.String())
	}
	w.requireNoMaximum(homework)
	if strings.Contains(rec.Body.String(), `"maximum_marks":20`) {
		t.Fatalf("the reply still reports the withdrawn maximum, got %s", rec.Body.String())
	}

	if rec := w.patchAssignment(homework, `{"maximum_marks":0}`); rec.Code != http.StatusOK {
		t.Fatalf("an assignment no result draws on may be marked out of zero, got %d: %s",
			rec.Code, rec.Body.String())
	}
	w.requireMaximum(homework, 0)
}

func TestOmittingTheMaximumLeavesItAloneAndNullTakesItAway(t *testing.T) {
	w := newAssignmentMaximumWorld(t)

	homework := w.newAssignment("Spelling list 3", markedOutOf(20))

	if rec := w.patchAssignment(homework, `{"title":"Spelling list 3 (revised)"}`); rec.Code != http.StatusOK {
		t.Fatalf("an edit that never names the maximum must go through, got %d: %s",
			rec.Code, rec.Body.String())
	}
	w.requireMaximum(homework, 20)

	if rec := w.patchAssignment(homework, `{}`); rec.Code != http.StatusOK {
		t.Fatalf("a patch that names nothing is not an error, got %d: %s",
			rec.Code, rec.Body.String())
	}
	w.requireMaximum(homework, 20)

	if rec := w.patchAssignment(homework, `{"maximum_marks":null}`); rec.Code != http.StatusOK {
		t.Fatalf("an explicit null must be honoured, got %d: %s", rec.Code, rec.Body.String())
	}
	w.requireNoMaximum(homework)

	if rec := w.patchAssignment(homework, `{"maximum_marks":15}`); rec.Code != http.StatusOK {
		t.Fatalf("a withdrawn maximum must be restorable, got %d: %s", rec.Code, rec.Body.String())
	}
	w.requireMaximum(homework, 15)
}

func (w *assignmentMaximumWorld) composedHomework(title string, marks float64) uuid.UUID {
	w.t.Helper()

	scheme := w.newScheme("")
	component := w.newComponent(scheme, `{"name":"Homework","maximum_marks":20,"weight":100}`)
	homework := w.newAssignment(title, markedOutOf(marks))
	w.mustLinkAssignment(component, homework)
	return homework
}

func TestTheMaximumAComponentDrawsOnCannotBeWithdrawn(t *testing.T) {
	w := newAssignmentMaximumWorld(t)

	homework := w.composedHomework("Fractions worksheet 3", 20)

	w.refusalSays(w.patchAssignment(homework, `{"maximum_marks":null}`),
		http.StatusUnprocessableEntity,
		"assignment_feeds_a_result", "Fractions worksheet 3", "Homework",
		"Annual composition", "Unlink it there first")
	w.requireMaximum(homework, 20)

	w.refusalSays(w.patchAssignment(homework, `{"maximum_marks":0}`),
		http.StatusUnprocessableEntity,
		"assignment_feeds_a_result", "Homework")
	w.requireMaximum(homework, 20)
}

func TestEveryOtherEditToAComposedAssignmentStillGoesThrough(t *testing.T) {
	w := newAssignmentMaximumWorld(t)

	homework := w.composedHomework("Fractions worksheet 3", 20)

	if rec := w.patchAssignment(homework, `{"title":"Fractions worksheet 3 (revised)"}`); rec.Code != http.StatusOK {
		t.Fatalf("a composed assignment must still be editable, got %d: %s",
			rec.Code, rec.Body.String())
	}
	w.requireMaximum(homework, 20)

	if rec := w.patchAssignment(homework, `{"maximum_marks":25}`); rec.Code != http.StatusOK {
		t.Fatalf("raising the maximum of a composed assignment is no fault, got %d: %s",
			rec.Code, rec.Body.String())
	}
	w.requireMaximum(homework, 25)
}

func TestUnlinkingIsTheRemedyTheRefusalNames(t *testing.T) {
	w := newAssignmentMaximumWorld(t)

	scheme := w.newScheme("")
	component := w.newComponent(scheme, `{"name":"Homework","maximum_marks":20,"weight":100}`)
	homework := w.newAssignment("Fractions worksheet 3", markedOutOf(20))
	w.mustLinkAssignment(component, homework)

	w.refusalSays(w.patchAssignment(homework, `{"maximum_marks":0}`),
		http.StatusUnprocessableEntity, "assignment_feeds_a_result")

	if rec := w.unlinkAssignment(component, homework); rec.Code != http.StatusNoContent {
		t.Fatalf("the link must be removable, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := w.patchAssignment(homework, `{"maximum_marks":0}`); rec.Code != http.StatusOK {
		t.Fatalf("nothing composes it now, so the maximum may go, got %d: %s",
			rec.Code, rec.Body.String())
	}
	w.requireMaximum(homework, 0)
}

func TestTheRefusalNamesEveryComponentThatDrawsOnTheAssignment(t *testing.T) {
	w := newAssignmentMaximumWorld(t)

	scheme := w.newScheme("")
	first := w.newComponent(scheme,
		`{"name":"Class work","maximum_marks":20,"weight":50,"position":1}`)
	second := w.newComponent(scheme,
		`{"name":"Homework","maximum_marks":20,"weight":50,"position":2}`)

	homework := w.newAssignment("Project on levers", markedOutOf(15))
	w.mustLinkAssignment(first, homework)
	w.mustLinkAssignment(second, homework)

	rec := w.patchAssignment(homework, `{"maximum_marks":0}`)
	w.refusalSays(rec, http.StatusUnprocessableEntity,
		"assignment_feeds_a_result", "Class work", "Homework", " and ")
	w.requireMaximum(homework, 15)
}

func TestAnAssignmentOutOfReachIsStillAFourOhFourWhenItsMaximumIsWithdrawn(t *testing.T) {
	w := newAssignmentMaximumWorld(t)

	scheme := w.newScheme("")
	component := w.newComponent(scheme, `{"name":"Homework","maximum_marks":20,"weight":100}`)
	homework := w.newAssignment("Term project", markedOutOf(30))
	w.mustLinkAssignment(component, homework)

	rec := w.patchAssignment(uuid.New(), `{"maximum_marks":null}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an assignment that does not exist must answer 404, got %d: %s",
			rec.Code, rec.Body.String())
	}
	w.requireMaximum(homework, 30)
}
