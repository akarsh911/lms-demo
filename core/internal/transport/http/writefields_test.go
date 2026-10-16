package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	entsubjenroll "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentsubjectenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type writeFieldsGuard map[authorization.Entity]authorization.Decision

func (g writeFieldsGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	return g[entity], nil
}

func (writeFieldsGuard) Name() string { return "write field test guard" }

func included(keys ...string) *authorization.FieldPolicy {
	return &authorization.FieldPolicy{Mode: authorization.FieldModeInclude, Keys: keys}
}

func narrowWrite(narrow, wide authorization.Entity, policy *authorization.FieldPolicy,
	also ...authorization.Entity) writeFieldsGuard {
	g := writeFieldsGuard{
		narrow: {Allowed: true, Rule: "narrow write, restricted fields", Fields: policy},
		wide:   {Allowed: true, Rule: "school-wide write"},
	}
	for _, e := range also {
		g[e] = authorization.Decision{Allowed: true, Rule: "test guard"}
	}
	return g
}

type writeFieldsWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	sessionID    uuid.UUID
	sectionID    uuid.UUID
	studentID    uuid.UUID
	freshID      uuid.UUID
	guardianID   uuid.UUID
	enrollmentID uuid.UUID
	offeringID   uuid.UUID
}

func newWriteFieldsWorld(t *testing.T, guard authorization.Guard) *writeFieldsWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	branch := client.Branch.Create().
		SetName("Field Branch " + tag).
		SetCode("FBR-" + tag).
		SaveX(ctx)

	today := time.Now().UTC()
	session := client.AcademicSession.Create().
		SetName("Field Session " + tag).
		SetCode("FSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("Field Grade " + tag).
		SetCode("FGR-" + tag).
		SetSequence(1).
		SaveX(ctx)

	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").
		SetCode("FSC-" + tag).
		SaveX(ctx)

	casUser := uuid.New()
	client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Field").
		SetDisplayName("Field Registrar " + tag).
		SaveX(ctx)

	pupil := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Field").
		SetDisplayName("Field Pupil " + tag).
		SaveX(ctx)
	student := client.Student.Create().
		SetPersonID(pupil.ID).
		SetAdmissionNumber("FAD-" + tag).
		SaveX(ctx)

	newcomer := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Field").
		SetDisplayName("Field Newcomer " + tag).
		SaveX(ctx)
	fresh := client.Student.Create().
		SetPersonID(newcomer.ID).
		SetAdmissionNumber("FAN-" + tag).
		SaveX(ctx)

	parent := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Field").
		SetDisplayName("Field Parent " + tag).
		SaveX(ctx)
	guardianRow := client.Guardian.Create().
		SetPersonID(parent.ID).
		SaveX(ctx)

	enrollment := client.StudentEnrollment.Create().
		SetStudentID(student.ID).
		SetAcademicSessionID(session.ID).
		SetSectionID(section.ID).
		SetEnrollmentDate(today).
		SaveX(ctx)

	subject := client.Subject.Create().
		SetName("Field Maths " + tag).
		SetCode("FSU-" + tag).
		SaveX(ctx)
	offering := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).
		SetSectionID(section.ID).
		SetSubjectID(subject.ID).
		SaveX(ctx)

	world := &writeFieldsWorld{
		t:            t,
		db:           db,
		server:       &Server{guard: guard},
		sessionID:    session.ID,
		sectionID:    section.ID,
		studentID:    student.ID,
		freshID:      fresh.ID,
		guardianID:   guardianRow.ID,
		enrollmentID: enrollment.ID,
		offeringID:   offering.ID,
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	db.Forget()
	return world
}

func (w *writeFieldsWorld) call(handler http.HandlerFunc, method, target, body string,
	id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	ctx := w.ctx
	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest(method, target, strings.NewReader(body)).WithContext(ctx))
	return rec
}

func (w *writeFieldsWorld) refused(rec *httptest.ResponseRecorder, field string) {
	w.t.Helper()

	if rec.Code != http.StatusForbidden {
		w.t.Fatalf("writing %q must be refused with 403, got %d: %s",
			field, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), field) {
		w.t.Fatalf("the refusal must name %q, got %s", field, strings.TrimSpace(rec.Body.String()))
	}
}

func (w *writeFieldsWorld) created(rec *httptest.ResponseRecorder) {
	w.t.Helper()

	if rec.Code != http.StatusCreated {
		w.t.Fatalf("want 201, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestCreateEnrollmentRefusesAFieldTheCallerMayNotWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, narrowWrite(
		authorization.EnrollmentsWrite, authorization.EnrollmentsWriteAll,
		included("student_id", "academic_session_id", "section_id", "enrollment_date", "roll_number")))

	before := w.countEnrollments()

	body := `{"student_id":"` + w.freshID.String() +
		`","academic_session_id":"` + w.sessionID.String() +
		`","section_id":"` + w.sectionID.String() +
		`","enrollment_date":"2026-04-01","enrollment_number":"EN-1"}`
	w.refused(w.call(w.server.createEnrollment, "POST", "/api/v1/enrollments", body, uuid.Nil),
		"enrollment_number")

	if after := w.countEnrollments(); after != before {
		t.Fatalf("a refused create still wrote a row: %d enrollments before, %d after", before, after)
	}

	allowed := `{"student_id":"` + w.freshID.String() +
		`","academic_session_id":"` + w.sessionID.String() +
		`","section_id":"` + w.sectionID.String() +
		`","enrollment_date":"2026-04-02","roll_number":"7"}`
	w.created(w.call(w.server.createEnrollment, "POST", "/api/v1/enrollments", allowed, uuid.Nil))

	if after := w.countEnrollments(); after != before+1 {
		t.Fatalf("the permitted create did not land: %d enrollments before, %d after", before, after)
	}
}

