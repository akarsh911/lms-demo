package indexing

import (
	"errors"
	"testing"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
)

func heldResult() map[string]any {
	return map[string]any{
		"id": "job_abc123", "status": StatusHeld, "phase": "held",
		"result": map[string]any{"document_id": "doc_held00000001", "title": "Indexable Atlas"},
	}
}

func deferred() fixtureOpt {
	return func(c *tenantent.ContentItemCreate) *tenantent.ContentItemCreate {
		return c.SetIngestMode(entcontentitem.IngestModeDefer)
	}
}

func (fx *indexFixture) itemWithAsset(t *testing.T, filename string,
	mode entcontentitem.IngestMode) uuid.UUID {

	t.Helper()

	tag := uuid.New().String()[:8]
	asset := fx.client.Asset.Create().
		SetStorageKey("library/index/" + tag).
		SetFileName(filename).
		SetMimeType("application/octet-stream").
		SetSizeBytes(int64(len(indexBody))).
		SetSha256(indexDigest).
		SetStatus("ready").
		SaveX(fx.ctx)

	return fx.client.ContentItem.Create().
		SetTitle("Held Atlas " + tag).
		SetKind(entcontentitem.KindBook).
		SetAudience(entcontentitem.AudienceSchool).
		SetStatus(entcontentitem.StatusPublished).
		SetOwnerPersonID(fx.owner).
		SetAssetID(asset.ID).
		SetIngestMode(mode).
		SaveX(fx.ctx).ID
}

func (fx *indexFixture) indexItem(t *testing.T, id uuid.UUID) (Outcome, error) {
	t.Helper()
	return fx.indexer.Index(fx.ctx, fx.client, Request{
		Tenant:   "demo-school",
		SchoolID: fx.school,
		ItemID:   id,
		Store:    fx.store,
	})
}

func TestIngestModeDefaultsToNowOnTheWire(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	if row := fx.reload(t); row.IngestMode != entcontentitem.IngestModeNow {
		t.Fatalf("a freshly created item is %q, want the existing behaviour %q",
			row.IngestMode, entcontentitem.IngestModeNow)
	}

	if _, err := fx.index(t); err != nil {
		t.Fatalf("indexing an item that says nothing about mode failed: %v", err)
	}

	sent, present := fx.engine.seen.query[modeParam]
	if !present {
		t.Fatalf("the ingest carried no %s at all; the engine's own default is now, but "+
			"emerge-core must say which door it took", modeParam)
	}
	if len(sent) != 1 || sent[0] != ModeNow {
		t.Fatalf("%s was sent as %v, want exactly one %q", modeParam, sent, ModeNow)
	}
}

func TestIngestModeDeferIsSentAndSettlesAsHeld(t *testing.T) {
	fx := newIndexFixture(t, heldResult(), deferred())

	out, err := fx.index(t)
	if err != nil {
		t.Fatalf("holding a PDF failed: %v", err)
	}

	if got := fx.engine.seen.query.Get(modeParam); got != ModeDefer {
		t.Fatalf("%s was sent as %q, want %q", modeParam, got, ModeDefer)
	}
	if fx.engine.seen.body != indexBody {
		t.Fatalf("the engine received %q, not the asset's bytes: a held upload still "+
			"has to hand over the file", fx.engine.seen.body)
	}
	if out.Status != entcontentitem.IndexStatusHeld {
		t.Fatalf("a held upload settled as %q, want held", out.Status)
	}

	row := fx.reload(t)
	if row.IndexStatus != entcontentitem.IndexStatusHeld {
		t.Fatalf("index_status is %q, want held", row.IndexStatus)
	}
	if row.EngineDocumentID != nil {
		t.Fatalf("a held upload wrote engine_document_id %v; no document exists until the "+
			"held run completes, and search would join on it", row.EngineDocumentID)
	}
	if row.IndexedAt != nil || row.IndexedSha256 != nil {
		t.Fatal("a held upload left index bookkeeping behind, which reads as indexed")
	}
	if row.IndexStatus == entcontentitem.IndexStatusFailed {
		t.Fatal("a held upload was recorded as failed, so the sweeper would push it again")
	}
}

