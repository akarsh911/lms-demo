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
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
)

var placementGatedTables = map[string]bool{
	"content_placements": true,
	"content_items":      true,
	"curricula":          true,
	"curriculum_nodes":   true,
	"content_nodes":      true,
}

type placementDriver struct{ inner *libraryDriver }

func (d *placementDriver) Query(ctx context.Context, query string, args, v any) error {
	table := libraryQueriedTable(query)
	if !placementGatedTables[table] {
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

func (d *placementDriver) Exec(ctx context.Context, query string, args, v any) error {
	return d.inner.Exec(ctx, query, args, v)
}

func (d *placementDriver) Tx(context.Context) (dialect.Tx, error) { return dialect.NopTx(d), nil }
func (d *placementDriver) Close() error                           { return d.inner.Close() }
func (d *placementDriver) Dialect() string                        { return d.inner.Dialect() }

func newPlacementFixture(t *testing.T, opts ...libraryOption) *libraryFixture {
	t.Helper()

	person := uuid.New()
	inner := &libraryDriver{tables: map[string][]map[string]any{
		"persons": {{"id": person}},
	}}
	client := tenantent.NewClient(tenantent.Driver(&placementDriver{inner: inner}))

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

type placementGuard struct {
	allow map[authorization.Entity]authorization.Decision
}

func (g placementGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	return g.allow[entity], nil
}

func (placementGuard) Name() string { return "placement test guard" }

func placementReach(reach authorization.Reach) authorization.Decision {
	return authorization.Decision{Allowed: true, Reach: reach, HasReach: true}
}

func placementGuards(placements, library authorization.Decision) libraryOption {
	return func(fx *libraryFixture) {
		fx.server.guard = placementGuard{allow: map[authorization.Entity]authorization.Decision{
			authorization.ContentPlacementsCreate: placements,
			authorization.ContentPlacementsRead:   placements,
			authorization.ContentPlacementsWrite:  placements,
			authorization.ContentPlacementsDelete: placements,
			authorization.LibraryRead:             library,
		}}
	}
}

func placementNarrowedLibrary() libraryOption {
	return placementGuards(
		placementReach(authorization.ReachTenant),
		placementReach(authorization.ReachSelf))
}

func placementGuardianOnly() libraryOption {
	return func(fx *libraryFixture) {
		fx.driver.tables["guardians"] = []map[string]any{{"id": uuid.New()}}
		fx.server.guard = placementGuard{allow: map[authorization.Entity]authorization.Decision{
			authorization.ContentPlacementsRead:   placementReach(authorization.ReachGuardianWard),
			authorization.ContentPlacementsWrite:  placementReach(authorization.ReachGuardianWard),
			authorization.ContentPlacementsDelete: placementReach(authorization.ReachGuardianWard),
			authorization.LibraryRead:             placementReach(authorization.ReachGuardianWard),
		}}
	}
}

func placementRootless() libraryOption {
	return placementGuards(
		placementReach(authorization.ReachSelf),
		placementReach(authorization.ReachSelf))
}

func placementSchoolItem(item uuid.UUID) map[string]any {
	return map[string]any{
		"id":       item,
		"audience": string(entcontentitem.AudienceSchool),
		"status":   string(entcontentitem.StatusPublished),
	}
}

func placementOwnedItem(item, owner uuid.UUID) map[string]any {
	return map[string]any{
		"id":              item,
		"audience":        string(entcontentitem.AudienceOwner),
		"owner_person_id": owner,
	}
}

type placementWorld struct {
	curriculum  uuid.UUID
	node        uuid.UUID
	item        uuid.UUID
	contentNode uuid.UUID
}

func placementSeed(fx *libraryFixture) placementWorld {
	w := placementWorld{
		curriculum:  uuid.New(),
		node:        uuid.New(),
		item:        uuid.New(),
		contentNode: uuid.New(),
	}
	fx.driver.tables["curricula"] = []map[string]any{{"id": w.curriculum}}
	fx.driver.tables["curriculum_nodes"] = []map[string]any{
		{"id": w.node, "curriculum_id": w.curriculum},
	}
	fx.driver.tables["content_items"] = []map[string]any{placementSchoolItem(w.item)}
	fx.driver.tables["content_nodes"] = []map[string]any{
		{"id": w.contentNode, "content_item_id": w.item},
	}
	return w
}

func placementRow(id, curriculum, item uuid.UUID) map[string]any {
	return map[string]any{
		"id":              id,
		"curriculum_id":   curriculum,
		"content_item_id": item,
		"grain":           string(entplacement.GrainCurriculum),
		"origin":          string(entplacement.OriginManual),
		"status":          string(entplacement.StatusProposed),
	}
}

func placementAtNode(id, curriculum, node, item uuid.UUID) map[string]any {
	row := placementRow(id, curriculum, item)
	row["curriculum_node_id"] = node
	row["grain"] = string(entplacement.GrainNode)
	return row
}

func placementCreate(curriculum, item uuid.UUID) map[string]any {
	return map[string]any{
		"curriculum_id":   curriculum,
		"content_item_id": item,
		"grain":           "curriculum",
	}
}

func (fx *libraryFixture) createPlacement(fields map[string]any) *httptest.ResponseRecorder {
	fx.t.Helper()
	return fx.call(fx.server.createPlacement, "POST", "/api/v1/placements",
		libraryBody(fields), uuid.Nil)
}

func (fx *libraryFixture) patchPlacement(id uuid.UUID, fields map[string]any) *httptest.ResponseRecorder {
	fx.t.Helper()
	return fx.call(fx.server.updatePlacement, "PATCH",
		"/api/v1/placements/"+id.String(), libraryBody(fields), id)
}

func TestPlacementFiltersRefuseWhatTheyDoNotUnderstand(t *testing.T) {
	id := uuid.New().String()

	cases := []struct {
		name   string
		values url.Values
		want   string
	}{
		{"an unknown parameter", url.Values{"shelf": {"fiction"}}, "shelf"},
		{"a misspelt parameter", url.Values{"curriculumid": {id}}, "curriculumid"},
		{"a parameter from another surface", url.Values{"audience": {"school"}}, "audience"},
		{"an identifier that is not a UUID", url.Values{"curriculum_id": {"seven"}}, "curriculum_id"},
		{"an unknown grain", url.Values{"grain": {"chapter"}}, "grain"},
		{"an unknown origin", url.Values{"origin": {"guessed"}}, "origin"},
		{"an unknown status", url.Values{"status": {"maybe"}}, "status"},
		{"a limit that is not a number", url.Values{"limit": {"lots"}}, "limit"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parsePlacementFilters(tc.values)
			if err == nil {
				t.Fatalf("%v must be refused, not silently dropped", tc.values)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("the error must name %q, got %v", tc.want, err)
			}
		})
	}
}

func TestCreatePlacementRefusesAContentItemTheCallerCannotRead(t *testing.T) {
	t.Run("an item owned by a stranger is refused as unknown", func(t *testing.T) {
		fx := newPlacementFixture(t, placementNarrowedLibrary())
		w := placementSeed(fx)
		stranger := uuid.New()
		fx.driver.tables["content_items"] = []map[string]any{placementOwnedItem(w.item, stranger)}

		res := fx.createPlacement(placementCreate(w.curriculum, w.item))

		wantLibraryRefusal(t, res, http.StatusUnprocessableEntity,
			entplacement.FieldContentItemID, "does not name a known content item")
		if strings.Contains(libraryMessage(t, res), "allow") {
			t.Fatalf("the refusal must not admit the item exists, got %q", libraryMessage(t, res))
		}
		fx.refusedBefore("content_placements")
	})

	t.Run("the caller's own item is placed", func(t *testing.T) {
		fx := newPlacementFixture(t, placementNarrowedLibrary())
		w := placementSeed(fx)
		fx.driver.tables["content_items"] = []map[string]any{placementOwnedItem(w.item, fx.person)}

		res := fx.createPlacement(placementCreate(w.curriculum, w.item))

		if res.Code != http.StatusCreated {
			t.Fatalf("want 201, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
		}
		fx.onlyWrite("content_placements")
	})

	t.Run("a school item the caller may read is placed", func(t *testing.T) {
		fx := newPlacementFixture(t, placementNarrowedLibrary())
		w := placementSeed(fx)

		res := fx.createPlacement(placementCreate(w.curriculum, w.item))

		if res.Code != http.StatusCreated {
			t.Fatalf("want 201, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
		}
		fx.onlyWrite("content_placements")
	})

	t.Run("an item that does not exist at all is refused the same way", func(t *testing.T) {
		fx := newPlacementFixture(t, placementNarrowedLibrary())
		w := placementSeed(fx)
		fx.driver.tables["content_items"] = nil

		res := fx.createPlacement(placementCreate(w.curriculum, w.item))

		wantLibraryRefusal(t, res, http.StatusUnprocessableEntity,
			entplacement.FieldContentItemID, "does not name a known content item")
		fx.refusedBefore("content_placements")
	})
}

func TestCreatePlacementRefusesAnUnknownCurriculum(t *testing.T) {
	fx := newPlacementFixture(t, placementNarrowedLibrary())
	w := placementSeed(fx)
	fx.driver.tables["curricula"] = nil

	res := fx.createPlacement(placementCreate(w.curriculum, w.item))

	wantLibraryRefusal(t, res, http.StatusUnprocessableEntity,
		entplacement.FieldCurriculumID, "does not name a known curriculum")
	fx.refusedBefore("content_placements")
}

func TestCreatePlacementRefusesAForgedConfirmation(t *testing.T) {
	cases := []struct {
		name  string
		field string
		value any
	}{
		{"a supplied confirmer", entplacement.FieldConfirmedBy, uuid.New()},
		{"the caller as the confirmer", entplacement.FieldConfirmedBy, nil},
		{"a supplied confirmation time", entplacement.FieldConfirmedAt, "2026-09-08T00:00:00Z"},
		{"a supplied creator", entplacement.FieldCreatedBy, uuid.New()},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newPlacementFixture(t)
			w := placementSeed(fx)
			body := placementCreate(w.curriculum, w.item)
			if tc.value == nil {
				body[tc.field] = fx.person
			} else {
				body[tc.field] = tc.value
			}

			res := fx.createPlacement(body)

			wantLibraryRefusal(t, res, http.StatusUnprocessableEntity, tc.field, "must not be supplied")
			fx.refusedBefore("content_placements")
		})
	}

	t.Run("a placement cannot be born confirmed", func(t *testing.T) {
		fx := newPlacementFixture(t)
		w := placementSeed(fx)
		body := placementCreate(w.curriculum, w.item)
		body["status"] = "confirmed"

		res := fx.createPlacement(body)

		wantLibraryRefusal(t, res, http.StatusUnprocessableEntity, "separate request")
		fx.refusedBefore("content_placements")
	})

	t.Run("a patch cannot supply the confirmer either", func(t *testing.T) {
		id, curriculum, item := uuid.New(), uuid.New(), uuid.New()
		fx := newPlacementFixture(t)
		fx.driver.tables["content_placements"] = []map[string]any{
			placementRow(id, curriculum, item),
		}

		res := fx.patchPlacement(id, map[string]any{
			"status":       "confirmed",
			"confirmed_by": uuid.New(),
		})

		wantLibraryRefusal(t, res, http.StatusUnprocessableEntity,
			entplacement.FieldConfirmedBy, "must not be supplied")
		fx.refusedBefore("content_placements")
	})
}

func TestCreatePlacementPairsTheGrainWithItsNode(t *testing.T) {
	cases := []struct {
		name     string
		withNode bool
		grain    any
		wantCode int
		fragment []string
	}{
		{
			name: "grain curriculum with no node", grain: "curriculum",
			wantCode: http.StatusCreated,
		},
		{
			name: "grain node with its node", grain: "node", withNode: true,
			wantCode: http.StatusCreated,
		},
		{
			name: "grain node with no node", grain: "node",
			wantCode: http.StatusUnprocessableEntity,
			fragment: []string{"grain node requires", entplacement.FieldCurriculumNodeID},
		},
		{
			name: "grain curriculum with a node", grain: "curriculum", withNode: true,
			wantCode: http.StatusUnprocessableEntity,
			fragment: []string{"must not carry", entplacement.FieldCurriculumNodeID},
		},
		{
			name: "no grain at all", grain: nil,
			wantCode: http.StatusBadRequest,
			fragment: []string{"grain is required"},
		},
		{
			name: "an empty grain", grain: "",
			wantCode: http.StatusBadRequest,
			fragment: []string{"grain is required"},
		},
		{
			name: "a grain that does not exist", grain: "chapter",
			wantCode: http.StatusBadRequest,
			fragment: []string{"grain must be"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newPlacementFixture(t)
			w := placementSeed(fx)

			body := placementCreate(w.curriculum, w.item)
			if tc.grain == nil {
				delete(body, "grain")
			} else {
				body["grain"] = tc.grain
			}
			if tc.withNode {
				body["curriculum_node_id"] = w.node
			}

			res := fx.createPlacement(body)

			if tc.wantCode != http.StatusCreated {
				wantLibraryRefusal(t, res, tc.wantCode, tc.fragment...)
				fx.refusedBefore("content_placements")
				return
			}
			if res.Code != http.StatusCreated {
				t.Fatalf("want 201, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
			}
			insert := fx.onlyWrite("content_placements")
			if tc.withNode && !insert.carries(w.node) {
				t.Fatalf("the row must carry the node, got %v", insert.args)
			}
			if !tc.withNode && insert.names(entplacement.FieldCurriculumNodeID) {
				t.Fatalf("a curriculum grain row must not carry a node, got %q", insert.query)
			}
		})
	}
}

func TestCreatePlacementRefusesANodeFromAnotherObject(t *testing.T) {
	t.Run("a curriculum node under another curriculum", func(t *testing.T) {
		fx := newPlacementFixture(t)
		w := placementSeed(fx)
		fx.driver.tables["curriculum_nodes"] = []map[string]any{
			{"id": w.node, "curriculum_id": uuid.New()},
		}

		body := placementCreate(w.curriculum, w.item)
		body["grain"] = "node"
		body["curriculum_node_id"] = w.node

		res := fx.createPlacement(body)

		wantLibraryRefusal(t, res, http.StatusUnprocessableEntity,
			entplacement.FieldCurriculumNodeID, "does not name a node of that curriculum")
		fx.refusedBefore("content_placements")
	})

	t.Run("a content node under another content item", func(t *testing.T) {
		fx := newPlacementFixture(t)
		w := placementSeed(fx)
		fx.driver.tables["content_nodes"] = []map[string]any{
			{"id": w.contentNode, "content_item_id": uuid.New()},
		}

		body := placementCreate(w.curriculum, w.item)
		body["content_node_id"] = w.contentNode

		res := fx.createPlacement(body)

		wantLibraryRefusal(t, res, http.StatusUnprocessableEntity,
			entplacement.FieldContentNodeID, "does not name a node of that content item")
		fx.refusedBefore("content_placements")
	})

	t.Run("both nodes under their own object", func(t *testing.T) {
		fx := newPlacementFixture(t)
		w := placementSeed(fx)

		body := placementCreate(w.curriculum, w.item)
		body["grain"] = "node"
		body["curriculum_node_id"] = w.node
		body["content_node_id"] = w.contentNode

		res := fx.createPlacement(body)

		if res.Code != http.StatusCreated {
			t.Fatalf("want 201, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
		}
		insert := fx.onlyWrite("content_placements")
		if !insert.carries(w.node) || !insert.carries(w.contentNode) {
			t.Fatalf("both nodes must be stored, got %v", insert.args)
		}
	})
}

func TestUpdatePlacementCannotRePointThePlacement(t *testing.T) {
	id, curriculum, node, item := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	fields := []string{
		entplacement.FieldCurriculumID,
		entplacement.FieldCurriculumNodeID,
		entplacement.FieldContentItemID,
		entplacement.FieldContentNodeID,
	}

	for _, field := range fields {
		t.Run(field, func(t *testing.T) {
			fx := newPlacementFixture(t)
			fx.driver.tables["content_placements"] = []map[string]any{
				placementAtNode(id, curriculum, node, item),
			}

			res := fx.patchPlacement(id, map[string]any{field: uuid.New()})

			wantLibraryRefusal(t, res, http.StatusUnprocessableEntity, field, "cannot be re-pointed")
			fx.refusedBefore("content_placements")
		})
	}
}

func TestUpdatePlacementKeepsTheGrainPairedWithTheNodeItCannotChange(t *testing.T) {
	id, curriculum, node, item := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name     string
		row      map[string]any
		grain    string
		wantCode int
		fragment []string
	}{
		{
			name:  "a node placement may not become a curriculum placement",
			row:   placementAtNode(id, curriculum, node, item),
			grain: "curriculum", wantCode: http.StatusUnprocessableEntity,
			fragment: []string{"must not carry", entplacement.FieldCurriculumNodeID},
		},
		{
			name:  "a curriculum placement may not become a node placement",
			row:   placementRow(id, curriculum, item),
			grain: "node", wantCode: http.StatusUnprocessableEntity,
			fragment: []string{"grain node requires", entplacement.FieldCurriculumNodeID},
		},
		{
			name:  "restating the grain it already has is allowed",
			row:   placementAtNode(id, curriculum, node, item),
			grain: "node", wantCode: http.StatusOK,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newPlacementFixture(t)
			fx.driver.tables["content_placements"] = []map[string]any{tc.row}

			res := fx.patchPlacement(id, map[string]any{"grain": tc.grain})

			if tc.wantCode != http.StatusOK {
				wantLibraryRefusal(t, res, tc.wantCode, tc.fragment...)
				fx.refusedBefore("content_placements")
				return
			}
			if res.Code != http.StatusOK {
				t.Fatalf("want 200, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
			}
			fx.onlyWrite("content_placements")
		})
	}
}

func TestUpdatePlacementStampsTheConfirmerFromTheToken(t *testing.T) {
	id, curriculum, item := uuid.New(), uuid.New(), uuid.New()

	t.Run("confirming records the caller and the time", func(t *testing.T) {
		fx := newPlacementFixture(t)
		fx.driver.tables["content_placements"] = []map[string]any{
			placementRow(id, curriculum, item),
		}

		res := fx.patchPlacement(id, map[string]any{"status": "confirmed"})

		if res.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
		}
		update := fx.onlyWrite("content_placements")
		if !update.names(entplacement.FieldConfirmedBy) || !update.carries(fx.person) {
			t.Fatalf("the confirmation must name the caller %s, got %q %v",
				fx.person, update.query, update.args)
		}
		if !update.names(entplacement.FieldConfirmedAt) {
			t.Fatalf("the confirmation must be stamped with a time, got %q", update.query)
		}
	})

	t.Run("a caller with no person record cannot confirm", func(t *testing.T) {
		fx := newPlacementFixture(t)
		fx.driver.tables["persons"] = nil
		fx.driver.tables["content_placements"] = []map[string]any{
			placementRow(id, curriculum, item),
		}

		res := fx.patchPlacement(id, map[string]any{"status": "confirmed"})

		wantLibraryRefusal(t, res, http.StatusBadRequest, entplacement.FieldConfirmedBy)
		fx.refusedBefore("content_placements")
	})

	t.Run("withdrawing a confirmation clears the stamp", func(t *testing.T) {
		fx := newPlacementFixture(t)
		row := placementRow(id, curriculum, item)
		row["status"] = string(entplacement.StatusConfirmed)
		row["confirmed_by"] = uuid.New()
		fx.driver.tables["content_placements"] = []map[string]any{row}

		res := fx.patchPlacement(id, map[string]any{"status": "proposed"})

		if res.Code != http.StatusOK {
			t.Fatalf("want 200, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
		}
		update := fx.onlyWrite("content_placements")
		for _, name := range []string{entplacement.FieldConfirmedBy, entplacement.FieldConfirmedAt} {
			if !strings.Contains(update.query, `"`+name+`" = NULL`) {
				t.Fatalf("withdrawing must clear %s, got %q", name, update.query)
			}
		}
	})
}

func TestPlacementTheViewerCannotReachIsNotFound(t *testing.T) {
	id, curriculum, item := uuid.New(), uuid.New(), uuid.New()

	cases := []struct {
		name string
		call func(fx *libraryFixture) *httptest.ResponseRecorder
	}{
		{
			name: "get",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.getPlacement, "GET",
					"/api/v1/placements/"+id.String(), "", id)
			},
		},
		{
			name: "update",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.patchPlacement(id, map[string]any{"status": "rejected"})
			},
		},
		{
			name: "delete",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deletePlacement, "DELETE",
					"/api/v1/placements/"+id.String(), "", id)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newPlacementFixture(t, placementRootless())
			fx.driver.tables["content_placements"] = []map[string]any{
				placementRow(id, curriculum, item),
			}

			res := tc.call(fx)

			if res.Code != http.StatusNotFound {
				t.Fatalf("want 404, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
			}
			fx.changedNothing("content_placements")
		})
	}
}

