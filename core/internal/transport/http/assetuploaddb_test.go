package http

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
)

var uploadPayload = []byte("a scanned worksheet, two hundred and twelve bytes of it, near enough")

func (w *assetDBWorld) uploadable(name string, status entasset.Status) *tenantent.Asset {
	w.t.Helper()
	return w.db.Client.Asset.Create().
		SetStorageKey("library/" + name + "-" + uuid.NewString()[:8]).
		SetFileName(name + ".pdf").
		SetMimeType("application/pdf").
		SetSizeBytes(int64(len(uploadPayload))).
		SetSha256(digestOf(uploadPayload)).
		SetUploadedBy(w.personID).
		SetStatus(status).
		SaveX(context.Background())
}

func (w *assetDBWorld) put(id uuid.UUID, body io.Reader, length int64) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", id.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	r := httptest.NewRequest(http.MethodPut,
		"/api/v1/library/assets/"+id.String()+"/content", body).WithContext(ctx)
	r.ContentLength = length

	rec := httptest.NewRecorder()
	w.server.uploadAssetContent(rec, r)
	return rec
}

func (w *assetDBWorld) putBytes(id uuid.UUID, payload []byte) *httptest.ResponseRecorder {
	return w.put(id, strings.NewReader(string(payload)), int64(len(payload)))
}

func TestUploadAssetContentInPostgresPromotesOnlyThePendingRow(t *testing.T) {
	world := newAssetDBWorld(t)
	row := world.uploadable("pending-upload", entasset.StatusPending)
	world.db.Forget()

	rec := world.putBytes(row.ID, uploadPayload)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	world.requireCorrelatedScoping()

	if got := world.status(row.ID); got != entasset.StatusReady {
		t.Fatalf("the row is %s in postgres, want ready", got)
	}
	landed := world.store.stored[row.StorageKey]
	if landed.length != int64(len(uploadPayload)) {
		t.Fatalf("the store holds %d bytes for %s, want %d",
			landed.length, row.StorageKey, len(uploadPayload))
	}
	if landed.digest != digestOf(uploadPayload) {
		t.Fatalf("the stored object hashes to %q, want %q", landed.digest, digestOf(uploadPayload))
	}
}

func TestUploadAssetContentInPostgresRefusesAnAssetTheViewerCannotReach(t *testing.T) {
	world := newAssetDBWorld(t)
	world.db.Forget()

	rec := world.putBytes(world.strangers, uploadPayload)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	world.requireCorrelatedScoping()
	if len(world.store.written) != 0 {
		t.Fatalf("an unreachable asset reached the store: %v", world.store.written)
	}
	if got := world.status(world.strangers); got != entasset.StatusReady {
		t.Fatalf("the unreachable row moved to %s", got)
	}
}

func TestUploadAssetContentInPostgresRefusesASecondUploadOverAReadyAsset(t *testing.T) {
	world := newAssetDBWorld(t)
	row := world.uploadable("ready-upload", entasset.StatusReady)
	world.db.Forget()

	rec := world.putBytes(row.ID, uploadPayload)

	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if got := refusalCode(t, rec); got != AssetAlreadyUploadedCode {
		t.Fatalf("code = %q, want %q", got, AssetAlreadyUploadedCode)
	}
	if len(world.store.written) != 0 {
		t.Fatalf("the live object was overwritten: %v", world.store.written)
	}
}

func TestUploadAssetContentInPostgresRefusesBytesThatDoNotMatchTheDigest(t *testing.T) {
	world := newAssetDBWorld(t)
	row := world.uploadable("tampered-upload", entasset.StatusPending)
	world.db.Forget()

	tampered := append([]byte{}, uploadPayload...)
	tampered[3] = '#'

	rec := world.putBytes(row.ID, tampered)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if got := refusalCode(t, rec); got != AssetDigestMismatchCode {
		t.Fatalf("code = %q, want %q", got, AssetDigestMismatchCode)
	}
	if got := world.status(row.ID); got != entasset.StatusPending {
		t.Fatalf("a refused upload left the row at %s, want pending", got)
	}
	if _, left := world.store.stored[row.StorageKey]; left {
		t.Fatal("the refused bytes were left in the store as if they were the file")
	}
	if len(world.store.deleteKeys) != 1 || world.store.deleteKeys[0] != row.StorageKey {
		t.Fatalf("the refusal must sweep its own key, got %v", world.store.deleteKeys)
	}
}

func TestUploadAssetContentInPostgresLetsOnlyOneRacerClaimTheRow(t *testing.T) {
	world := newAssetDBWorld(t)
	row := world.uploadable("raced-upload", entasset.StatusPending)
	world.db.Forget()

	rival := &onceAtByte{
		Reader: strings.NewReader(string(uploadPayload)),
		at:     8,
		do: func() {
			world.db.Client.Asset.UpdateOneID(row.ID).
				SetStatus(entasset.StatusReady).
				ExecX(context.Background())
		},
	}

	rec := world.put(row.ID, rival, int64(len(uploadPayload)))

	if rec.Code != http.StatusConflict {
		t.Fatalf("a racer that lost the row must be told so, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if got := refusalCode(t, rec); got != AssetAlreadyUploadedCode {
		t.Fatalf("code = %q, want %q", got, AssetAlreadyUploadedCode)
	}
	if !rival.fired {
		t.Fatal("the rival never claimed the row, so nothing was raced")
	}
}

type onceAtByte struct {
	io.Reader
	at    int64
	read  int64
	do    func()
	fired bool
}

func (o *onceAtByte) Read(p []byte) (int, error) {
	n, err := o.Reader.Read(p)
	o.read += int64(n)
	if !o.fired && o.read >= o.at {
		o.fired = true
		o.do()
	}
	return n, err
}
