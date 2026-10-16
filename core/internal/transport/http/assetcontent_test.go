package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	entasset "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/asset"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/blob"
)

func assetBytes(size int) []byte {
	out := make([]byte, size)
	for i := range out {
		out[i] = byte('A' + i%26)
	}
	return out
}

func (fx *libraryFixture) holdsReadable(payload []byte, fields map[string]any) uuid.UUID {
	id := uuid.New()
	row := libraryAssetRowIn(id, fx.person, entasset.StatusReady)
	row["size_bytes"] = int64(len(payload))
	row["sha256"] = digestOf(payload)
	for name, value := range fields {
		row[name] = value
	}
	fx.driver.tables["assets"] = []map[string]any{row}
	fx.store.object = payload
	return id
}

func (fx *libraryFixture) content(id uuid.UUID, rangeHeader string) *httptest.ResponseRecorder {
	fx.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", id.String())
	ctx := context.WithValue(fx.ctx, chi.RouteCtxKey, route)

	r := httptest.NewRequest(http.MethodGet,
		"/api/v1/library/assets/"+id.String()+"/content", strings.NewReader("")).WithContext(ctx)
	if rangeHeader != "" {
		r.Header.Set("Range", rangeHeader)
	}

	w := httptest.NewRecorder()
	fx.server.getAssetContent(w, r)
	return w
}

func TestAssetContentStreamsTheObjectThroughCore(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := assetBytes(4096)
	id := fx.holdsReadable(payload, nil)

	w := fx.content(id, "")

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := w.Header().Get("Content-Type"); got != "application/pdf" {
		t.Fatalf("Content-Type = %q, want the row's mime type", got)
	}
	if got := w.Header().Get("Content-Length"); got != strconv.Itoa(len(payload)) {
		t.Fatalf("Content-Length = %q, want %d", got, len(payload))
	}
	if got := w.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("Accept-Ranges = %q, so a browser pdf viewer will not ask for ranges", got)
	}
	if got := w.Header().Get("Content-Range"); got != "" {
		t.Fatalf("an unranged read must carry no Content-Range, got %q", got)
	}
	if !bytes.Equal(w.Body.Bytes(), payload) {
		t.Fatalf("the body is %d bytes, want the stored %d", w.Body.Len(), len(payload))
	}
	if len(fx.store.readKeys) != 1 || fx.store.readKeys[0] != mintedStorageKey(id) {
		t.Fatalf("the store was read as %v, want one read of the row's own key", fx.store.readKeys)
	}
	if fx.store.readRanges[0] != "" {
		t.Fatalf("no Range header must reach the store, got %q", fx.store.readRanges[0])
	}
}