func TestPlacementWriteGateIsNotTheReadGate(t *testing.T) {
	id, curriculum, item := uuid.New(), uuid.New(), uuid.New()

	seed := func(fx *libraryFixture) {
		fx.driver.tables["content_placements"] = []map[string]any{
			placementRow(id, curriculum, item),
		}
	}

	t.Run("delete is refused where reading is allowed", func(t *testing.T) {
		fx := newPlacementFixture(t, placementGuardianOnly())
		seed(fx)

		res := fx.call(fx.server.deletePlacement, "DELETE",
			"/api/v1/placements/"+id.String(), "", id)

		if res.Code != http.StatusNotFound {
			t.Fatalf("want 404, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
		}
		gate := fx.statements("content_placements")
		if len(gate) == 0 {
			t.Fatal("the delete never queried content_placements")
		}
		if !strings.Contains(gate[0].query, "FALSE") {
			t.Fatalf("the delete must use the write gate, which denies here, got %q", gate[0].query)
		}
		fx.changedNothing("content_placements")
	})

	t.Run("update is refused where reading is allowed", func(t *testing.T) {
		fx := newPlacementFixture(t, placementGuardianOnly())
		seed(fx)

		res := fx.patchPlacement(id, map[string]any{"status": "rejected"})

		if res.Code != http.StatusNotFound {
			t.Fatalf("want 404, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
		}
		gate := fx.statements("content_placements")
		if len(gate) == 0 {
			t.Fatal("the update never queried content_placements")
		}
		if !strings.Contains(gate[0].query, "FALSE") {
			t.Fatalf("the update must use the write gate, which denies here, got %q", gate[0].query)
		}
		fx.refusedBefore("content_placements")
	})

	t.Run("the read gate reaches further than the write gate", func(t *testing.T) {
		fx := newPlacementFixture(t, placementGuardianOnly())
		seed(fx)

		fx.call(fx.server.getPlacement, "GET", "/api/v1/placements/"+id.String(), "", id)

		reads := fx.statements("content_placements")
		if len(reads) == 0 {
			t.Fatal("the get never queried content_placements")
		}
		if strings.Contains(reads[0].query, "FALSE") {
			t.Fatalf("the read gate must not be the denying write gate, got %q", reads[0].query)
		}
		if !strings.Contains(reads[0].query, "EXISTS") {
			t.Fatalf("the read gate must narrow through the curriculum, got %q", reads[0].query)
		}
	})
}

func TestThePlacementFixtureHonoursTheWhereClause(t *testing.T) {
	id, curriculum, item := uuid.New(), uuid.New(), uuid.New()

	fx := newPlacementFixture(t)
	fx.driver.tables["content_placements"] = []map[string]any{
		placementRow(id, curriculum, item),
	}

	other := uuid.New()
	res := fx.call(fx.server.getPlacement, "GET",
		"/api/v1/placements/"+other.String(), "", other)

	if res.Code != http.StatusNotFound {
		t.Fatalf("the stub ignored the id in the WHERE clause: %d %s",
			res.Code, strings.TrimSpace(res.Body.String()))
	}
}

func TestPlacementIDMustBeAUUID(t *testing.T) {
	cases := []struct {
		name string
		call func(fx *libraryFixture) *httptest.ResponseRecorder
	}{
		{
			name: "get",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.getPlacement, "GET", "/api/v1/placements/seven", "", uuid.Nil)
			},
		},
		{
			name: "update",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.updatePlacement, "PATCH",
					"/api/v1/placements/seven", `{"status":"rejected"}`, uuid.Nil)
			},
		},
		{
			name: "delete",
			call: func(fx *libraryFixture) *httptest.ResponseRecorder {
				return fx.call(fx.server.deletePlacement, "DELETE",
					"/api/v1/placements/seven", "", uuid.Nil)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newPlacementFixture(t)

			res := tc.call(fx)

			wantLibraryRefusal(t, res, http.StatusBadRequest, "id must be a UUID")
			fx.refusedBefore("content_placements")
		})
	}
}

