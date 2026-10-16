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
	entexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/exam"
	entattempt "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examattempt"
	entdelivery "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/examonlinedelivery"
	entcomponentexam "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/resultcomponentexam"
	entexammark "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentexammark"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type onlineAuthorGuard struct{}

func (onlineAuthorGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.TimetableRead, authorization.TimetableWrite, authorization.TimetableDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTeacherAssignment,
			HasReach: true,
			Rule:     "online test author guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (onlineAuthorGuard) Name() string { return "online test author guard" }

type onlinePupilGuard struct{}

func (onlinePupilGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.TimetableRead, authorization.TimetableWrite:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachSelf,
			HasReach: true,
			Rule:     "online test pupil guard",
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (onlinePupilGuard) Name() string { return "online test pupil guard" }

type onlineWorld struct {
	t   *testing.T
	db  *testsupport.TenantDB
	ctx context.Context

	author *Server
	pupil  *Server

	authorCtx context.Context
	pupilCtx  context.Context
	peerCtx   context.Context

	sessionID  uuid.UUID
	branchID   uuid.UUID
	offeringID uuid.UUID

	examID    uuid.UUID
	subjectID uuid.UUID

	studentID uuid.UUID
	peerID    uuid.UUID

	opensAt  time.Time
	closesAt time.Time
}

func newOnlineWorld(t *testing.T) *onlineWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	term := time.Date(2026, time.April, 6, 0, 0, 0, 0, time.UTC)

	branch := client.Branch.Create().
		SetName("Online Campus " + tag).
		SetCode("OLB-" + tag).
		SaveX(ctx)

	session := client.AcademicSession.Create().
		SetName("Online Session " + tag).
		SetCode("OLS-" + tag).
		SetStartDate(time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC)).
		SetEndDate(time.Date(2027, time.March, 31, 0, 0, 0, 0, time.UTC)).
		SetIsCurrent(true).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("VIII " + tag).
		SetCode("OLG-" + tag).
		SetSequence(8).
		SaveX(ctx)

	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").
		SetCode("OLA-" + tag).
		SaveX(ctx)

	subject := client.Subject.Create().
		SetName("Geography " + tag).
		SetCode("OLJ-" + tag).
		SaveX(ctx)

	offering := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).
		SetSectionID(section.ID).
		SetSubjectID(subject.ID).
		SaveX(ctx)

	teacherCAS := uuid.New()
	teacherPerson := client.Person.Create().
		SetCasUserID(teacherCAS).
		SetFirstName("Online").
		SetDisplayName("Online Teacher " + tag).
		SaveX(ctx)
	teacherStaff := client.Staff.Create().
		SetPersonID(teacherPerson.ID).
		SetEmployeeCode("OLT-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().SetStaffID(teacherStaff.ID).SaveX(ctx)

	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(section.ID).
		SetSubjectOfferingID(offering.ID).
		SetRoleType("subject_teacher").
		SetIsPrimary(true).
		SaveX(ctx)

	newPupil := func(name, code string) (uuid.UUID, uuid.UUID) {
		cas := uuid.New()
		person := client.Person.Create().
			SetCasUserID(cas).
			SetFirstName(name).
			SetDisplayName(name + " " + tag).
			SaveX(ctx)
		student := client.Student.Create().
			SetPersonID(person.ID).
			SetAdmissionNumber(code + "-" + tag).
			SaveX(ctx)
		enrollment := client.StudentEnrollment.Create().
			SetStudentID(student.ID).
			SetAcademicSessionID(session.ID).
			SetSectionID(section.ID).
			SetEnrollmentDate(term).
			SaveX(ctx)
		client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrollment.ID).
			SetSubjectOfferingID(offering.ID).
			SetStudentID(student.ID).
			SetAcademicSessionID(session.ID).
			SaveX(ctx)
		return student.ID, cas
	}
	studentID, studentCAS := newPupil("Asha", "OLADM1")
	peerID, peerCAS := newPupil("Bimal", "OLADM2")

	exam := client.Exam.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetName("Chapter Two Online " + tag).
		SetCode("OLE-" + tag).
		SetDelivery(entexam.DeliveryOnline).
		SetStatus(entexam.StatusPublished).
		SaveX(ctx)

	examSubject := client.ExamSubject.Create().
		SetExamID(exam.ID).
		SetSubjectOfferingID(offering.ID).
		SetMaximumMarks(10).
		SaveX(ctx)

	base := postgres.WithConn(ctx, &postgres.TenantConn{Client: client})
	subjectCtx := func(cas uuid.UUID) context.Context {
		return authorization.WithSubject(base, &authorization.Subject{CASUserID: cas})
	}

	w := &onlineWorld{
		t:          t,
		db:         db,
		ctx:        base,
		author:     &Server{guard: onlineAuthorGuard{}},
		pupil:      &Server{guard: onlinePupilGuard{}},
		authorCtx:  subjectCtx(teacherCAS),
		pupilCtx:   subjectCtx(studentCAS),
		peerCtx:    subjectCtx(peerCAS),
		sessionID:  session.ID,
		branchID:   branch.ID,
		offeringID: offering.ID,
		examID:     exam.ID,
		subjectID:  examSubject.ID,
		studentID:  studentID,
		peerID:     peerID,
		opensAt:    nowUTC().Add(-time.Hour),
		closesAt:   nowUTC().Add(2 * time.Hour),
	}

	w.requireGenuineScopes()
	db.Forget()
	return w
}