func TestCreateSubjectEnrollmentRefusesAFieldTheCallerMayNotWrite(t *testing.T) {
	w := newWriteFieldsWorld(t, narrowWrite(
		authorization.SubjectEnrollmentsWrite, authorization.SubjectEnrollmentsWriteAll,
		included("student_enrollment_id", "subject_offering_id", "enrolled_on")))

	before := w.countSubjectEnrollments()

	body := `{"student_enrollment_id":"` + w.enrollmentID.String() +
		`","subject_offering_id":"` + w.offeringID.String() +
		`","is_elective_choice":true}`
	w.refused(w.call(w.server.createSubjectEnrollment, "POST", "/api/v1/subject-enrollments", body, uuid.Nil),
		"is_elective_choice")

	if after := w.countSubjectEnrollments(); after != before {
		t.Fatalf("a refused create still wrote a row: %d before, %d after", before, after)
	}

	allowed := `{"student_enrollment_id":"` + w.enrollmentID.String() +
		`","subject_offering_id":"` + w.offeringID.String() +
		`","enrolled_on":"2026-04-01"}`
	w.created(w.call(w.server.createSubjectEnrollment, "POST", "/api/v1/subject-enrollments", allowed, uuid.Nil))

	if after := w.countSubjectEnrollments(); after != before+1 {
		t.Fatalf("the permitted create did not land: %d before, %d after", before, after)
	}
}

func TestLinkGuardianRefusesTheFieldsItDoesNotOwn(t *testing.T) {
	guard := writeFieldsGuard{
		authorization.GuardiansWrite:    {Allowed: true, Rule: "school-wide guardian write"},
		authorization.GuardiansWriteAll: {Allowed: true, Rule: "school-wide guardian write"},
		authorization.StudentsRead:      {Allowed: true, Rule: "school-wide student read"},
		authorization.StudentsReadAll:   {Allowed: true, Rule: "school-wide student read"},
	}
	w := newWriteFieldsWorld(t, guard)

	before := w.countLinks()

	body := `{"student_id":"` + w.studentID.String() +
		`","relationship_type":"mother","status":"inactive"}`
	w.refused(w.call(w.server.linkGuardianToStudent, "POST",
		"/api/v1/guardians/"+w.guardianID.String()+"/students", body, w.guardianID), "status")

	if after := w.countLinks(); after != before {
		t.Fatalf("a refused link was still written: %d before, %d after", before, after)
	}

	allowed := `{"student_id":"` + w.studentID.String() +
		`","relationship_type":"mother","can_view_finance":true}`
	rec := w.call(w.server.linkGuardianToStudent, "POST",
		"/api/v1/guardians/"+w.guardianID.String()+"/students", allowed, w.guardianID)
	w.created(rec)

	if after := w.countLinks(); after != before+1 {
		t.Fatalf("the permitted link did not land: %d before, %d after", before, after)
	}

	row := w.link()
	if row.Status != entlink.StatusActive {
		t.Fatalf("a link must be born active, got %q", row.Status)
	}
	if !row.CanViewFinance {
		t.Fatal("a field the caller may set must still reach the row")
	}
}

func TestEveryLinkColumnIsAccountedFor(t *testing.T) {
	settled := map[string]string{
		entlink.FieldID:         "server owned",
		entlink.FieldCreatedAt:  "server owned",
		entlink.FieldUpdatedAt:  "server owned",
		entlink.FieldGuardianID: "taken from the request path",
		entlink.FieldStatus:     "server determined: a link is born active",
	}
	for _, key := range linkFields.Keys {
		settled[key] = "writable"
	}

	for _, column := range entlink.Columns {
		if settled[column] == "" {
			t.Fatalf("link column %q is governed by no catalog area and is not listed as "+
				"writable, server owned, path owned or server determined; decide before it ships",
				column)
		}
	}
	for key := range settled {
		if !entlink.ValidColumn(key) {
			t.Fatalf("%q is not a column of student_guardians", key)
		}
	}
}

func (w *writeFieldsWorld) countEnrollments() int {
	w.t.Helper()

	n, err := w.db.Client.StudentEnrollment.Query().
		Where(entenrollment.StudentID(w.freshID)).Count(context.Background())
	if err != nil {
		w.t.Fatalf("counting enrollments: %v", err)
	}
	return n
}

func (w *writeFieldsWorld) countSubjectEnrollments() int {
	w.t.Helper()

	n, err := w.db.Client.StudentSubjectEnrollment.Query().
		Where(entsubjenroll.StudentEnrollmentID(w.enrollmentID)).Count(context.Background())
	if err != nil {
		w.t.Fatalf("counting subject enrollments: %v", err)
	}
	return n
}

func (w *writeFieldsWorld) countLinks() int {
	w.t.Helper()

	n, err := w.db.Client.StudentGuardian.Query().
		Where(entlink.GuardianID(w.guardianID)).Count(context.Background())
	if err != nil {
		w.t.Fatalf("counting guardian links: %v", err)
	}
	return n
}

func (w *writeFieldsWorld) link() *tenantent.StudentGuardian {
	w.t.Helper()

	row, err := w.db.Client.StudentGuardian.Query().
		Where(entlink.GuardianID(w.guardianID)).Only(context.Background())
	if err != nil {
		w.t.Fatalf("reading the guardian link back: %v", err)
	}
	return row
}
