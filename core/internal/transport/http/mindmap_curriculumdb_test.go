package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	entplacement "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentplacement"
	entnode "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/curriculumnode"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
)

const linkedTree = `[` +
	`{"id":"sec_root","parent_id":null,"title":"Biology","number":"","children":3,` +
	`"page_start":null,"page_end":null,"page_range":null},` +
	`{"id":"sec_nutrition","parent_id":"sec_root","title":"Nutrition","number":"1","children":0,` +
	`"page_start":1,"page_end":9,"display_label":"Nutrition in plants"},` +
	`{"id":"` + mindmapOwnSection + `","parent_id":"sec_root","title":"Life Processes","number":"2",` +
	`"children":0,"page_start":10,"page_end":24},` +
	`{"id":"sec_control","parent_id":"sec_root","title":"Control","number":"3","children":0,` +
	`"page_start":null,"page_end":null,"page_range":[25,40]}]`

func linkGrants() masteryGrants {
	return masteryGrants{
		authorization.MindmapsRead:          granted(),
		authorization.LibraryRead:           granted(),
		authorization.ContentPlacementsRead: reaching(authorization.ReachTenant),
	}
}

type linkWorld struct {
	*mindmapWorld

	curriculum uuid.UUID
	sequence   int
}

func newLinkWorld(t *testing.T) *linkWorld {
	t.Helper()

	base := newMindmapWorld(t)
	tag := uuid.NewString()[:8]

	curriculum := base.db.Client.Curriculum.Create().
		SetName("Link Curriculum " + tag).
		SetCode("LNK-" + tag).
		SetAcademicSessionID(base.session).
		SetSubjectID(base.subject).
		SetGradeLevelID(base.grade).
		SaveX(context.Background())

	base.probe.shelves(base.document, linkedTree)
	base.server.guard = linkGrants()
	base.db.Forget()
	return &linkWorld{mindmapWorld: base, curriculum: curriculum.ID}
}

func (w *linkWorld) node(kind entnode.Kind, title string, parent *uuid.UUID) uuid.UUID {
	w.t.Helper()

	w.sequence++
	return w.db.Client.CurriculumNode.Create().
		SetCurriculumID(w.curriculum).
		SetKind(kind).
		SetTitle(title).
		SetSequence(w.sequence).
		SetNillableParentID(parent).
		SaveX(context.Background()).ID
}

func (w *linkWorld) places(node, item uuid.UUID, status entplacement.Status, pages ...int) uuid.UUID {
	w.t.Helper()

	create := w.db.Client.ContentPlacement.Create().
		SetCurriculumID(w.curriculum).
		SetCurriculumNodeID(node).
		SetContentItemID(item).
		SetGrain(entplacement.GrainNode).
		SetStatus(status)
	if len(pages) == 2 {
		create = create.SetPageStart(pages[0]).SetPageEnd(pages[1])
	}
	return create.SaveX(context.Background()).ID
}

func (w *linkWorld) indexedBook(title, document string) uuid.UUID {
	w.t.Helper()

	return w.db.Client.ContentItem.Create().
		SetTitle(title).
		SetKind(entcontentitem.KindBook).
		SetAudience(entcontentitem.AudienceOffering).
		SetSubjectOfferingID(w.offeringA).
		SetSubjectID(w.subject).
		SetStatus(entcontentitem.StatusPublished).
		SetOwnerPersonID(w.author).
		SetIndexStatus(entcontentitem.IndexStatusIndexed).
		SetEngineDocumentID(document).
		SetIndexedSha256(libraryDigest).
		SetIndexedAt(time.Now().UTC()).
		SaveX(context.Background()).ID
}

func (w *linkWorld) link(node uuid.UUID, query string) *httptest.ResponseRecorder {
	w.t.Helper()

	route := chi.NewRouteContext()
	route.URLParams.Add("id", node.String())
	ctx := context.WithValue(w.ctx, chi.RouteCtxKey, route)

	rec := httptest.NewRecorder()
	w.server.listCurriculumNodeMindmaps(rec, httptest.NewRequest(http.MethodGet,
		"/api/v1/curriculum-nodes/"+node.String()+"/mindmaps"+query, nil).WithContext(ctx))
	return rec
}

