package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entassignment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignment"
	entsubmission "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmentsubmission"
	enttarget "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/assignmenttarget"
	entpost "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/streampost"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type classroomRouteCase struct {
	method  string
	path    string
	pattern string
	entity  authorization.Entity
}

func classroomRouteTable() []classroomRouteCase {
	return []classroomRouteCase{
		{"GET", "/api/v1/stream-posts", "/api/v1/stream-posts", authorization.StreamPostsRead},
		{"POST", "/api/v1/stream-posts", "/api/v1/stream-posts", authorization.StreamPostsWrite},
		{"GET", "/api/v1/stream-posts/" + probeID, "/api/v1/stream-posts/{id}", authorization.StreamPostsRead},
		{"PATCH", "/api/v1/stream-posts/" + probeID, "/api/v1/stream-posts/{id}", authorization.StreamPostsWrite},
		{"DELETE", "/api/v1/stream-posts/" + probeID, "/api/v1/stream-posts/{id}", authorization.StreamPostsDelete},
		{"GET", "/api/v1/stream-posts/" + probeID + "/comments",
			"/api/v1/stream-posts/{id}/comments", authorization.StreamCommentsRead},
		{"POST", "/api/v1/stream-posts/" + probeID + "/comments",
			"/api/v1/stream-posts/{id}/comments", authorization.StreamCommentsWrite},
		{"PATCH", "/api/v1/stream-comments/" + probeID,
			"/api/v1/stream-comments/{id}", authorization.StreamCommentsWrite},
		{"DELETE", "/api/v1/stream-comments/" + probeID,
			"/api/v1/stream-comments/{id}", authorization.StreamCommentsDelete},

		{"GET", "/api/v1/assignments", "/api/v1/assignments", authorization.AssignmentsRead},
		{"POST", "/api/v1/assignments", "/api/v1/assignments", authorization.AssignmentsWrite},
		{"GET", "/api/v1/assignments/" + probeID, "/api/v1/assignments/{id}", authorization.AssignmentsRead},
		{"PATCH", "/api/v1/assignments/" + probeID, "/api/v1/assignments/{id}", authorization.AssignmentsWrite},
		{"DELETE", "/api/v1/assignments/" + probeID, "/api/v1/assignments/{id}", authorization.AssignmentsDelete},
		{"GET", "/api/v1/assignments/" + probeID + "/items",
			"/api/v1/assignments/{id}/items", authorization.AssignmentsRead},
		{"POST", "/api/v1/assignments/" + probeID + "/items",
			"/api/v1/assignments/{id}/items", authorization.AssignmentsWrite},
		{"PATCH", "/api/v1/assignment-items/" + probeID,
			"/api/v1/assignment-items/{id}", authorization.AssignmentsWrite},
		{"DELETE", "/api/v1/assignment-items/" + probeID,
			"/api/v1/assignment-items/{id}", authorization.AssignmentsDelete},

		{"GET", "/api/v1/assignments/" + probeID + "/submissions",
			"/api/v1/assignments/{id}/submissions", authorization.AssignmentSubmissionsRead},
		{"POST", "/api/v1/assignments/" + probeID + "/submissions",
			"/api/v1/assignments/{id}/submissions", authorization.AssignmentSubmissionsWrite},
		{"GET", "/api/v1/assignment-submissions", "/api/v1/assignment-submissions",
			authorization.AssignmentSubmissionsRead},
		{"GET", "/api/v1/assignment-submissions/" + probeID,
			"/api/v1/assignment-submissions/{id}", authorization.AssignmentSubmissionsRead},
		{"PATCH", "/api/v1/assignment-submissions/" + probeID,
			"/api/v1/assignment-submissions/{id}", authorization.AssignmentSubmissionsWrite},
		{"DELETE", "/api/v1/assignment-submissions/" + probeID,
			"/api/v1/assignment-submissions/{id}", authorization.AssignmentSubmissionsDelete},
		{"GET", "/api/v1/assignment-submissions/" + probeID + "/items",
			"/api/v1/assignment-submissions/{id}/items", authorization.AssignmentSubmissionsRead},
		{"PUT", "/api/v1/assignment-submissions/" + probeID + "/items",
			"/api/v1/assignment-submissions/{id}/items", authorization.AssignmentSubmissionsWrite},
		{"PATCH", "/api/v1/assignment-submission-items/" + probeID,
			"/api/v1/assignment-submission-items/{id}", authorization.AssignmentSubmissionsWrite},
	}
}

