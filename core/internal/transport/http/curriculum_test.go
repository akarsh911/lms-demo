package http

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcurriculum "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculum"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

const (
	curriculaTable      = "curricula"
	curriculumNodeTable = "curriculum_nodes"
	sectionsTable       = "sections"
	gradeLevelsTable    = "grade_levels"
)

type curriculumGuard struct {
	allow map[authorization.Entity]authorization.Decision
}

func (g curriculumGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	return g.allow[entity], nil
}

func (curriculumGuard) Name() string { return "curriculum test guard" }

func curriculumReaches(read, write authorization.Reach) libraryOption {
	return func(fx *libraryFixture) {
		reading := authorization.Decision{Allowed: true, Reach: read, HasReach: true}
		writing := authorization.Decision{Allowed: true, Reach: write, HasReach: true}
		fx.server.guard = curriculumGuard{allow: map[authorization.Entity]authorization.Decision{
			authorization.CurriculumRead:   reading,
			authorization.CurriculumCreate: writing,
			authorization.CurriculumWrite:  writing,
			authorization.CurriculumDelete: writing,
		}}
	}
}

type curriculumDriver struct{ inner *libraryDriver }

func (d *curriculumDriver) gates(table string) bool {
	return table == curriculaTable || table == curriculumNodeTable ||
		table == sectionsTable || table == gradeLevelsTable
}

func (d *curriculumDriver) Query(ctx context.Context, query string, args, v any) error {
	table := libraryQueriedTable(query)
	if !d.gates(table) {
		return d.inner.Query(ctx, query, args, v)
	}
	list, _ := args.([]any)
	d.inner.record("query", query, list)

	kept, err := libraryReachable(query, list, d.inner.tables[table])
	if err != nil {
		return err
	}
	rows, ok := v.(*entsql.Rows)
	if !ok {
		return fmt.Errorf("stub: unexpected query target %T", v)
	}
	*rows = entsql.Rows{ColumnScanner: &libraryRows{
		cols: librarySelectedColumns(query),
		rows: kept,
	}}
	return nil
}

func (d *curriculumDriver) Exec(ctx context.Context, query string, args, v any) error {
	return d.inner.Exec(ctx, query, args, v)
}

func (d *curriculumDriver) Tx(context.Context) (dialect.Tx, error) { return dialect.NopTx(d), nil }
func (d *curriculumDriver) Close() error                           { return d.inner.Close() }
func (d *curriculumDriver) Dialect() string                        { return d.inner.Dialect() }

func newCurriculumFixture(t *testing.T, opts ...libraryOption) *libraryFixture {
	t.Helper()

	person := uuid.New()
	inner := &libraryDriver{tables: map[string][]map[string]any{
		"persons": {{"id": person}},
	}}
	client := tenantent.NewClient(tenantent.Driver(&curriculumDriver{inner: inner}))

	ctx := authorization.WithSubject(context.Background(),
		&authorization.Subject{CASUserID: uuid.New()})
	ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	fx := &libraryFixture{
		t:      t,
		server: &Server{guard: authorization.AllowAll{}},
		driver: inner,
		ctx:    ctx,
		person: person,
	}
	for _, opt := range opts {
		opt(fx)
	}
	return fx
}

func curriculumRow(id, session, subject, grade uuid.UUID, status entcurriculum.Status) map[string]any {
	return map[string]any{
		"id":                  id,
		"name":                "Mathematics",
		"code":                "MATH-9-2026",
		"academic_session_id": session,
		"subject_id":          subject,
		"grade_level_id":      grade,
		"origin":              string(entcurriculum.OriginSchool),
		"status":              string(status),
	}
}

func curriculumNodeRow(id, curriculum uuid.UUID, parent *uuid.UUID) map[string]any {
	row := map[string]any{
		"id":            id,
		"curriculum_id": curriculum,
		"kind":          string(entnode.KindTopic),
		"title":         "Fractions",
		"sequence":      int64(1),
		"status":        string(entnode.StatusActive),
	}
	if parent != nil {
		row["parent_id"] = *parent
	}
	return row
}

func curriculumUnitRow(id, curriculum uuid.UUID) map[string]any {
	row := curriculumNodeRow(id, curriculum, nil)
	row["kind"] = string(entnode.KindUnit)
	row["title"] = "Algebra"
	return row
}

func curriculumChapterRow(id, curriculum uuid.UUID, parent *uuid.UUID) map[string]any {
	row := curriculumNodeRow(id, curriculum, parent)
	row["kind"] = string(entnode.KindChapter)
	row["title"] = "Number Systems"
	return row
}

func curriculumBody(fields map[string]any) string { return libraryBody(fields) }

func fullCurriculumBody(session, subject, grade uuid.UUID) map[string]any {
	return map[string]any{
		"name":                "Mathematics",
		"code":                "MATH-9-2026",
		"academic_session_id": session,
		"subject_id":          subject,
		"grade_level_id":      grade,
	}
}

func TestCurriculumFiltersRefuseWhatTheyDoNotUnderstand(t *testing.T) {
	id := uuid.New().String()

	cases := []struct {
		name   string
		values url.Values
		want   string
	}{
		{"an unknown parameter", url.Values{"board": {"CBSE"}}, "board"},
		{"a misspelt parameter", url.Values{"subjectid": {id}}, "subjectid"},
		{"a parameter from another surface", url.Values{"audience": {"school"}}, "audience"},
		{"an identifier that is not a UUID", url.Values{"subject_id": {"seven"}}, "subject_id"},
		{"an unknown status", url.Values{"status": {"retired"}}, "status"},
		{"an unknown origin", url.Values{"origin": {"bought"}}, "origin"},
		{"a limit that is not a number", url.Values{"limit": {"lots"}}, "limit"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := parseCurriculumFilters(tc.values); err == nil ||
				!strings.Contains(err.Error(), tc.want) {
				t.Fatalf("the error must name %q, got %v", tc.want, err)
			}
		})
	}
}

func TestCurriculumNodeFiltersRefuseWhatTheyDoNotUnderstand(t *testing.T) {
	cases := []struct {
		name   string
		values url.Values
		want   string
	}{
		{"an unknown parameter", url.Values{"depth": {"2"}}, "depth"},
		{"a curriculum named in the query", url.Values{"curriculum_id": {uuid.New().String()}}, "curriculum_id"},
		{"an unknown kind", url.Values{"kind": {"lesson"}}, "kind"},
		{"an unknown status", url.Values{"status": {"retired"}}, "status"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := parseCurriculumNodeFilters(tc.values); err == nil ||
				!strings.Contains(err.Error(), tc.want) {
				t.Fatalf("the error must name %q, got %v", tc.want, err)
			}
		})
	}
}

