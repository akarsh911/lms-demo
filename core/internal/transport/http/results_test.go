package http

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entsubmission "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentsubmission"
	entcomponent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponent"
	entresultscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultscheme"
	entexammark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentexammark"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/service/results"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type resultsBody struct {
	SubjectOfferingID uuid.UUID         `json:"subject_offering_id"`
	ResultSchemeID    *uuid.UUID        `json:"result_scheme_id"`
	Composed          bool              `json:"composed"`
	Reason            string            `json:"reason"`
	Composition       resultComposition `json:"composition"`
	Results           []pupilResult     `json:"results"`
	Count             int               `json:"count"`
}

type resultRefusal struct {
	Error       string            `json:"error"`
	Message     string            `json:"message"`
	StudentID   *uuid.UUID        `json:"student_id"`
	Composition resultComposition `json:"composition"`
}

type resultWorld struct {
	t      *testing.T
	client *tenantent.Client

	teacher  marksActor
	elsewhen marksActor
	pupil    marksActor
	stranger marksActor
	guardian marksActor
	admin    marksActor

	physicsA uuid.UUID
	artA     uuid.UUID
	historyA uuid.UUID
	chemA    uuid.UUID
	musicA   uuid.UUID

	pupilS1   uuid.UUID
	pupilS2   uuid.UUID
	outsideS3 uuid.UUID

	papers   map[string]uuid.UUID
	homework map[string]uuid.UUID
}

const (
	resultHalfYearly = "Half-Yearly Examination"
	resultClassTests = "Class Tests (best two of four)"
	resultAnnual     = "Annual Examination"
	resultHomework   = "Homework"
)

var resultClassTestCodes = []string{"CT-1", "CT-2", "CT-3", "CT-4"}

