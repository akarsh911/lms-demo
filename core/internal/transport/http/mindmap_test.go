package http

import (
	"context"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/config"
	tenantent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated"
	entcontentitem "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
	"github.com/Harbour-Emerge/emerge-core/internal/service/mindmap"
	mw "github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
)

type mindmapReceived struct {
	method        string
	path          string
	query         map[string][]string
	tenant        string
	authorization string
	adminToken    string
	body          string
}

type mindmapAnswer struct {
	status int
	body   string
}

type mindmapProbe struct {
	server *httptest.Server

	mu        sync.Mutex
	requests  []mindmapReceived
	chapters  map[string][]string
	trees     map[string]string
	overrides map[string]mindmapAnswer
	refusals  map[string]mindmapAnswer
	onRequest func()
}

func mindmapMapBody(section string) string {
	return `{"meta":{"section_id":"` + section + `","title":"Life Processes"},` +
		`"nodes":[{"id":"atm_1","label":"stomata","position":{"x":1.5,"y":-2}}],` +
		`"edges":[],"relation_grammar":{"causes":{"stroke":"solid"}}}`
}

func newMindmapProbe(t *testing.T) *mindmapProbe {
	t.Helper()

	p := &mindmapProbe{
		chapters:  map[string][]string{},
		trees:     map[string]string{},
		overrides: map[string]mindmapAnswer{},
		refusals:  map[string]mindmapAnswer{},
	}
	p.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)

		p.mu.Lock()
		hook := p.onRequest
		p.requests = append(p.requests, mindmapReceived{
			method:        r.Method,
			path:          r.URL.Path,
			query:         r.URL.Query(),
			tenant:        r.Header.Get("X-School-Id"),
			authorization: r.Header.Get("Authorization"),
			adminToken:    r.Header.Get("X-Admin-Token"),
			body:          string(raw),
		})
		answer := p.answerFor(r)
		p.mu.Unlock()

		if hook != nil {
			hook()
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(answer.status)
		_, _ = io.WriteString(w, answer.body)
	}))
	t.Cleanup(p.server.Close)
	return p
}

func (p *mindmapProbe) answerFor(r *http.Request) mindmapAnswer {
	if refusal, refused := p.refusals[r.Header.Get("Authorization")]; refused {
		return refusal
	}

	kind := "map"
	if r.URL.Path == "/chapters" {
		kind = "chapters"
	}
	if forced, ok := p.overrides[kind]; ok {
		return forced
	}

	if kind == "chapters" {
		document := r.URL.Query().Get("document_id")
		if tree, shelved := p.trees[document]; shelved {
			return mindmapAnswer{http.StatusOK, `{"documents":[{"document_id":"` + document +
				`","structure":"toc","sections":` + tree + `}],"total_sections":0}`}
		}
		sections, known := p.chapters[document]
		if !known {
			return mindmapAnswer{http.StatusNotFound,
				`{"detail":"unknown document (or not visible to this tenant)"}`}
		}
		listed := make([]string, 0, len(sections))
		for _, id := range sections {
			listed = append(listed, `{"id":"`+id+`","title":"Chapter `+id+`"}`)
		}
		return mindmapAnswer{http.StatusOK, `{"documents":[{"document_id":"` + document +
			`","structure":"toc","sections":[` + strings.Join(listed, ",") + `]}],"total_sections":` +
			strconv.Itoa(len(sections)) + `}`}
	}

	section := strings.Split(strings.TrimPrefix(r.URL.Path, "/map/"), "/")[0]
	return mindmapAnswer{http.StatusOK, mindmapMapBody(section)}
}

func (p *mindmapProbe) holds(document string, sections ...string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.chapters[document] = sections
}

func (p *mindmapProbe) shelves(document, sections string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.trees[document] = sections
}

func (p *mindmapProbe) denies(authorization string, status int, body string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.refusals[authorization] = mindmapAnswer{status, body}
}

func (p *mindmapProbe) bearing(authorization, path string) int {
	n := 0
	for _, got := range p.taken() {
		if got.authorization == authorization && got.path == path {
			n++
		}
	}
	return n
}

func (p *mindmapProbe) forces(kind string, status int, body string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.overrides[kind] = mindmapAnswer{status, body}
}

func (p *mindmapProbe) taken() []mindmapReceived {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]mindmapReceived, len(p.requests))
	copy(out, p.requests)
	return out
}

func (p *mindmapProbe) forget() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.requests = nil
}

