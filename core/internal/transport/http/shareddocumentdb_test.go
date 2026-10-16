package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
)

const (
	sharedDocument = "doc_shared_between_sections"
	ownDocument    = "doc_only_this_caller_filed"
)

type sharedDocGuard struct{}

func (sharedDocGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if entity == authorization.LibraryRead {
		return authorization.Decision{Allowed: true, Reach: authorization.ReachSelf, HasReach: true}, nil
	}
	return authorization.Decision{}, nil
}

func (sharedDocGuard) Name() string { return "shared document test guard" }

type sharedDocWorld struct {
	t      *testing.T
	db     *testsupport.TenantDB
	server *Server
	probe  *searchProbe
	ctx    context.Context

	personID uuid.UUID
	mine     uuid.UUID
	alsoMine uuid.UUID
	theirs   uuid.UUID
}

func newSharedDocWorld(t *testing.T) *sharedDocWorld {
	t.Helper()

	ctx := context.Background()
	db := testsupport.TenantTx(ctx, t)
	client := db.Client
	tag := uuid.NewString()[:8]

	casUser := uuid.New()
	person := client.Person.Create().
		SetCasUserID(casUser).
		SetFirstName("Shared").
		SetDisplayName("Shared Reader " + tag).
		SaveX(ctx)
	stranger := client.Person.Create().
		SetCasUserID(uuid.New()).
		SetFirstName("Other").
		SetDisplayName("Shared Stranger " + tag).
		SaveX(ctx)

	filed := func(title string, owner uuid.UUID, status entcontentitem.Status) uuid.UUID {
		return client.ContentItem.Create().
			SetTitle(title + " " + tag).
			SetKind(entcontentitem.KindBook).
			SetAudience(entcontentitem.AudienceOwner).
			SetStatus(status).
			SetOwnerPersonID(owner).
			SetIndexStatus(entcontentitem.IndexStatusIndexed).
			SetEngineDocumentID(sharedDocument).
			SetIndexedSha256(libraryDigest).
			SetIndexedAt(time.Now().UTC()).
			SaveX(ctx).ID
	}

	world := &sharedDocWorld{
		t:        t,
		db:       db,
		probe:    newSearchProbe(t),
		personID: person.ID,
		mine:     filed("Atlas filed to 9A", person.ID, entcontentitem.StatusPublished),
		alsoMine: filed("Atlas filed to 9B", person.ID, entcontentitem.StatusPublished),
		theirs:   filed("Atlas the staffroom copy", stranger.ID, entcontentitem.StatusDraft),
	}

	client4, err := indexing.NewClient(indexing.ClientConfig{
		BaseURL: world.probe.server.URL,
		Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("could not build an engine client: %v", err)
	}
	UseSearcher(client4)
	t.Cleanup(func() { UseSearcher(nil) })

	world.server = &Server{
		guard: sharedDocGuard{},
		cfg: &config.Config{
			RetrievalSearchEnabled: true,
			RetrievalEngineBaseURL: world.probe.server.URL,
		},
	}

	ctx = authorization.WithSubject(ctx, &authorization.Subject{CASUserID: casUser})
	ctx = tenancy.WithTenant(ctx, &tenancy.Tenant{
		SchoolID: uuid.New(), Code: "DPS", CASTenantID: searchSlug,
	})
	world.ctx = postgres.WithConn(ctx, &postgres.TenantConn{Client: client})

	world.requireGenuineScope()
	db.Forget()
	return world
}

func (w *sharedDocWorld) requireGenuineScope() {
	w.t.Helper()

	viewer, decision, err := w.server.scopeFor(w.ctx,
		authorization.LibraryRead, authorization.LibraryReadAll)
	if err != nil {
		w.t.Fatalf("the viewer could not be resolved against the tenant database: %v", err)
	}
	if viewer.Unrestricted {
		w.t.Fatal("an unrestricted viewer reads every item and would prove nothing about scoping")
	}
	if viewer.PersonID == nil || *viewer.PersonID != w.personID {
		w.t.Fatalf("the viewer must resolve to the seeded person %s, got %v",
			w.personID, viewer.PersonID)
	}
	if !decision.HasReach || decision.Reach != authorization.ReachSelf {
		w.t.Fatalf("the decision must carry a self reach, got %+v", decision)
	}
}

func (w *sharedDocWorld) search(query string) *httptest.ResponseRecorder {
	w.t.Helper()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/library/search?"+query,
		strings.NewReader("")).WithContext(w.ctx)
	w.server.searchLibrary(rec, req)
	return rec
}

