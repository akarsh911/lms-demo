package http

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
)

const indexingSlug = "demo-school"

type engineProbe struct {
	server     *httptest.Server
	calls      *atomic.Int64
	dispatcher *indexing.Dispatcher
}

func newEngineProbe(t *testing.T) *engineProbe {
	t.Helper()

	probe := &engineProbe{calls: &atomic.Int64{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/ingest/file", func(w http.ResponseWriter, _ *http.Request) {
		probe.calls.Add(1)
		writeProbeJSON(w, map[string]any{"job_id": "job_probe", "status": "queued"})
	})
	mux.HandleFunc("/ingest/", func(w http.ResponseWriter, _ *http.Request) {
		probe.calls.Add(1)
		writeProbeJSON(w, map[string]any{
			"id": "job_probe", "status": "indexed", "phase": "done",
			"result": map[string]any{"document_id": "doc_probe000001"},
		})
	})
	probe.server = httptest.NewServer(mux)
	t.Cleanup(probe.server.Close)
	return probe
}

func writeProbeJSON(w http.ResponseWriter, body any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

func (p *engineProbe) settle() {
	if p != nil && p.dispatcher != nil {
		p.dispatcher.Drain()
	}
}

func libraryIndexing(t *testing.T, probe *engineProbe, enabled bool) libraryOption {
	t.Helper()

	return func(fx *libraryFixture) {
		base := ""
		if probe != nil {
			base = probe.server.URL
		}
		fx.server.cfg = &config.Config{
			RetrievalIndexEnabled:  enabled,
			RetrievalEngineBaseURL: base,
		}
		fx.ctx = tenancy.WithTenant(fx.ctx, &tenancy.Tenant{
			SchoolID:    uuid.New(),
			Code:        "DEMO",
			CASTenantID: indexingSlug,
		})

		if base == "" {
			return
		}
		client, err := indexing.NewClient(indexing.ClientConfig{
			BaseURL: base,
			Timeout: 5 * time.Second,
		})
		if err != nil {
			t.Fatalf("could not build an engine client: %v", err)
		}
		indexer, err := indexing.NewIndexer(client, indexing.Options{
			PollInterval: time.Millisecond,
			PollTimeout:  2 * time.Second,
		})
		if err != nil {
			t.Fatalf("could not build an indexer: %v", err)
		}

		logger := slog.New(slog.NewJSONHandler(fx.logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
		dispatcher := indexing.NewDispatcher(indexer, 1, logger)
		probe.dispatcher = dispatcher
		UseIndexer(dispatcher)
		t.Cleanup(func() {
			dispatcher.Close()
			UseIndexer(nil)
		})
	}
}

func indexingDraftRow(item, person, asset uuid.UUID) map[string]any {
	row := libraryOwnerItem(item, person)
	row["audience"] = string(entcontentitem.AudienceSchool)
	row["asset_id"] = asset
	row["status"] = string(entcontentitem.StatusDraft)
	return row
}

func publishItem(t *testing.T, fx *libraryFixture, item uuid.UUID, body string) {
	t.Helper()

	w := fx.call(fx.server.updateLibraryItem, http.MethodPatch,
		"/api/v1/library/"+item.String(), body, item)
	if w.Code != http.StatusOK {
		t.Fatalf("the update returned %d: %s", w.Code, w.Body.String())
	}
}

func TestPublishingWithTheFlagOffNeverReachesTheEngine(t *testing.T) {
	probe := newEngineProbe(t)
	item, asset := uuid.New(), uuid.New()

	fx := newLibraryFixture(t, libraryIndexing(t, probe, false))
	fx.driver.tables["content_items"] = []map[string]any{
		indexingDraftRow(item, fx.person, asset),
	}

	publishItem(t, fx, item, `{"status":"published"}`)
	probe.settle()

	if calls := probe.calls.Load(); calls != 0 {
		t.Fatalf("the engine was called %d times with the flag off", calls)
	}
	assertNoIndexFieldsWritten(t, fx)
}

func TestPublishingWithNoEngineConfiguredNeverReachesTheEngine(t *testing.T) {
	item, asset := uuid.New(), uuid.New()

	fx := newLibraryFixture(t, libraryIndexing(t, nil, true))
	fx.driver.tables["content_items"] = []map[string]any{
		indexingDraftRow(item, fx.person, asset),
	}

	publishItem(t, fx, item, `{"status":"published"}`)
	assertNoIndexFieldsWritten(t, fx)
}

func TestPublishingWithTheFlagOnRecordsTheIntentToIndex(t *testing.T) {
	probe := newEngineProbe(t)
	item, asset := uuid.New(), uuid.New()

	fx := newLibraryFixture(t, libraryIndexing(t, probe, true))
	fx.driver.tables["content_items"] = []map[string]any{
		indexingDraftRow(item, fx.person, asset),
	}

	publishItem(t, fx, item, `{"status":"published"}`)
	probe.settle()

	if !indexStatusWritten(fx, string(entcontentitem.IndexStatusPending)) {
		t.Fatal("publishing did not record the intent to index; index_status stayed unwritten")
	}
}

func TestUpdatingAnAlreadyPublishedItemDoesNotReindex(t *testing.T) {
	probe := newEngineProbe(t)
	item, asset := uuid.New(), uuid.New()

	fx := newLibraryFixture(t, libraryIndexing(t, probe, true))
	row := indexingDraftRow(item, fx.person, asset)
	row["status"] = string(entcontentitem.StatusPublished)
	fx.driver.tables["content_items"] = []map[string]any{row}

	publishItem(t, fx, item, `{"title":"A new title"}`)
	probe.settle()

	if indexStatusWritten(fx, string(entcontentitem.IndexStatusPending)) {
		t.Fatal("editing an already published item queued it for indexing again")
	}
}

func assertNoIndexFieldsWritten(t *testing.T, fx *libraryFixture) {
	t.Helper()

	for _, field := range []string{"index_status", "engine_document_id", "indexed_at", "indexed_sha256"} {
		for _, stmt := range fx.writes("content_items") {
			if strings.Contains(stmt.query, field) {
				t.Fatalf("%q was written with indexing off: %s", field, stmt.query)
			}
		}
	}
}

func indexStatusWritten(fx *libraryFixture, want string) bool {
	for _, stmt := range fx.writes("content_items") {
		if !strings.Contains(stmt.query, "index_status") {
			continue
		}
		for _, arg := range stmt.args {
			if fmt.Sprint(arg) == want {
				return true
			}
		}
	}
	return false
}