func (p *mindmapProbe) reaching(prefix string) []mindmapReceived {
	var out []mindmapReceived
	for _, got := range p.taken() {
		if strings.HasPrefix(got.path, prefix) {
			out = append(out, got)
		}
	}
	return out
}

func mindmapsSwitchedOn(t *testing.T, server *Server, probe *mindmapProbe) {
	t.Helper()

	client, err := mindmap.NewClient(mindmap.ClientConfig{
		BaseURL: probe.server.URL,
		Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("could not build a mind-map client: %v", err)
	}
	UseMindmaps(client)
	t.Cleanup(func() { UseMindmaps(nil) })

	server.cfg = &config.Config{MindmapEnabled: true, MindmapEngineBaseURL: probe.server.URL}
}

type mindmapRoute struct {
	method  string
	path    string
	pattern string
	body    string
	entity  authorization.Entity
}

func mindmapRoutes() []mindmapRoute {
	item := "/api/v1/learning/mindmaps/" + probeID
	chapter := item + "/chapters/sec_1"
	pattern := "/api/v1/learning/mindmaps/{item_id}/chapters/{section_id}"

	read := authorization.MindmapsRead
	return []mindmapRoute{
		{"GET", "/api/v1/learning/mindmaps", "/api/v1/learning/mindmaps", "", read},
		{"GET", item + "/chapters", "/api/v1/learning/mindmaps/{item_id}/chapters", "", read},
		{"GET", chapter, pattern, "", read},
		{"GET", chapter + "/nodes/atm_1", pattern + "/nodes/{node_id}", "", read},
		{"GET", chapter + "/trace?from=atm_1&to=atm_2", pattern + "/trace", "", read},
		{"GET", chapter + "/drill", pattern + "/drill", "", read},
		{"POST", chapter + "/drill/grade", pattern + "/drill/grade", `{"answers":{}}`, read},
		{"GET", chapter + "/mastery", pattern + "/mastery", "", authorization.ConceptMasteryRead},
		{"PUT", chapter + "/mastery", pattern + "/mastery", `{"states":{}}`,
			authorization.ConceptMasteryWrite},
		{"GET", "/api/v1/curriculum-nodes/" + probeID + "/mindmaps",
			"/api/v1/curriculum-nodes/{id}/mindmaps", "", read},
	}
}

func mindmapRouter(guard authorization.Guard) (http.Handler, *Server) {
	server := quietServer(guard)
	router := chi.NewRouter()
	router.Route("/api/v1", func(r chi.Router) {
		r.Use(mw.DevSubject(slog.New(slog.NewTextHandler(io.Discard, nil))))
		server.mountCurriculum(r)
		server.mountLearning(r)
	})
	return router, server
}

func sendMindmap(router http.Handler, route mindmapRoute) *httptest.ResponseRecorder {
	req := httptest.NewRequest(route.method, route.path, strings.NewReader(route.body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func mindmapRefusalOf(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the refusal is not JSON: %v (%q)", err, rec.Body.String())
	}
	return body
}

func TestMindmapRoutesAreMountedOnTheRealRouter(t *testing.T) {
	found := mountedPatterns(t)

	for _, route := range mindmapRoutes() {
		mounted := false
		for got := range found {
			method, pattern, _ := strings.Cut(got, " ")
			if method == route.method && samePattern(route.pattern, pattern) {
				mounted = true
			}
		}
		if !mounted {
			t.Errorf("%s %s is not mounted on the real router, so the handler is unreachable "+
				"however well it is tested", route.method, route.pattern)
		}
	}
}

func TestMindmapRoutesSitInsideTheTenantPlane(t *testing.T) {
	router, guard := offlineRouter(t)

	for _, route := range mindmapRoutes() {
		t.Run(route.method+" "+route.pattern, func(t *testing.T) {
			guard.forget()

			rec := sendMindmap(router, route)
			if why := routerRefused(rec); why != "" {
				t.Fatalf("%s (status %d, body %s)", why, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), mw.SchoolHeader) {
				t.Fatalf("with no %s the real router must refuse before anything else, got %d: %s",
					mw.SchoolHeader, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if probes := guard.taken(); len(probes) != 0 {
				t.Fatalf("authorization ran before the tenant was resolved: %+v", probes)
			}
		})
	}
}

func TestEveryMindmapRouteIsGuardedByItsOwnKeyAndByTheMindmapKey(t *testing.T) {
	guard := &recordingGuard{}
	router, _ := mindmapRouter(guard)

	for _, route := range mindmapRoutes() {
		t.Run(route.method+" "+route.pattern, func(t *testing.T) {
			guard.forget()

			rec := sendMindmap(router, route)
			if why := routerRefused(rec); why != "" {
				t.Fatalf("%s (status %d, body %s)", why, rec.Code, strings.TrimSpace(rec.Body.String()))
			}

			probes := guard.taken()
			if len(probes) == 0 {
				t.Fatalf("the guard was never consulted (status %d)", rec.Code)
			}
			if probes[0].entity != route.entity {
				t.Fatalf("the route authorized %q first, the contract says %q",
					probes[0].entity, route.entity)
			}
			if !samePattern(route.pattern, probes[0].pattern) {
				t.Fatalf("chi matched %q, not %q, so another route shadows this one",
					probes[0].pattern, route.pattern)
			}

			gated := false
			for _, probe := range probes {
				gated = gated || probe.entity == authorization.MindmapsRead
			}
			if !gated {
				t.Fatalf("the route never asked for %q, so switching mind maps off for a group "+
					"would leave it open: %+v", authorization.MindmapsRead, probes)
			}
		})
	}
}

type mindmapDenyingGuard struct{}

func (mindmapDenyingGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if entity == authorization.MindmapsRead {
		return authorization.Decision{}, nil
	}
	return authorization.Decision{Allowed: true}, nil
}

func (mindmapDenyingGuard) Name() string { return "mind map key withheld (test)" }

func TestACallerWithoutTheMindmapKeyIsForbiddenBeforeAnythingElse(t *testing.T) {
	probe := newMindmapProbe(t)
	router, server := mindmapRouter(mindmapDenyingGuard{})
	mindmapsSwitchedOn(t, server, probe)

	for _, route := range mindmapRoutes() {
		t.Run(route.method+" "+route.pattern, func(t *testing.T) {
			rec := sendMindmap(router, route)

			if rec.Code != http.StatusForbidden {
				t.Fatalf("want 403 without %s, got %d: %s", authorization.MindmapsRead,
					rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if !strings.Contains(rec.Body.String(), string(authorization.MindmapsRead)) {
				t.Fatalf("the refusal must name the key that is missing: %s", rec.Body.String())
			}
		})
	}
	if got := probe.taken(); len(got) != 0 {
		t.Fatalf("a caller without the key reached the mind-map service: %+v", got)
	}
}

func TestEveryMindmapRouteRefusesWhileTheServiceIsSwitchedOff(t *testing.T) {
	probe := newMindmapProbe(t)
	live, err := mindmap.NewClient(mindmap.ClientConfig{BaseURL: probe.server.URL})
	if err != nil {
		t.Fatal(err)
	}

	states := []struct {
		name   string
		cfg    *config.Config
		client *mindmap.Client
	}{
		{"no configuration at all", nil, live},
		{"the flag is off", &config.Config{MindmapEngineBaseURL: probe.server.URL}, live},
		{"the flag is on with no base URL", &config.Config{MindmapEnabled: true}, live},
		{"configured but no client was built",
			&config.Config{MindmapEnabled: true, MindmapEngineBaseURL: probe.server.URL}, nil},
	}

	for _, state := range states {
		for _, route := range mindmapRoutes() {
			t.Run(state.name+": "+route.method+" "+route.pattern, func(t *testing.T) {
				router, server := mindmapRouter(authorization.AllowAll{})
				server.cfg = state.cfg
				UseMindmaps(state.client)
				t.Cleanup(func() { UseMindmaps(nil) })

				rec := sendMindmap(router, route)

				if rec.Code != http.StatusServiceUnavailable {
					t.Fatalf("want 503, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
				}
				body := mindmapRefusalOf(t, rec)
				if body["code"] != MindmapDisabledCode {
					t.Fatalf("want code %s, got %v", MindmapDisabledCode, body["code"])
				}
				message, _ := body["message"].(string)
				for _, variable := range []string{"MINDMAP_ENABLED", "MINDMAP_ENGINE_BASE_URL"} {
					if !strings.Contains(message, variable) {
						t.Fatalf("the refusal must name %s: %s", variable, message)
					}
				}
				if _, listed := body["mindmaps"]; listed {
					t.Fatalf("a switched-off service answered with a list: %s", rec.Body.String())
				}
			})
		}
	}
	if got := probe.taken(); len(got) != 0 {
		t.Fatalf("a switched-off deployment still called the mind-map service: %+v", got)
	}
}

func TestMindmapQueriesAndBodiesAreRefusedBeforeAnyLookup(t *testing.T) {
	probe := newMindmapProbe(t)
	router, server := mindmapRouter(authorization.AllowAll{})
	mindmapsSwitchedOn(t, server, probe)

	chapter := "/api/v1/learning/mindmaps/" + probeID + "/chapters/sec_1"
	cases := []struct {
		name  string
		route mindmapRoute
		names string
	}{
		{"a parameter on the chapter list",
			mindmapRoute{method: "GET", path: "/api/v1/learning/mindmaps/" + probeID + "/chapters?subject=x"}, "subject"},
		{"a parameter on the map",
			mindmapRoute{method: "GET", path: chapter + "?include_descendants=true"}, "include_descendants"},
		{"a parameter on a node",
			mindmapRoute{method: "GET", path: chapter + "/nodes/atm_1?expand=1"}, "expand"},
		{"a trace with no source",
			mindmapRoute{method: "GET", path: chapter + "/trace?to=atm_2"}, "from"},
		{"a trace with no target",
			mindmapRoute{method: "GET", path: chapter + "/trace?from=atm_1"}, "to"},
		{"a trace with a misspelt parameter",
			mindmapRoute{method: "GET", path: chapter + "/trace?from=a&to=b&maxhops=3"}, "maxhops"},
		{"a trace whose hop count is not a number",
			mindmapRoute{method: "GET", path: chapter + "/trace?from=a&to=b&max_hops=many"}, "max_hops"},
		{"a drill with a misspelt parameter",
			mindmapRoute{method: "GET", path: chapter + "/drill?topic=top_1"}, "topic"},
		{"a drill whose size is not a number",
			mindmapRoute{method: "GET", path: chapter + "/drill?n=ten"}, "n must be a whole number"},
		{"a grade that is not JSON",
			mindmapRoute{method: "POST", path: chapter + "/drill/grade", body: `answers=1`}, "invalid JSON body"},
		{"a grade with no answers",
			mindmapRoute{method: "POST", path: chapter + "/drill/grade", body: `{"n":5}`}, "answers"},
		{"a grade whose answers are not an object of text",
			mindmapRoute{method: "POST", path: chapter + "/drill/grade", body: `{"answers":["a"]}`}, "answers"},
		{"a grade with a field the contract does not name",
			mindmapRoute{method: "POST", path: chapter + "/drill/grade",
				body: `{"answers":{},"with_answers":true}`}, "with_answers"},
		{"a grade whose seed is not a number",
			mindmapRoute{method: "POST", path: chapter + "/drill/grade",
				body: `{"answers":{},"seed":"x"}`}, "seed"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := sendMindmap(router, tc.route)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("want 400, got %d: %s", rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if !strings.Contains(rec.Body.String(), tc.names) {
				t.Fatalf("the refusal must name %q: %s", tc.names, rec.Body.String())
			}
		})
	}
	if got := probe.taken(); len(got) != 0 {
		t.Fatalf("a malformed request reached the mind-map service: %+v", got)
	}
}

func TestUpstreamStatusesMapOntoTheContract(t *testing.T) {
	superadmin := "a token that names no school cannot read one school's books"

	cases := []struct {
		upstream int
		detail   string
		want     int
		code     string
		says     []string
	}{
		{http.StatusBadRequest, "X-School-Id header is required", http.StatusBadRequest,
			MindmapRefusedCode, []string{"X-School-Id header is required"}},
		{http.StatusUnauthorized, "token audience is not this engine", http.StatusUnauthorized,
			MindmapRefusedCode, []string{"token audience is not this engine"}},
		{http.StatusForbidden, superadmin, http.StatusForbidden,
			MindmapRefusedCode, []string{superadmin}},
		{http.StatusNotFound, "unknown node in this map", http.StatusNotFound,
			MindmapRefusedCode, []string{"unknown node in this map"}},
		{http.StatusConflict, "structure is not confirmed", http.StatusConflict,
			MindmapRefusedCode, []string{"structure is not confirmed"}},
		{http.StatusUnprocessableEntity, "answers must be an object", http.StatusUnprocessableEntity,
			MindmapRefusedCode, []string{"answers must be an object"}},
		{http.StatusServiceUnavailable, "scopes authorizer unreachable", http.StatusServiceUnavailable,
			MindmapEngineDownCode, []string{"retrieval engine", "scopes authorizer unreachable"}},
		{http.StatusInternalServerError, "boom", http.StatusBadGateway,
			MindmapServiceDownCode, []string{"mind-map service", "500"}},
		{http.StatusBadGateway, "upstream retrieval engine: timed out", http.StatusBadGateway,
			MindmapServiceDownCode, []string{"mind-map service", "502"}},
		{http.StatusGatewayTimeout, "", http.StatusBadGateway,
			MindmapServiceDownCode, []string{"mind-map service", "504"}},
		{http.StatusFound, "", http.StatusBadGateway,
			MindmapServiceDownCode, []string{"mind-map service", "302"}},
		{http.StatusNoContent, "", http.StatusBadGateway,
			MindmapServiceDownCode, []string{"mind-map service", "204"}},
	}

	for _, tc := range cases {
		t.Run(strconv.Itoa(tc.upstream), func(t *testing.T) {
			raw, _ := json.Marshal(map[string]string{"detail": tc.detail})
			rec := httptest.NewRecorder()

			relayMindmap(context.Background(), rec, mindmap.Reply{Status: tc.upstream, Body: raw}, nil)

			if rec.Code != tc.want {
				t.Fatalf("upstream %d must answer %d, got %d: %s",
					tc.upstream, tc.want, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			body := mindmapRefusalOf(t, rec)
			if body["code"] != tc.code {
				t.Fatalf("want code %s, got %v", tc.code, body["code"])
			}
			message, _ := body["message"].(string)
			for _, fragment := range tc.says {
				if !strings.Contains(message, fragment) {
					t.Fatalf("the message must say %q: %s", fragment, message)
				}
			}
		})
	}
}

func TestTheMultiSchoolRefusalIsNotRewordedAsAnOutage(t *testing.T) {
	message := "a token that names no school cannot read one school's books"
	raw, _ := json.Marshal(map[string]string{"detail": message})
	rec := httptest.NewRecorder()

	relayMindmap(context.Background(), rec,
		mindmap.Reply{Status: http.StatusForbidden, Body: raw}, nil)

	body := mindmapRefusalOf(t, rec)
	if rec.Code != http.StatusForbidden || body["message"] != message {
		t.Fatalf("the engine's 403 must arrive as a 403 carrying its own words, got %d %v",
			rec.Code, body["message"])
	}
	for _, outage := range []string{"unavailable", "could not be reached", "outage"} {
		if strings.Contains(rec.Body.String(), outage) {
			t.Fatalf("the refusal reads as an outage (%q): %s", outage, rec.Body.String())
		}
	}
}

func TestAnUnreachableOrUnreadableServiceIsABadGatewayNamingIt(t *testing.T) {
	for name, err := range map[string]error{
		"unreachable": mindmap.ErrUnreachable,
		"unreadable":  mindmap.ErrUnreadable,
	} {
		t.Run(name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			relayMindmap(context.Background(), rec, mindmap.Reply{}, err)

			if rec.Code != http.StatusBadGateway {
				t.Fatalf("want 502, got %d: %s", rec.Code, rec.Body.String())
			}
			body := mindmapRefusalOf(t, rec)
			message, _ := body["message"].(string)
			if body["code"] != MindmapServiceDownCode || !strings.Contains(message, "mind-map service") {
				t.Fatalf("the refusal must name the mind-map service: %s", rec.Body.String())
			}
		})
	}

	rec := httptest.NewRecorder()
	relayMindmap(context.Background(), rec,
		mindmap.Reply{Status: http.StatusOK, Body: []byte("<html>ok</html>")}, nil)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("a 200 that is not JSON must not be relayed as JSON, got %d: %s",
			rec.Code, rec.Body.String())
	}
}

func TestAMapIsRelayedByteForByte(t *testing.T) {
	upstream := mindmapMapBody("sec_1")
	rec := httptest.NewRecorder()

	relayMindmap(context.Background(), rec,
		mindmap.Reply{Status: http.StatusOK, Body: []byte(upstream)}, nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	if rec.Body.String() != upstream {
		t.Fatalf("the map was re-modelled on the way through:\n got %s\nwant %s",
			rec.Body.String(), upstream)
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
		t.Fatalf("the relayed map must be served as JSON, got %q", got)
	}
}

func TestMindmapStateIsDerivedFromTheItemsOwnColumns(t *testing.T) {
	document := "doc_1"
	blank := "  "

	cases := []struct {
		name     string
		status   entcontentitem.IndexStatus
		document *string
		want     string
	}{
		{"indexed with a document", entcontentitem.IndexStatusIndexed, &document, MindmapAvailable},
		{"re-queued while the last index still stands", entcontentitem.IndexStatusPending, &document, MindmapAvailable},
		{"indexed but naming no document", entcontentitem.IndexStatusIndexed, nil, MindmapNotIndexed},
		{"indexed with a blank document", entcontentitem.IndexStatusIndexed, &blank, MindmapNotIndexed},
		{"held", entcontentitem.IndexStatusHeld, nil, MindmapHeld},
		{"parked", entcontentitem.IndexStatusParked, nil, MindmapParked},
		{"pending", entcontentitem.IndexStatusPending, nil, MindmapPending},
		{"failed", entcontentitem.IndexStatusFailed, nil, MindmapFailed},
		{"never sent", entcontentitem.IndexStatusNone, nil, MindmapNotIndexed},
	}

	for _, tc := range cases {
		row := &tenantent.ContentItem{IndexStatus: tc.status, EngineDocumentID: tc.document}
		if got := mindmapStateOf(row); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestAHeldBookReadsAsMaterialWaitingAndNeverAsNoMaterial(t *testing.T) {
	rec := httptest.NewRecorder()
	refuseUnindexedMindmap(rec, &tenantent.ContentItem{IndexStatus: entcontentitem.IndexStatusHeld})

	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d", rec.Code)
	}
	body := mindmapRefusalOf(t, rec)
	if body["index_status"] != "held" || body["mindmap_state"] != MindmapHeld {
		t.Fatalf("the refusal must name the held state: %s", rec.Body.String())
	}
	message, _ := body["message"].(string)
	if !strings.Contains(message, "held") || !strings.Contains(message, "the material exists") {
		t.Fatalf("a held book must read as material waiting on a build: %s", message)
	}
	for _, wrong := range []string{"no material", "has not been indexed", "not been uploaded"} {
		if strings.Contains(message, wrong) {
			t.Fatalf("a held book read as %q: %s", wrong, message)
		}
	}
}

func TestTheBookListHonoursTheLibraryFieldPolicy(t *testing.T) {
	document := "doc_1"
	row := &tenantent.ContentItem{
		Title:            "Biology",
		Kind:             entcontentitem.KindBook,
		IndexStatus:      entcontentitem.IndexStatusIndexed,
		EngineDocumentID: &document,
	}

	open := mindmapBookOf(row, nil)
	for _, name := range []string{"id", "title", "kind", "subject_id", "grade_level_id",
		"index_status", "mindmap_state"} {
		if _, ok := open[name]; !ok {
			t.Errorf("an unrestricted caller's row is missing %s: %v", name, open)
		}
	}
	if _, leaked := open["engine_document_id"]; leaked {
		t.Fatalf("the engine's document id is not part of this contract: %v", open)
	}

	narrow := mindmapBookOf(row, &authorization.FieldPolicy{
		Mode: authorization.FieldModeInclude, Keys: []string{"title"},
	})
	if _, ok := narrow["title"]; !ok {
		t.Fatalf("a permitted field was dropped: %v", narrow)
	}
	if _, ok := narrow["index_status"]; ok {
		t.Fatalf("a field the library policy withholds reached this list: %v", narrow)
	}
	if narrow["mindmap_state"] != MindmapAvailable {
		t.Fatalf("the derived state must always be present: %v", narrow)
	}
}

func TestMindmapHandlersNeverOpenATransaction(t *testing.T) {
	files, err := filepath.Glob("mindmap*.go")
	if err != nil || len(files) == 0 {
		t.Fatalf("no mind-map source found: %v", err)
	}

	checked := 0
	for _, path := range files {
		if strings.HasSuffix(path, "_test.go") {
			continue
		}
		checked++

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			t.Fatalf("parsing %s: %v", path, err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			sel, ok := n.(*ast.SelectorExpr)
			if !ok {
				return true
			}
			if sel.Sel.Name == "Tx" || sel.Sel.Name == "BeginTx" {
				t.Errorf("%s opens a transaction (%s); the engine calls back into this server "+
					"during the outbound call, so a transaction held across it is a pool slot "+
					"held for the whole round trip", path, sel.Sel.Name)
			}
			return true
		})
	}
	if checked == 0 {
		t.Fatal("no non-test mind-map source was checked, so this test proves nothing")
	}
}
