package http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entcomponent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponent"
	entcomponentassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentassignment"
	entcomponentexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentexam"
	entresultscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultscheme"
)

type compositionGuard struct{}

func (compositionGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.SubjectOfferingsRead, authorization.SubjectOfferingsWrite,
		authorization.SubjectOfferingsDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "result composition test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (compositionGuard) Name() string { return "result composition database test guard" }

type compositionWorld struct {
	*examWorld
	composer *Server
}

func newCompositionWorld(t *testing.T) *compositionWorld {
	t.Helper()
	return &compositionWorld{
		examWorld: newExamWorld(t),
		composer:  &Server{guard: compositionGuard{}},
	}
}

func (c *compositionWorld) call(handler http.HandlerFunc, method, target, body string,
	params map[string]string) *httptest.ResponseRecorder {
	c.t.Helper()

	route := chi.NewRouteContext()
	for name, value := range params {
		route.URLParams.Add(name, value)
	}
	ctx := context.WithValue(c.ctx, chi.RouteCtxKey, route)

	rec := httptest.NewRecorder()
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	handler(rec, request.WithContext(ctx))
	return rec
}

func (c *compositionWorld) idOf(rec *httptest.ResponseRecorder, key string, want int) uuid.UUID {
	c.t.Helper()

	if rec.Code != want {
		c.t.Fatalf("want %d, got %d: %s", want, rec.Code, rec.Body.String())
	}
	var body map[string]struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		c.t.Fatalf("the response was not the envelope shape: %v (%s)", err, rec.Body.String())
	}
	row, ok := body[key]
	if !ok {
		c.t.Fatalf("the response carries no %q: %s", key, rec.Body.String())
	}
	return row.ID
}

func (c *compositionWorld) newScheme(fields string) uuid.UUID {
	c.t.Helper()

	body := fmt.Sprintf(`{"academic_session_id":%q,"name":"Annual composition","code":"RS-%s"%s}`,
		c.sessionID, uuid.NewString()[:8], fields)
	rec := c.call(c.composer.createResultScheme, http.MethodPost, "/api/v1/result-schemes", body, nil)
	return c.idOf(rec, "result_scheme", http.StatusCreated)
}

func (c *compositionWorld) addComponent(scheme uuid.UUID, body string) *httptest.ResponseRecorder {
	c.t.Helper()

	return c.call(c.composer.createResultComponent, http.MethodPost,
		"/api/v1/result-schemes/"+scheme.String()+"/components", body,
		map[string]string{"id": scheme.String()})
}

func (c *compositionWorld) newComponent(scheme uuid.UUID, body string) uuid.UUID {
	c.t.Helper()

	return c.idOf(c.addComponent(scheme, body), "result_component", http.StatusCreated)
}

func (c *compositionWorld) patchComponent(component uuid.UUID, body string) *httptest.ResponseRecorder {
	c.t.Helper()

	return c.call(c.composer.updateResultComponent, http.MethodPatch,
		"/api/v1/result-components/"+component.String(), body,
		map[string]string{"id": component.String()})
}

func (c *compositionWorld) linkExam(component, exam uuid.UUID) *httptest.ResponseRecorder {
	c.t.Helper()

	return c.call(c.composer.linkResultComponentExam, http.MethodPost,
		"/api/v1/result-components/"+component.String()+"/exams",
		fmt.Sprintf(`{"exam_id":%q}`, exam),
		map[string]string{"id": component.String()})
}

func (c *compositionWorld) mustLink(component, exam uuid.UUID) {
	c.t.Helper()

	if rec := c.linkExam(component, exam); rec.Code != http.StatusCreated {
		c.t.Fatalf("the exam could not be linked: %d %s", rec.Code, rec.Body.String())
	}
}

func (c *compositionWorld) setStatus(scheme uuid.UUID, status string) *httptest.ResponseRecorder {
	c.t.Helper()

	return c.call(c.composer.reviseResultScheme, http.MethodPatch,
		"/api/v1/result-schemes/"+scheme.String(),
		fmt.Sprintf(`{"status":%q}`, status),
		map[string]string{"id": scheme.String()})
}

