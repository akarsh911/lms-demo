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
	entnote "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentnote"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

var academicGateReadable = map[authorization.Entity]bool{
	authorization.StudentsRead:           true,
	authorization.EnrollmentsRead:        true,
	authorization.SubjectEnrollmentsRead: true,
	authorization.StudentAssignmentsRead: true,
	authorization.StudentDocumentsRead:   true,
	authorization.StudentNotesRead:       true,
}

type academicGateGuard struct {
	guardian uuid.UUID
	teacher  uuid.UUID
	byReach  bool
}

func (g academicGateGuard) Allow(_ context.Context, sub *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if !academicGateReadable[entity] {
		return authorization.Decision{}, nil
	}
	if !g.byReach {
		return authorization.Decision{Allowed: true}, nil
	}
	if sub == nil {
		return authorization.Decision{}, nil
	}
	switch sub.CASUserID {
	case g.guardian:
		return authorization.Decision{
			Allowed: true, Reach: authorization.ReachGuardianWard, HasReach: true,
		}, nil
	case g.teacher:
		return authorization.Decision{
			Allowed: true, Reach: authorization.ReachTeacherAssignment, HasReach: true,
		}, nil
	}
	return authorization.Decision{}, nil
}

func (g academicGateGuard) Name() string { return "guardian academic gate test guard" }

type academicGateWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server

	guardianCtx context.Context
	teacherCtx  context.Context

	openStudent   uuid.UUID
	closedStudent uuid.UUID

	openEnrollment   uuid.UUID
	closedEnrollment uuid.UUID
	openSubject      uuid.UUID
	closedSubject    uuid.UUID
	openAssignment   uuid.UUID
	closedAssignment uuid.UUID
	openDocument     uuid.UUID
	closedDocument   uuid.UUID
	openNote         uuid.UUID
	closedNote       uuid.UUID
}

