package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

const (
	mindmapSlug  = "dps-ngp"
	mindmapToken = "eyJhbGciOiJSUzI1NiJ9.a-pupil-of-offering-a.signature"

	mindmapOwnSection   = "sec_life_processes"
	mindmapOtherSection = "sec_of_the_other_book"

	mindmapUnlabelledToken = "eyJhbGciOiJSUzI1NiJ9.a-token-the-engine-gives-no-label.signature"
	mindmapGatedRefusal    = `{"detail":"retrieval engine 404 for /syllabus/tree: ` +
		`{\"detail\":\"unknown document (or not visible to this tenant)\"}"}`
)

type mindmapDBGuard struct {
	library bool
}

func (g mindmapDBGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.MindmapsRead:
		return authorization.Decision{Allowed: true}, nil
	case authorization.LibraryRead:
		if g.library {
			return authorization.Decision{Allowed: true, Reach: authorization.ReachSelf, HasReach: true}, nil
		}
	}
	return authorization.Decision{}, nil
}

func (mindmapDBGuard) Name() string { return "mind map database test guard" }

type mindmapWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	probe  *mindmapProbe
	ctx    context.Context

	pupilPerson uuid.UUID
	pupilCAS    uuid.UUID
	pupil       uuid.UUID
	session     uuid.UUID
	sectionA    uuid.UUID
	offeringA   uuid.UUID
	subject     uuid.UUID
	grade       uuid.UUID
	author      uuid.UUID

	mine     uuid.UUID
	theirs   uuid.UUID
	byState  map[entcontentitem.IndexStatus]uuid.UUID
	document string
	other    string
}

