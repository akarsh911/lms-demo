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
	entblueprint "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/blueprint"
	entpquestion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/paperquestion"
	entversion "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/questionversion"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type paperGuard struct{}

func (paperGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.QuestionBankRead, authorization.QuestionBankWrite,
		authorization.QuestionBankCreate, authorization.QuestionBankDelete,
		authorization.BlueprintsRead, authorization.BlueprintsWrite,
		authorization.BlueprintsCreate, authorization.BlueprintsDelete,
		authorization.PapersRead, authorization.PapersWrite,
		authorization.PapersCreate, authorization.PapersDelete,
		authorization.PaperGenerationRead, authorization.PaperGenerationWrite,
		authorization.PaperGenerationCreate:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTeacherAssignment,
			HasReach: true,
			Rule:     "paper test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (paperGuard) Name() string { return "paper bank database test guard" }

type paperWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	sessionID uuid.UUID
	gradeID   uuid.UUID
	otherGrde uuid.UUID
	sectionA  uuid.UUID

	physicsID uuid.UUID
	historyID uuid.UUID

	person uuid.UUID
	tag    string
}

func newPaperWorld(t *testing.T) *paperWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	branch := client.Branch.Create().
		SetName("Paper Campus " + tag).SetCode("PBB-" + tag).SaveX(ctx)

	session := client.AcademicSession.Create().
		SetName("Paper Session " + tag).
		SetCode("PBS-" + tag).
		SetStartDate(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2027, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SetIsCurrent(true).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("X " + tag).SetCode("PBG-" + tag).SetSequence(10).SaveX(ctx)
	otherGrade := client.GradeLevel.Create().
		SetName("XII " + tag).SetCode("PBH-" + tag).SetSequence(12).SaveX(ctx)

	sectionA := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").SetCode("PBA-" + tag).
		SaveX(ctx).ID

	physics := client.Subject.Create().
		SetName("Physics " + tag).SetCode("PBP-" + tag).SaveX(ctx)
	history := client.Subject.Create().
		SetName("History " + tag).SetCode("PBQ-" + tag).SaveX(ctx)

	physicsOffering := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).
		SetSectionID(sectionA).
		SetSubjectID(physics.ID).
		SaveX(ctx).ID

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Paper").
		SetDisplayName("Paper Setter " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("PBT-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx)
	client.TeacherAssignment.Create().
		SetTeacherID(teacher.ID).
		SetSubjectOfferingID(physicsOffering).
		SetSectionID(sectionA).
		SetAcademicSessionID(session.ID).
		SetRoleType("subject_teacher").
		SetIsPrimary(true).
		SaveX(ctx)

	world := &paperWorld{
		t:         t,
		db:        db,
		server:    &Server{guard: paperGuard{}},
		sessionID: session.ID,
		gradeID:   grade.ID,
		otherGrde: otherGrade.ID,
		sectionA:  sectionA,
		physicsID: physics.ID,
		historyID: history.ID,
		person:    person.ID,
		tag:       tag,
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireNarrowedViewer()
	db.Forget()
	return world
}

func (w *paperWorld) requireNarrowedViewer() {
	w.t.Helper()

	viewer, decision, err := w.server.blueprintScope(w.ctx, true)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer reaches every blueprint and would prove nothing")
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the decision must carry a teacher-assignment reach, got %+v", decision)
	}
	if len(viewer.TaughtSubjectGrades) != 1 {
		w.t.Fatalf("the viewer must teach exactly one subject and grade, got %v",
			viewer.TaughtSubjectGrades)
	}
}

func (w *paperWorld) call(handler http.HandlerFunc, method, path, body string,
	params map[string]string) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	for name, value := range params {
		route.URLParams.Add(name, value)
	}
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	request := httptest.NewRequest(method, path, reader).WithContext(ctx)

	rec := httptest.NewRecorder()
	handler(rec, request)
	return rec
}

func (w *paperWorld) body(rec *httptest.ResponseRecorder) map[string]any {
	w.t.Helper()

	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		w.t.Fatalf("the response was not a JSON object: %v (%s)", err, rec.Body.String())
	}
	return out
}

