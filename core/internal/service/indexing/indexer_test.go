package indexing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/retrieval"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

const indexDigest = "b7f2c1a4d9e60358b7f2c1a4d9e60358b7f2c1a4d9e60358b7f2c1a4d9e60358"

const indexBody = "%PDF-1.4 a small pretend textbook"

type capture struct {
	ingests int
	polls   int
	query   url.Values
	tenant  string
	body    string
	content string
}

type stubEngine struct {
	server *httptest.Server
	seen   *capture
}

func (s *stubEngine) Close() { s.server.Close() }

func newStubEngine(t *testing.T, terminal map[string]any) *stubEngine {
	t.Helper()

	seen := &capture{}
	mux := http.NewServeMux()
	mux.HandleFunc("/ingest/file", func(w http.ResponseWriter, r *http.Request) {
		seen.ingests++
		seen.query = r.URL.Query()
		seen.tenant = r.Header.Get(tenantHeader)
		seen.content = r.Header.Get("Content-Type")
		raw := make([]byte, 1<<16)
		n, _ := r.Body.Read(raw)
		seen.body = string(raw[:n])
		writeJSON(w, http.StatusOK, map[string]any{"job_id": "job_abc123", "status": "queued"})
	})
	mux.HandleFunc("/ingest/", func(w http.ResponseWriter, r *http.Request) {
		seen.polls++
		writeJSON(w, http.StatusOK, terminal)
	})

	stub := &stubEngine{server: httptest.NewServer(mux), seen: seen}
	t.Cleanup(stub.Close)
	return stub
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

type stubStore struct {
	url string
	err error
}

func (s stubStore) PresignGet(_ context.Context, key string, _ time.Duration) (string, error) {
	if s.err != nil {
		return "", s.err
	}
	return s.url + "/" + key, nil
}

func newObjectServer(t *testing.T) stubStore {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(indexBody))
	}))
	t.Cleanup(srv.Close)
	return stubStore{url: srv.URL}
}

type indexFixture struct {
	client  *tenantent.Client
	ctx     context.Context
	school  uuid.UUID
	item    uuid.UUID
	owner   uuid.UUID
	indexer *Indexer
	engine  *stubEngine
	store   stubStore
}

type fixtureOpt func(*tenantent.ContentItemCreate) *tenantent.ContentItemCreate