func newMindmapWorld(t *testing.T) *mindmapWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]
	today := time.Now().UTC()

	branch := client.Branch.Create().
		SetName("Mindmap Branch " + tag).
		SetCode("MBR-" + tag).
		SaveX(ctx)
	session := client.AcademicSession.Create().
		SetName("Mindmap Session " + tag).
		SetCode("MSE-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SetIsCurrent(true).
		SaveX(ctx)
	grade := client.GradeLevel.Create().
		SetName("Mindmap Grade " + tag).
		SetCode("MGR-" + tag).
		SetSequence(1).
		SaveX(ctx)
	subject := client.Subject.Create().
		SetName("Mindmap Subject " + tag).
		SetCode("MSU-" + tag).
		SaveX(ctx)

	newOffering := func(name string) (uuid.UUID, uuid.UUID) {
		section := client.Section.Create().
			SetAcademicSessionID(session.ID).
			SetBranchID(branch.ID).
			SetGradeLevelID(grade.ID).
			SetName(name).
			SetCode("MS" + name + "-" + tag).
			SaveX(ctx)
		offering := client.SubjectOffering.Create().
			SetAcademicSessionID(session.ID).
			SetSectionID(section.ID).
			SetSubjectID(subject.ID).
			SaveX(ctx)
		return section.ID, offering.ID
	}
	sectionA, offeringA := newOffering("A")
	_, offeringB := newOffering("B")

	casUser := uuid.New()
	pupil := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Mindmap").
		SetDisplayName("Mindmap Pupil " + tag).
		SaveX(ctx)
	author := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Mindmap").
		SetDisplayName("Mindmap Author " + tag).
		SaveX(ctx)

	student := client.Student.Create().
		SetPersonID(pupil.ID).
		SetAdmissionNumber("MMP-" + tag).
		SaveX(ctx)
	enrollment := client.StudentEnrollment.Create().
		SetStudentID(student.ID).
		SetAcademicSessionID(session.ID).
		SetSectionID(sectionA).
		SetEnrollmentDate(today).
		SaveX(ctx)
	client.StudentSubjectEnrollment.Create().
		SetStudentEnrollmentID(enrollment.ID).
		SetSubjectOfferingID(offeringA).
		SetStudentID(student.ID).
		SetAcademicSessionID(session.ID).
		SaveX(ctx)

	world := &mindmapWorld{
		t:           t,
		db:          db,
		probe:       newMindmapProbe(t),
		pupilPerson: pupil.ID,
		pupilCAS:    casUser,
		pupil:       student.ID,
		session:     session.ID,
		sectionA:    sectionA,
		offeringA:   offeringA,
		subject:     subject.ID,
		grade:       grade.ID,
		author:      author.ID,
		byState:     map[entcontentitem.IndexStatus]uuid.UUID{},
		document:    "doc_mine_" + tag,
		other:       "doc_theirs_" + tag,
	}

	shelved := func(title string, offering uuid.UUID, status entcontentitem.IndexStatus,
		document string) uuid.UUID {
		create := client.ContentItem.Create().
			SetTitle(title + " " + tag).
			SetKind(entcontentitem.KindBook).
			SetAudience(entcontentitem.AudienceOffering).
			SetSubjectOfferingID(offering).
			SetSubjectID(subject.ID).
			SetStatus(entcontentitem.StatusPublished).
			SetOwnerPersonID(author.ID).
			SetIndexStatus(status)
		if document != "" {
			create = create.
				SetEngineDocumentID(document).
				SetIndexedSha256(libraryDigest).
				SetIndexedAt(today)
		}
		return create.SaveX(ctx).ID
	}

	world.mine = shelved("Biology for offering A", offeringA,
		entcontentitem.IndexStatusIndexed, world.document)
	world.theirs = shelved("Biology for offering B", offeringB,
		entcontentitem.IndexStatusIndexed, world.other)
	for _, status := range []entcontentitem.IndexStatus{
		entcontentitem.IndexStatusHeld,
		entcontentitem.IndexStatusParked,
		entcontentitem.IndexStatusPending,
		entcontentitem.IndexStatusFailed,
		entcontentitem.IndexStatusNone,
	} {
		world.byState[status] = shelved("Chemistry "+string(status), offeringA, status, "")
	}

	world.probe.holds(world.document, mindmapOwnSection)
	world.probe.holds(world.other, mindmapOtherSection)

	world.server = &Server{guard: mindmapDBGuard{library: true}}
	mindmapsSwitchedOn(t, world.server, world.probe)

	ctx = authorization.WithSubject(ctx,
		&authorization.Subject{CASUserID: casUser, RawToken: mindmapToken})
	ctx = tenancy.WithTenant(ctx, &tenancy.Tenant{
		SchoolID: uuid.New(), Code: "DPS-NGP", CASTenantID: mindmapSlug,
	})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireAnEnrolledPupil()
	db.Forget()
	return world
}

func (w *mindmapWorld) requireAnEnrolledPupil() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer reads every book and would prove nothing about scoping")
	}
	if viewer.PersonID == nil || *viewer.PersonID != w.pupilPerson {
		w.t.Fatalf("the viewer must resolve to the seeded pupil %s, got %v", w.pupilPerson, viewer.PersonID)
	}
	if len(viewer.EnrolledOfferingIDs) != 1 || viewer.EnrolledOfferingIDs[0] != w.offeringA {
		w.t.Fatalf("the pupil must study offering A and nothing else, got %v", viewer.EnrolledOfferingIDs)
	}
	if !decision.HasReach || decision.Reach != authorization.ReachSelf {
		w.t.Fatalf("the decision must carry a self reach, got %+v", decision)
	}
}

type mindmapCall struct {
	name    string
	handler func(*Server) http.HandlerFunc
	method  string
	suffix  string
	node    string
	body    string
}

func mindmapChapterCalls() []mindmapCall {
	return []mindmapCall{
		{name: "map", handler: func(s *Server) http.HandlerFunc { return s.getMindmap }, method: "GET"},
		{name: "node", handler: func(s *Server) http.HandlerFunc { return s.getMindmapNode },
			method: "GET", suffix: "/nodes/atm_1", node: "atm_1"},
		{name: "trace", handler: func(s *Server) http.HandlerFunc { return s.traceMindmap },
			method: "GET", suffix: "/trace?from=atm_1&to=atm_2"},
		{name: "drill", handler: func(s *Server) http.HandlerFunc { return s.getMindmapDrill },
			method: "GET", suffix: "/drill"},
		{name: "grade", handler: func(s *Server) http.HandlerFunc { return s.gradeMindmapDrill },
			method: "POST", suffix: "/drill/grade", body: `{"answers":{"q1":"stomata"}}`},
	}
}

