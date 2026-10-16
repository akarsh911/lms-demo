package indexing

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
)

const (
	promisedDocument = "doc_held00000001"
	heldTenant       = "demo-school"
)

type heldStub struct {
	server *httptest.Server

	mu        sync.Mutex
	published map[string]map[string]any
	holding   []map[string]any
	refusal   int
	digests   []string
	lists     int
	tenants   []string
}

func newHeldStub(t *testing.T) *heldStub {
	t.Helper()

	stub := &heldStub{published: map[string]map[string]any{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/documents/", stub.digest)
	mux.HandleFunc("/held", stub.list)
	stub.server = httptest.NewServer(mux)
	t.Cleanup(stub.server.Close)
	return stub
}

func (h *heldStub) digest(w http.ResponseWriter, r *http.Request) {
	id, isDigest := strings.CutSuffix(strings.TrimPrefix(r.URL.Path, "/documents/"), "/digest")

	h.mu.Lock()
	h.digests = append(h.digests, id)
	h.tenants = append(h.tenants, r.Header.Get(tenantHeader))
	refusal := h.refusal
	body, known := h.published[id]
	h.mu.Unlock()

	switch {
	case refusal != 0:
		writeJSON(w, refusal, map[string]any{"detail": "the engine is not answering"})
	case !isDigest || !known:
		writeJSON(w, http.StatusNotFound,
			map[string]any{"detail": "unknown document (or not visible to this tenant)"})
	default:
		writeJSON(w, http.StatusOK, body)
	}
}

func (h *heldStub) list(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	h.lists++
	refusal := h.refusal
	rows := h.holding
	h.mu.Unlock()

	if refusal != 0 {
		writeJSON(w, refusal, map[string]any{"detail": "the engine is not answering"})
		return
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"held": rows, "total": len(rows)})
}

func (h *heldStub) publish(id, tenant string, chunks int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.published[id] = map[string]any{
		"document_id": id, "tenant_id": tenant, "scope": "school",
		"counts":       map[string]any{"chunks": chunks, "blocks": 214, "sections": 12},
		"chunk_digest": strings.Repeat("c", 64),
	}
}

func (h *heldStub) hold(id, tenant, checksum string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.holding = append(h.holding, map[string]any{
		"document_id": id, "tenant_id": tenant, "scope": "school", "checksum": checksum,
		"title": "Held Atlas", "filename": "textbook.pdf", "requeued": false,
	})
}

func (h *heldStub) refuse(status int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.refusal = status
}

func (h *heldStub) asked() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]string(nil), h.digests...)
}

func (h *heldStub) stampedBy() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]string(nil), h.tenants...)
}

func (h *heldStub) listed() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.lists
}

type heldFixture struct {
	*sweepFixture
	engineHeld *heldStub
}

func newHeldFixture(t *testing.T) *heldFixture {
	t.Helper()

	fx := newSweepFixture(t, heldResult())
	stub := newHeldStub(t)
	fx.sweeper.held = heldClient(t, stub.server.URL)
	return &heldFixture{sweepFixture: fx, engineHeld: stub}
}

func heldClient(t *testing.T, base string) *Client {
	t.Helper()

	client, err := NewClient(ClientConfig{BaseURL: base, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("could not build an engine client: %v", err)
	}
	return client
}

func (fx *heldFixture) hold(t *testing.T, promised string, attempts int) *tenantent.ContentItem {
	t.Helper()

	update := fx.client.ContentItem.UpdateOneID(fx.item).
		SetIngestMode(entcontentitem.IngestModeDefer).
		SetIndexStatus(entcontentitem.IndexStatusHeld).
		SetIndexAttempts(attempts).
		ClearEngineDocumentID().
		ClearIndexedSha256().
		ClearIndexedAt().
		SetUpdatedAt(time.Now().UTC().Add(-3 * time.Hour))
	if promised == "" {
		update = update.ClearHeldEngineDocumentID()
	} else {
		update = update.SetHeldEngineDocumentID(promised)
	}
	if err := update.Exec(fx.ctx); err != nil {
		t.Fatalf("could not hold the item: %v", err)
	}
	return fx.reload(t)
}

func (fx *heldFixture) wantStillHeld(t *testing.T, before *tenantent.ContentItem) {
	t.Helper()

	after := fx.reload(t)
	if after.IndexStatus != entcontentitem.IndexStatusHeld {
		t.Fatalf("index_status is %q, want the item left held", after.IndexStatus)
	}
	if after.EngineDocumentID != nil {
		t.Fatalf("engine_document_id was written as %v; search joins on it and no document was "+
			"confirmed", *after.EngineDocumentID)
	}
	if after.IndexedAt != nil || after.IndexedSha256 != nil {
		t.Fatal("index bookkeeping was written on an item nothing confirmed as published")
	}
	if after.IndexAttempts != before.IndexAttempts {
		t.Fatalf("index_attempts moved from %d to %d; waiting on the GPU pipeline is not a failed "+
			"attempt", before.IndexAttempts, after.IndexAttempts)
	}
	if !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Fatalf("the row was written at %s although nothing was decided about it", after.UpdatedAt)
	}
	if promisedID(after) != promisedID(before) {
		t.Fatalf("the promised document id moved from %q to %q", promisedID(before), promisedID(after))
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatalf("the bytes were uploaded %d more times; a held book is never retried as an upload",
			fx.engine.seen.ingests)
	}
}

