package http

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	entcontentplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
)

func namedItemsOf(t *testing.T, w *httptest.ResponseRecorder) [][]uuid.UUID {
	t.Helper()

	var body struct {
		Passages []struct {
			ContentItemIDs []uuid.UUID `json:"content_item_ids"`
		} `json:"passages"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response is not the shape the client reads: %v (%s)", err, w.Body.String())
	}
	out := make([][]uuid.UUID, 0, len(body.Passages))
	for _, passage := range body.Passages {
		out = append(out, passage.ContentItemIDs)
	}
	return out
}

func TestSearchNamesOnlyTheFilingACurriculumNodePlaced(t *testing.T) {
	probe := newSearchProbe(t)
	node, curriculum := uuid.New(), uuid.New()
	placed, sibling := uuid.New(), uuid.New()

	fx := newGatedFixture(t, librarySearching(t, probe, true))
	fx.driver.tables["curriculum_nodes"] = []map[string]any{
		{"id": node, "curriculum_id": curriculum},
	}
	fx.driver.tables["content_placements"] = []map[string]any{{
		"id":                 uuid.New(),
		"content_item_id":    placed,
		"curriculum_node_id": node,
		"curriculum_id":      curriculum,
		"status":             string(entcontentplacement.StatusConfirmed),
		"grain":              string(entcontentplacement.GrainNode),
		"page_start":         int64(10),
		"page_end":           int64(20),
	}}
	fx.driver.tables["content_items"] = []map[string]any{
		indexedItem(libraryOwnerItem(placed, fx.person), "doc_shared"),
		indexedItem(libraryOwnerItem(sibling, fx.person), "doc_shared"),
	}
	probe.answers(searchPassageOf("doc_shared", 12))

	w := fx.search("q=photosynthesis&curriculum_node_id=" + node.String())
	if w.Code != 200 {
		t.Fatalf("want 200, got %d: %s", w.Code, w.Body.String())
	}

	named := namedItemsOf(t, w)
	if len(named) != 1 {
		t.Fatalf("want one passage, got %d: %v", len(named), named)
	}
	if len(named[0]) != 1 || named[0][0] != placed {
		t.Fatalf("the passage named %v; the sibling filing shares the bytes but is placed on no "+
			"node, so naming it would assert a mapping this syllabus point does not have",
			named[0])
	}
}