func TestEveryClassroomRouteIsGatedByItsOwnEntity(t *testing.T) {
	guard := &recordingGuard{}
	server := &Server{guard: guard}

	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		server.mountStream(r)
		server.mountAssignments(r)
	})

	for _, tc := range classroomRouteTable() {
		t.Run(tc.method+" "+tc.pattern, func(t *testing.T) {
			guard.forget()

			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(probeBody))
			req = req.WithContext(authorization.WithSubject(req.Context(),
				&authorization.Subject{CASUserID: uuid.New()}))

			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			if rec.Code == http.StatusNotFound || rec.Code == http.StatusMethodNotAllowed {
				t.Fatalf("no route is mounted for %s %s (got %d)", tc.method, tc.path, rec.Code)
			}

			probes := guard.taken()
			if len(probes) == 0 {
				t.Fatalf("%s %s reached a handler without consulting the guard", tc.method, tc.path)
			}
			if probes[0].entity != tc.entity {
				t.Fatalf("%s %s must be gated by %s, the guard was asked for %s",
					tc.method, tc.path, tc.entity, probes[0].entity)
			}
			if probes[0].pattern != tc.pattern {
				t.Fatalf("%s %s resolved to the pattern %q, want %q",
					tc.method, tc.path, probes[0].pattern, tc.pattern)
			}
		})
	}
}

func TestClassroomRoutesAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	want := []string{
		"GET /api/v1/stream-posts",
		"POST /api/v1/stream-posts",
		"POST /api/v1/stream-posts/{id}/comments",
		"GET /api/v1/assignments",
		"POST /api/v1/assignments",
		"POST /api/v1/assignments/{id}/submissions",
		"GET /api/v1/assignment-submissions",
		"PATCH /api/v1/assignment-submissions/{id}",
	}

	for _, pattern := range want {
		if !found[pattern] && !found[pattern+"/"] {
			t.Errorf("%s is not mounted on the real router, so the handler is unreachable however well it is tested",
				pattern)
		}
	}
}

type classroomGuard struct {
	reach       authorization.Reach
	constraints [][]authorization.Constraint
}