func TestCreatePlacementRefusesAMalformedBody(t *testing.T) {
	curriculum, item := uuid.New(), uuid.New()

	cases := []struct {
		name string
		body string
		want string
	}{
		{"no curriculum", `{"content_item_id":"` + item.String() + `","grain":"curriculum"}`,
			"curriculum_id is required"},
		{"no content item", `{"curriculum_id":"` + curriculum.String() + `","grain":"curriculum"}`,
			"content_item_id is required"},
		{"an unknown field", `{"curriculum_id":"` + curriculum.String() +
			`","content_item_id":"` + item.String() + `","grain":"curriculum","shelf":"fiction"}`, "shelf"},
		{"a body that is not JSON", `not json`, "invalid JSON body"},
		{"an empty body", ``, "invalid JSON body"},
		{"an identifier that is not a UUID", `{"curriculum_id":"seven"}`, "curriculum_id"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newPlacementFixture(t)

			res := fx.call(fx.server.createPlacement, "POST", "/api/v1/placements", tc.body, uuid.Nil)

			wantLibraryRefusal(t, res, http.StatusBadRequest, tc.want)
			fx.refusedBefore("content_placements")
		})
	}
}

func TestListPlacementsNarrowsThroughTheViewer(t *testing.T) {
	id, curriculum, item := uuid.New(), uuid.New(), uuid.New()

	fx := newPlacementFixture(t, placementRootless())
	fx.driver.tables["content_placements"] = []map[string]any{
		placementRow(id, curriculum, item),
	}

	res := fx.call(fx.server.listPlacements, "GET", "/api/v1/placements", "", uuid.Nil)

	if res.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", res.Code, strings.TrimSpace(res.Body.String()))
	}
	if !strings.Contains(res.Body.String(), `"count":0`) {
		t.Fatalf("a viewer with no reach must list nothing, got %s", res.Body.String())
	}
	reads := fx.statements("content_placements")
	if len(reads) == 0 || !strings.Contains(reads[0].query, "FALSE") {
		t.Fatalf("the list must be narrowed by the viewer, got %v", reads)
	}
}

