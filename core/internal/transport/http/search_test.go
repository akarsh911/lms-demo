package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entcontentplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
)

const searchSlug = "demo-school"

type searchProbe struct {
	server *httptest.Server
	calls  *atomic.Int64

	mu       sync.Mutex
	bodies   []map[string]any
	status   int
	passages []map[string]any
}

func newSearchProbe(t *testing.T) *searchProbe {
	t.Helper()

	probe := &searchProbe{calls: &atomic.Int64{}, status: http.StatusOK}
	mux := http.NewServeMux()
	mux.HandleFunc("/retrieve", func(w http.ResponseWriter, r *http.Request) {
		probe.calls.Add(1)

		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)

		probe.mu.Lock()
		probe.bodies = append(probe.bodies, body)
		status, passages := probe.status, probe.passages
		probe.mu.Unlock()

		if status != http.StatusOK {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"detail": "visible_scopes may only be asserted by a credentialed asserter",
			})
			return
		}
		writeProbeJSON(w, map[string]any{
			"mode": "SEARCH", "passages": passages, "no_good_match": len(passages) == 0,
		})
	})
	probe.server = httptest.NewServer(mux)
	t.Cleanup(probe.server.Close)
	return probe
}

func (p *searchProbe) answers(passages ...map[string]any) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.passages = passages
}

func (p *searchProbe) refuses(status int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.status = status
}

func (p *searchProbe) body(t *testing.T) map[string]any {
	t.Helper()
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.bodies) != 1 {
		t.Fatalf("want exactly one engine call, got %d", len(p.bodies))
	}
	return p.bodies[0]
}

func searchPassageOf(document string, page int) map[string]any {
	return map[string]any{
		"chunk_id":    document + "::c1",
		"text":        "a passage from " + document,
		"score":       0.9,
		"source_type": "book",
		"page":        page,
		"citation": map[string]any{
			"document_id":    document,
			"document_title": "Atlas",
			"page_range":     []int{page, page},
			"confidence":     1.0,
		},
	}
}

func librarySearching(t *testing.T, probe *searchProbe, enabled bool) libraryOption {
	t.Helper()

	return func(fx *libraryFixture) {
		base := ""
		if probe != nil {
			base = probe.server.URL
		}
		fx.server.cfg = &config.Config{
			RetrievalSearchEnabled: enabled,
			RetrievalEngineBaseURL: base,
		}
		fx.ctx = tenancy.WithTenant(fx.ctx, &tenancy.Tenant{
			SchoolID:    uuid.New(),
			Code:        "DEMO",
			CASTenantID: searchSlug,
		})

		if base == "" || !enabled {
			return
		}
		client, err := indexing.NewClient(indexing.ClientConfig{
			BaseURL: base,
			Timeout: 5 * time.Second,
		})
		if err != nil {
			t.Fatalf("could not build an engine client: %v", err)
		}
		UseSearcher(client)
		t.Cleanup(func() { UseSearcher(nil) })
	}
}

func indexedItem(row map[string]any, document string) map[string]any {
	row["status"] = string(entcontentitem.StatusPublished)
	row["engine_document_id"] = document
	row["indexed_sha256"] = libraryDigest
	row["index_status"] = string(entcontentitem.IndexStatusIndexed)
	return row
}

func (fx *libraryFixture) search(query string) *httptest.ResponseRecorder {
	fx.t.Helper()
	return fx.call(fx.server.searchLibrary, http.MethodGet,
		"/api/v1/library/search?"+query, "", uuid.Nil)
}

func searchBodyOf(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, w.Body.String())
	}
	return body
}

func searchDocumentsOf(t *testing.T, w *httptest.ResponseRecorder) []string {
	t.Helper()
	body := searchBodyOf(t, w)
	passages, ok := body["passages"].([]any)
	if !ok {
		t.Fatalf("the response carries no passages: %s", w.Body.String())
	}
	out := make([]string, 0, len(passages))
	for _, raw := range passages {
		passage, _ := raw.(map[string]any)
		citation, _ := passage["citation"].(map[string]any)
		document, _ := citation["document_id"].(string)
		out = append(out, document)
	}
	return out
}

func searchDropsOf(t *testing.T, w *httptest.ResponseRecorder, kind string) int {
	t.Helper()
	body := searchBodyOf(t, w)
	drops, ok := body["dropped"].(map[string]any)
	if !ok {
		t.Fatalf("the response carries no drop counts: %s", w.Body.String())
	}
	count, ok := drops[kind].(float64)
	if !ok {
		t.Fatalf("the response carries no %q drop count: %s", kind, w.Body.String())
	}
	return int(count)
}