func TestTheCurriculumFixtureHonoursTheWhereClause(t *testing.T) {
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t)
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(uuid.New(), session, subject, grade, entcurriculum.StatusDraft),
	}

	other := uuid.New()
	w := fx.call(fx.server.getCurriculum, "GET", "/api/v1/curricula/"+other.String(), "", other)

	if w.Code != http.StatusNotFound {
		t.Fatalf("the stub ignored the id in the WHERE clause: %d %s", w.Code, w.Body.String())
	}
}

func TestCurriculumThatTheViewerCannotReachIsNotFound(t *testing.T) {
	curriculum, node := uuid.New(), uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name string
		call func(fx *libraryFixture) *httptest.ResponseRecorder
	}{
		{
			name: "get",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.getCurriculum, "GET",
					"/api/v1/curricula/"+curriculum.String(), "", curriculum)
			},
		},
		{
			name: "update",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateCurriculum, "PATCH",
					"/api/v1/curricula/"+curriculum.String(), `{"name":"Hijacked"}`, curriculum)
			},
		},
		{
			name: "delete",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteCurriculum, "DELETE",
					"/api/v1/curricula/"+curriculum.String(), "", curriculum)
			},
		},
		{
			name: "list nodes",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.listCurriculumNodes, "GET",
					"/api/v1/curricula/"+curriculum.String()+"/nodes", "", curriculum)
			},
		},
		{
			name: "create node",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.createCurriculumNode, "POST",
					"/api/v1/curricula/"+curriculum.String()+"/nodes",
					`{"title":"Fractions","sequence":1}`, curriculum)
			},
		},
		{
			name: "update node",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateCurriculumNode, "PATCH",
					"/api/v1/curriculum-nodes/"+node.String(), `{"title":"Hijacked"}`, node)
			},
		},
		{
			name: "delete node",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteCurriculumNode, "DELETE",
					"/api/v1/curriculum-nodes/"+node.String(), "", node)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t,
				curriculumReaches(authorization.ReachSelf, authorization.ReachSelf))
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(curriculum, session, subject, grade, entcurriculum.StatusActive),
			}
			fx.driver.tables[curriculumNodeTable] = []map[string]any{
				curriculumNodeRow(node, curriculum, nil),
			}

			w := tc.call(fx)

			if w.Code != http.StatusNotFound {
				t.Fatalf("want 404, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			fx.changedNothing(curriculaTable)
			fx.changedNothing(curriculumNodeTable)
		})
	}
}

func TestListCurriculaReturnsNothingToAViewerWithNoReach(t *testing.T) {
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t,
		curriculumReaches(authorization.ReachSelf, authorization.ReachSelf))
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(uuid.New(), session, subject, grade, entcurriculum.StatusActive),
	}

	w := fx.call(fx.server.listCurricula, "GET", "/api/v1/curricula", "", uuid.Nil)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if !strings.Contains(w.Body.String(), `"count":0`) {
		t.Fatalf("a viewer with no reach must see nothing, got %s", w.Body.String())
	}
}

func TestCurriculumWritesUseTheWriteGateNotTheReadGate(t *testing.T) {
	curriculum, node := uuid.New(), uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		wantCode int
		writes   bool
		call     func(fx *libraryFixture) *httptest.ResponseRecorder
	}{
		{
			name:     "the row is readable",
			wantCode: http.StatusOK,
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.getCurriculum, "GET",
					"/api/v1/curricula/"+curriculum.String(), "", curriculum)
			},
		},
		{
			name:     "its nodes are readable",
			wantCode: http.StatusOK,
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.listCurriculumNodes, "GET",
					"/api/v1/curricula/"+curriculum.String()+"/nodes", "", curriculum)
			},
		},
		{
			name:     "but it may not be renamed",
			wantCode: http.StatusNotFound,
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateCurriculum, "PATCH",
					"/api/v1/curricula/"+curriculum.String(), `{"name":"Hijacked"}`, curriculum)
			},
		},
		{
			name:     "nor deleted",
			wantCode: http.StatusNotFound,
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteCurriculum, "DELETE",
					"/api/v1/curricula/"+curriculum.String(), "", curriculum)
			},
		},
		{
			name:     "nor grown a node",
			wantCode: http.StatusNotFound,
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.createCurriculumNode, "POST",
					"/api/v1/curricula/"+curriculum.String()+"/nodes",
					`{"title":"Fractions","sequence":1}`, curriculum)
			},
		},
		{
			name:     "nor may its nodes be retitled",
			wantCode: http.StatusNotFound,
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateCurriculumNode, "PATCH",
					"/api/v1/curriculum-nodes/"+node.String(), `{"title":"Hijacked"}`, node)
			},
		},
		{
			name:     "nor its nodes deleted",
			wantCode: http.StatusNotFound,
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteCurriculumNode, "DELETE",
					"/api/v1/curriculum-nodes/"+node.String(), "", node)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t,
				curriculumReaches(authorization.ReachTenant, authorization.ReachSelf))
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(curriculum, session, subject, grade, entcurriculum.StatusActive),
			}
			fx.driver.tables[curriculumNodeTable] = []map[string]any{
				curriculumNodeRow(node, curriculum, nil),
			}

			w := tc.call(fx)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if tc.wantCode == http.StatusNotFound {
				fx.changedNothing(curriculaTable)
				fx.changedNothing(curriculumNodeTable)
			}
		})
	}
}

func TestUpdateCurriculumCannotMoveItToAnotherSessionSubjectOrGrade(t *testing.T) {
	curriculum := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name  string
		field string
	}{
		{"a different academic session", entcurriculum.FieldAcademicSessionID},
		{"a different subject", entcurriculum.FieldSubjectID},
		{"a different grade level", entcurriculum.FieldGradeLevelID},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(curriculum, session, subject, grade, entcurriculum.StatusDraft),
			}
			body := curriculumBody(map[string]any{tc.field: uuid.New()})

			w := fx.call(fx.server.updateCurriculum, "PATCH",
				"/api/v1/curricula/"+curriculum.String(), body, curriculum)

			wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, tc.field, "cannot be changed")
			fx.refusedBefore(curriculaTable)
		})
	}
}