func newIndexFixture(t *testing.T, terminal map[string]any, opts ...fixtureOpt) *indexFixture {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client

	tag := uuid.New().String()[:8]
	owner := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Index").
		SetDisplayName("Index Owner " + tag).
		SaveX(ctx)

	asset := client.Asset.Create().
		SetStorageKey("library/index/" + tag).
		SetFileName("textbook.pdf").
		SetMimeType("application/pdf").
		SetSizeBytes(int64(len(indexBody))).
		SetSha256(indexDigest).
		SetStatus("ready").
		SaveX(ctx)

	create := client.ContentItem.Create().
		SetTitle("Indexable Atlas " + tag).
		SetKind(entcontentitem.KindBook).
		SetAudience(entcontentitem.AudienceSchool).
		SetStatus(entcontentitem.StatusPublished).
		SetOwnerPersonID(owner.ID).
		SetAssetID(asset.ID)
	for _, opt := range opts {
		create = opt(create)
	}
	item := create.SaveX(ctx)

	engine := newStubEngine(t, terminal)
	client4, err := NewClient(ClientConfig{BaseURL: engine.server.URL, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("could not build an engine client: %v", err)
	}
	indexer, err := NewIndexer(client4, Options{PollInterval: time.Millisecond, PollTimeout: 2 * time.Second})
	if err != nil {
		t.Fatalf("could not build an indexer: %v", err)
	}

	return &indexFixture{
		client:  client,
		ctx:     ctx,
		school:  uuid.New(),
		item:    item.ID,
		owner:   owner.ID,
		indexer: indexer,
		engine:  engine,
		store:   newObjectServer(t),
	}
}

func (fx *indexFixture) index(t *testing.T) (Outcome, error) {
	t.Helper()
	return fx.indexer.Index(fx.ctx, fx.client, Request{
		Tenant:   "demo-school",
		SchoolID: fx.school,
		ItemID:   fx.item,
		Store:    fx.store,
	})
}

func (fx *indexFixture) reload(t *testing.T) *tenantent.ContentItem {
	t.Helper()
	row, err := fx.client.ContentItem.Get(fx.ctx, fx.item)
	if err != nil {
		t.Fatalf("could not reread the content item: %v", err)
	}
	return row
}

func indexedResult() map[string]any {
	return map[string]any{
		"id": "job_abc123", "status": StatusIndexed, "phase": "done",
		"result": map[string]any{
			"document_id": "doc_4f21aa90bc31", "title": "Indexable Atlas",
			"chunks": 812, "blocks": 214, "sections": 12,
		},
	}
}

func TestIndexerSendsTheLabelsTheItemComputes(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("indexing a published item failed: %v", err)
	}

	want, err := retrieval.LabelsFor(retrieval.Item{
		SchoolID: fx.school,
		Audience: entcontentitem.AudienceSchool,
		Status:   entcontentitem.StatusPublished,
	})
	if err != nil {
		t.Fatalf("the label vocabulary refused the fixture: %v", err)
	}

	got := fx.engine.seen.query["restricted_to"]
	if !slices.Equal(got, want) {
		t.Fatalf("the engine was sent restricted_to %v, want %v", got, want)
	}
	if len(got) != 2 || !strings.HasPrefix(got[0], "unrestricted_") || !strings.HasPrefix(got[1], "school_") {
		t.Fatalf("the labels were not the wildcard plus the audience label: %v", got)
	}
	if scope := fx.engine.seen.query.Get("scope"); scope != scopeSchool {
		t.Fatalf("the ingest was sent with scope %q, want %q", scope, scopeSchool)
	}
	if name := fx.engine.seen.query.Get("filename"); name != "textbook.pdf" {
		t.Fatalf("the engine routes on the extension and was sent filename %q", name)
	}
	if tenant := fx.engine.seen.tenant; tenant != "demo-school" {
		t.Fatalf("the ingest was stamped with tenant %q, want the CAS slug", tenant)
	}
	if fx.engine.seen.body != indexBody {
		t.Fatalf("the engine received %q, not the asset's bytes", fx.engine.seen.body)
	}

	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("the outcome was %q, want indexed", out.Status)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusIndexed {
		t.Fatalf("index_status is %q, want indexed", row.IndexStatus)
	}
	if row.EngineDocumentID == nil || *row.EngineDocumentID != "doc_4f21aa90bc31" {
		t.Fatalf("engine_document_id is %v, want the engine's id", row.EngineDocumentID)
	}
	if row.IndexedSha256 == nil || *row.IndexedSha256 != indexDigest {
		t.Fatalf("indexed_sha256 is %v, want the asset digest", row.IndexedSha256)
	}
	if row.IndexedAt == nil {
		t.Fatal("indexed_at was never stamped, so nothing can tell when this was indexed")
	}
	if row.Status != entcontentitem.StatusPublished {
		t.Fatalf("indexing changed the catalogue status to %q", row.Status)
	}
}

func TestIndexerLeavesTheItemPublishedWhenTheEngineIsDown(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())
	fx.engine.Close()

	_, err := fx.index(t)
	if !errors.Is(err, ErrEngineUnreachable) {
		t.Fatalf("a dead engine gave %v, want ErrEngineUnreachable", err)
	}

	row := fx.reload(t)
	if row.Status != entcontentitem.StatusPublished {
		t.Fatalf("the publish was rolled back to %q; the catalogue is the source of truth", row.Status)
	}
	if row.IndexStatus != entcontentitem.IndexStatusFailed {
		t.Fatalf("index_status is %q, want failed", row.IndexStatus)
	}
	if row.EngineDocumentID != nil {
		t.Fatalf("a failed push left an engine_document_id %v behind", row.EngineDocumentID)
	}
	if row.IndexedSha256 != nil || row.IndexedAt != nil {
		t.Fatal("a failed push left index bookkeeping behind, which would read as indexed")
	}
}

func TestIndexerRefusesRatherThanIndexingUnrestricted(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	mux := http.NewServeMux()
	mux.HandleFunc("/ingest/file", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusConflict, map[string]any{
			"detail": "refusing to restrict this document: no scopes authorizer is configured",
		})
	})
	fx.engine.server.Config.Handler = mux

	_, err := fx.index(t)
	if !errors.Is(err, ErrGateUnenforceable) {
		t.Fatalf("a 409 from the gate check gave %v, want ErrGateUnenforceable", err)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusFailed {
		t.Fatalf("index_status is %q, want failed", row.IndexStatus)
	}
	if row.EngineDocumentID != nil {
		t.Fatal("a refused gate must not leave a document id: nothing was indexed")
	}
}

