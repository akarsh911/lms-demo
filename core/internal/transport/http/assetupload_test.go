package http

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
)

func digestOf(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func (fx *libraryFixture) holdsUploadable(id uuid.UUID, payload []byte,
	status entasset.Status) uuid.UUID {
	row := libraryAssetRowIn(id, fx.person, status)
	row["size_bytes"] = int64(len(payload))
	row["sha256"] = digestOf(payload)
	fx.driver.tables["assets"] = []map[string]any{row}
	return id
}

func (fx *libraryFixture) upload(id uuid.UUID, body io.Reader,
	length int64) *httptest.ResponseRecorder {
	fx.t.Helper()

	ctx := fx.ctx
	route := chi.NewRouteContext()
	route.URLParams.Add("id", id.String())
	ctx = context.WithValue(ctx, chi.RouteCtxKey, route)

	r := httptest.NewRequest(http.MethodPut,
		"/api/v1/library/assets/"+id.String()+"/content", body).WithContext(ctx)
	r.Header.Set("Content-Type", "application/pdf")
	r.ContentLength = length

	w := httptest.NewRecorder()
	fx.server.uploadAssetContent(w, r)
	return w
}

func (fx *libraryFixture) uploadBytes(id uuid.UUID, payload []byte) *httptest.ResponseRecorder {
	return fx.upload(id, strings.NewReader(string(payload)), int64(len(payload)))
}

func refusalCode(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("the refusal is not JSON: %v (%q)", err, w.Body.String())
	}
	code, _ := body["code"].(string)
	return code
}

func TestAssetContentUploadIsMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	for _, pattern := range []string{
		"PUT /api/v1/library/assets/{id}/content",
		"GET /api/v1/library/assets/{id}/content",
	} {
		if found[pattern] || found[pattern+"/"] {
			continue
		}
		var near []string
		for got := range found {
			if strings.Contains(got, "/library/assets") {
				near = append(near, got)
			}
		}
		t.Fatalf("%s is not mounted, so the handler is unreachable however well it is "+
			"tested; nearest mounted: %v", pattern, near)
	}
}

func TestOnlyTheStreamedAssetRoutesEscapeTheOrdinaryRequestTimeout(t *testing.T) {
	slow := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			return
		case <-time.After(50 * time.Millisecond):
		}
		w.WriteHeader(http.StatusOK)
	})
	guarded := requestTimeout(time.Millisecond, time.Minute)(slow)

	cases := []struct {
		name   string
		method string
		path   string
		want   int
	}{
		{"an ordinary read", http.MethodGet, "/api/v1/library/assets", http.StatusGatewayTimeout},
		{"the presigned handshake", http.MethodPost, "/api/v1/library/assets", http.StatusGatewayTimeout},
		{"a streamed upload", http.MethodPut,
			"/api/v1/library/assets/" + uuid.New().String() + "/content", http.StatusOK},
		{"a streamed download", http.MethodGet,
			"/api/v1/library/assets/" + uuid.New().String() + "/content", http.StatusOK},
		{"a get that is not a download", http.MethodGet,
			"/api/v1/library/assets/" + uuid.New().String(), http.StatusGatewayTimeout},
		{"a put that is not an upload", http.MethodPut,
			"/api/v1/library/assets/" + uuid.New().String(), http.StatusGatewayTimeout},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			guarded.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, nil))
			if w.Code != tc.want {
				t.Fatalf("want %d, got %d", tc.want, w.Code)
			}
		})
	}
}

func TestUploadAssetContentStoresTheBytesAndPromotesTheRow(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := []byte("the chapter on photosynthesis, as a pdf")
	stored := fx.holdsUploadable(uuid.New(), payload, entasset.StatusPending)

	w := fx.uploadBytes(stored, payload)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if len(fx.store.written) != 1 {
		t.Fatalf("the store was written to %d times, want once", len(fx.store.written))
	}

	sent := fx.store.written[0]
	if sent.Key != mintedStorageKey(stored) {
		t.Fatalf("the bytes went to %q, want the key the row records", sent.Key)
	}
	if sent.ContentType != "application/pdf" {
		t.Fatalf("ContentType = %q, want the row's mime type", sent.ContentType)
	}
	if sent.ContentLength != int64(len(payload)) {
		t.Fatalf("ContentLength = %d, want %d", sent.ContentLength, len(payload))
	}
	if sent.SHA256Hex != digestOf(payload) {
		t.Fatalf("SHA256Hex = %q, want the row's digest", sent.SHA256Hex)
	}

	landed := fx.store.stored[mintedStorageKey(stored)]
	if string(landed.bytes) != string(payload) {
		t.Fatalf("the object holds %q, want %q", landed.bytes, payload)
	}
	if landed.digest != digestOf(payload) {
		t.Fatalf("the object hashes to %q, want %q", landed.digest, digestOf(payload))
	}

	update := fx.onlyWrite("assets")
	if !update.carriesText(string(entasset.StatusReady)) {
		t.Fatalf("the row was never promoted to ready, got %v", update.args)
	}
	if !update.carriesText(string(entasset.StatusPending)) {
		t.Fatalf("the promotion is not guarded by the pending status, so two uploads "+
			"could both claim the row: %q", update.query)
	}
	if len(fx.store.deleteKeys) != 0 {
		t.Fatalf("a successful upload deleted %v", fx.store.deleteKeys)
	}
}

