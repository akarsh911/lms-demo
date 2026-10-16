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
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type placementDBGuard struct{}

func (placementDBGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.ContentPlacementsRead,
		authorization.ContentPlacementsWrite,
		authorization.ContentPlacementsDelete,
		authorization.ContentPlacementsCreate,
		authorization.LibraryRead:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTeacherAssignment,
			HasReach: true,
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (placementDBGuard) Name() string { return "placement database test guard" }

type placementDBWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	personID uuid.UUID

	taughtCurriculumID uuid.UUID
	otherCurriculumID  uuid.UUID

	reachable   []uuid.UUID
	unreachable uuid.UUID
}

func newPlacementDBWorld(t *testing.T) *placementDBWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	branch := client.Branch.Create().
		SetName("Harness Branch " + tag).
		SetCode("HBR-" + tag).
		SaveX(ctx)

	today := time.Now().UTC()
	session := client.AcademicSession.Create().
		SetName("Harness Session " + tag).
		SetCode("HSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)

	taughtGrade := client.GradeLevel.Create().
		SetName("Harness Taught Grade " + tag).
		SetCode("HGT-" + tag).
		SetSequence(1).
		SaveX(ctx)
	otherGrade := client.GradeLevel.Create().
		SetName("Harness Other Grade " + tag).
		SetCode("HGO-" + tag).
		SetSequence(2).
		SaveX(ctx)

	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(taughtGrade.ID).
		SetName("A").
		SetCode("HSC-" + tag).
		SaveX(ctx)

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Harness").
		SetDisplayName("Harness Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("HEM-" + tag).
		SaveX(ctx)
	teacher := client.Teacher.Create().
		SetStaffID(staff.ID).
		SaveX(ctx)
	client.TeacherAssignment.Create().
		SetAcademicSessionID(session.ID).
		SetTeacherID(teacher.ID).
		SetSectionID(section.ID).
		SetRoleType("class_teacher").
		SaveX(ctx)

	firstSubject := client.Subject.Create().
		SetName("Harness Maths " + tag).
		SetCode("HSA-" + tag).
		SaveX(ctx)
	secondSubject := client.Subject.Create().
		SetName("Harness Science " + tag).
		SetCode("HSB-" + tag).
		SaveX(ctx)

	newCurriculum := func(code string, subject, grade uuid.UUID) *tenantent.Curriculum {
		return client.Curriculum.Create().
			SetName("Harness Curriculum " + code).
			SetCode(code + "-" + tag).
			SetAcademicSessionID(session.ID).
			SetSubjectID(subject).
			SetGradeLevelID(grade).
			SaveX(ctx)
	}

	taught := newCurriculum("HCA", firstSubject.ID, taughtGrade.ID)
	alsoTaught := newCurriculum("HCB", secondSubject.ID, taughtGrade.ID)
	other := newCurriculum("HCC", firstSubject.ID, otherGrade.ID)

	item := client.ContentItem.Create().
		SetTitle("Harness Atlas " + tag).
		SetAudience(entcontentitem.AudienceSchool).
		SetOwnerPersonID(person.ID).
		SaveX(ctx)

	newPlacement := func(curriculum uuid.UUID) uuid.UUID {
		return client.ContentPlacement.Create().
			SetCurriculumID(curriculum).
			SetContentItemID(item.ID).
			SetGrain(entplacement.GrainCurriculum).
			SaveX(ctx).ID
	}

	world := &placementDBWorld{
		t:                  t,
		db:                 db,
		server:             &Server{guard: placementDBGuard{}},
		personID:           person.ID,
		taughtCurriculumID: taught.ID,
		otherCurriculumID:  other.ID,
		reachable:          []uuid.UUID{newPlacement(taught.ID), newPlacement(alsoTaught.ID)},
		unreachable:        newPlacement(other.ID),
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireGenuineScope()
	db.Forget()
	return world
}

func (w *placementDBWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.ContentPlacementsRead, authorization.ContentPlacementsReadAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer would read every row and prove nothing about scoping")
	}
	if viewer.PersonID == nil || *viewer.PersonID != w.personID {
		w.t.Fatalf("the viewer must resolve to the seeded person %s, got %v", w.personID, viewer.PersonID)
	}
	if viewer.TeacherID == nil {
		w.t.Fatal("the viewer must resolve to a teacher, otherwise the read predicate refuses everything")
	}
	if len(viewer.SectionIDs) == 0 {
		w.t.Fatal("the viewer carries no section: the predicate would render WHERE FALSE " +
			"and every refusal below would pass for the wrong reason")
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the decision must carry a teacher-assignment reach, got %+v", decision)
	}
}

func (w *placementDBWorld) call(handler http.HandlerFunc, method, target, body string,
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

func (w *placementDBWorld) placement(id uuid.UUID) *tenantent.ContentPlacement {
	w.t.Helper()

	row, err := w.db.Client.ContentPlacement.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("placement %s could not be read back inside the transaction: %v", id, err)
	}
	return row
}

func (w *placementDBWorld) placementGone(id uuid.UUID) bool {
	w.t.Helper()

	_, err := w.db.Client.ContentPlacement.Get(context.Background(), id)
	if err == nil {
		return false
	}
	if tenantent.IsNotFound(err) {
		return true
	}
	w.t.Fatalf("placement %s could not be read back inside the transaction: %v", id, err)
	return false
}

func (w *placementDBWorld) requireCorrelatedScoping() {
	w.t.Helper()
	w.requireCorrelatedScopingOn("query")
}

func (w *placementDBWorld) requireCorrelatedScopingOn(kind string) {
	w.t.Helper()

	queries := w.statementsOn(kind, "content_placements")
	if len(queries) == 0 {
		w.t.Fatalf("no %s statement reached content_placements", kind)
	}
	for _, stmt := range queries {
		if strings.Contains(stmt.Query, "FALSE") {
			w.t.Fatalf("the scope collapsed to a refusal, so nothing was proved about filtering: %q",
				stmt.Query)
		}
	}
	if !strings.Contains(queries[0].Query, "EXISTS (") {
		w.t.Fatalf("the read must be narrowed by the correlated subquery the stub cannot evaluate, got %q",
			queries[0].Query)
	}
}

func (w *placementDBWorld) statementsOn(kind, table string) []testsupport.Statement {
	var out []testsupport.Statement
	for _, stmt := range w.db.Statements() {
		if stmt.Kind == kind && stmt.Touches(table) {
			out = append(out, stmt)
		}
	}
	return out
}

func placementIDsOf(t *testing.T, rec *httptest.ResponseRecorder) []uuid.UUID {
	t.Helper()

	var body struct {
		ContentPlacements []struct {
			ID uuid.UUID `json:"id"`
		} `json:"content_placements"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the list response is not JSON: %v (%q)", err, rec.Body.String())
	}
	if body.Count != len(body.ContentPlacements) {
		t.Fatalf("count %d does not match the %d rows returned", body.Count, len(body.ContentPlacements))
	}

	ids := make([]uuid.UUID, 0, len(body.ContentPlacements))
	for _, row := range body.ContentPlacements {
		ids = append(ids, row.ID)
	}
	return ids
}

func placementListed(ids []uuid.UUID, want uuid.UUID) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func TestListPlacementsReturnsOnlyTheReachableRowsFromPostgres(t *testing.T) {
	w := newPlacementDBWorld(t)

	rec := w.call(w.server.listPlacements, "GET",
		"/api/v1/placements?curriculum_id="+w.taughtCurriculumID.String(), "", uuid.Nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScoping()

	ids := placementIDsOf(t, rec)
	if len(ids) != 1 || ids[0] != w.reachable[0] {
		t.Fatalf("the reachable placement %s must come back, got %v", w.reachable[0], ids)
	}

	w.db.Forget()
	rec = w.call(w.server.listPlacements, "GET",
		"/api/v1/placements?curriculum_id="+w.otherCurriculumID.String(), "", uuid.Nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScoping()

	if ids := placementIDsOf(t, rec); len(ids) != 0 {
		t.Fatalf("the unreachable curriculum must yield nothing, got %v", ids)
	}

	w.db.Forget()
	rec = w.call(w.server.listPlacements, "GET", "/api/v1/placements", "", uuid.Nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScoping()

	ids = placementIDsOf(t, rec)
	for _, want := range w.reachable {
		if !placementListed(ids, want) {
			t.Fatalf("the reachable placement %s is missing from %v", want, ids)
		}
	}
	if placementListed(ids, w.unreachable) {
		t.Fatalf("the unreachable placement %s was returned in %v", w.unreachable, ids)
	}
}

func TestGetPlacementOutsideTheViewersCurriculaIsNotFoundInPostgres(t *testing.T) {
	w := newPlacementDBWorld(t)

	rec := w.call(w.server.getPlacement, "GET",
		"/api/v1/placements/"+w.reachable[0].String(), "", w.reachable[0])
	if rec.Code != http.StatusOK {
		t.Fatalf("the reachable placement must be readable, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScoping()

	w.db.Forget()
	rec = w.call(w.server.getPlacement, "GET",
		"/api/v1/placements/"+w.unreachable.String(), "", w.unreachable)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScoping()

	if w.placement(w.unreachable).Status != entplacement.StatusProposed {
		t.Fatal("a read must not have touched the row it refused")
	}
}

func TestWritingAPlacementOutsideTheViewersCurriculaChangesNothingInPostgres(t *testing.T) {
	w := newPlacementDBWorld(t)

	rec := w.call(w.server.updatePlacement, "PATCH",
		"/api/v1/placements/"+w.unreachable.String(), `{"status":"confirmed"}`, w.unreachable)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 on the update, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScoping()

	row := w.placement(w.unreachable)
	if row.Status != entplacement.StatusProposed || row.ConfirmedBy != nil || row.ConfirmedAt != nil {
		t.Fatalf("the refused update was written anyway: status %s confirmed_by %v confirmed_at %v",
			row.Status, row.ConfirmedBy, row.ConfirmedAt)
	}

	w.db.Forget()
	rec = w.call(w.server.deletePlacement, "DELETE",
		"/api/v1/placements/"+w.unreachable.String(), "", w.unreachable)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 on the delete, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScopingOn("exec")
	if reads := w.statementsOn("query", "content_placements"); len(reads) > 0 {
		t.Fatalf("the delete must carry its own scope, not check reachability first: %q",
			reads[0].Query)
	}

	if w.placementGone(w.unreachable) {
		t.Fatal("the delete was refused with 404 and the row was removed anyway")
	}
}

func TestWritingAReachablePlacementStillSucceedsInPostgres(t *testing.T) {
	w := newPlacementDBWorld(t)

	rec := w.call(w.server.updatePlacement, "PATCH",
		"/api/v1/placements/"+w.reachable[0].String(), `{"status":"confirmed"}`, w.reachable[0])
	if rec.Code != http.StatusOK {
		t.Fatalf("the write gate refuses everything, so the 404s prove nothing; got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	row := w.placement(w.reachable[0])
	if row.Status != entplacement.StatusConfirmed {
		t.Fatalf("the confirmation was not written, status is %s", row.Status)
	}
	if row.ConfirmedBy == nil || *row.ConfirmedBy != w.personID {
		t.Fatalf("the confirmer must be the caller %s, got %v", w.personID, row.ConfirmedBy)
	}

	w.db.Forget()
	rec = w.call(w.server.deletePlacement, "DELETE",
		"/api/v1/placements/"+w.reachable[1].String(), "", w.reachable[1])
	if rec.Code != http.StatusNoContent {
		t.Fatalf("want 204 deleting a reachable placement, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !w.placementGone(w.reachable[1]) {
		t.Fatal("the delete returned 204 but the row survived")
	}
}

func TestUpdatingAReachablePlacementCarriesItsScopeInTheUpdateStatementInPostgres(t *testing.T) {
	w := newPlacementDBWorld(t)

	rec := w.call(w.server.updatePlacement, "PATCH",
		"/api/v1/placements/"+w.reachable[0].String(), `{"status":"confirmed"}`, w.reachable[0])
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScopingOn("exec")

	writes := w.statementsOn("exec", "content_placements")
	if !strings.HasPrefix(writes[0].Query, `UPDATE "content_placements"`) {
		t.Fatalf("want the write to be the UPDATE itself, got %q", writes[0].Query)
	}
}

func TestThePredicatedUpdateCountsOnlyTheRowsTheViewerMayWriteInPostgres(t *testing.T) {
	w := newPlacementDBWorld(t)

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.ContentPlacementsWrite, authorization.ContentPlacementsWriteAll)
	if err != nil {
		t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}

	confirm := func(id uuid.UUID) int {
		w.t.Helper()
		n, err := w.db.Client.ContentPlacement.Update().
			Where(entplacement.ID(id), access.ContentPlacementsWritableBy(viewer, decision)).
			SetStatus(entplacement.StatusConfirmed).
			Save(context.Background())
		if err != nil {
			t.Fatalf("the predicated update failed against Postgres: %v", err)
		}
		return n
	}

	if n := confirm(w.unreachable); n != 0 {
		t.Fatalf("a row outside the viewer's scope must be counted 0 by the predicated update, "+
			"got %d; the 404 the handler answers rests on exactly this number", n)
	}
	if row := w.placement(w.unreachable); row.Status != entplacement.StatusProposed {
		t.Fatalf("the predicated update wrote a row the viewer may not write: status %s", row.Status)
	}

	if n := confirm(w.reachable[0]); n != 1 {
		t.Fatalf("a row inside the viewer's scope must be counted 1, got %d; a predicate that "+
			"admits nothing would also count 0 and every refusal above would pass for the "+
			"wrong reason", n)
	}
	if row := w.placement(w.reachable[0]); row.Status != entplacement.StatusConfirmed {
		t.Fatalf("the predicated update counted the row but did not write it: status %s", row.Status)
	}
}