func TestUpdateCurriculumRefusesTheCodeItWasCreatedWith(t *testing.T) {
	curriculum := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t)
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(curriculum, session, subject, grade, entcurriculum.StatusDraft),
	}

	w := fx.call(fx.server.updateCurriculum, "PATCH",
		"/api/v1/curricula/"+curriculum.String(), `{"code":"MATH-9-2027"}`, curriculum)

	wantLibraryRefusal(t, w, http.StatusUnprocessableEntity,
		entcurriculum.FieldCode, "cannot be changed")
	fx.refusedBefore(curriculaTable)
}

func TestUpdateCurriculumNodeRefusesToMoveItToAnotherCurriculum(t *testing.T) {
	node, curriculum := uuid.New(), uuid.New()

	fx := newCurriculumFixture(t)
	fx.driver.tables[curriculumNodeTable] = []map[string]any{
		curriculumNodeRow(node, curriculum, nil),
	}
	body := curriculumBody(map[string]any{entnode.FieldCurriculumID: uuid.New()})

	w := fx.call(fx.server.updateCurriculumNode, "PATCH",
		"/api/v1/curriculum-nodes/"+node.String(), body, node)

	wantLibraryRefusal(t, w, http.StatusUnprocessableEntity,
		entnode.FieldCurriculumID, "cannot be changed")
	fx.refusedBefore(curriculumNodeTable)
}

func TestCreateCurriculumNodeTakesTheCurriculumFromThePath(t *testing.T) {
	mine, theirs := uuid.New(), uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t)
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(mine, session, subject, grade, entcurriculum.StatusDraft),
	}
	body := curriculumBody(map[string]any{
		"title": "Fractions", "sequence": 1, entnode.FieldCurriculumID: theirs,
	})

	w := fx.call(fx.server.createCurriculumNode, "POST",
		"/api/v1/curricula/"+mine.String()+"/nodes", body, mine)

	wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, entnode.FieldCurriculumID)
	fx.refusedBefore(curriculumNodeTable)
}

func TestCreateCurriculumNodeRefusesAParentInAnotherCurriculum(t *testing.T) {
	mine, theirs := uuid.New(), uuid.New()
	ownNode, otherNode := uuid.New(), uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		parent   uuid.UUID
		wantCode int
	}{
		{"a node of the same curriculum", ownNode, http.StatusCreated},
		{"a node of a curriculum the caller is not writing to", otherNode, http.StatusUnprocessableEntity},
		{"a node that does not exist at all", uuid.New(), http.StatusUnprocessableEntity},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(mine, session, subject, grade, entcurriculum.StatusDraft),
				curriculumRow(theirs, session, uuid.New(), uuid.New(), entcurriculum.StatusDraft),
			}
			fx.driver.tables[curriculumNodeTable] = []map[string]any{
				curriculumChapterRow(ownNode, mine, nil),
				curriculumChapterRow(otherNode, theirs, nil),
			}
			body := curriculumBody(map[string]any{
				"title": "Fractions", "sequence": 2, "parent_id": tc.parent,
			})

			w := fx.call(fx.server.createCurriculumNode, "POST",
				"/api/v1/curricula/"+mine.String()+"/nodes", body, mine)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if tc.wantCode != http.StatusCreated {
				wantLibraryRefusal(t, w, tc.wantCode, entnode.FieldParentID, "same curriculum")
				fx.refusedBefore(curriculumNodeTable)
				return
			}
			insert := fx.onlyWrite(curriculumNodeTable)
			if !insert.carries(mine) {
				t.Fatalf("the node must be filed under the curriculum in the path, got %v", insert.args)
			}
			if insert.carries(theirs) {
				t.Fatalf("the node must not reach the other curriculum, got %v", insert.args)
			}
		})
	}
}

func TestUpdateCurriculumNodeRefusesAParentInAnotherCurriculum(t *testing.T) {
	mine, theirs := uuid.New(), uuid.New()
	node, ownNode, otherNode := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		parent   uuid.UUID
		wantCode int
	}{
		{"a sibling", ownNode, http.StatusOK},
		{"a node of another curriculum", otherNode, http.StatusUnprocessableEntity},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculumNodeTable] = []map[string]any{
				curriculumNodeRow(node, mine, nil),
				curriculumChapterRow(ownNode, mine, nil),
				curriculumChapterRow(otherNode, theirs, nil),
			}
			body := curriculumBody(map[string]any{"parent_id": tc.parent})

			w := fx.call(fx.server.updateCurriculumNode, "PATCH",
				"/api/v1/curriculum-nodes/"+node.String(), body, node)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if tc.wantCode != http.StatusOK {
				wantLibraryRefusal(t, w, tc.wantCode, entnode.FieldParentID, "same curriculum")
				fx.refusedBefore(curriculumNodeTable)
				return
			}
			if !fx.onlyWrite(curriculumNodeTable).carries(ownNode) {
				t.Fatal("the sibling was not recorded as the new parent")
			}
		})
	}
}

func TestUpdateCurriculumNodeRefusesACycle(t *testing.T) {
	curriculum := uuid.New()
	root, child := uuid.New(), uuid.New()

	cases := []struct {
		name   string
		node   uuid.UUID
		parent uuid.UUID
	}{
		{"a node adopted by itself", root, root},
		{"a node adopted by its own child", root, child},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculumNodeTable] = []map[string]any{
				curriculumNodeRow(root, curriculum, nil),
				curriculumNodeRow(child, curriculum, &root),
			}
			body := curriculumBody(map[string]any{"parent_id": tc.parent})

			w := fx.call(fx.server.updateCurriculumNode, "PATCH",
				"/api/v1/curriculum-nodes/"+tc.node.String(), body, tc.node)

			wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, entnode.FieldParentID)
			fx.refusedBefore(curriculumNodeTable)
		})
	}
}

func TestCreateCurriculumRefusesASecondActiveCurriculumForTheSameTriple(t *testing.T) {
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		existing entcurriculum.Status
		asking   string
		wantCode int
	}{
		{"a second active one", entcurriculum.StatusActive, "active", http.StatusConflict},
		{"a draft alongside an active one", entcurriculum.StatusActive, "draft", http.StatusCreated},
		{"an active one beside an archived one", entcurriculum.StatusArchived, "active", http.StatusCreated},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(uuid.New(), session, subject, grade, tc.existing),
			}
			body := fullCurriculumBody(session, subject, grade)
			body["status"] = tc.asking

			w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula",
				curriculumBody(body), uuid.Nil)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if tc.wantCode == http.StatusConflict {
				wantLibraryRefusal(t, w, http.StatusConflict, "curriculum_active_exists")
				fx.refusedBefore(curriculaTable)
				return
			}
			fx.onlyWrite(curriculaTable)
		})
	}
}