func TestReconcilePromotesAHeldItemOnceTheEnginePublishesIt(t *testing.T) {
	fx := newHeldFixture(t)
	fx.hold(t, promisedDocument, 3)
	fx.engineHeld.publish(promisedDocument, heldTenant, 812)

	report := fx.tick(t)

	if report.Held != 1 || report.Promoted != 1 {
		t.Fatalf("the sweep checked %d held items and promoted %d, want one of each",
			report.Held, report.Promoted)
	}
	if report.Err != nil {
		t.Fatalf("a clean promotion reported %v", report.Err)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusIndexed {
		t.Fatalf("index_status is %q after the engine published the book, want indexed", row.IndexStatus)
	}
	if row.EngineDocumentID == nil || *row.EngineDocumentID != promisedDocument {
		t.Fatalf("engine_document_id is %v, want the id the engine promised", row.EngineDocumentID)
	}
	if row.IndexedSha256 == nil || *row.IndexedSha256 != indexDigest {
		t.Fatalf("indexed_sha256 is %v, want the asset's digest", row.IndexedSha256)
	}
	if row.IndexedAt == nil {
		t.Fatal("indexed_at was left empty on a promoted item")
	}
	if row.IndexAttempts != 0 {
		t.Fatalf("a promoted item still records %d attempts", row.IndexAttempts)
	}
	if row.HeldEngineDocumentID != nil {
		t.Fatalf("the promised id %q outlived the held state", *row.HeldEngineDocumentID)
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatalf("promotion uploaded the bytes %d times; it is a question, not a push",
			fx.engine.seen.ingests)
	}

	asked := fx.engineHeld.asked()
	if len(asked) != 1 || asked[0] != promisedDocument {
		t.Fatalf("the engine was asked about %v, want the promised document once", asked)
	}
	if tenant := fx.engineHeld.stampedBy()[0]; tenant != heldTenant {
		t.Fatalf("the question was stamped with tenant %q, want the CAS slug", tenant)
	}

	if again := fx.tick(t); again.Held != 0 || again.Promoted != 0 {
		t.Fatalf("an indexed item was reconciled again: %+v", again)
	}
}

func TestReconcileLeavesAHeldItemTheEngineHasNotPublished(t *testing.T) {
	fx := newHeldFixture(t)
	before := fx.hold(t, promisedDocument, 2)
	fx.engineHeld.hold(promisedDocument, heldTenant, indexDigest)

	for round := 1; round <= 3; round++ {
		report := fx.tick(t)
		if report.Held != 1 || report.Promoted != 0 {
			t.Fatalf("round %d checked %d held items and promoted %d, want one checked and none "+
				"promoted", round, report.Held, report.Promoted)
		}
		if report.Scanned != 0 || report.Claimed != 0 {
			t.Fatalf("round %d scanned %d and claimed %d; a held item must never enter the "+
				"re-drive", round, report.Scanned, report.Claimed)
		}
	}

	fx.wantStillHeld(t, before)
	if asked := fx.engineHeld.asked(); len(asked) != 3 {
		t.Fatalf("the engine was asked %d times across three ticks, want once a tick", len(asked))
	}
}

func TestReconcileChangesNothingWhenTheEngineIsDown(t *testing.T) {
	cases := []struct {
		name string
		fail func(*heldFixture)
	}{
		{
			name: "nothing is listening",
			fail: func(fx *heldFixture) { fx.engineHeld.server.Close() },
		},
		{
			name: "the engine answers 503",
			fail: func(fx *heldFixture) { fx.engineHeld.refuse(http.StatusServiceUnavailable) },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newHeldFixture(t)
			before := fx.hold(t, promisedDocument, 1)
			fx.engineHeld.publish(promisedDocument, heldTenant, 812)
			tc.fail(fx)

			report := fx.tick(t)

			if report.Promoted != 0 {
				t.Fatalf("an unreachable engine promoted %d items", report.Promoted)
			}
			if report.Err != nil {
				t.Fatalf("an engine outage was reported as a sweep fault: %v", report.Err)
			}
			fx.wantStillHeld(t, before)
			if got := fx.reload(t).IndexStatus; got == entcontentitem.IndexStatusFailed {
				t.Fatal("an engine outage marked a held item failed, so the re-drive would upload it again")
			}
		})
	}
}

