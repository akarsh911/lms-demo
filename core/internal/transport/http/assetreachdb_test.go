package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

type assetDBGuard struct{}

func (assetDBGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	switch entity {
	case authorization.LibraryRead,
		authorization.LibraryCreate,
		authorization.LibraryWrite,
		authorization.LibraryDelete:
		return authorization.Decision{
			Allowed:  true,
			Reach:    authorization.ReachSelf,
			HasReach: true,
		}, nil
	default:
		return authorization.Decision{}, nil
	}
}

func (assetDBGuard) Name() string { return "asset database test guard" }

const assetDBSize = int64(1024)

type assetDBWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	store  *libraryObjectStore
	ctx    context.Context

	personID uuid.UUID

	ownReady   uuid.UUID
	ownPending uuid.UUID
	shared     uuid.UUID
	strangers  uuid.UUID
	orphan     uuid.UUID
}

func newAssetDBWorld(t *testing.T) *assetDBWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Asset").
		SetDisplayName("Asset Owner " + tag).
		SaveX(ctx)
	stranger := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Other").
		SetDisplayName("Asset Stranger " + tag).
		SaveX(ctx)

	newAsset := func(name string, uploader uuid.UUID, status entasset.Status) *tenantent.Asset {
		return client.Asset.Create().
			SetStorageKey("library/" + name + "-" + tag).
			SetFileName(name + ".pdf").
			SetMimeType("application/pdf").
			SetSizeBytes(assetDBSize).
			SetSha256(libraryDigest).
			SetUploadedBy(uploader).
			SetStatus(status).
			SaveX(ctx)
	}

	ownReady := newAsset("own-ready", person.ID, entasset.StatusReady)
	ownPending := newAsset("own-pending", person.ID, entasset.StatusPending)
	shared := newAsset("shared", stranger.ID, entasset.StatusReady)
	strangers := newAsset("strangers", stranger.ID, entasset.StatusReady)
	orphan := newAsset("orphan", stranger.ID, entasset.StatusReady)

	client.ContentItem.Create().
		SetTitle("Asset School Atlas " + tag).
		SetAudience(entcontentitem.AudienceSchool).
		SetStatus(entcontentitem.StatusPublished).
		SetOwnerPersonID(stranger.ID).
		SetAssetID(shared.ID).
		SaveX(ctx)
	client.ContentItem.Create().
		SetTitle("Asset Private Note " + tag).
		SetAudience(entcontentitem.AudienceOwner).
		SetStatus(entcontentitem.StatusDraft).
		SetOwnerPersonID(stranger.ID).
		SetAssetID(strangers.ID).
		SaveX(ctx)

	world := &assetDBWorld{
		t:          t,
		db:         db,
		server:     &Server{guard: assetDBGuard{}},
		personID:   person.ID,
		ownReady:   ownReady.ID,
		ownPending: ownPending.ID,
		shared:     shared.ID,
		strangers:  strangers.ID,
		orphan:     orphan.ID,
	}

	world.store = &libraryObjectStore{
		getLink: libraryDownloadLink,
		head: blob.ObjectInfo{
			Exists:        true,
			ContentLength: assetDBSize,
			ContentType:   "application/pdf",
			SHA256Hex:     libraryDigest,
		},
	}
	previous := openObjectStore
	openObjectStore = func(ctx context.Context, s *Server) (objectStore, error) {
		if s == world.server {
			return world.store, nil
		}
		return previous(ctx, s)
	}
	t.Cleanup(func() { openObjectStore = previous })

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireGenuineScope()
	db.Forget()
	return world
}

func (w *assetDBWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer reads every asset and would prove nothing about scoping")
	}
	if viewer.PersonID == nil || *viewer.PersonID != w.personID {
		w.t.Fatalf("the viewer must resolve to the seeded person %s, got %v", w.personID, viewer.PersonID)
	}
	if !decision.HasReach || decision.Reach != authorization.ReachSelf {
		w.t.Fatalf("the decision must carry a self reach, got %+v", decision)
	}
}

func (w *assetDBWorld) call(handler http.HandlerFunc, method, target string,
	id uuid.UUID) *httptest.ResponseRecorder {
	w.t.Helper()

	ctx := w.ctx
	if id != uuid.Nil {
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest(method, target, strings.NewReader("")).WithContext(ctx))
	return rec
}

func (w *assetDBWorld) requireCorrelatedScoping() {
	w.t.Helper()

	var reads []testsupport.Statement
	for _, stmt := range w.db.Statements() {
		if stmt.Kind == "query" && stmt.Touches("assets") {
			reads = append(reads, stmt)
		}
	}
	if len(reads) == 0 {
		w.t.Fatal("no query reached assets")
	}
	if !strings.Contains(reads[0].Query, "EXISTS (") {
		w.t.Fatalf("the read must be narrowed by the correlated subquery the stub driver "+
			"refuses to evaluate, got %q", reads[0].Query)
	}
}

func (w *assetDBWorld) status(id uuid.UUID) entasset.Status {
	w.t.Helper()

	row, err := w.db.Client.Asset.Get(context.Background(), id)
	if err != nil {
		w.t.Fatalf("asset %s could not be read back inside the transaction: %v", id, err)
	}
	return row.Status
}