func TestSearchDropsAPassageWhoseDocumentTheCallerCannotReach(t *testing.T) {
	probe := newSearchProbe(t)
	mine, theirs, stranger := uuid.New(), uuid.New(), uuid.New()

	fx := newGatedFixture(t, libraryNarrowed(), librarySearching(t, probe, true))
	fx.driver.tables["content_items"] = []map[string]any{
		indexedItem(libraryOwnerItem(mine, fx.person), "doc_mine"),
		indexedItem(libraryOwnerItem(theirs, stranger), "doc_theirs"),
	}
	probe.answers(searchPassageOf("doc_mine", 4), searchPassageOf("doc_theirs", 7))

	w := fx.search("q=photosynthesis")
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
	}

	documents := searchDocumentsOf(t, w)
	if len(documents) != 1 || documents[0] != "doc_mine" {
		t.Fatalf("the engine returned a passage from a document this caller may not reach "+
			"and it survived to the wire: %v", documents)
	}
	if dropped := searchDropsOf(t, w, "unreachable"); dropped != 1 {
		t.Fatalf("the drop was not counted, so the engine being wider than the database "+
			"is invisible: unreachable=%d", dropped)
	}
}

func TestSearchDropsADocumentNoContentItemClaims(t *testing.T) {
	probe := newSearchProbe(t)
	mine := uuid.New()

	fx := newGatedFixture(t, librarySearching(t, probe, true))
	fx.driver.tables["content_items"] = []map[string]any{
		indexedItem(libraryOwnerItem(mine, fx.person), "doc_mine"),
	}
	probe.answers(searchPassageOf("doc_mine", 4), searchPassageOf("doc_another_school", 7))

	w := fx.search("q=photosynthesis")
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
	}
	if body := probe.body(t); body["document_ids"] != nil {
		t.Fatalf("an unrestricted caller was pre-filtered by document id: %v", body["document_ids"])
	}

	documents := searchDocumentsOf(t, w)
	if len(documents) != 1 || documents[0] != "doc_mine" {
		t.Fatalf("a document no content item claims survived the re-check: %v", documents)
	}
	if dropped := searchDropsOf(t, w, "unreachable"); dropped != 1 {
		t.Fatalf("the drop was not counted: unreachable=%d", dropped)
	}
}

func TestSearchSendsTheCallersReachableDocumentsToTheEngine(t *testing.T) {
	probe := newSearchProbe(t)
	mine, theirs, stranger := uuid.New(), uuid.New(), uuid.New()

	fx := newGatedFixture(t, libraryNarrowed(), librarySearching(t, probe, true))
	fx.driver.tables["content_items"] = []map[string]any{
		indexedItem(libraryOwnerItem(mine, fx.person), "doc_mine"),
		indexedItem(libraryOwnerItem(theirs, stranger), "doc_theirs"),
	}
	probe.answers(searchPassageOf("doc_mine", 4))

	if w := fx.search("q=photosynthesis"); w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
	}

	body := probe.body(t)
	documents, ok := body["document_ids"].([]any)
	if !ok {
		t.Fatalf("the engine was asked without a document filter, so top-k is computed "+
			"over passages this caller cannot see: %v", body)
	}
	if len(documents) != 1 || documents[0] != "doc_mine" {
		t.Fatalf("want the caller's documents alone, got %v", documents)
	}
}

func TestSearchNeverAsksTheEngineWhenNothingIsReachable(t *testing.T) {
	probe := newSearchProbe(t)
	theirs, stranger := uuid.New(), uuid.New()

	fx := newGatedFixture(t, libraryNarrowed(), librarySearching(t, probe, true))
	fx.driver.tables["content_items"] = []map[string]any{
		indexedItem(libraryOwnerItem(theirs, stranger), "doc_theirs"),
	}

	w := fx.search("q=photosynthesis")
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
	}
	if calls := probe.calls.Load(); calls != 0 {
		t.Fatalf("an empty document filter reads to the engine as no filter at all, so it "+
			"must not be sent; the engine was called %d times", calls)
	}
	if documents := searchDocumentsOf(t, w); len(documents) != 0 {
		t.Fatalf("want no passages, got %v", documents)
	}
}

func TestSearchWithTheFlagOffRefusesRatherThanAnsweringEmpty(t *testing.T) {
	probe := newSearchProbe(t)

	fx := newGatedFixture(t, librarySearching(t, probe, false))

	w := fx.search("q=photosynthesis")
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("want 503, got %d: %s", w.Code, w.Body.String())
	}
	if code := searchBodyOf(t, w)["code"]; code != SearchDisabledCode {
		t.Fatalf("want %q, got %v", SearchDisabledCode, code)
	}
	if calls := probe.calls.Load(); calls != 0 {
		t.Fatalf("the engine was called %d times with the flag off", calls)
	}
}