func mindmapEveryCall() []mindmapCall {
	chapters := mindmapCall{
		name:    "chapters",
		handler: func(s *Server) http.HandlerFunc { return s.listMindmapChapters },
		method:  "GET",
	}
	return append([]mindmapCall{chapters}, mindmapChapterCalls()...)
}

func (w *mindmapWorld) call(c mindmapCall, item uuid.UUID, section string) *httptest.ResponseRecorder {
	w.t.Helper()

	target := "/api/v1/learning/mindmaps/" + item.String() + "/chapters"
	route := chi.NewRouteContext()
	route.URLParams.Add(mindmapItemParam, item.String())
	if c.name != "chapters" {
		target += "/" + section + c.suffix
		route.URLParams.Add(mindmapSectionParam, section)
	}
	if c.node != "" {
		route.URLParams.Add(mindmapNodeParam, c.node)
	}

	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)
	rec := httptest.NewRecorder()
	c.handler(w.server)(rec, httptest.NewRequest(c.method, target, strings.NewReader(c.body)).WithContext(ctx))
	return rec
}

func (w *mindmapWorld) list(query string) *httptest.ResponseRecorder {
	w.t.Helper()

	rec := httptest.NewRecorder()
	w.server.listMindmapBooks(rec, httptest.NewRequest(http.MethodGet,
		"/api/v1/learning/mindmaps"+query, strings.NewReader("")).WithContext(w.ctx))
	return rec
}

func TestMindmapsFromPostgresRefuseABookOfAnotherOffering(t *testing.T) {
	world := newMindmapWorld(t)
	absent := uuid.New()

	for _, c := range mindmapEveryCall() {
		t.Run(c.name, func(t *testing.T) {
			world.probe.forget()

			hidden := world.call(c, world.theirs, mindmapOtherSection)
			if hidden.Code != http.StatusNotFound {
				t.Fatalf("a pupil of offering A asked for a book shared to offering B: want 404, got %d: %s",
					hidden.Code, strings.TrimSpace(hidden.Body.String()))
			}

			missing := world.call(c, absent, mindmapOtherSection)
			if missing.Code != http.StatusNotFound {
				t.Fatalf("a book that does not exist: want 404, got %d", missing.Code)
			}
			if hidden.Body.String() != missing.Body.String() {
				t.Fatalf("a hidden book and a missing one must be indistinguishable:\nhidden  %s\nmissing %s",
					hidden.Body.String(), missing.Body.String())
			}

			if got := world.probe.taken(); len(got) != 0 {
				t.Fatalf("a book the caller cannot read reached the mind-map service: %+v", got)
			}
		})
	}
}