func newResultWorld(t *testing.T) *resultWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	day := time.Date(2026, time.April, 6, 0, 0, 0, 0, time.UTC)

	branch := client.Branch.Create().SetName("Results Campus " + tag).SetCode("RSB-" + tag).SaveX(ctx)
	session := client.AcademicSession.Create().
		SetName("Results Session " + tag).
		SetCode("RSS-" + tag).
		SetStartDate(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2027, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SetIsCurrent(true).
		SaveX(ctx)
	grade := client.GradeLevel.Create().
		SetName("X " + tag).SetCode("RSG-" + tag).SetSequence(10).SaveX(ctx)

	newSection := func(name, code string) uuid.UUID {
		return client.Section.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetGradeLevelID(grade.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SaveX(ctx).ID
	}
	sectionA := newSection("A", "RSA")
	sectionB := newSection("B", "RSZ")

	newTeacher := func(code string) (uuid.UUID, uuid.UUID) {
		cas := uuid.New()
		person := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName("Results").
			SetDisplayName("Results " + code + " " + tag).
			SaveX(ctx)
		staff := client.Staff.Create().
			SetPersonID(person.ID).
			SetEmployeeCode(code + "-" + tag).
			SaveX(ctx)
		return client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx).ID, cas
	}
	teacherT1, casT1 := newTeacher("RST1")
	teacherT9, casT9 := newTeacher("RST9")

	newSubject := func(name, code string) uuid.UUID {
		return client.Subject.Create().
			SetName(name + " " + tag).SetCode(code + "-" + tag).SaveX(ctx).ID
	}

	newOffering := func(section, subject uuid.UUID) uuid.UUID {
		return client.SubjectOffering.Create().
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetSubjectID(subject).
			SaveX(ctx).ID
	}
	physicsA := newOffering(sectionA, newSubject("Physics", "RSP"))
	artA := newOffering(sectionA, newSubject("Art", "RSR"))
	historyA := newOffering(sectionA, newSubject("History", "RSH"))
	chemA := newOffering(sectionA, newSubject("Chemistry", "RSC"))
	musicA := newOffering(sectionA, newSubject("Music", "RSM"))
	physicsB := newOffering(sectionB, newSubject("Physics B", "RSQ"))

	teach := func(who, section, offering uuid.UUID) {
		client.TeacherAssignment.Create().
			SetAcademicSessionID(session.ID).
			SetTeacherID(who).
			SetSectionID(section).
			SetSubjectOfferingID(offering).
			SetRoleType("subject_teacher").
			SetIsPrimary(true).
			SaveX(ctx)
	}
	teach(teacherT1, sectionA, physicsA)
	teach(teacherT9, sectionB, physicsB)

	newPupil := func(label string, section uuid.UUID, offerings ...uuid.UUID) (uuid.UUID, uuid.UUID) {
		cas := uuid.New()
		person := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName("Results").
			SetDisplayName("Results " + label + " " + tag).
			SaveX(ctx)
		student := client.Student.Create().
			SetPersonID(person.ID).
			SetAdmissionNumber("RSADM-" + label + "-" + tag).
			SaveX(ctx)
		enrollment := client.StudentEnrollment.Create().
			SetStudentID(student.ID).
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetEnrollmentDate(day).
			SaveX(ctx)
		for _, offering := range offerings {
			client.StudentSubjectEnrollment.Create().
				SetStudentEnrollmentID(enrollment.ID).
				SetSubjectOfferingID(offering).
				SetStudentID(student.ID).
				SetAcademicSessionID(session.ID).
				SaveX(ctx)
		}
		return student.ID, cas
	}
	pupilS1, casS1 := newPupil("S1", sectionA, physicsA, artA, historyA, chemA, musicA)
	pupilS2, casS2 := newPupil("S2", sectionA, physicsA)
	outsideS3, _ := newPupil("S3", sectionB, physicsB)

	casGuardian := uuid.New()
	guardianPerson := client.Person.Create().
		SetCasUserID(casGuardian).
		SetFirstName("Results").
		SetDisplayName("Results Guardian " + tag).
		SaveX(ctx)
	guardian := client.Guardian.Create().SetPersonID(guardianPerson.ID).SaveX(ctx)
	client.StudentGuardian.Create().
		SetStudentID(pupilS1).
		SetGuardianID(guardian.ID).
		SetRelationshipType("mother").
		SetCanViewAcademic(true).
		SaveX(ctx)

	exams := map[string]uuid.UUID{}
	newExam := func(code, name string) uuid.UUID {
		id := client.Exam.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SaveX(ctx).ID
		exams[code] = id
		return id
	}
	papers := map[string]uuid.UUID{}
	newPaper := func(code string, offering uuid.UUID, maximum float64) uuid.UUID {
		id := client.ExamSubject.Create().
			SetExamID(exams[code]).
			SetSubjectOfferingID(offering).
			SetMaximumMarks(maximum).
			SaveX(ctx).ID
		papers[code] = id
		return id
	}

	newExam("HY", "Half Yearly")
	newExam("ANN", "Annual")
	for _, code := range resultClassTestCodes {
		newExam(code, "Class Test "+code)
	}

	newPaper("HY", physicsA, 40)
	newPaper("ANN", physicsA, 80)
	for _, code := range resultClassTestCodes {
		newPaper(code, physicsA, 10)
	}

	historyHalfYearly := client.ExamSubject.Create().
		SetExamID(exams["HY"]).
		SetSubjectOfferingID(historyA).
		SetMaximumMarks(50).
		SaveX(ctx).ID
	papers["HY-HISTORY"] = historyHalfYearly

	homework := map[string]uuid.UUID{}
	for _, title := range []string{"Homework Portfolio I", "Homework Portfolio II"} {
		homework[title] = client.Assignment.Create().
			SetAcademicSessionID(session.ID).
			SetTeacherID(teacherT1).
			SetTitle(title + " " + tag).
			SetAssignmentType(entassignment.AssignmentTypeWorksheet).
			SetMaximumMarks(20).
			SetStatus(entassignment.StatusPublished).
			SaveX(ctx).ID
	}

	newScheme := func(code, name string, total float64) uuid.UUID {
		return client.ResultScheme.Create().
			SetAcademicSessionID(session.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SetTotalMarks(total).
			SetStatus(entresultscheme.StatusActive).
			SaveX(ctx).ID
	}
	newComponent := func(scheme uuid.UUID, name string, maximum, weight float64,
		aggregation entcomponent.Aggregation, takeBest *int, position int) uuid.UUID {
		create := client.ResultComponent.Create().
			SetResultSchemeID(scheme).
			SetName(name).
			SetMaximumMarks(maximum).
			SetWeight(weight).
			SetAggregation(aggregation).
			SetPosition(position)
		if takeBest != nil {
			create = create.SetTakeBest(*takeBest)
		}
		return create.SaveX(ctx).ID
	}
	linkExam := func(component uuid.UUID, code string) {
		client.ResultComponentExam.Create().
			SetResultComponentID(component).
			SetExamID(exams[code]).
			SaveX(ctx)
	}
	linkHomework := func(component, assignment uuid.UUID) {
		client.ResultComponentAssignment.Create().
			SetResultComponentID(component).
			SetAssignmentID(assignment).
			SaveX(ctx)
	}
	attach := func(offering, scheme uuid.UUID) {
		client.SubjectOffering.UpdateOneID(offering).SetResultSchemeID(scheme).ExecX(ctx)
	}

	two := 2
	standard := newScheme("RS-STD-100", "Standard 100", 100)
	linkExam(newComponent(standard, resultHalfYearly, 40, 20,
		entcomponent.AggregationSingle, nil, 0), "HY")
	classTests := newComponent(standard, resultClassTests, 20, 10,
		entcomponent.AggregationBestOf, &two, 1)
	for _, code := range resultClassTestCodes {
		linkExam(classTests, code)
	}
	linkExam(newComponent(standard, resultAnnual, 80, 70,
		entcomponent.AggregationSingle, nil, 2), "ANN")
	attach(physicsA, standard)

	mixed := newScheme("RS-MIX-100", "Half set up", 100)
	linkExam(newComponent(mixed, resultHalfYearly, 50, 20,
		entcomponent.AggregationSingle, nil, 0), "HY")
	linkExam(newComponent(mixed, resultAnnual, 80, 80,
		entcomponent.AggregationSingle, nil, 1), "ANN")
	attach(historyA, mixed)

	withHomework := newScheme("RS-HW-100", "Homework only", 100)
	homeworkComponent := newComponent(withHomework, resultHomework, 20, 100,
		entcomponent.AggregationAverage, nil, 0)
	for _, title := range []string{"Homework Portfolio I", "Homework Portfolio II"} {
		linkHomework(homeworkComponent, homework[title])
	}
	attach(chemA, withHomework)

	empty := newScheme("RS-NIL-100", "Nothing set up", 100)
	linkExam(newComponent(empty, resultAnnual, 80, 100,
		entcomponent.AggregationSingle, nil, 0), "ANN")
	attach(musicA, empty)

	casAdmin := uuid.New()
	client.Person.Create().
		SetCasUserID(casAdmin).
		SetFirstName("Results").
		SetDisplayName("Results Admin " + tag).
		SaveX(ctx)

	base := postgres.WithConn(ctx, &postgres.TenantConn{Client: client})
	actor := func(cas uuid.UUID, guard reachGuard) marksActor {
		return marksActor{
			server: &Server{guard: guard},
			ctx:    authorization.WithSubject(base, &authorization.Subject{CASUserID: cas}),
		}
	}

	world := &resultWorld{
		t:      t,
		client: client,

		teacher:  actor(casT1, reachGuard{reach: authorization.ReachTeacherAssignment}),
		elsewhen: actor(casT9, reachGuard{reach: authorization.ReachTeacherAssignment}),
		pupil:    actor(casS1, reachGuard{reach: authorization.ReachSelf}),
		stranger: actor(casS2, reachGuard{reach: authorization.ReachSelf}),
		guardian: actor(casGuardian, reachGuard{reach: authorization.ReachGuardianWard}),
		admin:    actor(casAdmin, reachGuard{reach: authorization.ReachTenant, all: true}),

		physicsA: physicsA,
		artA:     artA,
		historyA: historyA,
		chemA:    chemA,
		musicA:   musicA,

		pupilS1:   pupilS1,
		pupilS2:   pupilS2,
		outsideS3: outsideS3,

		papers:   papers,
		homework: homework,
	}

	world.requireGenuineScopes()
	db.Forget()
	return world
}

func (w *resultWorld) requireGenuineScopes() {
	w.t.Helper()

	viewer, decision, err := w.teacher.server.scopeFor(w.teacher.ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		w.t.Fatalf("the teacher viewer could not be resolved: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted teacher would reach every offering and prove nothing about scoping")
	}
	if decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the teacher decision must carry a teacher-assignment reach, got %+v", decision)
	}

	pupil, pupilDecision, err := w.pupil.server.scopeFor(w.pupil.ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		w.t.Fatalf("the pupil viewer could not be resolved: %v", err)
	}
	if pupil.Unrestricted {
		w.t.Fatal("an unrestricted pupil would reach every result and prove nothing")
	}
	if len(pupil.StudentIDs) != 1 || pupil.StudentIDs[0] != w.pupilS1 {
		w.t.Fatalf("the pupil viewer must resolve to S1 %s, got %v", w.pupilS1, pupil.StudentIDs)
	}
	if pupilDecision.Reach != authorization.ReachSelf {
		w.t.Fatalf("the pupil decision must carry a self reach, got %+v", pupilDecision)
	}

	ward, wardDecision, err := w.guardian.server.scopeFor(w.guardian.ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		w.t.Fatalf("the guardian viewer could not be resolved: %v", err)
	}
	if ward.GuardianID == nil {
		w.t.Fatal("the guardian viewer did not resolve to a guardian")
	}
	if wardDecision.Reach != authorization.ReachGuardianWard {
		w.t.Fatalf("the guardian decision must carry a guardian-ward reach, got %+v", wardDecision)
	}

	admin, _, err := w.admin.server.scopeFor(w.admin.ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		w.t.Fatalf("the admin viewer could not be resolved: %v", err)
	}
	if !admin.Unrestricted {
		w.t.Fatal("the admin viewer must be unrestricted or the tenant-wide cases prove nothing")
	}
}

