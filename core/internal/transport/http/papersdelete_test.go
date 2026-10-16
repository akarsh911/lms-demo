package http

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entpaper "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/paper"
	entpquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/paperquestion"
	entpsection "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/papersection"
)

func (w *paperWorld) namedSection(paper uuid.UUID, code string,
	position int) uuid.UUID {
	w.t.Helper()

	rec := w.call(w.server.createPaperSection, http.MethodPost,
		"/api/v1/papers/"+paper.String()+"/sections",
		fmt.Sprintf(`{"name":"Section %s","code":%q,"position":%d}`, code, code, position),
		map[string]string{"id": paper.String()})
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("the paper section was not created: %d %s", rec.Code, rec.Body.String())
	}
	return w.idOf(rec, "paper_section")
}

func (w *paperWorld) placedQuestion(section uuid.UUID, position int) uuid.UUID {
	w.t.Helper()

	question := w.createQuestion(w.physicsID, w.gradeID)
	version := w.createVersion(question, fmt.Sprintf("Question at position %d?", position))
	rec := w.placeQuestion(section, question, version, position)
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("the question was not placed at %d: %d %s",
			position, rec.Code, rec.Body.String())
	}
	return w.idOf(rec, "paper_question")
}

func (w *paperWorld) deleteSection(id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.server.deletePaperSection, http.MethodDelete,
		"/api/v1/paper-sections/"+id.String(), "", map[string]string{"id": id.String()})
}

func (w *paperWorld) deleteQuestion(id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	return w.call(w.server.deletePaperQuestion, http.MethodDelete,
		"/api/v1/paper-questions/"+id.String(), "", map[string]string{"id": id.String()})
}

func (w *paperWorld) positionsIn(section uuid.UUID) []int {
	w.t.Helper()

	rows, err := w.db.Client.PaperQuestion.Query().
		Where(entpquestion.PaperSectionID(section)).
		Order(tenantent.Asc(entpquestion.FieldPosition)).
		All(context.Background())
	if err != nil {
		w.t.Fatalf("the paper questions could not be read back: %v", err)
	}
	out := make([]int, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.Position)
	}
	return out
}

func (w *paperWorld) foreignPaper() uuid.UUID {
	w.t.Helper()

	ctx := context.Background()
	blueprint := w.db.Client.Blueprint.Create().
		SetSubjectID(w.historyID).
		SetGradeLevelID(w.otherGrde).
		SetCode("BPD-" + uuid.NewString()[:8]).
		SetName("Someone else's pattern").
		SetTotalMarks(80).
		SetDurationMinutes(180).
		SetCognitiveScheme(schemeFixture()).
		SaveX(ctx)

	return w.db.Client.Paper.Create().
		SetAcademicSessionID(w.sessionID).
		SetBlueprintID(blueprint.ID).
		SetPaperCode("PCD-" + uuid.NewString()[:8]).
		SetTitle("Someone else's paper").
		SetTotalMarks(80).
		SaveX(ctx).ID
}

func (w *paperWorld) sectionOn(paper uuid.UUID, code string, position int) uuid.UUID {
	w.t.Helper()

	return w.db.Client.PaperSection.Create().
		SetPaperID(paper).
		SetName("Section " + code).
		SetCode(code).
		SetPosition(position).
		SaveX(context.Background()).ID
}

func (w *paperWorld) questionOn(section uuid.UUID, position int) uuid.UUID {
	w.t.Helper()

	question := w.createQuestion(w.physicsID, w.gradeID)
	version := w.createVersion(question, fmt.Sprintf("Planted question %d?", position))
	return w.db.Client.PaperQuestion.Create().
		SetPaperSectionID(section).
		SetQuestionID(question).
		SetQuestionVersionID(version).
		SetQuestionNumber(fmt.Sprintf("%d", position)).
		SetMarks(4).
		SetPosition(position).
		SaveX(context.Background()).ID
}

func (w *paperWorld) publish(paper uuid.UUID) {
	w.t.Helper()

	rec := w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		`{"status":"published"}`, map[string]string{"id": paper.String()})
	if rec.Code != http.StatusOK {
		w.t.Fatalf("publishing the paper failed: %d %s", rec.Code, rec.Body.String())
	}
}