func TestReconcileStopsAskingForTheTickOnceTheEngineIsDown(t *testing.T) {
	fx := newHeldFixture(t)
	fx.hold(t, promisedDocument, 0)
	fx.anotherHeld(t, "doc_held00000002")
	fx.engineHeld.refuse(http.StatusBadGateway)

	report := fx.tick(t)

	if report.Held != 1 {
		t.Fatalf("the sweep asked about %d held items after the first answer was an outage, want 1",
			report.Held)
	}
	if asked := fx.engineHeld.asked(); len(asked) != 1 {
		t.Fatalf("the engine was asked %d times while it was down, want 1", len(asked))
	}
}

func (fx *heldFixture) anotherHeld(t *testing.T, promised string) uuid.UUID {
	t.Helper()

	id := fx.itemWithAsset(t, "second.pdf", entcontentitem.IngestModeDefer)
	err := fx.client.ContentItem.UpdateOneID(id).
		SetIndexStatus(entcontentitem.IndexStatusHeld).
		SetHeldEngineDocumentID(promised).
		Exec(fx.ctx)
	if err != nil {
		t.Fatalf("could not hold a second item: %v", err)
	}
	return id
}

func TestReconcilePromotionIsWonByExactlyOneSweeper(t *testing.T) {
	fx := newHeldFixture(t)
	row := fx.hold(t, promisedDocument, 0)

	other, err := NewSweeper(fx.tenants, fx.dispatcher, SweepOptions{}, quietLogger())
	if err != nil {
		t.Fatalf("could not build the second instance: %v", err)
	}

	tenant := fx.tenants.list[0]
	now := time.Now().UTC()

	first, err := fx.sweeper.promote(fx.ctx, tenant, row, promisedDocument, indexDigest, now)
	if err != nil {
		t.Fatalf("the first promotion failed: %v", err)
	}
	second, err := other.promote(fx.ctx, tenant, row, promisedDocument, indexDigest, now.Add(time.Second))
	if err != nil {
		t.Fatalf("the second promotion failed: %v", err)
	}

	if !first {
		t.Fatal("the first instance did not promote a held row nothing else had touched")
	}
	if second {
		t.Fatal("two instances promoted the same row from the same read")
	}

	after := fx.reload(t)
	if after.IndexStatus != entcontentitem.IndexStatusIndexed {
		t.Fatalf("index_status is %q after a promotion, want indexed", after.IndexStatus)
	}
	if !after.UpdatedAt.Equal(now.Truncate(time.Microsecond)) {
		t.Fatalf("updated_at is %s, want the first promotion's instant %s; the second one wrote",
			after.UpdatedAt.UTC(), now.Truncate(time.Microsecond))
	}
}