func (g classroomGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.StreamPostsRead, authorization.StreamPostsWrite, authorization.StreamPostsDelete,
		authorization.StreamCommentsRead, authorization.StreamCommentsWrite, authorization.StreamCommentsDelete,
		authorization.AssignmentsRead, authorization.AssignmentsWrite, authorization.AssignmentsDelete,
		authorization.AssignmentSubmissionsRead, authorization.AssignmentSubmissionsWrite,
		authorization.AssignmentSubmissionsDelete:
		return authorization.Decision{
			Allowed:     true,
			Reach:       g.reach,
			HasReach:    true,
			Constraints: g.constraints,
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (g classroomGuard) Name() string { return "classroom database test guard" }

type classroomWorld struct {
	t  *testing.T
	db *testsupport.TenantDB

	teacher *classroomActor
	pupil   *classroomActor
	mate    *classroomActor
	head    *classroomActor

	sessionID uuid.UUID
	branchID  uuid.UUID
	gradeID   uuid.UUID
	sectionID uuid.UUID
	sectionB  uuid.UUID
	physicsID uuid.UUID
	historyID uuid.UUID
	physicsB  uuid.UUID

	teacherID uuid.UUID
	pupilID   uuid.UUID
	mateID    uuid.UUID

	physicsWork uuid.UUID
	historyWork uuid.UUID

	pupilSubmission uuid.UUID
	mateSubmission  uuid.UUID
}

type classroomActor struct {
	server *Server
	ctx    context.Context
}

func classroomDate(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func newClassroomWorld(t *testing.T) *classroomWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	w := &classroomWorld{t: t, db: db}

	session := client.AcademicSession.Create().
		SetName("Classroom Probe " + tag).
		SetCode("CLP-" + tag).
		SetStartDate(classroomDate(2026, time.April, 1)).
		SetEndDate(classroomDate(2027, time.March, 31)).
		SetIsCurrent(true).
		SaveX(ctx)
	w.sessionID = session.ID

	branch := client.Branch.Create().
		SetName("Classroom Campus " + tag).SetCode("CLB-" + tag).SaveX(ctx)
	w.branchID = branch.ID

	grade := client.GradeLevel.Create().
		SetName("XI").SetCode("CLG-" + tag).SetSequence(11).SaveX(ctx)
	w.gradeID = grade.ID

	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").SetCode("CLS-" + tag).
		SaveX(ctx)
	w.sectionID = section.ID

	physicsSubject := client.Subject.Create().
		SetName("Physics " + tag).SetCode("CPH-" + tag).SaveX(ctx)
	historySubject := client.Subject.Create().
		SetName("History " + tag).SetCode("CHI-" + tag).SaveX(ctx)

	physics := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).SetSectionID(section.ID).
		SetSubjectID(physicsSubject.ID).SaveX(ctx)
	history := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).SetSectionID(section.ID).
		SetSubjectID(historySubject.ID).SaveX(ctx)
	w.physicsID, w.historyID = physics.ID, history.ID

	teacherPerson := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Physics").SetDisplayName("Physics Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(teacherPerson.ID).SetBranchID(branch.ID).
		SetEmployeeCode("CEM-" + tag).SaveX(ctx)
	teacher := client.Teacher.Create().
		SetStaffID(staff.ID).SetTeacherCode("CTC-" + tag).SaveX(ctx)
	w.teacherID = teacher.ID

	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(section.ID).
		SetSubjectOfferingID(physics.ID).
		SetRoleType("subject_teacher").
		SaveX(ctx)

	headPerson := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Science").SetDisplayName("Science Head " + tag).
		SaveX(ctx)
	client.Staff.Create().
		SetPersonID(headPerson.ID).SetBranchID(branch.ID).
		SetEmployeeCode("CHM-" + tag).SaveX(ctx)

	sectionTwo := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("B").SetCode("CLT-" + tag).
		SaveX(ctx)
	w.sectionB = sectionTwo.ID

	physicsTwo := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).SetSectionID(sectionTwo.ID).
		SetSubjectID(physicsSubject.ID).SaveX(ctx)
	w.physicsB = physicsTwo.ID

	pupilPerson, pupil := w.enrol(client, tag+"-a", session.ID, section.ID, physics.ID, history.ID)
	matePerson, mate := w.enrol(client, tag+"-b", session.ID, section.ID, physics.ID)
	w.pupilID, w.mateID = pupil, mate

	due := time.Date(2026, time.May, 4, 12, 0, 0, 0, time.UTC)

	work := func(offering uuid.UUID, title string) uuid.UUID {
		row := client.Assignment.Create().
			SetAcademicSessionID(session.ID).
			SetTeacherID(teacher.ID).
			SetSubjectOfferingID(offering).
			SetTitle(title).
			SetStatus(entassignment.StatusPublished).
			SetDueAt(due).
			SetMaximumMarks(20).
			SaveX(ctx)
		client.AssignmentTarget.Create().
			SetAssignmentID(row.ID).
			SetTargetType(enttarget.TargetTypeOffering).
			SetTargetID(offering).
			SaveX(ctx)
		return row.ID
	}
	w.physicsWork = work(physics.ID, "Classroom physics homework "+tag)
	w.historyWork = work(history.ID, "Classroom history homework "+tag)

	submit := func(assignment, student uuid.UUID) uuid.UUID {
		return client.AssignmentSubmission.Create().
			SetAssignmentID(assignment).
			SetStudentID(student).
			SetStatus(entsubmission.StatusSubmitted).
			SetSubmittedAt(due.Add(-time.Hour)).
			SaveX(ctx).ID
	}
	w.pupilSubmission = submit(w.physicsWork, pupil)
	w.mateSubmission = submit(w.physicsWork, mate)

	conn := &postgres.TenantConn{Client: client}
	actor := func(person *tenantent.Person, guard classroomGuard) *classroomActor {
		return &classroomActor{
			server: &Server{guard: guard},
			ctx: postgres.WithConn(
				authorization.WithSubject(ctx, &authorization.Subject{CASUserID: person.CasUserID}),
				conn),
		}
	}

	w.teacher = actor(teacherPerson, classroomGuard{reach: authorization.ReachTeacherAssignment})
	w.pupil = actor(pupilPerson, classroomGuard{reach: authorization.ReachSelf})
	w.mate = actor(matePerson, classroomGuard{reach: authorization.ReachSelf})
	w.head = actor(headPerson, classroomGuard{
		reach:       authorization.ReachTenant,
		constraints: [][]authorization.Constraint{{{Field: "grade_level", Values: []string{grade.Code}}}},
	})

	w.requireGenuineScopes()
	db.Forget()
	return w
}