func TestIngestModeDeferIsNotSweptLikeAFailure(t *testing.T) {
	if Terminal(StatusHeld) != true {
		t.Fatal("held is not terminal, so the indexer would poll a job that will never move")
	}
}

func TestIngestModeDeferRefusesANonPDFBeforeTheUpload(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	item := fx.itemWithAsset(t, "whiteboard.jpg", entcontentitem.IngestModeDefer)

	_, err := fx.indexItem(t, item)
	if !errors.Is(err, ErrDeferredNotPDF) {
		t.Fatalf("holding a photograph gave %v, want ErrDeferredNotPDF", err)
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatalf("the file was uploaded %d times before the refusal; the engine would "+
			"422 it and the bytes would have crossed the wire for nothing",
			fx.engine.seen.ingests)
	}
}

func TestIngestModeNowStillAcceptsANonPDF(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	item := fx.itemWithAsset(t, "whiteboard.jpg", entcontentitem.IngestModeNow)

	if _, err := fx.indexItem(t, item); err != nil {
		t.Fatalf("an image ingested now was refused: %v; OCR runs on the engine today", err)
	}
	if got := fx.engine.seen.query.Get(modeParam); got != ModeNow {
		t.Fatalf("%s was sent as %q, want %q", modeParam, got, ModeNow)
	}
}

func TestIngestModeDeferRefusesToDropConfirmedChapters(t *testing.T) {
	fx := newIndexFixture(t, heldResult(), deferred())

	curriculum := fx.curriculum(t)
	fx.placeOnChapter(t, curriculum, fx.chapter(t, curriculum, 1), entplacement.StatusConfirmed)

	_, err := fx.index(t)
	if !errors.Is(err, ErrDeferredPlacements) {
		t.Fatalf("a held upload carrying a confirmed chapter gave %v, want ErrDeferredPlacements", err)
	}
	if fx.engine.seen.ingests != 0 {
		t.Fatal("the upload was sent anyway; the engine answers 409 from a background " +
			"worker, where nobody who uploaded can see it")
	}
}

func TestIngestModeDeferIgnoresPlacementsThatCarryNoChapter(t *testing.T) {
	fx := newIndexFixture(t, heldResult(), deferred())

	curriculum := fx.curriculum(t)
	fx.placeOnWholeCurriculum(t, curriculum)
	fx.placeOnChapter(t, curriculum, fx.chapter(t, curriculum, 1), entplacement.StatusProposed)

	if _, err := fx.index(t); err != nil {
		t.Fatalf("a held upload was refused for placements the engine is never sent: %v", err)
	}
	if got := fx.engine.seen.query.Get(curriculumNodesParam); got != emptyJSONArray {
		t.Fatalf("%s was sent as %q with mode=defer; the engine refuses that with a 409",
			curriculumNodesParam, got)
	}
}

func TestIngestModeNowStillCarriesConfirmedChapters(t *testing.T) {
	fx := newIndexFixture(t, indexedResult())

	curriculum := fx.curriculum(t)
	chapter := fx.chapter(t, curriculum, 1)
	fx.placeOnChapter(t, curriculum, chapter, entplacement.StatusConfirmed)

	if _, err := fx.index(t); err != nil {
		t.Fatalf("indexing a placed item now failed: %v", err)
	}

	got := fx.chaptersSent(t)
	if len(got) != 1 || got[0] != chapter.String() {
		t.Fatalf("mode=now sent chapters %v, want the confirmed one %s", got, chapter)
	}
	if mode := fx.engine.seen.query.Get(modeParam); mode != ModeNow {
		t.Fatalf("%s was sent as %q, want %q", modeParam, mode, ModeNow)
	}
}