func (w *resultWorld) read(a marksActor, offering uuid.UUID, query string) *httptest.ResponseRecorder {
	w.t.Helper()

	target := "/api/v1/subject-offerings/" + offering.String() + "/results"
	if query != "" {
		target += "?" + query
	}
	rec, request := a.req(w.t, http.MethodGet, target, "",
		map[string]string{"id": offering.String()})
	a.server.listOfferingResults(rec, request)
	return rec
}

func (w *resultWorld) body(rec *httptest.ResponseRecorder) resultsBody {
	w.t.Helper()

	if rec.Code != http.StatusOK {
		w.t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var out resultsBody
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		w.t.Fatalf("the body did not decode: %v (%s)", err, rec.Body.String())
	}
	return out
}

func (w *resultWorld) refusal(rec *httptest.ResponseRecorder, code int) resultRefusal {
	w.t.Helper()

	if rec.Code != code {
		w.t.Fatalf("expected %d, got %d: %s", code, rec.Code, rec.Body.String())
	}
	var out resultRefusal
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		w.t.Fatalf("the body did not decode: %v (%s)", err, rec.Body.String())
	}
	return out
}

func (w *resultWorld) only(rec *httptest.ResponseRecorder, student uuid.UUID) pupilResult {
	w.t.Helper()

	body := w.body(rec)
	if len(body.Results) != 1 {
		w.t.Fatalf("expected exactly one pupil's result, got %d: %s", len(body.Results),
			rec.Body.String())
	}
	if body.Results[0].StudentID != student {
		w.t.Fatalf("expected the result of %s, got %s", student, body.Results[0].StudentID)
	}
	return body.Results[0]
}