func (w *classroomWorld) enrol(client *tenantent.Client, label string,
	sessionID, sectionID uuid.UUID, offerings ...uuid.UUID) (*tenantent.Person, uuid.UUID) {
	w.t.Helper()

	ctx := context.Background()
	person := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Pupil").SetDisplayName("Pupil " + label).
		SaveX(ctx)
	student := client.Student.Create().
		SetPersonID(person.ID).SetAdmissionNumber("CADM-" + label).SaveX(ctx)
	enrollment := client.StudentEnrollment.Create().
		SetStudentID(student.ID).
		SetAcademicSessionID(sessionID).
		SetSectionID(sectionID).
		SetEnrollmentDate(classroomDate(2026, time.April, 1)).
		SaveX(ctx)

	for _, offering := range offerings {
		client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrollment.ID).
			SetSubjectOfferingID(offering).
			SetStudentID(student.ID).
			SetAcademicSessionID(sessionID).
			SaveX(ctx)
	}
	return person, student.ID
}

func (w *classroomWorld) requireGenuineScopes() {
	w.t.Helper()

	teacher, decision, audience, err := w.teacher.server.streamWrite(w.teacher.ctx,
		authorization.AssignmentsWrite, authorization.AssignmentsWriteAll)
	if err != nil {
		w.t.Fatalf("the teacher audience could not be resolved: %v", err)
	}
	if teacher.Unrestricted || audience.All {
		w.t.Fatal("an unrestricted teacher would reach every row and prove nothing")
	}
	if decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the teacher decision must carry a teacher-assignment reach, got %+v", decision)
	}
	if len(audience.Offerings) != 1 || audience.Offerings[0] != w.physicsID {
		w.t.Fatalf("the teacher must reach exactly the physics offering, got %v", audience.Offerings)
	}
	if audience.School {
		w.t.Fatal("a subject teacher must not be able to post school-wide")
	}

	pupil, pupilDecision, pupilAudience, err := w.pupil.server.streamRead(w.pupil.ctx,
		authorization.StreamPostsRead, authorization.StreamPostsReadAll)
	if err != nil {
		w.t.Fatalf("the pupil audience could not be resolved: %v", err)
	}
	if pupil.Unrestricted || pupilAudience.All {
		w.t.Fatal("an unrestricted pupil would reach every row and prove nothing")
	}
	if pupilDecision.Reach != authorization.ReachSelf {
		w.t.Fatalf("the pupil decision must carry a self reach, got %+v", pupilDecision)
	}
	if len(pupilAudience.SelfStudents) != 1 || pupilAudience.SelfStudents[0] != w.pupilID {
		w.t.Fatalf("the pupil must resolve to the seeded student %s, got %v",
			w.pupilID, pupilAudience.SelfStudents)
	}
	if !carriesID(pupilAudience.Sections, w.sectionID) {
		w.t.Fatalf("the pupil must reach their own section %s, got %v", w.sectionID, pupilAudience.Sections)
	}
	if !carriesID(pupilAudience.Grades, w.gradeID) {
		w.t.Fatalf("the pupil must reach their own grade %s, got %v", w.gradeID, pupilAudience.Grades)
	}
	if !pupilAudience.School {
		w.t.Fatal("a pupil must be able to read a school-wide notice")
	}

	_, _, headAudience, err := w.head.server.streamWrite(w.head.ctx,
		authorization.StreamPostsWrite, authorization.StreamPostsWriteAll)
	if err != nil {
		w.t.Fatalf("the head audience could not be resolved: %v", err)
	}
	if headAudience.All {
		w.t.Fatal("a pinned head must not resolve to an unnarrowed audience")
	}
	if !carriesID(headAudience.Grades, w.gradeID) {
		w.t.Fatalf("the head must reach the pinned grade %s, got %v", w.gradeID, headAudience.Grades)
	}
	if headAudience.School {
		w.t.Fatal("a head pinned to one grade must not be able to post school-wide")
	}
}

func (a *classroomActor) call(t *testing.T, handler http.HandlerFunc,
	method, target, body string, id uuid.UUID) *httptest.ResponseRecorder {
	t.Helper()

	ctx := a.ctx
	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest(method, target, strings.NewReader(body)).WithContext(ctx))
	return rec
}

func classroomField(t *testing.T, rec *httptest.ResponseRecorder, name string) any {
	t.Helper()

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response was not a JSON object: %v (%s)", err, rec.Body.String())
	}
	return body[name]
}