func TestReconcileDoesNotPromoteARowThatMovedSinceItWasRead(t *testing.T) {
	cases := []struct {
		name string
		move func(*tenantent.ContentItemUpdateOne, *tenantent.ContentItem) *tenantent.ContentItemUpdateOne
	}{
		{
			name: "it was republished and is being pushed again",
			move: func(u *tenantent.ContentItemUpdateOne, read *tenantent.ContentItem) *tenantent.ContentItemUpdateOne {
				return u.SetIndexStatus(entcontentitem.IndexStatusPending).SetUpdatedAt(read.UpdatedAt)
			},
		},
		{
			name: "the school withdrew it",
			move: func(u *tenantent.ContentItemUpdateOne, read *tenantent.ContentItem) *tenantent.ContentItemUpdateOne {
				return u.SetStatus(entcontentitem.StatusArchived).SetUpdatedAt(read.UpdatedAt)
			},
		},
		{
			name: "the engine promised it a different document",
			move: func(u *tenantent.ContentItemUpdateOne, read *tenantent.ContentItem) *tenantent.ContentItemUpdateOne {
				return u.SetHeldEngineDocumentID("doc_held99999999").SetUpdatedAt(read.UpdatedAt)
			},
		},
		{
			name: "somebody edited it",
			move: func(u *tenantent.ContentItemUpdateOne, read *tenantent.ContentItem) *tenantent.ContentItemUpdateOne {
				return u.SetTitle("Renamed while the question was in flight")
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newHeldFixture(t)
			read := fx.hold(t, promisedDocument, 0)

			if err := tc.move(fx.client.ContentItem.UpdateOneID(fx.item), read).Exec(fx.ctx); err != nil {
				t.Fatalf("could not move the row: %v", err)
			}

			promoted, err := fx.sweeper.promote(fx.ctx, fx.tenants.list[0], read,
				promisedDocument, indexDigest, time.Now().UTC())
			if err != nil {
				t.Fatalf("the promotion failed: %v", err)
			}
			if promoted {
				t.Fatal("a row that changed after it was read was promoted on the stale read")
			}

			after := fx.reload(t)
			if after.IndexStatus == entcontentitem.IndexStatusIndexed || after.EngineDocumentID != nil {
				t.Fatalf("the row became %q with document %v", after.IndexStatus, after.EngineDocumentID)
			}
		})
	}
}

func TestReconcileLeavesAHeldItemWithNoPromisedDocumentAlone(t *testing.T) {
	fx := newHeldFixture(t)
	before := fx.hold(t, "", 4)
	fx.engineHeld.publish(promisedDocument, heldTenant, 812)

	report := fx.tick(t)

	if report.Held != 0 || report.Promoted != 0 || report.Recovered != 0 {
		t.Fatalf("an item with no promised document was checked %d, promoted %d, recovered %d",
			report.Held, report.Promoted, report.Recovered)
	}
	if asked := fx.engineHeld.asked(); len(asked) != 0 {
		t.Fatalf("the engine was asked about %v; there was no id to ask about", asked)
	}
	fx.wantStillHeld(t, before)
}

func TestReconcileRecoversThePromisedDocumentFromTheEnginesHeldList(t *testing.T) {
	fx := newHeldFixture(t)
	fx.hold(t, "", 0)
	fx.engineHeld.hold("doc_other_school", "another-school", indexDigest)
	fx.engineHeld.hold(promisedDocument, heldTenant, strings.ToUpper(indexDigest))

	report := fx.tick(t)

	if report.Recovered != 1 {
		t.Fatalf("the sweep recovered %d promised ids, want 1", report.Recovered)
	}
	row := fx.reload(t)
	if got := promisedID(row); got != promisedDocument {
		t.Fatalf("the promised id is %q, want the one the engine lists for this school's bytes", got)
	}
	if row.IndexStatus != entcontentitem.IndexStatusHeld || row.EngineDocumentID != nil {
		t.Fatalf("recovering the id made the item %q with document %v; the engine is still "+
			"holding it", row.IndexStatus, row.EngineDocumentID)
	}
	if report.Held != 1 || report.Promoted != 0 {
		t.Fatalf("the recovered item was checked %d and promoted %d, want checked once and left held",
			report.Held, report.Promoted)
	}

	fx.tick(t)
	if lists := fx.engineHeld.listed(); lists != 1 {
		t.Fatalf("the held list was read %d times across two ticks, want once an hour", lists)
	}
}

