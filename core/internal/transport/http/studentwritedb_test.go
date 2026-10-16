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
	"github.com/Harbour-Emerge/emerge-core/internal/ent/generated/hook"
	entenrollment "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentenrollment"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type studentWriteGuard struct{}

func (studentWriteGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.StudentsRead, authorization.StudentsWrite:
		return authorization.Decision{
			Allowed:  true,
			Rule:     "students, taught only",
			Reach:    authorization.ReachTeacherAssignment,
			HasReach: true,
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (studentWriteGuard) Name() string { return "student write database test guard" }

type studentWriteWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	personID uuid.UUID
	mine     uuid.UUID
	theirs   uuid.UUID

	taught   uuid.UUID
	untaught uuid.UUID
}

func newStudentWriteWorld(t *testing.T) *studentWriteWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	branch := client.Branch.Create().
		SetName("Reach Branch " + tag).
		SetCode("RBR-" + tag).
		SaveX(ctx)

	today := time.Now().UTC()
	session := client.AcademicSession.Create().
		SetName("Reach Session " + tag).
		SetCode("RSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("Reach Grade " + tag).
		SetCode("RGR-" + tag).
		SetSequence(93).
		SaveX(ctx)

	newSection := func(name, code string) *tenantent.Section {
		return client.Section.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetGradeLevelID(grade.ID).
			SetName(name).
			SetCode(code + "-" + tag).
			SaveX(ctx)
	}
	mine := newSection("A", "RSA")
	theirs := newSection("B", "RSB")

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Reach").
		SetDisplayName("Reach Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("REM-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().
		SetStaffID(staff.ID).
		SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(mine.ID).
		SetRoleType("class_teacher").
		SaveX(ctx)

	newStudent := func(label, code string, section uuid.UUID) uuid.UUID {
		pupil := client.Person.Create().
			SetCasUserID(uuid.New()).
			SetFirstName("Reach").
			SetDisplayName("Reach " + label + " " + tag).
			SaveX(ctx)
		student := client.Student.Create().
			SetPersonID(pupil.ID).
			SetAdmissionNumber(code + "-" + tag).
			SetStudentCode(code + "-" + tag).
			SaveX(ctx)
		client.StudentEnrollment.Create().
			SetStudentID(student.ID).
			SetAcademicSessionID(session.ID).
			SetSectionID(section).
			SetEnrollmentDate(today).
			SaveX(ctx)
		return student.ID
	}

	world := &studentWriteWorld{
		t:        t,
		db:       db,
		server:   &Server{guard: studentWriteGuard{}},
		personID: person.ID,
		mine:     mine.ID,
		theirs:   theirs.ID,
		taught:   newStudent("Taught", "RTA", mine.ID),
		untaught: newStudent("Untaught", "RUN", theirs.ID),
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireGenuineScope()
	db.Forget()
	return world
}

func (w *studentWriteWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.StudentsWrite, authorization.StudentsWriteAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer writes every row and proves nothing about scoping")
	}
	if viewer.PersonID == nil || *viewer.PersonID != w.personID {
		w.t.Fatalf("the viewer must resolve to the seeded person %s, got %v", w.personID, viewer.PersonID)
	}
	if len(viewer.SectionIDs) == 0 {
		w.t.Fatal("the viewer carries no section: the predicate would render WHERE FALSE and " +
			"every refusal below would pass for the wrong reason")
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the decision must carry a teacher-assignment reach, got %+v", decision)
	}
}

func (w *studentWriteWorld) patchStudent(id uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", id.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	rec := httptest.NewRecorder()
	w.server.updateStudent(rec,
		httptest.NewRequest("PATCH", "/api/v1/students/"+id.String(),
			strings.NewReader(body)).WithContext(ctx))
	return rec
}

func (w *studentWriteWorld) studentCode(id uuid.UUID) string {
	w.t.Helper()

	row, err := w.db.Client.Student.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("student %s could not be read back inside the transaction: %v", id, err)
	}
	if row.StudentCode == nil {
		return ""
	}
	return *row.StudentCode
}

func TestUpdateStudentWritesOnlyInsideTheCallersReach(t *testing.T) {
	w := newStudentWriteWorld(t)
	before := w.studentCode(w.untaught)

	rec := w.patchStudent(w.untaught, `{"student_code":"SMUGGLED"}`)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("a student outside the caller's reach must answer 404 and never 403, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if after := w.studentCode(w.untaught); after != before {
		t.Fatalf("the write landed on a student the caller cannot reach: student_code went "+
			"from %q to %q", before, after)
	}
}

func TestUpdateStudentStillWritesInsideTheCallersReach(t *testing.T) {
	w := newStudentWriteWorld(t)

	rec := w.patchStudent(w.taught, `{"student_code":"REACHED"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("a student the caller teaches must still be writable; a scope that admits "+
			"nothing looks exactly like a refusal. want 200, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if code := w.studentCode(w.taught); code != "REACHED" {
		t.Fatalf("the permitted write did not land: student_code is %q", code)
	}
}

func (w *studentWriteWorld) whenTheRowLeavesScopeMidWrite(student uuid.UUID) {
	w.t.Helper()

	slipped := false
	w.db.Client.Student.Use(func(next tenantent.Mutator) tenantent.Mutator {
		return hook.StudentFunc(func(ctx context.Context, m *tenantent.StudentMutation) (tenantent.Value, error) {
			if !slipped {
				slipped = true
				if _, err := w.db.Client.StudentEnrollment.Update().
					Where(entenrollment.StudentID(student), entenrollment.SectionID(w.mine)).
					SetSectionID(w.theirs).
					Save(ctx); err != nil {
					return nil, err
				}
			}
			return next.Mutate(ctx, m)
		})
	})
}

func TestUpdateStudentRefusesARowThatLeftScopeAfterTheReachCheck(t *testing.T) {
	w := newStudentWriteWorld(t)
	before := w.studentCode(w.taught)
	w.whenTheRowLeavesScopeMidWrite(w.taught)

	rec := w.patchStudent(w.taught, `{"student_code":"RACED"}`)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("the student was moved out of the caller's section after the reach check "+
			"admitted it, so the write must match nothing and answer 404, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if after := w.studentCode(w.taught); after != before {
		t.Fatalf("the reach check passed and then the row left the caller's scope, yet the "+
			"write still landed: student_code went from %q to %q. The scope predicate is not "+
			"in the UPDATE itself", before, after)
	}
}

func (w *studentWriteWorld) withdrawalReason(id uuid.UUID) *string {
	w.t.Helper()

	row, err := w.db.Client.Student.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("student %s could not be read back inside the transaction: %v", id, err)
	}
	return row.WithdrawalReason
}

func TestAnExplicitNullClearsTheColumnWhileAnOmittedFieldLeavesIt(t *testing.T) {
	w := newStudentWriteWorld(t)

	if rec := w.patchStudent(w.taught, `{"withdrawal_reason":"moved city"}`); rec.Code != http.StatusOK {
		t.Fatalf("seeding the reason failed with %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rec := w.patchStudent(w.taught, `{"student_code":"KEPT"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if reason := w.withdrawalReason(w.taught); reason == nil || *reason != "moved city" {
		t.Fatalf("an omitted field must leave the column alone, got %v", reason)
	}

	rec = w.patchStudent(w.taught, `{"withdrawal_reason":null}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if reason := w.withdrawalReason(w.taught); reason != nil {
		t.Fatalf("an explicit null must clear the column, got %q", *reason)
	}
	if code := w.studentCode(w.taught); code != "KEPT" {
		t.Fatalf("clearing one column must not disturb another: student_code is %q", code)
	}
}

func TestAColumnThatAlwaysHasAValueRefusesAnExplicitNull(t *testing.T) {
	w := newStudentWriteWorld(t)
	before := w.studentCode(w.taught)

	rec := w.patchStudent(w.taught, `{"status":null}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a null on a column that is never null must be refused, not ignored; "+
			"want 400, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if after := w.studentCode(w.taught); after != before {
		t.Fatalf("the refused patch still wrote: student_code went from %q to %q", before, after)
	}
}