func (c *compositionWorld) storedScheme(id uuid.UUID) *tenantent.ResultScheme {
	c.t.Helper()

	row, err := c.db.Client.ResultScheme.Get(context.Background(), id)
	if err != nil {
		c.t.Fatalf("the result scheme %s could not be read back: %v", id, err)
	}
	return row
}

func (c *compositionWorld) newExam(name string, kind entexam.AssessmentKind) uuid.UUID {
	c.t.Helper()

	return c.db.Client.Exam.Create().
		SetAcademicSessionID(c.sessionID).
		SetBranchID(c.branchID).
		SetName(name).
		SetCode("RCE-" + uuid.NewString()[:8]).
		SetAssessmentKind(kind).
		SaveX(context.Background()).ID
}

func (c *compositionWorld) refusalSays(rec *httptest.ResponseRecorder, want int, fragments ...string) {
	c.t.Helper()

	if rec.Code != want {
		c.t.Fatalf("want %d, got %d: %s", want, rec.Code, rec.Body.String())
	}
	said := rec.Body.String()
	for _, fragment := range fragments {
		if !strings.Contains(said, fragment) {
			c.t.Fatalf("the refusal must name %q, got %s", fragment, said)
		}
	}
}

func TestAResultSchemeIsBornInDraftAndCannotBeCreatedActive(t *testing.T) {
	c := newCompositionWorld(t)

	id := c.newScheme("")
	if stored := c.storedScheme(id); stored.Status != entresultscheme.StatusDraft {
		t.Fatalf("a new scheme composes nothing yet and must be draft, got %q", stored.Status)
	}

	body := fmt.Sprintf(`{"academic_session_id":%q,"name":"Born active","code":"RS-%s","status":"active"}`,
		c.sessionID, uuid.NewString()[:8])
	rec := c.call(c.composer.createResultScheme, http.MethodPost, "/api/v1/result-schemes", body, nil)
	c.refusalSays(rec, http.StatusUnprocessableEntity, "result_scheme_starts_in_draft")
}

func TestTheWorkedCompositionActivatesAndThenRefusesToAddUpToNinetyNine(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")

	halfYearly := c.newComponent(scheme,
		`{"name":"Half-yearly","maximum_marks":40,"weight":20,"aggregation":"single","position":1}`)
	c.mustLink(halfYearly, c.newExam("Half-yearly", entexam.AssessmentKindEvaluative))

	classTests := c.newComponent(scheme,
		`{"name":"Class tests","maximum_marks":20,"weight":20,"aggregation":"best_of","take_best":2,"position":2}`)
	for i := 1; i <= 4; i++ {
		c.mustLink(classTests, c.newExam(fmt.Sprintf("Class test %d", i), entexam.AssessmentKindEvaluative))
	}

	annual := c.newComponent(scheme,
		`{"name":"Annual","maximum_marks":100,"weight":60,"aggregation":"single","position":3}`)
	c.mustLink(annual, c.newExam("Annual", entexam.AssessmentKindEvaluative))

	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("twenty, twenty and sixty is the hundred this scheme is out of and must activate, "+
			"got %d: %s", rec.Code, rec.Body.String())
	}
	if stored := c.storedScheme(scheme); stored.Status != entresultscheme.StatusActive {
		t.Fatalf("the scheme must be active once it composes, got %q", stored.Status)
	}

	if rec := c.setStatus(scheme, "draft"); rec.Code != http.StatusOK {
		t.Fatalf("an unattached scheme may be reopened, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := c.patchComponent(annual, `{"weight":59}`); rec.Code != http.StatusOK {
		t.Fatalf("a draft scheme's components may be edited, got %d: %s", rec.Code, rec.Body.String())
	}

	rec := c.setStatus(scheme, "active")
	c.refusalSays(rec, http.StatusUnprocessableEntity,
		"result_scheme_does_not_compose", "99", "100")

	if stored := c.storedScheme(scheme); stored.Status != entresultscheme.StatusDraft {
		t.Fatalf("a refused activation must leave the scheme in draft, got %q", stored.Status)
	}
}

