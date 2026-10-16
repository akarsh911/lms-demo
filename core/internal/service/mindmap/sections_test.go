package mindmap

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Harbour-Emerge/emerge-core/internal/service/indexing"
)

const engineTree = `{"documents":[{"document_id":"` + probeDocument + `","title":"Biology",` +
	`"structure":"toc","chunks":412,"sections":[` +
	`{"id":"sec_root","parent_id":null,"title":"Biology","number":"","order":0,"children":3,` +
	`"page_range":null,"page_start":null,"page_end":null,"label":"","display_label":""},` +
	`{"id":"sec_declared","parent_id":"sec_root","title":"Life Processes","number":"5","children":0,` +
	`"page_range":[81,99],"page_start":80,"page_end":100,"display_label":""},` +
	`{"id":"sec_labelled","parent_id":"sec_root","title":"Control","number":"6","children":0,` +
	`"page_range":[101,120],"page_start":null,"page_end":null,"display_label":"Control and Coordination"},` +
	`{"id":"sec_one_page","parent_id":"sec_root","title":"","number":"","children":0,` +
	`"page_start":7,"page_end":0}` +
	`]}],"total_sections":4}`

func SectionIDs(raw []byte, documentID string) (map[string]struct{}, error) {
	sections, err := SectionsOf(raw, documentID)
	if err != nil {
		return nil, err
	}
	ids := make(map[string]struct{}, len(sections))
	for _, section := range sections {
		ids[section.ID] = struct{}{}
	}
	return ids, nil
}

func pagesOf(s Section) string {
	first, last, known := s.Pages()
	if !known {
		return "unrecorded"
	}
	return strconv.Itoa(first) + "-" + strconv.Itoa(last)
}

func TestSectionsOfReadsTheTreeAsTheEngineServesIt(t *testing.T) {
	sections, err := SectionsOf([]byte(engineTree), probeDocument)
	if err != nil {
		t.Fatalf("the engine's own tree could not be read: %v", err)
	}

	want := []struct{ id, display, pages string }{
		{"sec_root", "Biology", "unrecorded"},
		{"sec_declared", "5. Life Processes", "80-100"},
		{"sec_labelled", "Control and Coordination", "101-120"},
		{"sec_one_page", "sec_one_page", "7-7"},
	}
	if len(sections) != len(want) {
		t.Fatalf("got %d sections, want %d: %+v", len(sections), len(want), sections)
	}
	for i, w := range want {
		got := sections[i]
		if got.ID != w.id || got.Display != w.display || pagesOf(got) != w.pages {
			t.Errorf("section %d: got %s %q %s, want %s %q %s",
				i, got.ID, got.Display, pagesOf(got), w.id, w.display, w.pages)
		}
	}
}

func TestAChildCountInsteadOfAChildListDoesNotMakeTheTreeUnreadable(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusOK, engineTree)
	client := p.client(t)

	belongs, refusal, err := client.HasSection(context.Background(), pupil(), probeDocument, "sec_declared")
	if err != nil || refusal != nil {
		t.Fatalf("the engine serves children as a count, and that must not read as an "+
			"unreadable chapter list: %v %+v", err, refusal)
	}
	if !belongs {
		t.Fatal("a section the engine listed was not admitted")
	}
}

func TestSectionsAnswersFromTheCacheUntilItExpires(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusOK, engineTree)
	client := p.client(t)
	now := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	client.sections.now = func() time.Time { return now }
	ctx := context.Background()

	first, refusal, err := client.Sections(ctx, pupil(), probeDocument)
	if err != nil || refusal != nil || len(first) != 4 {
		t.Fatalf("the first listing: %v %+v %+v", err, refusal, first)
	}
	first[0].ID = "overwritten by the caller"

	again, _, err := client.Sections(ctx, pupil(), probeDocument)
	if err != nil || len(again) != 4 || again[0].ID != "sec_root" {
		t.Fatalf("the cached listing must be a copy the caller cannot corrupt: %v %+v", err, again)
	}
	if got := len(p.taken()); got != 1 {
		t.Fatalf("a fresh listing must be answered from the cache, yet the service was called %d times", got)
	}

	other := Caller{Tenant: "another-school", Bearer: probeToken}
	if _, _, err := client.Sections(ctx, other, probeDocument); err != nil {
		t.Fatalf("another school's listing: %v", err)
	}
	if got := len(p.taken()); got != 2 {
		t.Fatalf("one school's listing answered another school, the service was called %d times", got)
	}

	now = now.Add(SectionCacheTTL + time.Second)
	if _, _, err := client.Sections(ctx, pupil(), probeDocument); err != nil {
		t.Fatalf("the listing after expiry: %v", err)
	}
	if got := len(p.taken()); got != 3 {
		t.Fatalf("an expired listing must be asked for again, the service was called %d times", got)
	}
}

