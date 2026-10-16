package mindmap

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"
)

const (
	probeTenant   = "dps-ngp"
	probeToken    = "eyJhbGciOiJSUzI1NiJ9.pupil.signature"
	probeDocument = "doc_biology_ten"
)

type received struct {
	method        string
	path          string
	query         map[string][]string
	tenant        string
	authorization string
	adminToken    string
	body          string
}

type probe struct {
	server *httptest.Server

	mu       sync.Mutex
	requests []received
	status   int
	body     string
}

func newProbe(t *testing.T) *probe {
	t.Helper()

	p := &probe{status: http.StatusOK, body: `{"ok":true}`}
	p.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)

		p.mu.Lock()
		p.requests = append(p.requests, received{
			method:        r.Method,
			path:          r.URL.EscapedPath(),
			query:         r.URL.Query(),
			tenant:        r.Header.Get("X-School-Id"),
			authorization: r.Header.Get("Authorization"),
			adminToken:    r.Header.Get("X-Admin-Token"),
			body:          string(raw),
		})
		status, body := p.status, p.body
		p.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(p.server.Close)
	return p
}

func (p *probe) answers(status int, body string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.status, p.body = status, body
}

func (p *probe) taken() []received {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]received, len(p.requests))
	copy(out, p.requests)
	return out
}

func (p *probe) only(t *testing.T) received {
	t.Helper()
	got := p.taken()
	if len(got) != 1 {
		t.Fatalf("want exactly one upstream request, got %d: %+v", len(got), got)
	}
	return got[0]
}

func (p *probe) client(t *testing.T) *Client {
	t.Helper()
	client, err := NewClient(ClientConfig{BaseURL: p.server.URL + "/", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("could not build a client: %v", err)
	}
	return client
}

func pupil() Caller { return Caller{Tenant: probeTenant, Bearer: probeToken} }

func chapterList(document string, sections string) string {
	return `{"documents":[{"document_id":"` + document + `","title":"Biology","sections":` +
		sections + `}],"total_sections":2}`
}

func whole(n int) *int { return &n }

func TestNewClientRefusesAnUnusableBaseURL(t *testing.T) {
	if _, err := NewClient(ClientConfig{BaseURL: "   "}); !errors.Is(err, ErrNoBaseURL) {
		t.Fatalf("a blank base URL must be refused as ErrNoBaseURL, got %v", err)
	}
	if _, err := NewClient(ClientConfig{BaseURL: "mindmap:8200"}); err == nil {
		t.Fatal("a base URL with no scheme must be refused, or every call fails later instead")
	}
}

func TestEveryCallCarriesTheCallersBearerAndTheSchoolSlug(t *testing.T) {
	calls := map[string]func(*Client) (Reply, error){
		"chapters": func(c *Client) (Reply, error) {
			return c.Chapters(context.Background(), pupil(), probeDocument)
		},
		"map": func(c *Client) (Reply, error) {
			return c.Map(context.Background(), pupil(), "sec_1")
		},
		"node": func(c *Client) (Reply, error) {
			return c.Node(context.Background(), pupil(), "sec_1", "atm_1")
		},
		"trace": func(c *Client) (Reply, error) {
			return c.Trace(context.Background(), pupil(), "sec_1", TraceQuery{From: "a", To: "b"})
		},
		"drill": func(c *Client) (Reply, error) {
			return c.Drill(context.Background(), pupil(), "sec_1", DrillQuery{})
		},
		"grade": func(c *Client) (Reply, error) {
			return c.Grade(context.Background(), pupil(), "sec_1", Attempt{})
		},
	}

	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			p := newProbe(t)
			p.answers(http.StatusOK, chapterList(probeDocument, `[{"id":"sec_1"}]`))

			if _, err := call(p.client(t)); err != nil {
				t.Fatalf("the call failed: %v", err)
			}

			got := p.only(t)
			if got.authorization != "Bearer "+probeToken {
				t.Fatalf("the caller's bearer must travel unchanged, the service received %q",
					got.authorization)
			}
			if got.tenant != probeTenant {
				t.Fatalf("X-School-Id must be the school's CAS slug, the service received %q", got.tenant)
			}
			if got.adminToken != "" {
				t.Fatalf("no admin token travels on this path, the service received %q", got.adminToken)
			}
		})
	}
}

