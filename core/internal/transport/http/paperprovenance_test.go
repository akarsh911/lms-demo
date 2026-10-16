package http

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/papertargetsection"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/teacherassignment"
)

func (w *paperWorld) createGeneratedPaper(extra string) *httptest.ResponseRecorder {
	w.t.Helper()

	body := fmt.Sprintf(`{"academic_session_id":%q,"paper_code":"GP-%s",`+
		`"title":"Unit Test One","total_marks":40%s}`,
		w.sessionID, uuid.NewString()[:8], extra)
	return w.call(w.server.createPaper, http.MethodPost, "/api/v1/papers", body, nil)
}

func (w *paperWorld) paperCodes(rec *httptest.ResponseRecorder) []string {
	w.t.Helper()

	rows, ok := w.body(rec)["papers"].([]any)
	if !ok {
		w.t.Fatalf("the response carries no papers array: %s", rec.Body.String())
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		fields, _ := row.(map[string]any)
		code, _ := fields["paper_code"].(string)
		out = append(out, code)
	}
	return out
}

func (w *paperWorld) sectionIDs(rec *httptest.ResponseRecorder) []string {
	w.t.Helper()

	raw, ok := w.body(rec)["section_ids"].([]any)
	if !ok {
		w.t.Fatalf("the response carries no section_ids array: %s", rec.Body.String())
	}
	out := make([]string, 0, len(raw))
	for _, id := range raw {
		value, _ := id.(string)
		out = append(out, value)
	}
	return out
}

func listsPaper(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func (w *paperWorld) teacherID() uuid.UUID {
	w.t.Helper()

	row, err := w.db.Client.TeacherAssignment.Query().
		Where(entassignment.SectionID(w.sectionA)).
		First(w.ctx)
	if err != nil {
		w.t.Fatalf("the world's teacher could not be found: %v", err)
	}
	return row.TeacherID
}

func (w *paperWorld) sectionInOtherGrade(taught bool) uuid.UUID {
	w.t.Helper()

	branch, err := w.db.Client.Section.Get(w.ctx, w.sectionA)
	if err != nil {
		w.t.Fatalf("the world's section could not be read: %v", err)
	}

	tag := uuid.NewString()[:8]
	section := w.db.Client.Section.Create().
		SetAcademicSessionID(w.sessionID).
		SetBranchID(branch.BranchID).
		SetGradeLevelID(w.otherGrde).
		SetName("B").SetCode("PBB-" + tag).
		SaveX(w.ctx).ID

	if !taught {
		return section
	}

	offering := w.db.Client.SubjectOffering.Create().
		SetAcademicSessionID(w.sessionID).
		SetSectionID(section).
		SetSubjectID(w.physicsID).
		SaveX(w.ctx).ID
	w.db.Client.TeacherAssignment.Create().
		SetTeacherID(w.teacherID()).
		SetSubjectOfferingID(offering).
		SetSectionID(section).
		SetAcademicSessionID(w.sessionID).
		SetRoleType("subject_teacher").
		SaveX(w.ctx)

	return section
}

func TestAPaperComposedFromTheBankNeedsNoProvenance(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)

	row, err := w.db.Client.Paper.Get(context.Background(), paper)
	if err != nil {
		t.Fatalf("the paper could not be read back: %v", err)
	}
	if row.GradeLevelID != nil || row.EngineDocumentID != nil || row.ProvenanceJSON != nil {
		t.Fatalf("a paper carrying no generation must leave provenance empty, got %+v", row)
	}

	rec := w.call(w.server.getPaper, http.MethodGet, "/api/v1/papers/"+paper.String(), "",
		map[string]string{"id": paper.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("a paper without provenance must still be readable, got %d %s",
			rec.Code, rec.Body.String())
	}
	if ids := w.sectionIDs(rec); len(ids) != 0 {
		t.Fatalf("a paper targeting nothing must answer an empty section_ids, got %v", ids)
	}
}

func TestAGeneratedPaperCarriesItsProvenanceAndStaysReachable(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(
		`,"grade_level_id":%q,"section_ids":[%q],"engine_document_id":"doc-8842",`+
			`"provenance_json":{"persona_id":"strict_examiner@v2","seed":"91f4c0"}`,
		w.gradeID, w.sectionA))
	if rec.Code != http.StatusCreated {
		t.Fatalf("a generated paper with no blueprint must be accepted, got %d %s",
			rec.Code, rec.Body.String())
	}
	paper := w.idOf(rec, "paper")

	row, err := w.db.Client.Paper.Get(context.Background(), paper)
	if err != nil {
		t.Fatalf("the paper could not be read back: %v", err)
	}
	if row.GradeLevelID == nil || *row.GradeLevelID != w.gradeID {
		t.Fatalf("the paper must record its class, got %v", row.GradeLevelID)
	}
	if row.EngineDocumentID == nil || *row.EngineDocumentID != "doc-8842" {
		t.Fatalf("the paper must record the document it came from, got %v", row.EngineDocumentID)
	}
	if row.ProvenanceJSON == nil || row.ProvenanceJSON.PersonaID != "strict_examiner@v2" ||
		row.ProvenanceJSON.Seed != "91f4c0" {
		t.Fatalf("the paper must record how it was generated, got %+v", row.ProvenanceJSON)
	}

	got := w.sectionIDs(rec)
	if len(got) != 1 || got[0] != w.sectionA.String() {
		t.Fatalf("the create answer must name the targeted sections, got %v", got)
	}

	rec = w.call(w.server.getPaper, http.MethodGet, "/api/v1/papers/"+paper.String(), "",
		map[string]string{"id": paper.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("the narrowed viewer who generated the paper must reach it, got %d %s",
			rec.Code, rec.Body.String())
	}
	if got := w.sectionIDs(rec); len(got) != 1 || got[0] != w.sectionA.String() {
		t.Fatalf("the paper must read back its targeted sections, got %v", got)
	}
}

func TestAPaperWithNoAnchorAtAllIsStillRefused(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper("")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a paper anchored to nothing must still be refused, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestAClassTheViewerDoesNotTeachIsRefused(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"grade_level_id":%q,"section_ids":[%q]`,
		w.otherGrde, w.sectionA))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a class beyond the viewer's reach must be refused, got %d %s",
			rec.Code, rec.Body.String())
	}
	if got, _ := w.body(rec)["message"].(string); !strings.Contains(got, "grade_level_id") {
		t.Fatalf("the refusal must name the class, got %q", got)
	}
}

func TestAClassWithoutASectionAnchorsNothing(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"grade_level_id":%q`, w.gradeID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a class alone says who the paper is for, not who may reach it, "+
			"and must be refused; got %d %s", rec.Code, rec.Body.String())
	}
	if got, _ := w.body(rec)["message"].(string); !strings.Contains(got, "section_ids") {
		t.Fatalf("the refusal must name the anchors that would work, got %q", got)
	}
}