func (w *paperWorld) idOf(rec *httptest.ResponseRecorder, key string) uuid.UUID {
	w.t.Helper()

	wrapper, ok := w.body(rec)[key].(map[string]any)
	if !ok {
		w.t.Fatalf("the response carries no %q object: %s", key, rec.Body.String())
	}
	raw, _ := wrapper["id"].(string)
	id, err := uuid.Parse(raw)
	if err != nil {
		w.t.Fatalf("the %q carries no id: %s", key, rec.Body.String())
	}
	return id
}

const bandedScheme = `{"name":"cbse_typology_mathematics","bands":[` +
	`{"key":"remembering","label":"Remembering","weight_percent":40},` +
	`{"key":"applying","label":"Applying","weight_percent":60}]}`

func (w *paperWorld) createBlueprint(subject, grade uuid.UUID, extra string) *httptest.ResponseRecorder {
	w.t.Helper()

	body := fmt.Sprintf(
		`{"subject_id":%q,"grade_level_id":%q,"code":"BP-%s","name":"Annual",`+
			`"total_marks":80,"duration_minutes":180,"cognitive_scheme":%s%s}`,
		subject, grade, uuid.NewString()[:8], bandedScheme, extra)
	return w.call(w.server.createBlueprint, http.MethodPost, "/api/v1/blueprints", body, nil)
}

func (w *paperWorld) createQuestion(subject, grade uuid.UUID) uuid.UUID {
	w.t.Helper()

	body := fmt.Sprintf(`{"canonical_key":"Q-%s","subject_id":%q,"grade_level_id":%q,`+
		`"question_type":"mcq"}`, uuid.NewString(), subject, grade)
	rec := w.call(w.server.createQuestion, http.MethodPost, "/api/v1/questions", body, nil)
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("the question was not created: %d %s", rec.Code, rec.Body.String())
	}
	return w.idOf(rec, "question")
}

func (w *paperWorld) createVersion(question uuid.UUID, stem string) uuid.UUID {
	w.t.Helper()

	rec := w.call(w.server.createQuestionVersion, http.MethodPost,
		"/api/v1/questions/"+question.String()+"/versions",
		fmt.Sprintf(`{"stem":%q}`, stem), map[string]string{"id": question.String()})
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("the version was not created: %d %s", rec.Code, rec.Body.String())
	}
	return w.idOf(rec, "question_version")
}

func (w *paperWorld) createPaper(blueprint uuid.UUID) uuid.UUID {
	w.t.Helper()

	body := fmt.Sprintf(`{"academic_session_id":%q,"blueprint_id":%q,"paper_code":"PC-%s",`+
		`"title":"Annual Paper","total_marks":80}`,
		w.sessionID, blueprint, uuid.NewString()[:8])
	rec := w.call(w.server.createPaper, http.MethodPost, "/api/v1/papers", body, nil)
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("the paper was not created: %d %s", rec.Code, rec.Body.String())
	}
	return w.idOf(rec, "paper")
}

func (w *paperWorld) createPaperSection(paper uuid.UUID) uuid.UUID {
	w.t.Helper()

	rec := w.call(w.server.createPaperSection, http.MethodPost,
		"/api/v1/papers/"+paper.String()+"/sections",
		`{"name":"Section A","code":"A","position":1}`,
		map[string]string{"id": paper.String()})
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("the paper section was not created: %d %s", rec.Code, rec.Body.String())
	}
	return w.idOf(rec, "paper_section")
}

func (w *paperWorld) placeQuestion(section, question, version uuid.UUID,
	position int) *httptest.ResponseRecorder {
	w.t.Helper()

	body := fmt.Sprintf(`{"question_id":%q,"question_version_id":%q,"question_number":"%d",`+
		`"marks":4,"position":%d}`, question, version, position, position)
	return w.call(w.server.createPaperQuestion, http.MethodPost,
		"/api/v1/paper-sections/"+section.String()+"/questions", body,
		map[string]string{"id": section.String()})
}

