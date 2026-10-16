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
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type standingDebtWorld struct {
	t      *testing.T
	client *tenantent.Client
	server *Server
	ctx    context.Context

	branchID   uuid.UUID
	branchCode string
	sessionID  uuid.UUID
	sectionID  uuid.UUID
	offeringID uuid.UUID
	roomID     uuid.UUID
	teacherID  uuid.UUID
	spareSubID uuid.UUID
}

func newStandingDebtWorld(t *testing.T) *standingDebtWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	branch := client.Branch.Create().
		SetName("Debt Branch " + tag).
		SetCode("DBR-" + tag).
		SaveX(ctx)

	today := time.Now().UTC()
	session := client.AcademicSession.Create().
		SetName("Debt Session " + tag).
		SetCode("DSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("Debt Grade " + tag).
		SetCode("DGR-" + tag).
		SetSequence(77).
		SaveX(ctx)

	room := client.Room.Create().
		SetBranchID(branch.ID).
		SetName("Debt Room " + tag).
		SetCode("DRO-" + tag).
		SaveX(ctx)

	person := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Debt").
		SetDisplayName("Debt Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("DEM-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().
		SetStaffID(staff.ID).
		SaveX(ctx)

	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").
		SetCode("DSC-" + tag).
		SetCapacity(30).
		SetRoomID(room.ID).
		SetClassTeacherID(teacher.ID).
		SaveX(ctx)

	subject := client.Subject.Create().
		SetName("Debt Maths " + tag).
		SetCode("DSU-" + tag).
		SaveX(ctx)
	spare := client.Subject.Create().
		SetName("Debt Music " + tag).
		SetCode("DSV-" + tag).
		SaveX(ctx)
	offering := client.SubjectOffering.Create().
		SetAcademicSessionID(session.ID).
		SetSectionID(section.ID).
		SetSubjectID(subject.ID).
		SetMinutesPerWeek(200).
		SaveX(ctx)

	world := &standingDebtWorld{
		t:          t,
		client:     client,
		server:     &Server{},
		branchID:   branch.ID,
		branchCode: branch.Code,
		sessionID:  session.ID,
		sectionID:  section.ID,
		offeringID: offering.ID,
		roomID:     room.ID,
		teacherID:  teacher.ID,
		spareSubID: spare.ID,
	}

	ctx = authorization.WithDecision(ctx, authorization.Decision{
		Allowed: true,
		Rule:    "standing debt test, no field policy",
	})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	db.Forget()
	return world
}

func (w *standingDebtWorld) call(handler http.HandlerFunc, method, target, body string,
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

func (w *standingDebtWorld) wantStatus(rec *httptest.ResponseRecorder, want int, naming string) {
	w.t.Helper()

	if rec.Code != want {
		w.t.Fatalf("want %d, got %d: %s", want, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if naming != "" && !strings.Contains(rec.Body.String(), naming) {
		w.t.Fatalf("the response must name %q, got %s", naming, strings.TrimSpace(rec.Body.String()))
	}
}

func (w *standingDebtWorld) patchSection(body string) *httptest.ResponseRecorder {
	return w.call(w.server.updateSection, "PATCH",
		"/api/v1/sections/"+w.sectionID.String(), body, w.sectionID)
}

func (w *standingDebtWorld) patchOffering(body string) *httptest.ResponseRecorder {
	return w.call(w.server.updateOffering, "PATCH",
		"/api/v1/subject-offerings/"+w.offeringID.String(), body, w.offeringID)
}

func (w *standingDebtWorld) section() *tenantent.Section {
	w.t.Helper()
	return w.client.Section.GetX(context.Background(), w.sectionID)
}

func (w *standingDebtWorld) offering() *tenantent.SubjectOffering {
	w.t.Helper()
	return w.client.SubjectOffering.GetX(context.Background(), w.offeringID)
}

func TestUpdateBranchRefusesANewCode(t *testing.T) {
	w := newStandingDebtWorld(t)

	rec := w.call(w.server.updateBranch, "PATCH", "/api/v1/branches/"+w.branchID.String(),
		`{"name":"Renamed","code":"DBR-CHANGED"}`, w.branchID)
	w.wantStatus(rec, http.StatusUnprocessableEntity, "code")

	after := w.client.Branch.GetX(context.Background(), w.branchID)
	if after.Code != w.branchCode {
		t.Fatalf("the refused patch still changed the code: %q became %q", w.branchCode, after.Code)
	}
	if after.Name == "Renamed" {
		t.Fatalf("the refused patch applied the rest of the body: name is now %q", after.Name)
	}

	ok := w.call(w.server.updateBranch, "PATCH", "/api/v1/branches/"+w.branchID.String(),
		`{"name":"Renamed"}`, w.branchID)
	w.wantStatus(ok, http.StatusOK, "")

	renamed := w.client.Branch.GetX(context.Background(), w.branchID)
	if renamed.Name != "Renamed" {
		t.Fatalf("the permitted patch did not land: name is %q", renamed.Name)
	}
	if renamed.Code != w.branchCode {
		t.Fatalf("the code moved without being asked to: %q became %q", w.branchCode, renamed.Code)
	}
}

func TestUpdateSectionTellsOmittedApartFromNull(t *testing.T) {
	w := newStandingDebtWorld(t)

	w.wantStatus(w.patchSection(`{"name":"B"}`), http.StatusOK, "")

	left := w.section()
	if left.RoomID == nil || *left.RoomID != w.roomID {
		t.Fatalf("omitting room_id must leave it alone, got %v", left.RoomID)
	}
	if left.ClassTeacherID == nil || *left.ClassTeacherID != w.teacherID {
		t.Fatalf("omitting class_teacher_id must leave it alone, got %v", left.ClassTeacherID)
	}
	if left.Capacity == nil || *left.Capacity != 30 {
		t.Fatalf("omitting capacity must leave it alone, got %v", left.Capacity)
	}

	w.wantStatus(w.patchSection(`{"room_id":null,"class_teacher_id":null}`), http.StatusOK, "")

	cleared := w.section()
	if cleared.RoomID != nil {
		t.Fatalf("an explicit null must clear room_id, got %v", *cleared.RoomID)
	}
	if cleared.ClassTeacherID != nil {
		t.Fatalf("an explicit null must clear class_teacher_id, got %v", *cleared.ClassTeacherID)
	}
	if cleared.Capacity == nil || *cleared.Capacity != 30 {
		t.Fatalf("clearing two fields must not disturb capacity, got %v", cleared.Capacity)
	}

	w.wantStatus(w.patchSection(`{"capacity":null}`), http.StatusOK, "")
	if w.section().Capacity != nil {
		t.Fatalf("an explicit null must clear capacity")
	}
}

func TestUpdateSectionRefusesNullOnAFieldThatAlwaysHasAValue(t *testing.T) {
	w := newStandingDebtWorld(t)

	w.wantStatus(w.patchSection(`{"name":null}`), http.StatusBadRequest, "name")
	w.wantStatus(w.patchSection(`{"status":null}`), http.StatusBadRequest, "status")

	if w.section().Name != "A" {
		t.Fatalf("the refused patch still changed the name")
	}
}

func TestOfferingWritesMinutesPerWeek(t *testing.T) {
	w := newStandingDebtWorld(t)

	body := `{"academic_session_id":"` + w.sessionID.String() +
		`","section_id":"` + w.sectionID.String() +
		`","subject_id":"` + w.spareSubID.String() +
		`","minutes_per_week":180}`
	rec := w.call(w.server.createOffering, "POST", "/api/v1/subject-offerings", body, uuid.Nil)
	w.wantStatus(rec, http.StatusCreated, `"minutes_per_week":180`)

	w.wantStatus(w.patchOffering(`{"minutes_per_week":240}`), http.StatusOK, "")
	if got := w.offering().MinutesPerWeek; got == nil || *got != 240 {
		t.Fatalf("the patch did not set minutes_per_week, got %v", got)
	}

	w.wantStatus(w.patchOffering(`{"periods_per_week":4}`), http.StatusOK, "")
	if got := w.offering().MinutesPerWeek; got == nil || *got != 240 {
		t.Fatalf("omitting minutes_per_week must leave it alone, got %v", got)
	}

	w.wantStatus(w.patchOffering(`{"minutes_per_week":null}`), http.StatusOK, "")
	if got := w.offering().MinutesPerWeek; got != nil {
		t.Fatalf("an explicit null must clear minutes_per_week, got %d", *got)
	}
}

func TestOfferingRefusesAnImpossibleWeek(t *testing.T) {
	w := newStandingDebtWorld(t)

	w.wantStatus(w.patchOffering(`{"minutes_per_week":-1}`), http.StatusBadRequest, "minutes_per_week")
	w.wantStatus(w.patchOffering(`{"minutes_per_week":10081}`),
		http.StatusUnprocessableEntity, "minutes_per_week")

	if got := w.offering().MinutesPerWeek; got == nil || *got != 200 {
		t.Fatalf("a refused patch still wrote minutes_per_week, got %v", got)
	}

	w.wantStatus(w.patchOffering(`{"minutes_per_week":10080}`), http.StatusOK, "")
	if got := w.offering().MinutesPerWeek; got == nil || *got != 10080 {
		t.Fatalf("the boundary must be accepted, got %v", got)
	}
}