type linkBody struct {
	CurriculumNodeID string          `json:"curriculum_node_id"`
	Kind             string          `json:"kind"`
	Mindmaps         []linkedMindmap `json:"mindmaps"`
	Count            int             `json:"count"`
}

func (w *linkWorld) linked(t *testing.T, node uuid.UUID) linkBody {
	t.Helper()

	rec := w.link(node, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	var body linkBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the answer is not the link shape: %v (%s)", err, rec.Body.String())
	}
	if body.CurriculumNodeID != node.String() || body.Count != len(body.Mindmaps) {
		t.Fatalf("the answer names the wrong node or miscounts: %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"mindmaps":[`) {
		t.Fatalf("mindmaps must be a list even when it is empty: %s", rec.Body.String())
	}
	for _, linked := range body.Mindmaps {
		if linked.Sections == nil {
			t.Fatalf("sections must be a list even when it is empty: %s", rec.Body.String())
		}
	}
	return body
}

func wantSections(t *testing.T, got []linkedSection, want ...string) {
	t.Helper()

	described := make([]string, 0, len(got))
	for _, section := range got {
		pages := "null"
		if section.PageStart != nil && section.PageEnd != nil {
			pages = strconv.Itoa(*section.PageStart) + "-" + strconv.Itoa(*section.PageEnd)
		}
		overlap := "null"
		if section.OverlapPages != nil {
			overlap = strconv.Itoa(*section.OverlapPages)
		}
		described = append(described, section.SectionID+" "+pages+" "+overlap)
	}
	if strings.Join(described, "; ") != strings.Join(want, "; ") {
		t.Fatalf("got sections [%s], want [%s]", strings.Join(described, "; "), strings.Join(want, "; "))
	}
}

func TestCurriculumLinkFromPostgresSelectsAChaptersSectionsByPageOverlap(t *testing.T) {
	world := newLinkWorld(t)

	chapter := world.node(entnode.KindChapter, "Life Processes", nil)
	own := world.places(chapter, world.mine, entplacement.StatusConfirmed, 10, 30)
	world.places(chapter, world.theirs, entplacement.StatusConfirmed, 5, 9)
	proposed := world.places(chapter, world.mine, entplacement.StatusProposed, 1, 9)
	world.db.Forget()

	rec := world.link(chapter, "")
	body := world.linked(t, chapter)

	if body.Kind != "chapter" || body.Count != 1 {
		t.Fatalf("a chapter with one readable, confirmed placement links one book, got %+v", body)
	}
	linked := body.Mindmaps[0]
	if linked.ContentItemID != world.mine || linked.PlacementID != own || linked.Inherited {
		t.Fatalf("the chapter's own placement must be linked as its own, got %+v", linked)
	}
	if linked.Title == nil || !strings.HasPrefix(*linked.Title, "Biology for offering A") {
		t.Fatalf("the book's title is missing: %+v", linked)
	}
	if linked.PageStart == nil || *linked.PageStart != 10 || linked.PageEnd == nil || *linked.PageEnd != 30 {
		t.Fatalf("the placement's own pages must be echoed, got %v-%v", linked.PageStart, linked.PageEnd)
	}
	if linked.MindmapState != MindmapAvailable || linked.MatchBasis != MatchPageOverlap {
		t.Fatalf("want an available book matched by page overlap, got %s / %s",
			linked.MindmapState, linked.MatchBasis)
	}
	wantSections(t, linked.Sections, mindmapOwnSection+" 10-24 15", "sec_control 25-40 6")
	if linked.Sections[0].Display != "2. Life Processes" {
		t.Fatalf("a chapter with no label is displayed by number and title, got %q",
			linked.Sections[0].Display)
	}

	for what, hidden := range map[string]string{
		"the book of another offering": world.theirs.String(),
		"the proposed placement":       proposed.String(),
		"the engine's document id":     world.document,
	} {
		if strings.Contains(rec.Body.String(), hidden) {
			t.Fatalf("%s reached the answer: %s", what, rec.Body.String())
		}
	}

	calls := world.probe.taken()
	if len(calls) != 1 || calls[0].path != "/chapters" || calls[0].query["document_id"][0] != world.document {
		t.Fatalf("two requests for one book are one chapter-list call, answered from the cache "+
			"the second time, and the unreadable book is never asked about: %+v", calls)
	}
	if calls[0].authorization != "Bearer "+mindmapToken || calls[0].tenant != mindmapSlug {
		t.Fatalf("the chapter list must be asked for as the caller, got %+v", calls[0])
	}
	if writes := mindmapWrites(world.db.Statements()); len(writes) != 0 {
		t.Fatalf("the link writes nothing, yet it ran %v", writes)
	}
}

func TestCurriculumLinkFromPostgresFinishesItsDatabaseWorkBeforeItCallsOut(t *testing.T) {
	world := newLinkWorld(t)
	chapter := world.node(entnode.KindChapter, "Life Processes", nil)
	world.places(chapter, world.mine, entplacement.StatusConfirmed, 10, 30)
	world.db.Forget()

	var atFirstCall atomic.Int64
	atFirstCall.Store(-1)
	world.probe.mu.Lock()
	world.probe.onRequest = func() {
		atFirstCall.CompareAndSwap(-1, int64(len(world.db.Statements())))
	}
	world.probe.mu.Unlock()

	world.linked(t, chapter)

	if total := int64(len(world.db.Statements())); atFirstCall.Load() <= 0 || atFirstCall.Load() != total {
		t.Fatalf("%d statements had run when the outbound call began and %d by the end, so "+
			"database work straddles a call the engine answers by calling back",
			atFirstCall.Load(), total)
	}
}

func TestCurriculumLinkFromPostgresResolvesATopicThroughItsChapter(t *testing.T) {
	world := newLinkWorld(t)

	chapter := world.node(entnode.KindChapter, "Life Processes", nil)
	placed := world.places(chapter, world.mine, entplacement.StatusConfirmed, 10, 30)
	bare := world.node(entnode.KindTopic, "Respiration", &chapter)
	pinned := world.node(entnode.KindTopic, "Transportation", &chapter)
	narrow := world.places(pinned, world.mine, entplacement.StatusConfirmed, 12, 14)

	inherited := world.linked(t, bare)
	if inherited.Kind != "topic" || inherited.Count != 1 {
		t.Fatalf("a topic with no placement of its own resolves through its chapter, got %+v", inherited)
	}
	if got := inherited.Mindmaps[0]; got.PlacementID != placed || !got.Inherited ||
		got.MatchBasis != MatchPageOverlap {
		t.Fatalf("the chapter's placement must be linked and marked inherited, got %+v", got)
	}
	wantSections(t, inherited.Mindmaps[0].Sections, mindmapOwnSection+" 10-24 15", "sec_control 25-40 6")

	own := world.linked(t, pinned)
	if own.Count != 1 || own.Mindmaps[0].PlacementID != narrow || own.Mindmaps[0].Inherited {
		t.Fatalf("a topic with a placement of its own is linked by that one alone, got %+v", own)
	}
	wantSections(t, own.Mindmaps[0].Sections, mindmapOwnSection+" 10-24 3")

	shut := world.node(entnode.KindTopic, "Excretion", &chapter)
	world.places(shut, world.theirs, entplacement.StatusConfirmed, 12, 14)

	through := world.linked(t, shut)
	if through.Count != 1 || through.Mindmaps[0].PlacementID != placed || !through.Mindmaps[0].Inherited {
		t.Fatalf("a topic whose only placement is on a book the caller cannot open resolves "+
			"through its chapter, and the unreadable placement is not mentioned: %+v", through)
	}
}

func TestCurriculumLinkFromPostgresFallsBackToTheCurriculumsOwnBookLast(t *testing.T) {
	world := newLinkWorld(t)

	chapter := world.node(entnode.KindChapter, "Unplaced", nil)
	topic := world.node(entnode.KindTopic, "Unplaced topic", &chapter)
	whole := world.db.Client.ContentPlacement.Create().
		SetCurriculumID(world.curriculum).
		SetContentItemID(world.mine).
		SetGrain(entplacement.GrainCurriculum).
		SetStatus(entplacement.StatusConfirmed).
		SaveX(context.Background()).ID

	for _, node := range []uuid.UUID{chapter, topic} {
		got := world.linked(t, node)
		if got.Count != 1 || got.Mindmaps[0].PlacementID != whole || !got.Mindmaps[0].Inherited ||
			got.Mindmaps[0].MatchBasis != MatchWholeItem || len(got.Mindmaps[0].Sections) != 4 {
			t.Fatalf("a node with nothing placed on it or above it links the curriculum's own "+
				"book as a whole item, inherited: %+v", got)
		}
	}

	world.places(chapter, world.mine, entplacement.StatusConfirmed, 10, 24)
	nearer := world.linked(t, topic)
	if nearer.Count != 1 || nearer.Mindmaps[0].PlacementID == whole ||
		nearer.Mindmaps[0].MatchBasis != MatchPageOverlap {
		t.Fatalf("once the chapter is placed it is nearer than the curriculum, and only the "+
			"nearest tier is linked: %+v", nearer)
	}
}

func TestCurriculumLinkFromPostgresNamesWhyNothingMatched(t *testing.T) {
	world := newLinkWorld(t)

	whole := world.node(entnode.KindChapter, "The whole book", nil)
	world.places(whole, world.mine, entplacement.StatusConfirmed)

	got := world.linked(t, whole)
	if got.Count != 1 || got.Mindmaps[0].MatchBasis != MatchWholeItem ||
		got.Mindmaps[0].PageStart != nil || got.Mindmaps[0].PageEnd != nil {
		t.Fatalf("a placement with no pages is the whole item, got %+v", got)
	}
	wantSections(t, got.Mindmaps[0].Sections,
		"sec_nutrition 1-9 9", mindmapOwnSection+" 10-24 15", "sec_control 25-40 16", "sec_root null null")
	if got.Mindmaps[0].Sections[0].Display != "Nutrition in plants" {
		t.Fatalf("a chapter a teacher labelled is displayed by its label, got %q",
			got.Mindmaps[0].Sections[0].Display)
	}

	mixed := world.node(entnode.KindChapter, "Elsewhere", nil)
	beyond := world.places(mixed, world.mine, entplacement.StatusConfirmed, 500, 510)
	held := world.places(mixed, world.byState[entcontentitem.IndexStatusHeld], entplacement.StatusConfirmed, 10, 30)

	byPlacement := map[uuid.UUID]linkedMindmap{}
	for _, linked := range world.linked(t, mixed).Mindmaps {
		byPlacement[linked.PlacementID] = linked
	}
	if got := byPlacement[beyond]; got.MindmapState != MindmapAvailable || got.MatchBasis != MatchNone ||
		len(got.Sections) != 0 {
		t.Fatalf("pages no chapter covers match nothing, and that is not an error: %+v", got)
	}
	if got := byPlacement[held]; got.MindmapState != MindmapHeld || got.MatchBasis != MatchNone ||
		len(got.Sections) != 0 {
		t.Fatalf("a held book is listed with its state and no sections: %+v", got)
	}

	empty := world.node(entnode.KindChapter, "Unmapped", nil)
	if got := world.linked(t, empty); got.Count != 0 {
		t.Fatalf("a node with no placement links nothing, got %+v", got)
	}

	absent := world.link(uuid.New(), "")
	if absent.Code != http.StatusNotFound {
		t.Fatalf("a node that does not exist: want 404, got %d", absent.Code)
	}
}

func TestCurriculumLinkFromPostgresTreatsAnUnknownDocumentAsNoMatchAndARefusalAsARefusal(t *testing.T) {
	world := newLinkWorld(t)

	chapter := world.node(entnode.KindChapter, "Life Processes", nil)
	vanished := world.indexedBook("Vanished from the engine", "doc_the_engine_never_heard_of")
	world.places(chapter, vanished, entplacement.StatusConfirmed, 10, 30)

	got := world.linked(t, chapter)
	if got.Count != 1 || got.Mindmaps[0].MatchBasis != MatchNone || len(got.Mindmaps[0].Sections) != 0 {
		t.Fatalf("a book the service lists no chapters for matches nothing: %+v", got)
	}

	superadmin := "a token that names no school cannot read one school's books"
	raw, _ := json.Marshal(map[string]string{"detail": superadmin})
	world.probe.forces("chapters", http.StatusForbidden, string(raw))

	refused := world.link(chapter, "")
	if refused.Code != http.StatusForbidden {
		t.Fatalf("the engine's refusal of the caller must arrive as itself, got %d: %s",
			refused.Code, strings.TrimSpace(refused.Body.String()))
	}
	body := mindmapRefusalOf(t, refused)
	if body["code"] != MindmapRefusedCode || body["message"] != superadmin {
		t.Fatalf("the refusal must carry the engine's own words: %s", refused.Body.String())
	}

	world.probe.server.Close()
	gone := world.link(chapter, "")
	if gone.Code != http.StatusBadGateway || mindmapRefusalOf(t, gone)["code"] != MindmapServiceDownCode {
		t.Fatalf("an outage must not read as a book with no chapters, got %d: %s",
			gone.Code, strings.TrimSpace(gone.Body.String()))
	}
}

func TestCurriculumLinkFromPostgresRefusesMoreBooksThanItMayAskAbout(t *testing.T) {
	world := newLinkWorld(t)
	chapter := world.node(entnode.KindChapter, "Over-mapped", nil)

	for i := 0; i < MaxLinkedMindmapBooks; i++ {
		book := world.indexedBook("Reference "+strconv.Itoa(i), "doc_reference_"+strconv.Itoa(i))
		world.places(chapter, book, entplacement.StatusConfirmed, 1, 5)
		world.places(chapter, book, entplacement.StatusConfirmed, 6, 9)
	}
	if got := world.linked(t, chapter); got.Count != 2*MaxLinkedMindmapBooks {
		t.Fatalf("%d books is within the cap however many placements name them, got %d entries",
			MaxLinkedMindmapBooks, got.Count)
	}
	if calls := world.probe.taken(); len(calls) != MaxLinkedMindmapBooks {
		t.Fatalf("want one chapter-list call per distinct book, got %d", len(calls))
	}

	world.places(chapter, world.mine, entplacement.StatusConfirmed, 10, 30)
	world.probe.forget()

	rec := world.link(chapter, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("one book past the cap: want 409, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	body := mindmapRefusalOf(t, rec)
	message, _ := body["message"].(string)
	if body["code"] != MindmapLinkUnboundedCode ||
		!strings.Contains(message, strconv.Itoa(MaxLinkedMindmapBooks)) {
		t.Fatalf("the refusal must carry its code and name the cap: %s", rec.Body.String())
	}
	if calls := world.probe.taken(); len(calls) != 0 {
		t.Fatalf("a refused link still called the mind-map service: %+v", calls)
	}
}

func TestCurriculumLinkFromPostgresRequiresThePlacementAndLibraryKeys(t *testing.T) {
	world := newLinkWorld(t)
	chapter := world.node(entnode.KindChapter, "Life Processes", nil)
	world.places(chapter, world.mine, entplacement.StatusConfirmed, 10, 30)

	for _, missing := range []authorization.Entity{
		authorization.ContentPlacementsRead, authorization.LibraryRead,
	} {
		world.server.guard = linkGrants().without(missing)

		rec := world.link(chapter, "")
		if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), string(missing)) {
			t.Fatalf("without %s: want 403 naming it, got %d: %s", missing, rec.Code,
				strings.TrimSpace(rec.Body.String()))
		}
	}

	world.server.guard = linkGrants()
	if rec := world.link(chapter, "?include_ancestors=true"); rec.Code != http.StatusBadRequest ||
		!strings.Contains(rec.Body.String(), "include_ancestors") {
		t.Fatalf("a parameter the route does not take: want 400 naming it, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	denied := linkGrants()
	withheld := denied[authorization.ContentPlacementsRead]
	withheld.Fields = &authorization.FieldPolicy{
		Mode: authorization.FieldModeAllExcept, Keys: []string{entplacement.FieldPageStart},
	}
	denied[authorization.ContentPlacementsRead] = withheld
	world.server.guard = denied
	if rec := world.link(chapter, ""); rec.Code != http.StatusForbidden ||
		!strings.Contains(rec.Body.String(), entplacement.FieldPageStart) {
		t.Fatalf("a field policy that withholds the pages: want 403 naming the field, got %d: %s",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	if got := world.probe.taken(); len(got) != 0 {
		t.Fatalf("a refused link reached the mind-map service: %+v", got)
	}
}

func TestCurriculumLinkFromPostgresNeedsNoSlugUntilItMustCallOut(t *testing.T) {
	world := newLinkWorld(t)
	world.ctx = tenancy.WithTenant(world.ctx, &tenancy.Tenant{SchoolID: uuid.New(), Code: "DPS-NGP"})

	waiting := world.node(entnode.KindChapter, "Waiting on a build", nil)
	world.places(waiting, world.byState[entcontentitem.IndexStatusHeld], entplacement.StatusConfirmed, 1, 9)
	if got := world.linked(t, waiting); got.Count != 1 || got.Mindmaps[0].MindmapState != MindmapHeld {
		t.Fatalf("a node whose books are not indexed is answered from this server's own columns: %+v", got)
	}

	indexed := world.node(entnode.KindChapter, "Indexed", nil)
	world.places(indexed, world.mine, entplacement.StatusConfirmed, 10, 30)
	rec := world.link(indexed, "")
	if rec.Code != http.StatusServiceUnavailable || mindmapRefusalOf(t, rec)["code"] != MindmapUnmappedCode {
		t.Fatalf("a school with no slug cannot ask the engine: want 503 %s, got %d: %s",
			MindmapUnmappedCode, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func paged(id string, first, last int) mindmap.Section {
	return mindmap.Section{ID: id, Display: id, PageStart: &first, PageEnd: &last}
}

func TestOverlappingSectionsPutTheMostSpecificChapterFirst(t *testing.T) {
	sections := []mindmap.Section{
		paged("sec_book", 1, 300),
		paged("sec_before", 1, 9),
		paged("sec_chapter", 10, 30),
		paged("sec_tail", 28, 60),
		{ID: "sec_unpaged", Display: "sec_unpaged"},
	}

	wantSections(t, overlappingSections(sections, 10, 30),
		"sec_chapter 10-30 21", "sec_book 1-300 21", "sec_tail 28-60 3")
	wantSections(t, overlappingSections(sections, 400, 410))
	wantSections(t, overlappingSections(sections, 9, 9), "sec_before 1-9 1", "sec_book 1-300 1")
}

func TestAPlacementsPagesAreReadHoweverTheyWereStored(t *testing.T) {
	page := func(n int) *int { return &n }

	cases := []struct {
		name        string
		start, end  *int
		first, last int
		ranged      bool
	}{
		{"both", page(10), page(30), 10, 30, true},
		{"neither", nil, nil, 0, 0, false},
		{"a start alone is one page", page(12), nil, 12, 12, true},
		{"an end alone is one page", nil, page(40), 40, 40, true},
		{"stored backwards", page(30), page(10), 10, 30, true},
	}
	for _, tc := range cases {
		first, last, ranged := placementPages(&tenantent.ContentPlacement{PageStart: tc.start, PageEnd: tc.end})
		if first != tc.first || last != tc.last || ranged != tc.ranged {
			t.Errorf("%s: got %d-%d ranged=%v, want %d-%d ranged=%v",
				tc.name, first, last, ranged, tc.first, tc.last, tc.ranged)
		}
	}
}

func TestCurriculumLinkFromPostgresDoesNotLendOneCallersChapterListToAnother(t *testing.T) {
	world := newLinkWorld(t)
	chapter := world.node(entnode.KindChapter, "Life Processes", nil)
	world.places(chapter, world.mine, entplacement.StatusConfirmed, 10, 30)
	world.probe.denies("Bearer "+mindmapUnlabelledToken, http.StatusNotFound, mindmapGatedRefusal)

	accepted := world.linked(t, chapter)
	if accepted.Count != 1 || accepted.Mindmaps[0].MatchBasis != MatchPageOverlap {
		t.Fatalf("the caller the engine accepts is shown the chapters: %+v", accepted)
	}

	holder := world.ctx
	world.ctx = authorization.WithSubject(world.ctx,
		&authorization.Subject{CASUserID: world.pupilCAS, RawToken: mindmapUnlabelledToken})

	refused := world.linked(t, chapter)
	if refused.Count != 1 || refused.Mindmaps[0].MatchBasis != MatchNone || len(refused.Mindmaps[0].Sections) != 0 {
		t.Fatalf("the engine shows this credential no chapters, and a list another credential "+
			"earned must not be served to it: %+v", refused)
	}

	world.ctx = holder
	if again := world.linked(t, chapter); again.Mindmaps[0].MatchBasis != MatchPageOverlap {
		t.Fatalf("the accepted caller lost the chapters after another caller's refusal: %+v", again)
	}
	if asked := world.probe.bearing("Bearer "+mindmapToken, "/chapters"); asked != 1 {
		t.Fatalf("the accepted caller's cached chapter list was dropped or poisoned by the "+
			"other caller's refusal: it was asked for %d times, want 1", asked)
	}
}