func TestABestOfComponentMustLinkAtLeastAsManyExamsAsItTakes(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	component := c.newComponent(scheme,
		`{"name":"Class tests","maximum_marks":20,"weight":100,"aggregation":"best_of","take_best":2}`)
	c.mustLink(component, c.newExam("Class test 1", entexam.AssessmentKindEvaluative))

	rec := c.setStatus(scheme, "active")
	c.refusalSays(rec, http.StatusUnprocessableEntity,
		"result_scheme_does_not_compose", "best 2", "only 1 sources", "1 exams, 0 assignments")

	c.mustLink(component, c.newExam("Class test 2", entexam.AssessmentKindEvaluative))
	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("best two of two is a rule and must activate, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestTakeBestIsRequiredByBestOfAndForbiddenByEverythingElse(t *testing.T) {
	c := newCompositionWorld(t)
	scheme := c.newScheme("")

	rec := c.addComponent(scheme,
		`{"name":"Class tests","maximum_marks":20,"weight":100,"aggregation":"best_of"}`)
	c.refusalSays(rec, http.StatusUnprocessableEntity,
		entcomponent.FieldTakeBest, entcomponent.FieldAggregation)

	rec = c.addComponent(scheme,
		`{"name":"Class tests","maximum_marks":20,"weight":100,"aggregation":"sum","take_best":2}`)
	c.refusalSays(rec, http.StatusUnprocessableEntity,
		entcomponent.FieldTakeBest, entcomponent.FieldAggregation)

	id := c.newComponent(scheme,
		`{"name":"Class tests","maximum_marks":20,"weight":100,"aggregation":"best_of","take_best":2}`)

	rec = c.patchComponent(id, `{"aggregation":"sum"}`)
	c.refusalSays(rec, http.StatusUnprocessableEntity, entcomponent.FieldTakeBest)

	if rec := c.patchComponent(id, `{"aggregation":"sum","take_best":null}`); rec.Code != http.StatusOK {
		t.Fatalf("dropping take_best in the same request removes the contradiction, got %d: %s",
			rec.Code, rec.Body.String())
	}
	stored, err := c.db.Client.ResultComponent.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("the component could not be read back: %v", err)
	}
	if stored.TakeBest != nil || stored.Aggregation != entcomponent.AggregationSum {
		t.Fatalf("the component must aggregate sum with no take_best, got %q and %v",
			stored.Aggregation, stored.TakeBest)
	}
}

func TestAComponentWeightAndMaximumMustBePositive(t *testing.T) {
	c := newCompositionWorld(t)
	scheme := c.newScheme("")

	rec := c.addComponent(scheme, `{"name":"Nothing","maximum_marks":40,"weight":0}`)
	c.refusalSays(rec, http.StatusUnprocessableEntity, entcomponent.FieldWeight)

	rec = c.addComponent(scheme, `{"name":"Nothing","maximum_marks":0,"weight":20}`)
	c.refusalSays(rec, http.StatusUnprocessableEntity, entcomponent.FieldMaximumMarks)

	rec = c.addComponent(scheme, `{"name":"Nothing","maximum_marks":40,"weight":-20}`)
	c.refusalSays(rec, http.StatusUnprocessableEntity, entcomponent.FieldWeight)

	count, err := c.db.Client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(scheme)).Count(context.Background())
	if err != nil {
		t.Fatalf("the components could not be counted: %v", err)
	}
	if count != 0 {
		t.Fatalf("a refused component must not be written, got %d rows", count)
	}
}

func TestAPracticeExamMayNotFeedAResultComponent(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	component := c.newComponent(scheme, `{"name":"Class tests","maximum_marks":20,"weight":100}`)
	practice := c.newExam("Chapter four check", entexam.AssessmentKindPractice)

	rec := c.linkExam(component, practice)
	c.refusalSays(rec, http.StatusUnprocessableEntity,
		"practice_exam_cannot_be_composed", entexam.FieldAssessmentKind)

	linked, err := c.db.Client.ResultComponentExam.Query().
		Where(entcomponentexam.HasExamWith(entexam.AcademicSessionID(c.sessionID))).
		Count(context.Background())
	if err != nil {
		t.Fatalf("the links could not be counted: %v", err)
	}
	if linked != 0 {
		t.Fatalf("a refused link must not be written, got %d rows", linked)
	}
}