func TestAPupilCannotGradeTheirOwnSubmissionOverHTTP(t *testing.T) {
	w := newClassroomWorld(t)

	t.Run("the pupil is refused with a 404 that admits nothing", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.gradeSubmission, "PATCH",
			"/api/v1/assignment-submissions/"+w.pupilSubmission.String(),
			`{"marks_obtained":20}`, w.pupilSubmission)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("a pupil grading themselves must get 404, got %d: %s", rec.Code, rec.Body.String())
		}

		row := w.db.Client.AssignmentSubmission.GetX(context.Background(), w.pupilSubmission)
		if row.MarksObtained != nil {
			t.Fatalf("the pupil's own marks were written: %v", *row.MarksObtained)
		}
	})

	t.Run("a marks field the pupil invents on the submit route is refused at the door", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.submitAssignment, "POST",
			"/api/v1/assignments/"+w.physicsWork.String()+"/submissions",
			`{"marks_obtained":20}`, w.physicsWork)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("the submit route must not accept a marks field, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("the teacher of that class grades it", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.gradeSubmission, "PATCH",
			"/api/v1/assignment-submissions/"+w.pupilSubmission.String(),
			`{"marks_obtained":14}`, w.pupilSubmission)

		if rec.Code != http.StatusOK {
			t.Fatalf("the physics teacher must be able to grade, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := classroomField(t, rec, "status"); got != string(entsubmission.StatusGraded) {
			t.Fatalf("the submission must be graded, got %v", got)
		}
		if got := classroomField(t, rec, "marks_obtained"); got != float64(14) {
			t.Fatalf("the marks must be recorded, got %v", got)
		}
	})

	t.Run("marks beyond the maximum the assignment carries are refused", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.gradeSubmission, "PATCH",
			"/api/v1/assignment-submissions/"+w.pupilSubmission.String(),
			`{"marks_obtained":99}`, w.pupilSubmission)

		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("marks above the assignment maximum must be refused, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})
}

