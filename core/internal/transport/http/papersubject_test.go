package http

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	entpaper "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/paper"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

func (w *paperWorld) callAs(ctx context.Context, handler http.HandlerFunc, method, path string,
	params map[string]string) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	for name, value := range params {
		route.URLParams.Add(name, value)
	}
	request := httptest.NewRequest(method, path, strings.NewReader("")).
		WithContext(context.WithValue(ctx, chi.RouteCtxKey, route))

	rec := httptest.NewRecorder()
	handler(rec, request)
	return rec
}

func (w *paperWorld) sectionWideTeacherContext() context.Context {
	w.t.Helper()

	tag := uuid.NewString()[:8]
	casUser := uuid.New()
	person := w.db.Client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Wide").
		SetDisplayName("Class Teacher " + tag).
		SaveX(w.ctx)
	staff := w.db.Client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("PWT-" + tag).
		SaveX(w.ctx)
	teacher := w.db.Client.Teacher.Create().SetStaffID(staff.ID).SaveX(w.ctx)
	w.db.Client.TeacherAssignment.Create().
		SetTeacherID(teacher.ID).
		SetSectionID(w.sectionA).
		SetAcademicSessionID(w.sessionID).
		SetRoleType("class_teacher").
		SaveX(w.ctx)

	ctx := authorization.WithSubject(context.Background(),
		&authorization.Subject{CASUserID: casUser})
	return postgres.WithConn(ctx, &postgres.TenantConn{Client: w.db.Client})
}

func (w *paperWorld) paperForSubject(subject *uuid.UUID, section uuid.UUID) uuid.UUID {
	w.t.Helper()

	create := w.db.Client.Paper.Create().
		SetAcademicSessionID(w.sessionID).
		SetPaperCode("SP-" + uuid.NewString()[:8]).
		SetTitle("Targeted Paper").
		SetTotalMarks(40)
	if subject != nil {
		create = create.SetSubjectID(*subject)
	}
	paper := create.SaveX(w.ctx)

	w.db.Client.PaperTargetSection.Create().
		SetPaperID(paper.ID).SetSectionID(section).SaveX(w.ctx)
	return paper.ID
}

func (w *paperWorld) readsPaper(ctx context.Context, paper uuid.UUID) int {
	w.t.Helper()

	return w.callAs(ctx, w.server.getPaper, http.MethodGet,
		"/api/v1/papers/"+paper.String(), map[string]string{"id": paper.String()}).Code
}

func TestThePhysicsTeacherCannotReadTheHistoryPaperForTheirOwnSection(t *testing.T) {
	w := newPaperWorld(t)

	history := w.paperForSubject(&w.historyID, w.sectionA)
	physics := w.paperForSubject(&w.physicsID, w.sectionA)

	if got := w.readsPaper(w.ctx, physics); got != http.StatusOK {
		t.Fatalf("the teacher of this subject in this section must reach the paper, got %d", got)
	}
	if got := w.readsPaper(w.ctx, history); got != http.StatusNotFound {
		t.Fatalf("teaching one subject in a section must not hand over another subject's "+
			"paper for the same section, and an unreachable paper is 404; got %d", got)
	}

	rec := w.callAs(w.ctx, w.server.listPapers, http.MethodGet,
		"/api/v1/papers?section_id="+w.sectionA.String(), nil)
	codes := w.paperCodes(rec)
	row, err := w.db.Client.Paper.Get(w.ctx, history)
	if err != nil {
		t.Fatalf("the paper could not be read back: %v", err)
	}
	if listsPaper(codes, row.PaperCode) {
		t.Fatalf("the other subject's paper must not appear in a section listing, got %v", codes)
	}
}

func TestAPaperNamingNoSubjectKeepsTheReachItAlreadyHad(t *testing.T) {
	w := newPaperWorld(t)

	untagged := w.paperForSubject(nil, w.sectionA)
	if got := w.readsPaper(w.ctx, untagged); got != http.StatusOK {
		t.Fatalf("a paper predating the subject column must stay reachable through its "+
			"target sections, got %d", got)
	}
}

func TestASectionWideAssignmentDoesNotReachEverySubject(t *testing.T) {
	w := newPaperWorld(t)

	ctx := w.sectionWideTeacherContext()
	untagged := w.paperForSubject(nil, w.sectionA)
	tagged := w.paperForSubject(&w.physicsID, w.sectionA)

	if got := w.readsPaper(ctx, untagged); got != http.StatusOK {
		t.Fatalf("a section-wide assignment still reaches a paper that names no subject, got %d", got)
	}
	if got := w.readsPaper(ctx, tagged); got != http.StatusNotFound {
		t.Fatalf("an assignment carrying no subject_offering_id says nothing about subject "+
			"and must not reach every subject, got %d", got)
	}
}

