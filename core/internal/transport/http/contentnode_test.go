package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entcontentnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentnode"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type contentNodeGuard struct{ keys map[authorization.Entity]bool }

func (g contentNodeGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if !g.keys[entity] {
		return authorization.Decision{}, nil
	}
	return authorization.Decision{
		Allowed:  true,
		Reach:    authorization.ReachTeacherAssignment,
		HasReach: true,
	}, nil
}

func (contentNodeGuard) Name() string { return "content node database test guard" }

func contentNodeKeys() map[authorization.Entity]bool {
	return map[authorization.Entity]bool{
		authorization.LibraryRead:   true,
		authorization.LibraryCreate: true,
	}
}

type contentNodeWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	ctx    context.Context

	personID uuid.UUID

	writable    uuid.UUID
	unreachable uuid.UUID
}

func newContentNodeWorld(t *testing.T) *contentNodeWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	branch := client.Branch.Create().
		SetName("Node Branch " + tag).
		SetCode("NBR-" + tag).
		SaveX(ctx)

	today := time.Now().UTC()
	session := client.AcademicSession.Create().
		SetName("Node Session " + tag).
		SetCode("NSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)

	grade := client.GradeLevel.Create().
		SetName("Node Grade " + tag).
		SetCode("NGR-" + tag).
		SetSequence(1).
		SaveX(ctx)

	section := client.Section.Create().
		SetAcademicSessionID(session.ID).
		SetBranchID(branch.ID).
		SetGradeLevelID(grade.ID).
		SetName("A").
		SetCode("NSC-" + tag).
		SaveX(ctx)

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Node").
		SetDisplayName("Node Teacher " + tag).
		SaveX(ctx)
	staff := client.Staff.Create().
		SetPersonID(person.ID).
		SetEmployeeCode("NEM-" + tag).
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

	stranger := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Stranger").
		SetDisplayName("Node Stranger " + tag).
		SaveX(ctx)

	writable := client.ContentItem.Create().
		SetTitle("Node Atlas " + tag).
		SetAudience(entcontentitem.AudienceSchool).
		SetOwnerPersonID(person.ID).
		SaveX(ctx)

	unreachable := client.ContentItem.Create().
		SetTitle("Node Private Atlas " + tag).
		SetAudience(entcontentitem.AudienceOwner).
		SetOwnerPersonID(stranger.ID).
		SaveX(ctx)

	world := &contentNodeWorld{
		t:           t,
		db:          db,
		server:      &Server{guard: contentNodeGuard{keys: contentNodeKeys()}},
		personID:    person.ID,
		writable:    writable.ID,
		unreachable: unreachable.ID,
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireGenuineScope()
	db.Forget()
	return world
}

func (w *contentNodeWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.LibraryCreate, authorization.LibraryWriteAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer would write every row and prove nothing about scoping")
	}
	if viewer.PersonID == nil || *viewer.PersonID != w.personID {
		w.t.Fatalf("the viewer must resolve to the seeded person %s, got %v", w.personID, viewer.PersonID)
	}
	if viewer.TeacherID == nil {
		w.t.Fatal("the viewer must resolve to a teacher, otherwise the predicate refuses everything")
	}
	if len(viewer.SectionIDs) == 0 {
		w.t.Fatal("the viewer carries no section: the predicate would render WHERE FALSE " +
			"and every refusal below would pass for the wrong reason")
	}
	if !decision.HasReach || decision.Reach != authorization.ReachTeacherAssignment {
		w.t.Fatalf("the decision must carry a teacher-assignment reach, got %+v", decision)
	}

	reachable, err := reachWritableContentItem(context.Background(), w.db.Client,
		w.writable, viewer, decision)
	if err != nil {
		w.t.Fatalf("the writable reach query failed: %v", err)
	}
	if !reachable {
		w.t.Fatal("the seeded content item must be writable, otherwise every 404 below " +
			"passes for the wrong reason")
	}

	denied, err := reachWritableContentItem(context.Background(), w.db.Client,
		w.unreachable, viewer, decision)
	if err != nil {
		w.t.Fatalf("the writable reach query failed: %v", err)
	}
	if denied {
		w.t.Fatal("the stranger's content item must be unreachable, otherwise the 404 test " +
			"proves nothing")
	}
}