func (w *onlineWorld) requireGenuineScopes() {
	w.t.Helper()

	author, decision, err := w.author.scopeFor(w.authorCtx,
		authorization.TimetableWrite, authorization.TimetableWriteAll)
	if err != nil {
		w.t.Fatalf("the author could not be resolved against the tenant database: %v", err)
	}
	if author.Unrestricted {
		w.t.Fatal("an unrestricted author would reach every paper and prove nothing about scoping")
	}
	if len(author.SubjectOfferingIDs) != 1 || author.SubjectOfferingIDs[0] != w.offeringID {
		w.t.Fatalf("the author must carry exactly the seeded offering %s, got %v",
			w.offeringID, author.SubjectOfferingIDs)
	}
	if decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the author decision must carry a teacher-assignment reach, got %+v", decision)
	}

	pupil, pupilDecision, err := w.pupil.scopeFor(w.pupilCtx,
		authorization.TimetableRead, authorization.TimetableReadAll)
	if err != nil {
		w.t.Fatalf("the pupil could not be resolved against the tenant database: %v", err)
	}
	if pupil.Unrestricted {
		w.t.Fatal("an unrestricted pupil would reach every attempt and prove nothing")
	}
	if len(pupil.StudentIDs) != 1 || pupil.StudentIDs[0] != w.studentID {
		w.t.Fatalf("the pupil must resolve to the seeded pupil %s, got %v",
			w.studentID, pupil.StudentIDs)
	}
	if len(pupil.SubjectOfferingIDs) != 0 {
		w.t.Fatalf("a pupil must hold no taught offerings, got %v", pupil.SubjectOfferingIDs)
	}
	if pupilDecision.Reach != authorization.ReachSelf {
		w.t.Fatalf("the pupil decision must carry a self reach, got %+v", pupilDecision)
	}
}

func (w *onlineWorld) call(server *Server, base context.Context,
	handler http.HandlerFunc, method, target, body string, params map[string]string) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	for name, value := range params {
		route.URLParams.Add(name, value)
	}
	ctx := context.WithValue(base, chi.RouteCtxKey, route)

	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("{}")
	} else {
		reader = strings.NewReader(body)
	}

	rec := httptest.NewRecorder()
	request := httptest.NewRequest(method, target, reader)
	handler(rec, request.WithContext(ctx))
	return rec
}

func (w *onlineWorld) setWindow(body string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.author, w.authorCtx, w.author.setOnlineTestWindow,
		http.MethodPut, "/api/v1/online-tests/"+w.subjectID.String(), body,
		map[string]string{"id": w.subjectID.String()})
}

func (w *onlineWorld) openWindow() {
	w.t.Helper()

	body := fmt.Sprintf(`{"opens_at":%q,"closes_at":%q}`,
		w.opensAt.Format(time.RFC3339), w.closesAt.Format(time.RFC3339))
	if rec := w.setWindow(body); rec.Code != http.StatusCreated {
		w.t.Fatalf("the window was not set: %d %s", rec.Code, rec.Body.String())
	}
}

func (w *onlineWorld) addQuestion(body string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.author, w.authorCtx, w.author.createOnlineTestQuestion,
		http.MethodPost, "/api/v1/online-tests/"+w.subjectID.String()+"/questions", body,
		map[string]string{"id": w.subjectID.String()})
}

type createdQuestion struct {
	Question struct {
		ID      uuid.UUID `json:"id"`
		Kind    string    `json:"kind"`
		Options []struct {
			ID        uuid.UUID `json:"id"`
			Body      string    `json:"body"`
			IsCorrect bool      `json:"is_correct"`
		} `json:"options"`
	} `json:"question"`
}

func (w *onlineWorld) addedQuestion(body string) createdQuestion {
	w.t.Helper()

	rec := w.addQuestion(body)
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("the question was not created: %d %s", rec.Code, rec.Body.String())
	}
	var out createdQuestion
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		w.t.Fatalf("the created question was not JSON: %v (%s)", err, rec.Body.String())
	}
	return out
}

func (w *onlineWorld) objectiveQuestion(position int, prompt string, value float64) createdQuestion {
	w.t.Helper()

	return w.addedQuestion(fmt.Sprintf(
		`{"position":%d,"kind":"single_choice","prompt":%q,"marks":%g,"options":[
			{"body":"Kolkata","is_correct":false},
			{"body":"Delhi","is_correct":true},
			{"body":"Chennai","is_correct":false}]}`, position, prompt, value))
}

