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
	entlink "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/studentguardian"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type linkPatchGuard struct {
	admin    uuid.UUID
	teacher  uuid.UUID
	guardian uuid.UUID
}

func (g linkPatchGuard) Allow(_ context.Context, sub *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if sub == nil {
		return authorization.Decision{}, nil
	}
	narrowed := func(reach authorization.Reach, rule string) (authorization.Decision, error) {
		if strings.HasSuffix(string(entity), "_all") {
			return authorization.Decision{}, nil
		}
		return authorization.Decision{Allowed: true, Rule: rule, Reach: reach, HasReach: true}, nil
	}

	switch sub.CASUserID {
	case g.admin:
		return authorization.Decision{Allowed: true, Rule: "guardian link test: admin"}, nil
	case g.teacher:
		return narrowed(authorization.ReachTeacherAssignment, "guardian link test: teacher")
	case g.guardian:
		return narrowed(authorization.ReachGuardianWard, "guardian link test: guardian")
	}
	return authorization.Decision{}, nil
}

func (g linkPatchGuard) Name() string { return "guardian link patch test guard" }

type linkPatchWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server

	adminCtx    context.Context
	teacherCtx  context.Context
	guardianCtx context.Context

	guardianID uuid.UUID

	taughtStudent   uuid.UUID
	untaughtStudent uuid.UUID

	taughtEnrollment   uuid.UUID
	untaughtEnrollment uuid.UUID
}