func TestUploadAssetContentRefusesBytesThatDoNotMatchTheRecordedDigest(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := []byte("the chapter on photosynthesis, as a pdf")
	stored := fx.holdsUploadable(uuid.New(), payload, entasset.StatusPending)

	tampered := append([]byte{}, payload...)
	tampered[0] = 'X'

	w := fx.uploadBytes(stored, tampered)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := refusalCode(t, w); got != AssetDigestMismatchCode {
		t.Fatalf("code = %q, want %q", got, AssetDigestMismatchCode)
	}
	fx.refusedBefore("assets")
	if _, left := fx.store.stored[mintedStorageKey(stored)]; left {
		t.Fatal("the refused bytes were left in the store as if they were the file")
	}
	if len(fx.store.deleteKeys) != 1 || fx.store.deleteKeys[0] != mintedStorageKey(stored) {
		t.Fatalf("the refusal must sweep its own key, got %v", fx.store.deleteKeys)
	}
}

func TestUploadAssetContentRefusesABodyOfTheWrongLength(t *testing.T) {
	payload := []byte("the chapter on photosynthesis, as a pdf")

	cases := []struct {
		name    string
		body    []byte
		declare int64
	}{
		{"a body cut short", payload[:len(payload)-3], int64(len(payload))},
		{"a body that runs on", append(append([]byte{}, payload...), 'z'), int64(len(payload))},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			stored := fx.holdsUploadable(uuid.New(), payload, entasset.StatusPending)

			w := fx.upload(stored, strings.NewReader(string(tc.body)), tc.declare)

			if w.Code != http.StatusUnprocessableEntity {
				t.Fatalf("want 422, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			if got := refusalCode(t, w); got != AssetSizeMismatchCode {
				t.Fatalf("code = %q, want %q", got, AssetSizeMismatchCode)
			}
			fx.refusedBefore("assets")
			if len(fx.store.written) != 1 {
				t.Fatal("the length was caught before streaming, so this proves nothing " +
					"about the count the handler keeps while the bytes pass")
			}
			if _, left := fx.store.stored[mintedStorageKey(stored)]; left {
				t.Fatal("the refused bytes were left in the store")
			}
			if len(fx.store.deleteKeys) != 1 {
				t.Fatalf("the refusal must sweep its own key, got %v", fx.store.deleteKeys)
			}
		})
	}
}

func TestUploadAssetContentRefusesADeclaredLengthThatContradictsTheRow(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := []byte("the chapter on photosynthesis, as a pdf")
	stored := fx.holdsUploadable(uuid.New(), payload, entasset.StatusPending)

	w := fx.upload(stored, strings.NewReader("short"), 5)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := refusalCode(t, w); got != AssetSizeMismatchCode {
		t.Fatalf("code = %q, want %q", got, AssetSizeMismatchCode)
	}
	if len(fx.store.written) != 0 {
		t.Fatal("a body that declares the wrong length must never reach the store")
	}
	fx.refusedBefore("assets")
}

func TestUploadAssetContentRefusesASecondUploadOverAReadyAsset(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := []byte("the chapter on photosynthesis, as a pdf")
	stored := fx.holdsUploadable(uuid.New(), payload, entasset.StatusReady)

	w := fx.uploadBytes(stored, payload)

	if w.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := refusalCode(t, w); got != AssetAlreadyUploadedCode {
		t.Fatalf("code = %q, want %q", got, AssetAlreadyUploadedCode)
	}
	if len(fx.store.written) != 0 {
		t.Fatal("an asset that already carries its bytes must not be overwritten")
	}
	if len(fx.store.deleteKeys) != 0 {
		t.Fatalf("the refusal deleted the live object: %v", fx.store.deleteKeys)
	}
	fx.refusedBefore("assets")
}

func TestUploadAssetContentRefusesToResurrectADeletedAsset(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := []byte("the chapter on photosynthesis, as a pdf")
	stored := fx.holdsUploadable(uuid.New(), payload, entasset.StatusDeleted)

	w := fx.uploadBytes(stored, payload)

	if w.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := refusalCode(t, w); got != AssetDeletedCode {
		t.Fatalf("code = %q, want %q", got, AssetDeletedCode)
	}
	if len(fx.store.written) != 0 {
		t.Fatal("a deleted asset must not be written to")
	}
}