func TestIndexerWillNotPushAnUnpublishedItem(t *testing.T) {
	fx := newIndexFixture(t, indexedResult(), func(c *tenantent.ContentItemCreate) *tenantent.ContentItemCreate {
		return c.SetStatus(entcontentitem.StatusDraft)
	})

	_, err := fx.index(t)
	if !errors.Is(err, retrieval.ErrNotPublished) {
		t.Fatalf("a draft gave %v, want ErrNotPublished", err)
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatalf("a draft was sent to the engine %d times", fx.engine.seen.ingests)
	}
}

func TestIndexerKeepsAParkedUploadOutOfTheIndexedState(t *testing.T) {
	fx := newIndexFixture(t, map[string]any{
		"id": "job_abc123", "status": StatusPendingConfirmation, "phase": "done",
		"result": map[string]any{"pending_id": "doc_parked00001", "title": "Indexable Atlas"},
	})

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("a parked upload returned an error: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusParked {
		t.Fatalf("a parked upload settled as %q, want parked", out.Status)
	}

	row := fx.reload(t)
	if row.EngineDocumentID != nil {
		t.Fatalf("a pending id %v was written as an engine document id; no documents route serves it",
			row.EngineDocumentID)
	}
	if row.IndexStatus == entcontentitem.IndexStatusPending {
		t.Fatal("a parked upload was recorded as pending, which is indistinguishable from a row an " +
			"old process orphaned, so the sweep will push it again for nothing")
	}
	if row.IndexStatus != entcontentitem.IndexStatusParked {
		t.Fatalf("index_status is %q, want parked", row.IndexStatus)
	}
	if row.IndexedAt != nil || row.IndexedSha256 != nil {
		t.Fatalf("a parked upload was stamped as indexed at %v with digest %v; nothing of it is "+
			"retrievable yet", row.IndexedAt, row.IndexedSha256)
	}
}

func TestIndexerTreatsADuplicateAsIndexed(t *testing.T) {
	fx := newIndexFixture(t, map[string]any{
		"id": "job_abc123", "status": StatusDuplicate, "phase": "done",
		"result": map[string]any{
			"document_id": "doc_4f21aa90bc31", "collides_with_state": "indexed",
		},
	})

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("a duplicate returned an error: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("a duplicate settled as %q; the bytes are in the engine under that id", out.Status)
	}

	row := fx.reload(t)
	if row.EngineDocumentID == nil || *row.EngineDocumentID != "doc_4f21aa90bc31" {
		t.Fatalf("a duplicate did not adopt the existing document id: %v", row.EngineDocumentID)
	}
}

func TestIndexerMarksAFailedJobFailed(t *testing.T) {
	fx := newIndexFixture(t, map[string]any{
		"id": "job_abc123", "status": StatusFailed, "phase": "failed",
		"error": "the PDF could not be parsed",
	})

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("a failed job returned a transport error: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusFailed {
		t.Fatalf("a failed job settled as %q, want failed", out.Status)
	}

	row := fx.reload(t)
	if row.Status != entcontentitem.StatusPublished {
		t.Fatalf("a failed job unpublished the item, leaving it %q", row.Status)
	}
	if row.IndexStatus != entcontentitem.IndexStatusFailed {
		t.Fatalf("index_status is %q, want failed", row.IndexStatus)
	}
}

func TestIndexerPollsUntilTheJobSettles(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	running := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/ingest/file", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"job_id": "job_abc123", "status": "queued"})
	})
	mux.HandleFunc("/ingest/", func(w http.ResponseWriter, _ *http.Request) {
		running++
		if running < 3 {
			writeJSON(w, http.StatusOK, map[string]any{
				"id": "job_abc123", "status": StatusRunning, "phase": "embedding",
			})
			return
		}
		writeJSON(w, http.StatusOK, indexedResult())
	})
	fx.engine.server.Config.Handler = mux

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("polling a slow job failed: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("a slow job settled as %q, want indexed", out.Status)
	}
	if running < 3 {
		t.Fatalf("the indexer polled %d times; it did not wait for a terminal status", running)
	}
}