func TestReconcileDoesNotReadTheHeldListWhenEveryItemHasItsPromise(t *testing.T) {
	fx := newHeldFixture(t)
	fx.hold(t, promisedDocument, 0)

	fx.tick(t)

	if lists := fx.engineHeld.listed(); lists != 0 {
		t.Fatalf("the held list was read %d times with nothing to recover", lists)
	}
}

func TestReconcileKeepsHeldADocumentPublishedWithNothingRetrievable(t *testing.T) {
	fx := newHeldFixture(t)
	before := fx.hold(t, promisedDocument, 0)
	fx.engineHeld.publish(promisedDocument, heldTenant, 0)

	if report := fx.tick(t); report.Promoted != 0 {
		t.Fatalf("an empty document was promoted; every search over it would answer nothing")
	}
	fx.wantStillHeld(t, before)
}

func TestReconcileKeepsHeldADocumentPublishedUnderAnotherTenant(t *testing.T) {
	fx := newHeldFixture(t)
	before := fx.hold(t, promisedDocument, 0)
	fx.engineHeld.publish(promisedDocument, "another-school", 812)

	report := fx.tick(t)

	if report.Promoted != 0 {
		t.Fatal("a document the engine files under another school was adopted")
	}
	if report.Err != nil {
		t.Fatalf("a refused answer was reported as a sweep fault: %v", report.Err)
	}
	fx.wantStillHeld(t, before)
}

func TestReconcileIgnoresAHeldItemTheSchoolWithdrew(t *testing.T) {
	fx := newHeldFixture(t)
	fx.hold(t, promisedDocument, 0)
	fx.engineHeld.publish(promisedDocument, heldTenant, 812)
	fx.client.ContentItem.UpdateOneID(fx.item).
		SetStatus(entcontentitem.StatusArchived).ExecX(fx.ctx)

	report := fx.tick(t)

	if report.Held != 0 || report.Promoted != 0 {
		t.Fatalf("an archived item was checked %d and promoted %d", report.Held, report.Promoted)
	}
	if asked := fx.engineHeld.asked(); len(asked) != 0 {
		t.Fatalf("the engine was asked about a withdrawn item: %v", asked)
	}
}

func TestReconcileTakesTurnsWhenASchoolHoldsMoreThanOneTickChecks(t *testing.T) {
	fx := newHeldFixture(t)
	fx.hold(t, promisedDocument, 0)
	fx.anotherHeld(t, "doc_held00000002")

	sweeper, err := NewSweeper(fx.tenants, fx.dispatcher, SweepOptions{PerTenant: 1}, quietLogger())
	if err != nil {
		t.Fatalf("could not build a sweeper: %v", err)
	}
	sweeper.held = fx.sweeper.held

	for round := 0; round < 3; round++ {
		if report := sweeper.Tick(fx.ctx); report.Held != 1 {
			t.Fatalf("tick %d checked %d held items with a per-school limit of 1", round, report.Held)
		}
	}

	asked := fx.engineHeld.asked()
	if len(asked) != 3 || asked[0] == asked[1] || asked[0] != asked[2] {
		t.Fatalf("three ticks asked about %v; the second held item must not wait behind the first "+
			"for ever, and the walk must wrap", asked)
	}
}

func TestSweeperWithNoHeldEngineAsksNothing(t *testing.T) {
	fx := newHeldFixture(t)
	before := fx.hold(t, promisedDocument, 0)
	fx.engineHeld.publish(promisedDocument, heldTenant, 812)
	fx.sweeper.held = nil

	report := fx.tick(t)

	if report.Held != 0 || report.Promoted != 0 {
		t.Fatalf("a sweeper with no engine to ask reported %+v", report)
	}
	fx.wantStillHeld(t, before)
}