func TestAPaperQuestionRefusesAVersionOfAnotherQuestion(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)
	section := w.createPaperSection(paper)

	mine := w.createQuestion(w.physicsID, w.gradeID)
	theirs := w.createQuestion(w.physicsID, w.gradeID)
	mineV1 := w.createVersion(mine, "What is the SI unit of force?")
	theirsV1 := w.createVersion(theirs, "State Newton's first law.")

	rec := w.placeQuestion(section, mine, theirsV1, 1)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a version of another question must be refused, got %d %s",
			rec.Code, rec.Body.String())
	}
	if got, _ := w.body(rec)["error"].(string); got != "question_version_belongs_elsewhere" {
		t.Fatalf("the refusal must name the mismatch, got %q", got)
	}

	rec = w.placeQuestion(section, mine, mineV1, 1)
	if rec.Code != http.StatusCreated {
		t.Fatalf("the matching pair must be accepted, got %d %s", rec.Code, rec.Body.String())
	}

	row, err := w.db.Client.PaperQuestion.Query().
		Where(entpquestion.PaperSectionID(section)).Only(context.Background())
	if err != nil {
		t.Fatalf("the paper question could not be read back: %v", err)
	}
	if row.QuestionID != mine || row.QuestionVersionID != mineV1 {
		t.Fatalf("a paper question records both ids, got question=%s version=%s",
			row.QuestionID, row.QuestionVersionID)
	}
}

func TestAPublishedPaperStillNamesTheVersionItPrinted(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)
	section := w.createPaperSection(paper)

	question := w.createQuestion(w.physicsID, w.gradeID)
	first := w.createVersion(question, "What is the SI unit of force?")

	if rec := w.placeQuestion(section, question, first, 1); rec.Code != http.StatusCreated {
		t.Fatalf("the question was not placed: %d %s", rec.Code, rec.Body.String())
	}

	second := w.createVersion(question, "Name the SI unit of force and define it.")
	if second == first {
		t.Fatal("a second version must be a new row, not an edit of the first")
	}

	row, err := w.db.Client.PaperQuestion.Query().
		Where(entpquestion.PaperSectionID(section)).Only(context.Background())
	if err != nil {
		t.Fatalf("the paper question could not be read back: %v", err)
	}
	if row.QuestionVersionID != first {
		t.Fatalf("the paper must still print version %s, got %s", first, row.QuestionVersionID)
	}

	printed, err := w.db.Client.QuestionVersion.Get(context.Background(), first)
	if err != nil {
		t.Fatalf("the printed version could not be read back: %v", err)
	}
	if printed.Stem != "What is the SI unit of force?" {
		t.Fatalf("the printed version was edited underneath the paper: %q", printed.Stem)
	}

	versions, err := w.db.Client.QuestionVersion.Query().
		Where(entversion.QuestionID(question)).
		Order(tenantent.Asc(entversion.FieldVersionNumber)).
		All(context.Background())
	if err != nil {
		t.Fatalf("the versions could not be read back: %v", err)
	}
	if len(versions) != 2 || versions[0].VersionNumber != 1 || versions[1].VersionNumber != 2 {
		t.Fatalf("versions must number 1 then 2, got %d rows", len(versions))
	}
}