func TestGetAssetFromPostgresAnswersOnlyTheAssetsTheViewerMayReach(t *testing.T) {
	world := newAssetDBWorld(t)

	cases := []struct {
		name string
		id   func() uuid.UUID
		want int
	}{
		{"its own upload", func() uuid.UUID { return world.ownReady }, http.StatusOK},
		{"an upload behind a school document", func() uuid.UUID { return world.shared }, http.StatusOK},
		{"an upload behind a private note somebody else owns",
			func() uuid.UUID { return world.strangers }, http.StatusNotFound},
		{"an upload behind no document at all",
			func() uuid.UUID { return world.orphan }, http.StatusNotFound},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			world.db.Forget()
			id := tc.id()

			rec := world.call(world.server.getAsset, "GET", "/api/v1/library/assets/"+id.String(), id)

			if rec.Code != tc.want {
				t.Fatalf("want %d for %s, got %d: %s",
					tc.want, id, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			world.requireCorrelatedScoping()
		})
	}
}

func TestListAssetsFromPostgresReturnsOnlyTheReachableRows(t *testing.T) {
	world := newAssetDBWorld(t)

	rec := world.call(world.server.listAssets, "GET", "/api/v1/library/assets?limit=50", uuid.Nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	world.requireCorrelatedScoping()

	var body struct {
		Assets []struct {
			ID uuid.UUID `json:"id"`
		} `json:"assets"`
		Count int `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the list response is not JSON: %v (%q)", err, rec.Body.String())
	}
	if body.Count != len(body.Assets) {
		t.Fatalf("count %d does not match the %d rows returned", body.Count, len(body.Assets))
	}

	seen := map[uuid.UUID]bool{}
	for _, row := range body.Assets {
		seen[row.ID] = true
	}
	for _, reachable := range []uuid.UUID{world.ownReady, world.ownPending, world.shared} {
		if !seen[reachable] {
			t.Fatalf("the listing dropped the reachable asset %s, got %v",
				reachable, assetIDsSeen(seen))
		}
	}
	for _, hidden := range []uuid.UUID{world.strangers, world.orphan} {
		if seen[hidden] {
			t.Fatalf("the listing carried the unreachable asset %s, got %v",
				hidden, assetIDsSeen(seen))
		}
	}
}

func assetIDsSeen(seen map[uuid.UUID]bool) []string {
	out := make([]string, 0, len(seen))
	for id := range seen {
		out = append(out, id.String())
	}
	sort.Strings(out)
	return out
}

func TestGetAssetLinkFromPostgresRefusesAnAssetTheViewerCannotReach(t *testing.T) {
	world := newAssetDBWorld(t)

	rec := world.call(world.server.getAssetLink, "GET",
		"/api/v1/library/assets/"+world.strangers.String()+"/link", world.strangers)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if len(world.store.getKeys) != 0 {
		t.Fatalf("an unreachable asset must never reach the store, got %v", world.store.getKeys)
	}

	world.db.Forget()
	world.store.getKeys = nil

	rec = world.call(world.server.getAssetLink, "GET",
		"/api/v1/library/assets/"+world.ownReady.String()+"/link", world.ownReady)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200 for its own upload, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if len(world.store.getKeys) != 1 {
		t.Fatalf("the reachable asset must be presigned exactly once, got %v", world.store.getKeys)
	}
}

func TestMarkAssetReadyFromPostgresCompletesTheUploadItsOwnerStarted(t *testing.T) {
	world := newAssetDBWorld(t)

	rec := world.call(world.server.markAssetReady, "POST",
		"/api/v1/library/assets/"+world.ownPending.String()+"/ready", world.ownPending)

	if rec.Code != http.StatusOK {
		t.Fatalf("a restricted caller must be able to finish its own upload, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	world.requireCorrelatedScoping()
	if got := world.status(world.ownPending); got != entasset.StatusReady {
		t.Fatalf("the asset must be ready in the database, got %q", got)
	}
}

func TestMarkAssetReadyFromPostgresRefusesAnAssetTheViewerCannotReach(t *testing.T) {
	world := newAssetDBWorld(t)

	rec := world.call(world.server.markAssetReady, "POST",
		"/api/v1/library/assets/"+world.orphan.String()+"/ready", world.orphan)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if len(world.store.headKeys) != 0 {
		t.Fatalf("an unreachable asset must never reach the store, got %v", world.store.headKeys)
	}
}

func TestDeleteAssetFromPostgresDemandsOwnershipNotMereReachability(t *testing.T) {
	world := newAssetDBWorld(t)

	cases := []struct {
		name string
		id   func() uuid.UUID
		want int
	}{
		{"its own upload", func() uuid.UUID { return world.ownReady }, http.StatusNoContent},
		{"an upload it can read but did not make",
			func() uuid.UUID { return world.shared }, http.StatusNotFound},
		{"an upload it cannot even read",
			func() uuid.UUID { return world.strangers }, http.StatusNotFound},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			world.db.Forget()
			id := tc.id()

			rec := world.call(world.server.deleteAsset, "DELETE",
				"/api/v1/library/assets/"+id.String(), id)

			if rec.Code != tc.want {
				t.Fatalf("want %d for %s, got %d: %s",
					tc.want, id, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if tc.want == http.StatusNoContent {
				if got := world.status(id); got != entasset.StatusDeleted {
					t.Fatalf("the asset must be deleted in the database, got %q", got)
				}
				return
			}
			if got := world.status(id); got == entasset.StatusDeleted {
				t.Fatalf("asset %s was deleted by a caller that may not delete it", id)
			}
		})
	}
}
