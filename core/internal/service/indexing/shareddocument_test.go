package indexing

import (
	"testing"

	"github.com/google/uuid"

	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
)

func (fx *indexFixture) reloadItem(t *testing.T, id uuid.UUID) *tenantent.ContentItem {
	t.Helper()
	row, err := fx.client.ContentItem.Get(fx.ctx, id)
	if err != nil {
		t.Fatalf("could not reread content item %s: %v", id, err)
	}
	return row
}

func TestTwoContentItemsMayHoldTheSameEngineDocument(t *testing.T) {
	terminal := indexedResult()
	fx := newIndexFixture(t, terminal)

	first, err := fx.index(t)
	if err != nil {
		t.Fatalf("indexing the first filing failed: %v", err)
	}
	if first.DocumentID == "" {
		t.Fatal("the first filing recorded no document id, so nothing here is shared")
	}

	terminal["status"] = StatusDuplicate
	terminal["result"] = map[string]any{
		"document_id": first.DocumentID, "collides_with_state": "indexed",
	}

	second := fx.itemWithAsset(t, "textbook.pdf", entcontentitem.IngestModeNow)
	out, err := fx.indexItem(t, second)
	if err != nil {
		t.Fatalf("filing the same book to a second section failed: %v", err)
	}
	if out.Status != entcontentitem.IndexStatusIndexed {
		t.Fatalf("the second filing settled as %q, want indexed; the engine already holds "+
			"these bytes under %s: %s", out.Status, first.DocumentID, out.Reason)
	}

	for _, id := range []uuid.UUID{fx.item, second} {
		row := fx.reloadItem(t, id)
		if row.IndexStatus != entcontentitem.IndexStatusIndexed {
			t.Fatalf("content item %s is %q, want indexed", id, row.IndexStatus)
		}
		if row.EngineDocumentID == nil || *row.EngineDocumentID != first.DocumentID {
			t.Fatalf("content item %s carries document id %v, want %s; the same book filed "+
				"twice must point at the one engine document",
				id, row.EngineDocumentID, first.DocumentID)
		}
	}
}