func (w *resultWorld) mark(paper, student uuid.UUID, obtained float64) *tenantent.StudentExamMark {
	w.t.Helper()

	return w.client.StudentExamMark.Create().
		SetExamSubjectID(paper).
		SetStudentID(student).
		SetStatus(entexammark.StatusMarked).
		SetMarksObtained(obtained).
		SaveX(context.Background())
}

func (w *resultWorld) missed(paper, student uuid.UUID, status entexammark.Status) {
	w.t.Helper()

	w.client.StudentExamMark.Create().
		SetExamSubjectID(paper).
		SetStudentID(student).
		SetStatus(status).
		SaveX(context.Background())
}

func (w *resultWorld) workedExample(student uuid.UUID) {
	w.t.Helper()

	w.mark(w.papers["HY"], student, 30)
	w.mark(w.papers["CT-1"], student, 8)
	w.mark(w.papers["CT-2"], student, 6)
	w.mark(w.papers["CT-3"], student, 9)
	w.mark(w.papers["CT-4"], student, 7)
	w.mark(w.papers["ANN"], student, 70)
}

func componentNamed(t *testing.T, out results.Result, name string) results.ComponentResult {
	t.Helper()

	for _, component := range out.Components {
		if component.Name == name {
			return component
		}
	}
	t.Fatalf("the breakdown has no component named %q, it has %d", name, len(out.Components))
	return results.ComponentResult{}
}