func TestDeletingAPaperQuestionLeavesTheSurvivingPositionsAlone(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)
	section := w.namedSection(paper, "A", 1)
	sibling := w.namedSection(paper, "B", 2)

	first := w.placedQuestion(section, 1)
	middle := w.placedQuestion(section, 2)
	last := w.placedQuestion(section, 3)
	untouched := w.placedQuestion(sibling, 1)

	if rec := w.deleteQuestion(middle); rec.Code != http.StatusNoContent {
		t.Fatalf("removing a question from a draft paper must succeed, got %d %s",
			rec.Code, rec.Body.String())
	}

	got := w.positionsIn(section)
	if len(got) != 2 || got[0] != 1 || got[1] != 3 {
		t.Fatalf("a delete leaves the gap and renumbers nothing, got positions %v", got)
	}

	ctx := context.Background()
	for _, id := range []uuid.UUID{first, last, untouched} {
		if _, err := w.db.Client.PaperQuestion.Get(ctx, id); err != nil {
			t.Fatalf("the delete disturbed paper question %s: %v", id, err)
		}
	}
	if _, err := w.db.Client.PaperQuestion.Get(ctx, middle); !tenantent.IsNotFound(err) {
		t.Fatalf("the named question is still there: %v", err)
	}

	if rec := w.deleteQuestion(middle); rec.Code != http.StatusNotFound {
		t.Fatalf("deleting the same question twice is a 404, got %d %s",
			rec.Code, rec.Body.String())
	}

	refill := w.createQuestion(w.physicsID, w.gradeID)
	rec := w.placeQuestion(section, refill, w.createVersion(refill, "A replacement?"), 2)
	if rec.Code != http.StatusCreated {
		t.Fatalf("the vacated position must be free again, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestDeletingAPaperSectionTakesItsQuestionsAndNoOthers(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)
	other := w.createPaper(blueprint)

	section := w.namedSection(paper, "A", 1)
	sibling := w.namedSection(paper, "B", 2)
	elsewhere := w.namedSection(other, "A", 1)

	doomed := w.placedQuestion(section, 1)
	alsoDoomed := w.placedQuestion(section, 2)
	spared := w.placedQuestion(sibling, 1)
	sparedElsewhere := w.placedQuestion(elsewhere, 1)

	if rec := w.deleteSection(section); rec.Code != http.StatusNoContent {
		t.Fatalf("removing a section from a draft paper must succeed, got %d %s",
			rec.Code, rec.Body.String())
	}

	ctx := context.Background()
	if _, err := w.db.Client.PaperSection.Get(ctx, section); !tenantent.IsNotFound(err) {
		t.Fatalf("the section is still there: %v", err)
	}
	for _, id := range []uuid.UUID{doomed, alsoDoomed} {
		if _, err := w.db.Client.PaperQuestion.Get(ctx, id); !tenantent.IsNotFound(err) {
			t.Fatalf("the schema cascades a section's questions, yet %s survived: %v", id, err)
		}
	}
	for _, id := range []uuid.UUID{spared, sparedElsewhere} {
		if _, err := w.db.Client.PaperQuestion.Get(ctx, id); err != nil {
			t.Fatalf("the cascade reached beyond the named section and took %s: %v", id, err)
		}
	}
	for _, id := range []uuid.UUID{sibling, elsewhere} {
		if _, err := w.db.Client.PaperSection.Get(ctx, id); err != nil {
			t.Fatalf("the delete disturbed section %s: %v", id, err)
		}
	}
	if _, err := w.db.Client.Paper.Get(ctx, paper); err != nil {
		t.Fatalf("deleting a section must not take its paper: %v", err)
	}
}

func TestAPaperSectionYouCannotReachIsNotFoundNotForbidden(t *testing.T) {
	w := newPaperWorld(t)

	foreign := w.foreignPaper()
	foreignSection := w.sectionOn(foreign, "A", 1)
	foreignQuestion := w.questionOn(foreignSection, 1)

	if rec := w.deleteSection(foreignSection); rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable paper section is a 404, never a 403; got %d %s",
			rec.Code, rec.Body.String())
	}
	if rec := w.deleteQuestion(foreignQuestion); rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable paper question is a 404, never a 403; got %d %s",
			rec.Code, rec.Body.String())
	}

	ctx := context.Background()
	if _, err := w.db.Client.PaperSection.Get(ctx, foreignSection); err != nil {
		t.Fatalf("the refused delete still removed the section: %v", err)
	}
	if _, err := w.db.Client.PaperQuestion.Get(ctx, foreignQuestion); err != nil {
		t.Fatalf("the refused delete still removed the question: %v", err)
	}

	mine := w.createPaper(w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint"))
	ownSection := w.namedSection(mine, "A", 1)
	if rec := w.deleteSection(ownSection); rec.Code != http.StatusNoContent {
		t.Fatalf("the viewer's own section must be deletable, or the 404s prove nothing; "+
			"got %d %s", rec.Code, rec.Body.String())
	}
}