func TestIndexerStrandsNothingInPending(t *testing.T) {
	cases := []struct {
		name  string
		setup func(*indexFixture)
	}{
		{
			name: "the item was unpublished before the worker reached it",
			setup: func(fx *indexFixture) {
				fx.client.ContentItem.UpdateOneID(fx.item).
					SetStatus(entcontentitem.StatusArchived).
					ExecX(fx.ctx)
			},
		},
		{
			name: "the object store cannot hand over the bytes",
			setup: func(fx *indexFixture) {
				fx.store = stubStore{err: errors.New("no credentials for this school")}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newIndexFixture(t, indexedResult())
			if err := MarkPending(fx.ctx, fx.client, fx.item); err != nil {
				t.Fatalf("could not mark the item pending: %v", err)
			}
			tc.setup(fx)

			if _, err := fx.index(t); err == nil {
				t.Fatal("this case was meant to fail and did not")
			}

			row := fx.reload(t)
			if row.IndexStatus == entcontentitem.IndexStatusPending {
				t.Fatal("the item was left in pending, which nothing re-drives and nothing leaves")
			}
			if row.IndexStatus != entcontentitem.IndexStatusFailed {
				t.Fatalf("index_status is %q, want failed", row.IndexStatus)
			}
		})
	}
}

func (fx *indexFixture) curriculum(t *testing.T) uuid.UUID {
	t.Helper()

	tag := uuid.NewString()[:8]
	today := time.Now().UTC()
	session := fx.client.AcademicSession.Create().
		SetName("Index Session " + tag).
		SetCode("IXS-" + tag).
		SetStartDate(today.AddDate(0, -1, 0)).
		SetEndDate(today.AddDate(1, 0, 0)).
		SaveX(fx.ctx)
	subject := fx.client.Subject.Create().
		SetName("Index Subject " + tag).
		SetCode("IXU-" + tag).
		SaveX(fx.ctx)
	grade := fx.client.GradeLevel.Create().
		SetName("Index Grade " + tag).
		SetCode("IXG-" + tag).
		SetSequence(1).
		SaveX(fx.ctx)

	return fx.client.Curriculum.Create().
		SetName("Index Curriculum " + tag).
		SetCode("IXC-" + tag).
		SetAcademicSessionID(session.ID).
		SetSubjectID(subject.ID).
		SetGradeLevelID(grade.ID).
		SaveX(fx.ctx).ID
}

func (fx *indexFixture) chapter(t *testing.T, curriculum uuid.UUID, sequence int) uuid.UUID {
	t.Helper()

	return fx.client.CurriculumNode.Create().
		SetCurriculumID(curriculum).
		SetKind(entnode.KindChapter).
		SetTitle("Index Chapter " + strconv.Itoa(sequence)).
		SetSequence(sequence).
		SaveX(fx.ctx).ID
}

func (fx *indexFixture) placeOnChapter(t *testing.T, curriculum, node uuid.UUID,
	status entplacement.Status) {

	t.Helper()

	fx.client.ContentPlacement.Create().
		SetCurriculumID(curriculum).
		SetContentItemID(fx.item).
		SetCurriculumNodeID(node).
		SetGrain(entplacement.GrainNode).
		SetStatus(status).
		SaveX(fx.ctx)
}

func (fx *indexFixture) placeOnWholeCurriculum(t *testing.T, curriculum uuid.UUID) {
	t.Helper()

	fx.client.ContentPlacement.Create().
		SetCurriculumID(curriculum).
		SetContentItemID(fx.item).
		SetGrain(entplacement.GrainCurriculum).
		SetStatus(entplacement.StatusConfirmed).
		SaveX(fx.ctx)
}

func (fx *indexFixture) chaptersSent(t *testing.T) []string {
	t.Helper()

	sent, present := fx.engine.seen.query[curriculumNodesParam]
	if !present {
		t.Fatalf("the ingest carried no %s key at all; the engine cannot tell "+
			"'placed nowhere' from 'this caller does not send placements'", curriculumNodesParam)
	}
	if len(sent) != 1 {
		t.Fatalf("%s was sent %d times, want one JSON array: %v", curriculumNodesParam, len(sent), sent)
	}

	var nodes []string
	if err := json.Unmarshal([]byte(sent[0]), &nodes); err != nil {
		t.Fatalf("%s was sent as %q, which is not a JSON array: %v", curriculumNodesParam, sent[0], err)
	}
	if nodes == nil {
		t.Fatalf("%s decoded to null rather than an array; an item placed nowhere "+
			"must still send []", curriculumNodesParam)
	}
	return nodes
}