func (w *onlineWorld) writtenQuestion(position int, prompt string, value float64) createdQuestion {
	w.t.Helper()

	return w.addedQuestion(fmt.Sprintf(
		`{"position":%d,"kind":"free_text","prompt":%q,"marks":%g}`, position, prompt, value))
}

func (w *onlineWorld) correctOption(q createdQuestion) uuid.UUID {
	w.t.Helper()

	for _, option := range q.Question.Options {
		if option.IsCorrect {
			return option.ID
		}
	}
	w.t.Fatalf("the seeded question has no correct option: %+v", q)
	return uuid.Nil
}

func (w *onlineWorld) wrongOption(q createdQuestion) uuid.UUID {
	w.t.Helper()

	for _, option := range q.Question.Options {
		if !option.IsCorrect {
			return option.ID
		}
	}
	w.t.Fatalf("the seeded question has no incorrect option: %+v", q)
	return uuid.Nil
}

func (w *onlineWorld) publish() *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.author, w.authorCtx, w.author.publishOnlineTest,
		http.MethodPost, "/api/v1/online-tests/"+w.subjectID.String()+"/publish", "",
		map[string]string{"id": w.subjectID.String()})
}

func (w *onlineWorld) published() {
	w.t.Helper()

	if rec := w.publish(); rec.Code != http.StatusOK {
		w.t.Fatalf("the test was not published: %d %s", rec.Code, rec.Body.String())
	}
}

func (w *onlineWorld) paper(base context.Context, server *Server) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(server, base, server.getOnlineTestPaper,
		http.MethodGet, "/api/v1/online-tests/"+w.subjectID.String()+"/paper", "",
		map[string]string{"id": w.subjectID.String()})
}

func (w *onlineWorld) answerKey(base context.Context, server *Server) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(server, base, server.listOnlineTestQuestions,
		http.MethodGet, "/api/v1/online-tests/"+w.subjectID.String()+"/questions", "",
		map[string]string{"id": w.subjectID.String()})
}

func (w *onlineWorld) startAttempt(base context.Context, server *Server) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(server, base, server.startOnlineTestAttempt,
		http.MethodPost, "/api/v1/online-tests/"+w.subjectID.String()+"/attempts", "",
		map[string]string{"id": w.subjectID.String()})
}

func (w *onlineWorld) startedAttempt(base context.Context, server *Server) uuid.UUID {
	w.t.Helper()

	rec := w.startAttempt(base, server)
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("the attempt was not started: %d %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Attempt struct {
			ID uuid.UUID `json:"id"`
		} `json:"attempt"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("the started attempt was not JSON: %v (%s)", err, rec.Body.String())
	}
	return body.Attempt.ID
}

func (w *onlineWorld) saveAnswers(base context.Context, server *Server,
	attempt uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(server, base, server.saveOnlineTestResponses,
		http.MethodPut, "/api/v1/online-test-attempts/"+attempt.String()+"/responses", body,
		map[string]string{"id": attempt.String()})
}

func (w *onlineWorld) submit(base context.Context, server *Server,
	attempt uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(server, base, server.submitOnlineTestAttempt,
		http.MethodPost, "/api/v1/online-test-attempts/"+attempt.String()+"/submit", "",
		map[string]string{"id": attempt.String()})
}

func (w *onlineWorld) readAttempt(base context.Context, server *Server,
	attempt uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(server, base, server.getOnlineTestAttempt,
		http.MethodGet, "/api/v1/online-test-attempts/"+attempt.String(), "",
		map[string]string{"id": attempt.String()})
}

func (w *onlineWorld) award(attempt uuid.UUID, responseID uuid.UUID,
	value float64) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.author, w.authorCtx, w.author.awardOnlineTestResponse,
		http.MethodPatch, "/api/v1/online-test-responses/"+responseID.String(),
		fmt.Sprintf(`{"awarded_marks":%g}`, value),
		map[string]string{"id": responseID.String()})
}

func (w *onlineWorld) responsesOf(attempt uuid.UUID) []sittableResponse {
	w.t.Helper()

	rec := w.readAttempt(w.authorCtx, w.author, attempt)
	if rec.Code != http.StatusOK {
		w.t.Fatalf("the attempt could not be read: %d %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Responses []sittableResponse `json:"responses"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("the attempt was not JSON: %v (%s)", err, rec.Body.String())
	}
	return body.Responses
}

func (w *onlineWorld) attemptRow(id uuid.UUID) *tenantent.ExamAttempt {
	w.t.Helper()

	row, err := w.db.Client.ExamAttempt.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("the attempt %s could not be read back: %v", id, err)
	}
	return row
}