func TestAnExamFromAnotherSessionMayNotFeedAResultComponent(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	component := c.newComponent(scheme, `{"name":"Class tests","maximum_marks":20,"weight":100}`)

	other := c.db.Client.AcademicSession.Create().
		SetName("Next year").
		SetCode("RCS-" + uuid.NewString()[:8]).
		SetStartDate(time.Date(2027, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2028, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SaveX(context.Background())
	stranger := c.db.Client.Exam.Create().
		SetAcademicSessionID(other.ID).
		SetBranchID(c.branchID).
		SetName("Next year's annual").
		SetCode("RCE-" + uuid.NewString()[:8]).
		SaveX(context.Background()).ID

	rec := c.linkExam(component, stranger)
	c.refusalSays(rec, http.StatusUnprocessableEntity, "different academic session")
}

func TestAnActiveSchemeRefusesChangesToWhatItsPartsAreWorth(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	component := c.newComponent(scheme, `{"name":"Annual","maximum_marks":100,"weight":100}`)
	c.mustLink(component, c.newExam("Annual", entexam.AssessmentKindEvaluative))

	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must activate: %d %s", rec.Code, rec.Body.String())
	}

	c.refusalSays(c.patchComponent(component, `{"weight":40}`),
		http.StatusUnprocessableEntity, "result_scheme_not_draft")
	c.refusalSays(c.addComponent(scheme, `{"name":"Half-yearly","maximum_marks":40,"weight":60}`),
		http.StatusUnprocessableEntity, "result_scheme_not_draft")
	c.refusalSays(c.linkExam(component, c.newExam("Another", entexam.AssessmentKindEvaluative)),
		http.StatusUnprocessableEntity, "result_scheme_not_draft")

	stored, err := c.db.Client.ResultComponent.Get(context.Background(), component)
	if err != nil {
		t.Fatalf("the component could not be read back: %v", err)
	}
	if stored.Weight != 100 {
		t.Fatalf("the refused edit must leave the weight alone, got %v", stored.Weight)
	}
}

func TestASchemeThatComposesAnOfferingIsSupersededRatherThanEdited(t *testing.T) {
	c := newCompositionWorld(t)
	ctx := context.Background()

	scheme := c.newScheme("")
	component := c.newComponent(scheme,
		`{"name":"Class tests","maximum_marks":20,"weight":100,"aggregation":"best_of","take_best":2}`)
	c.mustLink(component, c.newExam("Class test 1", entexam.AssessmentKindEvaluative))
	c.mustLink(component, c.newExam("Class test 2", entexam.AssessmentKindEvaluative))

	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must activate: %d %s", rec.Code, rec.Body.String())
	}
	c.db.Client.SubjectOffering.UpdateOneID(c.physicsA).SetResultSchemeID(scheme).ExecX(ctx)

	c.refusalSays(c.setStatus(scheme, "draft"),
		http.StatusUnprocessableEntity, "result_scheme_in_use")

	body := fmt.Sprintf(`{"code":"RS-%s","name":"Annual composition, revised"}`, uuid.NewString()[:8])
	rec := c.call(c.composer.reviseResultScheme, http.MethodPatch,
		"/api/v1/result-schemes/"+scheme.String(), body,
		map[string]string{"id": scheme.String()})
	successor := c.idOf(rec, "result_scheme", http.StatusCreated)

	stored := c.storedScheme(successor)
	if stored.SupersedesID == nil || *stored.SupersedesID != scheme {
		t.Fatalf("the successor must name what it supersedes, got %v", stored.SupersedesID)
	}
	if stored.Status != entresultscheme.StatusDraft {
		t.Fatalf("a successor is composed again before it is trusted, got %q", stored.Status)
	}

	copied, err := c.db.Client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(successor)).All(ctx)
	if err != nil {
		t.Fatalf("the copied components could not be read: %v", err)
	}
	if len(copied) != 1 {
		t.Fatalf("the composition must travel with the successor, got %d components", len(copied))
	}
	if copied[0].TakeBest == nil || *copied[0].TakeBest != 2 || copied[0].Weight != 100 {
		t.Fatalf("the copied component lost its rule, got %+v", copied[0])
	}
	links, err := c.db.Client.ResultComponentExam.Query().
		Where(entcomponentexam.ResultComponentID(copied[0].ID)).Count(ctx)
	if err != nil {
		t.Fatalf("the copied links could not be counted: %v", err)
	}
	if links != 2 {
		t.Fatalf("both linked exams must travel with the successor, got %d", links)
	}
}