func placementLibraryDenied() libraryOption {
	return placementGuards(placementReach(authorization.ReachTenant), authorization.Decision{})
}

func TestCreatePlacementRefusesACallerWhoMayNotReadTheLibraryAtAll(t *testing.T) {
	t.Run("a denied library read is refused, not narrowed to the default scope", func(t *testing.T) {
		fx := newPlacementFixture(t, placementLibraryDenied())
		w := placementSeed(fx)

		res := fx.createPlacement(placementCreate(w.curriculum, w.item))

		wantLibraryRefusal(t, res, http.StatusForbidden, string(authorization.LibraryRead))
		fx.refusedBefore("content_placements")
	})

	t.Run("the caller's own item is refused too when the library read is denied", func(t *testing.T) {
		fx := newPlacementFixture(t, placementLibraryDenied())
		w := placementSeed(fx)
		fx.driver.tables["content_items"] = []map[string]any{placementOwnedItem(w.item, fx.person)}

		res := fx.createPlacement(placementCreate(w.curriculum, w.item))

		wantLibraryRefusal(t, res, http.StatusForbidden, string(authorization.LibraryRead))
		fx.refusedBefore("content_placements")
	})

	t.Run("a granted library read still hides an unreachable item behind the same 422", func(t *testing.T) {
		fx := newPlacementFixture(t, placementNarrowedLibrary())
		w := placementSeed(fx)
		fx.driver.tables["content_items"] = []map[string]any{placementOwnedItem(w.item, uuid.New())}

		res := fx.createPlacement(placementCreate(w.curriculum, w.item))

		wantLibraryRefusal(t, res, http.StatusUnprocessableEntity,
			entplacement.FieldContentItemID, "does not name a known content item")
		fx.refusedBefore("content_placements")
	})
}