func TestSectionsHandsBackARefusalAndNeverCachesOne(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusForbidden, `{"detail":"a token that names no school"}`)
	client := p.client(t)
	ctx := context.Background()

	listed, refusal, err := client.Sections(ctx, pupil(), probeDocument)
	if err != nil || refusal == nil || refusal.Status != http.StatusForbidden || listed != nil {
		t.Fatalf("a refusal must come back as the refusal: %v %+v %+v", err, refusal, listed)
	}

	p.answers(http.StatusOK, `{"documents":[],"total_sections":0}`)
	listed, refusal, err = client.Sections(ctx, pupil(), probeDocument)
	if err != nil || refusal != nil || len(listed) != 0 {
		t.Fatalf("a document with no chapters is an empty list, not an error: %v %+v %+v", err, refusal, listed)
	}
	if client.sections.size() != 0 {
		t.Fatal("a refusal or an empty list was cached, so a chapter that appears next is hidden for a minute")
	}

	if _, _, err := client.Sections(ctx, pupil(), "  "); !errors.Is(err, ErrNoDocument) {
		t.Fatalf("a listing with no document gave %v, want ErrNoDocument", err)
	}
}

type digestSource struct {
	asked  int
	digest string
	chunks int
	err    error
}

func (d *digestSource) PublishedDocument(_ context.Context, tenant,
	documentID string) (*indexing.PublishedDocument, error) {

	d.asked++
	if d.err != nil {
		return nil, d.err
	}
	return &indexing.PublishedDocument{
		DocumentID: documentID, Tenant: tenant, Chunks: &d.chunks, StructureDigest: d.digest,
	}, nil
}

func TestStructuresRememberADigestForAMinuteAndAFailureForLess(t *testing.T) {
	source := &digestSource{digest: "sha256:one", chunks: 412}
	structures := NewStructures(source)
	now := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	structures.now = func() time.Time { return now }
	ctx := context.Background()

	got := structures.Of(ctx, probeTenant, probeDocument)
	if !got.Known() || got.Digest != "sha256:one" || got.Chunks == nil || *got.Chunks != 412 {
		t.Fatalf("the digest was read as %+v", got)
	}
	source.digest = "sha256:two"
	if again := structures.Of(ctx, probeTenant, probeDocument); again.Digest != "sha256:one" || source.asked != 1 {
		t.Fatalf("a fresh digest must come from the cache: %+v after %d calls", again, source.asked)
	}
	if other := structures.Of(ctx, "another-school", probeDocument); other.Digest != "sha256:two" {
		t.Fatalf("one school's digest answered another's: %+v", other)
	}

	now = now.Add(StructureCacheTTL + time.Second)
	if moved := structures.Of(ctx, probeTenant, probeDocument); moved.Digest != "sha256:two" {
		t.Fatalf("an expired digest must be asked for again, got %+v", moved)
	}

	failing := &digestSource{err: indexing.ErrEngineUnreachable}
	structures = NewStructures(failing)
	structures.now = func() time.Time { return now }

	if got := structures.Of(ctx, probeTenant, probeDocument); got.Known() || got.Chunks != nil {
		t.Fatalf("a failed call must be an unknown structure, got %+v", got)
	}
	structures.Of(ctx, probeTenant, probeDocument)
	if failing.asked != 1 {
		t.Fatalf("a failure must be remembered briefly so each write does not wait on a dead "+
			"engine, yet it was asked %d times", failing.asked)
	}

	failing.err, failing.digest = nil, "sha256:back"
	now = now.Add(StructureMissTTL + time.Second)
	if got := structures.Of(ctx, probeTenant, probeDocument); got.Digest != "sha256:back" {
		t.Fatalf("a failure must be forgotten sooner than a digest, got %+v", got)
	}
}