func TestABearerAlreadyCarryingItsSchemeIsNotDoubled(t *testing.T) {
	p := newProbe(t)

	_, err := p.client(t).Map(context.Background(),
		Caller{Tenant: probeTenant, Bearer: "Bearer " + probeToken}, "sec_1")
	if err != nil {
		t.Fatalf("the call failed: %v", err)
	}
	if got := p.only(t).authorization; got != "Bearer "+probeToken {
		t.Fatalf("the scheme must appear once, the service received %q", got)
	}
}

func TestACallerWithNoTokenSendsNoAuthorizationHeader(t *testing.T) {
	p := newProbe(t)

	if _, err := p.client(t).Map(context.Background(), Caller{Tenant: probeTenant}, "sec_1"); err != nil {
		t.Fatalf("the call failed: %v", err)
	}
	if got := p.only(t).authorization; got != "" {
		t.Fatalf("an identity must never be invented, the service received %q", got)
	}
}

func TestACallWithNoTenantNeverLeaves(t *testing.T) {
	p := newProbe(t)

	_, err := p.client(t).Map(context.Background(), Caller{Tenant: "  ", Bearer: probeToken}, "sec_1")
	if !errors.Is(err, ErrNoTenant) {
		t.Fatalf("want ErrNoTenant, got %v", err)
	}
	if got := p.taken(); len(got) != 0 {
		t.Fatalf("a call with no tenant reached the service: %+v", got)
	}
}

func TestRoutesAndQueriesMatchTheServiceContract(t *testing.T) {
	p := newProbe(t)
	client := p.client(t)
	ctx := context.Background()

	if _, err := client.Map(ctx, pupil(), "sec_1"); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Node(ctx, pupil(), "sec_1", "atm/9"); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Trace(ctx, pupil(), "sec_1",
		TraceQuery{From: "atm_1", To: "atm_2", MaxHops: whole(4)}); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Grade(ctx, pupil(), "sec_1", Attempt{
		N: whole(5), Seed: whole(7), Answers: map[string]string{"q1": "stomata"},
	}); err != nil {
		t.Fatal(err)
	}

	got := p.taken()
	if len(got) != 4 {
		t.Fatalf("want four upstream requests, got %d", len(got))
	}

	if got[0].method != http.MethodGet || got[0].path != "/map/sec_1" {
		t.Fatalf("the map was asked for as %s %s", got[0].method, got[0].path)
	}
	if got[1].path != "/map/sec_1/node/atm%2F9" {
		t.Fatalf("a node id must be escaped into one path segment, got %s", got[1].path)
	}
	if got[2].path != "/map/sec_1/trace" {
		t.Fatalf("the trace was asked for as %s", got[2].path)
	}
	trace := got[2].query
	if trace["from"][0] != "atm_1" || trace["to"][0] != "atm_2" || trace["max_hops"][0] != "4" {
		t.Fatalf("the trace query lost a parameter: %v", trace)
	}
	if got[3].method != http.MethodPost || got[3].path != "/map/sec_1/drill/grade" {
		t.Fatalf("the grade was sent as %s %s", got[3].method, got[3].path)
	}

	var attempt map[string]any
	if err := json.Unmarshal([]byte(got[3].body), &attempt); err != nil {
		t.Fatalf("the grade body is not JSON: %v (%s)", err, got[3].body)
	}
	if attempt["n"] != float64(5) || attempt["seed"] != float64(7) {
		t.Fatalf("the grade body lost the drill's parameters: %s", got[3].body)
	}
	if _, sent := attempt["kind"]; sent {
		t.Fatalf("a kind the caller never named must be left to the service's default: %s", got[3].body)
	}
	answers, _ := attempt["answers"].(map[string]any)
	if answers["q1"] != "stomata" {
		t.Fatalf("the grade body lost the answers: %s", got[3].body)
	}
}

