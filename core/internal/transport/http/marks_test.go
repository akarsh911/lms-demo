package http

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcalendarday "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/calendarday"
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entexammark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentexammark"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type reachGuard struct {
	reach authorization.Reach
	all   bool
}

func (g reachGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.TimetableReadAll, authorization.TimetableWriteAll, authorization.TimetableDeleteAll:
		if !g.all {
			return authorization.Decision{}, nil
		}
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
			Rule:     "marks test guard",
		}, nil
	case authorization.TimetableRead, authorization.TimetableWrite, authorization.TimetableDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    g.reach,
			HasReach: true,
			Rule:     "marks test guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (g reachGuard) Name() string { return "marks test guard" }

type marksActor struct {
	server *Server
	ctx    context.Context
}

func (a marksActor) req(t *testing.T, method, target, body string,
	params map[string]string) (*httptest.ResponseRecorder, *http.Request) {
	t.Helper()

	route := chi.NewRouteContext()
	for name, value := range params {
		route.URLParams.Add(name, value)
	}

	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	request := httptest.NewRequest(method, target, reader).
		WithContext(context.WithValue(a.ctx, chi.RouteCtxKey, route))

	return httptest.NewRecorder(), request
}

type markWorld struct {
	t      *testing.T
	client *tenantent.Client
	base   context.Context

	teacher  marksActor
	other    marksActor
	pupil    marksActor
	stranger marksActor
	guardian marksActor
	admin    marksActor

	examID         uuid.UUID
	physicsSubject uuid.UUID
	bioSubject     uuid.UUID
	physicsSitting uuid.UUID

	pupilS1   uuid.UUID
	pupilS2   uuid.UUID
	outsideS3 uuid.UUID

	physicsMaximum float64
}