func TestStructuresWithNoSourceOrNoSubjectAnswerUnknown(t *testing.T) {
	var absent *Structures
	if got := absent.Of(context.Background(), probeTenant, probeDocument); got.Known() {
		t.Fatalf("no engine client must be an unknown structure, got %+v", got)
	}
	if NewStructures(nil) != nil {
		t.Fatal("a nil source must build no structures, so the caller's nil check holds")
	}

	source := &digestSource{digest: "sha256:one"}
	structures := NewStructures(source)
	for _, blank := range [][2]string{{"", probeDocument}, {probeTenant, " "}} {
		if got := structures.Of(context.Background(), blank[0], blank[1]); got.Known() {
			t.Fatalf("a blank tenant or document must be unknown, got %+v", got)
		}
	}
	if source.asked != 0 {
		t.Fatalf("a blank tenant or document reached the engine %d times", source.asked)
	}

	empty := &digestSource{digest: "", chunks: 9}
	if got := NewStructures(empty).Of(context.Background(), probeTenant, probeDocument); got.Known() || got.Chunks != nil {
		t.Fatalf("a chunk count with no digest verifies nothing and must not be kept, got %+v", got)
	}
}

type steadySource struct{ asked atomic.Int64 }

func (s *steadySource) PublishedDocument(_ context.Context, tenant,
	documentID string) (*indexing.PublishedDocument, error) {

	s.asked.Add(1)
	chunks := 412
	return &indexing.PublishedDocument{
		DocumentID: documentID, Tenant: tenant, Chunks: &chunks, StructureDigest: "sha256:steady",
	}, nil
}

func TestStructuresAndSectionsHoldUnderConcurrentCallers(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusOK, engineTree)
	client := p.client(t)
	source := &steadySource{}
	structures := NewStructures(source)
	ctx := context.Background()

	var wg sync.WaitGroup
	begin := make(chan struct{})
	wrong := make(chan string, 64)
	for worker := 0; worker < 16; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-begin
			for round := 0; round < 25; round++ {
				document := probeDocument
				if (worker+round)%2 == 1 {
					document = "doc_other_" + strconv.Itoa(round%4)
				}
				if got := structures.Of(ctx, probeTenant, document); got.Digest != "sha256:steady" {
					wrong <- "a digest was read as " + got.Digest
					return
				}
				listed, refusal, err := client.Sections(ctx, pupil(), probeDocument)
				if err != nil || refusal != nil || len(listed) != 4 {
					wrong <- "a listing came back short or refused"
					return
				}
			}
		}()
	}
	close(begin)
	wg.Wait()
	close(wrong)
	for what := range wrong {
		t.Fatal(what)
	}

	if asked := source.asked.Load(); asked < 5 || asked > 16*5 {
		t.Fatalf("five documents were asked about %d times; the cache is not being shared", asked)
	}
}

const gatedRefusal = `{"detail":"retrieval engine 404 for /syllabus/tree: ` +
	`{\"detail\":\"unknown document (or not visible to this tenant)\"}"}`

type gatedService struct {
	server *httptest.Server
	holder string

	mu    sync.Mutex
	asked map[string]int
}

func newGatedService(t *testing.T, holder string) *gatedService {
	t.Helper()

	g := &gatedService{holder: "Bearer " + holder, asked: map[string]int{}}
	g.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		bearer := r.Header.Get("Authorization")

		g.mu.Lock()
		g.asked[bearer]++
		g.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		if bearer != g.holder {
			w.WriteHeader(http.StatusNotFound)
			_, _ = io.WriteString(w, gatedRefusal)
			return
		}
		_, _ = io.WriteString(w, engineTree)
	}))
	t.Cleanup(g.server.Close)
	return g
}