func sourceOutcome(t *testing.T, component results.ComponentResult,
	label string) results.SourceResult {
	t.Helper()

	for _, source := range component.Sources {
		if source.Label == label {
			return source
		}
	}
	t.Fatalf("component %q has no source labelled %q", component.Name, label)
	return results.SourceResult{}
}

func sourceOf(t *testing.T, component results.ComponentResult,
	ref results.SourceRef) results.SourceResult {
	t.Helper()

	for _, source := range component.Sources {
		if source.Ref == ref {
			return source
		}
	}
	t.Fatalf("component %q has no source %s %s", component.Name, ref.Kind, ref.ID)
	return results.SourceResult{}
}

func near(t *testing.T, what string, got, want float64) {
	t.Helper()

	if math.Abs(got-want) > 0.005 {
		t.Fatalf("%s is %v, expected %v", what, got, want)
	}
}

func TestOfferingResultComputesTheWorkedExample(t *testing.T) {
	w := newResultWorld(t)
	w.workedExample(w.pupilS1)

	got := w.only(w.read(w.teacher, w.physicsA, "student_id="+w.pupilS1.String()), w.pupilS1)

	if !got.Final {
		t.Fatalf("a fully marked pupil under a scheme that composes must read final: %+v", got.Result)
	}
	if !got.Result.Complete || got.Result.Provisional {
		t.Fatalf("expected complete and settled, got complete=%v provisional=%v",
			got.Result.Complete, got.Result.Provisional)
	}
	if !got.Result.Balanced() {
		t.Fatalf("the three components must add up to the scheme's hundred, got %v of %v",
			got.Result.ComponentTotal, got.Result.TotalMarks)
	}

	near(t, "the score", got.Result.Score, 84.75)
	near(t, "the assessed total", got.Result.AssessedTotal, 100)
	near(t, "the percentage", got.Result.Percentage(), 84.75)

	half := componentNamed(t, got.Result, resultHalfYearly)
	near(t, "the half-yearly out of forty", half.ObtainedMarks, 30)
	near(t, "the half-yearly contribution", half.Contribution, 15)

	tests := componentNamed(t, got.Result, resultClassTests)
	near(t, "the class tests out of twenty", tests.ObtainedMarks, 17)
	near(t, "the class tests contribution", tests.Contribution, 8.5)
	if tests.Linked != 4 || tests.Counted != 2 {
		t.Fatalf("best two of four must count 2 of 4 linked, got %d of %d",
			tests.Counted, tests.Linked)
	}

	annual := componentNamed(t, got.Result, resultAnnual)
	near(t, "the annual out of eighty", annual.ObtainedMarks, 70)
	near(t, "the annual contribution", annual.Contribution, 61.25)

	near(t, "the printed lines",
		half.Contribution+tests.Contribution+annual.Contribution, got.Result.Score)

	counted := map[string]results.Outcome{}
	for _, source := range tests.Sources {
		counted[source.Label] = source.Outcome
	}
	if counted["Class Test CT-3"] != results.OutcomeCounted ||
		counted["Class Test CT-1"] != results.OutcomeCounted {
		t.Fatalf("the nine and the eight are the best two, got %v", counted)
	}
	if counted["Class Test CT-2"] != results.OutcomeNotAmongBest ||
		counted["Class Test CT-4"] != results.OutcomeNotAmongBest {
		t.Fatalf("the six and the seven must read not_among_best, got %v", counted)
	}
}