func TestMindmapListFromPostgresCarriesOnlyReadableBooksEachWithItsState(t *testing.T) {
	world := newMindmapWorld(t)

	rec := world.list("?limit=200")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Mindmaps []map[string]any `json:"mindmaps"`
		Count    int              `json:"count"`
		Page     *page            `json:"page"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the list is not JSON: %v (%s)", err, rec.Body.String())
	}
	if body.Page == nil || body.Count != len(body.Mindmaps) {
		t.Fatalf("the list must carry a page and a count matching its rows: %s", rec.Body.String())
	}

	byID := map[string]map[string]any{}
	for _, row := range body.Mindmaps {
		id, _ := row["id"].(string)
		byID[id] = row
	}

	if _, listed := byID[world.theirs.String()]; listed {
		t.Fatal("a book shared to an offering the pupil does not study was listed")
	}

	mine, listed := byID[world.mine.String()]
	if !listed {
		t.Fatalf("the pupil's own offering's book is missing from the list: %s", rec.Body.String())
	}
	if mine["mindmap_state"] != MindmapAvailable || mine["index_status"] != "indexed" {
		t.Fatalf("an indexed book must be listed as available: %v", mine)
	}
	for _, name := range []string{"title", "kind", "subject_id"} {
		if value, ok := mine[name]; !ok || value == nil {
			t.Fatalf("the row is missing %s: %v", name, mine)
		}
	}
	if value, ok := mine["grade_level_id"]; !ok || value != nil {
		t.Fatalf("a book shared to an offering names no grade, and the row must say so with a "+
			"null rather than drop the key: %v", mine)
	}
	if _, leaked := mine["engine_document_id"]; leaked {
		t.Fatalf("the engine's document id is not part of the list: %v", mine)
	}

	wants := map[entcontentitem.IndexStatus]string{
		entcontentitem.IndexStatusHeld:    MindmapHeld,
		entcontentitem.IndexStatusParked:  MindmapParked,
		entcontentitem.IndexStatusPending: MindmapPending,
		entcontentitem.IndexStatusFailed:  MindmapFailed,
		entcontentitem.IndexStatusNone:    MindmapNotIndexed,
	}
	for status, want := range wants {
		row, listed := byID[world.byState[status].String()]
		if !listed {
			t.Fatalf("the %s book is readable and must be listed with its state, not dropped", status)
		}
		if row["mindmap_state"] != want {
			t.Fatalf("the %s book is listed as %v, want %s", status, row["mindmap_state"], want)
		}
	}

	if got := world.probe.taken(); len(got) != 0 {
		t.Fatalf("the list must be answered from this server's own columns, yet it called out: %+v", got)
	}
}

func TestMindmapListFromPostgresRefusesAnUnknownFilter(t *testing.T) {
	world := newMindmapWorld(t)

	rec := world.list("?state=available")
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "state") {
		t.Fatalf("an unknown filter must be a 400 naming it, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestMindmapsFromPostgresRefuseABookWithNoEngineDocumentNamingItsState(t *testing.T) {
	world := newMindmapWorld(t)

	for status, id := range world.byState {
		for _, c := range mindmapEveryCall() {
			t.Run(string(status)+" "+c.name, func(t *testing.T) {
				world.probe.forget()

				rec := world.call(c, id, mindmapOwnSection)
				if rec.Code != http.StatusConflict {
					t.Fatalf("want 409, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
				}
				body := mindmapRefusalOf(t, rec)
				if body["index_status"] != string(status) {
					t.Fatalf("the refusal must name index_status %s: %s", status, rec.Body.String())
				}
				if body["code"] != MindmapNotIndexedCode {
					t.Fatalf("want code %s: %s", MindmapNotIndexedCode, rec.Body.String())
				}
				if got := world.probe.taken(); len(got) != 0 {
					t.Fatalf("a book with no engine document reached the mind-map service: %+v", got)
				}
			})
		}
	}

	held := world.call(mindmapEveryCall()[1], world.byState[entcontentitem.IndexStatusHeld], mindmapOwnSection)
	message, _ := mindmapRefusalOf(t, held)["message"].(string)
	if !strings.Contains(message, "held") || !strings.Contains(message, "the material exists") {
		t.Fatalf("a held book must read as material waiting on a build: %s", message)
	}
	if strings.Contains(message, "no material") || strings.Contains(message, "has not been indexed") {
		t.Fatalf("a held book read as missing material: %s", message)
	}
}

func TestMindmapsFromPostgresRefuseAChapterOfAnotherBook(t *testing.T) {
	world := newMindmapWorld(t)

	for _, c := range mindmapChapterCalls() {
		t.Run(c.name, func(t *testing.T) {
			world.probe.forget()

			rec := world.call(c, world.mine, mindmapOtherSection)

			if rec.Code != http.StatusNotFound {
				t.Fatalf("a readable book was asked for a chapter of another book, which the "+
					"mind-map service would have served: want 404, got %d: %s",
					rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if !strings.Contains(rec.Body.String(), mindmapChapterNotFound) {
				t.Fatalf("the refusal must say the chapter is not in this book: %s", rec.Body.String())
			}
			if got := world.probe.reaching("/map/"); len(got) != 0 {
				t.Fatalf("the other book's chapter was fetched before it was refused: %+v", got)
			}
		})
	}
}

func TestMindmapsFromPostgresRelayTheServiceAsTheCallerHimself(t *testing.T) {
	world := newMindmapWorld(t)

	for _, c := range mindmapEveryCall() {
		t.Run(c.name, func(t *testing.T) {
			world.probe.forget()
			world.db.Forget()

			var atFirstCall atomic.Int64
			atFirstCall.Store(-1)
			world.probe.mu.Lock()
			world.probe.onRequest = func() {
				atFirstCall.CompareAndSwap(-1, int64(len(world.db.Statements())))
			}
			world.probe.mu.Unlock()

			rec := world.call(c, world.mine, mindmapOwnSection)
			if rec.Code != http.StatusOK {
				t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
			}

			received := world.probe.taken()
			if len(received) == 0 {
				t.Fatal("the mind-map service was never called")
			}
			for _, got := range received {
				if got.authorization != "Bearer "+mindmapToken {
					t.Fatalf("%s %s: the caller's own bearer must travel unchanged, got %q",
						got.method, got.path, got.authorization)
				}
				if got.tenant != mindmapSlug {
					t.Fatalf("%s %s: X-School-Id must be the CAS slug %q, got %q",
						got.method, got.path, mindmapSlug, got.tenant)
				}
				if got.adminToken != "" {
					t.Fatalf("%s %s: no admin token travels on this path, got %q",
						got.method, got.path, got.adminToken)
				}
			}

			total := len(world.db.Statements())
			statementsAtCall := int(atFirstCall.Load())
			if statementsAtCall <= 0 {
				t.Fatalf("no database work preceded the outbound call (%d statements)", statementsAtCall)
			}
			if statementsAtCall != total {
				t.Fatalf("%d statements had run when the outbound call began and %d by the end, "+
					"so database work straddles a call the engine answers by calling back",
					statementsAtCall, total)
			}
			if writes := mindmapWrites(world.db.Statements()); len(writes) != 0 {
				t.Fatalf("the read path writes nothing, yet it ran %v", writes)
			}
		})
	}
}

func TestMindmapChaptersFromPostgresAskForThisBooksDocumentAndRelayTheAnswer(t *testing.T) {
	world := newMindmapWorld(t)

	rec := world.call(mindmapEveryCall()[0], world.mine, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	received := world.probe.taken()
	if len(received) != 1 || received[0].path != "/chapters" {
		t.Fatalf("want one call to /chapters, got %+v", received)
	}
	if document := received[0].query["document_id"]; len(document) != 1 || document[0] != world.document {
		t.Fatalf("the chapter list must be asked for this book's engine document %s, got %v",
			world.document, document)
	}

	var body struct {
		Documents []struct {
			DocumentID string `json:"document_id"`
			Structure  string `json:"structure"`
			Sections   []struct {
				ID string `json:"id"`
			} `json:"sections"`
		} `json:"documents"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the relayed chapter list is not the service's own shape: %v (%s)", err, rec.Body.String())
	}
	if len(body.Documents) != 1 || body.Documents[0].DocumentID != world.document ||
		body.Documents[0].Structure != "toc" || body.Documents[0].Sections[0].ID != mindmapOwnSection {
		t.Fatalf("the chapter list was not relayed as the service answered it: %s", rec.Body.String())
	}
}