func TestAnUnreachablePublishedPaperIsStillOnlyANotFound(t *testing.T) {
	w := newPaperWorld(t)

	foreign := w.foreignPaper()
	foreignSection := w.sectionOn(foreign, "A", 1)
	w.db.Client.Paper.UpdateOneID(foreign).
		SetStatus(entpaper.StatusPublished).
		SaveX(context.Background())

	rec := w.deleteSection(foreignSection)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("authorization comes before the status check, so an unreachable published "+
			"paper leaks nothing and is a 404; got %d %s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); body != "" {
		if got, _ := w.body(rec)["error"].(string); got == paperSettledError {
			t.Fatal("the refusal told an outsider the paper exists and is published")
		}
	}
}

func TestAPublishedPaperKeepsEveryPartItPrinted(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)
	section := w.namedSection(paper, "A", 1)
	question := w.placedQuestion(section, 1)

	w.publish(paper)

	rec := w.deleteQuestion(question)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a published paper keeps the questions it printed, got %d %s",
			rec.Code, rec.Body.String())
	}
	if got, _ := w.body(rec)["error"].(string); got != paperSettledError {
		t.Fatalf("the refusal must name the paper as published, got %q", got)
	}

	rec = w.deleteSection(section)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a published paper keeps the sections it printed, got %d %s",
			rec.Code, rec.Body.String())
	}
	if got, _ := w.body(rec)["error"].(string); got != paperSettledError {
		t.Fatalf("the refusal must name the paper as published, got %q", got)
	}

	ctx := context.Background()
	if _, err := w.db.Client.PaperQuestion.Get(ctx, question); err != nil {
		t.Fatalf("the refused delete still removed the question: %v", err)
	}
	if _, err := w.db.Client.PaperSection.Get(ctx, section); err != nil {
		t.Fatalf("the refused delete still removed the section: %v", err)
	}
}

func TestAnApprovedPaperIsStillEditableUntilItIsPublished(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)
	section := w.namedSection(paper, "A", 1)
	question := w.placedQuestion(section, 1)

	rec := w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		`{"status":"approved"}`, map[string]string{"id": paper.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("approving the paper failed: %d %s", rec.Code, rec.Body.String())
	}

	if rec := w.deleteQuestion(question); rec.Code != http.StatusNoContent {
		t.Fatalf("approval is not the immutability boundary in this repo, publication is; "+
			"an approved paper still takes a question out, got %d %s", rec.Code, rec.Body.String())
	}
	if rec := w.deleteSection(section); rec.Code != http.StatusNoContent {
		t.Fatalf("an approved paper still takes a section out, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestAPaperSectionCountIsUnaffectedByAnotherPapersDelete(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	mine := w.createPaper(blueprint)
	theirs := w.createPaper(blueprint)

	w.namedSection(mine, "A", 1)
	keep := w.namedSection(theirs, "A", 1)
	alsoKeep := w.namedSection(theirs, "B", 2)

	ctx := context.Background()
	sections, err := w.db.Client.PaperSection.Query().
		Where(entpsection.PaperID(mine)).All(ctx)
	if err != nil || len(sections) != 1 {
		t.Fatalf("the fixture is wrong: %d sections (%v)", len(sections), err)
	}

	if rec := w.deleteSection(sections[0].ID); rec.Code != http.StatusNoContent {
		t.Fatalf("the section was not deleted: %d %s", rec.Code, rec.Body.String())
	}

	remaining, err := w.db.Client.PaperSection.Query().
		Where(entpsection.PaperID(theirs)).All(ctx)
	if err != nil || len(remaining) != 2 {
		t.Fatalf("the other paper lost sections: %d remain (%v)", len(remaining), err)
	}
	for _, id := range []uuid.UUID{keep, alsoKeep} {
		if _, err := w.db.Client.PaperSection.Get(ctx, id); err != nil {
			t.Fatalf("section %s was taken by another paper's delete: %v", id, err)
		}
	}
}

func TestPaperPartDeleteRoutesAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	for _, pattern := range []string{
		"DELETE /api/v1/paper-sections/{id}",
		"DELETE /api/v1/paper-questions/{id}",
	} {
		if !found[pattern] && !found[pattern+"/"] {
			t.Errorf("%s is not mounted on the real router, so a teacher still cannot take "+
				"a question out of a paper however well the handler is tested", pattern)
		}
	}
}
