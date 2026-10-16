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
	entsession "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/academicsession"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entcomponent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponent"
	entresultscheme "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultscheme"
	entexammark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentexammark"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/ent/schema"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/service/results"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type reportCardBody struct {
	StudentID         uuid.UUID       `json:"student_id"`
	AcademicSessionID uuid.UUID       `json:"academic_session_id"`
	Subjects          []reportSubject `json:"subjects"`
	Count             int             `json:"count"`
	Covers            bool            `json:"covers_every_subject"`
	CoverageReason    string          `json:"coverage_reason"`
	Final             bool            `json:"final"`
	Provisional       bool            `json:"provisional"`
	Tally             map[string]int  `json:"subjects_by_status"`
	Aggregate         any             `json:"aggregate"`
	AggregateReason   string          `json:"aggregate_reason"`
	Reason            string          `json:"reason"`
}

type reportWorld struct {
	t      *testing.T
	client *tenantent.Client

	teacher  marksActor
	elsewhen marksActor
	pupil    marksActor
	stranger marksActor
	guardian marksActor
	admin    marksActor

	session      uuid.UUID
	otherSession uuid.UUID

	physicsA uuid.UUID
	artA     uuid.UUID
	historyA uuid.UUID
	chemA    uuid.UUID
	musicA   uuid.UUID
	dramaA   uuid.UUID

	pupilS1   uuid.UUID
	pupilS2   uuid.UUID
	pupilS4   uuid.UUID
	outsideS3 uuid.UUID

	gradingScheme  uuid.UUID
	draftComponent uuid.UUID

	exams    map[string]uuid.UUID
	papers   map[string]uuid.UUID
	homework map[string]uuid.UUID
}

const (
	reportHalfYearly = "Half-Yearly Examination"
	reportClassTests = "Class Tests (best two of four)"
	reportAnnual     = "Annual Examination"
	reportPortfolios = "Homework"
)

var reportClassTestCodes = []string{"RCT-1", "RCT-2", "RCT-3", "RCT-4"}

func reportBands() []schema.GradeBand {
	points := func(v float64) *float64 { return &v }
	return []schema.GradeBand{
		{Label: "A1", MinPercent: 91, MaxPercent: 100, Points: points(10)},
		{Label: "A2", MinPercent: 81, MaxPercent: 90, Points: points(9)},
		{Label: "B1", MinPercent: 71, MaxPercent: 80, Points: points(8)},
		{Label: "B2", MinPercent: 61, MaxPercent: 70, Points: points(7)},
		{Label: "C1", MinPercent: 51, MaxPercent: 60, Points: points(6)},
		{Label: "C2", MinPercent: 41, MaxPercent: 50, Points: points(5)},
		{Label: "D", MinPercent: 33, MaxPercent: 40, Points: points(4)},
		{Label: "E", MinPercent: 0, MaxPercent: 32, Points: points(0)},
	}
}