func TestIndexerSendsOnlyConfirmedChapterPlacements(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	curriculum := fx.curriculum(t)
	first := fx.chapter(t, curriculum, 1)
	second := fx.chapter(t, curriculum, 2)
	proposed := fx.chapter(t, curriculum, 3)
	rejected := fx.chapter(t, curriculum, 4)

	fx.placeOnChapter(t, curriculum, first, entplacement.StatusConfirmed)
	fx.placeOnChapter(t, curriculum, second, entplacement.StatusConfirmed)
	fx.placeOnChapter(t, curriculum, first, entplacement.StatusConfirmed)
	fx.placeOnChapter(t, curriculum, proposed, entplacement.StatusProposed)
	fx.placeOnChapter(t, curriculum, rejected, entplacement.StatusRejected)
	fx.placeOnWholeCurriculum(t, curriculum)

	if _, err := fx.index(t); err != nil {
		t.Fatalf("indexing a placed item failed: %v", err)
	}

	want := []string{first.String(), second.String()}
	slices.Sort(want)

	got := fx.chaptersSent(t)
	if !slices.Equal(got, want) {
		t.Fatalf("the engine was sent chapters %v, want the confirmed ones %v", got, want)
	}
	if !slices.IsSorted(got) {
		t.Fatalf("the chapters were sent unsorted (%v), so two ingests of the same "+
			"item are not comparable", got)
	}
	if slices.Contains(got, proposed.String()) {
		t.Fatal("a proposed placement was sent: nobody has accepted that suggestion, " +
			"so it must not steer retrieval")
	}
	if slices.Contains(got, rejected.String()) {
		t.Fatal("a rejected placement was sent: somebody refused that chapter")
	}

	labels := fx.engine.seen.query["restricted_to"]
	for _, node := range got {
		if slices.Contains(labels, node) {
			t.Fatalf("chapter %s leaked into restricted_to %v, which is the access gate, "+
				"not a classification facet", node, labels)
		}
	}
	if len(labels) != 2 {
		t.Fatalf("restricted_to carries %d labels (%v); placements changed who can read "+
			"this document", len(labels), labels)
	}
}

func TestIndexerSendsAnEmptyArrayForAnItemPlacedNowhere(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	if _, err := fx.index(t); err != nil {
		t.Fatalf("indexing an unplaced item failed: %v", err)
	}

	got := fx.chaptersSent(t)
	if len(got) != 0 {
		t.Fatalf("an item with no placements was sent chapters %v", got)
	}
	if raw := fx.engine.seen.query.Get(curriculumNodesParam); raw != "[]" {
		t.Fatalf("%s was sent as %q, want []", curriculumNodesParam, raw)
	}
}

func TestIndexerSendsNoChaptersWhenNothingIsConfirmed(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	curriculum := fx.curriculum(t)
	fx.placeOnChapter(t, curriculum, fx.chapter(t, curriculum, 1), entplacement.StatusProposed)
	fx.placeOnChapter(t, curriculum, fx.chapter(t, curriculum, 2), entplacement.StatusRejected)
	fx.placeOnWholeCurriculum(t, curriculum)

	if _, err := fx.index(t); err != nil {
		t.Fatalf("indexing an item with no confirmed chapter failed: %v", err)
	}

	got := fx.chaptersSent(t)
	if len(got) != 0 {
		t.Fatalf("chapters %v were sent although no placement is confirmed and one "+
			"placement is whole-curriculum, which carries no node", got)
	}
}

func emptyIndexResult(counts map[string]any) map[string]any {
	result := map[string]any{"document_id": "doc_empty0000001", "title": "Indexable Atlas"}
	for key, value := range counts {
		result[key] = value
	}
	return map[string]any{
		"id": "job_abc123", "status": StatusIndexed, "phase": "done", "result": result,
	}
}