func TestMindmapFromPostgresIsRelayedByteForByte(t *testing.T) {
	world := newMindmapWorld(t)

	rec := world.call(mindmapChapterCalls()[0], world.mine, mindmapOwnSection)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if want := mindmapMapBody(mindmapOwnSection); rec.Body.String() != want {
		t.Fatalf("the map was re-modelled on the way through:\n got %s\nwant %s", rec.Body.String(), want)
	}

	maps := world.probe.reaching("/map/")
	if len(maps) != 1 || maps[0].path != "/map/"+mindmapOwnSection {
		t.Fatalf("want one call for this chapter's map, got %+v", maps)
	}
}

func TestMindmapDrillFromPostgresNeverAsksForAnswers(t *testing.T) {
	world := newMindmapWorld(t)

	drill := mindmapChapterCalls()[3]
	drill.suffix = "/drill?kind=label&n=6&seed=11&topic_id=top_2&with_answers=true"

	rec := world.call(drill, world.mine, mindmapOwnSection)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	drills := world.probe.reaching("/map/")
	if len(drills) != 1 || drills[0].path != "/map/"+mindmapOwnSection+"/drill" {
		t.Fatalf("want one drill call, got %+v", drills)
	}
	sent := drills[0].query
	if answers := sent["with_answers"]; len(answers) != 1 || answers[0] != "false" {
		t.Fatalf("the caller asked for with_answers=true and the service must still be sent "+
			"with_answers=false, it received %v", answers)
	}
	for name, want := range map[string]string{"kind": "label", "n": "6", "seed": "11", "topic_id": "top_2"} {
		if values := sent[name]; len(values) != 1 || values[0] != want {
			t.Fatalf("the drill lost %s on the way through: %v", name, sent)
		}
	}
}