func TestASectionTheViewerDoesNotTeachIsRefused(t *testing.T) {
	w := newPaperWorld(t)

	stranger := w.sectionInOtherGrade(false)
	rec := w.createGeneratedPaper(fmt.Sprintf(`,"section_ids":[%q]`, stranger))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a section beyond the viewer's reach must be refused, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestATargetedSectionMustBelongToTheNamedClass(t *testing.T) {
	w := newPaperWorld(t)

	elsewhere := w.sectionInOtherGrade(true)
	rec := w.createGeneratedPaper(fmt.Sprintf(`,"grade_level_id":%q,"section_ids":[%q]`,
		w.gradeID, elsewhere))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a section of another class must be refused, got %d %s",
			rec.Code, rec.Body.String())
	}

	rec = w.createGeneratedPaper(fmt.Sprintf(`,"grade_level_id":%q,"section_ids":[%q]`,
		w.otherGrde, elsewhere))
	if rec.Code != http.StatusCreated {
		t.Fatalf("a section of the named class must be accepted, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestTheApprovalQueueNarrowsByClassAndSection(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"grade_level_id":%q,"section_ids":[%q]`,
		w.gradeID, w.sectionA))
	if rec.Code != http.StatusCreated {
		t.Fatalf("the paper was not created: %d %s", rec.Code, rec.Body.String())
	}
	paper := w.idOf(rec, "paper")
	code, _ := w.body(rec)["paper"].(map[string]any)["paper_code"].(string)

	rec = w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		`{"status":"reviewed"}`, map[string]string{"id": paper.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("the paper was not moved to reviewed: %d %s", rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.listPapers, http.MethodGet,
		"/api/v1/papers?grade_level_id="+w.gradeID.String()+"&status=reviewed", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("the queue must be listable, got %d %s", rec.Code, rec.Body.String())
	}
	if !listsPaper(w.paperCodes(rec), code) {
		t.Fatalf("the queue for this class must carry the paper, got %v", w.paperCodes(rec))
	}

	rec = w.call(w.server.listPapers, http.MethodGet,
		"/api/v1/papers?section_id="+w.sectionA.String(), "", nil)
	if !listsPaper(w.paperCodes(rec), code) {
		t.Fatalf("the section filter must carry the paper, got %v", w.paperCodes(rec))
	}

	rec = w.call(w.server.listPapers, http.MethodGet,
		"/api/v1/papers?grade_level_id="+w.otherGrde.String(), "", nil)
	if listsPaper(w.paperCodes(rec), code) {
		t.Fatalf("another class's queue must not carry the paper, got %v", w.paperCodes(rec))
	}

	rec = w.call(w.server.listPapers, http.MethodGet,
		"/api/v1/papers?grade_level_id="+w.gradeID.String()+"&status=draft", "", nil)
	if listsPaper(w.paperCodes(rec), code) {
		t.Fatalf("filters only ever narrow; a draft queue must not carry a reviewed paper, got %v",
			w.paperCodes(rec))
	}
}