func (c *compositionWorld) newAssignment(title string, maximum *float64) uuid.UUID {
	c.t.Helper()

	return c.db.Client.Assignment.Create().
		SetAcademicSessionID(c.sessionID).
		SetTeacherID(c.teacherT1).
		SetTitle(title).
		SetNillableMaximumMarks(maximum).
		SaveX(context.Background()).ID
}

func markedOutOf(marks float64) *float64 { return &marks }

func (c *compositionWorld) linkAssignment(component, assignment uuid.UUID) *httptest.ResponseRecorder {
	c.t.Helper()

	return c.call(c.composer.linkResultComponentAssignment, http.MethodPost,
		"/api/v1/result-components/"+component.String()+"/assignments",
		fmt.Sprintf(`{"assignment_id":%q}`, assignment),
		map[string]string{"id": component.String()})
}

func (c *compositionWorld) mustLinkAssignment(component, assignment uuid.UUID) {
	c.t.Helper()

	if rec := c.linkAssignment(component, assignment); rec.Code != http.StatusCreated {
		c.t.Fatalf("the assignment could not be linked: %d %s", rec.Code, rec.Body.String())
	}
}

func (c *compositionWorld) unlinkAssignment(component, assignment uuid.UUID) *httptest.ResponseRecorder {
	c.t.Helper()

	return c.call(c.composer.unlinkResultComponentAssignment, http.MethodDelete,
		"/api/v1/result-components/"+component.String()+"/assignments/"+assignment.String(),
		"",
		map[string]string{"id": component.String(), "assignmentID": assignment.String()})
}

func (c *compositionWorld) listedAssignments(component uuid.UUID) *httptest.ResponseRecorder {
	c.t.Helper()

	return c.call(c.composer.listResultComponentAssignments, http.MethodGet,
		"/api/v1/result-components/"+component.String()+"/assignments", "",
		map[string]string{"id": component.String()})
}

func (c *compositionWorld) linkedAssignments(component uuid.UUID) int {
	c.t.Helper()

	count, err := c.db.Client.ResultComponentAssignment.Query().
		Where(entcomponentassignment.ResultComponentID(component)).Count(context.Background())
	if err != nil {
		c.t.Fatalf("the assignment links could not be counted: %v", err)
	}
	return count
}

func (c *compositionWorld) componentNamed(scheme uuid.UUID, name string) uuid.UUID {
	c.t.Helper()

	row, err := c.db.Client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(scheme), entcomponent.Name(name)).
		Only(context.Background())
	if err != nil {
		c.t.Fatalf("the component %q could not be read back: %v", name, err)
	}
	return row.ID
}