func TestAssetContentAnswersAByteRangeWithPartialContent(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := assetBytes(4096)
	id := fx.holdsReadable(payload, nil)

	w := fx.content(id, "bytes=100-199")

	if w.Code != http.StatusPartialContent {
		t.Fatalf("want 206, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := w.Header().Get("Content-Range"); got != "bytes 100-199/4096" {
		t.Fatalf("Content-Range = %q, want bytes 100-199/4096", got)
	}
	if got := w.Header().Get("Content-Length"); got != "100" {
		t.Fatalf("Content-Length = %q, want 100", got)
	}
	if !bytes.Equal(w.Body.Bytes(), payload[100:200]) {
		t.Fatalf("the slice served is not bytes 100..199: %q", w.Body.Bytes())
	}
	if fx.store.readRanges[0] != "bytes=100-199" {
		t.Fatalf("the store saw range %q", fx.store.readRanges[0])
	}
}

func TestAssetContentAnswersAnOpenEndedRangeToTheEndOfTheObject(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := assetBytes(1000)
	id := fx.holdsReadable(payload, nil)

	w := fx.content(id, "bytes=990-")

	if w.Code != http.StatusPartialContent {
		t.Fatalf("want 206, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := w.Header().Get("Content-Range"); got != "bytes 990-999/1000" {
		t.Fatalf("Content-Range = %q", got)
	}
	if !bytes.Equal(w.Body.Bytes(), payload[990:]) {
		t.Fatalf("body = %q", w.Body.Bytes())
	}
}

func TestAssetContentAnswersASuffixRange(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := assetBytes(1000)
	id := fx.holdsReadable(payload, nil)

	w := fx.content(id, "bytes=-10")

	if w.Code != http.StatusPartialContent {
		t.Fatalf("want 206, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := w.Header().Get("Content-Range"); got != "bytes 990-999/1000" {
		t.Fatalf("Content-Range = %q", got)
	}
	if !bytes.Equal(w.Body.Bytes(), payload[990:]) {
		t.Fatalf("body = %q", w.Body.Bytes())
	}
}

func TestAssetContentClampsARangeThatRunsPastTheEnd(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := assetBytes(1000)
	id := fx.holdsReadable(payload, nil)

	w := fx.content(id, "bytes=900-99999")

	if w.Code != http.StatusPartialContent {
		t.Fatalf("want 206, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := w.Header().Get("Content-Range"); got != "bytes 900-999/1000" {
		t.Fatalf("Content-Range = %q, want the clamped span", got)
	}
	if got := w.Header().Get("Content-Length"); got != "100" {
		t.Fatalf("Content-Length = %q, want 100", got)
	}
}

func TestAssetContentAnswersASingleByteProbeRange(t *testing.T) {
	fx := newLibraryFixture(t)
	payload := assetBytes(4096)
	id := fx.holdsReadable(payload, nil)

	w := fx.content(id, "bytes=0-0")

	if w.Code != http.StatusPartialContent {
		t.Fatalf("want 206, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := w.Header().Get("Content-Range"); got != "bytes 0-0/4096" {
		t.Fatalf("Content-Range = %q, want bytes 0-0/4096, which is where a client that "+
			"probes with one byte learns the size", got)
	}
	if got := w.Header().Get("Content-Type"); got != "application/pdf" {
		t.Fatalf("Content-Type = %q, want the row's mime type on a probe too", got)
	}
	if !bytes.Equal(w.Body.Bytes(), payload[:1]) {
		t.Fatalf("a one byte probe served %d bytes", w.Body.Len())
	}
}

func TestAssetContentRefusesAProbeBeforeTheAssetIsReadable(t *testing.T) {
	fx := newLibraryFixture(t)
	id := fx.holdsReadable(assetBytes(4096),
		map[string]any{"status": string(entasset.StatusPending)})

	w := fx.content(id, "bytes=0-0")

	if w.Code != http.StatusConflict {
		t.Fatalf("a probe at an unready asset must answer the status refusal, not a range "+
			"one, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
}

func TestAssetContentRefusesARangeThatStartsPastTheEnd(t *testing.T) {
	fx := newLibraryFixture(t)
	id := fx.holdsReadable(assetBytes(1000), nil)

	w := fx.content(id, "bytes=5000-6000")

	if w.Code != http.StatusRequestedRangeNotSatisfiable {
		t.Fatalf("want 416, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := w.Header().Get("Content-Range"); got != "bytes */1000" {
		t.Fatalf("a 416 must state the true size, got %q", got)
	}
	if len(fx.store.readKeys) != 0 {
		t.Fatalf("an unsatisfiable range must never reach the store, got %v", fx.store.readKeys)
	}
}

func TestAssetContentIgnoresARangeItCannotParse(t *testing.T) {
	headers := []string{"pages=1-2", "bytes=abc-def", "bytes=5-2", "bytes=0-1,4-5"}

	for _, header := range headers {
		t.Run(header, func(t *testing.T) {
			fx := newLibraryFixture(t)
			payload := assetBytes(512)
			id := fx.holdsReadable(payload, nil)

			w := fx.content(id, header)

			if w.Code != http.StatusOK {
				t.Fatalf("an unusable range must fall back to the whole object, got %d: %s",
					w.Code, strings.TrimSpace(w.Body.String()))
			}
			if !bytes.Equal(w.Body.Bytes(), payload) {
				t.Fatalf("the whole object was not served: %d bytes", w.Body.Len())
			}
			if fx.store.readRanges[0] != "" {
				t.Fatalf("the store saw range %q, want none", fx.store.readRanges[0])
			}
		})
	}
}

func TestAssetContentWillNotRenderAnUploadedPageInTheBrowser(t *testing.T) {
	for _, mimeType := range []string{"text/html", "image/svg+xml", "text/html; charset=utf-8"} {
		t.Run(mimeType, func(t *testing.T) {
			fx := newLibraryFixture(t)
			id := fx.holdsReadable(assetBytes(64), map[string]any{
				"mime_type": mimeType,
				"file_name": "lesson.html",
			})

			w := fx.content(id, "")

			if w.Code != http.StatusOK {
				t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			kind, _, err := mime.ParseMediaType(w.Header().Get("Content-Disposition"))
			if err != nil {
				t.Fatalf("Content-Disposition does not parse: %v", err)
			}
			if kind != "attachment" {
				t.Fatalf("disposition = %q, want attachment: served inline from this origin, "+
					"an uploaded page is a script on the app that framed it", kind)
			}
			if got := w.Header().Get("Content-Security-Policy"); got != "sandbox" {
				t.Fatalf("Content-Security-Policy = %q, want sandbox", got)
			}
		})
	}
}

func TestAssetContentRendersARenderableTypeWithoutASandbox(t *testing.T) {
	for _, mimeType := range []string{"application/pdf", "image/png", "IMAGE/PNG"} {
		t.Run(mimeType, func(t *testing.T) {
			fx := newLibraryFixture(t)
			id := fx.holdsReadable(assetBytes(64), map[string]any{"mime_type": mimeType})

			w := fx.content(id, "")

			kind, _, err := mime.ParseMediaType(w.Header().Get("Content-Disposition"))
			if err != nil {
				t.Fatalf("Content-Disposition does not parse: %v", err)
			}
			if kind != "inline" {
				t.Fatalf("disposition = %q, want inline so the browser draws it", kind)
			}
			if got := w.Header().Get("Content-Security-Policy"); got != "" {
				t.Fatalf("Content-Security-Policy = %q, want none: a sandbox on the response "+
					"is what stops a viewer rendering it", got)
			}
			if got := w.Header().Get("X-Content-Type-Options"); got != "nosniff" {
				t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
			}
		})
	}
}

func TestAssetContentQuotesAFileNameThatWouldBreakTheHeader(t *testing.T) {
	fx := newLibraryFixture(t)
	name := `term one "final" report.pdf`
	id := fx.holdsReadable(assetBytes(64), map[string]any{"file_name": name})

	w := fx.content(id, "")

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	header := w.Header().Get("Content-Disposition")
	kind, params, err := mime.ParseMediaType(header)
	if err != nil {
		t.Fatalf("Content-Disposition %q does not parse: %v", header, err)
	}
	if kind != "inline" {
		t.Fatalf("disposition = %q, want inline so a browser renders it", kind)
	}
	if params["filename"] != name {
		t.Fatalf("filename round tripped as %q, want %q", params["filename"], name)
	}
}

func TestAssetContentCarriesANonASCIIFileNameThroughTheHeader(t *testing.T) {
	fx := newLibraryFixture(t)
	name := "कक्षा ९ गणित.pdf"
	id := fx.holdsReadable(assetBytes(64), map[string]any{"file_name": name})

	header := fx.content(id, "").Header().Get("Content-Disposition")
	kind, params, err := mime.ParseMediaType(header)
	if err != nil {
		t.Fatalf("Content-Disposition %q does not parse: %v", header, err)
	}
	if kind != "inline" || params["filename"] != name {
		t.Fatalf("Content-Disposition = %q, want inline carrying %q", header, name)
	}
}

func TestAssetContentStripsALineBreakOutOfTheFileName(t *testing.T) {
	fx := newLibraryFixture(t)
	id := fx.holdsReadable(assetBytes(64),
		map[string]any{"file_name": "atlas\r\nX-Injected: yes.pdf"})

	header := fx.content(id, "").Header().Get("Content-Disposition")
	if strings.ContainsAny(header, "\r\n") {
		t.Fatalf("Content-Disposition carries a line break: %q", header)
	}
	if _, _, err := mime.ParseMediaType(header); err != nil {
		t.Fatalf("Content-Disposition %q does not parse: %v", header, err)
	}
}

func TestAssetContentRefusesAnAssetThatCarriesNoBytesYet(t *testing.T) {
	for _, status := range []entasset.Status{entasset.StatusPending, entasset.StatusDeleted} {
		t.Run(string(status), func(t *testing.T) {
			fx := newLibraryFixture(t)
			id := fx.holdsReadable(assetBytes(64), map[string]any{"status": string(status)})

			w := fx.content(id, "")

			if w.Code != http.StatusConflict {
				t.Fatalf("want 409, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			if got := libraryMessage(t, w); got != unreadableAsset(status) {
				t.Fatalf("message = %q, want the wording getAssetLink already uses (%q)",
					got, unreadableAsset(status))
			}
			if len(fx.store.readKeys) != 0 {
				t.Fatalf("an unready asset must never reach the store, got %v", fx.store.readKeys)
			}
		})
	}
}

func TestAssetContentReportsASchoolWithNoObjectStore(t *testing.T) {
	fx := newLibraryFixture(t)
	id := fx.holdsReadable(assetBytes(64), nil)

	previous := openObjectStore
	openObjectStore = func(ctx context.Context, s *Server) (objectStore, error) {
		return nil, tenancy.ErrNoProfile
	}
	t.Cleanup(func() { openObjectStore = previous })

	w := fx.content(id, "")

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
}

func TestAssetContentRefusesAnObjectShorterThanTheAssetRecords(t *testing.T) {
	fx := newLibraryFixture(t)
	id := fx.holdsReadable(assetBytes(1000), nil)
	fx.store.object = assetBytes(999)

	w := fx.content(id, "")

	if w.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if got := refusalCode(t, w); got != AssetSizeMismatchCode {
		t.Fatalf("code = %q, want %q", got, AssetSizeMismatchCode)
	}
	if w.Header().Get("Content-Length") == "1000" {
		t.Fatal("the handler declared a length it could never write")
	}
}

func TestAssetContentNeverLogsASignedURL(t *testing.T) {
	fx := newLibraryFixture(t)
	id := fx.holdsReadable(assetBytes(64), nil)

	fx.content(id, "")

	if strings.Contains(fx.logs.String(), "X-Amz-Signature") {
		t.Fatalf("a signed url reached the log: %s", fx.logs.String())
	}
}

func TestParseByteSpanReadsTheRangesABrowserActuallySends(t *testing.T) {
	const size = int64(1000)

	cases := []struct {
		header      string
		partial     bool
		satisfiable bool
		start       int64
		end         int64
	}{
		{"", false, true, 0, 999},
		{"bytes=0-", true, true, 0, 999},
		{"bytes=0-0", true, true, 0, 0},
		{"bytes=0-499", true, true, 0, 499},
		{"bytes=500-999", true, true, 500, 999},
		{"bytes=500-4000", true, true, 500, 999},
		{"bytes=-1", true, true, 999, 999},
		{"bytes=-4000", true, true, 0, 999},
		{"bytes=999-", true, true, 999, 999},
		{"bytes=1000-", true, false, 0, 0},
		{"bytes=-0", true, false, 0, 0},
		{"bytes=", false, true, 0, 999},
		{"bytes=-", false, true, 0, 999},
		{"bytes=x-9", false, true, 0, 999},
		{"bytes=9-x", false, true, 0, 999},
		{"bytes=9-4", false, true, 0, 999},
		{"bytes=-5-9", false, true, 0, 999},
		{"items=0-9", false, true, 0, 999},
		{"bytes=0-9, 20-29", false, true, 0, 999},
	}

	for _, tc := range cases {
		t.Run(tc.header, func(t *testing.T) {
			span, partial, satisfiable := parseByteSpan(tc.header, size)

			if partial != tc.partial || satisfiable != tc.satisfiable {
				t.Fatalf("partial=%v satisfiable=%v, want %v and %v",
					partial, satisfiable, tc.partial, tc.satisfiable)
			}
			if !satisfiable {
				return
			}
			if span.start != tc.start || span.end != tc.end {
				t.Fatalf("span = %d-%d, want %d-%d", span.start, span.end, tc.start, tc.end)
			}
			if got := span.length(); got != tc.end-tc.start+1 {
				t.Fatalf("length = %d", got)
			}
		})
	}
}

func TestParseByteSpanRefusesEveryRangeOverAnEmptyObject(t *testing.T) {
	for _, header := range []string{"bytes=0-", "bytes=0-0", "bytes=-1"} {
		if _, partial, satisfiable := parseByteSpan(header, 0); !partial || satisfiable {
			t.Fatalf("%q over an empty object read as partial=%v satisfiable=%v",
				header, partial, satisfiable)
		}
	}
}

type countingWriter struct {
	header  http.Header
	code    int
	sent    int64
	at      int64
	reached chan struct{}
}

func (w *countingWriter) Header() http.Header {
	if w.header == nil {
		w.header = http.Header{}
	}
	return w.header
}

func (w *countingWriter) WriteHeader(code int) { w.code = code }

func (w *countingWriter) Write(p []byte) (int, error) {
	w.sent += int64(len(p))
	if w.sent >= w.at && w.reached != nil {
		close(w.reached)
		w.reached = nil
	}
	return len(p), nil
}

type gatedStore struct {
	*libraryObjectStore
	gate *gatedReader
}

func (st *gatedStore) Get(ctx context.Context, r blob.GetRequest) (blob.ObjectStream, error) {
	stream, err := st.libraryObjectStore.Get(ctx, r)
	if err != nil {
		return stream, err
	}
	st.gate.src = stream.Body
	stream.Body = st.gate
	return stream, nil
}

type gatedReader struct {
	src     io.ReadCloser
	read    int64
	after   int64
	release chan struct{}
}

func (g *gatedReader) Read(p []byte) (int, error) {
	if g.read >= g.after && g.release != nil {
		select {
		case <-g.release:
		case <-time.After(5 * time.Second):
			return 0, errors.New("the response carried nothing while the object was still " +
				"being read, so the handler buffered it instead of streaming it")
		}
		g.release = nil
	}
	n, err := g.src.Read(p)
	g.read += int64(n)
	return n, err
}

func (g *gatedReader) Close() error { return g.src.Close() }

func TestAssetContentWritesTheFirstBytesBeforeItHasReadTheLast(t *testing.T) {
	const chunk = 32 * 1024

	fx := newLibraryFixture(t)
	payload := assetBytes(4 * chunk)
	id := fx.holdsReadable(payload, nil)

	reached := make(chan struct{})
	gate := &gatedReader{after: chunk, release: reached}
	store := &gatedStore{libraryObjectStore: fx.store, gate: gate}

	previous := openObjectStore
	openObjectStore = func(ctx context.Context, s *Server) (objectStore, error) {
		if s == fx.server {
			return store, nil
		}
		return previous(ctx, s)
	}
	t.Cleanup(func() { openObjectStore = previous })

	route := chi.NewRouteContext()
	route.URLParams.Add("id", id.String())
	ctx := context.WithValue(fx.ctx, chi.RouteCtxKey, route)
	r := httptest.NewRequest(http.MethodGet,
		"/api/v1/library/assets/"+id.String()+"/content", strings.NewReader("")).WithContext(ctx)

	w := &countingWriter{at: chunk, reached: reached}
	fx.server.getAssetContent(w, r)

	if w.code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.code)
	}
	if w.sent != int64(len(payload)) {
		t.Fatalf("the response carried %d bytes, want the whole %d", w.sent, len(payload))
	}
	select {
	case <-reached:
	default:
		t.Fatal("the writer never saw a byte, so nothing was proved about streaming")
	}
}

func assetRefusalCodeOrNone(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()

	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("the refusal is not JSON: %v (%q)", err, w.Body.String())
	}
	code, _ := body["code"].(string)
	return code
}

func TestAssetContentTellsItsThreeConflictsApartByTheirCode(t *testing.T) {
	cases := []struct {
		name  string
		setUp func(*libraryFixture) uuid.UUID
		want  string
	}{
		{"an asset that has not finished uploading", func(fx *libraryFixture) uuid.UUID {
			return fx.holdsReadable(assetBytes(1024),
				map[string]any{"status": string(entasset.StatusPending)})
		}, ""},
		{"an asset whose bytes are gone from the store", func(fx *libraryFixture) uuid.UUID {
			id := fx.holdsReadable(assetBytes(1024), nil)
			fx.store.object = nil
			return id
		}, AssetObjectMissingCode},
		{"an asset the store disagrees with about length", func(fx *libraryFixture) uuid.UUID {
			id := fx.holdsReadable(assetBytes(1024), nil)
			fx.store.object = assetBytes(1023)
			return id
		}, AssetSizeMismatchCode},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newLibraryFixture(t)
			id := tc.setUp(fx)

			w := fx.content(id, "")

			if w.Code != http.StatusConflict {
				t.Fatalf("want 409, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			if got := assetRefusalCodeOrNone(t, w); got != tc.want {
				t.Fatalf("code = %q, want %q. A client tells the benign 409 from the two "+
					"that will never resolve by waiting on the presence of this field, so "+
					"changing it silently changes what a teacher is told to do", got, tc.want)
			}
		})
	}
}