func newMarkWorld(t *testing.T) *markWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	monday := time.Date(2026, time.April, 6, 0, 0, 0, 0, time.UTC)

	branch := client.Branch.Create().SetName("Marks Campus " + tag).SetCode("MKB-" + tag).SaveX(ctx)
	session := client.AcademicSession.Create().
		SetName("Marks Session " + tag).
		SetCode("MKS-" + tag).
		SetStartDate(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2027, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SetIsCurrent(true).
		SaveX(ctx)
	grade := client.GradeLevel.Create().
		SetName("X " + tag).SetCode("MKG-" + tag).SetSequence(10).SaveX(ctx)

	newSection := func(name, code string) uuid.UUID {
		return client.Section.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetGradeLevelID(grade.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SaveX(ctx).ID
	}
	sectionA := newSection("A", "MKA")
	sectionB := newSection("B", "MKZ")

	newTeacher := func(code string) (uuid.UUID, uuid.UUID) {
		cas := uuid.New()
		person := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName("Marks").
			SetDisplayName("Marks " + code + " " + tag).
			SaveX(ctx)
		staff := client.Staff.Create().
			SetPersonID(person.ID).
			SetEmployeeCode(code + "-" + tag).
			SaveX(ctx)
		return client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx).ID, cas
	}
	teacherT1, casT1 := newTeacher("MKT1")
	teacherT4, casT4 := newTeacher("MKT4")

	newSubject := func(name, code string) uuid.UUID {
		return client.Subject.Create().
			SetName(name + " " + tag).SetCode(code + "-" + tag).SaveX(ctx).ID
	}
	physics := newSubject("Physics", "MKP")
	biology := newSubject("Biology", "MKB")

	newOffering := func(section, subject uuid.UUID) uuid.UUID {
		return client.SubjectOffering.Create().
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetSubjectID(subject).
			SaveX(ctx).ID
	}
	physicsA := newOffering(sectionA, physics)
	bioA := newOffering(sectionA, biology)
	physicsB := newOffering(sectionB, physics)

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
	teach(teacherT4, sectionA, bioA)

	newPupil := func(label string, section uuid.UUID, offerings ...uuid.UUID) (uuid.UUID, uuid.UUID) {
		cas := uuid.New()
		person := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName("Marks").
			SetDisplayName("Marks " + label + " " + tag).
			SaveX(ctx)
		student := client.Student.Create().
			SetPersonID(person.ID).
			SetAdmissionNumber("MKADM-" + label + "-" + tag).
			SaveX(ctx)
		enrollment := client.StudentEnrollment.Create().
			SetStudentID(student.ID).
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetEnrollmentDate(monday).
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
	pupilS1, casS1 := newPupil("S1", sectionA, physicsA, bioA)
	pupilS2, casS2 := newPupil("S2", sectionA, physicsA)
	outsideS3, _ := newPupil("S3", sectionB, physicsB)

	casGuardian := uuid.New()
	guardianPerson := client.Person.Create().
		SetCasUserID(casGuardian).
		SetFirstName("Marks").
		SetDisplayName("Marks Guardian " + tag).
		SaveX(ctx)
	guardian := client.Guardian.Create().SetPersonID(guardianPerson.ID).SaveX(ctx)
	client.StudentGuardian.Create().
		SetStudentID(pupilS1).
		SetGuardianID(guardian.ID).
		SetRelationshipType("mother").
		SetCanViewAcademic(true).
		SaveX(ctx)

	scheme := client.PeriodScheme.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetName("Senior " + tag).
		SetCode("MKC-" + tag).
		SaveX(ctx)
	period := client.Period.Create().
		SetPeriodSchemeID(scheme.ID).
		SetName("Period 1").
		SetCode("MKP1-" + tag).
		SetSequence(1).
		SaveX(ctx)
	day := client.CalendarDay.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetCalendarDate(monday).
		SetDayType(entcalendarday.DayTypeInstructional).
		SetForenoonOpen(true).
		SetAfternoonOpen(true).
		SaveX(ctx)

	exam := client.Exam.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetName("Half Yearly " + tag).
		SetCode("MKU-" + tag).
		SaveX(ctx)

	physicsSubject := client.ExamSubject.Create().
		SetExamID(exam.ID).
		SetSubjectOfferingID(physicsA).
		SetMaximumMarks(40).
		SetPassMarks(13).
		SaveX(ctx)
	bioSubject := client.ExamSubject.Create().
		SetExamID(exam.ID).
		SetSubjectOfferingID(bioA).
		SetMaximumMarks(30).
		SaveX(ctx)

	physicsSitting := client.ExamSitting.Create().
		SetExamSubjectID(physicsSubject.ID).
		SetCalendarDayID(day.ID).
		SetPeriodID(period.ID).
		SetSectionID(sectionA).
		SaveX(ctx)

	casAdmin := uuid.New()
	client.Person.Create().
		SetCasUserID(casAdmin).
		SetFirstName("Marks").
		SetDisplayName("Marks Admin " + tag).
		SaveX(ctx)

	base := postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	actor := func(cas uuid.UUID, guard reachGuard) marksActor {
		return marksActor{
			server: &Server{guard: guard},
			ctx:    authorization.WithSubject(base, &authorization.Subject{CASUserID: cas}),
		}
	}

	teacherReach := reachGuard{reach: authorization.ReachTeacherAssignment}
	selfReach := reachGuard{reach: authorization.ReachSelf}
	wardReach := reachGuard{reach: authorization.ReachGuardianWard}
	tenantReach := reachGuard{reach: authorization.ReachTenant, all: true}

	world := &markWorld{
		t:      t,
		client: client,
		base:   base,

		teacher:  actor(casT1, teacherReach),
		other:    actor(casT4, teacherReach),
		pupil:    actor(casS1, selfReach),
		stranger: actor(casS2, selfReach),
		guardian: actor(casGuardian, wardReach),
		admin:    actor(casAdmin, tenantReach),

		examID:         exam.ID,
		physicsSubject: physicsSubject.ID,
		bioSubject:     bioSubject.ID,
		physicsSitting: physicsSitting.ID,

		pupilS1:   pupilS1,
		pupilS2:   pupilS2,
		outsideS3: outsideS3,

		physicsMaximum: physicsSubject.MaximumMarks,
	}

	world.requireGenuineScopes()
	db.Forget()
	return world
}

func (w *markWorld) requireGenuineScopes() {
	w.t.Helper()

	viewer, decision, err := w.teacher.server.scopeFor(w.teacher.ctx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		w.t.Fatalf("the teacher viewer could not be resolved: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted teacher would reach every offering and prove nothing about scoping")
	}
	if viewer.TeacherID == nil {
		w.t.Fatal("the teacher viewer did not resolve to a teacher")
	}
	if len(viewer.SubjectOfferingIDs) != 1 {
		w.t.Fatalf("the teacher must carry exactly the physics offering, got %v", viewer.SubjectOfferingIDs)
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
		w.t.Fatal("an unrestricted pupil would reach every mark and prove nothing")
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
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		w.t.Fatalf("the admin viewer could not be resolved: %v", err)
	}
	if !admin.Unrestricted {
		w.t.Fatal("the admin viewer must be unrestricted or the tenant-wide cases prove nothing")
	}
}

func (w *markWorld) batch(a marksActor, body string) *httptest.ResponseRecorder {
	w.t.Helper()

	rec, request := a.req(w.t, http.MethodPost, "/api/v1/exam-marks/batch", body, nil)
	a.server.recordExamMarks(rec, request)
	return rec
}

func (w *markWorld) create(a marksActor, body string) *httptest.ResponseRecorder {
	w.t.Helper()

	rec, request := a.req(w.t, http.MethodPost, "/api/v1/exam-marks", body, nil)
	a.server.createExamMark(rec, request)
	return rec
}

func (w *markWorld) read(a marksActor, id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	rec, request := a.req(w.t, http.MethodGet, "/api/v1/exam-marks/"+id.String(), "",
		map[string]string{"id": id.String()})
	a.server.getExamMark(rec, request)
	return rec
}

func (w *markWorld) list(a marksActor, query string) *httptest.ResponseRecorder {
	w.t.Helper()

	rec, request := a.req(w.t, http.MethodGet, "/api/v1/exam-marks?"+query, "", nil)
	a.server.listExamMarks(rec, request)
	return rec
}

func (w *markWorld) amend(a marksActor, id uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()

	rec, request := a.req(w.t, http.MethodPatch, "/api/v1/exam-marks/"+id.String(), body,
		map[string]string{"id": id.String()})
	a.server.updateExamMark(rec, request)
	return rec
}

func (w *markWorld) markID(student uuid.UUID) uuid.UUID {
	w.t.Helper()

	row, err := w.client.StudentExamMark.Query().
		Where(entexammark.ExamSubjectID(w.physicsSubject), entexammark.StudentID(student)).
		Only(w.base)
	if err != nil {
		w.t.Fatalf("no mark row for student %s: %v", student, err)
	}
	return row.ID
}

func (w *markWorld) seedBothPupils() {
	w.t.Helper()

	body := fmt.Sprintf(
		`{"exam_subject_id":%q,"marks":[{"student_id":%q,"marks_obtained":31},{"student_id":%q,"marks_obtained":12}]}`,
		w.physicsSubject, w.pupilS1, w.pupilS2)
	if rec := w.batch(w.teacher, body); rec.Code != http.StatusOK {
		w.t.Fatalf("seeding two marks: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func markBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response was not JSON: %v (%s)", err, rec.Body.String())
	}
	return body
}

func TestExamMarksAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	want := []string{
		"GET /api/v1/exam-marks",
		"POST /api/v1/exam-marks",
		"POST /api/v1/exam-marks/batch",
		"GET /api/v1/exam-marks" + uuidParam,
		"PATCH /api/v1/exam-marks" + uuidParam,
		"DELETE /api/v1/exam-marks" + uuidParam,
	}
	for _, pattern := range want {
		if !found[pattern] && !found[pattern+"/"] {
			t.Errorf("%s is not mounted on the real router, so the handler is unreachable however well it is tested",
				pattern)
		}
	}
}

