package http

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
)

type examCampaignGuard struct{}

func (examCampaignGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.TimetableRead, authorization.TimetableWrite, authorization.TimetableDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "exam campaign test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (examCampaignGuard) Name() string { return "exam campaign database test guard" }

type assessmentWorld struct {
	*examWorld
	campaign *Server
}

func newAssessmentWorld(t *testing.T) *assessmentWorld {
	t.Helper()
	return &assessmentWorld{
		examWorld: newExamWorld(t),
		campaign:  &Server{guard: examCampaignGuard{}},
	}
}

func (a *assessmentWorld) createExamBody(fields string) *httptest.ResponseRecorder {
	a.t.Helper()

	body := fmt.Sprintf(`{"academic_session_id":%q,"branch_id":%q,"name":"Chapter Four Check","code":"EXK-%s"%s}`,
		a.sessionID, a.branchID, uuid.NewString()[:8], fields)

	rec := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/exams", strings.NewReader(body))
	a.campaign.createExam(rec, request.WithContext(a.ctx))
	return rec
}

func (a *assessmentWorld) patchExam(id uuid.UUID, body string) *httptest.ResponseRecorder {
	a.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", id.String())
	ctx := context.WithValue(a.ctx, chi.RouteCtxKey, route)

	rec := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/exams/"+id.String(), strings.NewReader(body))
	a.campaign.updateExam(rec, request.WithContext(ctx))
	return rec
}

func (a *assessmentWorld) createdExam(rec *httptest.ResponseRecorder) *tenantent.Exam {
	a.t.Helper()

	if rec.Code != http.StatusCreated {
		a.t.Fatalf("the exam was not created: %d %s", rec.Code, rec.Body.String())
	}
	var body struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		a.t.Fatalf("the created exam was not JSON: %v (%s)", err, rec.Body.String())
	}
	return a.readExam(body.ID)
}

func (a *assessmentWorld) readExam(id uuid.UUID) *tenantent.Exam {
	a.t.Helper()

	row, err := a.db.Client.Exam.Get(context.Background(), id)
	if err != nil {
		a.t.Fatalf("the exam %s could not be read back: %v", id, err)
	}
	return row
}

func (a *assessmentWorld) exams() int {
	a.t.Helper()

	count, err := a.db.Client.Exam.Query().Count(context.Background())
	if err != nil {
		a.t.Fatalf("the exams could not be counted: %v", err)
	}
	return count
}

func TestAPracticeExamIsCreated(t *testing.T) {
	a := newAssessmentWorld(t)

	row := a.createdExam(a.createExamBody(`,"assessment_kind":"practice"`))
	if row.AssessmentKind != entexam.AssessmentKindPractice {
		t.Fatalf("the exam must be stored as practice, got %q", row.AssessmentKind)
	}
}

func TestAnExamCreatedWithoutAKindIsEvaluative(t *testing.T) {
	a := newAssessmentWorld(t)

	row := a.createdExam(a.createExamBody(""))
	if row.AssessmentKind != entexam.AssessmentKindEvaluative {
		t.Fatalf("an exam scheduled without saying otherwise counts toward the result, got %q",
			row.AssessmentKind)
	}

	seeded := a.readExam(a.examID)
	if seeded.AssessmentKind != entexam.AssessmentKindEvaluative {
		t.Fatalf("an exam written by a path that never mentions the column reads back as %q "+
			"rather than evaluative", seeded.AssessmentKind)
	}
}

func TestAnUnknownAssessmentKindIsRefused(t *testing.T) {
	a := newAssessmentWorld(t)
	before := a.exams()

	rec := a.createExamBody(`,"assessment_kind":"formative"`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a kind outside the enum must be refused, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), entexam.FieldAssessmentKind) {
		t.Fatalf("the refusal must name the field, got %s", rec.Body.String())
	}
	if after := a.exams(); after != before {
		t.Fatalf("a refused exam must not be written, %d rows became %d", before, after)
	}
}

func TestAnExamBecomesPracticeOnUpdate(t *testing.T) {
	a := newAssessmentWorld(t)
	id := a.createdExam(a.createExamBody("")).ID

	rec := a.patchExam(id, `{"assessment_kind":"practice"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("an exam may be reclassified while nothing has been computed from it, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if row := a.readExam(id); row.AssessmentKind != entexam.AssessmentKindPractice {
		t.Fatalf("the exam must have become practice, got %q", row.AssessmentKind)
	}
}

func TestAPracticeExamKeepsItsKindAcrossAnUnrelatedUpdate(t *testing.T) {
	a := newAssessmentWorld(t)
	id := a.createdExam(a.createExamBody(`,"assessment_kind":"practice"`)).ID

	rec := a.patchExam(id, `{"name":"Chapter Four Check, moved"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("an update that touches neither field must be accepted, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if row := a.readExam(id); row.AssessmentKind != entexam.AssessmentKindPractice {
		t.Fatalf("the kind must survive an update that did not mention it, got %q", row.AssessmentKind)
	}
}