func TestHomeworkFeedsAResultComponentWhenTheSchemeSaysItDoes(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	component := c.newComponent(scheme, `{"name":"Homework","maximum_marks":20,"weight":100}`)
	homework := c.newAssignment("Fractions worksheet 3", markedOutOf(20))

	rec := c.linkAssignment(component, homework)
	if rec.Code != http.StatusCreated {
		t.Fatalf("a marked assignment must be linkable, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "result_component_assignment") {
		t.Fatalf("the link must come back in its own envelope, got %s", rec.Body.String())
	}
	if linked := c.linkedAssignments(component); linked != 1 {
		t.Fatalf("the link must be written once, got %d rows", linked)
	}

	listed := c.listedAssignments(component)
	if listed.Code != http.StatusOK || !strings.Contains(listed.Body.String(), homework.String()) {
		t.Fatalf("the listing must name the linked assignment, got %d: %s",
			listed.Code, listed.Body.String())
	}

	if rec := c.unlinkAssignment(component, homework); rec.Code != http.StatusNoContent {
		t.Fatalf("the link must be removable, got %d: %s", rec.Code, rec.Body.String())
	}
	if linked := c.linkedAssignments(component); linked != 0 {
		t.Fatalf("the unlinked row must be gone, got %d rows", linked)
	}
	c.refusalSays(c.unlinkAssignment(component, homework), http.StatusNotFound, "not linked")

	c.mustLinkAssignment(component, homework)
	c.refusalSays(c.linkAssignment(component, homework), http.StatusConflict, "already feeds")
}

func TestAComponentMayDrawFromExamsAndHomeworkAtOnce(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	internal := c.newComponent(scheme,
		`{"name":"Internal assessment","maximum_marks":20,"weight":30,"aggregation":"average","position":1}`)
	c.mustLink(internal, c.newExam("Unit test 1", entexam.AssessmentKindEvaluative))
	c.mustLinkAssignment(internal, c.newAssignment("Project on levers", markedOutOf(15)))

	annual := c.newComponent(scheme,
		`{"name":"Annual","maximum_marks":100,"weight":70,"aggregation":"single","position":2}`)
	c.mustLink(annual, c.newExam("Annual", entexam.AssessmentKindEvaluative))

	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("a component fed by an exam and a piece of homework must activate, got %d: %s",
			rec.Code, rec.Body.String())
	}

	exams, err := c.db.Client.ResultComponentExam.Query().
		Where(entcomponentexam.ResultComponentID(internal)).Count(context.Background())
	if err != nil {
		t.Fatalf("the exam links could not be counted: %v", err)
	}
	if exams != 1 || c.linkedAssignments(internal) != 1 {
		t.Fatalf("the component must keep both sources, got %d exams and %d assignments",
			exams, c.linkedAssignments(internal))
	}
}

func TestBestOfCountsHomeworkAsASourceLikeAnExam(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	component := c.newComponent(scheme,
		`{"name":"Class work","maximum_marks":20,"weight":100,"aggregation":"best_of","take_best":2}`)
	c.mustLink(component, c.newExam("Class test 1", entexam.AssessmentKindEvaluative))

	c.refusalSays(c.setStatus(scheme, "active"), http.StatusUnprocessableEntity,
		"result_scheme_does_not_compose", "best 2", "1 exams, 0 assignments")

	c.mustLinkAssignment(component, c.newAssignment("Worksheet 1", markedOutOf(10)))

	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("an exam and a piece of homework are two sources and best two of two must "+
			"activate, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAComponentWithNoSourceOfEitherKindCannotActivate(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	fed := c.newComponent(scheme, `{"name":"Annual","maximum_marks":100,"weight":70,"position":1}`)
	c.mustLink(fed, c.newExam("Annual", entexam.AssessmentKindEvaluative))
	empty := c.newComponent(scheme,
		`{"name":"Internal assessment","maximum_marks":30,"weight":30,"position":2}`)

	c.refusalSays(c.setStatus(scheme, "active"), http.StatusUnprocessableEntity,
		"result_scheme_does_not_compose", "Internal assessment",
		"no exam and no assignment linked to it")

	if stored := c.storedScheme(scheme); stored.Status != entresultscheme.StatusDraft {
		t.Fatalf("a refused activation must leave the scheme in draft, got %q", stored.Status)
	}
	if empty != c.componentNamed(scheme, "Internal assessment") {
		t.Fatalf("the empty component must be the one the refusal names")
	}

	c.mustLinkAssignment(empty, c.newAssignment("Term project", markedOutOf(30)))
	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("the hole is filled and the scheme must activate, got %d: %s",
			rec.Code, rec.Body.String())
	}
}

func TestAnAssignmentMarkedOutOfNothingCannotFeedAComponent(t *testing.T) {
	c := newCompositionWorld(t)

	scheme := c.newScheme("")
	component := c.newComponent(scheme, `{"name":"Homework","maximum_marks":20,"weight":100}`)

	unmarked := c.newAssignment("Read chapter four", nil)
	c.refusalSays(c.linkAssignment(component, unmarked), http.StatusUnprocessableEntity,
		"assignment_has_no_maximum", entassignment.FieldMaximumMarks, "Read chapter four")

	zero := c.newAssignment("Bring your model", markedOutOf(0))
	c.refusalSays(c.linkAssignment(component, zero), http.StatusUnprocessableEntity,
		"assignment_has_no_maximum", "Bring your model")

	if linked := c.linkedAssignments(component); linked != 0 {
		t.Fatalf("a refused link must not be written, got %d rows", linked)
	}

	homework := c.newAssignment("Fractions worksheet 3", markedOutOf(20))
	c.mustLinkAssignment(component, homework)
	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must activate while the homework is marked out of 20, got %d: %s",
			rec.Code, rec.Body.String())
	}

	if rec := c.setStatus(scheme, "draft"); rec.Code != http.StatusOK {
		t.Fatalf("an unattached scheme may be reopened, got %d: %s", rec.Code, rec.Body.String())
	}
	c.db.Client.Assignment.UpdateOneID(homework).
		ClearMaximumMarks().ExecX(context.Background())

	c.refusalSays(c.setStatus(scheme, "active"), http.StatusUnprocessableEntity,
		"result_scheme_does_not_compose", "Fractions worksheet 3", "undefined")
}