func TestAPaperForAClassBeyondReachIsNotFoundRatherThanForbidden(t *testing.T) {
	w := newPaperWorld(t)

	unreachable := w.db.Client.Paper.Create().
		SetAcademicSessionID(w.sessionID).
		SetGradeLevelID(w.otherGrde).
		SetPaperCode("XP-" + uuid.NewString()[:8]).
		SetTitle("Another Class").
		SetTotalMarks(40).
		SaveX(w.ctx)

	rec := w.call(w.server.getPaper, http.MethodGet,
		"/api/v1/papers/"+unreachable.ID.String(), "",
		map[string]string{"id": unreachable.ID.String()})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable paper is 404, never 403, got %d %s",
			rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.listPapers, http.MethodGet,
		"/api/v1/papers?grade_level_id="+w.otherGrde.String(), "", nil)
	if listsPaper(w.paperCodes(rec), unreachable.PaperCode) {
		t.Fatalf("an unreachable paper must not appear in a list, got %v", w.paperCodes(rec))
	}

	rec = w.call(w.server.updatePaper, http.MethodPatch,
		"/api/v1/papers/"+unreachable.ID.String(), `{"title":"Mine now"}`,
		map[string]string{"id": unreachable.ID.String()})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("patching an unreachable paper is 404, never 403, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestRetargetingReplacesTheWholeSet(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"grade_level_id":%q,"section_ids":[%q]`,
		w.gradeID, w.sectionA))
	if rec.Code != http.StatusCreated {
		t.Fatalf("the paper was not created: %d %s", rec.Code, rec.Body.String())
	}
	paper := w.idOf(rec, "paper")

	rec = w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		`{"section_ids":[]}`, map[string]string{"id": paper.String()})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("dropping every target would leave the paper unreachable to the viewer "+
			"who owns it, and must be refused; got %d %s", rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		fmt.Sprintf(`{"section_ids":[%q,%q]}`, w.sectionA, w.sectionA),
		map[string]string{"id": paper.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("a repeated section must be folded, not refused, got %d %s",
			rec.Code, rec.Body.String())
	}
	if got := w.sectionIDs(rec); len(got) != 1 {
		t.Fatalf("a repeated section must be stored once, got %v", got)
	}

	rec = w.call(w.server.getPaper, http.MethodGet, "/api/v1/papers/"+paper.String(), "",
		map[string]string{"id": paper.String()})
	if got := w.sectionIDs(rec); len(got) != 1 || got[0] != w.sectionA.String() {
		t.Fatalf("the stored targets must survive the patch, got %v", got)
	}
}

func TestAnEmptyDocumentIDIsRefused(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(
		`,"grade_level_id":%q,"engine_document_id":""`, w.gradeID))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an empty document id must be refused rather than stored, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestDeletingAPaperTakesItsTargetingWithIt(t *testing.T) {
	w := newPaperWorld(t)

	rec := w.createGeneratedPaper(fmt.Sprintf(`,"grade_level_id":%q,"section_ids":[%q]`,
		w.gradeID, w.sectionA))
	if rec.Code != http.StatusCreated {
		t.Fatalf("the paper was not created: %d %s", rec.Code, rec.Body.String())
	}
	paper := w.idOf(rec, "paper")

	rec = w.call(w.server.deletePaper, http.MethodDelete, "/api/v1/papers/"+paper.String(), "",
		map[string]string{"id": paper.String()})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("the paper was not deleted: %d %s", rec.Code, rec.Body.String())
	}

	left, err := w.db.Client.PaperTargetSection.Query().
		Where(enttarget.PaperID(paper)).Count(w.ctx)
	if err != nil {
		t.Fatalf("the targeting could not be counted: %v", err)
	}
	if left != 0 {
		t.Fatalf("a deleted paper must leave no targeting behind, got %d rows", left)
	}
}