func TestADrillNeverAsksForItsAnswers(t *testing.T) {
	p := newProbe(t)

	_, err := p.client(t).Drill(context.Background(), pupil(), "sec_1", DrillQuery{
		Kind: "label", N: whole(8), Seed: whole(3), TopicID: "top_2",
	})
	if err != nil {
		t.Fatalf("the call failed: %v", err)
	}

	got := p.only(t)
	if got.path != "/map/sec_1/drill" {
		t.Fatalf("the drill was asked for as %s", got.path)
	}
	if answers := got.query["with_answers"]; len(answers) != 1 || answers[0] != "false" {
		t.Fatalf("a drill must always be asked for with_answers=false, the service received %v", answers)
	}
	for name, want := range map[string]string{"kind": "label", "n": "8", "seed": "3", "topic_id": "top_2"} {
		if values := got.query[name]; len(values) != 1 || values[0] != want {
			t.Fatalf("the drill query sent %s=%v, want %s", name, values, want)
		}
	}
}

func TestAnUpstreamStatusIsReportedNotRaised(t *testing.T) {
	for _, status := range []int{400, 401, 403, 404, 409, 422, 500, 502, 503} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			p := newProbe(t)
			p.answers(status, `{"detail":"the engine said `+strconv.Itoa(status)+`"}`)

			reply, err := p.client(t).Map(context.Background(), pupil(), "sec_1")
			if err != nil {
				t.Fatalf("a status the service answered with is a reply, not an error: %v", err)
			}
			if reply.Status != status || reply.OK() {
				t.Fatalf("want status %d and not OK, got %d (ok=%v)", status, reply.Status, reply.OK())
			}
			if reply.Detail() != "the engine said "+strconv.Itoa(status) {
				t.Fatalf("the upstream message was lost: %q", reply.Detail())
			}
		})
	}
}

func TestDetailReadsEveryShapeTheServiceAnswersWith(t *testing.T) {
	cases := map[string]string{
		`{"detail":"unknown section"}`:                      "unknown section",
		`{"detail":[{"loc":["query","kind"],"msg":"bad"}]}`: "",
		`{"message":"plain"}`:                               "",
		`{"detail":null}`:                                   "",
		`<html>bad gateway</html>`:                          "",
	}
	for body, want := range cases {
		if got := (Reply{Status: 422, Body: []byte(body)}).Detail(); got != want {
			t.Errorf("Detail(%s) = %q, want %q", body, got, want)
		}
	}
}

func TestAnUnreachableServiceIsNamedAsSuch(t *testing.T) {
	p := newProbe(t)
	client := p.client(t)
	p.server.Close()

	_, err := client.Map(context.Background(), pupil(), "sec_1")
	if !errors.Is(err, ErrUnreachable) {
		t.Fatalf("want ErrUnreachable, got %v", err)
	}
}

func TestARedirectIsNotFollowedWithTheCallersBearer(t *testing.T) {
	elsewhere := newProbe(t)
	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, elsewhere.server.URL+"/map/sec_1", http.StatusFound)
	}))
	t.Cleanup(redirector.Close)

	client, err := NewClient(ClientConfig{BaseURL: redirector.URL})
	if err != nil {
		t.Fatal(err)
	}
	reply, err := client.Map(context.Background(), pupil(), "sec_1")
	if err != nil {
		t.Fatalf("a redirect is a reply the caller maps, not an error: %v", err)
	}
	if reply.Status != http.StatusFound {
		t.Fatalf("want the 302 reported, got %d", reply.Status)
	}
	if got := elsewhere.taken(); len(got) != 0 {
		t.Fatalf("the redirect was followed and the bearer travelled with it: %+v", got)
	}
}

func TestSectionIDsFlattensWhateverNestingTheListHas(t *testing.T) {
	body := `{"documents":[
		{"document_id":"doc_a","sections":[
			{"id":"sec_1","children":[{"id":"sec_1_1","children":[{"id":"sec_1_1_1"}]}]},
			{"id":"sec_2","sections":[{"id":"sec_2_1"}]}
		]},
		{"document_id":"doc_b","sections":[{"id":"sec_other"}]}
	],"total_sections":6}`

	ids, err := SectionIDs([]byte(body), "doc_a")
	if err != nil {
		t.Fatalf("the list could not be read: %v", err)
	}
	for _, want := range []string{"sec_1", "sec_1_1", "sec_1_1_1", "sec_2", "sec_2_1"} {
		if _, ok := ids[want]; !ok {
			t.Errorf("%s belongs to doc_a and was not collected: %v", want, ids)
		}
	}
	if _, ok := ids["sec_other"]; ok {
		t.Fatal("a section of another document was collected, so a section could be filed " +
			"against the wrong book")
	}
	if len(ids) != 5 {
		t.Fatalf("want five sections, got %d: %v", len(ids), ids)
	}
}