func TestPublishedDocumentTellsHeldFromPublishedFromRefused(t *testing.T) {
	stub := newHeldStub(t)
	stub.publish("doc_live", heldTenant, 40)
	stub.hold("doc_waiting", heldTenant, indexDigest)
	client := heldClient(t, stub.server.URL)
	ctx := context.Background()

	live, err := client.PublishedDocument(ctx, heldTenant, "doc_live")
	if err != nil {
		t.Fatalf("a published document returned %v", err)
	}
	if live.DocumentID != "doc_live" || live.Tenant != heldTenant || live.NothingRetrievable() {
		t.Fatalf("the published document was read as %+v", live)
	}

	if _, err := client.PublishedDocument(ctx, heldTenant, "doc_waiting"); !errors.Is(err, ErrDocumentUnpublished) {
		t.Fatalf("an upload the engine is only holding gave %v, want ErrDocumentUnpublished", err)
	}
	if _, err := client.PublishedDocument(ctx, heldTenant, "doc_never"); !errors.Is(err, ErrDocumentUnpublished) {
		t.Fatalf("an unknown id gave %v, want ErrDocumentUnpublished", err)
	}
	if _, err := client.PublishedDocument(ctx, "another-school", "doc_live"); !errors.Is(err, ErrEngineRejected) {
		t.Fatalf("a document filed under another tenant gave %v, want ErrEngineRejected", err)
	}
	if _, err := client.PublishedDocument(ctx, "", "doc_live"); !errors.Is(err, ErrNoTenant) {
		t.Fatalf("a question with no tenant gave %v, want ErrNoTenant", err)
	}

	stub.refuse(http.StatusForbidden)
	if _, err := client.PublishedDocument(ctx, heldTenant, "doc_live"); !errors.Is(err, ErrEngineRejected) {
		t.Fatalf("a 403 gave %v, want ErrEngineRejected", err)
	}
	stub.refuse(http.StatusNotImplemented)
	if _, err := client.PublishedDocument(ctx, heldTenant, "doc_live"); !errors.Is(err, ErrEngineUnreachable) {
		t.Fatalf("a 501 gave %v, want ErrEngineUnreachable", err)
	}
}

func TestHeldUploadsListsOnlyTheCallersSchool(t *testing.T) {
	stub := newHeldStub(t)
	stub.hold("doc_mine", heldTenant, indexDigest)
	stub.hold("doc_theirs", "another-school", indexDigest)
	client := heldClient(t, stub.server.URL)

	uploads, err := client.HeldUploads(context.Background(), heldTenant)
	if err != nil {
		t.Fatalf("listing held uploads failed: %v", err)
	}
	if len(uploads) != 1 || uploads[0].DocumentID != "doc_mine" || uploads[0].Checksum != indexDigest {
		t.Fatalf("the list came back as %+v; an admin token sees every school's uploads, and only "+
			"this school's may be matched", uploads)
	}
}

type syncEngine struct {
	server  *httptest.Server
	ingests atomic.Int64
	polls   atomic.Int64
}

func newSyncEngine(t *testing.T, answer map[string]any) *syncEngine {
	t.Helper()

	engine := &syncEngine{}
	mux := http.NewServeMux()
	mux.HandleFunc("/ingest/file", func(w http.ResponseWriter, r *http.Request) {
		engine.ingests.Add(1)
		writeJSON(w, http.StatusOK, answer)
	})
	mux.HandleFunc("/ingest/", func(w http.ResponseWriter, r *http.Request) {
		engine.polls.Add(1)
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "unknown job"})
	})
	engine.server = httptest.NewServer(mux)
	t.Cleanup(engine.server.Close)
	return engine
}

func (fx *indexFixture) indexThrough(t *testing.T, engine *syncEngine) (Outcome, error) {
	t.Helper()

	indexer, err := NewIndexer(heldClient(t, engine.server.URL),
		Options{PollInterval: time.Millisecond, PollTimeout: 2 * time.Second})
	if err != nil {
		t.Fatalf("could not build an indexer: %v", err)
	}
	return indexer.Index(fx.ctx, fx.client, Request{
		Tenant:   heldTenant,
		SchoolID: fx.school,
		ItemID:   fx.item,
		Store:    fx.store,
	})
}