func TestMindmapGradeFromPostgresForwardsTheValidatedAttempt(t *testing.T) {
	world := newMindmapWorld(t)

	grade := mindmapChapterCalls()[4]
	grade.body = `{"kind":"label","n":6,"seed":11,"answers":{"q1":"stomata","q2":"xylem"}}`

	rec := world.call(grade, world.mine, mindmapOwnSection)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	grades := world.probe.reaching("/map/")
	if len(grades) != 1 || grades[0].method != http.MethodPost ||
		grades[0].path != "/map/"+mindmapOwnSection+"/drill/grade" {
		t.Fatalf("want one grade call, got %+v", grades)
	}

	var sent map[string]any
	if err := json.Unmarshal([]byte(grades[0].body), &sent); err != nil {
		t.Fatalf("the forwarded attempt is not JSON: %v (%s)", err, grades[0].body)
	}
	answers, _ := sent["answers"].(map[string]any)
	if sent["kind"] != "label" || sent["n"] != float64(6) || sent["seed"] != float64(11) ||
		answers["q1"] != "stomata" || answers["q2"] != "xylem" {
		t.Fatalf("the attempt changed on the way through: %s", grades[0].body)
	}

	if writes := mindmapWrites(world.db.Statements()); len(writes) != 0 {
		t.Fatalf("grading is a pure proxy in this phase and must write nothing, yet it ran %v", writes)
	}
}

func mindmapWrites(stmts []testsupport.Statement) []string {
	var out []string
	for _, stmt := range stmts {
		if stmt.Kind == "exec" || writesRows(stmt.Query) {
			out = append(out, stmt.Query)
		}
	}
	return out
}

func writesRows(query string) bool {
	verb, _, _ := strings.Cut(strings.TrimSpace(query), " ")
	switch strings.ToUpper(verb) {
	case "INSERT", "UPDATE", "DELETE":
		return true
	}
	return false
}