func TestExamMarkIsEnteredAndReadBack(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":37.5,"exam_sitting_id":%q}`,
		w.physicsSubject, w.pupilS1, w.physicsSitting)
	rec := w.create(w.teacher, body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("entering a mark: want 201, got %d (%s)", rec.Code, rec.Body.String())
	}

	id := w.markID(w.pupilS1)
	back := w.read(w.teacher, id)
	if back.Code != http.StatusOK {
		t.Fatalf("reading the mark back: want 200, got %d (%s)", back.Code, back.Body.String())
	}

	mark, _ := markBody(t, back)["exam_mark"].(map[string]any)
	if mark["marks_obtained"] != 37.5 {
		t.Fatalf("the mark read back was %v, not 37.5 (%s)", mark["marks_obtained"], back.Body.String())
	}
	if mark["status"] != string(entexammark.StatusMarked) {
		t.Fatalf("the status read back was %v, not marked", mark["status"])
	}
	if mark["exam_sitting_id"] != w.physicsSitting.String() {
		t.Fatalf("the sitting read back was %v, not %s", mark["exam_sitting_id"], w.physicsSitting)
	}
}

func TestExamMarkAboveTheMaximumIsRefused(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":41}`,
		w.physicsSubject, w.pupilS1)
	rec := w.create(w.teacher, body)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a mark above the maximum: want 422, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "must not exceed") {
		t.Fatalf("the refusal did not name the maximum: %s", rec.Body.String())
	}

	n, err := w.client.StudentExamMark.Query().
		Where(entexammark.ExamSubjectID(w.physicsSubject)).
		Count(w.base)
	if err != nil {
		t.Fatalf("counting marks: %v", err)
	}
	if n != 0 {
		t.Fatalf("a refused mark was written anyway: %d rows", n)
	}
}