func (w *onlineWorld) markRow(student uuid.UUID) *tenantent.StudentExamMark {
	w.t.Helper()

	row, err := w.db.Client.StudentExamMark.Query().
		Where(entexammark.ExamSubjectID(w.subjectID), entexammark.StudentID(student)).
		Only(context.Background())
	if err != nil {
		w.t.Fatalf("no exam mark was written for pupil %s: %v", student, err)
	}
	return row
}

func (w *onlineWorld) marksExist(student uuid.UUID) bool {
	w.t.Helper()

	found, err := w.db.Client.StudentExamMark.Query().
		Where(entexammark.ExamSubjectID(w.subjectID), entexammark.StudentID(student)).
		Exist(context.Background())
	if err != nil {
		w.t.Fatalf("the exam marks could not be counted: %v", err)
	}
	return found
}

func (w *onlineWorld) readyPaper() (createdQuestion, createdQuestion) {
	w.t.Helper()

	w.openWindow()
	objective := w.objectiveQuestion(1, "Which city is the capital of India?", 6)
	written := w.writtenQuestion(2, "Explain why capitals move.", 4)
	w.published()
	return objective, written
}

func TestAnExamKeepsItsPaperDeliveryUnlessItIsToldOtherwise(t *testing.T) {
	w := newOnlineWorld(t)

	row := w.db.Client.Exam.Create().
		SetAcademicSessionID(w.sessionID).
		SetBranchID(w.branchID).
		SetName("Quiet Paper Exam").
		SetCode("OLQ-" + uuid.NewString()[:8]).
		SaveX(context.Background())

	if row.Delivery != entexam.DeliveryInPerson {
		t.Fatalf("an exam written by a path that never mentions delivery reads back as %q "+
			"rather than in_person", row.Delivery)
	}
}

func TestAnOnlineTestWillNotPublishUntilItsQuestionsAddUp(t *testing.T) {
	w := newOnlineWorld(t)
	w.openWindow()

	if rec := w.publish(); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a test with no questions must not publish, got %d: %s",
			rec.Code, rec.Body.String())
	}

	w.objectiveQuestion(1, "Which city is the capital of India?", 6)

	rec := w.publish()
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a paper carrying 6 of its 10 marks must not publish, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "add up to 6") {
		t.Fatalf("the refusal must name the shortfall, got %s", rec.Body.String())
	}

	w.writtenQuestion(2, "Explain why capitals move.", 4)
	w.published()

	row, err := w.db.Client.ExamOnlineDelivery.Query().
		Where(entdelivery.ExamSubjectID(w.subjectID)).
		Only(context.Background())
	if err != nil {
		t.Fatalf("the published delivery could not be read back: %v", err)
	}
	if row.Status != entdelivery.StatusPublished {
		t.Fatalf("the delivery must read back as published, got %q", row.Status)
	}
	if row.PublishedAt == nil {
		t.Fatal("a published test must record when it was published")
	}
}