func TestASubjectTheViewerDoesNotTeachIsRefusedOnCreate(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"subject_id":%q,"section_ids":[%q]`,
		w.historyID, w.sectionA))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a paper the creator could not then read must be refused, got %d %s",
			rec.Code, rec.Body.String())
	}
	if got, _ := w.body(rec)["message"].(string); !strings.Contains(got, "subject_id") {
		t.Fatalf("the refusal must name the subject, got %q", got)
	}

	stored, err := w.db.Client.Paper.Query().
		Where(entpaper.SubjectID(w.historyID)).Count(w.ctx)
	if err != nil {
		t.Fatalf("the papers could not be counted: %v", err)
	}
	if stored != 0 {
		t.Fatalf("the refusal must roll the paper back, got %d rows", stored)
	}
}

func TestASubjectTheViewerTeachesIsAcceptedAndReadBack(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"subject_id":%q,"section_ids":[%q]`,
		w.physicsID, w.sectionA))
	if rec.Code != http.StatusCreated {
		t.Fatalf("a paper for a subject the viewer teaches in the targeted section must be "+
			"accepted, got %d %s", rec.Code, rec.Body.String())
	}
	paper := w.idOf(rec, "paper")

	row, err := w.db.Client.Paper.Get(context.Background(), paper)
	if err != nil {
		t.Fatalf("the paper could not be read back: %v", err)
	}
	if row.SubjectID == nil || *row.SubjectID != w.physicsID {
		t.Fatalf("the paper must record its subject, got %v", row.SubjectID)
	}
	if got := w.readsPaper(w.ctx, paper); got != http.StatusOK {
		t.Fatalf("the creator must still reach their own paper, got %d", got)
	}
}

func TestPatchingTheSubjectBeyondReachIsRefusedAndTheOldSubjectStands(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"subject_id":%q,"section_ids":[%q]`,
		w.physicsID, w.sectionA))
	if rec.Code != http.StatusCreated {
		t.Fatalf("the paper was not created: %d %s", rec.Code, rec.Body.String())
	}
	paper := w.idOf(rec, "paper")

	rec = w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		fmt.Sprintf(`{"subject_id":%q}`, w.historyID),
		map[string]string{"id": paper.String()})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("patching a paper into a subject the viewer does not teach would lose it, "+
			"and must be refused; got %d %s", rec.Code, rec.Body.String())
	}

	row, err := w.db.Client.Paper.Get(context.Background(), paper)
	if err != nil {
		t.Fatalf("the paper could not be read back: %v", err)
	}
	if row.SubjectID == nil || *row.SubjectID != w.physicsID {
		t.Fatalf("a refused patch must not have written anything, got %v", row.SubjectID)
	}
	if got := w.readsPaper(w.ctx, paper); got != http.StatusOK {
		t.Fatalf("the paper must still be the creator's own after the refusal, got %d", got)
	}
}

func TestTheSubjectFilterNarrowsTheQueueAndOnlyNarrows(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"subject_id":%q,"section_ids":[%q]`,
		w.physicsID, w.sectionA))
	if rec.Code != http.StatusCreated {
		t.Fatalf("the paper was not created: %d %s", rec.Code, rec.Body.String())
	}
	code, _ := w.body(rec)["paper"].(map[string]any)["paper_code"].(string)

	rec = w.callAs(w.ctx, w.server.listPapers, http.MethodGet,
		"/api/v1/papers?subject_id="+w.physicsID.String(), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("the subject queue must be listable, got %d %s", rec.Code, rec.Body.String())
	}
	if !listsPaper(w.paperCodes(rec), code) {
		t.Fatalf("the queue for this subject must carry the paper, got %v", w.paperCodes(rec))
	}

	rec = w.callAs(w.ctx, w.server.listPapers, http.MethodGet,
		"/api/v1/papers?subject_id="+w.historyID.String(), nil)
	if listsPaper(w.paperCodes(rec), code) {
		t.Fatalf("another subject's queue must not carry the paper, got %v", w.paperCodes(rec))
	}

	rec = w.callAs(w.ctx, w.server.listPapers, http.MethodGet,
		"/api/v1/papers?subject_id="+w.physicsID.String()+"&status=approved", nil)
	if listsPaper(w.paperCodes(rec), code) {
		t.Fatalf("filters only ever narrow; an approved queue must not carry a draft, got %v",
			w.paperCodes(rec))
	}
}

func (w *paperWorld) sectionWideElsewhere() uuid.UUID {
	w.t.Helper()

	section := w.sectionInOtherGrade(false)
	w.db.Client.TeacherAssignment.Create().
		SetTeacherID(w.teacherID()).
		SetSectionID(section).
		SetAcademicSessionID(w.sessionID).
		SetRoleType("class_teacher").
		SaveX(w.ctx)
	return section
}

func TestASubjectTaughtInOneSectionDoesNotReachIntoAnother(t *testing.T) {
	w := newPaperWorld(t)

	elsewhere := w.sectionWideElsewhere()
	untagged := w.paperForSubject(nil, elsewhere)
	physics := w.paperForSubject(&w.physicsID, elsewhere)
	history := w.paperForSubject(&w.historyID, elsewhere)

	if got := w.readsPaper(w.ctx, untagged); got != http.StatusOK {
		t.Fatalf("a section-wide assignment reaches a paper that names no subject, got %d", got)
	}
	if got := w.readsPaper(w.ctx, physics); got != http.StatusNotFound {
		t.Fatalf("teaching physics in another section is not teaching it here, and a paper "+
			"out of reach is 404; got %d", got)
	}
	if got := w.readsPaper(w.ctx, history); got != http.StatusNotFound {
		t.Fatalf("a subject the viewer teaches nowhere must never be reached, got %d", got)
	}
}