type placementLibraryGuard struct{ library authorization.Decision }

func (g placementLibraryGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.ContentPlacementsRead,
		authorization.ContentPlacementsWrite,
		authorization.ContentPlacementsDelete,
		authorization.ContentPlacementsCreate:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachTeacherAssignment,
			HasReach: true,
		}, nil
	case authorization.LibraryRead:
		return g.library, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (placementLibraryGuard) Name() string { return "placement library test guard" }

type placementLibraryWorld struct {
	*placementDBWorld

	curriculum uuid.UUID
	hiddenItem uuid.UUID
	visible    []uuid.UUID
	hidden     []uuid.UUID
}

func newPlacementLibraryWorld(t *testing.T, library authorization.Decision) *placementLibraryWorld {
	t.Helper()

	base := newPlacementDBWorld(t)
	base.server = &Server{guard: placementLibraryGuard{library: library}}

	ctx := context.Background()
	client := base.db.Client
	tag := uuid.NewString()[:8]

	stranger := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Stranger").
		SetDisplayName("Harness Stranger " + tag).
		SaveX(ctx)
	sealed := client.ContentItem.Create().
		SetTitle("Harness Sealed Atlas " + tag).
		SetAudience(entcontentitem.AudienceOwner).
		SetOwnerPersonID(stranger.ID).
		SetStatus(entcontentitem.StatusPublished).
		SaveX(ctx)

	place := func(item uuid.UUID) uuid.UUID {
		return client.ContentPlacement.Create().
			SetCurriculumID(base.taughtCurriculumID).
			SetContentItemID(item).
			SetGrain(entplacement.GrainCurriculum).
			SaveX(ctx).ID
	}

	open := base.placement(base.reachable[0]).ContentItemID
	w := &placementLibraryWorld{
		placementDBWorld: base,
		curriculum:       base.taughtCurriculumID,
		hiddenItem:       sealed.ID,
		hidden:           []uuid.UUID{place(sealed.ID)},
		visible:          []uuid.UUID{base.reachable[0], place(open)},
	}
	w.hidden = append(w.hidden, place(sealed.ID))

	base.db.Forget()
	return w
}