func (g *gatedService) askedBy(bearer string) int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.asked[bearer]
}

func TestACachedChapterListAnswersOnlyTheCallerWhoEarnedIt(t *testing.T) {
	gate := newGatedService(t, "chain-holder-token")
	client, err := NewClient(ClientConfig{BaseURL: gate.server.URL, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("could not build a client: %v", err)
	}
	ctx := context.Background()

	holder := Caller{Tenant: probeTenant, Bearer: "chain-holder-token"}
	others := map[string]Caller{
		"a caller with another token": {Tenant: probeTenant, Bearer: "some-other-token"},
		"a caller with no token":      {Tenant: probeTenant},
	}

	if belongs, refusal, err := client.HasSection(ctx, holder, probeDocument, "sec_declared"); err != nil ||
		refusal != nil || !belongs {
		t.Fatalf("the holder of the gate label must be admitted: %v %+v %v", belongs, refusal, err)
	}

	for name, other := range others {
		belongs, refusal, err := client.HasSection(ctx, other, probeDocument, "sec_declared")
		if err != nil {
			t.Fatalf("%s: the check itself failed: %v", name, err)
		}
		if belongs || refusal == nil || refusal.Status != http.StatusNotFound {
			t.Fatalf("%s was admitted to a gated book on a chapter list the holder earned "+
				"(belongs=%v refusal=%+v); the engine refuses this caller", name, belongs, refusal)
		}

		listed, refusal, err := client.Sections(ctx, other, probeDocument)
		if err != nil {
			t.Fatalf("%s: the listing itself failed: %v", name, err)
		}
		if len(listed) != 0 || refusal == nil || refusal.Status != http.StatusNotFound {
			t.Fatalf("%s was served %d chapters of a gated book from the holder's cached list",
				name, len(listed))
		}
	}

	scheme := Caller{Tenant: probeTenant, Bearer: "Bearer chain-holder-token"}
	for name, same := range map[string]Caller{"the holder": holder, "the holder, scheme and all": scheme} {
		belongs, refusal, err := client.HasSection(ctx, same, probeDocument, "sec_labelled")
		if err != nil || refusal != nil || !belongs {
			t.Fatalf("%s lost the cached list to another caller's refusal: %v %+v %v",
				name, belongs, refusal, err)
		}
		if listed, _, _ := client.Sections(ctx, same, probeDocument); len(listed) != 4 {
			t.Fatalf("%s was listed %d chapters, want 4", name, len(listed))
		}
	}
	if asked := gate.askedBy("Bearer chain-holder-token"); asked != 1 {
		t.Fatalf("the holder's entry was evicted or poisoned: the service was asked %d times "+
			"on the holder's behalf, want 1", asked)
	}
	if client.sections.size() != 1 {
		t.Fatalf("a refusal must not be cached, yet the cache holds %d entries", client.sections.size())
	}
}

func TestTheSectionCacheNeverKeepsTheBearerItself(t *testing.T) {
	secret := "eyJhbGciOiJSUzI1NiJ9.a-bearer-that-must-not-be-kept.signature"
	p := newProbe(t)
	p.answers(http.StatusOK, engineTree)
	client := p.client(t)

	caller := Caller{Tenant: probeTenant, Bearer: secret}
	if _, _, err := client.Sections(context.Background(), caller, probeDocument); err != nil {
		t.Fatalf("the listing failed: %v", err)
	}
	if client.sections.size() != 1 {
		t.Fatalf("want one cached entry, got %d", client.sections.size())
	}

	client.sections.mu.Lock()
	defer client.sections.mu.Unlock()
	for key := range client.sections.entries {
		if kept := fmt.Sprintf("%+v", key); strings.Contains(kept, secret) ||
			strings.Contains(kept, "a-bearer-that-must-not-be-kept") {
			t.Fatalf("the cache key carries the caller's token: %s", kept)
		}
	}
}