func TestUploadAssetContentOnAnAssetTheViewerCannotReachIsNotFound(t *testing.T) {
	fx := newLibraryFixture(t, libraryNarrowed())
	payload := []byte("the chapter on photosynthesis, as a pdf")
	stored := uuid.New()
	fx.driver.tables["assets"] = nil

	w := fx.uploadBytes(stored, payload)

	if w.Code != http.StatusNotFound {
		t.Fatalf("an unreachable asset must read as 404, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}
	if strings.Contains(strings.ToLower(w.Body.String()), "forbidden") {
		t.Fatalf("the refusal confirms the row exists: %s", w.Body.String())
	}
	if len(fx.store.written) != 0 {
		t.Fatal("an unreachable asset must never reach the store")
	}
	fx.refusedBefore("assets")
}

func TestUploadAssetContentDoesNotHoldTheBodyInMemory(t *testing.T) {
	const size = int64(128 << 20)

	fx := newLibraryFixture(t)
	digest := sha256.New()
	if _, err := io.Copy(digest, io.LimitReader(filler('p'), size)); err != nil {
		t.Fatalf("hashing the reference stream: %v", err)
	}

	row := libraryAssetRowIn(uuid.New(), fx.person, entasset.StatusPending)
	row["size_bytes"] = size
	row["sha256"] = hex.EncodeToString(digest.Sum(nil))
	fx.driver.tables["assets"] = []map[string]any{row}
	stored := row["id"].(uuid.UUID)

	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)

	w := fx.upload(stored, io.LimitReader(filler('p'), size), size)

	runtime.ReadMemStats(&after)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if landed := fx.store.stored[mintedStorageKey(stored)].length; landed != size {
		t.Fatalf("the store received %d bytes, want %d", landed, size)
	}

	const ceiling = 8 << 20
	if allocated := after.TotalAlloc - before.TotalAlloc; allocated > ceiling {
		t.Fatalf("moving %d bytes allocated %d in total; a handler that buffered the body "+
			"would allocate at least the body itself, and the ceiling is %d",
			size, allocated, uint64(ceiling))
	}
}

func TestUploadAssetContentHandsBytesToTheStoreBeforeTheBodyEnds(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := []byte("the chapter on photosynthesis, as a pdf")
	stored := fx.holdsUploadable(uuid.New(), payload, entasset.StatusPending)

	body, feed := io.Pipe()
	reached := make(chan struct{})

	go func() {
		_, _ = feed.Write(payload[:8])
		select {
		case <-reached:
		case <-time.After(5 * time.Second):
			_ = feed.CloseWithError(io.ErrUnexpectedEOF)
			return
		}
		_, _ = feed.Write(payload[8:])
		_ = feed.Close()
	}()

	watched := &watchedStore{inner: fx.store, seen: reached, after: 8}
	previous := openObjectStore
	openObjectStore = func(ctx context.Context, s *Server) (objectStore, error) {
		if s == fx.server {
			return watched, nil
		}
		return previous(ctx, s)
	}
	t.Cleanup(func() { openObjectStore = previous })

	w := fx.upload(stored, body, int64(len(payload)))

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	select {
	case <-reached:
	default:
		t.Fatal("the store never saw a byte before the body ended, so the handler buffered it")
	}
}

type watchedStore struct {
	inner *libraryObjectStore
	seen  chan struct{}
	after int64
}

func (s *watchedStore) PresignPut(ctx context.Context, r blob.PutRequest) (blob.PutGrant, error) {
	return s.inner.PresignPut(ctx, r)
}

func (s *watchedStore) PresignGet(ctx context.Context, key string, expires time.Duration) (string, error) {
	return s.inner.PresignGet(ctx, key, expires)
}

func (s *watchedStore) Get(ctx context.Context, r blob.GetRequest) (blob.ObjectStream, error) {
	return s.inner.Get(ctx, r)
}

func (s *watchedStore) Head(ctx context.Context, key string) (blob.ObjectInfo, error) {
	return s.inner.Head(ctx, key)
}

func (s *watchedStore) Delete(ctx context.Context, key string) error {
	return s.inner.Delete(ctx, key)
}

func (s *watchedStore) Put(ctx context.Context, r blob.PutStream) error {
	r.Body = &announcingReader{src: r.Body, at: s.after, once: s.seen}
	return s.inner.Put(ctx, r)
}

type announcingReader struct {
	src  io.Reader
	at   int64
	read int64
	once chan struct{}
}

func (a *announcingReader) Read(p []byte) (int, error) {
	n, err := a.src.Read(p)
	a.read += int64(n)
	if a.read >= a.at && a.once != nil {
		close(a.once)
		a.once = nil
	}
	return n, err
}

type filler byte

func (f filler) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = byte(f)
	}
	return len(p), nil
}