func TestMindmapsFromPostgresMapEachUpstreamStatus(t *testing.T) {
	world := newMindmapWorld(t)
	superadmin := "a token that names no school cannot read one school's books"

	cases := []struct {
		upstream int
		detail   string
		want     int
		says     string
	}{
		{http.StatusBadRequest, "bad request upstream", http.StatusBadRequest, "bad request upstream"},
		{http.StatusUnauthorized, "token audience is not this engine", http.StatusUnauthorized,
			"token audience is not this engine"},
		{http.StatusForbidden, superadmin, http.StatusForbidden, superadmin},
		{http.StatusNotFound, "unknown section", http.StatusNotFound, "unknown section"},
		{http.StatusConflict, "structure is not confirmed", http.StatusConflict, "structure is not confirmed"},
		{http.StatusUnprocessableEntity, "kind is not a drill kind", http.StatusUnprocessableEntity,
			"kind is not a drill kind"},
		{http.StatusServiceUnavailable, "scopes authorizer unreachable", http.StatusServiceUnavailable,
			"retrieval engine"},
		{http.StatusInternalServerError, "boom", http.StatusBadGateway, "mind-map service"},
		{http.StatusBadGateway, "upstream retrieval engine: timed out", http.StatusBadGateway,
			"mind-map service"},
	}

	for _, stage := range []string{"map", "chapters"} {
		for _, tc := range cases {
			t.Run(stage+" answers "+strconv.Itoa(tc.upstream), func(t *testing.T) {
				world.probe.forget()
				raw, _ := json.Marshal(map[string]string{"detail": tc.detail})
				world.probe.forces(stage, tc.upstream, string(raw))
				t.Cleanup(func() {
					world.probe.mu.Lock()
					delete(world.probe.overrides, stage)
					world.probe.mu.Unlock()
				})

				section := mindmapOwnSection
				if stage == "chapters" {
					section = "sec_not_cached_" + strconv.Itoa(tc.upstream)
				}
				rec := world.call(mindmapChapterCalls()[0], world.mine, section)

				if rec.Code != tc.want {
					t.Fatalf("upstream %d must answer %d, got %d: %s",
						tc.upstream, tc.want, rec.Code, strings.TrimSpace(rec.Body.String()))
				}
				message, _ := mindmapRefusalOf(t, rec)["message"].(string)
				if !strings.Contains(message, tc.says) {
					t.Fatalf("the message must say %q: %s", tc.says, message)
				}
				if stage == "chapters" {
					if got := world.probe.reaching("/map/"); len(got) != 0 {
						t.Fatalf("the map was fetched although the chapter list was refused: %+v", got)
					}
				}
			})
		}
	}
}

