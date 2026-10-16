package http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entcomponent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponent"
)

func (c *compositionWorld) supersede(scheme uuid.UUID) *httptest.ResponseRecorder {
	c.t.Helper()

	body := fmt.Sprintf(`{"code":"RS-%s","name":"Annual composition, revised"}`,
		uuid.NewString()[:8])
	return c.call(c.composer.reviseResultScheme, http.MethodPatch,
		"/api/v1/result-schemes/"+scheme.String(), body,
		map[string]string{"id": scheme.String()})
}

func (c *compositionWorld) schemeInUse(component string) (uuid.UUID, uuid.UUID) {
	c.t.Helper()

	scheme := c.newScheme("")
	part := c.newComponent(scheme,
		fmt.Sprintf(`{"name":%q,"maximum_marks":20,"weight":100}`, component))
	c.mustLink(part, c.newExam("Unit test 1", entexam.AssessmentKindEvaluative))
	return scheme, part
}

func (c *compositionWorld) activateAndAttach(scheme uuid.UUID) {
	c.t.Helper()

	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		c.t.Fatalf("the scheme must activate: %d %s", rec.Code, rec.Body.String())
	}
	c.db.Client.SubjectOffering.UpdateOneID(c.physicsA).
		SetResultSchemeID(scheme).ExecX(context.Background())
}

func (c *compositionWorld) successorOf(rec *httptest.ResponseRecorder) uuid.UUID {
	c.t.Helper()

	if rec.Code != http.StatusCreated {
		c.t.Fatalf("want 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		ResultScheme struct {
			ID uuid.UUID `json:"id"`
		} `json:"result_scheme"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		c.t.Fatalf("the response was not the envelope shape: %v (%s)", err, rec.Body.String())
	}
	return body.ResultScheme.ID
}

func (c *compositionWorld) copiedComponent(successor uuid.UUID) uuid.UUID {
	c.t.Helper()

	copied, err := c.db.Client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(successor)).Only(context.Background())
	if err != nil {
		c.t.Fatalf("the copied component could not be read: %v", err)
	}
	return copied.ID
}

func TestASuccessorCarriesALinkThatCouldNotBeMadeTodayAndTheReplySaysSo(t *testing.T) {
	c := newCompositionWorld(t)
	ctx := context.Background()

	scheme, component := c.schemeInUse("Homework")
	homework := c.newAssignment("Fractions worksheet 3", markedOutOf(20))
	c.mustLinkAssignment(component, homework)
	c.activateAndAttach(scheme)

	c.db.Client.Assignment.UpdateOneID(homework).ClearMaximumMarks().ExecX(ctx)

	rec := c.supersede(scheme)
	successor := c.successorOf(rec)
	said := rec.Body.String()
	for _, fragment := range []string{
		"carried_without_maximum", "assignment_has_no_maximum",
		"Fractions worksheet 3", "Homework", "maximum_marks",
	} {
		if !strings.Contains(said, fragment) {
			t.Fatalf("the reply must name %q, got %s", fragment, said)
		}
	}

	copied := c.copiedComponent(successor)
	if linked := c.linkedAssignments(copied); linked != 1 {
		t.Fatalf("the link must travel rather than be dropped, got %d links", linked)
	}

	c.refusalSays(c.setStatus(successor, "active"), http.StatusUnprocessableEntity,
		"result_scheme_does_not_compose", "Fractions worksheet 3")

	c.db.Client.Assignment.UpdateOneID(homework).SetMaximumMarks(20).ExecX(ctx)
	if rec := c.setStatus(successor, "active"); rec.Code != http.StatusOK {
		t.Fatalf("the remedy the reply names must work, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAnOrdinarySupersessionSaysNothingAboutMaximums(t *testing.T) {
	c := newCompositionWorld(t)

	scheme, component := c.schemeInUse("Homework")
	c.mustLinkAssignment(component, c.newAssignment("Worksheet 1", markedOutOf(10)))
	c.activateAndAttach(scheme)

	rec := c.supersede(scheme)
	successor := c.successorOf(rec)
	said := rec.Body.String()
	for _, fragment := range []string{"carried_without_maximum", "warning", "message"} {
		if strings.Contains(said, fragment) {
			t.Fatalf("a supersession with nothing wrong must not report %q, got %s", fragment, said)
		}
	}

	copied := c.copiedComponent(successor)
	if linked := c.linkedAssignments(copied); linked != 1 {
		t.Fatalf("the homework must still travel with the successor, got %d links", linked)
	}
	if rec := c.setStatus(successor, "active"); rec.Code != http.StatusOK {
		t.Fatalf("the successor must activate, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestTheReplyNamesEveryCarriedLinkThatLostItsMaximum(t *testing.T) {
	c := newCompositionWorld(t)
	ctx := context.Background()

	scheme, component := c.schemeInUse("Homework")
	first := c.newAssignment("Bridge model", markedOutOf(10))
	second := c.newAssignment("Comprehension sheet", markedOutOf(10))
	third := c.newAssignment("Fractions worksheet 3", markedOutOf(20))
	for _, homework := range []uuid.UUID{first, second, third} {
		c.mustLinkAssignment(component, homework)
	}
	c.activateAndAttach(scheme)

	c.db.Client.Assignment.UpdateOneID(first).ClearMaximumMarks().ExecX(ctx)
	c.db.Client.Assignment.UpdateOneID(second).SetMaximumMarks(0).ExecX(ctx)

	rec := c.supersede(scheme)
	successor := c.successorOf(rec)
	said := rec.Body.String()
	if !strings.Contains(said, "Bridge model") || !strings.Contains(said, "Comprehension sheet") {
		t.Fatalf("both unusable links must be named, got %s", said)
	}
	if !strings.Contains(said, " and ") {
		t.Fatalf("the reply must read as a list, got %s", said)
	}
	if strings.Contains(said, "Fractions worksheet 3") {
		t.Fatalf("the homework that is still marked out of 20 is no fault, got %s", said)
	}

	copied := c.copiedComponent(successor)
	if linked := c.linkedAssignments(copied); linked != 3 {
		t.Fatalf("every link must travel, got %d", linked)
	}
}