func newReportWorld(t *testing.T) *reportWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	day := time.Date(2026, time.April, 6, 0, 0, 0, 0, time.UTC)

	branch := client.Branch.Create().SetName("Card Campus " + tag).SetCode("RCB-" + tag).SaveX(ctx)
	session := client.AcademicSession.Create().
		SetName("Card Session " + tag).
		SetCode("RCS-" + tag).
		SetStartDate(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2027, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SetIsCurrent(true).
		SaveX(ctx)
	other := client.AcademicSession.Create().
		SetName("Card Session Past " + tag).
		SetCode("RCP-" + tag).
		SetStartDate(time.Date(2025, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2026, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SaveX(ctx)

	client.AcademicSession.Update().
		Where(entsession.IDNEQ(session.ID), entsession.IsCurrent(true)).
		SetIsCurrent(false).
		ExecX(ctx)

	grade := client.GradeLevel.Create().
		SetName("X " + tag).SetCode("RCG-" + tag).SetSequence(10).SaveX(ctx)

	newSection := func(name, code string) uuid.UUID {
		return client.Section.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetGradeLevelID(grade.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SaveX(ctx).ID
	}
	sectionA := newSection("A", "RCA")
	sectionB := newSection("B", "RCZ")

	newTeacher := func(code string) (uuid.UUID, uuid.UUID) {
		cas := uuid.New()
		person := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName("Card").
			SetDisplayName("Card " + code + " " + tag).
			SaveX(ctx)
		staff := client.Staff.Create().
			SetPersonID(person.ID).
			SetEmployeeCode(code + "-" + tag).
			SaveX(ctx)
		return client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx).ID, cas
	}
	teacherT1, casT1 := newTeacher("RCT1")
	teacherT9, casT9 := newTeacher("RCT9")

	newSubject := func(name, code string) uuid.UUID {
		return client.Subject.Create().
			SetName(name + " " + tag).SetCode(code + "-" + tag).SaveX(ctx).ID
	}

	grading := client.GradingScheme.Create().
		SetAcademicSessionID(session.ID).
		SetName("Board bands " + tag).
		SetCode("RCGS-" + tag).
		SetScaleJSON(reportBands()).
		SaveX(ctx).ID

	newOffering := func(section, subject uuid.UUID, named bool) uuid.UUID {
		create := client.SubjectOffering.Create().
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetSubjectID(subject)
		if named {
			create = create.SetGradingSchemeID(grading)
		}
		return create.SaveX(ctx).ID
	}
	physicsA := newOffering(sectionA, newSubject("AAA Physics", "RCP"), true)
	artA := newOffering(sectionA, newSubject("BBB Art", "RCR"), true)
	chemA := newOffering(sectionA, newSubject("CCC Chemistry", "RCC"), false)
	dramaA := newOffering(sectionA, newSubject("DDD Drama", "RCD"), true)
	historyA := newOffering(sectionA, newSubject("EEE History", "RCH"), true)
	musicA := newOffering(sectionA, newSubject("FFF Music", "RCM"), true)
	physicsB := newOffering(sectionB, newSubject("GGG Physics B", "RCQ"), true)

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

	newPupil := func(label string, section uuid.UUID,
		offerings ...uuid.UUID) (uuid.UUID, uuid.UUID, uuid.UUID) {
		cas := uuid.New()
		person := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName("Card").
			SetDisplayName("Card " + label + " " + tag).
			SaveX(ctx)
		student := client.Student.Create().
			SetPersonID(person.ID).
			SetAdmissionNumber("RCADM-" + label + "-" + tag).
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
		return student.ID, cas, enrollment.ID
	}
	pupilS1, casS1, enrolledS1 := newPupil("S1", sectionA, physicsA, artA, chemA, historyA, musicA)
	pupilS2, casS2, _ := newPupil("S2", sectionA, physicsA)
	pupilS4, _, _ := newPupil("S4", sectionA)
	outsideS3, _, _ := newPupil("S3", sectionB, physicsB)

	client.StudentSubjectEnrollment.Create().
		SetStudentEnrollmentID(enrolledS1).
		SetSubjectOfferingID(dramaA).
		SetStudentID(pupilS1).
		SetAcademicSessionID(session.ID).
		SetStatus(entsubjenroll.StatusDropped).
		SaveX(ctx)

	casGuardian := uuid.New()
	guardianPerson := client.Person.Create().
		SetCasUserID(casGuardian).
		SetFirstName("Card").
		SetDisplayName("Card Guardian " + tag).
		SaveX(ctx)
	guardian := client.Guardian.Create().SetPersonID(guardianPerson.ID).SaveX(ctx)
	client.StudentGuardian.Create().
		SetStudentID(pupilS1).
		SetGuardianID(guardian.ID).
		SetRelationshipType("mother").
		SetCanViewAcademic(true).
		SaveX(ctx)

	exams := map[string]uuid.UUID{}
	newExam := func(code, name string, kind entexam.AssessmentKind) uuid.UUID {
		id := client.Exam.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SetAssessmentKind(kind).
			SaveX(ctx).ID
		exams[code] = id
		return id
	}
	papers := map[string]uuid.UUID{}
	newPaper := func(key, code string, offering uuid.UUID, maximum float64) uuid.UUID {
		id := client.ExamSubject.Create().
			SetExamID(exams[code]).
			SetSubjectOfferingID(offering).
			SetMaximumMarks(maximum).
			SaveX(ctx).ID
		papers[key] = id
		return id
	}

	newExam("HY", "Half Yearly", entexam.AssessmentKindEvaluative)
	newExam("ANN", "Annual", entexam.AssessmentKindEvaluative)
	newExam("MOCK", "Mock, which does not count", entexam.AssessmentKindPractice)
	for _, code := range reportClassTestCodes {
		newExam(code, "Class Test "+code, entexam.AssessmentKindEvaluative)
	}

	newPaper("HY", "HY", physicsA, 40)
	newPaper("ANN", "ANN", physicsA, 80)
	newPaper("MOCK", "MOCK", physicsA, 10)
	for _, code := range reportClassTestCodes {
		newPaper(code, code, physicsA, 10)
	}
	newPaper("HY-HISTORY", "HY", historyA, 50)

	homework := map[string]uuid.UUID{}
	for _, title := range []string{"Card Portfolio I", "Card Portfolio II"} {
		homework[title] = client.Assignment.Create().
			SetAcademicSessionID(session.ID).
			SetTeacherID(teacherT1).
			SetTitle(title + " " + tag).
			SetAssignmentType(entassignment.AssignmentTypeWorksheet).
			SetMaximumMarks(20).
			SetStatus(entassignment.StatusPublished).
			SaveX(ctx).ID
	}

	newScheme := func(code, name string, total float64, status entresultscheme.Status) uuid.UUID {
		return client.ResultScheme.Create().
			SetAcademicSessionID(session.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SetTotalMarks(total).
			SetStatus(status).
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
	standard := newScheme("RC-STD-100", "Standard 100", 100, entresultscheme.StatusActive)
	linkExam(newComponent(standard, reportHalfYearly, 40, 20,
		entcomponent.AggregationSingle, nil, 0), "HY")
	classTests := newComponent(standard, reportClassTests, 20, 10,
		entcomponent.AggregationBestOf, &two, 1)
	for _, code := range reportClassTestCodes {
		linkExam(classTests, code)
	}
	linkExam(newComponent(standard, reportAnnual, 80, 70,
		entcomponent.AggregationSingle, nil, 2), "ANN")
	attach(physicsA, standard)

	mixed := newScheme("RC-MIX-100", "Half set up", 100, entresultscheme.StatusActive)
	linkExam(newComponent(mixed, reportHalfYearly, 50, 20,
		entcomponent.AggregationSingle, nil, 0), "HY")
	linkExam(newComponent(mixed, reportAnnual, 80, 80,
		entcomponent.AggregationSingle, nil, 1), "ANN")
	attach(historyA, mixed)

	withHomework := newScheme("RC-HW-100", "Homework only", 100, entresultscheme.StatusActive)
	portfolios := newComponent(withHomework, reportPortfolios, 20, 100,
		entcomponent.AggregationAverage, nil, 0)
	for _, title := range []string{"Card Portfolio I", "Card Portfolio II"} {
		linkHomework(portfolios, homework[title])
	}
	attach(chemA, withHomework)

	empty := newScheme("RC-NIL-100", "Nothing set up", 100, entresultscheme.StatusActive)
	linkExam(newComponent(empty, reportAnnual, 80, 100,
		entcomponent.AggregationSingle, nil, 0), "ANN")
	attach(musicA, empty)

	draft := newScheme("RC-DFT-100", "Still being written", 100, entresultscheme.StatusDraft)
	draftComponent := newComponent(draft, reportClassTests, 20, 100,
		entcomponent.AggregationAverage, nil, 0)

	casAdmin := uuid.New()
	client.Person.Create().
		SetCasUserID(casAdmin).
		SetFirstName("Card").
		SetDisplayName("Card Admin " + tag).
		SaveX(ctx)

	base := postgres.WithConn(ctx, &postgres.TenantConn{Client: client})
	actor := func(cas uuid.UUID, guard reachGuard) marksActor {
		return marksActor{
			server: &Server{guard: guard},
			ctx:    authorization.WithSubject(base, &authorization.Subject{CASUserID: cas}),
		}
	}

	world := &reportWorld{
		t:      t,
		client: client,

		teacher:  actor(casT1, reachGuard{reach: authorization.ReachTeacherAssignment}),
		elsewhen: actor(casT9, reachGuard{reach: authorization.ReachTeacherAssignment}),
		pupil:    actor(casS1, reachGuard{reach: authorization.ReachSelf}),
		stranger: actor(casS2, reachGuard{reach: authorization.ReachSelf}),
		guardian: actor(casGuardian, reachGuard{reach: authorization.ReachGuardianWard}),
		admin:    actor(casAdmin, reachGuard{reach: authorization.ReachTenant, all: true}),

		session:      session.ID,
		otherSession: other.ID,

		physicsA: physicsA,
		artA:     artA,
		historyA: historyA,
		chemA:    chemA,
		musicA:   musicA,
		dramaA:   dramaA,

		pupilS1:   pupilS1,
		pupilS2:   pupilS2,
		pupilS4:   pupilS4,
		outsideS3: outsideS3,

		gradingScheme:  grading,
		draftComponent: draftComponent,

		exams:    exams,
		papers:   papers,
		homework: homework,
	}

	world.requireGenuineScopes()
	db.Forget()
	return world
}

func (w *reportWorld) requireGenuineScopes() {
	w.t.Helper()

	pupil, decision, err := w.pupil.server.scopeFor(w.pupil.ctx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		w.t.Fatalf("the pupil viewer could not be resolved: %v", err)
	}
	if pupil.Unrestricted {
		w.t.Fatal("an unrestricted pupil would reach every card and prove nothing")
	}
	if len(pupil.StudentIDs) != 1 || pupil.StudentIDs[0] != w.pupilS1 {
		w.t.Fatalf("the pupil viewer must resolve to S1 %s, got %v", w.pupilS1, pupil.StudentIDs)
	}
	if decision.Reach != authorization.ReachSelf {
		w.t.Fatalf("the pupil decision must carry a self reach, got %+v", decision)
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

func (w *reportWorld) read(a marksActor, student uuid.UUID, query string) *httptest.ResponseRecorder {
	w.t.Helper()

	target := "/api/v1/students/" + student.String() + "/report-card"
	if query != "" {
		target += "?" + query
	}
	rec, request := a.req(w.t, http.MethodGet, target, "",
		map[string]string{"id": student.String()})
	a.server.getStudentReportCard(rec, request)
	return rec
}

func (w *reportWorld) card(rec *httptest.ResponseRecorder) reportCardBody {
	w.t.Helper()

	if rec.Code != http.StatusOK {
		w.t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var out reportCardBody
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		w.t.Fatalf("the body did not decode: %v (%s)", err, rec.Body.String())
	}
	if out.Count != len(out.Subjects) {
		w.t.Fatalf("count %d disagrees with %d subjects", out.Count, len(out.Subjects))
	}
	return out
}

func (w *reportWorld) mine(a marksActor, student uuid.UUID) reportCardBody {
	w.t.Helper()
	return w.card(w.read(a, student, "academic_session_id="+w.session.String()))
}

func (w *reportWorld) line(card reportCardBody, offering uuid.UUID) reportSubject {
	w.t.Helper()

	for _, subject := range card.Subjects {
		if subject.SubjectOfferingID == offering {
			return subject
		}
	}
	raw, _ := json.Marshal(card.Subjects)
	w.t.Fatalf("the card carries no line for offering %s: %s", offering, raw)
	return reportSubject{}
}

func (w *reportWorld) absent(card reportCardBody, offering uuid.UUID) {
	w.t.Helper()

	for _, subject := range card.Subjects {
		if subject.SubjectOfferingID == offering {
			w.t.Fatalf("offering %s must not be on the card, got %+v", offering, subject)
		}
	}
}

func (w *reportWorld) mark(paper, student uuid.UUID, obtained float64) {
	w.t.Helper()

	w.client.StudentExamMark.Create().
		SetExamSubjectID(paper).
		SetStudentID(student).
		SetStatus(entexammark.StatusMarked).
		SetMarksObtained(obtained).
		SaveX(context.Background())
}

func (w *reportWorld) missed(paper, student uuid.UUID, status entexammark.Status) {
	w.t.Helper()

	w.client.StudentExamMark.Create().
		SetExamSubjectID(paper).
		SetStudentID(student).
		SetStatus(status).
		SaveX(context.Background())
}

func (w *reportWorld) wholePhysics(student uuid.UUID) {
	w.t.Helper()

	w.mark(w.papers["HY"], student, 30)
	w.mark(w.papers["RCT-1"], student, 8)
	w.mark(w.papers["RCT-2"], student, 6)
	w.mark(w.papers["RCT-3"], student, 9)
	w.mark(w.papers["RCT-4"], student, 7)
	w.mark(w.papers["ANN"], student, 70)
}

func reportNear(t *testing.T, what string, got, want float64) {
	t.Helper()

	if math.Abs(got-want) > 0.005 {
		t.Fatalf("%s is %v, expected %v", what, got, want)
	}
}

func reportComponent(t *testing.T, line reportSubject, name string) results.ComponentResult {
	t.Helper()

	if line.Result == nil {
		t.Fatalf("subject %q carries no result at all", line.Subject)
	}
	for _, component := range line.Result.Components {
		if component.Name == name {
			return component
		}
	}
	t.Fatalf("subject %q has no component named %q", line.Subject, name)
	return results.ComponentResult{}
}

func reportSource(t *testing.T, component results.ComponentResult, label string) results.SourceResult {
	t.Helper()

	for _, source := range component.Sources {
		if source.Label == label {
			return source
		}
	}
	t.Fatalf("component %q has no source labelled %q", component.Name, label)
	return results.SourceResult{}
}

func TestReportCardComputesTheWorkedExampleAndNamesTheBand(t *testing.T) {
	w := newReportWorld(t)
	w.wholePhysics(w.pupilS1)

	line := w.line(w.mine(w.teacher, w.pupilS1), w.physicsA)

	if line.Status != reportSubjectFinal {
		t.Fatalf("a fully marked subject under a whole scheme must read final, got %q (%s)",
			line.Status, line.Reason)
	}
	if !line.Final {
		t.Fatal("the line's final flag must agree with its status")
	}
	reportNear(t, "the score", line.Result.Score, 84.75)
	reportNear(t, "the percentage", line.Result.Percentage(), 84.75)

	half := reportComponent(t, line, reportHalfYearly)
	tests := reportComponent(t, line, reportClassTests)
	annual := reportComponent(t, line, reportAnnual)
	reportNear(t, "the half-yearly out of forty", half.ObtainedMarks, 30)
	reportNear(t, "the class tests out of twenty", tests.ObtainedMarks, 17)
	reportNear(t, "the annual out of eighty", annual.ObtainedMarks, 70)
	reportNear(t, "the printed lines",
		half.Contribution+tests.Contribution+annual.Contribution, line.Result.Score)

	if line.Grade == nil {
		t.Fatalf("a final result under a grading scheme must be named: %+v", line.GradeNotNamed)
	}
	if line.Grade.Label != "A2" {
		t.Fatalf("84.75 falls in 81-90, which is A2, got %q covering %v-%v",
			line.Grade.Label, line.Grade.MinPercent, line.Grade.MaxPercent)
	}
	if line.Grade.Points == nil || *line.Grade.Points != 9 {
		t.Fatalf("the band's points must be carried, got %v", line.Grade.Points)
	}
	if line.Grade.Provisional {
		t.Fatal("a settled result names a settled band")
	}
	if line.Grade.GradingSchemeID != w.gradingScheme {
		t.Fatalf("the band must come from the offering's grading scheme %s, got %s",
			w.gradingScheme, line.Grade.GradingSchemeID)
	}
	reportNear(t, "the percentage the band was named from", line.Grade.Percentage, 84.75)
}

func TestReportCardWithholdsTheBandUntilTheSubjectIsComplete(t *testing.T) {
	w := newReportWorld(t)
	w.mark(w.papers["HY"], w.pupilS1, 30)
	w.mark(w.papers["RCT-1"], w.pupilS1, 8)
	w.mark(w.papers["RCT-3"], w.pupilS1, 9)

	line := w.line(w.mine(w.teacher, w.pupilS1), w.physicsA)

	if line.Status != reportSubjectInProgress {
		t.Fatalf("an unmarked annual leaves the subject in progress, got %q", line.Status)
	}
	if line.Final {
		t.Fatal("an incomplete subject must not read final")
	}
	reportNear(t, "the score so far", line.Result.Score, 23.5)
	reportNear(t, "the percentage a band would have been named from",
		line.Result.Percentage(), 23.5)

	if line.Grade != nil {
		t.Fatalf("23.5%% is the floor of a part-marked subject, and naming it %q prints an "+
			"E for a pupil who has not sat the annual", line.Grade.Label)
	}
	if line.GradeNotNamed == nil || line.GradeNotNamed.Reason != reportGradeUnsettled {
		t.Fatalf("the card must say why no band is named, got %+v", line.GradeNotNamed)
	}
	if line.GradeNotNamed.GradingSchemeID == nil ||
		*line.GradeNotNamed.GradingSchemeID != w.gradingScheme {
		t.Fatalf("the withheld band must still name the scheme it was withheld from, got %+v",
			line.GradeNotNamed)
	}
}

func TestReportCardMarksAProvisionalTotalOnItsFace(t *testing.T) {
	w := newReportWorld(t)
	w.wholePhysics(w.pupilS1)

	w.client.StudentExamMark.Update().
		Where(
			entexammark.ExamSubjectID(w.papers["ANN"]),
			entexammark.StudentID(w.pupilS1),
		).
		SetProvisional(true).
		ExecX(context.Background())

	card := w.mine(w.teacher, w.pupilS1)
	line := w.line(card, w.physicsA)

	if !card.Provisional {
		t.Fatal("a card carrying a provisional total must say so at the top, not only in a line")
	}
	if card.Final {
		t.Fatal("a card with a provisional subject is not final")
	}
	if line.Status != reportSubjectProvisional {
		t.Fatalf("expected the line to read provisional, got %q", line.Status)
	}
	if line.Final {
		t.Fatal("a provisional total must never be presented as final")
	}
	if line.Reason != reportProvisionalMessage {
		t.Fatalf("the line must say what provisional means, got %q", line.Reason)
	}
	reportNear(t, "the score is still shown", line.Result.Score, 84.75)

	if line.Grade == nil {
		t.Fatalf("a complete subject is banded even when a mark is unsettled: %+v",
			line.GradeNotNamed)
	}
	if !line.Grade.Provisional {
		t.Fatal("the band named from a provisional total must itself read provisional")
	}
	if card.Tally[reportSubjectProvisional] != 1 {
		t.Fatalf("the tally must count the provisional subject, got %v", card.Tally)
	}
}

func TestReportCardKeepsAbsentExemptAndNotEnteredApart(t *testing.T) {
	w := newReportWorld(t)
	w.mark(w.papers["HY"], w.pupilS1, 30)
	w.missed(w.papers["RCT-1"], w.pupilS1, entexammark.StatusAbsent)
	w.missed(w.papers["RCT-2"], w.pupilS1, entexammark.StatusExempt)
	w.mark(w.papers["RCT-3"], w.pupilS1, 9)
	w.mark(w.papers["ANN"], w.pupilS1, 70)

	line := w.line(w.mine(w.teacher, w.pupilS1), w.physicsA)
	tests := reportComponent(t, line, reportClassTests)

	got := map[string]results.Outcome{}
	for _, code := range reportClassTestCodes {
		got[code] = reportSource(t, tests, "Class Test "+code).Outcome
	}
	want := map[string]results.Outcome{
		"RCT-1": results.OutcomeAbsent,
		"RCT-2": results.OutcomeExempt,
		"RCT-3": results.OutcomeCounted,
		"RCT-4": results.OutcomeNotEntered,
	}
	for code, outcome := range want {
		if got[code] != outcome {
			t.Fatalf("%s must read %q on the card, got %q; a dash for all three destroys the "+
				"distinction: %v", code, outcome, got[code], got)
		}
	}

	if line.Status != reportSubjectInProgress {
		t.Fatalf("one test never sat and never excused leaves the subject in progress, got %q",
			line.Status)
	}
	if line.Grade != nil {
		t.Fatal("a subject with a paper neither marked nor excused is not banded")
	}
}

func TestReportCardSaysASubjectWithNoResultSchemeHasNoScore(t *testing.T) {
	w := newReportWorld(t)

	line := w.line(w.mine(w.pupil, w.pupilS1), w.artA)

	if line.Status != reportSubjectNotComposed {
		t.Fatalf("an offering with no result scheme composes nothing, got %q", line.Status)
	}
	if line.Result != nil {
		t.Fatalf("there is no result to show, and a zero would be read as one: %+v", line.Result)
	}
	if line.ResultSchemeID != nil {
		t.Fatalf("expected no result scheme, got %v", line.ResultSchemeID)
	}
	if line.Reason != resultNotComposed {
		t.Fatalf("the line must say why there is no score, got %q", line.Reason)
	}
	if line.Grade != nil {
		t.Fatal("there is no score to name a band from")
	}
}

func TestReportCardMidSessionReadsAsEmptyRatherThanAsNoughts(t *testing.T) {
	w := newReportWorld(t)

	card := w.mine(w.pupil, w.pupilS1)

	if card.Count != 5 {
		t.Fatalf("the pupil actively takes five subjects, got %d: %v", card.Count, card.Tally)
	}
	if card.Final || card.Provisional {
		t.Fatalf("nothing is marked, so the card is neither final nor provisional: %+v", card)
	}

	physics := w.line(card, w.physicsA)
	if physics.Status != reportSubjectAwaiting {
		t.Fatalf("no mark, absence or exemption exists, so the subject awaits marks, got %q",
			physics.Status)
	}
	if physics.Result == nil {
		t.Fatal("the breakdown still names every paper the subject is composed of")
	}
	reportNear(t, "the score of a subject with no marks", physics.Result.Score, 0)
	if physics.Reason != reportAwaitingMessage {
		t.Fatalf("the nought has to be explained or it reads as a score, got %q", physics.Reason)
	}
	for _, component := range physics.Result.Components {
		for _, source := range component.Sources {
			if source.Outcome != results.OutcomeNotEntered {
				t.Fatalf("every source must read not_entered, %q reads %q",
					source.Label, source.Outcome)
			}
		}
	}
	if physics.Grade != nil {
		t.Fatalf("a nought that is the absence of marks must not be banded as %q",
			physics.Grade.Label)
	}

	music := w.line(card, w.musicA)
	if music.Status != resultNothingScorable {
		t.Fatalf("music's scheme links an exam with no music paper, got %q", music.Status)
	}
	if music.Result != nil {
		t.Fatalf("there is no arithmetic to do, so there is no result: %+v", music.Result)
	}

	if card.Tally[reportSubjectAwaiting] != 3 {
		t.Fatalf("physics, chemistry and history all await marks, got %v", card.Tally)
	}
	if card.Tally[reportSubjectNotComposed] != 1 ||
		card.Tally[resultNothingScorable] != 1 {
		t.Fatalf("art composes nothing and music is unfilled, got %v", card.Tally)
	}
}

func TestAPupilExemptFromEverySourceIsNotGradedAtNought(t *testing.T) {
	w := newReportWorld(t)

	w.missed(w.papers["HY"], w.pupilS1, entexammark.StatusExempt)
	w.missed(w.papers["ANN"], w.pupilS1, entexammark.StatusExempt)
	for _, code := range reportClassTestCodes {
		w.missed(w.papers[code], w.pupilS1, entexammark.StatusExempt)
	}

	line := w.line(w.mine(w.teacher, w.pupilS1), w.physicsA)

	if line.Status != reportSubjectExempt {
		t.Fatalf("a pupil excused from every part of a subject is exempt, got %q", line.Status)
	}
	reportNear(t, "the total of nothing assessed", line.Result.AssessedTotal, 0)
	reportNear(t, "the score", line.Result.Score, 0)
	if line.Grade != nil {
		t.Fatalf("an exempt pupil scored nothing because nothing was asked of them, and %q "+
			"would read as the opposite", line.Grade.Label)
	}
	if line.GradeNotNamed == nil || line.GradeNotNamed.Reason != reportGradeNothingAssessed {
		t.Fatalf("the card must say the subject was not assessed, got %+v", line.GradeNotNamed)
	}
}

func TestReportCardSubjectComposedOfLessThanItsSchemeIsNotBanded(t *testing.T) {
	w := newReportWorld(t)
	w.mark(w.papers["HY-HISTORY"], w.pupilS1, 40)

	line := w.line(w.mine(w.admin, w.pupilS1), w.historyA)

	if line.Status != reportSubjectPartlyComposed {
		t.Fatalf("history's annual has no paper, so it is partly composed, got %q", line.Status)
	}
	if line.Final {
		t.Fatal("a subject missing four fifths of its composition must not read final")
	}
	reportNear(t, "the score of what exists", line.Result.Score, 16)
	reportNear(t, "the percentage of what exists", line.Result.Percentage(), 80)

	if line.Composition == nil || len(line.Composition.ComponentsDropped) != 1 {
		t.Fatalf("the card must name what is not set up, got %+v", line.Composition)
	}
	if line.Composition.ComponentsDropped[0].Weight != 80 {
		t.Fatalf("the weight left out of the total must be named, got %+v",
			line.Composition.ComponentsDropped[0])
	}
	if line.Grade != nil {
		t.Fatalf("80%% of a fifth of the scheme must not be banded as %q", line.Grade.Label)
	}
	if line.GradeNotNamed == nil || line.GradeNotNamed.Reason != reportGradeNotWhole {
		t.Fatalf("the reason must be the composition, not the marks, got %+v", line.GradeNotNamed)
	}
}

func TestReportCardScoresASubjectWithNoGradingSchemeAndNamesNoBand(t *testing.T) {
	w := newReportWorld(t)
	ctx := context.Background()

	for _, title := range []string{"Card Portfolio I", "Card Portfolio II"} {
		w.client.AssignmentSubmission.Create().
			SetAssignmentID(w.homework[title]).
			SetStudentID(w.pupilS1).
			SetAttemptNumber(1).
			SetMarksObtained(15).
			SaveX(ctx)
	}

	line := w.line(w.mine(w.admin, w.pupilS1), w.chemA)

	if line.Status != reportSubjectFinal {
		t.Fatalf("both portfolios are marked, so the subject is settled, got %q (%s)",
			line.Status, line.Reason)
	}
	reportNear(t, "the score", line.Result.Score, 75)
	if line.Grade != nil {
		t.Fatalf("no grading scheme is attached, so nothing names the 75: %+v", line.Grade)
	}
	if line.GradeNotNamed == nil || line.GradeNotNamed.Reason != reportGradeNoScheme {
		t.Fatalf("the card must say the subject has no grading scheme, got %+v",
			line.GradeNotNamed)
	}
}

func TestADroppedSubjectIsNotOnTheCard(t *testing.T) {
	w := newReportWorld(t)

	card := w.mine(w.pupil, w.pupilS1)
	w.absent(card, w.dramaA)

	dropped, err := w.client.StudentSubjectEnrollment.Query().
		Where(
			entsubjenroll.StudentID(w.pupilS1),
			entsubjenroll.SubjectOfferingID(w.dramaA),
		).
		Only(context.Background())
	if err != nil {
		t.Fatalf("the dropped enrolment is not there, so the test proves nothing: %v", err)
	}
	if dropped.Status != entsubjenroll.StatusDropped {
		t.Fatalf("the fixture must drop the enrolment, it is %q", dropped.Status)
	}
}

func TestReportCardOfAPupilWhoTakesNothingIsNotAnError(t *testing.T) {
	w := newReportWorld(t)

	card := w.mine(w.admin, w.pupilS4)

	if card.Count != 0 || len(card.Subjects) != 0 {
		t.Fatalf("this pupil is enrolled in no subject, got %d", card.Count)
	}
	if card.Final {
		t.Fatal("an empty card is not a final card")
	}
	if card.Reason != reportCardNoSubjects {
		t.Fatalf("an empty card must say what it means, got %q", card.Reason)
	}
}

func TestReportCardReadsOnlyPupilsTheViewerReaches(t *testing.T) {
	w := newReportWorld(t)
	w.wholePhysics(w.pupilS1)
	w.wholePhysics(w.pupilS2)

	own := w.line(w.mine(w.pupil, w.pupilS1), w.physicsA)
	reportNear(t, "a pupil reading their own card", own.Result.Score, 84.75)

	ward := w.line(w.mine(w.guardian, w.pupilS1), w.physicsA)
	reportNear(t, "a guardian reading their ward's card", ward.Result.Score, 84.75)

	refused := map[string]*httptest.ResponseRecorder{
		"a classmate reading another pupil's card":     w.read(w.stranger, w.pupilS1, ""),
		"a pupil reading a classmate's card":           w.read(w.pupil, w.pupilS2, ""),
		"a guardian reading a pupil who is not theirs": w.read(w.guardian, w.pupilS2, ""),
		"a teacher of another section":                 w.read(w.elsewhen, w.pupilS1, ""),
		"anyone reading a pupil who does not exist":    w.read(w.admin, uuid.New(), ""),
	}
	for what, rec := range refused {
		if rec.Code != http.StatusNotFound {
			t.Fatalf("%s must get 404, got %d: %s", what, rec.Code, rec.Body.String())
		}
	}

	if rec := w.read(w.teacher, w.outsideS3, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("a teacher must not read a pupil of another section, got %d: %s",
			rec.Code, rec.Body.String())
	}
}

func TestACardNarrowedToOneSubjectDoesNotClaimToBeTheWholeCard(t *testing.T) {
	w := newReportWorld(t)
	w.wholePhysics(w.pupilS1)

	taught := w.mine(w.teacher, w.pupilS1)
	if taught.Count != 1 {
		t.Fatalf("a subject teacher reaches the offering they teach and no other, got %d: %v",
			taught.Count, taught.Tally)
	}
	if w.line(taught, w.physicsA).Status != reportSubjectFinal {
		t.Fatal("the one subject they teach is settled")
	}
	if taught.Covers {
		t.Fatal("every line shown is final, but this pupil takes four more subjects this " +
			"viewer cannot read, and a card printed from it would not be the pupil's card")
	}
	if taught.CoverageReason != reportCardNarrowed {
		t.Fatalf("a narrowed card must say so, got %q", taught.CoverageReason)
	}

	own := w.mine(w.pupil, w.pupilS1)
	if !own.Covers || own.CoverageReason != "" {
		t.Fatalf("a pupil reads every subject they take, got covers=%v %q",
			own.Covers, own.CoverageReason)
	}
	if !w.mine(w.guardian, w.pupilS1).Covers {
		t.Fatal("a guardian reads every subject their ward takes")
	}
	if !w.mine(w.admin, w.pupilS1).Covers {
		t.Fatal("an unrestricted viewer reads the whole card")
	}
}

func TestReportCardDefaultsToTheCurrentSession(t *testing.T) {
	w := newReportWorld(t)

	card := w.card(w.read(w.pupil, w.pupilS1, ""))
	if card.AcademicSessionID != w.session {
		t.Fatalf("with no session named the card is for the current one %s, got %s",
			w.session, card.AcademicSessionID)
	}
	if card.Count != 5 {
		t.Fatalf("the current session's five subjects, got %d", card.Count)
	}

	past := w.card(w.read(w.pupil, w.pupilS1, "academic_session_id="+w.otherSession.String()))
	if past.Count != 0 {
		t.Fatalf("the pupil took nothing in the earlier session, got %d", past.Count)
	}

	if rec := w.read(w.pupil, w.pupilS1,
		"academic_session_id="+uuid.New().String()); rec.Code != http.StatusNotFound {
		t.Fatalf("a session that does not exist is a 404, got %d: %s", rec.Code, rec.Body.String())
	}

	w.client.AcademicSession.Update().
		Where(entsession.IsCurrent(true)).
		SetIsCurrent(false).
		ExecX(context.Background())

	if rec := w.read(w.pupil, w.pupilS1, ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("with no current session the caller has to name one, got %d: %s",
			rec.Code, rec.Body.String())
	}
}

func TestReportCardTotalsNothingAcrossSubjects(t *testing.T) {
	w := newReportWorld(t)
	w.wholePhysics(w.pupilS1)

	rec := w.read(w.pupil, w.pupilS1, "academic_session_id="+w.session.String())
	card := w.card(rec)

	if card.Aggregate != nil {
		t.Fatalf("an overall total across subjects is a school's policy and must not be "+
			"invented, got %v", card.Aggregate)
	}
	if card.AggregateReason == "" {
		t.Fatal("the card must say why it totals nothing")
	}

	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("the body did not decode: %v", err)
	}
	for _, key := range []string{"overall", "total", "percentage", "grade", "points", "average"} {
		if _, found := raw[key]; found {
			t.Fatalf("%q at the top of a card is a cross-subject judgement nobody specified", key)
		}
	}
}

func TestAPracticeExamCannotBeComposedAndSoIsNotOnTheCard(t *testing.T) {
	w := newReportWorld(t)
	w.wholePhysics(w.pupilS1)
	w.mark(w.papers["MOCK"], w.pupilS1, 10)

	body := `{"exam_id":"` + w.exams["MOCK"].String() + `"}`
	rec, request := w.admin.req(t, http.MethodPost,
		"/api/v1/result-components/"+w.draftComponent.String()+"/exams", body,
		map[string]string{"id": w.draftComponent.String()})
	w.admin.server.linkResultComponentExam(rec, request)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a practice exam may not feed a result component, got %d: %s",
			rec.Code, rec.Body.String())
	}
	var refusal struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &refusal); err != nil {
		t.Fatalf("the refusal did not decode: %v", err)
	}
	if refusal.Error != "practice_exam_cannot_be_composed" {
		t.Fatalf("expected practice_exam_cannot_be_composed, got %q", refusal.Error)
	}

	line := w.line(w.mine(w.teacher, w.pupilS1), w.physicsA)
	mock := results.ExamSource(w.exams["MOCK"])
	for _, component := range line.Result.Components {
		for _, source := range component.Sources {
			if source.Ref == mock {
				t.Fatalf("a practice assessment reached the card through %q", component.Name)
			}
		}
	}
	reportNear(t, "a full ten out of ten on a mock changes nothing", line.Result.Score, 84.75)
}

func TestAnExamFlippedToPracticeAfterLinkingStillReachesTheCard(t *testing.T) {
	w := newReportWorld(t)
	w.wholePhysics(w.pupilS1)

	body := `{"assessment_kind":"practice"}`
	rec, request := w.admin.req(t, http.MethodPatch,
		"/api/v1/exams/"+w.exams["HY"].String(), body,
		map[string]string{"id": w.exams["HY"].String()})
	w.admin.server.updateExam(rec, request)

	if rec.Code != http.StatusOK {
		t.Fatalf("updateExam refuses to flip a composed exam, which would mean this gap is "+
			"closed and this test should be deleted; got %d: %s", rec.Code, rec.Body.String())
	}

	line := w.line(w.mine(w.teacher, w.pupilS1), w.physicsA)
	half := reportComponent(t, line, reportHalfYearly)
	reportNear(t, "the half-yearly a practice exam now names", half.Contribution, 15)

	t.Log("the practice rule is enforced only where a link is written: " +
		"linkResultComponentExam and the seeder both refuse a practice exam, but " +
		"updateExam sets assessment_kind on an exam already linked to a result component " +
		"without consulting result_component_exams, so a card can carry one")
}

func TestReportCardIsMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	const pattern = "GET /api/v1/students/{id}/report-card"
	if !found[pattern] && !found[pattern+"/"] {
		t.Fatalf("%s is not mounted, so the handler is unreachable however well it is tested",
			pattern)
	}
}