func TestAnAssignmentFromAnotherSessionMayNotFeedAResultComponent(t *testing.T) {
	c := newCompositionWorld(t)
	ctx := context.Background()

	scheme := c.newScheme("")
	component := c.newComponent(scheme, `{"name":"Homework","maximum_marks":20,"weight":100}`)

	other := c.db.Client.AcademicSession.Create().
		SetName("Next year").
		SetCode("RCA-" + uuid.NewString()[:8]).
		SetStartDate(time.Date(2027, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2028, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SaveX(ctx)
	stranger := c.db.Client.Assignment.Create().
		SetAcademicSessionID(other.ID).
		SetTeacherID(c.teacherT1).
		SetTitle("Next year's holiday homework").
		SetMaximumMarks(20).
		SaveX(ctx).ID

	c.refusalSays(c.linkAssignment(component, stranger), http.StatusUnprocessableEntity,
		"different academic session")
	if linked := c.linkedAssignments(component); linked != 0 {
		t.Fatalf("a refused link must not be written, got %d rows", linked)
	}
}

func TestAnActiveSchemeRefusesNewHomeworkAndASuccessorCarriesIt(t *testing.T) {
	c := newCompositionWorld(t)
	ctx := context.Background()

	scheme := c.newScheme("")
	component := c.newComponent(scheme, `{"name":"Homework","maximum_marks":20,"weight":100}`)
	c.mustLinkAssignment(component, c.newAssignment("Worksheet 1", markedOutOf(10)))
	c.mustLink(component, c.newExam("Unit test 1", entexam.AssessmentKindEvaluative))

	if rec := c.setStatus(scheme, "active"); rec.Code != http.StatusOK {
		t.Fatalf("the scheme must activate: %d %s", rec.Code, rec.Body.String())
	}

	later := c.newAssignment("Worksheet 2", markedOutOf(10))
	c.refusalSays(c.linkAssignment(component, later),
		http.StatusUnprocessableEntity, "result_scheme_not_draft")
	c.refusalSays(c.unlinkAssignment(component, later),
		http.StatusUnprocessableEntity, "result_scheme_not_draft")

	c.db.Client.SubjectOffering.UpdateOneID(c.physicsA).SetResultSchemeID(scheme).ExecX(ctx)

	body := fmt.Sprintf(`{"code":"RS-%s","name":"Annual composition, revised"}`, uuid.NewString()[:8])
	rec := c.call(c.composer.reviseResultScheme, http.MethodPatch,
		"/api/v1/result-schemes/"+scheme.String(), body,
		map[string]string{"id": scheme.String()})
	successor := c.idOf(rec, "result_scheme", http.StatusCreated)

	copied, err := c.db.Client.ResultComponent.Query().
		Where(entcomponent.ResultSchemeID(successor)).Only(ctx)
	if err != nil {
		t.Fatalf("the copied component could not be read: %v", err)
	}
	if c.linkedAssignments(copied.ID) != 1 {
		t.Fatalf("the homework must travel with the successor, got %d links",
			c.linkedAssignments(copied.ID))
	}
	exams, err := c.db.Client.ResultComponentExam.Query().
		Where(entcomponentexam.ResultComponentID(copied.ID)).Count(ctx)
	if err != nil {
		t.Fatalf("the copied exam links could not be counted: %v", err)
	}
	if exams != 1 {
		t.Fatalf("the exam must travel with the successor too, got %d links", exams)
	}
}