func TestSectionIDsRefusesABodyThatIsNotAChapterList(t *testing.T) {
	for _, body := range []string{`not json`, `{}`, `{"documents":null}`, `[]`} {
		if _, err := SectionIDs([]byte(body), "doc_a"); !errors.Is(err, ErrUnreadable) {
			t.Errorf("SectionIDs(%s) must be ErrUnreadable, got %v", body, err)
		}
	}

	ids, err := SectionIDs([]byte(`{"documents":[],"total_sections":0}`), "doc_a")
	if err != nil || len(ids) != 0 {
		t.Fatalf("an empty list is an answer, not an unreadable body: %v %v", ids, err)
	}
}

func TestHasSectionAdmitsOnlyASectionOfTheNamedDocument(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusOK, `{"documents":[
		{"document_id":"`+probeDocument+`","sections":[{"id":"sec_mine"}]},
		{"document_id":"doc_other","sections":[{"id":"sec_theirs"}]}
	],"total_sections":2}`)
	client := p.client(t)

	belongs, refusal, err := client.HasSection(context.Background(), pupil(), probeDocument, "sec_mine")
	if err != nil || refusal != nil || !belongs {
		t.Fatalf("sec_mine is in the document: belongs=%v refusal=%v err=%v", belongs, refusal, err)
	}

	belongs, refusal, err = client.HasSection(context.Background(), pupil(), probeDocument, "sec_theirs")
	if err != nil || refusal != nil {
		t.Fatalf("the check itself failed: refusal=%v err=%v", refusal, err)
	}
	if belongs {
		t.Fatal("a section listed under another document was admitted")
	}

	first := p.taken()[0]
	if first.path != "/chapters" || first.query["document_id"][0] != probeDocument {
		t.Fatalf("membership must be read from /chapters?document_id=, got %s %v", first.path, first.query)
	}
}

func TestHasSectionAnswersAKnownSectionFromTheCacheAndAsksAgainForAnUnknownOne(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusOK, chapterList(probeDocument, `[{"id":"sec_1"},{"id":"sec_2"}]`))
	client := p.client(t)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		belongs, _, err := client.HasSection(ctx, pupil(), probeDocument, "sec_1")
		if err != nil || !belongs {
			t.Fatalf("sec_1 belongs: %v %v", belongs, err)
		}
	}
	if got := len(p.taken()); got != 1 {
		t.Fatalf("a section already known to belong must be answered from the cache, "+
			"the service was asked %d times", got)
	}

	p.answers(http.StatusOK, chapterList(probeDocument, `[{"id":"sec_1"},{"id":"sec_reminted"}]`))
	belongs, _, err := client.HasSection(ctx, pupil(), probeDocument, "sec_reminted")
	if err != nil || !belongs {
		t.Fatalf("a section the cache has not seen must be asked for again, so a renamed "+
			"chapter is not a 404 for a minute: %v %v", belongs, err)
	}
	if got := len(p.taken()); got != 2 {
		t.Fatalf("want one more upstream request for the unknown section, got %d in total", got)
	}
}

func TestTheSectionCacheIsKeyedBySchoolAndDocument(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusOK, chapterList(probeDocument, `[{"id":"sec_1"}]`))
	client := p.client(t)
	ctx := context.Background()

	if belongs, _, err := client.HasSection(ctx, pupil(), probeDocument, "sec_1"); err != nil || !belongs {
		t.Fatalf("sec_1 belongs: %v %v", belongs, err)
	}

	p.answers(http.StatusOK, `{"documents":[],"total_sections":0}`)
	other := Caller{Tenant: "another-school", Bearer: probeToken}
	belongs, _, err := client.HasSection(ctx, other, probeDocument, "sec_1")
	if err != nil {
		t.Fatalf("the check itself failed: %v", err)
	}
	if belongs {
		t.Fatal("one school's cached chapter list admitted a section for another school")
	}
	if got := len(p.taken()); got != 2 {
		t.Fatalf("the second school must be asked about on its own, got %d requests", got)
	}
}