func TestExamMarkIsNotClampedToTheMaximum(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":%v}`,
		w.physicsSubject, w.pupilS1, w.physicsMaximum)
	if rec := w.create(w.teacher, body); rec.Code != http.StatusCreated {
		t.Fatalf("a mark exactly at the maximum: want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestNegativeExamMarkIsRefused(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":-1}`,
		w.physicsSubject, w.pupilS1)
	rec := w.create(w.teacher, body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a negative mark: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "must not be negative") {
		t.Fatalf("the refusal did not name the sign: %s", rec.Body.String())
	}
}

func TestAbsentExemptAndZeroAreThreeDifferentFacts(t *testing.T) {
	w := newMarkWorld(t)

	zero := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":0}`,
		w.physicsSubject, w.pupilS1)
	if rec := w.create(w.teacher, zero); rec.Code != http.StatusCreated {
		t.Fatalf("a zero: want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	absent := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"status":"absent"}`,
		w.physicsSubject, w.pupilS2)
	if rec := w.create(w.teacher, absent); rec.Code != http.StatusCreated {
		t.Fatalf("an absence: want 201, got %d (%s)", rec.Code, rec.Body.String())
	}

	scored := w.client.StudentExamMark.GetX(w.base, w.markID(w.pupilS1))
	missed := w.client.StudentExamMark.GetX(w.base, w.markID(w.pupilS2))

	if scored.Status != entexammark.StatusMarked || scored.MarksObtained == nil || *scored.MarksObtained != 0 {
		t.Fatalf("a zero must be a marked row carrying zero, got status=%s marks=%v",
			scored.Status, scored.MarksObtained)
	}
	if missed.Status != entexammark.StatusAbsent || missed.MarksObtained != nil {
		t.Fatalf("an absence must carry no mark, got status=%s marks=%v",
			missed.Status, missed.MarksObtained)
	}

	const exempt = `{"status":"exempt","remarks":"medical"}`
	if rec := w.amend(w.teacher, missed.ID, exempt); rec.Code != http.StatusOK {
		t.Fatalf("amending an absence to an exemption: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	excused := w.client.StudentExamMark.GetX(w.base, missed.ID)
	if excused.Status != entexammark.StatusExempt {
		t.Fatalf("the amended row is %s, not exempt", excused.Status)
	}
	if excused.Status == missed.Status {
		t.Fatal("exempt and absent collapsed into one status")
	}
}

func TestAbsentPupilMayNotAlsoCarryAMark(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"status":"absent","marks_obtained":0}`,
		w.physicsSubject, w.pupilS1)
	rec := w.create(w.teacher, body)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an absent pupil carrying a zero: want 422, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "has no marks_obtained") {
		t.Fatalf("the refusal did not say why: %s", rec.Body.String())
	}
}

func TestMarkedPupilMustCarryAMark(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"status":"marked"}`,
		w.physicsSubject, w.pupilS1)
	rec := w.create(w.teacher, body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a marked pupil with no number: want 400, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "absent or exempt") {
		t.Fatalf("the refusal did not offer the alternative: %s", rec.Body.String())
	}
}