func TestUpdateCurriculumRefusesToActivateBesideAnotherActiveOne(t *testing.T) {
	mine, theirs := uuid.New(), uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t)
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(mine, session, subject, grade, entcurriculum.StatusDraft),
		curriculumRow(theirs, session, subject, grade, entcurriculum.StatusActive),
	}

	w := fx.call(fx.server.updateCurriculum, "PATCH",
		"/api/v1/curricula/"+mine.String(), `{"status":"active"}`, mine)

	wantLibraryRefusal(t, w, http.StatusConflict, "curriculum_active_exists")
	fx.refusedBefore(curriculaTable)
}

func TestCurriculumLineageMustNameSomethingTheCallerCanRead(t *testing.T) {
	lineage := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name  string
		field string
	}{
		{"supersedes", entcurriculum.FieldSupersedesID},
		{"copied from", entcurriculum.FieldCopiedFromID},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t,
				curriculumReaches(authorization.ReachSelf, authorization.ReachTenant))
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(lineage, session, subject, grade, entcurriculum.StatusActive),
			}
			body := fullCurriculumBody(session, subject, grade)
			body[tc.field] = lineage

			w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula",
				curriculumBody(body), uuid.Nil)

			wantLibraryRefusal(t, w, http.StatusUnprocessableEntity, tc.field, "you can read")
			fx.refusedBefore(curriculaTable)
		})
	}
}

func TestCurriculumLineageIsAcceptedWhenTheCallerCanReadIt(t *testing.T) {
	lineage := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t,
		curriculumReaches(authorization.ReachTenant, authorization.ReachTenant))
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(lineage, session, subject, grade, entcurriculum.StatusArchived),
	}
	body := fullCurriculumBody(session, subject, grade)
	body[entcurriculum.FieldSupersedesID] = lineage

	w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula",
		curriculumBody(body), uuid.Nil)

	if w.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if !fx.onlyWrite(curriculaTable).carries(lineage) {
		t.Fatal("the lineage was not recorded")
	}
}

func TestUpdateCurriculumRefusesLineageThatPointsAtItself(t *testing.T) {
	curriculum := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t)
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(curriculum, session, subject, grade, entcurriculum.StatusDraft),
	}
	body := curriculumBody(map[string]any{entcurriculum.FieldSupersedesID: curriculum})

	w := fx.call(fx.server.updateCurriculum, "PATCH",
		"/api/v1/curricula/"+curriculum.String(), body, curriculum)

	wantLibraryRefusal(t, w, http.StatusUnprocessableEntity,
		entcurriculum.FieldSupersedesID, "itself")
	fx.refusedBefore(curriculaTable)
}

func TestCreateCurriculumRefusesAMalformedBody(t *testing.T) {
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	without := func(field string) string {
		body := fullCurriculumBody(session, subject, grade)
		delete(body, field)
		return curriculumBody(body)
	}
	with := func(field string, value any) string {
		body := fullCurriculumBody(session, subject, grade)
		body[field] = value
		return curriculumBody(body)
	}

	cases := []struct {
		name string
		body string
		want string
	}{
		{"no name", without("name"), "name is required"},
		{"an empty name", with("name", ""), "name is required"},
		{"no code", without("code"), "code is required"},
		{"no academic session", without("academic_session_id"), "academic_session_id"},
		{"no subject", without("subject_id"), "subject_id"},
		{"no grade level", without("grade_level_id"), "grade_level_id"},
		{"an unknown field", with("shelf", "fiction"), "shelf"},
		{"a body that is not JSON", `not json`, "invalid JSON body"},
		{"an empty body", ``, "invalid JSON body"},
		{"a status that does not exist", with("status", "retired"), "status must be"},
		{"an origin that does not exist", with("origin", "bought"), "origin must be"},
		{"an identifier that is not a UUID", with("subject_id", "seven"), "subject_id"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)

			w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula", tc.body, uuid.Nil)

			wantLibraryRefusal(t, w, http.StatusBadRequest, tc.want)
			fx.refusedBefore(curriculaTable)
		})
	}
}

func TestCreateCurriculumNodeRefusesAMalformedBody(t *testing.T) {
	curriculum := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name string
		body string
		want string
	}{
		{"no title", `{"sequence":1}`, "title is required"},
		{"an empty title", `{"title":"","sequence":1}`, "title is required"},
		{"no sequence", `{"title":"Fractions"}`, "sequence is required"},
		{"a negative sequence", `{"title":"Fractions","sequence":-1}`, "sequence must not be negative"},
		{"an unknown kind", `{"title":"Fractions","sequence":1,"kind":"lesson"}`, "kind must be"},
		{"an unknown status", `{"title":"Fractions","sequence":1,"status":"retired"}`, "status must be"},
		{"an unknown field", `{"title":"Fractions","sequence":1,"depth":2}`, "depth"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(curriculum, session, subject, grade, entcurriculum.StatusDraft),
			}

			w := fx.call(fx.server.createCurriculumNode, "POST",
				"/api/v1/curricula/"+curriculum.String()+"/nodes", tc.body, curriculum)

			wantLibraryRefusal(t, w, http.StatusBadRequest, tc.want)
			fx.refusedBefore(curriculumNodeTable)
		})
	}
}

func TestCurriculumTextIsMeasuredInRunesNotBytes(t *testing.T) {
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		field    string
		value    string
		wantCode int
	}{
		{"a devanagari name", "name", "गणित का पाठ्यक्रम", http.StatusCreated},
		{"200 devanagari characters", "name", strings.Repeat("अ", 200), http.StatusCreated},
		{"201 devanagari characters", "name", strings.Repeat("अ", 201), http.StatusBadRequest},
		{"200 four byte emoji", "name", strings.Repeat("📚", 200), http.StatusCreated},
		{"201 ascii characters", "name", strings.Repeat("a", 201), http.StatusBadRequest},
		{"64 devanagari board characters", "board", strings.Repeat("अ", 64), http.StatusCreated},
		{"65 devanagari board characters", "board", strings.Repeat("अ", 65), http.StatusBadRequest},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			body := fullCurriculumBody(session, subject, grade)
			body[tc.field] = tc.value

			w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula",
				curriculumBody(body), uuid.Nil)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if tc.wantCode != http.StatusCreated {
				fx.refusedBefore(curriculaTable)
				return
			}
			if !fx.onlyWrite(curriculaTable).carries(tc.value) {
				t.Fatalf("%s %q was not stored verbatim", tc.field, tc.value)
			}
		})
	}
}