func TestTheSectionCacheExpires(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusOK, chapterList(probeDocument, `[{"id":"sec_1"}]`))
	client := p.client(t)
	ctx := context.Background()

	now := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	client.sections.now = func() time.Time { return now }

	if _, _, err := client.HasSection(ctx, pupil(), probeDocument, "sec_1"); err != nil {
		t.Fatal(err)
	}
	now = now.Add(SectionCacheTTL - time.Second)
	if _, _, err := client.HasSection(ctx, pupil(), probeDocument, "sec_1"); err != nil {
		t.Fatal(err)
	}
	if got := len(p.taken()); got != 1 {
		t.Fatalf("inside the TTL the cache must answer, the service was asked %d times", got)
	}

	now = now.Add(2 * time.Second)
	if _, _, err := client.HasSection(ctx, pupil(), probeDocument, "sec_1"); err != nil {
		t.Fatal(err)
	}
	if got := len(p.taken()); got != 2 {
		t.Fatalf("past the TTL the service must be asked again, got %d requests", got)
	}
}

func TestTheSectionCacheIsBounded(t *testing.T) {
	now := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	cache := newSectionCache(time.Minute, 3, func() time.Time { return now })

	for i := 0; i < 10; i++ {
		now = now.Add(time.Second)
		cache.store(sectionKey{tenant: probeTenant, document: "doc_" + strconv.Itoa(i)},
			[]Section{{ID: "sec"}})
	}

	if cache.size() != 3 {
		t.Fatalf("the cache must hold at most 3 entries, it holds %d", cache.size())
	}
	if !cache.holds(sectionKey{tenant: probeTenant, document: "doc_9"}, "sec") {
		t.Fatal("the entry just stored was evicted")
	}
	if cache.holds(sectionKey{tenant: probeTenant, document: "doc_0"}, "sec") {
		t.Fatal("the oldest entry survived a full cache")
	}
}

func TestHasSectionHandsBackARefusalInsteadOfAVerdict(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusForbidden, `{"detail":"a token that names no school cannot read a school's books"}`)

	belongs, refusal, err := p.client(t).HasSection(context.Background(), pupil(), probeDocument, "sec_1")
	if err != nil {
		t.Fatalf("a refusal is a reply, not an error: %v", err)
	}
	if belongs {
		t.Fatal("a refused chapter list admitted a section")
	}
	if refusal == nil || refusal.Status != http.StatusForbidden {
		t.Fatalf("the caller must be handed the upstream refusal to relay, got %+v", refusal)
	}
}

func TestAnUnreadableChapterListIsNotCachedAsEmpty(t *testing.T) {
	p := newProbe(t)
	p.answers(http.StatusOK, `{"chapters":[]}`)
	client := p.client(t)

	_, _, err := client.HasSection(context.Background(), pupil(), probeDocument, "sec_1")
	if !errors.Is(err, ErrUnreadable) {
		t.Fatalf("a body that is not the chapter list must be ErrUnreadable, got %v", err)
	}
	if client.sections.size() != 0 {
		t.Fatal("an unreadable list left an entry in the cache")
	}
}

func TestDetailIsRelayedOnlyWhenTheServiceWroteASentence(t *testing.T) {
	validation, err := os.ReadFile(filepath.Join("testdata", "refusal_drill_bad_kind.json"))
	if err != nil {
		t.Fatalf("the captured refusal is missing: %v", err)
	}

	unspoken := map[string]string{
		"the validation list FastAPI answers with": string(validation),
		"an object":               `{"detail":{"reason":"kind","allowed":["label"]}}`,
		"a number":                `{"detail":422}`,
		"a boolean":               `{"detail":false}`,
		"null":                    `{"detail":null}`,
		"no detail at all":        `{"message":"plain","error":"x"}`,
		"an empty sentence":       `{"detail":"   "}`,
		"a body that is not JSON": `<html>bad gateway</html>`,
		"an empty body":           ``,
	}
	for name, body := range unspoken {
		if got := (Reply{Status: 422, Body: []byte(body)}).Detail(); got != "" {
			t.Errorf("%s is not a sentence to relay, yet Detail() gave %q", name, got)
		}
	}

	spoken := `{"detail":"  kind must be one of label, relation, placement "}`
	if got := (Reply{Status: 422, Body: []byte(spoken)}).Detail(); got != "kind must be one of label, relation, placement" {
		t.Fatalf("a sentence must be relayed as it was written, got %q", got)
	}
}