type sharedDocAnswer struct {
	Passages []struct {
		ContentItemID  uuid.UUID   `json:"content_item_id"`
		ContentItemIDs []uuid.UUID `json:"content_item_ids"`
	} `json:"passages"`
	Scope struct {
		Documents int `json:"documents"`
	} `json:"scope"`
	Dropped searchDrops `json:"dropped"`
}

func (w *sharedDocWorld) answer(rec *httptest.ResponseRecorder) sharedDocAnswer {
	w.t.Helper()

	if rec.Code != http.StatusOK {
		w.t.Fatalf("want 200, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	var body sharedDocAnswer
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		w.t.Fatalf("the answer is not the shape the client reads: %v (%s)", err, rec.Body.String())
	}
	return body
}

func TestSearchNamesEveryReachableItemBehindOneEngineDocument(t *testing.T) {
	world := newSharedDocWorld(t)
	world.probe.answers(searchPassageOf(sharedDocument, 12))

	body := world.answer(world.search("q=photosynthesis"))

	if body.Scope.Documents != 1 {
		t.Fatalf("two items filed against the same bytes must scope to one document, got %d",
			body.Scope.Documents)
	}
	if len(body.Passages) != 1 {
		t.Fatalf("want one passage, got %d", len(body.Passages))
	}

	named := body.Passages[0].ContentItemIDs
	if len(named) != 2 {
		t.Fatalf("the passage named %d content items, want both filings the caller owns: %v",
			len(named), named)
	}
	for _, want := range []uuid.UUID{world.mine, world.alsoMine} {
		found := false
		for _, got := range named {
			if got == want {
				found = true
			}
		}
		if !found {
			t.Fatalf("content item %s shares the document and the caller reaches it, but the "+
				"passage named only %v; collapsing the document onto one filing hides the "+
				"other", want, named)
		}
	}
	for _, got := range named {
		if got == world.theirs {
			t.Fatalf("the passage named %s, a filing owned by somebody else that this caller "+
				"cannot reach; sharing a document must not carry another section's item id "+
				"across", got)
		}
	}
	if body.Passages[0].ContentItemID != named[0] {
		t.Fatalf("content_item_id %s is not the first of %v, so the two fields disagree",
			body.Passages[0].ContentItemID, named)
	}
}

func TestSearchDropsAPassageWhoseSharedDocumentOnlyAStrangerFiled(t *testing.T) {
	world := newSharedDocWorld(t)

	ctx := context.Background()
	world.db.Client.ContentItem.UpdateOneID(world.mine).
		SetEngineDocumentID(ownDocument).ExecX(ctx)
	world.db.Client.ContentItem.UpdateOneID(world.alsoMine).
		ClearEngineDocumentID().ClearIndexedSha256().ExecX(ctx)

	world.probe.answers(searchPassageOf(ownDocument, 12), searchPassageOf(sharedDocument, 4))

	rec := world.search("q=photosynthesis")
	body := world.answer(rec)

	if sent := world.probe.body(t)["document_ids"]; sent == nil {
		t.Fatalf("the caller is narrowed and must be pre-filtered by document id: %v", sent)
	} else if ids, ok := sent.([]any); !ok || len(ids) != 1 || ids[0] != ownDocument {
		t.Fatalf("the pre-filter asked for %v, want %s alone", sent, ownDocument)
	}

	if len(body.Passages) != 1 {
		t.Fatalf("want the caller's own document alone, got %d passages: %+v",
			len(body.Passages), body.Passages)
	}
	if named := body.Passages[0].ContentItemIDs; len(named) != 1 || named[0] != world.mine {
		t.Fatalf("the surviving passage named %v, want %s", named, world.mine)
	}
	if body.Dropped.Unreachable != 1 {
		t.Fatalf("the only item holding %s is a draft somebody else owns, so the engine was "+
			"wider than the database and the re-check must drop it: unreachable=%d",
			sharedDocument, body.Dropped.Unreachable)
	}
}