func (w *contentNodeWorld) call(handler http.HandlerFunc, method, target, body string,
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

func (w *contentNodeWorld) create(item uuid.UUID, body string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.server.createContentNode, "POST",
		"/api/v1/library/"+item.String()+"/nodes", body, item)
}

func (w *contentNodeWorld) list(item uuid.UUID, query string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.server.listContentNodes, "GET",
		"/api/v1/library/"+item.String()+"/nodes"+query, "", item)
}

func (w *contentNodeWorld) created(body string) *tenantent.ContentNode {
	w.t.Helper()

	rec := w.create(w.writable, body)
	if rec.Code != http.StatusCreated {
		w.t.Fatalf("want 201 creating %s, got %d: %s",
			body, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	return w.decodeNode(rec)
}

func (w *contentNodeWorld) decodeNode(rec *httptest.ResponseRecorder) *tenantent.ContentNode {
	w.t.Helper()

	var row tenantent.ContentNode
	if err := json.Unmarshal(rec.Body.Bytes(), &row); err != nil {
		w.t.Fatalf("the response is not a content node: %v (%q)", err, rec.Body.String())
	}
	return &row
}

func (w *contentNodeWorld) stored(id uuid.UUID) *tenantent.ContentNode {
	w.t.Helper()

	row, err := w.db.Client.ContentNode.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("node %s could not be read back inside the transaction: %v", id, err)
	}
	return row
}

func (w *contentNodeWorld) resolution(id uuid.UUID) time.Time {
	w.t.Helper()

	row := w.stored(id)
	if row.ResolvedAt == nil {
		w.t.Fatalf("node %s carries an engine section id with no resolved_at", id)
	}
	return *row.ResolvedAt
}

func (w *contentNodeWorld) rows(item uuid.UUID) []*tenantent.ContentNode {
	w.t.Helper()

	rows, err := w.db.Client.ContentNode.Query().
		Where(entcontentnode.ContentItemID(item)).
		Order(tenantent.Asc(entcontentnode.FieldSequence)).
		All(context.Background())
	if err != nil {
		w.t.Fatalf("the nodes of %s could not be read back: %v", item, err)
	}
	return rows
}

func (w *contentNodeWorld) listedIDs(rec *httptest.ResponseRecorder) []uuid.UUID {
	w.t.Helper()

	var body struct {
		ContentNodes []struct {
			ID uuid.UUID `json:"id"`
		} `json:"content_nodes"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("the list response is not JSON: %v (%q)", err, rec.Body.String())
	}
	if body.Count != len(body.ContentNodes) {
		w.t.Fatalf("count %d does not match the %d rows returned", body.Count, len(body.ContentNodes))
	}

	ids := make([]uuid.UUID, 0, len(body.ContentNodes))
	for _, row := range body.ContentNodes {
		ids = append(ids, row.ID)
	}
	return ids
}

func (w *contentNodeWorld) statementsOn(kind, table string) []testsupport.Statement {
	var out []testsupport.Statement
	for _, stmt := range w.db.Statements() {
		if stmt.Kind == kind && stmt.Touches(table) {
			out = append(out, stmt)
		}
	}
	return out
}

func (w *contentNodeWorld) requireCorrelatedScopingOn(kind, table string) {
	w.t.Helper()

	stmts := w.statementsOn(kind, table)
	if len(stmts) == 0 {
		w.t.Fatalf("no %s statement reached %s", kind, table)
	}
	for _, stmt := range stmts {
		if strings.Contains(stmt.Query, "FALSE") {
			w.t.Fatalf("the scope collapsed to a refusal, so nothing was proved about filtering: %q",
				stmt.Query)
		}
	}
	for _, stmt := range stmts {
		if strings.Contains(stmt.Query, "EXISTS (") {
			return
		}
	}
	w.t.Fatalf("no %s statement on %s carried the correlated subquery that narrows to the "+
		"viewer, so the scoping is not in the statement: %q", kind, table, stmts[0].Query)
}

func TestCreateContentNodeStoresATableOfContentsInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	bare := w.created(`{"title":"Front Matter","sequence":0}`)
	if bare.Kind != entcontentnode.KindChapter {
		t.Fatalf("kind must default to chapter, got %s", bare.Kind)
	}
	if bare.Origin != entcontentnode.OriginManual {
		t.Fatalf("origin must default to manual, got %s", bare.Origin)
	}
	if bare.EngineSectionID != nil || bare.ResolvedAt != nil {
		t.Fatalf("a node with no engine section id must stay unresolved, got %v at %v",
			bare.EngineSectionID, bare.ResolvedAt)
	}
	if bare.PageStart != nil || bare.PageEnd != nil {
		t.Fatalf("an absent page range must stay absent, got %v-%v", bare.PageStart, bare.PageEnd)
	}

	paged := w.created(`{"title":"Motion","sequence":1,"kind":"chapter",` +
		`"page_start":12,"page_end":34,"engine_section_id":"sec-motion","origin":"ingested"}`)
	if paged.PageStart == nil || *paged.PageStart != 12 ||
		paged.PageEnd == nil || *paged.PageEnd != 34 {
		t.Fatalf("the page range must be stored, got %v-%v", paged.PageStart, paged.PageEnd)
	}
	if paged.EngineSectionID == nil || *paged.EngineSectionID != "sec-motion" {
		t.Fatalf("the engine section id must be stored, got %v", paged.EngineSectionID)
	}
	if paged.ResolvedAt == nil {
		t.Fatal("binding an engine section id must stamp resolved_at, the second half of the " +
			"two-key binding")
	}
	if paged.Origin != entcontentnode.OriginIngested {
		t.Fatalf("origin ingested must be creatable, got %s", paged.Origin)
	}

	nested := w.created(`{"title":"Newton's Laws","sequence":0,"kind":"section",` +
		`"parent_id":"` + paged.ID.String() + `"}`)
	if nested.ParentID == nil || *nested.ParentID != paged.ID {
		t.Fatalf("the nested node must hang off %s, got %v", paged.ID, nested.ParentID)
	}
	if nested.Kind != entcontentnode.KindSection {
		t.Fatalf("kind section must be creatable, got %s", nested.Kind)
	}

	if rows := w.rows(w.writable); len(rows) != 3 {
		t.Fatalf("the book must hold three nodes, got %d", len(rows))
	}
}

func TestCreateContentNodeIsIdempotentOnItsNaturalKeyInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	body := `{"title":"Motion","sequence":1,"page_start":12,"page_end":34,` +
		`"engine_section_id":"sec-motion","origin":"ingested"}`
	first := w.created(body)
	bound := w.resolution(first.ID)

	rec := w.create(w.writable, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("a re-run must settle on the existing node with 200, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	again := w.decodeNode(rec)
	if again.ID != first.ID {
		t.Fatalf("the re-run must land on the same row %s, got %s", first.ID, again.ID)
	}
	if settled := w.resolution(first.ID); !settled.Equal(bound) {
		t.Fatalf("an unchanged engine section id must keep its original resolved_at %v, got %v",
			bound.UTC(), settled.UTC())
	}

	if rows := w.rows(w.writable); len(rows) != 1 {
		t.Fatalf("the re-run duplicated the node: the book holds %d rows", len(rows))
	}

	retitled := `{"title":"Motion and Forces","sequence":1,"page_start":12,"page_end":36,` +
		`"engine_section_id":"sec-motion-forces","origin":"ingested"}`
	rec = w.create(w.writable, retitled)
	if rec.Code != http.StatusOK {
		t.Fatalf("a re-parse at the same position must update in place, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	moved := w.decodeNode(rec)
	if moved.ID != first.ID {
		t.Fatalf("a re-minted engine section id must not fork the row: want %s, got %s",
			first.ID, moved.ID)
	}
	if moved.Title != "Motion and Forces" {
		t.Fatalf("the title must be refreshed, got %q", moved.Title)
	}
	if moved.EngineSectionID == nil || *moved.EngineSectionID != "sec-motion-forces" {
		t.Fatalf("the engine section id must be refreshed, got %v", moved.EngineSectionID)
	}
	if restamped := w.resolution(first.ID); !restamped.After(bound) {
		t.Fatalf("a changed engine section id must re-stamp resolved_at past %v, got %v",
			bound.UTC(), restamped.UTC())
	}

	if rows := w.rows(w.writable); len(rows) != 1 {
		t.Fatalf("the re-parse duplicated the node: the book holds %d rows", len(rows))
	}
}

func TestContentNodeStoresAnEngineSectionIDItCannotVerifyInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	for i, id := range []string{
		"sec_9f2a1c4b7e03",
		"not-a-sec-prefixed-value",
		"sec_0000000000000000000000000000",
		"§ 2.1 / 中文",
	} {
		body := `{"title":"Chapter","sequence":` + strconv.Itoa(i) +
			`,"engine_section_id":"` + id + `","origin":"ingested"}`
		rec := w.create(w.writable, body)
		if rec.Code != http.StatusCreated {
			t.Fatalf("core calls nothing outbound and cannot tell a current engine section id from "+
				"a stale one, so %q must be stored rather than policed; got %d: %s",
				id, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
		stored := w.stored(w.decodeNode(rec).ID)
		if stored.EngineSectionID == nil || *stored.EngineSectionID != id {
			t.Fatalf("the engine section id must be stored verbatim, want %q got %v",
				id, stored.EngineSectionID)
		}
		if stored.ResolvedAt == nil {
			t.Fatalf("a stored binding must carry a resolved_at, otherwise nothing downstream can "+
				"compare it against the book's last re-ingest; id %q", id)
		}
	}

	long := strings.Repeat("s", engineSectionIDRunes+1)
	rec := w.create(w.writable, `{"title":"Chapter","sequence":99,"engine_section_id":"`+long+`"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("the only shape rule is the column's own length, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rec = w.create(w.writable, `{"title":"Chapter","sequence":98,"engine_section_id":""}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("an empty engine section id is not a binding, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestContentNodeWithNoBindingCarriesNoResolvedAtInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	bare := w.stored(w.created(`{"title":"Front Matter","sequence":0}`).ID)
	if bare.ResolvedAt != nil {
		t.Fatalf("resolved_at records when a binding was resolved, not when the row was written, "+
			"so an unbound node must leave it null; created_at already carries the write time. got %v",
			bare.ResolvedAt.UTC())
	}

	bound := w.stored(w.created(`{"title":"Motion","sequence":1,` +
		`"engine_section_id":"sec_9f2a1c4b7e03"}`).ID)
	if bound.ResolvedAt == nil {
		t.Fatal("a bound node must carry a resolved_at")
	}

	rec := w.create(w.writable, `{"title":"Motion","sequence":1,`+
		`"engine_section_id":"sec_9f2a1c4b7e03","page_start":12}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 on the re-run, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rewritten := w.stored(bound.ID)
	if !rewritten.ResolvedAt.Equal(*bound.ResolvedAt) {
		t.Fatalf("the re-run rewrote the row, so updated_at moved; resolved_at must not, or it "+
			"records the write rather than the resolution. want %v got %v",
			bound.ResolvedAt.UTC(), rewritten.ResolvedAt.UTC())
	}
	if !rewritten.UpdatedAt.After(bound.UpdatedAt) && rewritten.PageStart == nil {
		t.Fatal("the re-run did not actually rewrite the row, so this proves nothing about " +
			"resolved_at standing still")
	}
}

func TestCreateContentNodeIsIdempotentWithNoEngineSectionIDInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	body := `{"title":"Motion","sequence":1,"page_start":12,"page_end":34}`
	first := w.created(body)

	rec := w.create(w.writable, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("a manual table of contents carries no engine section id, so position alone must "+
			"settle the re-run with 200; got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if again := w.decodeNode(rec); again.ID != first.ID {
		t.Fatalf("the re-run must land on the same row %s, got %s", first.ID, again.ID)
	}
	if rows := w.rows(w.writable); len(rows) != 1 {
		t.Fatalf("the re-run duplicated a node that has no engine section id to disagree with: "+
			"the book holds %d rows", len(rows))
	}

	retitled := `{"title":"Motion and Forces","sequence":1}`
	rec = w.create(w.writable, retitled)
	if rec.Code != http.StatusOK {
		t.Fatalf("a re-run at the same position must update in place, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	stored := w.stored(first.ID)
	if stored.Title != "Motion and Forces" {
		t.Fatalf("the title must be refreshed, got %q", stored.Title)
	}
	if stored.PageStart != nil || stored.PageEnd != nil {
		t.Fatalf("a re-run that records no page range must clear the stale one, got %v-%v",
			stored.PageStart, stored.PageEnd)
	}
	if rows := w.rows(w.writable); len(rows) != 1 {
		t.Fatalf("the re-run duplicated the node: the book holds %d rows", len(rows))
	}
}

func TestCreateContentNodeAtADifferentPositionIsADifferentNodeInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	first := w.created(`{"title":"Motion","sequence":1}`)
	second := w.created(`{"title":"Energy","sequence":2}`)
	if first.ID == second.ID {
		t.Fatal("two positions must be two nodes")
	}

	child := w.created(`{"title":"Energy","sequence":2,"parent_id":"` + first.ID.String() + `"}`)
	if child.ID == second.ID {
		t.Fatal("the same sequence under a different parent must be a different node, " +
			"otherwise parent_id is not part of the key")
	}

	if rows := w.rows(w.writable); len(rows) != 3 {
		t.Fatalf("the book must hold three nodes, got %d", len(rows))
	}
}

func TestCreateContentNodeRefusesADriftedEngineSectionIDInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	w.created(`{"title":"Motion","sequence":1,"engine_section_id":"sec-motion"}`)

	rec := w.create(w.writable, `{"title":"Energy","sequence":2,"engine_section_id":"sec-motion"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("one engine section cannot sit at two positions; want 409, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	if rows := w.rows(w.writable); len(rows) != 1 {
		t.Fatalf("the refused write landed anyway: the book holds %d rows", len(rows))
	}
}

func TestCreateContentNodeRejectsPageZeroClearlyInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	w.created(`{"title":"Motion","sequence":1,"page_start":12,"page_end":34}`)

	for _, body := range []string{
		`{"title":"Energy","sequence":2,"page_start":0}`,
		`{"title":"Energy","sequence":2,"page_end":0}`,
		`{"title":"Energy","sequence":2,"page_start":0,"page_end":0}`,
	} {
		rec := w.create(w.writable, body)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("page 0 means not recorded elsewhere in the estate and Positive() excludes it, "+
				"so %s must be a clear 400, got %d: %s",
				body, rec.Code, strings.TrimSpace(rec.Body.String()))
		}
		if !strings.Contains(rec.Body.String(), "omit it") {
			t.Fatalf("the refusal must say to omit the field rather than send 0, got %q",
				strings.TrimSpace(rec.Body.String()))
		}
	}

	rec := w.create(w.writable, `{"title":"Energy","sequence":2,"page_start":40,"page_end":20}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a backwards page range must be refused, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	if rows := w.rows(w.writable); len(rows) != 1 {
		t.Fatalf("a refused page range was written anyway: the book holds %d rows", len(rows))
	}
}

func TestCreateContentNodeUnderAnUnreachableItemIsNotFoundInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	w.created(`{"title":"Motion","sequence":1}`)

	w.db.Forget()
	rec := w.create(w.unreachable, `{"title":"Smuggled","sequence":1}`)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable content item must be 404, never 403: a 403 would confirm the row "+
			"exists; got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScopingOn("query", "content_items")

	if rows := w.rows(w.unreachable); len(rows) != 0 {
		t.Fatalf("the refused write created %d nodes under the stranger's book", len(rows))
	}
}

func TestContentNodeParentMustBelongToTheSameBookInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	mine := w.created(`{"title":"Motion","sequence":1}`)

	foreign := w.db.Client.ContentNode.Create().
		SetContentItemID(w.unreachable).
		SetTitle("Stranger's Chapter").
		SetSequence(1).
		SaveX(context.Background())

	rec := w.create(w.writable, `{"title":"Smuggled","sequence":2,"parent_id":"`+
		foreign.ID.String()+`"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("a parent from another book must be refused, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rec = w.create(w.writable, `{"title":"Newton","sequence":0,"parent_id":"`+mine.ID.String()+`"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("a parent from the same book must be accepted, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestContentNodeWriteRejectsServerSetAndPathFieldsInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	w.created(`{"title":"Motion","sequence":1}`)

	rec := w.create(w.writable, `{"title":"Energy","sequence":2,"content_item_id":"`+
		w.unreachable.String()+`"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("content_item_id comes from the path, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rec = w.create(w.writable, `{"title":"Energy","sequence":2,`+
		`"engine_section_id":"sec-energy","resolved_at":"2026-01-01T00:00:00Z"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("resolved_at is recorded by the server, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rec = w.create(w.writable, `{"title":"Energy","sequence":2,"kind":"unit"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("unit is the curriculum's vocabulary, not the book's, so it must be refused; "+
			"got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	if rows := w.rows(w.writable); len(rows) != 1 {
		t.Fatalf("a refused write landed anyway: the book holds %d rows", len(rows))
	}
}

func TestContentNodeWriteWithoutTheLibraryKeyIsRefusedInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	w.created(`{"title":"Motion","sequence":1}`)

	w.server.guard = contentNodeGuard{keys: map[authorization.Entity]bool{}}

	rec := w.create(w.writable, `{"title":"Energy","sequence":2}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a caller without %s must be refused, got %d: %s",
			authorization.LibraryCreate, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	rec = w.list(w.writable, "")
	if rec.Code != http.StatusForbidden {
		t.Fatalf("a caller without %s must not read a table of contents, got %d: %s",
			authorization.LibraryRead, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	if rows := w.rows(w.writable); len(rows) != 1 {
		t.Fatalf("the keyless write landed anyway: the book holds %d rows", len(rows))
	}
}

func TestListContentNodesReturnsOnlyTheReachableBooksNodesInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	first := w.created(`{"title":"Motion","sequence":1,"origin":"ingested"}`)
	second := w.created(`{"title":"Energy","sequence":2}`)

	w.db.Client.ContentNode.Create().
		SetContentItemID(w.unreachable).
		SetTitle("Stranger's Chapter").
		SetSequence(1).
		SaveX(context.Background())

	w.db.Forget()
	rec := w.list(w.writable, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScopingOn("query", "content_nodes")

	ids := w.listedIDs(rec)
	if len(ids) != 2 || ids[0] != first.ID || ids[1] != second.ID {
		t.Fatalf("the book's nodes must come back in sequence order, want [%s %s], got %v",
			first.ID, second.ID, ids)
	}

	rec = w.list(w.writable, "?origin=ingested")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if ids := w.listedIDs(rec); len(ids) != 1 || ids[0] != first.ID {
		t.Fatalf("the origin filter must leave only the ingested node, got %v", ids)
	}

	w.db.Forget()
	rec = w.list(w.unreachable, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("an unreachable book must be 404, never 403; got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	w.requireCorrelatedScopingOn("query", "content_items")
}

func TestThePredicatedContentNodeUpdateCountsOnlyWritableRowsInPostgres(t *testing.T) {
	w := newContentNodeWorld(t)

	mine := w.created(`{"title":"Motion","sequence":1}`)

	foreign := w.db.Client.ContentNode.Create().
		SetContentItemID(w.unreachable).
		SetTitle("Stranger's Chapter").
		SetSequence(1).
		SaveX(context.Background())

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.LibraryCreate, authorization.LibraryWriteAll)
	if err != nil {
		t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}

	retitle := func(node *tenantent.ContentNode, title string) int {
		t.Helper()
		n, err := w.db.Client.ContentNode.Update().
			Where(entcontentnode.ID(node.ID),
				entcontentnode.HasContentItemWith(access.LibraryItemsWritableBy(viewer, decision))).
			SetTitle(title).
			Save(context.Background())
		if err != nil {
			t.Fatalf("the predicated update failed against Postgres: %v", err)
		}
		return n
	}

	if n := retitle(foreign, "Stolen"); n != 0 {
		t.Fatalf("a node under an unwritable book must be counted 0, got %d; the 404 the handler "+
			"answers rests on exactly this number", n)
	}
	reread, err := w.db.Client.ContentNode.Get(context.Background(), foreign.ID)
	if err != nil {
		t.Fatalf("the foreign node could not be read back: %v", err)
	}
	if reread.Title != "Stranger's Chapter" {
		t.Fatalf("the predicated update wrote a row the viewer may not write: title %q", reread.Title)
	}

	if n := retitle(mine, "Motion and Forces"); n != 1 {
		t.Fatalf("a node under a writable book must be counted 1, got %d; a predicate that admits "+
			"nothing would also count 0 and the refusal above would pass for the wrong reason", n)
	}
}