func TestOfferingResultSourceWithNoMarkIsNotEnteredNotOmitted(t *testing.T) {
	w := newResultWorld(t)
	w.mark(w.papers["HY"], w.pupilS1, 30)
	w.mark(w.papers["CT-1"], w.pupilS1, 8)
	w.mark(w.papers["CT-3"], w.pupilS1, 9)

	got := w.only(w.read(w.teacher, w.physicsA, "student_id="+w.pupilS1.String()), w.pupilS1)

	if got.Result.Complete {
		t.Fatal("an unmarked annual must leave the result incomplete")
	}
	if got.Final {
		t.Fatal("an incomplete result must not read final")
	}

	annual := componentNamed(t, got.Result, resultAnnual)
	if len(annual.Sources) != 1 {
		t.Fatalf("the annual must still name its paper, got %d sources", len(annual.Sources))
	}
	if annual.Sources[0].Outcome != results.OutcomeNotEntered {
		t.Fatalf("the unmarked annual must read not_entered, got %q", annual.Sources[0].Outcome)
	}
	near(t, "the annual contribution", annual.Contribution, 0)

	tests := componentNamed(t, got.Result, resultClassTests)
	if len(tests.Sources) != 4 {
		t.Fatalf("all four class tests must appear, got %d", len(tests.Sources))
	}
	for _, code := range []string{"CT-2", "CT-4"} {
		source := sourceOutcome(t, tests, "Class Test "+code)
		if source.Outcome != results.OutcomeNotEntered {
			t.Fatalf("%s has no mark and must read not_entered, got %q", code, source.Outcome)
		}
	}

	near(t, "the best two of the two that exist", tests.Contribution, 8.5)
	near(t, "the assessed total", got.Result.AssessedTotal, 100)
	near(t, "the score", got.Result.Score, 23.5)
}

func TestOfferingResultAbsenceShrinksTheBestOfDenominator(t *testing.T) {
	w := newResultWorld(t)
	w.workedExample(w.pupilS2)

	w.client.StudentExamMark.Delete().
		Where(entexammark.ExamSubjectID(w.papers["CT-3"]), entexammark.StudentID(w.pupilS2)).
		ExecX(context.Background())
	w.client.StudentExamMark.Delete().
		Where(entexammark.ExamSubjectID(w.papers["CT-1"]), entexammark.StudentID(w.pupilS2)).
		ExecX(context.Background())
	w.missed(w.papers["CT-3"], w.pupilS2, entexammark.StatusAbsent)
	w.missed(w.papers["CT-1"], w.pupilS2, entexammark.StatusAbsent)

	got := w.only(w.read(w.teacher, w.physicsA, "student_id="+w.pupilS2.String()), w.pupilS2)

	tests := componentNamed(t, got.Result, resultClassTests)
	if tests.Counted != 2 {
		t.Fatalf("the two tests that were sat are the best two, got %d counted", tests.Counted)
	}
	if sourceOutcome(t, tests, "Class Test CT-1").Outcome != results.OutcomeAbsent {
		t.Fatal("a missed test must read absent, not not_entered")
	}
	near(t, "the average of the six and the seven", tests.Contribution, 6.5)

	if !got.Result.Complete {
		t.Fatal("an absence is a decided fact; it must not leave the result incomplete")
	}
	if !got.Final {
		t.Fatal("a result with an absence and no missing mark is final")
	}
	near(t, "the score", got.Result.Score, 82.75)
}

func TestOfferingResultProvisionalMarkIsNeverFinal(t *testing.T) {
	w := newResultWorld(t)
	w.workedExample(w.pupilS1)

	w.client.StudentExamMark.Update().
		Where(
			entexammark.ExamSubjectID(w.papers["ANN"]),
			entexammark.StudentID(w.pupilS1),
		).
		SetProvisional(true).
		ExecX(context.Background())

	got := w.only(w.read(w.teacher, w.physicsA, "student_id="+w.pupilS1.String()), w.pupilS1)

	if !got.Result.Complete {
		t.Fatal("every mark is entered, so the result is complete")
	}
	if !got.Result.Provisional {
		t.Fatal("an unread written answer makes the total provisional")
	}
	if got.Final {
		t.Fatal("a provisional total must never be presented as final")
	}
	near(t, "the score is still shown", got.Result.Score, 84.75)

	annual := componentNamed(t, got.Result, resultAnnual)
	if !annual.Provisional || !annual.Sources[0].Provisional {
		t.Fatalf("the provisional flag must reach the line it came from: %+v", annual)
	}
	half := componentNamed(t, got.Result, resultHalfYearly)
	if half.Provisional {
		t.Fatal("a settled component must not be dragged provisional by another")
	}
}

func TestOfferingResultWithoutASchemeIsNotAnError(t *testing.T) {
	w := newResultWorld(t)

	body := w.body(w.read(w.pupil, w.artA, ""))

	if body.Composed {
		t.Fatal("an offering with no result scheme composes nothing")
	}
	if body.ResultSchemeID != nil {
		t.Fatalf("expected no scheme, got %v", body.ResultSchemeID)
	}
	if len(body.Results) != 0 || body.Count != 0 {
		t.Fatalf("expected no results, got %d", len(body.Results))
	}
	if body.Reason != resultNotComposed {
		t.Fatalf("the reason must say why, got %q", body.Reason)
	}
}