func newLinkPatchWorld(t *testing.T) *linkPatchWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]
	today := time.Now().UTC()

	branch := client.Branch.Create().
		SetName("Link Branch " + tag).
		SetCode("LBR-" + tag).
		SaveX(ctx)
	session := client.AcademicSession.Create().
		SetName("Link Session " + tag).
		SetCode("LSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)
	grade := client.GradeLevel.Create().
		SetName("Link Grade " + tag).
		SetCode("LGR-" + tag).
		SetSequence(1).
		SaveX(ctx)
	taughtSection := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").
		SetCode("LSA-" + tag).
		SaveX(ctx)
	otherSection := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("B").
		SetCode("LSB-" + tag).
		SaveX(ctx)

	adminCAS := uuid.New()

	teacherCAS := uuid.New()
	teacherPerson := client.Person.Create().
		SetCasUserID(teacherCAS).
		SetFirstName("Link").
		SetDisplayName("Link Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(teacherPerson.ID).
		SetEmployeeCode("LEM-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().SetStaffID(staff.ID).SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(taughtSection.ID).
		SetRoleType("class_teacher").
		SaveX(ctx)

	guardianCAS := uuid.New()
	guardianPerson := client.Person.Create().
		SetCasUserID(guardianCAS).
		SetFirstName("Link").
		SetDisplayName("Link Guardian " + tag).
		SaveX(ctx)
	guardian := client.Guardian.Create().SetPersonID(guardianPerson.ID).SaveX(ctx)

	ward := func(label string, sectionID uuid.UUID) (uuid.UUID, uuid.UUID) {
		person := client.Person.Create().
			SetCasUserID(uuid.New()).
			SetFirstName("Link").
			SetDisplayName("Link " + label + " " + tag).
			SaveX(ctx)
		row := client.Student.Create().
			SetPersonID(person.ID).
			SetAdmissionNumber("LAD-" + label + "-" + tag).
			SaveX(ctx)
		client.StudentGuardian.Create().
			SetStudentID(row.ID).
			SetGuardianID(guardian.ID).
			SetRelationshipType("mother").
			SetCanViewAcademic(true).
			SaveX(ctx)
		enrolled := client.StudentEnrollment.Create().
			SetStudentID(row.ID).
			SetAcademicSessionID(session.ID).
			SetSectionID(sectionID).
			SetEnrollmentDate(today).
			SaveX(ctx)
		return row.ID, enrolled.ID
	}

	world := &linkPatchWorld{
		t:  t,
		db: db,
		server: &Server{guard: linkPatchGuard{
			admin: adminCAS, teacher: teacherCAS, guardian: guardianCAS,
		}},
		guardianID: guardian.ID,
	}
	world.taughtStudent, world.taughtEnrollment = ward("taught", taughtSection.ID)
	world.untaughtStudent, world.untaughtEnrollment = ward("untaught", otherSection.ID)

	conn := &postgres.TenantConn{Client: client}
	subject := func(id uuid.UUID) context.Context {
		return postgres.WithConn(
			authorization.WithSubject(ctx, &authorization.Subject{CASUserID: id}), conn)
	}
	world.adminCtx = subject(adminCAS)
	world.teacherCtx = subject(teacherCAS)
	world.guardianCtx = subject(guardianCAS)

	world.requireGenuineViewers()
	db.Forget()
	return world
}

func (w *linkPatchWorld) requireGenuineViewers() {
	w.t.Helper()

	admin, _, err := w.server.scopeFor(w.adminCtx,
		authorization.GuardiansWrite, authorization.GuardiansWriteAll)
	if err != nil {
		w.t.Fatalf("the admin viewer could not be resolved: %v", err)
	}
	if !admin.Unrestricted {
		w.t.Fatal("the admin must be unrestricted, or the happy path proves nothing about the edit")
	}

	teacher, _, err := w.server.scopeFor(w.teacherCtx,
		authorization.StudentsRead, authorization.StudentsReadAll)
	if err != nil {
		w.t.Fatalf("the teacher viewer could not be resolved: %v", err)
	}
	if teacher.Unrestricted {
		w.t.Fatal("an unrestricted teacher reaches every student and would never see a 404")
	}
	if len(teacher.SectionIDs) != 1 {
		w.t.Fatalf("the teacher must hold exactly the taught section, got %v", teacher.SectionIDs)
	}

	guardian, _, err := w.server.scopeFor(w.guardianCtx,
		authorization.EnrollmentsRead, authorization.EnrollmentsReadAll)
	if err != nil {
		w.t.Fatalf("the guardian viewer could not be resolved: %v", err)
	}
	if guardian.Unrestricted {
		w.t.Fatal("an unrestricted guardian reads every row and would not feel the gate")
	}
	if guardian.GuardianID == nil {
		w.t.Fatal("the viewer carries no guardian: the gate assertions would pass for the wrong reason")
	}
}

func (w *linkPatchWorld) patch(ctx context.Context, decision *authorization.Decision,
	studentID uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()

	if decision == nil {
		decision = &authorization.Decision{Allowed: true, Rule: "guardian link test: route"}
	}
	ctx = authorization.WithDecision(ctx, *decision)

	route := chi.NewRouteContext()
	route.URLParams.Add("id", w.guardianID.String())
	route.URLParams.Add("student_id", studentID.String())
	ctx = context.WithValue(ctx, chi.RouteCtxKey, route)

	target := "/api/v1/guardians/" + w.guardianID.String() + "/students/" + studentID.String()
	rec := httptest.NewRecorder()
	w.server.updateGuardianLink(rec, httptest.NewRequest("PATCH", target,
		strings.NewReader(body)).WithContext(ctx))
	return rec
}

func (w *linkPatchWorld) guardianEnrollments() []uuid.UUID {
	w.t.Helper()

	rec := httptest.NewRecorder()
	w.server.listEnrollments(rec,
		httptest.NewRequest("GET", "/api/v1/enrollments", nil).WithContext(w.guardianCtx))
	if rec.Code != http.StatusOK {
		w.t.Fatalf("the guardian must be able to list enrolments, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Enrollments []struct {
			ID uuid.UUID `json:"id"`
		} `json:"enrollments"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("the enrolment envelope did not parse: %v (%q)", err, rec.Body.String())
	}

	ids := make([]uuid.UUID, 0, len(body.Enrollments))
	for _, row := range body.Enrollments {
		ids = append(ids, row.ID)
	}
	return ids
}

func (w *linkPatchWorld) storedGate(studentID uuid.UUID) bool {
	w.t.Helper()

	row, err := w.db.Client.StudentGuardian.Query().
		Where(entlink.GuardianID(w.guardianID), entlink.StudentID(studentID)).
		Only(context.Background())
	if err != nil {
		w.t.Fatalf("the link could not be read back: %v", err)
	}
	return row.CanViewAcademic
}

func linkPatchHolds(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func TestPatchingTheAcademicGateRevokesTheGuardiansReachOnThatWard(t *testing.T) {
	w := newLinkPatchWorld(t)

	before := w.guardianEnrollments()
	if !linkPatchHolds(before, w.taughtEnrollment) || !linkPatchHolds(before, w.untaughtEnrollment) {
		t.Fatalf("both wards must start reachable or the revocation proves nothing, got %v", before)
	}

	rec := w.patch(w.adminCtx, nil, w.taughtStudent, `{"can_view_academic":false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 from the edit, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if w.storedGate(w.taughtStudent) {
		t.Fatal("the edit answered 200 but can_view_academic is still true in the row")
	}

	after := w.guardianEnrollments()
	if linkPatchHolds(after, w.taughtEnrollment) {
		t.Fatalf("can_view_academic was set to false and the ward's enrolment is still reachable: %v", after)
	}
	if !linkPatchHolds(after, w.untaughtEnrollment) {
		t.Fatalf("the edit narrowed a link it was not asked to touch: %v", after)
	}
}

func TestPatchingALinkWhoseStudentTheCallerCannotReachIsNotFound(t *testing.T) {
	w := newLinkPatchWorld(t)

	rec := w.patch(w.teacherCtx, nil, w.taughtStudent, `{"can_view_academic":false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("the teacher reaches this ward and must be allowed to edit, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rec = w.patch(w.teacherCtx, nil, w.untaughtStudent, `{"can_view_academic":false}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("a ward outside the caller's reach must answer 404, never 403, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !w.storedGate(w.untaughtStudent) {
		t.Fatal("the refused edit still wrote the row")
	}
}

type linkArmGuard struct {
	guardians authorization.Reach
	students  authorization.Reach
}

func (g linkArmGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if strings.HasSuffix(string(entity), "_all") {
		return authorization.Decision{}, nil
	}
	switch {
	case strings.HasPrefix(string(entity), "core.guardians."):
		return authorization.Decision{Allowed: true, Rule: "guardian link arms: guardians",
			Reach: g.guardians, HasReach: true}, nil
	case strings.HasPrefix(string(entity), "core.students."):
		return authorization.Decision{Allowed: true, Rule: "guardian link arms: students",
			Reach: g.students, HasReach: true}, nil
	}
	return authorization.Decision{Allowed: true, Rule: "guardian link arms: other"}, nil
}

func (g linkArmGuard) Name() string { return "guardian link arm test guard" }

func (w *linkPatchWorld) onlyLinkWrite() string {
	w.t.Helper()

	var writes []testsupport.Statement
	for _, stmt := range w.db.Statements() {
		if stmt.Kind == "exec" && stmt.Touches("student_guardians") {
			writes = append(writes, stmt)
		}
	}
	if len(writes) != 1 {
		w.t.Fatalf("want exactly one write to student_guardians, got %d: %v", len(writes), writes)
	}
	if !strings.HasPrefix(writes[0].Query, `UPDATE "student_guardians"`) {
		w.t.Fatalf("want an UPDATE on student_guardians, got %q", writes[0].Query)
	}
	return writes[0].Query
}

func TestThePatchThatEditsALinkCarriesBothArmsOfItsScopeInTheUpdate(t *testing.T) {
	w := newLinkPatchWorld(t)
	w.server.guard = linkArmGuard{
		guardians: authorization.ReachSelf,
		students:  authorization.ReachGuardianWard,
	}

	w.db.Forget()
	rec := w.patch(w.guardianCtx, nil, w.taughtStudent, `{"can_pickup":false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	query := w.onlyLinkWrite()
	arms := map[string]string{
		"guardian": `EXISTS (SELECT "guardians"."id" FROM "guardians" ` +
			`WHERE "student_guardians"."guardian_id" = "guardians"."id" AND "guardians"."id" =`,
		"student": `EXISTS (SELECT "students"."id" FROM "students" ` +
			`WHERE "student_guardians"."student_id" = "students"."id" AND EXISTS`,
	}
	for arm, narrowing := range arms {
		if !strings.Contains(query, narrowing) {
			t.Fatalf("the update carries no %s narrowing, so it writes on the two ids alone and a "+
				"link that left the caller's reach between the check and the write is still "+
				"edited: %q", arm, query)
		}
	}
}

func TestPatchingALinkRefusesTheFieldsItMustNeverWrite(t *testing.T) {
	w := newLinkPatchWorld(t)

	cases := []struct {
		name string
		body string
		want int
	}{
		{"status", `{"status":"inactive"}`, http.StatusForbidden},
		{"student_id", `{"student_id":"` + w.untaughtStudent.String() + `"}`, http.StatusUnprocessableEntity},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := w.patch(w.adminCtx, nil, w.taughtStudent, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("want %d, got %d: %s", tc.want, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
		})
	}
}

func TestPatchingALinkRefusesAFieldThePolicyWithholds(t *testing.T) {
	w := newLinkPatchWorld(t)

	policy := &authorization.Decision{
		Allowed: true,
		Rule:    "guardian link test: can_pickup only",
		Fields:  included(entlink.FieldCanPickup),
	}

	rec := w.patch(w.adminCtx, policy, w.taughtStudent, `{"can_view_academic":false}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a policy that withholds can_view_academic must refuse the edit, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !w.storedGate(w.taughtStudent) {
		t.Fatal("the refused edit still wrote the row")
	}

	rec = w.patch(w.adminCtx, policy, w.taughtStudent, `{"can_pickup":false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("the one field the policy permits must still be writable, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}