func (w *placementLibraryWorld) listOn(query string) *httptest.ResponseRecorder {
	w.t.Helper()
	return w.call(w.server.listPlacements, "GET",
		"/api/v1/placements?curriculum_id="+w.curriculum.String()+query, "", uuid.Nil)
}

func placementLibraryReach() authorization.Decision {
	return placementReach(authorization.ReachTeacherAssignment)
}

func TestListPlacementsHidesAPlacementWhoseContentItemIsUnreadable(t *testing.T) {
	w := newPlacementLibraryWorld(t, placementLibraryReach())

	rec := w.listOn("&limit=50")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	ids := placementIDsOf(t, rec)
	for _, want := range w.visible {
		if !placementListed(ids, want) {
			t.Fatalf("the placement %s on a readable item is missing from %v", want, ids)
		}
	}
	for _, gone := range w.hidden {
		if placementListed(ids, gone) {
			t.Fatalf("the placement %s on an unreadable item was listed in %v", gone, ids)
		}
	}
	if strings.Contains(rec.Body.String(), w.hiddenItem.String()) {
		t.Fatalf("the unreadable content item %s was named in the listing: %s",
			w.hiddenItem, rec.Body.String())
	}
}

func TestGetPlacementIsNotFoundWhenItsContentItemIsUnreadable(t *testing.T) {
	w := newPlacementLibraryWorld(t, placementLibraryReach())

	rec := w.call(w.server.getPlacement, "GET",
		"/api/v1/placements/"+w.visible[0].String(), "", w.visible[0])
	if rec.Code != http.StatusOK {
		t.Fatalf("the placement on a readable item must be readable, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	w.db.Forget()
	rec = w.call(w.server.getPlacement, "GET",
		"/api/v1/placements/"+w.hidden[0].String(), "", w.hidden[0])
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 on a placement whose item is unreadable, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if strings.Contains(rec.Body.String(), w.hiddenItem.String()) {
		t.Fatalf("the refusal named the unreadable content item %s: %s",
			w.hiddenItem, rec.Body.String())
	}
}

func TestListPlacementsPagesOverThePlacementsItCanShow(t *testing.T) {
	w := newPlacementLibraryWorld(t, placementLibraryReach())

	rec := w.listOn("&limit=2")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	ids := placementIDsOf(t, rec)
	if len(ids) != len(w.visible) {
		t.Fatalf("a page of 2 must carry the 2 visible placements, not a page short of them, got %v", ids)
	}
	for _, gone := range w.hidden {
		if placementListed(ids, gone) {
			t.Fatalf("the placement %s on an unreadable item was paged in as %v", gone, ids)
		}
	}
}

func TestPlacementReadsRefuseACallerWhoMayNotReadTheLibraryAtAll(t *testing.T) {
	w := newPlacementLibraryWorld(t, authorization.Decision{})

	t.Run("the list is refused rather than widened to the default scope", func(t *testing.T) {
		rec := w.listOn("&limit=50")

		wantLibraryRefusal(t, rec, http.StatusForbidden, string(authorization.LibraryRead))
		for _, id := range append(append([]uuid.UUID{}, w.visible...), w.hidden...) {
			if strings.Contains(rec.Body.String(), id.String()) {
				t.Fatalf("the refusal leaked the placement %s: %s", id, rec.Body.String())
			}
		}
	})

	t.Run("the get is refused before the row is looked at", func(t *testing.T) {
		w.db.Forget()

		rec := w.call(w.server.getPlacement, "GET",
			"/api/v1/placements/"+w.visible[0].String(), "", w.visible[0])

		wantLibraryRefusal(t, rec, http.StatusForbidden, string(authorization.LibraryRead))
		if reads := w.db.QueriesOn("content_placements"); len(reads) > 0 {
			t.Fatalf("the refusal still queried content_placements: %v", reads)
		}
	})
}