func TestOfferingResultLeavesOutAComponentNoPaperCanFill(t *testing.T) {
	w := newResultWorld(t)
	w.mark(w.papers["HY-HISTORY"], w.pupilS1, 40)

	rec := w.read(w.pupil, w.historyA, "student_id="+w.pupilS1.String())
	body := w.body(rec)
	got := body.Results[0]

	if len(body.Composition.ComponentsDropped) != 1 {
		t.Fatalf("the annual has no history paper and must be reported, got %+v", body.Composition)
	}
	dropped := body.Composition.ComponentsDropped[0]
	if dropped.Name != resultAnnual || dropped.Weight != 80 {
		t.Fatalf("expected the annual's eighty to be reported missing, got %+v", dropped)
	}
	if len(body.Composition.SourcesNotSet) != 1 ||
		body.Composition.SourcesNotSet[0].Reason != resultSourceNoPaper {
		t.Fatalf("the exam with no paper here must be named, got %+v", body.Composition.SourcesNotSet)
	}

	if got.Final {
		t.Fatal("a result missing four fifths of its composition must not read final")
	}
	if got.Result.Balanced() {
		t.Fatal("twenty of a hundred does not balance, and the result must say so")
	}
	near(t, "the component total", got.Result.ComponentTotal, 20)
	near(t, "the score", got.Result.Score, 16)
}

func TestOfferingResultRefusesWhenNothingIsSetUp(t *testing.T) {
	w := newResultWorld(t)

	refusal := w.refusal(w.read(w.pupil, w.musicA, ""), http.StatusUnprocessableEntity)

	if refusal.Error != resultNothingScorable {
		t.Fatalf("expected %q, got %q", resultNothingScorable, refusal.Error)
	}
	if len(refusal.Composition.ComponentsDropped) != 1 {
		t.Fatalf("the refusal must name what is missing, got %+v", refusal.Composition)
	}
}

func TestOfferingResultMissingHomeworkIsNotEnteredNotZero(t *testing.T) {
	w := newResultWorld(t)
	first := w.homework["Homework Portfolio I"]

	ctx := context.Background()
	w.client.AssignmentSubmission.Create().
		SetAssignmentID(first).
		SetStudentID(w.pupilS1).
		SetAttemptNumber(1).
		SetStatus(entsubmission.StatusGraded).
		SetMarksObtained(12).
		SaveX(ctx)
	w.client.AssignmentSubmission.Create().
		SetAssignmentID(first).
		SetStudentID(w.pupilS1).
		SetAttemptNumber(2).
		SetStatus(entsubmission.StatusGraded).
		SetMarksObtained(15).
		SaveX(ctx)

	got := w.only(w.read(w.pupil, w.chemA, "student_id="+w.pupilS1.String()), w.pupilS1)

	homework := componentNamed(t, got.Result, resultHomework)
	if len(homework.Sources) != 2 {
		t.Fatalf("both portfolios must appear, got %d", len(homework.Sources))
	}
	if homework.Counted != 1 {
		t.Fatalf("only the graded portfolio counts, got %d", homework.Counted)
	}

	second := sourceOf(t, homework, results.AssignmentSource(w.homework["Homework Portfolio II"]))
	if second.Outcome != results.OutcomeNotEntered {
		t.Fatalf("an unsubmitted portfolio must read not_entered, got %q", second.Outcome)
	}
	if second.Obtained != nil {
		t.Fatalf("an unsubmitted portfolio has no number, got %v", *second.Obtained)
	}

	marked := sourceOf(t, homework, results.AssignmentSource(first))
	near(t, "the latest graded attempt", *marked.Obtained, 15)

	near(t, "the average of the one that was marked", homework.Fraction, 0.75)
	near(t, "the contribution", homework.Contribution, 75)
	if got.Result.Complete {
		t.Fatal("an unsubmitted portfolio is not a zero; the result is not complete")
	}
}

