package http

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (w *assetDBWorld) fetchContent(id uuid.UUID, rangeHeader string) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", id.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	r := httptest.NewRequest(http.MethodGet,
		"/api/v1/library/assets/"+id.String()+"/content", strings.NewReader("")).WithContext(ctx)
	if rangeHeader != "" {
		r.Header.Set("Range", rangeHeader)
	}

	rec := httptest.NewRecorder()
	w.server.getAssetContent(rec, r)
	return rec
}

func (w *assetDBWorld) requireCorrelatedRead(t *testing.T) {
	t.Helper()

	for _, stmt := range w.db.Statements() {
		if stmt.Kind != "query" || !stmt.Touches("assets") {
			continue
		}
		if !strings.Contains(stmt.Query, "EXISTS (") {
			t.Fatalf("the read must be narrowed by the correlated subquery the stub driver "+
				"refuses to evaluate, got %q", stmt.Query)
		}
		return
	}
	t.Fatal("no query reached assets")
}

func (w *assetDBWorld) holdsObject() []byte {
	w.t.Helper()

	object := assetBytes(int(assetDBSize))
	w.store.object = object
	w.store.readKeys = nil
	w.store.readRanges = nil
	return object
}

func TestAssetContentFromPostgresServesOnlyTheAssetsTheViewerMayReach(t *testing.T) {
	world := newAssetDBWorld(t)
	object := world.holdsObject()

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
		{"its own upload that carries no bytes yet",
			func() uuid.UUID { return world.ownPending }, http.StatusConflict},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			world.db.Forget()
			world.store.readKeys = nil
			id := tc.id()

			rec := world.fetchContent(id, "")

			if rec.Code != tc.want {
				t.Fatalf("want %d for %s, got %d: %s",
					tc.want, id, rec.Code, glimpse(rec.Body.Bytes()))
			}
			if tc.want == http.StatusOK {
				if !bytes.Equal(rec.Body.Bytes(), object) {
					t.Fatalf("asset %s served %d bytes, want the stored %d",
						id, rec.Body.Len(), len(object))
				}
			} else {
				if len(world.store.readKeys) != 0 {
					t.Fatalf("asset %s was refused but its bytes were still read from the "+
						"store: %v", id, world.store.readKeys)
				}
				if bytes.Contains(rec.Body.Bytes(), object[:64]) {
					t.Fatalf("asset %s was refused but the response still carries its bytes", id)
				}
			}
			world.requireCorrelatedRead(t)
		})
	}
}

func TestAssetContentFromPostgresAnswersARangeOnlyForAReachableAsset(t *testing.T) {
	world := newAssetDBWorld(t)
	object := world.holdsObject()

	rec := world.fetchContent(world.strangers, "bytes=0-99")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 for an unreachable asset, got %d: %s",
			rec.Code, glimpse(rec.Body.Bytes()))
	}
	if len(world.store.readKeys) != 0 {
		t.Fatalf("an unreachable asset must never reach the store, got %v", world.store.readKeys)
	}

	world.db.Forget()
	world.store.readKeys = nil

	rec = world.fetchContent(world.ownReady, "bytes=0-99")

	if rec.Code != http.StatusPartialContent {
		t.Fatalf("want 206 for its own upload, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if got := rec.Header().Get("Content-Range"); got != "bytes 0-99/1024" {
		t.Fatalf("Content-Range = %q, want bytes 0-99/1024", got)
	}
	if got := rec.Header().Get("Content-Length"); got != "100" {
		t.Fatalf("Content-Length = %q, want 100", got)
	}
	if !bytes.Equal(rec.Body.Bytes(), object[:100]) {
		t.Fatalf("the 206 served the wrong slice: %q", rec.Body.Bytes())
	}
}

func glimpse(body []byte) string {
	shown := strings.TrimSpace(string(body))
	if len(shown) > 120 {
		return shown[:120] + "..."
	}
	return shown
}