func TestMindmapsFromPostgresAnswerBadGatewayWhenTheServiceIsGone(t *testing.T) {
	world := newMindmapWorld(t)
	world.probe.server.Close()

	for _, c := range mindmapEveryCall() {
		t.Run(c.name, func(t *testing.T) {
			rec := world.call(c, world.mine, mindmapOwnSection)

			if rec.Code != http.StatusBadGateway {
				t.Fatalf("want 502, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			body := mindmapRefusalOf(t, rec)
			message, _ := body["message"].(string)
			if body["code"] != MindmapServiceDownCode || !strings.Contains(message, "mind-map service") {
				t.Fatalf("the refusal must name the mind-map service: %s", rec.Body.String())
			}
		})
	}
}

func TestMindmapsFromPostgresRefuseASchoolWithNoSlug(t *testing.T) {
	world := newMindmapWorld(t)
	world.ctx = tenancy.WithTenant(world.ctx, &tenancy.Tenant{SchoolID: uuid.New(), Code: "DPS-NGP"})

	for _, c := range mindmapEveryCall() {
		t.Run(c.name, func(t *testing.T) {
			rec := world.call(c, world.mine, mindmapOwnSection)

			if rec.Code != http.StatusServiceUnavailable {
				t.Fatalf("want 503, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			body := mindmapRefusalOf(t, rec)
			message, _ := body["message"].(string)
			if body["code"] != MindmapUnmappedCode || !strings.Contains(message, "CAS tenant slug") {
				t.Fatalf("the refusal must say the school has no slug: %s", rec.Body.String())
			}
		})
	}
	if got := world.probe.taken(); len(got) != 0 {
		t.Fatalf("a school with no slug still reached the mind-map service: %+v", got)
	}
}

func TestMindmapsFromPostgresRequireTheLibraryKeyAsWell(t *testing.T) {
	world := newMindmapWorld(t)
	world.server.guard = mindmapDBGuard{library: false}

	rec := world.list("")
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), string(authorization.LibraryRead)) {
		t.Fatalf("listing without %s: want 403 naming it, got %d: %s",
			authorization.LibraryRead, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	for _, c := range mindmapEveryCall() {
		t.Run(c.name, func(t *testing.T) {
			rec := world.call(c, world.mine, mindmapOwnSection)

			if rec.Code != http.StatusForbidden {
				t.Fatalf("want 403, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if !strings.Contains(rec.Body.String(), string(authorization.LibraryRead)) {
				t.Fatalf("the refusal must name %s: %s", authorization.LibraryRead, rec.Body.String())
			}
		})
	}
	if got := world.probe.taken(); len(got) != 0 {
		t.Fatalf("a caller without the library key reached the mind-map service: %+v", got)
	}
}

func TestAStructuredUpstreamDetailIsNeverRelayedAsRawJSON(t *testing.T) {
	validation, err := os.ReadFile(filepath.Join("testdata", "mindmap", "refusal_drill_bad_kind.json"))
	if err != nil {
		t.Fatalf("the captured refusal is missing: %v", err)
	}

	bodies := map[string]string{
		"the validation list": string(validation),
		"an object":           `{"detail":{"reason":"kind","allowed":["label","relation"]}}`,
		"no detail":           `{"error":"x"}`,
		"not JSON":            `<html>upstream</html>`,
	}
	statuses := map[int]struct {
		want  int
		code  string
		names string
	}{
		http.StatusUnprocessableEntity: {http.StatusUnprocessableEntity, MindmapRefusedCode, "422"},
		http.StatusBadRequest:          {http.StatusBadRequest, MindmapRefusedCode, "400"},
		http.StatusServiceUnavailable:  {http.StatusServiceUnavailable, MindmapEngineDownCode, "retrieval engine"},
		http.StatusInternalServerError: {http.StatusBadGateway, MindmapServiceDownCode, "500"},
	}

	for name, upstream := range bodies {
		for status, expect := range statuses {
			t.Run(name+" at "+strconv.Itoa(status), func(t *testing.T) {
				rec := httptest.NewRecorder()
				relayMindmap(context.Background(), rec,
					mindmap.Reply{Status: status, Body: []byte(upstream)}, nil)

				if rec.Code != expect.want {
					t.Fatalf("want %d, got %d: %s", expect.want, rec.Code, rec.Body.String())
				}
				body := mindmapRefusalOf(t, rec)
				message, _ := body["message"].(string)
				if body["code"] != expect.code || !strings.Contains(message, expect.names) {
					t.Fatalf("want code %s and a message naming %q, got %s",
						expect.code, expect.names, rec.Body.String())
				}
				if !strings.Contains(message, "mind-map service") {
					t.Fatalf("the fallback must be a plain sentence naming the mind-map service: %q", message)
				}
				for _, raw := range []string{"[", "{", "\"", "<", "loc", "enum", "essay"} {
					if strings.Contains(message, raw) {
						t.Fatalf("the message carries raw upstream data (%q): %q", raw, message)
					}
				}
			})
		}
	}
}

func TestMindmapsFromPostgresRelayAValidationRefusalAsAPlainSentence(t *testing.T) {
	validation, err := os.ReadFile(filepath.Join("testdata", "mindmap", "refusal_drill_bad_kind.json"))
	if err != nil {
		t.Fatalf("the captured refusal is missing: %v", err)
	}
	world := newMindmapWorld(t)
	world.probe.forces("map", http.StatusUnprocessableEntity, string(validation))

	drill := mindmapChapterCalls()[3]
	drill.suffix = "/drill?kind=essay"

	rec := world.call(drill, world.mine, mindmapOwnSection)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	body := mindmapRefusalOf(t, rec)
	if body["code"] != MindmapRefusedCode {
		t.Fatalf("want code %s: %s", MindmapRefusedCode, rec.Body.String())
	}
	if message, _ := body["message"].(string); message != "the mind-map service refused the request with 422" {
		t.Fatalf("a refusal the service did not put in a sentence is relayed as the plain "+
			"fallback naming the status, got %q", message)
	}
}