func TestAPupilSubmitsOnlyTheirOwnWork(t *testing.T) {
	w := newClassroomWorld(t)

	t.Run("the pupil records their own submission", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.submitAssignment, "POST",
			"/api/v1/assignments/"+w.historyWork.String()+"/submissions", `{}`, w.historyWork)

		if rec.Code != http.StatusCreated {
			t.Fatalf("the pupil must be able to submit, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := classroomField(t, rec, "student_id"); got != w.pupilID.String() {
			t.Fatalf("the submission was recorded against %v, want the caller %s", got, w.pupilID)
		}
	})

	t.Run("the pupil cannot submit for a classmate", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.submitAssignment, "POST",
			"/api/v1/assignments/"+w.physicsWork.String()+"/submissions",
			`{"student_id":"`+w.mateID.String()+`"}`, w.physicsWork)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("submitting for a classmate must be refused, got %d: %s", rec.Code, rec.Body.String())
		}

		row := w.db.Client.AssignmentSubmission.GetX(context.Background(), w.mateSubmission)
		if row.Status != entsubmission.StatusSubmitted || row.Late {
			t.Fatalf("the classmate's submission was rewritten: %+v", row)
		}
	})

	t.Run("a teacher cannot record a pupil's work at teacher reach", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.submitAssignment, "POST",
			"/api/v1/assignments/"+w.physicsWork.String()+"/submissions",
			`{"student_id":"`+w.pupilID.String()+`"}`, w.physicsWork)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("a teacher must not record a pupil's work, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestATeacherSetsWorkOnlyOnTheClassTheyTeach(t *testing.T) {
	w := newClassroomWorld(t)

	set := func(actor *classroomActor, offering uuid.UUID, title string) *httptest.ResponseRecorder {
		body := `{"academic_session_id":"` + w.sessionID.String() + `",` +
			`"subject_offering_id":"` + offering.String() + `",` +
			`"title":"` + title + `","maximum_marks":10,` +
			`"targets":[{"target_type":"offering","target_id":"` + offering.String() + `"}]}`
		return actor.call(w.t, actor.server.createAssignment, "POST", "/api/v1/assignments", body, uuid.Nil)
	}

	t.Run("on the offering taught", func(t *testing.T) {
		rec := set(w.teacher, w.physicsID, "Newtons laws")
		if rec.Code != http.StatusCreated {
			t.Fatalf("the physics teacher must be able to set physics work, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("never on an offering another teacher holds", func(t *testing.T) {
		rec := set(w.teacher, w.historyID, "The causes of the war")
		if rec.Code != http.StatusForbidden {
			t.Fatalf("setting work on another teacher's offering must be refused, got %d: %s",
				rec.Code, rec.Body.String())
		}

		n := w.db.Client.Assignment.Query().
			Where(entassignment.Title("The causes of the war")).
			CountX(context.Background())
		if n != 0 {
			t.Fatalf("the refused assignment was written anyway (%d rows)", n)
		}
	})

	t.Run("never targeted at a section the teacher does not hold", func(t *testing.T) {
		body := `{"academic_session_id":"` + w.sessionID.String() + `",` +
			`"title":"Section wide worksheet",` +
			`"targets":[{"target_type":"section","target_id":"` + w.sectionID.String() + `"}]}`
		rec := w.teacher.call(t, w.teacher.server.createAssignment, "POST",
			"/api/v1/assignments", body, uuid.Nil)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("a subject teacher holds no section, so a section target must be refused, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("editing another teacher's assignment is a 404, never a 403", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.updateAssignment, "PATCH",
			"/api/v1/assignments/"+w.historyWork.String(),
			`{"title":"renamed by the physics teacher"}`, w.historyWork)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("an unreachable assignment must answer 404, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestStreamPostsReachOnlyTheirAudience(t *testing.T) {
	w := newClassroomWorld(t)

	post := func(actor *classroomActor, targets, title string) *httptest.ResponseRecorder {
		body := `{"academic_session_id":"` + w.sessionID.String() + `","title":"` + title +
			`","body":"please read","status":"published","targets":[` + targets + `]}`
		return actor.call(w.t, actor.server.createStreamPost, "POST",
			"/api/v1/stream-posts", body, uuid.Nil)
	}
	target := func(kind string, id uuid.UUID) string {
		return `{"target_type":"` + kind + `","target_id":"` + id.String() + `"}`
	}

	t.Run("a subject teacher posts to the class they teach", func(t *testing.T) {
		rec := post(w.teacher, target("offering", w.physicsID), "Lab on Friday")
		if rec.Code != http.StatusCreated {
			t.Fatalf("the physics teacher must be able to post, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("a subject teacher cannot post to another teacher's class", func(t *testing.T) {
		rec := post(w.teacher, target("offering", w.historyID), "Not mine to post")
		if rec.Code != http.StatusForbidden {
			t.Fatalf("posting to another class must be refused, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("a subject teacher cannot post section-wide or school-wide", func(t *testing.T) {
		if rec := post(w.teacher, target("section", w.sectionID), "Section notice"); rec.Code != http.StatusForbidden {
			t.Fatalf("a subject teacher holds no section, got %d: %s", rec.Code, rec.Body.String())
		}
		if rec := post(w.teacher, target("school", w.branchID), "School notice"); rec.Code != http.StatusForbidden {
			t.Fatalf("a subject teacher must not post school-wide, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("one bad target poisons the whole post", func(t *testing.T) {
		both := target("offering", w.physicsID) + "," + target("offering", w.historyID)
		rec := post(w.teacher, both, "Half mine")
		if rec.Code != http.StatusForbidden {
			t.Fatalf("a post naming one unreachable target must be refused entirely, got %d: %s",
				rec.Code, rec.Body.String())
		}

		n := w.db.Client.StreamPost.Query().Where(entpost.Title("Half mine")).CountX(context.Background())
		if n != 0 {
			t.Fatalf("the refused post was written anyway (%d rows)", n)
		}
	})

	t.Run("a target that names no row is refused", func(t *testing.T) {
		rec := post(w.teacher, target("offering", uuid.New()), "Nowhere")
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("an unknown target must be refused, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("a head pinned to one grade posts grade-wide but never school-wide", func(t *testing.T) {
		if rec := post(w.head, target("grade", w.gradeID), "Science week"); rec.Code != http.StatusCreated {
			t.Fatalf("the head must be able to post grade-wide, got %d: %s", rec.Code, rec.Body.String())
		}
		if rec := post(w.head, target("school", w.branchID), "Whole school"); rec.Code != http.StatusForbidden {
			t.Fatalf("a head pinned to one grade must not post school-wide, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("the pupil reads the notice for the class they study", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.listStreamPosts, "GET",
			"/api/v1/stream-posts?target_type=offering&target_id="+w.physicsID.String(), "", uuid.Nil)

		if rec.Code != http.StatusOK {
			t.Fatalf("the pupil must be able to list posts, got %d: %s", rec.Code, rec.Body.String())
		}
		if got := classroomField(t, rec, "count"); got != float64(1) {
			t.Fatalf("the pupil must see exactly the one published notice, got %v: %s",
				got, rec.Body.String())
		}
	})

	t.Run("the pupil reads the grade-wide notice the head posted", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.listStreamPosts, "GET",
			"/api/v1/stream-posts?target_type=grade&target_id="+w.gradeID.String(), "", uuid.Nil)

		if got := classroomField(t, rec, "count"); got != float64(1) {
			t.Fatalf("the pupil must see the grade-wide notice, got %v: %s", got, rec.Body.String())
		}
	})

	t.Run("the pupil cannot post at all", func(t *testing.T) {
		rec := post(w.pupil, target("offering", w.physicsID), "No homework today")
		if rec.Code != http.StatusForbidden {
			t.Fatalf("a pupil must not post, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestAPupilCommentsButNeverModerates(t *testing.T) {
	w := newClassroomWorld(t)

	body := `{"academic_session_id":"` + w.sessionID.String() +
		`","title":"Lab safety","body":"goggles on","status":"published",` +
		`"targets":[{"target_type":"offering","target_id":"` + w.physicsID.String() + `"}]}`
	rec := w.teacher.call(t, w.teacher.server.createStreamPost, "POST", "/api/v1/stream-posts", body, uuid.Nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("seeding the post failed: %d %s", rec.Code, rec.Body.String())
	}

	var created map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("the create response was not JSON: %v", err)
	}
	postID := uuid.MustParse(created["stream_post"].(map[string]any)["id"].(string))

	var commentID uuid.UUID
	t.Run("the pupil comments on a post they can read", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.createStreamComment, "POST",
			"/api/v1/stream-posts/"+postID.String()+"/comments", `{"body":"do we need lab coats?"}`, postID)
		if rec.Code != http.StatusCreated {
			t.Fatalf("the pupil must be able to comment, got %d: %s", rec.Code, rec.Body.String())
		}
		commentID = uuid.MustParse(classroomField(t, rec, "id").(string))
	})

	t.Run("the pupil cannot hide their own comment by moderating it", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.moderateStreamComment, "PATCH",
			"/api/v1/stream-comments/"+commentID.String(), `{"status":"hidden"}`, commentID)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("moderation belongs to whoever may write the post, got %d: %s",
				rec.Code, rec.Body.String())
		}
	})

	t.Run("the teacher who owns the post hides it", func(t *testing.T) {
		rec := w.teacher.call(t, w.teacher.server.moderateStreamComment, "PATCH",
			"/api/v1/stream-comments/"+commentID.String(), `{"status":"hidden"}`, commentID)
		if rec.Code != http.StatusOK {
			t.Fatalf("the post owner must be able to moderate, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func TestTheResolvedAudienceIsNeverWiderThanTheGrant(t *testing.T) {
	w := newClassroomWorld(t)

	cases := []struct {
		name  string
		actor *classroomActor
	}{
		{"teacher", w.teacher},
		{"pupil", w.pupil},
		{"head", w.head},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			viewer, decision, err := tc.actor.server.scopeFor(tc.actor.ctx,
				authorization.StreamPostsWrite, authorization.StreamPostsWriteAll)
			if err != nil {
				t.Fatalf("scope: %v", err)
			}

			write, err := access.WritableAudience(tc.actor.ctx, viewer, decision)
			if err != nil {
				t.Fatalf("writable audience: %v", err)
			}
			read, err := access.ReadableAudience(tc.actor.ctx, viewer, decision)
			if err != nil {
				t.Fatalf("readable audience: %v", err)
			}

			if write.All && !read.All {
				t.Fatal("a write audience may never be wider than the read audience")
			}
			if write.School && !read.School {
				t.Fatal("a caller who may post school-wide must be able to read school-wide")
			}
			for _, id := range write.Sections {
				if !read.All && !carriesID(read.Sections, id) {
					t.Fatalf("section %s is writable but not readable", id)
				}
			}
			for _, id := range write.Offerings {
				if !read.All && !carriesID(read.Offerings, id) {
					t.Fatalf("offering %s is writable but not readable", id)
				}
			}
		})
	}
}

func TestTargetRowsAreAUnionNeverAnIntersection(t *testing.T) {
	w := newClassroomWorld(t)

	post := func(actor *classroomActor, targets, title string) uuid.UUID {
		body := `{"academic_session_id":"` + w.sessionID.String() + `","title":"` + title +
			`","body":"please read","status":"published","targets":[` + targets + `]}`
		rec := actor.call(t, actor.server.createStreamPost, "POST", "/api/v1/stream-posts", body, uuid.Nil)
		if rec.Code != http.StatusCreated {
			t.Fatalf("seeding %q failed: %d %s", title, rec.Code, rec.Body.String())
		}
		var created map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
			t.Fatalf("the create response was not JSON: %v", err)
		}
		return uuid.MustParse(created["stream_post"].(map[string]any)["id"].(string))
	}
	target := func(kind string, id uuid.UUID) string {
		return `{"target_type":"` + kind + `","target_id":"` + id.String() + `"}`
	}
	reaches := func(actor *classroomActor, id uuid.UUID) bool {
		rec := actor.call(t, actor.server.getStreamPost, "GET",
			"/api/v1/stream-posts/"+id.String(), "", id)
		switch rec.Code {
		case http.StatusOK:
			return true
		case http.StatusNotFound:
			return false
		default:
			t.Fatalf("unexpected status %d: %s", rec.Code, rec.Body.String())
			return false
		}
	}

	historyOnly := post(w.head, target("offering", w.historyID), "History only")
	gradeAndHistory := post(w.head,
		target("grade", w.gradeID)+","+target("offering", w.historyID), "Grade or history")

	t.Run("the classmate who studies no history cannot see the history-only post", func(t *testing.T) {
		if reaches(w.mate, historyOnly) {
			t.Fatal("a pupil not enrolled in the offering reached a post targeted only at it")
		}
	})

	t.Run("the same classmate sees the grade-or-history post through the grade alone", func(t *testing.T) {
		if !reaches(w.mate, gradeAndHistory) {
			t.Fatal("two target rows were treated as an intersection: a pupil matching the grade " +
				"but not the offering was excluded. Target rows are a union")
		}
	})

	t.Run("the pupil who matches both rows still sees it exactly once", func(t *testing.T) {
		if !reaches(w.pupil, gradeAndHistory) {
			t.Fatal("the pupil matching both target rows was excluded")
		}

		rec := w.pupil.call(t, w.pupil.server.listStreamPosts, "GET",
			"/api/v1/stream-posts?target_id="+w.gradeID.String()+","+w.historyID.String(), "", uuid.Nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("listing failed: %d %s", rec.Code, rec.Body.String())
		}

		seen := 0
		for _, row := range listedPosts(t, rec) {
			if row["id"] == gradeAndHistory.String() {
				seen++
			}
		}
		if seen != 1 {
			t.Fatalf("a post matching two target rows came back %d times; the scope is an EXISTS, "+
				"never a join that multiplies rows: %s", seen, rec.Body.String())
		}
	})
}

func TestClassNineMathsIsSeveralOfferingRowsOnOnePost(t *testing.T) {
	w := newClassroomWorld(t)

	body := `{"academic_session_id":"` + w.sessionID.String() +
		`","title":"Physics across the grade","body":"revise chapter four","status":"published",` +
		`"targets":[` +
		`{"target_type":"offering","target_id":"` + w.physicsID.String() + `"},` +
		`{"target_type":"offering","target_id":"` + w.physicsB.String() + `"}]}`

	rec := w.head.call(t, w.head.server.createStreamPost, "POST", "/api/v1/stream-posts", body, uuid.Nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("one post naming both offerings must be accepted, got %d: %s",
			rec.Code, rec.Body.String())
	}

	t.Run("one filter call carries every offering the caller expanded to", func(t *testing.T) {
		rec := w.head.call(t, w.head.server.listStreamPosts, "GET",
			"/api/v1/stream-posts?target_type=offering&target_id="+
				w.physicsID.String()+","+w.physicsB.String(), "", uuid.Nil)

		if rec.Code != http.StatusOK {
			t.Fatalf("listing failed: %d %s", rec.Code, rec.Body.String())
		}
		if got := classroomField(t, rec, "count"); got != float64(1) {
			t.Fatalf("the post spanning both offerings must come back once, got %v: %s",
				got, rec.Body.String())
		}
	})

	t.Run("a pupil in either class sees it, and nothing was stored per pupil", func(t *testing.T) {
		rec := w.pupil.call(t, w.pupil.server.listStreamPosts, "GET",
			"/api/v1/stream-posts?target_type=offering&target_id="+w.physicsID.String(), "", uuid.Nil)
		if got := classroomField(t, rec, "count"); got != float64(1) {
			t.Fatalf("the pupil in the first class must see it, got %v: %s", got, rec.Body.String())
		}

		n := w.db.Client.StreamTarget.Query().CountX(context.Background())
		if n != 2 {
			t.Fatalf("the post must be exactly two target rows, got %d; nothing is expanded per pupil", n)
		}
	})

	t.Run("a bad id in the list is refused rather than silently dropped", func(t *testing.T) {
		rec := w.head.call(t, w.head.server.listStreamPosts, "GET",
			"/api/v1/stream-posts?target_id="+w.physicsID.String()+",not-a-uuid", "", uuid.Nil)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("a malformed target id must be refused, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

func listedPosts(t *testing.T, rec *httptest.ResponseRecorder) []map[string]any {
	t.Helper()

	var body struct {
		StreamPosts []map[string]any `json:"stream_posts"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the list response was not JSON: %v (%s)", err, rec.Body.String())
	}
	return body.StreamPosts
}