func TestIndexerRefusesToCallAnEmptyIndexIndexed(t *testing.T) {
	fx := newIndexFixture(t, emptyIndexResult(map[string]any{"chunks": 0, "blocks": 0}))

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("an empty index returned a transport error: %v", err)
	}
	if out.Status == entcontentitem.IndexStatusIndexed {
		t.Fatal("a document the engine built 0 chunks from was called indexed; it answers no " +
			"query, and a teacher searching it cannot tell that from a query that simply missed")
	}
	if out.Status != entcontentitem.IndexStatusFailed {
		t.Fatalf("an empty index settled as %q, want failed", out.Status)
	}
	if out.DocumentID != "" {
		t.Fatalf("an empty index carried document id %q forward, which retrieves nothing",
			out.DocumentID)
	}
	if !strings.Contains(out.Reason, "no text") {
		t.Fatalf("the reason %q does not say what happened to whoever reads it", out.Reason)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusFailed {
		t.Fatalf("index_status is %q, want failed", row.IndexStatus)
	}
	if row.EngineDocumentID != nil {
		t.Fatalf("an empty index left engine_document_id %v behind, so search would scope to a "+
			"document with nothing in it", row.EngineDocumentID)
	}
	if row.IndexedAt != nil || row.IndexedSha256 != nil {
		t.Fatalf("an empty index was stamped as indexed at %v with digest %v",
			row.IndexedAt, row.IndexedSha256)
	}
	if row.Status != entcontentitem.StatusPublished {
		t.Fatalf("an empty index unpublished the item, leaving it %q", row.Status)
	}
}

func TestIndexerNamesTheBlocksWhenAParsedFileYieldedNoChunks(t *testing.T) {
	fx := newIndexFixture(t, emptyIndexResult(map[string]any{"chunks": 0, "blocks": 214}))

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("a chunkless index returned a transport error: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusFailed {
		t.Fatalf("a document with 214 blocks and 0 chunks settled as %q; chunks are what "+
			"retrieval matches, so nothing of it is reachable", out.Status)
	}
	if !strings.Contains(out.Reason, "214") {
		t.Fatalf("the reason %q does not name the 214 blocks that did parse, which is what "+
			"separates an unreadable scan from a failed text extraction", out.Reason)
	}
}

func TestIndexerKeepsADocumentWithChunksIndexed(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("indexing a real document failed: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("a document the engine built 812 chunks from settled as %q, want indexed: %s",
			out.Status, out.Reason)
	}
	if out.DocumentID != "doc_4f21aa90bc31" {
		t.Fatalf("the outcome carries document id %q, want the engine's", out.DocumentID)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusIndexed {
		t.Fatalf("index_status is %q, want indexed", row.IndexStatus)
	}
}

func TestIndexerReadsAnAbsentChunkCountAsUnknownNotZero(t *testing.T) {
	fx := newIndexFixture(t, emptyIndexResult(nil))

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("an engine that reports no counts returned a transport error: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("a result that carries no chunk count settled as %q; an absent count is not a "+
			"count of zero, and reading it as one fails every document an older engine indexes: %s",
			out.Status, out.Reason)
	}
	if out.DocumentID != "doc_empty0000001" {
		t.Fatalf("the outcome carries document id %q, want the engine's", out.DocumentID)
	}
}

func TestIndexerTreatsADuplicateWithoutCountsAsIndexed(t *testing.T) {
	fx := newIndexFixture(t, map[string]any{
		"id": "job_abc123", "status": StatusDuplicate, "phase": "done",
		"result": map[string]any{
			"document_id": "doc_4f21aa90bc31", "collides_with_state": "indexed",
		},
	})

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("a duplicate returned a transport error: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("a duplicate settled as %q; its result never carries chunk counts, and reading "+
			"that silence as zero would fail every re-upload of a document the engine already "+
			"holds: %s", out.Status, out.Reason)
	}

	row := fx.reload(t)
	if row.EngineDocumentID == nil || *row.EngineDocumentID != "doc_4f21aa90bc31" {
		t.Fatalf("a duplicate did not adopt the existing document id: %v", row.EngineDocumentID)
	}
}

func TestIndexerRefusesADuplicateOfAnEmptyDocument(t *testing.T) {
	fx := newIndexFixture(t, map[string]any{
		"id": "job_abc123", "status": StatusDuplicate, "phase": "done",
		"result": map[string]any{
			"document_id": "doc_empty0000001", "collides_with_state": "indexed",
			"chunks": 0, "blocks": 0,
		},
	})

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("a duplicate of an empty document returned a transport error: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusFailed {
		t.Fatalf("a duplicate that says it holds 0 chunks settled as %q; adopting that document "+
			"id would scope every search of this item to an empty document", out.Status)
	}
}

func TestIndexerReadsANullChunkCountAsUnknown(t *testing.T) {
	fx := newIndexFixture(t, emptyIndexResult(map[string]any{"chunks": nil, "blocks": nil}))

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("a null chunk count returned a transport error: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("a null chunk count settled as %q; JSON null is the engine declining to say, "+
			"not a count of zero: %s", out.Status, out.Reason)
	}
}