func TestAnOnlineTestRefusesAQuestionThatNamesTwoCorrectOptions(t *testing.T) {
	w := newOnlineWorld(t)
	w.openWindow()

	rec := w.addQuestion(`{"position":1,"kind":"single_choice","prompt":"Pick one","marks":10,
		"options":[{"body":"Delhi","is_correct":true},{"body":"Kolkata","is_correct":true}]}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a single-choice question with two correct options must be refused, got %d: %s",
			rec.Code, rec.Body.String())
	}

	count, err := w.db.Client.ExamQuestion.Query().Count(context.Background())
	if err != nil {
		t.Fatalf("the questions could not be counted: %v", err)
	}
	if count != 0 {
		t.Fatalf("a refused question must not be written, found %d rows", count)
	}
}

func TestAPupilNeverReadsTheCorrectAnswer(t *testing.T) {
	w := newOnlineWorld(t)
	objective, _ := w.readyPaper()
	correct := w.correctOption(objective)

	rec := w.paper(w.pupilCtx, w.pupil)
	if rec.Code != http.StatusOK {
		t.Fatalf("an enrolled pupil must be able to read the paper, got %d: %s",
			rec.Code, rec.Body.String())
	}

	body := rec.Body.String()
	if strings.Contains(body, "is_correct") {
		t.Fatalf("the paper handed to a pupil must not mention is_correct at all, got %s", body)
	}
	if !strings.Contains(body, correct.String()) {
		t.Fatalf("the paper must still offer the correct option as a choice, got %s", body)
	}
	if !strings.Contains(body, "Which city is the capital of India?") {
		t.Fatalf("the paper must carry the prompt, got %s", body)
	}

	key := w.answerKey(w.pupilCtx, w.pupil)
	if key.Code == http.StatusOK {
		t.Fatalf("a pupil must not reach the answer key, got 200: %s", key.Body.String())
	}
	if strings.Contains(key.Body.String(), "is_correct") {
		t.Fatalf("the refusal to a pupil must not leak the key, got %d: %s",
			key.Code, key.Body.String())
	}

	author := w.answerKey(w.authorCtx, w.author)
	if author.Code != http.StatusOK {
		t.Fatalf("the teacher who wrote the paper must reach the answer key, got %d: %s",
			author.Code, author.Body.String())
	}
	if !strings.Contains(author.Body.String(), "is_correct") {
		t.Fatalf("the answer key must say which option is correct, got %s", author.Body.String())
	}
}

func TestAPupilNeverReadsAnotherPupilsAttempt(t *testing.T) {
	w := newOnlineWorld(t)
	objective, _ := w.readyPaper()

	mine := w.startedAttempt(w.pupilCtx, w.pupil)
	if rec := w.saveAnswers(w.pupilCtx, w.pupil, mine, fmt.Sprintf(
		`{"responses":[{"exam_question_id":%q,"selected_option_id":%q}]}`,
		objective.Question.ID, w.correctOption(objective))); rec.Code != http.StatusOK {
		t.Fatalf("a pupil must be able to save their own answer, got %d: %s",
			rec.Code, rec.Body.String())
	}

	if rec := w.readAttempt(w.pupilCtx, w.pupil, mine); rec.Code != http.StatusOK {
		t.Fatalf("a pupil must be able to read their own attempt, got %d: %s",
			rec.Code, rec.Body.String())
	}

	rec := w.readAttempt(w.peerCtx, w.pupil, mine)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("a pupil reading another pupil's attempt must be refused, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), objective.Question.ID.String()) {
		t.Fatalf("the refusal must not leak the answers, got %s", rec.Body.String())
	}

	saved := w.saveAnswers(w.peerCtx, w.pupil, mine, fmt.Sprintf(
		`{"responses":[{"exam_question_id":%q,"selected_option_id":%q}]}`,
		objective.Question.ID, w.wrongOption(objective)))
	if saved.Code != http.StatusNotFound {
		t.Fatalf("a pupil writing into another pupil's attempt must be refused, got %d: %s",
			saved.Code, saved.Body.String())
	}

	stolen := w.submit(w.peerCtx, w.pupil, mine)
	if stolen.Code != http.StatusNotFound {
		t.Fatalf("a pupil handing in another pupil's attempt must be refused, got %d: %s",
			stolen.Code, stolen.Body.String())
	}
	if w.attemptRow(mine).Status != entattempt.StatusInProgress {
		t.Fatal("a refused hand-in must leave the attempt in progress")
	}
}

func TestAPracticeOnlineTestStillSavesItsMarks(t *testing.T) {
	w := newOnlineWorld(t)

	if err := w.db.Client.Exam.UpdateOneID(w.examID).
		SetAssessmentKind(entexam.AssessmentKindPractice).
		Exec(context.Background()); err != nil {
		t.Fatalf("the exam could not be made a practice test: %v", err)
	}

	objective, _ := w.readyPaper()
	attempt := w.startedAttempt(w.pupilCtx, w.pupil)

	if rec := w.saveAnswers(w.pupilCtx, w.pupil, attempt, fmt.Sprintf(
		`{"responses":[{"exam_question_id":%q,"selected_option_id":%q}]}`,
		objective.Question.ID, w.correctOption(objective))); rec.Code != http.StatusOK {
		t.Fatalf("the answer was not saved: %d %s", rec.Code, rec.Body.String())
	}
	if rec := w.submit(w.pupilCtx, w.pupil, attempt); rec.Code != http.StatusOK {
		t.Fatalf("the practice attempt was not accepted: %d %s", rec.Code, rec.Body.String())
	}

	mark := w.markRow(w.studentID)
	if mark.Status != entexammark.StatusMarked {
		t.Fatalf("a practice test's mark is still a mark, got status %q", mark.Status)
	}
	if mark.MarksObtained == nil || *mark.MarksObtained != 6 {
		t.Fatalf("the practice mark must carry the 6 auto-marked marks, got %v",
			mark.MarksObtained)
	}

	exam, err := w.db.Client.Exam.Get(context.Background(), w.examID)
	if err != nil {
		t.Fatalf("the exam could not be read back: %v", err)
	}
	if exam.AssessmentKind != entexam.AssessmentKindPractice {
		t.Fatalf("the exam must still be practice, got %q", exam.AssessmentKind)
	}

	linked, err := w.db.Client.ResultComponentExam.Query().
		Where(entcomponentexam.ExamID(w.examID)).
		Count(context.Background())
	if err != nil {
		t.Fatalf("the result component links could not be counted: %v", err)
	}
	if linked != 0 {
		t.Fatalf("marking a practice test must not link it into a result, found %d links", linked)
	}
}

func TestAWrongAnswerScoresNothingAndAWrittenAnswerWaitsForATeacher(t *testing.T) {
	w := newOnlineWorld(t)
	objective, written := w.readyPaper()

	attempt := w.startedAttempt(w.pupilCtx, w.pupil)
	if rec := w.saveAnswers(w.pupilCtx, w.pupil, attempt, fmt.Sprintf(
		`{"responses":[
			{"exam_question_id":%q,"selected_option_id":%q},
			{"exam_question_id":%q,"answer_text":"Because trade routes move."}]}`,
		objective.Question.ID, w.wrongOption(objective),
		written.Question.ID)); rec.Code != http.StatusOK {
		t.Fatalf("the answers were not saved: %d %s", rec.Code, rec.Body.String())
	}
	if rec := w.submit(w.pupilCtx, w.pupil, attempt); rec.Code != http.StatusOK {
		t.Fatalf("the attempt was not accepted: %d %s", rec.Code, rec.Body.String())
	}

	row := w.attemptRow(attempt)
	if row.AwardedMarks == nil || *row.AwardedMarks != 0 {
		t.Fatalf("a wrong choice earns nothing, got %v", row.AwardedMarks)
	}
	if !row.AwaitingReview {
		t.Fatal("an attempt carrying a written answer must be flagged for a teacher")
	}

	mark := w.markRow(w.studentID)
	if mark.Remarks == nil || !strings.Contains(*mark.Remarks, "provisional") {
		t.Fatalf("a half-marked attempt must say its mark is provisional, got %v", mark.Remarks)
	}
	if !mark.Provisional {
		t.Fatal("a half-marked attempt leaves a provisional mark, and prose is not a flag")
	}
	if mark.MarkedBy != nil {
		t.Fatalf("a machine-marked mark names no marker, got %v", mark.MarkedBy)
	}

	var pending uuid.UUID
	for _, response := range w.responsesOf(attempt) {
		if response.ExamQuestionID == written.Question.ID {
			if response.Marking != "unmarked" {
				t.Fatalf("a written answer must be left unmarked, got %q", response.Marking)
			}
			pending = response.ID
		}
		if response.ExamQuestionID == objective.Question.ID {
			if response.Marking != "automatic" {
				t.Fatalf("a chosen option must be marked automatically, got %q", response.Marking)
			}
			if response.AwardedMarks == nil || *response.AwardedMarks != 0 {
				t.Fatalf("a wrong choice earns nothing, got %v", response.AwardedMarks)
			}
		}
	}
	if pending == uuid.Nil {
		t.Fatal("the written answer was not found among the responses")
	}

	if rec := w.award(attempt, pending, 3); rec.Code != http.StatusOK {
		t.Fatalf("the teacher could not award the written answer: %d %s",
			rec.Code, rec.Body.String())
	}

	settled := w.attemptRow(attempt)
	if settled.AwaitingReview {
		t.Fatal("once every answer is marked the attempt no longer awaits a teacher")
	}
	if settled.AwardedMarks == nil || *settled.AwardedMarks != 3 {
		t.Fatalf("the attempt must now carry 3 marks, got %v", settled.AwardedMarks)
	}

	final := w.markRow(w.studentID)
	if final.MarksObtained == nil || *final.MarksObtained != 3 {
		t.Fatalf("the exam mark must follow the attempt to 3, got %v", final.MarksObtained)
	}
	if final.Remarks != nil {
		t.Fatalf("a fully marked attempt leaves no provisional remark, got %q", *final.Remarks)
	}
	if final.Provisional {
		t.Fatal("awarding the last answer settles the mark; it may no longer read as provisional")
	}
}

func TestAnAwardBeyondTheQuestionIsRefused(t *testing.T) {
	w := newOnlineWorld(t)
	objective, written := w.readyPaper()

	attempt := w.startedAttempt(w.pupilCtx, w.pupil)
	w.saveAnswers(w.pupilCtx, w.pupil, attempt, fmt.Sprintf(
		`{"responses":[
			{"exam_question_id":%q,"selected_option_id":%q},
			{"exam_question_id":%q,"answer_text":"Trade."}]}`,
		objective.Question.ID, w.correctOption(objective), written.Question.ID))
	w.submit(w.pupilCtx, w.pupil, attempt)

	var pending uuid.UUID
	for _, response := range w.responsesOf(attempt) {
		if response.ExamQuestionID == written.Question.ID {
			pending = response.ID
		}
	}

	rec := w.award(attempt, pending, 9)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("awarding 9 for a question worth 4 must be refused, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "4") {
		t.Fatalf("the refusal must name what the question carries, got %s", rec.Body.String())
	}
}

func TestAPupilCannotSitATestThatWasNeverPublished(t *testing.T) {
	w := newOnlineWorld(t)
	w.openWindow()
	w.objectiveQuestion(1, "Which city is the capital of India?", 10)

	if rec := w.paper(w.pupilCtx, w.pupil); rec.Code != http.StatusForbidden {
		t.Fatalf("a draft test must not be readable by a pupil, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if rec := w.startAttempt(w.pupilCtx, w.pupil); rec.Code != http.StatusForbidden {
		t.Fatalf("a draft test must not be attemptable, got %d: %s",
			rec.Code, rec.Body.String())
	}
	if w.marksExist(w.studentID) {
		t.Fatal("a test that was never sat must leave no mark behind")
	}
}

func TestASecondAttemptIsRefusedWhenOnlyOneIsAllowed(t *testing.T) {
	w := newOnlineWorld(t)
	objective, written := w.readyPaper()

	first := w.startedAttempt(w.pupilCtx, w.pupil)
	w.saveAnswers(w.pupilCtx, w.pupil, first, fmt.Sprintf(
		`{"responses":[
			{"exam_question_id":%q,"selected_option_id":%q},
			{"exam_question_id":%q,"answer_text":""}]}`,
		objective.Question.ID, w.correctOption(objective), written.Question.ID))
	if rec := w.submit(w.pupilCtx, w.pupil, first); rec.Code != http.StatusOK {
		t.Fatalf("the first attempt was not accepted: %d %s", rec.Code, rec.Body.String())
	}

	rec := w.startAttempt(w.pupilCtx, w.pupil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("a second attempt at a one-attempt test must be refused, got %d: %s",
			rec.Code, rec.Body.String())
	}

	count, err := w.db.Client.ExamAttempt.Query().Count(context.Background())
	if err != nil {
		t.Fatalf("the attempts could not be counted: %v", err)
	}
	if count != 1 {
		t.Fatalf("a refused attempt must not be written, found %d rows", count)
	}
}

func TestAnUnansweredWrittenQuestionNeedsNoTeacher(t *testing.T) {
	w := newOnlineWorld(t)
	objective, _ := w.readyPaper()

	attempt := w.startedAttempt(w.pupilCtx, w.pupil)
	w.saveAnswers(w.pupilCtx, w.pupil, attempt, fmt.Sprintf(
		`{"responses":[{"exam_question_id":%q,"selected_option_id":%q}]}`,
		objective.Question.ID, w.correctOption(objective)))
	if rec := w.submit(w.pupilCtx, w.pupil, attempt); rec.Code != http.StatusOK {
		t.Fatalf("the attempt was not accepted: %d %s", rec.Code, rec.Body.String())
	}

	row := w.attemptRow(attempt)
	if row.AwaitingReview {
		t.Fatal("a question the pupil never answered needs no teacher")
	}
	if row.AwardedMarks == nil || *row.AwardedMarks != 6 {
		t.Fatalf("the correct choice must earn its 6 marks, got %v", row.AwardedMarks)
	}

	mark := w.markRow(w.studentID)
	if mark.Remarks != nil {
		t.Fatalf("a settled mark carries no provisional remark, got %q", *mark.Remarks)
	}
	if mark.Provisional {
		t.Fatal("nothing awaits a teacher, so the mark is final")
	}
	if mark.MarksObtained == nil || *mark.MarksObtained != 6 {
		t.Fatalf("the exam mark must carry 6, got %v", mark.MarksObtained)
	}
}

func TestTheOnlineTestRouteBlockMountsBesideTheExamRoutes(t *testing.T) {
	s := &Server{guard: onlineAuthorGuard{}}

	defer func() {
		if panicked := recover(); panicked != nil {
			t.Fatalf("the online test routes clash with the exam routes already mounted: %v",
				panicked)
		}
	}()

	r := chi.NewRouter()
	s.mountExams(r)
	s.mountExamMarks(r)
	s.mountOnlineTests(r)

	wanted := map[string][]string{
		"/online-tests/{id}":                   {http.MethodGet, http.MethodPut},
		"/online-tests/{id}/publish":           {http.MethodPost},
		"/online-tests/{id}/close":             {http.MethodPost},
		"/online-tests/{id}/questions":         {http.MethodGet, http.MethodPost},
		"/online-tests/{id}/paper":             {http.MethodGet},
		"/online-tests/{id}/attempts":          {http.MethodGet, http.MethodPost},
		"/online-test-questions/{id}":          {http.MethodPatch, http.MethodDelete},
		"/online-test-attempts/{id}":           {http.MethodGet},
		"/online-test-attempts/{id}/responses": {http.MethodPut},
		"/online-test-attempts/{id}/submit":    {http.MethodPost},
		"/online-test-responses/{id}":          {http.MethodPatch},
	}

	for route, methods := range wanted {
		for _, method := range methods {
			ctx := chi.NewRouteContext()
			if !r.Match(ctx, method, strings.ReplaceAll(route, "{id}", uuid.NewString())) {
				t.Errorf("%s %s is not mounted", method, route)
			}
		}
	}
}

func (w *onlineWorld) readyPaperAllowing(attempts int) (createdQuestion, createdQuestion) {
	w.t.Helper()

	body := fmt.Sprintf(`{"opens_at":%q,"closes_at":%q,"attempts_allowed":%d}`,
		w.opensAt.Format(time.RFC3339), w.closesAt.Format(time.RFC3339), attempts)
	if rec := w.setWindow(body); rec.Code != http.StatusCreated {
		w.t.Fatalf("the window was not set: %d %s", rec.Code, rec.Body.String())
	}
	objective := w.objectiveQuestion(1, "Which city is the capital of India?", 6)
	written := w.writtenQuestion(2, "Explain why capitals move.", 4)
	w.published()
	return objective, written
}

func (w *onlineWorld) pendingResponse(attempt, question uuid.UUID) uuid.UUID {
	w.t.Helper()

	for _, row := range w.responsesOf(attempt) {
		if row.ExamQuestionID == question {
			return row.ID
		}
	}
	w.t.Fatalf("attempt %s carries no answer to question %s", attempt, question)
	return uuid.Nil
}

func (w *onlineWorld) requireFlagsAgree(student uuid.UUID, moment string) {
	w.t.Helper()

	awaiting, err := w.db.Client.ExamAttempt.Query().
		Where(
			entattempt.ExamSubjectID(w.subjectID),
			entattempt.StudentID(student),
			entattempt.StatusNEQ(entattempt.StatusInProgress),
			entattempt.AwaitingReview(true),
		).
		Exist(context.Background())
	if err != nil {
		w.t.Fatalf("the attempts awaiting a teacher could not be counted: %v", err)
	}

	mark := w.markRow(student)
	if mark.Provisional != awaiting {
		w.t.Fatalf("%s: the mark reads provisional=%v while awaiting_review over the attempts is %v; "+
			"the two signals have drifted", moment, mark.Provisional, awaiting)
	}
	if (mark.Remarks != nil) != mark.Provisional {
		w.t.Fatalf("%s: the prose and the flag disagree, provisional=%v remarks=%v",
			moment, mark.Provisional, mark.Remarks)
	}
}

func (w *onlineWorld) sitAttempt(objective, written createdQuestion, option uuid.UUID) uuid.UUID {
	w.t.Helper()

	attempt := w.startedAttempt(w.pupilCtx, w.pupil)
	if rec := w.saveAnswers(w.pupilCtx, w.pupil, attempt, fmt.Sprintf(
		`{"responses":[
			{"exam_question_id":%q,"selected_option_id":%q},
			{"exam_question_id":%q,"answer_text":"Because trade routes move."}]}`,
		objective.Question.ID, option, written.Question.ID)); rec.Code != http.StatusOK {
		w.t.Fatalf("the answers were not saved: %d %s", rec.Code, rec.Body.String())
	}
	if rec := w.submit(w.pupilCtx, w.pupil, attempt); rec.Code != http.StatusOK {
		w.t.Fatalf("the attempt was not accepted: %d %s", rec.Code, rec.Body.String())
	}
	return attempt
}

func TestAMarkIsProvisionalWhileAnyAttemptStillAwaitsATeacher(t *testing.T) {
	w := newOnlineWorld(t)
	objective, written := w.readyPaperAllowing(2)

	first := w.sitAttempt(objective, written, w.correctOption(objective))
	w.requireFlagsAgree(w.studentID, "the first attempt was handed in")
	if !w.markRow(w.studentID).Provisional {
		t.Fatal("a written answer nobody has read yet leaves the mark provisional")
	}

	if rec := w.award(first, w.pendingResponse(first, written.Question.ID), 4); rec.Code != http.StatusOK {
		t.Fatalf("the teacher could not award the first written answer: %d %s",
			rec.Code, rec.Body.String())
	}
	w.requireFlagsAgree(w.studentID, "the first attempt was fully marked")

	settled := w.markRow(w.studentID)
	if settled.Provisional {
		t.Fatal("nothing awaits a teacher, so the mark is final")
	}
	if settled.MarksObtained == nil || *settled.MarksObtained != 10 {
		t.Fatalf("the first attempt earned 6 + 4, got %v", settled.MarksObtained)
	}

	second := w.sitAttempt(objective, written, w.wrongOption(objective))
	if !w.attemptRow(second).AwaitingReview {
		t.Fatal("the second attempt carries an unread written answer")
	}
	w.requireFlagsAgree(w.studentID, "a second attempt was handed in")

	again := w.markRow(w.studentID)
	if again.MarksObtained == nil || *again.MarksObtained != 10 {
		t.Fatalf("the best attempt still stands at 10, got %v", again.MarksObtained)
	}
	if !again.Provisional {
		t.Fatal("the second attempt could overtake the first once it is read, " +
			"so the mark is not settled while it waits")
	}

	if rec := w.award(second, w.pendingResponse(second, written.Question.ID), 4); rec.Code != http.StatusOK {
		t.Fatalf("the teacher could not award the second written answer: %d %s",
			rec.Code, rec.Body.String())
	}
	w.requireFlagsAgree(w.studentID, "every attempt was fully marked")

	final := w.markRow(w.studentID)
	if final.Provisional {
		t.Fatal("awarding the last answer of the last attempt settles the mark")
	}
	if final.MarksObtained == nil || *final.MarksObtained != 10 {
		t.Fatalf("the first attempt is still the best at 10, got %v", final.MarksObtained)
	}
}