func TestCurriculumNodeTitleIsMeasuredInRunesNotBytes(t *testing.T) {
	curriculum := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		title    string
		wantCode int
	}{
		{"255 devanagari characters", strings.Repeat("अ", 255), http.StatusCreated},
		{"256 devanagari characters", strings.Repeat("अ", 256), http.StatusBadRequest},
		{"255 four byte emoji", strings.Repeat("📚", 255), http.StatusCreated},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(curriculum, session, subject, grade, entcurriculum.StatusDraft),
			}
			body := curriculumBody(map[string]any{
				"title": tc.title, "sequence": 1, "kind": string(entnode.KindChapter),
			})

			w := fx.call(fx.server.createCurriculumNode, "POST",
				"/api/v1/curricula/"+curriculum.String()+"/nodes", body, curriculum)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if tc.wantCode != http.StatusCreated {
				fx.refusedBefore(curriculumNodeTable)
				return
			}
			if !fx.onlyWrite(curriculumNodeTable).carries(tc.title) {
				t.Fatalf("the title %q was not stored verbatim", tc.title)
			}
		})
	}
}

func TestCurriculumIDMustBeAUUID(t *testing.T) {
	cases := []struct {
		name string
		call func(fx *libraryFixture) *httptest.ResponseRecorder
	}{
		{
			name: "get",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.getCurriculum, "GET", "/api/v1/curricula/seven", "", uuid.Nil)
			},
		},
		{
			name: "update",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateCurriculum, "PATCH",
					"/api/v1/curricula/seven", `{"name":"Mathematics"}`, uuid.Nil)
			},
		},
		{
			name: "delete",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteCurriculum, "DELETE", "/api/v1/curricula/seven", "", uuid.Nil)
			},
		},
		{
			name: "list nodes",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.listCurriculumNodes, "GET",
					"/api/v1/curricula/seven/nodes", "", uuid.Nil)
			},
		},
		{
			name: "create node",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.createCurriculumNode, "POST",
					"/api/v1/curricula/seven/nodes", `{"title":"Fractions","sequence":1}`, uuid.Nil)
			},
		},
		{
			name: "update node",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updateCurriculumNode, "PATCH",
					"/api/v1/curriculum-nodes/seven", `{"title":"Fractions"}`, uuid.Nil)
			},
		},
		{
			name: "delete node",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deleteCurriculumNode, "DELETE",
					"/api/v1/curriculum-nodes/seven", "", uuid.Nil)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)

			w := tc.call(fx)

			wantLibraryRefusal(t, w, http.StatusBadRequest, "id must be a UUID")
			fx.refusedBefore(curriculaTable)
			fx.refusedBefore(curriculumNodeTable)
		})
	}
}

func TestUpdateCurriculumNodeClearsTheParentWhenToldTo(t *testing.T) {
	curriculum := uuid.New()
	root, child := uuid.New(), uuid.New()

	fx := newCurriculumFixture(t)
	fx.driver.tables[curriculumNodeTable] = []map[string]any{
		curriculumUnitRow(root, curriculum),
		curriculumChapterRow(child, curriculum, &root),
	}

	w := fx.call(fx.server.updateCurriculumNode, "PATCH",
		"/api/v1/curriculum-nodes/"+child.String(), `{"parent_id":null}`, child)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	update := fx.onlyWrite(curriculumNodeTable)
	if !strings.Contains(update.query, `"`+entnode.FieldParentID+`" = NULL`) {
		t.Fatalf("the node must be promoted to a root, got %q", update.query)
	}
}

type subjectTeacher struct {
	maths   uuid.UUID
	science uuid.UUID
	grade9  uuid.UUID
	grade10 uuid.UUID
}

func teachesSubjectsNotClasses(sc *subjectTeacher) libraryOption {
	return func(fx *libraryFixture) {
		staff, teacher := uuid.New(), uuid.New()
		section9, section10 := uuid.New(), uuid.New()
		offering9, offering10 := uuid.New(), uuid.New()

		fx.driver.tables["staff"] = []map[string]any{{"id": staff, "person_id": fx.person}}
		fx.driver.tables["teachers"] = []map[string]any{{"id": teacher, "staff_id": staff}}
		fx.driver.tables["teacher_assignments"] = []map[string]any{
			{
				"id": uuid.New(), "teacher_id": teacher,
				"section_id": section9, "subject_offering_id": offering9,
			},
			{
				"id": uuid.New(), "teacher_id": teacher,
				"section_id": section10, "subject_offering_id": offering10,
			},
		}
		fx.driver.tables["subject_offerings"] = []map[string]any{
			{"id": offering9, "subject_id": sc.maths, "section_id": section9},
			{"id": offering10, "subject_id": sc.science, "section_id": section10},
		}
		fx.driver.tables[sectionsTable] = []map[string]any{
			{"id": section9, "grade_level_id": sc.grade9},
			{"id": section10, "grade_level_id": sc.grade10},
		}
	}
}

func curriculumReadOf(fx *libraryFixture) libraryStmt {
	fx.t.Helper()
	reads := fx.statements(curriculaTable)
	if len(reads) == 0 {
		fx.t.Fatal("the path never read curricula")
	}
	return reads[0]
}

func wantSubjectGradePairsOnly(t *testing.T, stmt libraryStmt, sc subjectTeacher) {
	t.Helper()

	if strings.Contains(stmt.query, "EXISTS (") || strings.Contains(stmt.query, "IN (SELECT") {
		t.Fatalf("this viewer must narrow through plain subject and grade terms, "+
			"but the stub was handed a subquery it cannot evaluate: %q", stmt.query)
	}
	if strings.Contains(stmt.query, "FALSE") {
		t.Fatalf("the viewer carried no taught pairs, so the predicate refused everything "+
			"and the rows below would prove nothing: %q", stmt.query)
	}

	for _, want := range []struct {
		name string
		id   uuid.UUID
	}{
		{"maths", sc.maths},
		{"science", sc.science},
		{"grade 9", sc.grade9},
		{"grade 10", sc.grade10},
	} {
		if !stmt.carries(want.id) {
			t.Fatalf("the predicate must bind %s (%s), got %q %v",
				want.name, want.id, stmt.query, stmt.args)
		}
	}

	pair := `("curricula"."subject_id" = $`
	if strings.Count(stmt.query, pair) != 2 {
		t.Fatalf("expected one bound subject and grade pair per taught pair, got %q", stmt.query)
	}
}