func TestAQuestionVersionIsNeverEditedInPlace(t *testing.T) {
	w := newPaperWorld(t)

	question := w.createQuestion(w.physicsID, w.gradeID)
	version := w.createVersion(question, "What is the SI unit of force?")

	rec := w.call(w.server.updateQuestionVersionStatus, http.MethodPatch,
		"/api/v1/question-versions/"+version.String(),
		`{"stem":"a different question"}`, map[string]string{"id": version.String()})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("editing a stem must be refused, got %d %s", rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.updateQuestionVersionStatus, http.MethodPatch,
		"/api/v1/question-versions/"+version.String(),
		`{"status":"published"}`, map[string]string{"id": version.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("a status transition must be allowed, got %d %s", rec.Code, rec.Body.String())
	}

	row, err := w.db.Client.QuestionVersion.Get(context.Background(), version)
	if err != nil {
		t.Fatalf("the version could not be read back: %v", err)
	}
	if row.Stem != "What is the SI unit of force?" {
		t.Fatalf("the stem changed: %q", row.Stem)
	}
	if row.Status != entversion.StatusPublished {
		t.Fatalf("the status did not change, got %q", row.Status)
	}
}

func TestNullUnitWeightageIsNotAnEmptyUnitWeightage(t *testing.T) {
	w := newPaperWorld(t)

	silent := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	empty := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, `,"unit_weightage":{"units":[]}`),
		"blueprint")

	ctx := context.Background()
	silentRow, err := w.db.Client.Blueprint.Get(ctx, silent)
	if err != nil {
		t.Fatalf("the blueprint could not be read back: %v", err)
	}
	if silentRow.UnitWeightage != nil {
		t.Fatalf("an unstated unit_weightage means cover every chapter and must stay NULL, got %+v",
			silentRow.UnitWeightage)
	}

	emptyRow, err := w.db.Client.Blueprint.Get(ctx, empty)
	if err != nil {
		t.Fatalf("the blueprint could not be read back: %v", err)
	}
	if emptyRow.UnitWeightage == nil {
		t.Fatal("a stated but empty unit_weightage is a document that lists no units, not NULL")
	}
	if len(emptyRow.UnitWeightage.Units) != 0 {
		t.Fatalf("the empty document gained units: %+v", emptyRow.UnitWeightage.Units)
	}

	rec := w.call(w.server.updateBlueprint, http.MethodPatch,
		"/api/v1/blueprints/"+empty.String(), `{"unit_weightage":null}`,
		map[string]string{"id": empty.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("clearing unit_weightage must be allowed, got %d %s", rec.Code, rec.Body.String())
	}
	cleared, err := w.db.Client.Blueprint.Get(ctx, empty)
	if err != nil {
		t.Fatalf("the blueprint could not be read back: %v", err)
	}
	if cleared.UnitWeightage != nil {
		t.Fatalf("an explicit null must clear the document, got %+v", cleared.UnitWeightage)
	}

	rec = w.call(w.server.updateBlueprint, http.MethodPatch,
		"/api/v1/blueprints/"+silent.String(), `{"name":"Annual, revised"}`,
		map[string]string{"id": silent.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("an unrelated patch must succeed, got %d %s", rec.Code, rec.Body.String())
	}
	untouched, err := w.db.Client.Blueprint.Get(ctx, silent)
	if err != nil {
		t.Fatalf("the blueprint could not be read back: %v", err)
	}
	if untouched.UnitWeightage != nil || untouched.Name != "Annual, revised" {
		t.Fatalf("an omitted key must leave the document alone, got %+v", untouched.UnitWeightage)
	}
}

func TestACognitiveSchemeMustNameItselfAndCarryBands(t *testing.T) {
	w := newPaperWorld(t)

	cases := []struct {
		name   string
		scheme string
	}{
		{"no scheme at all", ""},
		{"a nameless scheme", `{"bands":[{"key":"remembering","label":"R"}]}`},
		{"a named scheme with no bands", `{"name":"cbse_competency","bands":[]}`},
		{"a band with no key", `{"name":"cbse_competency","bands":[{"label":"R"}]}`},
		{"a band twice", `{"name":"x","bands":[{"key":"a"},{"key":"a"}]}`},
		{"a weight above a hundred", `{"name":"x","bands":[{"key":"a","weight_percent":140}]}`},
	}

	for _, c := range cases {
		body := fmt.Sprintf(
			`{"subject_id":%q,"grade_level_id":%q,"code":"BP-%s","name":"Annual",`+
				`"total_marks":80,"duration_minutes":180`,
			w.physicsID, w.gradeID, uuid.NewString()[:8])
		if c.scheme != "" {
			body += `,"cognitive_scheme":` + c.scheme
		}
		body += "}"

		rec := w.call(w.server.createBlueprint, http.MethodPost, "/api/v1/blueprints", body, nil)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("%s must be refused, got %d %s", c.name, rec.Code, rec.Body.String())
		}
	}

	if rec := w.createBlueprint(w.physicsID, w.gradeID, ""); rec.Code != http.StatusCreated {
		t.Fatalf("a named scheme with bands must be accepted, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestABlueprintForASubjectYouDoNotTeachIsNotFound(t *testing.T) {
	w := newPaperWorld(t)

	mine := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")

	foreign := w.db.Client.Blueprint.Create().
		SetSubjectID(w.historyID).
		SetGradeLevelID(w.otherGrde).
		SetCode("BPX-" + w.tag).
		SetName("Someone else's pattern").
		SetTotalMarks(80).
		SetDurationMinutes(180).
		SetCognitiveScheme(schemeFixture()).
		SaveX(context.Background())

	rec := w.call(w.server.getBlueprint, http.MethodGet,
		"/api/v1/blueprints/"+mine.String(), "", map[string]string{"id": mine.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("your own blueprint must be readable, got %d %s", rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.getBlueprint, http.MethodGet,
		"/api/v1/blueprints/"+foreign.ID.String(), "",
		map[string]string{"id": foreign.ID.String()})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable blueprint is a 404, never a 403; got %d %s",
			rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.listBlueprints, http.MethodGet, "/api/v1/blueprints", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("listing blueprints failed: %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), foreign.ID.String()) {
		t.Fatal("the list leaked a blueprint the viewer cannot reach")
	}
	if !strings.Contains(rec.Body.String(), mine.String()) {
		t.Fatal("the list dropped the viewer's own blueprint, so it proves nothing")
	}
}

func TestAPaperBehindAnUnreachableBlueprintIsNotFound(t *testing.T) {
	w := newPaperWorld(t)

	ctx := context.Background()
	foreignBlueprint := w.db.Client.Blueprint.Create().
		SetSubjectID(w.historyID).
		SetGradeLevelID(w.otherGrde).
		SetCode("BPY-" + w.tag).
		SetName("Someone else's pattern").
		SetTotalMarks(80).
		SetDurationMinutes(180).
		SetCognitiveScheme(schemeFixture()).
		SaveX(ctx)

	foreignPaper := w.db.Client.Paper.Create().
		SetAcademicSessionID(w.sessionID).
		SetBlueprintID(foreignBlueprint.ID).
		SetPaperCode("PCX-" + w.tag).
		SetTitle("Someone else's paper").
		SetTotalMarks(80).
		SaveX(ctx)

	mine := w.createPaper(w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint"))

	rec := w.call(w.server.getPaper, http.MethodGet, "/api/v1/papers/"+mine.String(), "",
		map[string]string{"id": mine.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("your own paper must be readable, got %d %s", rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.getPaper, http.MethodGet,
		"/api/v1/papers/"+foreignPaper.ID.String(), "",
		map[string]string{"id": foreignPaper.ID.String()})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable paper is a 404, never a 403; got %d %s",
			rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.createPaperSection, http.MethodPost,
		"/api/v1/papers/"+foreignPaper.ID.String()+"/sections",
		`{"name":"Section A","code":"A","position":1}`,
		map[string]string{"id": foreignPaper.ID.String()})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("writing into an unreachable paper is a 404, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestAPublishedPaperTakesNoMoreQuestions(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)
	section := w.createPaperSection(paper)

	question := w.createQuestion(w.physicsID, w.gradeID)
	version := w.createVersion(question, "What is the SI unit of force?")
	if rec := w.placeQuestion(section, question, version, 1); rec.Code != http.StatusCreated {
		t.Fatalf("the first question was not placed: %d %s", rec.Code, rec.Body.String())
	}

	rec := w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		`{"status":"published"}`, map[string]string{"id": paper.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("publishing the paper failed: %d %s", rec.Code, rec.Body.String())
	}

	second := w.createQuestion(w.physicsID, w.gradeID)
	secondVersion := w.createVersion(second, "State Newton's first law.")

	rec = w.placeQuestion(section, second, secondVersion, 2)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a published paper takes no more questions, got %d %s",
			rec.Code, rec.Body.String())
	}
	if got, _ := w.body(rec)["error"].(string); got != paperSettledError {
		t.Fatalf("the refusal must say the paper is published, got %q", got)
	}

	rec = w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		`{"title":"Renamed after the fact"}`, map[string]string{"id": paper.String()})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a published paper is superseded, not edited, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestAPaperApprovalRecordsWhoApprovedItAndWhen(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	paper := w.createPaper(blueprint)

	rec := w.call(w.server.updatePaper, http.MethodPatch, "/api/v1/papers/"+paper.String(),
		`{"status":"approved"}`, map[string]string{"id": paper.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("approving the paper failed: %d %s", rec.Code, rec.Body.String())
	}

	row, err := w.db.Client.Paper.Get(context.Background(), paper)
	if err != nil {
		t.Fatalf("the paper could not be read back: %v", err)
	}
	if row.ApprovedBy == nil || *row.ApprovedBy != w.person {
		t.Fatalf("the approver must be the authenticated caller, got %v", row.ApprovedBy)
	}
	if row.ApprovedAt == nil {
		t.Fatal("an approved paper records when it was approved")
	}
}

func TestAGenerationRunRecordsWhatItCostToProduce(t *testing.T) {
	w := newPaperWorld(t)

	blueprint := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")

	rec := w.call(w.server.createGenerationRun, http.MethodPost, "/api/v1/paper-generation-runs",
		fmt.Sprintf(`{"blueprint_id":%q,"generation_method":"ai","model_version":"claude-opus-5",`+
			`"prompt":"Set an 80 mark physics paper","prompt_hash":"abc123"}`, blueprint), nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("the run was not recorded: %d %s", rec.Code, rec.Body.String())
	}
	run := w.idOf(rec, "paper_generation_run")

	rec = w.call(w.server.updateGenerationRun, http.MethodPatch,
		"/api/v1/paper-generation-runs/"+run.String(),
		`{"status":"completed","input_tokens":9100,"output_tokens":4300,"cost_amount":0.42}`,
		map[string]string{"id": run.String()})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an amount without its currency cannot be compared later and must be refused, "+
			"got %d %s", rec.Code, rec.Body.String())
	}

	rec = w.call(w.server.updateGenerationRun, http.MethodPatch,
		"/api/v1/paper-generation-runs/"+run.String(),
		`{"status":"completed","input_tokens":9100,"output_tokens":4300,`+
			`"cost_amount":0.42,"cost_currency":"USD"}`,
		map[string]string{"id": run.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("completing the run failed: %d %s", rec.Code, rec.Body.String())
	}

	row, err := w.db.Client.PaperGenerationRun.Get(context.Background(), run)
	if err != nil {
		t.Fatalf("the run could not be read back: %v", err)
	}
	if row.ModelVersion == nil || *row.ModelVersion != "claude-opus-5" {
		t.Fatalf("the run must name the model it used, got %v", row.ModelVersion)
	}
	if row.Prompt == nil || *row.Prompt == "" {
		t.Fatal("the run must keep the prompt it was given, or it cannot be reproduced")
	}
	if row.InputTokens == nil || *row.InputTokens != 9100 {
		t.Fatalf("the run must record its input tokens, got %v", row.InputTokens)
	}
	if row.CostCurrency == nil || *row.CostCurrency != "USD" {
		t.Fatalf("the run must record the currency of its cost, got %v", row.CostCurrency)
	}

	rec = w.call(w.server.updateGenerationRun, http.MethodPatch,
		"/api/v1/paper-generation-runs/"+run.String(),
		`{"prompt":"a different prompt"}`, map[string]string{"id": run.String()})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a run's prompt is provenance and cannot be rewritten, got %d %s",
			rec.Code, rec.Body.String())
	}
}

func TestABlueprintMayBeReusableAcrossSessions(t *testing.T) {
	w := newPaperWorld(t)

	reusable := w.idOf(w.createBlueprint(w.physicsID, w.gradeID, ""), "blueprint")
	bound := w.idOf(w.createBlueprint(w.physicsID, w.gradeID,
		fmt.Sprintf(`,"academic_session_id":%q`, w.sessionID)), "blueprint")

	ctx := context.Background()
	row, err := w.db.Client.Blueprint.Get(ctx, reusable)
	if err != nil {
		t.Fatalf("the blueprint could not be read back: %v", err)
	}
	if row.AcademicSessionID != nil {
		t.Fatalf("a blueprint with no session is a template shared across years, got %v",
			row.AcademicSessionID)
	}

	rows, err := w.db.Client.Blueprint.Query().
		Where(entblueprint.AcademicSessionIDIsNil(), entblueprint.ID(reusable)).
		All(ctx)
	if err != nil || len(rows) != 1 {
		t.Fatalf("the reusable blueprint must be findable as one, got %d rows (%v)", len(rows), err)
	}

	boundRow, err := w.db.Client.Blueprint.Get(ctx, bound)
	if err != nil {
		t.Fatalf("the blueprint could not be read back: %v", err)
	}
	if boundRow.AcademicSessionID == nil || *boundRow.AcademicSessionID != w.sessionID {
		t.Fatalf("a blueprint given a session must keep it, got %v", boundRow.AcademicSessionID)
	}
}

func TestQuestionBankAndPaperRoutesAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	want := []string{
		"GET /api/v1/questions",
		"POST /api/v1/questions",
		"GET /api/v1/questions/{id}",
		"PATCH /api/v1/questions/{id}",
		"DELETE /api/v1/questions/{id}",
		"GET /api/v1/questions/{id}/versions",
		"POST /api/v1/questions/{id}/versions",
		"GET /api/v1/question-versions/{id}",
		"PATCH /api/v1/question-versions/{id}",
		"GET /api/v1/blueprints",
		"POST /api/v1/blueprints",
		"GET /api/v1/blueprints/{id}",
		"PATCH /api/v1/blueprints/{id}",
		"DELETE /api/v1/blueprints/{id}",
		"GET /api/v1/blueprints/{id}/sections",
		"POST /api/v1/blueprints/{id}/sections",
		"GET /api/v1/blueprint-sections/{id}",
		"GET /api/v1/blueprint-sections/{id}/constraints",
		"POST /api/v1/blueprint-sections/{id}/constraints",
		"GET /api/v1/papers",
		"POST /api/v1/papers",
		"GET /api/v1/papers/{id}",
		"PATCH /api/v1/papers/{id}",
		"DELETE /api/v1/papers/{id}",
		"GET /api/v1/papers/{id}/sections",
		"POST /api/v1/papers/{id}/sections",
		"GET /api/v1/paper-sections/{id}",
		"GET /api/v1/paper-sections/{id}/questions",
		"POST /api/v1/paper-sections/{id}/questions",
		"GET /api/v1/paper-generation-runs",
		"POST /api/v1/paper-generation-runs",
		"GET /api/v1/paper-generation-runs/{id}",
		"PATCH /api/v1/paper-generation-runs/{id}",
	}

	for _, pattern := range want {
		if !found[pattern] && !found[pattern+"/"] {
			t.Errorf("%s is not mounted on the real router, so the handler is unreachable "+
				"however well it is tested", pattern)
		}
	}
}

func TestEveryNewBankAreaNarrowsByViewer(t *testing.T) {
	areas := map[string]bool{
		"question_bank":    false,
		"blueprints":       false,
		"papers":           false,
		"paper_generation": false,
	}

	breadth := map[string]bool{}
	for _, e := range authorization.AllEntities {
		parts := strings.Split(string(e), ".")
		if len(parts) != 3 {
			continue
		}
		if _, mine := areas[parts[1]]; !mine {
			continue
		}
		areas[parts[1]] = true
		if strings.HasSuffix(parts[2], "_all") {
			breadth[parts[1]] = true
		}
	}

	for area, declared := range areas {
		if !declared {
			t.Errorf("area %q declares no entity key at all", area)
			continue
		}
		if !breadth[area] {
			t.Errorf("area %q has no _all variant, so a narrowed caller could never be widened "+
				"and the area would fail open like core.sections does", area)
		}
	}
}

func schemeFixture() schema.CognitiveScheme {
	forty, sixty := 40.0, 60.0
	return schema.CognitiveScheme{
		Name: "cbse_typology_mathematics",
		Bands: []schema.CognitiveBand{
			{Key: "remembering", Label: "Remembering", WeightPercent: &forty},
			{Key: "applying", Label: "Applying", WeightPercent: &sixty},
		},
	}
}