func TestBulkExamMarksAreWrittenTogether(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(
		`{"exam_subject_id":%q,"exam_sitting_id":%q,"marks":[`+
			`{"student_id":%q,"marks_obtained":31},`+
			`{"student_id":%q,"status":"absent"}]}`,
		w.physicsSubject, w.physicsSitting, w.pupilS1, w.pupilS2)

	rec := w.batch(w.teacher, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("a bulk write: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	written := markBody(t, rec)
	if written["created"] != float64(2) {
		t.Fatalf("the bulk write reported created=%v, not 2 (%s)", written["created"], rec.Body.String())
	}

	n, err := w.client.StudentExamMark.Query().
		Where(entexammark.ExamSubjectID(w.physicsSubject)).
		Count(w.base)
	if err != nil {
		t.Fatalf("counting marks: %v", err)
	}
	if n != 2 {
		t.Fatalf("the bulk write left %d rows, not 2", n)
	}
}

func TestBulkExamMarksAreRefusedWholeWhenOneRowIsBad(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(
		`{"exam_subject_id":%q,"marks":[`+
			`{"student_id":%q,"marks_obtained":31},`+
			`{"student_id":%q,"marks_obtained":99}]}`,
		w.physicsSubject, w.pupilS1, w.pupilS2)

	rec := w.batch(w.teacher, body)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a bulk write with one bad row: want 422, got %d (%s)", rec.Code, rec.Body.String())
	}

	refusal := markBody(t, rec)
	if refusal["index"] != float64(1) {
		t.Fatalf("the refusal named index %v, not 1 (%s)", refusal["index"], rec.Body.String())
	}
	if refusal["student_id"] != w.pupilS2.String() {
		t.Fatalf("the refusal named pupil %v, not S2 %s", refusal["student_id"], w.pupilS2)
	}

	n, err := w.client.StudentExamMark.Query().
		Where(entexammark.ExamSubjectID(w.physicsSubject)).
		Count(w.base)
	if err != nil {
		t.Fatalf("counting marks: %v", err)
	}
	if n != 0 {
		t.Fatalf("one bad row in two left %d rows behind; the good row was written anyway", n)
	}
}

func TestBulkExamMarksRefuseTheSamePupilTwice(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(
		`{"exam_subject_id":%q,"marks":[`+
			`{"student_id":%q,"marks_obtained":31},`+
			`{"student_id":%q,"marks_obtained":12}]}`,
		w.physicsSubject, w.pupilS1, w.pupilS1)

	rec := w.batch(w.teacher, body)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a pupil named twice: want 422, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestBulkExamMarksAmendOnASecondPass(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	body := fmt.Sprintf(
		`{"exam_subject_id":%q,"marks":[{"student_id":%q,"marks_obtained":33}]}`,
		w.physicsSubject, w.pupilS1)

	rec := w.batch(w.teacher, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("amending in bulk: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if got := markBody(t, rec)["updated"]; got != float64(1) {
		t.Fatalf("the second pass reported updated=%v, not 1 (%s)", got, rec.Body.String())
	}

	row := w.client.StudentExamMark.GetX(w.base, w.markID(w.pupilS1))
	if row.MarksObtained == nil || *row.MarksObtained != 33 {
		t.Fatalf("the amended mark is %v, not 33", row.MarksObtained)
	}
}

func TestTeacherCannotMarkAPaperTheyDoNotTeach(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":20}`,
		w.bioSubject, w.pupilS1)
	rec := w.create(w.teacher, body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("marking another teacher's paper: want 404, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestTeacherCannotMarkAPupilOutsideTheirOffering(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":20}`,
		w.physicsSubject, w.outsideS3)
	rec := w.create(w.teacher, body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("marking a pupil outside the offering: want 404, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestPupilNotEnrolledInTheOfferingIsRefusedEvenTenantWide(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":20}`,
		w.physicsSubject, w.outsideS3)
	rec := w.create(w.admin, body)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an unenrolled pupil named tenant-wide: want 422, got %d (%s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "not_enrolled") {
		t.Fatalf("the refusal did not say why: %s", rec.Body.String())
	}
}

func TestPupilReadsTheirOwnMarkAndNotAnother(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	mine := w.markID(w.pupilS1)
	theirs := w.markID(w.pupilS2)

	if rec := w.read(w.pupil, mine); rec.Code != http.StatusOK {
		t.Fatalf("a pupil reading their own mark: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	rec := w.read(w.pupil, theirs)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("A PUPIL READ ANOTHER PUPIL'S MARK: want 404, got %d (%s)", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "12") {
		t.Fatalf("the refusal leaked the other pupil's mark: %s", rec.Body.String())
	}
}

func TestPupilListSeesOnlyTheirOwnMarks(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	rec := w.list(w.pupil, "exam_subject_id="+w.physicsSubject.String())
	if rec.Code != http.StatusOK {
		t.Fatalf("a pupil listing marks: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	if got := markBody(t, rec)["count"]; got != float64(1) {
		t.Fatalf("a pupil saw %v marks on a paper two pupils sat; they must see exactly their own (%s)",
			got, rec.Body.String())
	}

	filtered := w.list(w.pupil, "student_id="+w.pupilS2.String())
	if filtered.Code != http.StatusOK {
		t.Fatalf("a pupil filtering by another pupil: want 200, got %d (%s)",
			filtered.Code, filtered.Body.String())
	}
	if got := markBody(t, filtered)["count"]; got != float64(0) {
		t.Fatalf("a pupil filtering by another pupil saw %v rows, not 0 (%s)", got, filtered.Body.String())
	}
}

func TestGuardianReadsTheirWardAndNoOtherPupil(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	if rec := w.read(w.guardian, w.markID(w.pupilS1)); rec.Code != http.StatusOK {
		t.Fatalf("a guardian reading their ward: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	rec := w.read(w.guardian, w.markID(w.pupilS2))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("A GUARDIAN READ A PUPIL WHO IS NOT THEIR WARD: want 404, got %d (%s)",
			rec.Code, rec.Body.String())
	}
}

func TestPupilCannotWriteTheirOwnMark(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":40}`,
		w.physicsSubject, w.pupilS1)
	rec := w.create(w.pupil, body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("A PUPIL WROTE THEIR OWN MARK: want 404, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestGuardianCannotAmendTheirWardsMark(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	rec := w.amend(w.guardian, w.markID(w.pupilS1), `{"marks_obtained":40}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("A GUARDIAN AMENDED A MARK: want 404, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestOtherTeacherCannotAmendAMarkOnAPaperTheyDoNotTeach(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	rec := w.amend(w.other, w.markID(w.pupilS1), `{"marks_obtained":40}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("another teacher amended a physics mark: want 404, got %d (%s)",
			rec.Code, rec.Body.String())
	}
}

func TestAmendingToAbsentMustClearTheMark(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	id := w.markID(w.pupilS1)
	rec := w.amend(w.teacher, id, `{"status":"absent"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("turning a scored pupil absent without clearing: want 422, got %d (%s)",
			rec.Code, rec.Body.String())
	}

	cleared := w.amend(w.teacher, id, `{"status":"absent","marks_obtained":null}`)
	if cleared.Code != http.StatusOK {
		t.Fatalf("turning a scored pupil absent and clearing: want 200, got %d (%s)",
			cleared.Code, cleared.Body.String())
	}
	row := w.client.StudentExamMark.GetX(w.base, id)
	if row.Status != entexammark.StatusAbsent || row.MarksObtained != nil {
		t.Fatalf("the amended row is status=%s marks=%v, not a clean absence", row.Status, row.MarksObtained)
	}
}

func TestExamMarkForASittingOfAnotherPaperIsRefused(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":10,"exam_sitting_id":%q}`,
		w.bioSubject, w.pupilS1, w.physicsSitting)
	rec := w.create(w.admin, body)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a sitting from another paper: want 422, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestPracticeExamsStillTakeMarks(t *testing.T) {
	w := newMarkWorld(t)

	if err := w.client.Exam.UpdateOneID(w.examID).
		SetAssessmentKind(entexam.AssessmentKindPractice).
		Exec(w.base); err != nil {
		t.Fatalf("turning the exam into practice: %v", err)
	}

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":31}`,
		w.physicsSubject, w.pupilS1)
	if rec := w.create(w.teacher, body); rec.Code != http.StatusCreated {
		t.Fatalf("marking a practice paper: want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
}

func TestExamSubjectCarryingMarksCannotBeDeleted(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	a := w.admin
	rec, request := a.req(t, http.MethodDelete,
		"/api/v1/exam-subjects/"+w.physicsSubject.String(), "",
		map[string]string{"id": w.physicsSubject.String()})
	a.server.deleteExamSubject(rec, request)

	if rec.Code != http.StatusConflict {
		t.Fatalf("deleting a paper that carries marks: want 409, got %d (%s)",
			rec.Code, rec.Body.String())
	}
}

func TestAMarkTypedByATeacherIsNeverProvisional(t *testing.T) {
	w := newMarkWorld(t)

	body := fmt.Sprintf(`{"exam_subject_id":%q,"student_id":%q,"marks_obtained":37.5}`,
		w.physicsSubject, w.pupilS1)
	if rec := w.create(w.teacher, body); rec.Code != http.StatusCreated {
		t.Fatalf("entering a mark: want 201, got %d (%s)", rec.Code, rec.Body.String())
	}
	if row := w.client.StudentExamMark.GetX(w.base, w.markID(w.pupilS1)); row.Provisional {
		t.Fatal("a teacher who types a number has finished; a paper mark is never provisional")
	}

	w.seedBothPupils()
	for _, pupil := range []uuid.UUID{w.pupilS1, w.pupilS2} {
		if row := w.client.StudentExamMark.GetX(w.base, w.markID(pupil)); row.Provisional {
			t.Fatalf("a mark entered in bulk for pupil %s came back provisional", pupil)
		}
	}
}

func TestAProvisionalMarkTurnedAbsentStopsBeingProvisional(t *testing.T) {
	w := newMarkWorld(t)
	w.seedBothPupils()

	id := w.markID(w.pupilS1)
	if err := w.client.StudentExamMark.UpdateOneID(id).SetProvisional(true).Exec(w.base); err != nil {
		t.Fatalf("the seeded mark could not be made provisional: %v", err)
	}

	rec := w.amend(w.teacher, id, `{"status":"absent","marks_obtained":null}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("turning a provisional pupil absent: want 200, got %d (%s)",
			rec.Code, rec.Body.String())
	}
	row := w.client.StudentExamMark.GetX(w.base, id)
	if row.Status != entexammark.StatusAbsent || row.Provisional {
		t.Fatalf("a pupil with no number has no unfinished number, got status=%s provisional=%v",
			row.Status, row.Provisional)
	}

	if err := w.client.StudentExamMark.UpdateOneID(w.markID(w.pupilS2)).
		SetProvisional(true).Exec(w.base); err != nil {
		t.Fatalf("the second seeded mark could not be made provisional: %v", err)
	}
	batch := fmt.Sprintf(
		`{"exam_subject_id":%q,"marks":[{"student_id":%q,"status":"exempt"}]}`,
		w.physicsSubject, w.pupilS2)
	if rec := w.batch(w.teacher, batch); rec.Code != http.StatusOK {
		t.Fatalf("exempting a provisional pupil in bulk: want 200, got %d (%s)",
			rec.Code, rec.Body.String())
	}
	second := w.client.StudentExamMark.GetX(w.base, w.markID(w.pupilS2))
	if second.Status != entexammark.StatusExempt || second.Provisional {
		t.Fatalf("the bulk exemption left status=%s provisional=%v",
			second.Status, second.Provisional)
	}
}