func TestListCurriculaReturnsTheTaughtPairsAndNotTheCrossedOne(t *testing.T) {
	sc := subjectTeacher{
		maths:   uuid.New(),
		science: uuid.New(),
		grade9:  uuid.New(),
		grade10: uuid.New(),
	}
	session := uuid.New()
	taughtMaths, taughtScience, crossed := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t,
		curriculumReaches(authorization.ReachTeacherAssignment, authorization.ReachTeacherAssignment),
		teachesSubjectsNotClasses(&sc))
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(taughtMaths, session, sc.maths, sc.grade9, entcurriculum.StatusActive),
		curriculumRow(taughtScience, session, sc.science, sc.grade10, entcurriculum.StatusActive),
		curriculumRow(crossed, session, sc.science, sc.grade9, entcurriculum.StatusActive),
	}

	w := fx.call(fx.server.listCurricula, "GET", "/api/v1/curricula", "", uuid.Nil)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	wantSubjectGradePairsOnly(t, curriculumReadOf(fx), sc)

	body := w.Body.String()
	if !strings.Contains(body, `"count":2`) {
		t.Fatalf("the teacher teaches two pairs and must see two curricula, got %s", body)
	}
	for _, want := range []uuid.UUID{taughtMaths, taughtScience} {
		if !strings.Contains(body, want.String()) {
			t.Fatalf("the taught curriculum %s was filtered out, got %s", want, body)
		}
	}
	if strings.Contains(body, crossed.String()) {
		t.Fatalf("science in grade 9 is taught by nobody here and must not come back, got %s", body)
	}
}

func TestCurriculumWritesReachTheTaughtPairsAndNotTheCrossedOne(t *testing.T) {
	session := uuid.New()
	taughtMaths, crossed := uuid.New(), uuid.New()

	cases := []struct {
		name     string
		target   uuid.UUID
		wantCode int
	}{
		{"a curriculum the teacher teaches", taughtMaths, http.StatusOK},
		{"the crossed subject and grade", crossed, http.StatusNotFound},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sc := subjectTeacher{
				maths:   uuid.New(),
				science: uuid.New(),
				grade9:  uuid.New(),
				grade10: uuid.New(),
			}
			fx := newCurriculumFixture(t,
				curriculumReaches(authorization.ReachTeacherAssignment,
					authorization.ReachTeacherAssignment),
				teachesSubjectsNotClasses(&sc))
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(taughtMaths, session, sc.maths, sc.grade9, entcurriculum.StatusDraft),
				curriculumRow(crossed, session, sc.science, sc.grade9, entcurriculum.StatusDraft),
			}

			w := fx.call(fx.server.updateCurriculum, "PATCH",
				"/api/v1/curricula/"+tc.target.String(), `{"name":"Revised"}`, tc.target)

			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			wantSubjectGradePairsOnly(t, curriculumReadOf(fx), sc)

			if tc.wantCode == http.StatusNotFound {
				fx.refusedBefore(curriculaTable)
				return
			}
			if !fx.onlyWrite(curriculaTable).carries("Revised") {
				t.Fatal("the taught curriculum was not renamed")
			}
		})
	}
}

func TestCreateCurriculumIsGatedByTheWriteReach(t *testing.T) {
	sc := subjectTeacher{
		maths:   uuid.New(),
		science: uuid.New(),
		grade9:  uuid.New(),
		grade10: uuid.New(),
	}
	session := uuid.New()

	cases := []struct {
		name     string
		write    authorization.Reach
		subject  uuid.UUID
		grade    uuid.UUID
		wantCode int
	}{
		{
			name: "a pair the teacher actually teaches", write: authorization.ReachTeacherAssignment,
			subject: sc.maths, grade: sc.grade9, wantCode: http.StatusCreated,
		},
		{
			name: "the crossed subject and grade", write: authorization.ReachTeacherAssignment,
			subject: sc.science, grade: sc.grade9, wantCode: http.StatusForbidden,
		},
		{
			name:    "a subject and grade the teacher has nothing to do with",
			write:   authorization.ReachTeacherAssignment,
			subject: uuid.New(), grade: uuid.New(), wantCode: http.StatusForbidden,
		},
		{
			name: "a self reach may not create at all", write: authorization.ReachSelf,
			subject: sc.maths, grade: sc.grade9, wantCode: http.StatusForbidden,
		},
		{
			name: "a guardian reach may not create at all", write: authorization.ReachGuardianWard,
			subject: sc.maths, grade: sc.grade9, wantCode: http.StatusForbidden,
		},
		{
			name: "a tenant reach creates anywhere", write: authorization.ReachTenant,
			subject: uuid.New(), grade: uuid.New(), wantCode: http.StatusCreated,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t,
				curriculumReaches(authorization.ReachTenant, tc.write),
				teachesSubjectsNotClasses(&sc))

			w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula",
				curriculumBody(fullCurriculumBody(session, tc.subject, tc.grade)), uuid.Nil)

			if tc.wantCode != http.StatusCreated {
				wantLibraryRefusal(t, w, tc.wantCode,
					entcurriculum.FieldSubjectID, entcurriculum.FieldGradeLevelID)
				fx.refusedBefore(curriculaTable)
				return
			}
			if w.Code != http.StatusCreated {
				t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			fx.onlyWrite(curriculaTable)
		})
	}
}

func TestCreateCurriculumCannotSeizeTheActiveSlotOutsideItsReach(t *testing.T) {
	sc := subjectTeacher{
		maths:   uuid.New(),
		science: uuid.New(),
		grade9:  uuid.New(),
		grade10: uuid.New(),
	}
	session := uuid.New()

	fx := newCurriculumFixture(t,
		curriculumReaches(authorization.ReachTenant, authorization.ReachTeacherAssignment),
		teachesSubjectsNotClasses(&sc))

	body := fullCurriculumBody(session, sc.science, sc.grade9)
	body["status"] = "active"

	w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula",
		curriculumBody(body), uuid.Nil)

	wantLibraryRefusal(t, w, http.StatusForbidden,
		entcurriculum.FieldSubjectID, entcurriculum.FieldGradeLevelID)
	fx.refusedBefore(curriculaTable)
}