func TestOfferingResultTakesTheLatestGradedAttempt(t *testing.T) {
	w := newResultWorld(t)
	ctx := context.Background()

	for _, title := range []string{"Homework Portfolio I", "Homework Portfolio II"} {
		w.client.AssignmentSubmission.Create().
			SetAssignmentID(w.homework[title]).
			SetStudentID(w.pupilS1).
			SetAttemptNumber(1).
			SetStatus(entsubmission.StatusGraded).
			SetMarksObtained(4).
			SaveX(ctx)
	}
	w.client.AssignmentSubmission.Create().
		SetAssignmentID(w.homework["Homework Portfolio I"]).
		SetStudentID(w.pupilS1).
		SetAttemptNumber(2).
		SetStatus(entsubmission.StatusGraded).
		SetMarksObtained(20).
		SaveX(ctx)

	got := w.only(w.read(w.pupil, w.chemA, "student_id="+w.pupilS1.String()), w.pupilS1)

	homework := componentNamed(t, got.Result, resultHomework)
	if homework.Counted != 2 {
		t.Fatalf("both portfolios are marked, got %d counted", homework.Counted)
	}
	near(t, "the mean of one and a fifth", homework.Fraction, 0.6)
	if !got.Result.Complete {
		t.Fatal("both portfolios are marked, so the result is complete")
	}
}

func TestOfferingResultReadsOnlyPupilsTheViewerReaches(t *testing.T) {
	w := newResultWorld(t)
	w.workedExample(w.pupilS1)
	w.workedExample(w.pupilS2)

	own := w.only(w.read(w.pupil, w.physicsA, ""), w.pupilS1)
	near(t, "a pupil reading their own result", own.Result.Score, 84.75)

	if rec := w.read(w.pupil, w.physicsA, "student_id="+w.pupilS2.String()); rec.Code != http.StatusNotFound {
		t.Fatalf("a pupil asking for another pupil's result must get 404, got %d: %s",
			rec.Code, rec.Body.String())
	}

	ward := w.only(w.read(w.guardian, w.physicsA, ""), w.pupilS1)
	near(t, "a guardian reading their ward's result", ward.Result.Score, 84.75)

	if rec := w.read(w.guardian, w.physicsA, "student_id="+w.pupilS2.String()); rec.Code != http.StatusNotFound {
		t.Fatalf("a guardian asking for a pupil who is not their ward must get 404, got %d: %s",
			rec.Code, rec.Body.String())
	}

	if rec := w.read(w.stranger, w.physicsA, "student_id="+w.pupilS1.String()); rec.Code != http.StatusNotFound {
		t.Fatalf("a classmate must not read another pupil's result, got %d: %s",
			rec.Code, rec.Body.String())
	}

	class := w.body(w.read(w.teacher, w.physicsA, ""))
	if class.Count != 2 {
		t.Fatalf("the teacher of the offering reads the whole class, got %d", class.Count)
	}

	if rec := w.read(w.elsewhen, w.physicsA, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("a teacher of another section must not reach this offering, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if rec := w.read(w.elsewhen, w.physicsA, "student_id="+w.pupilS1.String()); rec.Code != http.StatusNotFound {
		t.Fatalf("a teacher of another section must not reach this pupil, got %d: %s",
			rec.Code, rec.Body.String())
	}

	if rec := w.read(w.admin, w.physicsA, "student_id="+w.outsideS3.String()); rec.Code != http.StatusNotFound {
		t.Fatalf("a pupil not enrolled in the offering has no result in it, got %d: %s",
			rec.Code, rec.Body.String())
	}
}

func TestOfferingResultNarrowsTheClassListToTheViewer(t *testing.T) {
	w := newResultWorld(t)
	w.workedExample(w.pupilS1)
	w.workedExample(w.pupilS2)

	body := w.body(w.read(w.pupil, w.physicsA, ""))
	if body.Count != 1 || body.Results[0].StudentID != w.pupilS1 {
		t.Fatalf("a pupil listing the offering must see only themselves, got %d: %s",
			body.Count, w.readable(body))
	}

	everyone := w.body(w.read(w.admin, w.physicsA, ""))
	if everyone.Count != 2 {
		t.Fatalf("an unrestricted viewer reads the whole roster, got %d", everyone.Count)
	}
}

func (w *resultWorld) readable(body resultsBody) string {
	w.t.Helper()

	raw, err := json.Marshal(body.Results)
	if err != nil {
		return err.Error()
	}
	return string(raw)
}