func newAcademicGateWorld(t *testing.T, byReach bool) *academicGateWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]
	today := time.Now().UTC()

	branch := client.Branch.Create().
		SetName("Gate Branch " + tag).
		SetCode("GBR-" + tag).
		SaveX(ctx)
	session := client.AcademicSession.Create().
		SetName("Gate Session " + tag).
		SetCode("GSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)
	grade := client.GradeLevel.Create().
		SetName("Gate Grade " + tag).
		SetCode("GGR-" + tag).
		SetSequence(1).
		SaveX(ctx)
	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").
		SetCode("GSC-" + tag).
		SaveX(ctx)
	subject := client.Subject.Create().
		SetName("Gate Maths " + tag).
		SetCode("GSU-" + tag).
		SaveX(ctx)
	offering := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).
		SetSectionID(section.ID).
		SetSubjectID(subject.ID).
		SaveX(ctx)

	teacherCAS := uuid.New()
	teacherPerson := client.Person.Create().
		SetCasUserID(teacherCAS).
		SetFirstName("Gate").
		SetDisplayName("Gate Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(teacherPerson.ID).
		SetEmployeeCode("GEM-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(section.ID).
		SetRoleType("class_teacher").
		SaveX(ctx)

	guardianCAS := uuid.New()
	guardianPerson := client.Person.Create().
		SetCasUserID(guardianCAS).
		SetFirstName("Gate").
		SetDisplayName("Gate Guardian " + tag).
		SaveX(ctx)
	guardian := client.Guardian.Create().SetPersonID(guardianPerson.ID).SaveX(ctx)

	world := &academicGateWorld{
		t:  t,
		db: db,
		server: &Server{guard: academicGateGuard{
			guardian: guardianCAS, teacher: teacherCAS, byReach: byReach,
		}},
	}

	ward := func(label string, canViewAcademic bool) (student, enrollment, subjectEnrollment,
		assignment, document, note uuid.UUID) {
		person := client.Person.Create().
			SetCasUserID(uuid.New()).
			SetFirstName("Gate").
			SetDisplayName("Gate " + label + " " + tag).
			SaveX(ctx)
		row := client.Student.Create().
			SetPersonID(person.ID).
			SetAdmissionNumber("GAD-" + label + "-" + tag).
			SaveX(ctx)
		client.StudentGuardian.Create().
			SetStudentID(row.ID).
			SetGuardianID(guardian.ID).
			SetRelationshipType("mother").
			SetCanViewAcademic(canViewAcademic).
			SaveX(ctx)

		enrolled := client.StudentEnrollment.Create().
			SetStudentID(row.ID).
			SetAcademicSessionID(session.ID).
			SetSectionID(section.ID).
			SetEnrollmentDate(today).
			SaveX(ctx)
		studied := client.StudentSubjectEnrollment.Create().
			SetStudentEnrollmentID(enrolled.ID).
			SetSubjectOfferingID(offering.ID).
			SetStudentID(row.ID).
			SetAcademicSessionID(session.ID).
			SaveX(ctx)
		role := client.StudentAssignment.Create().
			SetAcademicSessionID(session.ID).
			SetStudentID(row.ID).
			SetSectionID(section.ID).
			SetRoleType("class_monitor").
			SaveX(ctx)

		asset := client.Asset.Create().
			SetStorageKey("gate/" + label + "/" + tag).
			SetFileName("report-" + tag + ".pdf").
			SetMimeType("application/pdf").
			SetSizeBytes(12).
			SetSha256(strings.Repeat("a", 64)).
			SaveX(ctx)
		filed := client.StudentDocument.Create().
			SetStudentID(row.ID).
			SetDocumentType("report_card").
			SetAssetID(asset.ID).
			SaveX(ctx)

		written := client.StudentNote.Create().
			SetStudentID(row.ID).
			SetAcademicSessionID(session.ID).
			SetAuthorPersonID(teacherPerson.ID).
			SetCategory("pastoral").
			SetBody("Gate note " + label + " " + tag).
			SetVisibility(entnote.VisibilityGuardian).
			SaveX(ctx)

		return row.ID, enrolled.ID, studied.ID, role.ID, filed.ID, written.ID
	}

	world.openStudent, world.openEnrollment, world.openSubject,
		world.openAssignment, world.openDocument, world.openNote = ward("open", true)
	world.closedStudent, world.closedEnrollment, world.closedSubject,
		world.closedAssignment, world.closedDocument, world.closedNote = ward("closed", false)

	conn := &postgres.TenantConn{Client: client}
	world.guardianCtx = postgres.WithConn(
		authorization.WithSubject(ctx, &authorization.Subject{CASUserID: guardianCAS}), conn)
	world.teacherCtx = postgres.WithConn(
		authorization.WithSubject(ctx, &authorization.Subject{CASUserID: teacherCAS}), conn)

	world.requireGenuineViewers()
	db.Forget()
	return world
}

func (w *academicGateWorld) requireGenuineViewers() {
	w.t.Helper()

	guardian, decision, err := w.server.scopeFor(w.guardianCtx,
		authorization.EnrollmentsRead, authorization.EnrollmentsReadAll)
	if err != nil {
		w.t.Fatalf("the guardian viewer could not be resolved: %v", err)
	}
	if guardian.Unrestricted {
		w.t.Fatal("an unrestricted guardian would read every row and prove nothing about the gate")
	}
	if guardian.GuardianID == nil {
		w.t.Fatal("the viewer carries no guardian: every refusal below would pass for the wrong reason")
	}
	if !decision.Allowed {
		w.t.Fatalf("the guardian must be allowed to read enrolments, got %+v", decision)
	}

	teacher, _, err := w.server.scopeFor(w.teacherCtx,
		authorization.EnrollmentsRead, authorization.EnrollmentsReadAll)
	if err != nil {
		w.t.Fatalf("the teacher viewer could not be resolved: %v", err)
	}
	if teacher.Unrestricted {
		w.t.Fatal("an unrestricted teacher would read every row and prove nothing about the gate")
	}
	if len(teacher.SectionIDs) == 0 {
		w.t.Fatal("the teacher viewer carries no section: the taught arm would render a refusal")
	}
}

func (w *academicGateWorld) call(ctx context.Context, handler http.HandlerFunc,
	target string, id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest("GET", target, nil).WithContext(ctx))
	return rec
}