func curriculumPinnedTo(field string, values ...string) libraryOption {
	return func(fx *libraryFixture) {
		reading := authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTenant,
			HasReach: true,
		}
		writing := authorization.Decision{
			Allowed:     true,
			Reach:       authorization.ReachTenant,
			HasReach:    true,
			Constraints: [][]authorization.Constraint{{{Field: field, Values: values}}},
		}
		fx.server.guard = curriculumGuard{allow: map[authorization.Entity]authorization.Decision{
			authorization.CurriculumRead:   reading,
			authorization.CurriculumCreate: writing,
			authorization.CurriculumWrite:  writing,
			authorization.CurriculumDelete: writing,
		}}
	}
}

func TestCreateCurriculumHonoursAPinnedGrant(t *testing.T) {
	session, subject := uuid.New(), uuid.New()
	grade9, grade10 := uuid.New(), uuid.New()

	cases := []struct {
		name     string
		field    string
		values   []string
		grade    uuid.UUID
		wantCode int
	}{
		{
			name: "the pinned grade level", field: "grade_level", values: []string{"9"},
			grade: grade9, wantCode: http.StatusCreated,
		},
		{
			name: "a grade level the pin excludes", field: "grade_level", values: []string{"9"},
			grade: grade10, wantCode: http.StatusForbidden,
		},
		{
			name: "a pin naming something no row carries", field: "term", values: []string{"2"},
			grade: grade9, wantCode: http.StatusForbidden,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t, curriculumPinnedTo(tc.field, tc.values...))
			fx.driver.tables[gradeLevelsTable] = []map[string]any{
				{"id": grade9, "code": "9"},
				{"id": grade10, "code": "10"},
			}

			w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula",
				curriculumBody(fullCurriculumBody(session, subject, tc.grade)), uuid.Nil)

			if tc.wantCode != http.StatusCreated {
				wantLibraryRefusal(t, w, tc.wantCode,
					entcurriculum.FieldSubjectID, entcurriculum.FieldGradeLevelID)
				fx.refusedBefore(curriculaTable)
				return
			}
			if w.Code != http.StatusCreated {
				t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			fx.onlyWrite(curriculaTable)
		})
	}
}

func TestACurriculumBoardIsNormalisedTheSameWayAPaperBoardIs(t *testing.T) {
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name string
		sent string
		want string
	}{
		{"as it is", "CBSE", "CBSE"},
		{"padded", " CBSE ", "CBSE"},
		{"lower case", "cbse", "cbse"},
		{"split by a stray run", "Central   Board ", "Central Board"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			body := fullCurriculumBody(session, subject, grade)
			body[entcurriculum.FieldBoard] = tc.sent

			w := fx.call(fx.server.createCurriculum, "POST", "/api/v1/curricula",
				curriculumBody(body), uuid.Nil)

			if w.Code != http.StatusCreated {
				t.Fatalf("want 201, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			insert := fx.onlyWrite(curriculaTable)
			if !insert.carriesText(tc.want) {
				t.Fatalf("%q must be stored as %q, got %v", tc.sent, tc.want, insert.args)
			}
			if tc.sent != tc.want && insert.carriesText(tc.sent) {
				t.Fatalf("%q was stored as it was sent, so it is a board of its own: %v",
					tc.sent, insert.args)
			}
		})
	}
}

func TestUpdateCurriculumNormalisesTheBoardItStores(t *testing.T) {
	mine := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()

	fx := newCurriculumFixture(t)
	fx.driver.tables[curriculaTable] = []map[string]any{
		curriculumRow(mine, session, subject, grade, entcurriculum.StatusDraft),
	}

	w := fx.call(fx.server.updateCurriculum, "PATCH",
		"/api/v1/curricula/"+mine.String(), `{"board":"  CBSE "}`, mine)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	update := fx.onlyWrite(curriculaTable)
	if !update.carriesText("CBSE") {
		t.Fatalf("the update must store the normalised board, got %v", update.args)
	}
	if update.carriesText("  CBSE ") {
		t.Fatalf("the update stored the board as it was sent, got %v", update.args)
	}
}

func curriculumShapeTree(fx *libraryFixture, curriculum, unit, chapter, topic uuid.UUID) {
	fx.driver.tables[curriculumNodeTable] = []map[string]any{
		curriculumUnitRow(unit, curriculum),
		curriculumChapterRow(chapter, curriculum, &unit),
		curriculumNodeRow(topic, curriculum, &chapter),
	}
}

func TestCreateCurriculumNodeRefusesAShapeTheCurriculumDoesNotHave(t *testing.T) {
	curriculum := uuid.New()
	session, subject, grade := uuid.New(), uuid.New(), uuid.New()
	unit, chapter, topic := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		kind     string
		parent   *uuid.UUID
		wantCode int
		fragment string
	}{
		{"a topic inside a chapter", "topic", &chapter, http.StatusCreated, ""},
		{"a chapter inside a unit", "chapter", &unit, http.StatusCreated, ""},
		{"a chapter at the root, in a school without units", "chapter", nil, http.StatusCreated, ""},
		{"a unit at the root", "unit", nil, http.StatusCreated, ""},

		{"a topic at the root", "topic", nil, http.StatusUnprocessableEntity,
			"a topic must sit inside a chapter"},
		{"no kind at the root, which defaults to topic", "", nil, http.StatusUnprocessableEntity,
			"a topic must sit inside a chapter"},
		{"a topic inside a unit", "topic", &unit, http.StatusUnprocessableEntity,
			"a topic may only sit under a chapter"},
		{"a topic inside a topic", "topic", &topic, http.StatusUnprocessableEntity,
			"a topic may only sit under a chapter"},
		{"a chapter inside a chapter", "chapter", &chapter, http.StatusUnprocessableEntity,
			"a chapter may only sit under a unit"},
		{"a chapter inside a topic", "chapter", &topic, http.StatusUnprocessableEntity,
			"a chapter may only sit under a unit"},
		{"a unit inside a unit", "unit", &unit, http.StatusUnprocessableEntity,
			"a unit is a top-level grouping"},
		{"a unit inside a chapter", "unit", &chapter, http.StatusUnprocessableEntity,
			"a unit is a top-level grouping"},
		{"a unit inside a topic", "unit", &topic, http.StatusUnprocessableEntity,
			"a unit is a top-level grouping"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculaTable] = []map[string]any{
				curriculumRow(curriculum, session, subject, grade, entcurriculum.StatusDraft),
			}
			curriculumShapeTree(fx, curriculum, unit, chapter, topic)

			fields := map[string]any{"title": "Fractions", "sequence": 3}
			if tc.kind != "" {
				fields["kind"] = tc.kind
			}
			if tc.parent != nil {
				fields["parent_id"] = *tc.parent
			}

			w := fx.call(fx.server.createCurriculumNode, "POST",
				"/api/v1/curricula/"+curriculum.String()+"/nodes",
				curriculumBody(fields), curriculum)

			if tc.wantCode != http.StatusCreated {
				fragments := []string{"curriculum_shape", tc.fragment}
				if tc.parent != nil {
					fragments = append(fragments, tc.parent.String())
				}
				wantLibraryRefusal(t, w, tc.wantCode, fragments...)
				fx.refusedBefore(curriculumNodeTable)
				return
			}
			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if !fx.onlyWrite(curriculumNodeTable).carriesText(tc.kind) {
				t.Fatalf("the node was not stored as a %s", tc.kind)
			}
		})
	}
}