func TestIndexerRemembersTheDocumentAHeldUploadIsPromised(t *testing.T) {
	cases := []struct {
		name   string
		answer map[string]any
	}{
		{
			name: "the engine holds the upload",
			answer: map[string]any{
				"job_id": "job_abc123", "status": StatusHeld, "bytes": 33,
				"filename": "textbook.pdf", "document_id": promisedDocument,
				"collect_with": "GET /held/" + promisedDocument + "/source",
			},
		},
		{
			name: "the engine was already holding these bytes",
			answer: map[string]any{
				"job_id": "job_abc123", "status": StatusDuplicate, "bytes": 33,
				"filename": "textbook.pdf", "document_id": promisedDocument, "state": StatusHeld,
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newIndexFixture(t, heldResult(), deferred())
			engine := newSyncEngine(t, tc.answer)

			out, err := fx.indexThrough(t, engine)
			if err != nil {
				t.Fatalf("holding a PDF failed: %v", err)
			}
			if out.Status != entcontentitem.IndexStatusHeld || out.HeldDocumentID != promisedDocument {
				t.Fatalf("the upload settled as %q promising %q, want held promising %q",
					out.Status, out.HeldDocumentID, promisedDocument)
			}
			if polls := engine.polls.Load(); polls != 0 {
				t.Fatalf("a settled answer was polled %d times", polls)
			}

			row := fx.reload(t)
			if row.IndexStatus != entcontentitem.IndexStatusHeld {
				t.Fatalf("index_status is %q, want held", row.IndexStatus)
			}
			if got := promisedID(row); got != promisedDocument {
				t.Fatalf("the promised document id was recorded as %q, want %q", got, promisedDocument)
			}
			if row.EngineDocumentID != nil || row.IndexedSha256 != nil || row.IndexedAt != nil {
				t.Fatalf("a held upload wrote index bookkeeping (%v); search joins on "+
					"engine_document_id and no document exists yet", row.EngineDocumentID)
			}
		})
	}
}

func TestIndexerAdoptsADocumentTheEngineAlreadyPublishedForADeferredUpload(t *testing.T) {
	fx := newIndexFixture(t, heldResult(), deferred())
	engine := newSyncEngine(t, map[string]any{
		"job_id": "job_abc123", "status": StatusDuplicate, "bytes": 33,
		"filename": "textbook.pdf", "document_id": promisedDocument, "state": "indexed",
	})

	out, err := fx.indexThrough(t, engine)
	if err != nil {
		t.Fatalf("re-pushing a published book failed: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("a book the engine already published settled as %q (%s)", out.Status, out.Reason)
	}

	row := fx.reload(t)
	if row.EngineDocumentID == nil || *row.EngineDocumentID != promisedDocument {
		t.Fatalf("engine_document_id is %v, want the published document", row.EngineDocumentID)
	}
	if row.HeldEngineDocumentID != nil {
		t.Fatalf("an indexed item kept a promised id %q", *row.HeldEngineDocumentID)
	}
}

func TestThePromisedDocumentIsForgottenWhenAnItemLeavesHeld(t *testing.T) {
	leave := map[string]func(*heldFixture) error{
		"it is queued for another push": func(fx *heldFixture) error {
			return MarkPending(fx.ctx, fx.client, fx.item)
		},
		"the queue would not take it": func(fx *heldFixture) error {
			Abandon(fx.ctx, fx.client, fx.item, quietLogger())
			return nil
		},
		"the push failed before the engine answered": func(fx *heldFixture) error {
			return fx.indexer.markFailed(fx.ctx, fx.client, fx.item)
		},
		"the engine refused the next push": func(fx *heldFixture) error {
			return fx.indexer.record(fx.ctx, fx.client, fx.item,
				Outcome{Status: entcontentitem.IndexStatusFailed})
		},
		"the engine parked the next push": func(fx *heldFixture) error {
			return fx.indexer.record(fx.ctx, fx.client, fx.item,
				Outcome{Status: entcontentitem.IndexStatusParked})
		},
		"the next push was indexed outright": func(fx *heldFixture) error {
			return fx.indexer.record(fx.ctx, fx.client, fx.item, Outcome{
				Status: entcontentitem.IndexStatusIndexed, DocumentID: "doc_4f21aa90bc31", Sha256: indexDigest,
			})
		},
	}

	for name, move := range leave {
		t.Run(name, func(t *testing.T) {
			fx := newHeldFixture(t)
			fx.hold(t, promisedDocument, 0)

			if err := move(fx); err != nil {
				t.Fatalf("could not move the item out of held: %v", err)
			}

			row := fx.reload(t)
			if row.IndexStatus == entcontentitem.IndexStatusHeld {
				t.Fatal("the item is still held, so this case proved nothing")
			}
			if row.HeldEngineDocumentID != nil {
				t.Fatalf("an item that is %q still carries the promised id %q",
					row.IndexStatus, *row.HeldEngineDocumentID)
			}
		})
	}
}