func (w *academicGateWorld) listed(rec *httptest.ResponseRecorder, key string) []uuid.UUID {
	w.t.Helper()

	if rec.Code != http.StatusOK {
		w.t.Fatalf("%s: want 200, got %d: %s", key, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("%s: the response is not JSON: %v (%q)", key, err, rec.Body.String())
	}
	raw, ok := body[key]
	if !ok {
		w.t.Fatalf("%s: the envelope carries no such key: %q", key, rec.Body.String())
	}

	var rows []struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(raw, &rows); err != nil {
		w.t.Fatalf("%s: the rows are not objects with an id: %v (%q)", key, err, string(raw))
	}

	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids
}

func (w *academicGateWorld) requireGateInSQL(table string) {
	w.t.Helper()

	queries := w.db.QueriesOn(table)
	if len(queries) == 0 {
		w.t.Fatalf("no query reached %s", table)
	}
	for _, stmt := range queries {
		if strings.Contains(stmt.Query, "can_view_academic") {
			return
		}
	}
	w.t.Fatalf("no query on %s carried can_view_academic, so the gate was never asked of Postgres: %q",
		table, queries[0].Query)
}

func academicGateHas(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func (w *academicGateWorld) requireOpenOnly(ids []uuid.UUID, key string, open, closed uuid.UUID) {
	w.t.Helper()

	if !academicGateHas(ids, open) {
		w.t.Fatalf("%s: the ward whose link permits academic records became unreachable: %v", key, ids)
	}
	if academicGateHas(ids, closed) {
		w.t.Fatalf("%s: can_view_academic=false still returned the row: %v", key, ids)
	}
}

func (w *academicGateWorld) requireBoth(ids []uuid.UUID, key string, first, second uuid.UUID) {
	w.t.Helper()

	if !academicGateHas(ids, first) || !academicGateHas(ids, second) {
		w.t.Fatalf("%s: both rows must stay reachable by this arm, got %v", key, ids)
	}
}

func TestGuardianWithoutAcademicAccessLosesTheAcademicRecords(t *testing.T) {
	for _, byReach := range []bool{true, false} {
		name := "granted reach"
		if !byReach {
			name = "no reach"
		}
		t.Run(name, func(t *testing.T) {
			w := newAcademicGateWorld(t, byReach)

			w.db.Forget()
			ids := w.listed(w.call(w.guardianCtx, w.server.listEnrollments,
				"/api/v1/enrollments", uuid.Nil), "enrollments")
			w.requireOpenOnly(ids, "enrollments", w.openEnrollment, w.closedEnrollment)
			w.requireGateInSQL("student_enrollments")

			w.db.Forget()
			ids = w.listed(w.call(w.guardianCtx, w.server.listSubjectEnrollments,
				"/api/v1/subject-enrollments", uuid.Nil), "subject_enrollments")
			w.requireOpenOnly(ids, "subject_enrollments", w.openSubject, w.closedSubject)
			w.requireGateInSQL("student_subject_enrollments")

			w.db.Forget()
			ids = w.listed(w.call(w.guardianCtx, w.server.listStudentAssignments,
				"/api/v1/student-assignments", uuid.Nil), "student_assignments")
			w.requireOpenOnly(ids, "student_assignments", w.openAssignment, w.closedAssignment)
			w.requireGateInSQL("student_assignments")

			w.db.Forget()
			ids = w.listed(w.call(w.guardianCtx, w.server.listDocuments,
				"/api/v1/student-documents", uuid.Nil), "student_documents")
			w.requireOpenOnly(ids, "student_documents", w.openDocument, w.closedDocument)
			w.requireGateInSQL("student_documents")
		})
	}
}

func TestGuardianWithoutAcademicAccessIsRefusedTheWardsEnrollment(t *testing.T) {
	w := newAcademicGateWorld(t, true)

	rec := w.call(w.guardianCtx, w.server.getEnrollment,
		"/api/v1/enrollments/"+w.openEnrollment.String(), w.openEnrollment)
	if rec.Code != http.StatusOK {
		t.Fatalf("the permitted ward's enrolment must still be readable, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rec = w.call(w.guardianCtx, w.server.getEnrollment,
		"/api/v1/enrollments/"+w.closedEnrollment.String(), w.closedEnrollment)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("can_view_academic=false must answer 404, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestTheAcademicGateNeverNarrowsTheTeacherArm(t *testing.T) {
	w := newAcademicGateWorld(t, true)

	ids := w.listed(w.call(w.teacherCtx, w.server.listEnrollments,
		"/api/v1/enrollments", uuid.Nil), "enrollments")
	w.requireBoth(ids, "enrollments", w.openEnrollment, w.closedEnrollment)

	ids = w.listed(w.call(w.teacherCtx, w.server.listSubjectEnrollments,
		"/api/v1/subject-enrollments", uuid.Nil), "subject_enrollments")
	w.requireBoth(ids, "subject_enrollments", w.openSubject, w.closedSubject)

	ids = w.listed(w.call(w.teacherCtx, w.server.listStudentAssignments,
		"/api/v1/student-assignments", uuid.Nil), "student_assignments")
	w.requireBoth(ids, "student_assignments", w.openAssignment, w.closedAssignment)

	ids = w.listed(w.call(w.teacherCtx, w.server.listDocuments,
		"/api/v1/student-documents", uuid.Nil), "student_documents")
	w.requireBoth(ids, "student_documents", w.openDocument, w.closedDocument)

	rec := w.call(w.teacherCtx, w.server.getEnrollment,
		"/api/v1/enrollments/"+w.closedEnrollment.String(), w.closedEnrollment)
	if rec.Code != http.StatusOK {
		t.Fatalf("the teacher reaches the same row by another arm and must be unaffected, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestTheAcademicGateLeavesTheWardAndTheNotesAlone(t *testing.T) {
	w := newAcademicGateWorld(t, true)

	for label, id := range map[string]uuid.UUID{"open": w.openStudent, "closed": w.closedStudent} {
		rec := w.call(w.guardianCtx, w.server.getStudent, "/api/v1/students/"+id.String(), id)
		if rec.Code != http.StatusOK {
			t.Fatalf("the %s ward must stay reachable as a person, got %d: %s",
				label, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
	}

	ids := w.listed(w.call(w.guardianCtx, w.server.listNotes,
		"/api/v1/student-notes", uuid.Nil), "student_notes")
	w.requireBoth(ids, "student_notes", w.openNote, w.closedNote)
}