func TestUpdateCurriculumNodeRefusesAReparentThatBreaksTheShape(t *testing.T) {
	curriculum := uuid.New()
	unit, spareUnit := uuid.New(), uuid.New()
	chapter, spareChapter := uuid.New(), uuid.New()
	topic, spareTopic := uuid.New(), uuid.New()

	toParent := func(parent *uuid.UUID) string {
		if parent == nil {
			return `{"parent_id":null}`
		}
		return curriculumBody(map[string]any{"parent_id": *parent})
	}

	cases := []struct {
		name     string
		node     uuid.UUID
		parent   *uuid.UUID
		wantCode int
		fragment string
	}{
		{"a topic moved to another chapter", topic, &spareChapter, http.StatusOK, ""},
		{"a chapter promoted to the root", chapter, nil, http.StatusOK, ""},

		{"a topic promoted to the root", topic, nil, http.StatusUnprocessableEntity,
			"a topic must sit inside a chapter"},
		{"a topic moved under a unit", topic, &unit, http.StatusUnprocessableEntity,
			"a topic may only sit under a chapter"},
		{"a topic moved under another topic", topic, &spareTopic, http.StatusUnprocessableEntity,
			"a topic may only sit under a chapter"},
		{"a chapter moved under another chapter", chapter, &spareChapter, http.StatusUnprocessableEntity,
			"a chapter may only sit under a unit"},
		{"a chapter moved under a topic", chapter, &spareTopic, http.StatusUnprocessableEntity,
			"a chapter may only sit under a unit"},
		{"a unit moved under a chapter", spareUnit, &chapter, http.StatusUnprocessableEntity,
			"a unit is a top-level grouping"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculumNodeTable] = []map[string]any{
				curriculumUnitRow(unit, curriculum),
				curriculumUnitRow(spareUnit, curriculum),
				curriculumChapterRow(chapter, curriculum, &unit),
				curriculumChapterRow(spareChapter, curriculum, &unit),
				curriculumNodeRow(topic, curriculum, &chapter),
				curriculumNodeRow(spareTopic, curriculum, &spareChapter),
			}

			w := fx.call(fx.server.updateCurriculumNode, "PATCH",
				"/api/v1/curriculum-nodes/"+tc.node.String(), toParent(tc.parent), tc.node)

			if tc.wantCode != http.StatusOK {
				wantLibraryRefusal(t, w, tc.wantCode,
					"curriculum_shape", tc.fragment, tc.node.String())
				fx.refusedBefore(curriculumNodeTable)
				return
			}
			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			fx.onlyWrite(curriculumNodeTable)
		})
	}
}

func TestUpdateCurriculumNodeRefusesAKindChangeItsChildrenForbid(t *testing.T) {
	curriculum := uuid.New()
	rootUnit, hostChapter := uuid.New(), uuid.New()
	rootChapter, topicChild, emptyChapter := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		node     uuid.UUID
		fields   map[string]any
		wantCode int
		fragment string
	}{
		{"a childless chapter becoming a unit", emptyChapter,
			map[string]any{"kind": "unit"}, http.StatusOK, ""},

		{"a chapter holding topics becoming a unit", rootChapter,
			map[string]any{"kind": "unit"}, http.StatusUnprocessableEntity,
			"a unit holds only chapters"},
		{"a unit holding chapters becoming a chapter", rootUnit,
			map[string]any{"kind": "chapter"}, http.StatusUnprocessableEntity,
			"a chapter holds only topics"},
		{"a chapter holding topics moved into a chapter as a topic", rootChapter,
			map[string]any{"kind": "topic", "parent_id": hostChapter}, http.StatusUnprocessableEntity,
			"a topic holds no children"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newCurriculumFixture(t)
			fx.driver.tables[curriculumNodeTable] = []map[string]any{
				curriculumUnitRow(rootUnit, curriculum),
				curriculumChapterRow(hostChapter, curriculum, &rootUnit),
				curriculumChapterRow(rootChapter, curriculum, nil),
				curriculumNodeRow(topicChild, curriculum, &rootChapter),
				curriculumChapterRow(emptyChapter, curriculum, nil),
			}

			w := fx.call(fx.server.updateCurriculumNode, "PATCH",
				"/api/v1/curriculum-nodes/"+tc.node.String(),
				curriculumBody(tc.fields), tc.node)

			if tc.wantCode != http.StatusOK {
				wantLibraryRefusal(t, w, tc.wantCode,
					"curriculum_shape", tc.fragment, tc.node.String())
				fx.refusedBefore(curriculumNodeTable)
				return
			}
			if w.Code != tc.wantCode {
				t.Fatalf("want %d, got %d: %s", tc.wantCode, w.Code, strings.TrimSpace(w.Body.String()))
			}
			if !fx.onlyWrite(curriculumNodeTable).carriesText(fmt.Sprint(tc.fields["kind"])) {
				t.Fatalf("the node was not stored as a %v", tc.fields["kind"])
			}
		})
	}
}