func TestSearchWhenTheEngineCannotBeReachedSaysSo(t *testing.T) {
	probe := newSearchProbe(t)
	mine := uuid.New()

	fx := newGatedFixture(t, libraryNarrowed(), librarySearching(t, probe, true))
	fx.driver.tables["content_items"] = []map[string]any{
		indexedItem(libraryOwnerItem(mine, fx.person), "doc_mine"),
	}
	probe.server.Close()

	w := fx.search("q=photosynthesis")
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("an unreachable engine must not read as an empty library; want 503, "+
			"got %d: %s", w.Code, w.Body.String())
	}
	if code := searchBodyOf(t, w)["code"]; code != SearchUnavailableCode {
		t.Fatalf("want %q, got %v", SearchUnavailableCode, code)
	}
}

func TestSearchDoesNotRetryAScopeTheEngineRefused(t *testing.T) {
	probe := newSearchProbe(t)
	mine := uuid.New()

	fx := newGatedFixture(t, libraryNarrowed(), librarySearching(t, probe, true))
	fx.driver.tables["content_items"] = []map[string]any{
		indexedItem(libraryOwnerItem(mine, fx.person), "doc_mine"),
	}
	probe.refuses(http.StatusForbidden)

	w := fx.search("q=photosynthesis")
	if w.Code != http.StatusBadGateway {
		t.Fatalf("want 502, got %d: %s", w.Code, w.Body.String())
	}
	if code := searchBodyOf(t, w)["code"]; code != SearchRefusedCode {
		t.Fatalf("want %q, got %v", SearchRefusedCode, code)
	}
	if calls := probe.calls.Load(); calls != 1 {
		t.Fatalf("a refused scope was retried, which would widen the answer: %d calls", calls)
	}
}

func TestSearchRefusesWithoutAQuery(t *testing.T) {
	probe := newSearchProbe(t)
	fx := newGatedFixture(t, libraryNarrowed(), librarySearching(t, probe, true))

	if w := fx.search("top_k=5"); w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d: %s", w.Code, w.Body.String())
	}
	if calls := probe.calls.Load(); calls != 0 {
		t.Fatalf("the engine was called %d times without a query", calls)
	}
}

func TestSearchNarrowsToTheDocumentsACurriculumNodeResolvesTo(t *testing.T) {
	probe := newSearchProbe(t)
	node, curriculum := uuid.New(), uuid.New()
	mine, theirs, stranger := uuid.New(), uuid.New(), uuid.New()

	fx := newGatedFixture(t, librarySearching(t, probe, true))
	fx.driver.tables["curriculum_nodes"] = []map[string]any{
		{"id": node, "curriculum_id": curriculum},
	}
	fx.driver.tables["content_placements"] = []map[string]any{{
		"id":                 uuid.New(),
		"content_item_id":    mine,
		"curriculum_node_id": node,
		"curriculum_id":      curriculum,
		"status":             string(entcontentplacement.StatusConfirmed),
		"grain":              string(entcontentplacement.GrainNode),
		"page_start":         int64(10),
		"page_end":           int64(20),
	}}
	fx.driver.tables["content_items"] = []map[string]any{
		indexedItem(libraryOwnerItem(mine, fx.person), "doc_mine"),
		indexedItem(libraryOwnerItem(theirs, stranger), "doc_theirs"),
	}
	probe.answers(searchPassageOf("doc_mine", 12), searchPassageOf("doc_mine", 90))

	w := fx.search("q=photosynthesis&curriculum_node_id=" + node.String())
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
	}

	body := probe.body(t)
	documents, ok := body["document_ids"].([]any)
	if !ok || len(documents) != 1 || documents[0] != "doc_mine" {
		t.Fatalf("the curriculum join did not become a document filter: %v", body)
	}
	if pages, ok := body["page_range"].([]any); !ok || len(pages) != 2 {
		t.Fatalf("the placement's page range was not sent: %v", body)
	}
	if dropped := searchDropsOf(t, w, "out_of_scope"); dropped != 1 {
		t.Fatalf("a passage outside the placed pages was not dropped: out_of_scope=%d", dropped)
	}
	if documents := searchDocumentsOf(t, w); len(documents) != 1 {
		t.Fatalf("want one passage inside the placed pages, got %v", documents)
	}
}
