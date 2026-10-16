package http

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/config"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/crypto"
	"github.com/Harbour-Emerge/emerge-core/internal/infrastructure/postgres"
	"github.com/Harbour-Emerge/emerge-core/internal/testsupport"
	mw "github.com/Harbour-Emerge/emerge-core/internal/transport/http/middleware"
)

const (
	probeID   = "11111111-1111-4111-8111-111111111111"
	probeBody = `{"__router_probe":true}`
)

type routeProbe struct {
	entity  authorization.Entity
	method  string
	pattern string
}

type recordingGuard struct {
	mu     sync.Mutex
	probes []routeProbe
}

func (g *recordingGuard) Allow(ctx context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	probe := routeProbe{entity: entity}
	if rctx := chi.RouteContext(ctx); rctx != nil {
		probe.method = rctx.RouteMethod
		probe.pattern = rctx.RoutePattern()
	}

	g.mu.Lock()
	g.probes = append(g.probes, probe)
	g.mu.Unlock()

	return authorization.Decision{Allowed: true, Reason: "router test guard"}, nil
}

func (g *recordingGuard) Name() string { return "recording (router test)" }

func (g *recordingGuard) taken() []routeProbe {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([]routeProbe, len(g.probes))
	copy(out, g.probes)
	return out
}

func (g *recordingGuard) forget() {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.probes = nil
}

type routeCase struct {
	method  string
	path    string
	pattern string
	entity  authorization.Entity
	control bool
}

func routeTable() []routeCase {
	id := probeID

	return []routeCase{
		{"GET", "/api/v1/schools", "/api/v1/schools", authorization.SchoolsRead, true},
		{"POST", "/api/v1/schools", "/api/v1/schools", authorization.SchoolsWrite, true},
		{"GET", "/api/v1/schools/" + id, "/api/v1/schools/{id}", authorization.SchoolsRead, true},
		{"PATCH", "/api/v1/schools/" + id, "/api/v1/schools/{id}", authorization.SchoolsWrite, true},
		{"DELETE", "/api/v1/schools/" + id, "/api/v1/schools/{id}", authorization.SchoolsDelete, true},
		{"PUT", "/api/v1/schools/" + id + "/profiles/not-a-profile-type",
			"/api/v1/schools/{id}/profiles/{type}", authorization.SchoolsWrite, true},

		{"GET", "/api/v1/persons", "/api/v1/persons", authorization.PersonsRead, false},
		{"POST", "/api/v1/persons", "/api/v1/persons", authorization.PersonsWrite, false},
		{"POST", "/api/v1/persons/provision", "/api/v1/persons/provision", authorization.PersonsWrite, false},
		{"POST", "/api/v1/persons/link", "/api/v1/persons/link", authorization.PersonsWrite, false},
		{"GET", "/api/v1/persons/" + id, "/api/v1/persons/{id}", authorization.PersonsRead, false},
		{"PATCH", "/api/v1/persons/" + id, "/api/v1/persons/{id}", authorization.PersonsWrite, false},
		{"DELETE", "/api/v1/persons/" + id, "/api/v1/persons/{id}", authorization.PersonsDelete, false},

		{"GET", "/api/v1/students", "/api/v1/students", authorization.StudentsRead, false},
		{"POST", "/api/v1/students", "/api/v1/students", authorization.StudentsCreate, false},
		{"GET", "/api/v1/students/" + id, "/api/v1/students/{id}", authorization.StudentsRead, false},
		{"PATCH", "/api/v1/students/" + id, "/api/v1/students/{id}", authorization.StudentsWrite, false},
		{"DELETE", "/api/v1/students/" + id, "/api/v1/students/{id}", authorization.StudentsDelete, false},

		{"GET", "/api/v1/staff", "/api/v1/staff", authorization.StaffRead, false},
		{"POST", "/api/v1/staff", "/api/v1/staff", authorization.StaffWrite, false},
		{"GET", "/api/v1/staff/" + id, "/api/v1/staff/{id}", authorization.StaffRead, false},
		{"PATCH", "/api/v1/staff/" + id, "/api/v1/staff/{id}", authorization.StaffWrite, false},
		{"DELETE", "/api/v1/staff/" + id, "/api/v1/staff/{id}", authorization.StaffDelete, false},

		{"GET", "/api/v1/teachers", "/api/v1/teachers", authorization.TeachersRead, false},
		{"POST", "/api/v1/teachers", "/api/v1/teachers", authorization.TeachersCreate, false},
		{"GET", "/api/v1/teachers/" + id, "/api/v1/teachers/{id}", authorization.TeachersRead, false},
		{"PATCH", "/api/v1/teachers/" + id, "/api/v1/teachers/{id}", authorization.TeachersWrite, false},
		{"DELETE", "/api/v1/teachers/" + id, "/api/v1/teachers/{id}", authorization.TeachersDelete, false},

		{"GET", "/api/v1/guardians", "/api/v1/guardians", authorization.GuardiansRead, false},
		{"POST", "/api/v1/guardians", "/api/v1/guardians", authorization.GuardiansCreate, false},
		{"GET", "/api/v1/guardians/" + id, "/api/v1/guardians/{id}", authorization.GuardiansRead, false},
		{"PATCH", "/api/v1/guardians/" + id, "/api/v1/guardians/{id}", authorization.GuardiansWrite, false},
		{"DELETE", "/api/v1/guardians/" + id, "/api/v1/guardians/{id}", authorization.GuardiansDelete, false},
		{"POST", "/api/v1/guardians/" + id + "/students",
			"/api/v1/guardians/{id}/students", authorization.GuardiansWrite, false},
		{"PATCH", "/api/v1/guardians/" + id + "/students/" + id,
			"/api/v1/guardians/{id}/students/{student_id}", authorization.StudentGuardiansWrite, false},

		{"GET", "/api/v1/library", "/api/v1/library", authorization.LibraryRead, false},
		{"POST", "/api/v1/library", "/api/v1/library", authorization.LibraryCreate, false},
		{"GET", "/api/v1/library/scopes", "/api/v1/library/scopes", authorization.LibraryRead, false},
		{"POST", "/api/v1/library/assets", "/api/v1/library/assets", authorization.LibraryCreate, false},
		{"GET", "/api/v1/library/assets", "/api/v1/library/assets", authorization.LibraryRead, false},
		{"GET", "/api/v1/library/assets/" + id, "/api/v1/library/assets/{id}", authorization.LibraryRead, false},
		{"POST", "/api/v1/library/assets/" + id + "/ready",
			"/api/v1/library/assets/{id}/ready", authorization.LibraryCreate, false},
		{"GET", "/api/v1/library/assets/" + id + "/link",
			"/api/v1/library/assets/{id}/link", authorization.LibraryRead, false},
		{"DELETE", "/api/v1/library/assets/" + id,
			"/api/v1/library/assets/{id}", authorization.LibraryDelete, false},
		{"GET", "/api/v1/library/" + id, "/api/v1/library/{id}", authorization.LibraryRead, false},
		{"PATCH", "/api/v1/library/" + id, "/api/v1/library/{id}", authorization.LibraryWrite, false},
		{"DELETE", "/api/v1/library/" + id, "/api/v1/library/{id}", authorization.LibraryDelete, false},

		{"GET", "/api/v1/curricula", "/api/v1/curricula", authorization.CurriculumRead, false},
		{"POST", "/api/v1/curricula", "/api/v1/curricula", authorization.CurriculumCreate, false},
		{"GET", "/api/v1/curricula/" + id, "/api/v1/curricula/{id}", authorization.CurriculumRead, false},
		{"PATCH", "/api/v1/curricula/" + id, "/api/v1/curricula/{id}", authorization.CurriculumWrite, false},
		{"DELETE", "/api/v1/curricula/" + id, "/api/v1/curricula/{id}", authorization.CurriculumDelete, false},
		{"GET", "/api/v1/curricula/" + id + "/nodes",
			"/api/v1/curricula/{id}/nodes", authorization.CurriculumRead, false},
		{"POST", "/api/v1/curricula/" + id + "/nodes",
			"/api/v1/curricula/{id}/nodes", authorization.CurriculumCreate, false},

		{"PATCH", "/api/v1/curriculum-nodes/" + id,
			"/api/v1/curriculum-nodes/{id}", authorization.CurriculumWrite, false},
		{"DELETE", "/api/v1/curriculum-nodes/" + id,
			"/api/v1/curriculum-nodes/{id}", authorization.CurriculumDelete, false},
		{"GET", "/api/v1/curriculum-nodes/" + id + "/content",
			"/api/v1/curriculum-nodes/{id}/content", authorization.ContentPlacementsRead, false},
		{"GET", "/api/v1/curriculum-nodes/" + id + "/mindmaps",
			"/api/v1/curriculum-nodes/{id}/mindmaps", authorization.MindmapsRead, false},

		{"GET", "/api/v1/learning/mindmaps", "/api/v1/learning/mindmaps", authorization.MindmapsRead, false},
		{"GET", "/api/v1/learning/mindmaps/" + id + "/chapters",
			"/api/v1/learning/mindmaps/{item_id}/chapters", authorization.MindmapsRead, false},
		{"GET", "/api/v1/learning/mindmaps/" + id + "/chapters/sec_1",
			"/api/v1/learning/mindmaps/{item_id}/chapters/{section_id}", authorization.MindmapsRead, false},
		{"GET", "/api/v1/learning/mindmaps/" + id + "/chapters/sec_1/nodes/atm_1",
			"/api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/nodes/{node_id}",
			authorization.MindmapsRead, false},
		{"GET", "/api/v1/learning/mindmaps/" + id + "/chapters/sec_1/trace",
			"/api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/trace",
			authorization.MindmapsRead, false},
		{"GET", "/api/v1/learning/mindmaps/" + id + "/chapters/sec_1/drill",
			"/api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/drill",
			authorization.MindmapsRead, false},
		{"GET", "/api/v1/learning/mindmaps/" + id + "/chapters/sec_1/mastery",
			"/api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/mastery",
			authorization.ConceptMasteryRead, false},
		{"PUT", "/api/v1/learning/mindmaps/" + id + "/chapters/sec_1/mastery",
			"/api/v1/learning/mindmaps/{item_id}/chapters/{section_id}/mastery",
			authorization.ConceptMasteryWrite, false},

		{"GET", "/api/v1/placements", "/api/v1/placements", authorization.ContentPlacementsRead, false},
		{"POST", "/api/v1/placements", "/api/v1/placements", authorization.ContentPlacementsCreate, false},
		{"GET", "/api/v1/placements/" + id, "/api/v1/placements/{id}", authorization.ContentPlacementsRead, false},
		{"PATCH", "/api/v1/placements/" + id, "/api/v1/placements/{id}", authorization.ContentPlacementsWrite, false},
		{"DELETE", "/api/v1/placements/" + id, "/api/v1/placements/{id}",
			authorization.ContentPlacementsDelete, false},

		{"GET", "/api/v1/academic-sessions", "/api/v1/academic-sessions", authorization.AcademicSessionsRead, false},
		{"POST", "/api/v1/academic-sessions", "/api/v1/academic-sessions", authorization.AcademicSessionsWrite, false},
		{"GET", "/api/v1/academic-sessions/" + id,
			"/api/v1/academic-sessions/{id}", authorization.AcademicSessionsRead, false},
		{"PATCH", "/api/v1/academic-sessions/" + id,
			"/api/v1/academic-sessions/{id}", authorization.AcademicSessionsWrite, false},
		{"DELETE", "/api/v1/academic-sessions/" + id,
			"/api/v1/academic-sessions/{id}", authorization.AcademicSessionsDelete, false},

		{"GET", "/api/v1/branches", "/api/v1/branches", authorization.ReferenceRead, false},
		{"POST", "/api/v1/branches", "/api/v1/branches", authorization.ReferenceWrite, false},
		{"GET", "/api/v1/branches/" + id, "/api/v1/branches/{id}", authorization.ReferenceRead, false},
		{"PATCH", "/api/v1/branches/" + id, "/api/v1/branches/{id}", authorization.ReferenceWrite, false},
		{"DELETE", "/api/v1/branches/" + id, "/api/v1/branches/{id}", authorization.ReferenceDelete, false},

		{"GET", "/api/v1/grade-levels", "/api/v1/grade-levels", authorization.ReferenceRead, false},
		{"POST", "/api/v1/grade-levels", "/api/v1/grade-levels", authorization.ReferenceWrite, false},
		{"PATCH", "/api/v1/grade-levels/" + id, "/api/v1/grade-levels/{id}", authorization.ReferenceWrite, false},
		{"DELETE", "/api/v1/grade-levels/" + id, "/api/v1/grade-levels/{id}", authorization.ReferenceDelete, false},

		{"GET", "/api/v1/school-houses", "/api/v1/school-houses", authorization.ReferenceRead, false},
		{"POST", "/api/v1/school-houses", "/api/v1/school-houses", authorization.ReferenceWrite, false},
		{"PATCH", "/api/v1/school-houses/" + id, "/api/v1/school-houses/{id}", authorization.ReferenceWrite, false},
		{"DELETE", "/api/v1/school-houses/" + id, "/api/v1/school-houses/{id}", authorization.ReferenceDelete, false},

		{"GET", "/api/v1/subjects", "/api/v1/subjects", authorization.ReferenceRead, false},
		{"POST", "/api/v1/subjects", "/api/v1/subjects", authorization.ReferenceWrite, false},
		{"PATCH", "/api/v1/subjects/" + id, "/api/v1/subjects/{id}", authorization.ReferenceWrite, false},
		{"DELETE", "/api/v1/subjects/" + id, "/api/v1/subjects/{id}", authorization.ReferenceDelete, false},

		{"GET", "/api/v1/subject-groups", "/api/v1/subject-groups", authorization.ReferenceRead, false},
		{"POST", "/api/v1/subject-groups", "/api/v1/subject-groups", authorization.ReferenceWrite, false},
		{"PATCH", "/api/v1/subject-groups/" + id, "/api/v1/subject-groups/{id}",
			authorization.ReferenceWrite, false},
		{"DELETE", "/api/v1/subject-groups/" + id, "/api/v1/subject-groups/{id}",
			authorization.ReferenceDelete, false},

		{"GET", "/api/v1/sections", "/api/v1/sections", authorization.SectionsRead, false},
		{"POST", "/api/v1/sections", "/api/v1/sections", authorization.SectionsWrite, false},
		{"GET", "/api/v1/sections/" + id, "/api/v1/sections/{id}", authorization.SectionsRead, false},
		{"PATCH", "/api/v1/sections/" + id, "/api/v1/sections/{id}", authorization.SectionsWrite, false},
		{"DELETE", "/api/v1/sections/" + id, "/api/v1/sections/{id}", authorization.SectionsDelete, false},

		{"GET", "/api/v1/subject-offerings", "/api/v1/subject-offerings", authorization.SubjectOfferingsRead, false},
		{"POST", "/api/v1/subject-offerings", "/api/v1/subject-offerings",
			authorization.SubjectOfferingsWrite, false},
		{"GET", "/api/v1/subject-offerings/" + id,
			"/api/v1/subject-offerings/{id}", authorization.SubjectOfferingsRead, false},
		{"PATCH", "/api/v1/subject-offerings/" + id,
			"/api/v1/subject-offerings/{id}", authorization.SubjectOfferingsWrite, false},
		{"DELETE", "/api/v1/subject-offerings/" + id,
			"/api/v1/subject-offerings/{id}", authorization.SubjectOfferingsDelete, false},

		{"GET", "/api/v1/enrollments", "/api/v1/enrollments", authorization.EnrollmentsRead, false},
		{"POST", "/api/v1/enrollments", "/api/v1/enrollments", authorization.EnrollmentsWrite, false},
		{"GET", "/api/v1/enrollments/" + id, "/api/v1/enrollments/{id}", authorization.EnrollmentsRead, false},
		{"PATCH", "/api/v1/enrollments/" + id, "/api/v1/enrollments/{id}", authorization.EnrollmentsWrite, false},
		{"DELETE", "/api/v1/enrollments/" + id, "/api/v1/enrollments/{id}", authorization.EnrollmentsDelete, false},

		{"GET", "/api/v1/subject-enrollments", "/api/v1/subject-enrollments",
			authorization.SubjectEnrollmentsRead, false},
		{"POST", "/api/v1/subject-enrollments", "/api/v1/subject-enrollments",
			authorization.SubjectEnrollmentsWrite, false},
		{"PATCH", "/api/v1/subject-enrollments/" + id, "/api/v1/subject-enrollments/{id}",
			authorization.SubjectEnrollmentsWrite, false},
		{"DELETE", "/api/v1/subject-enrollments/" + id, "/api/v1/subject-enrollments/{id}",
			authorization.SubjectEnrollmentsDelete, false},

		{"GET", "/api/v1/teacher-assignments", "/api/v1/teacher-assignments",
			authorization.TeacherAssignmentsRead, false},
		{"POST", "/api/v1/teacher-assignments", "/api/v1/teacher-assignments",
			authorization.TeacherAssignmentsWrite, false},
		{"PATCH", "/api/v1/teacher-assignments/" + id, "/api/v1/teacher-assignments/{id}",
			authorization.TeacherAssignmentsWrite, false},
		{"DELETE", "/api/v1/teacher-assignments/" + id, "/api/v1/teacher-assignments/{id}",
			authorization.TeacherAssignmentsDelete, false},

		{"GET", "/api/v1/student-assignments", "/api/v1/student-assignments",
			authorization.StudentAssignmentsRead, false},
		{"POST", "/api/v1/student-assignments", "/api/v1/student-assignments",
			authorization.StudentAssignmentsWrite, false},
		{"PATCH", "/api/v1/student-assignments/" + id, "/api/v1/student-assignments/{id}",
			authorization.StudentAssignmentsWrite, false},
		{"DELETE", "/api/v1/student-assignments/" + id, "/api/v1/student-assignments/{id}",
			authorization.StudentAssignmentsDelete, false},

		{"GET", "/api/v1/student-addresses", "/api/v1/student-addresses",
			authorization.StudentAddressesRead, false},
		{"POST", "/api/v1/student-addresses", "/api/v1/student-addresses",
			authorization.StudentAddressesWrite, false},
		{"DELETE", "/api/v1/student-addresses/" + id, "/api/v1/student-addresses/{id}",
			authorization.StudentAddressesDelete, false},

		{"GET", "/api/v1/student-documents", "/api/v1/student-documents",
			authorization.StudentDocumentsRead, false},
		{"POST", "/api/v1/student-documents", "/api/v1/student-documents",
			authorization.StudentDocumentsWrite, false},
		{"POST", "/api/v1/student-documents/" + id + "/verify", "/api/v1/student-documents/{id}/verify",
			authorization.StudentDocumentsWrite, false},
		{"DELETE", "/api/v1/student-documents/" + id, "/api/v1/student-documents/{id}",
			authorization.StudentDocumentsDelete, false},

		{"GET", "/api/v1/student-notes", "/api/v1/student-notes", authorization.StudentNotesRead, false},
		{"POST", "/api/v1/student-notes", "/api/v1/student-notes", authorization.StudentNotesWrite, false},
		{"PATCH", "/api/v1/student-notes/" + id, "/api/v1/student-notes/{id}",
			authorization.StudentNotesWrite, false},
		{"DELETE", "/api/v1/student-notes/" + id, "/api/v1/student-notes/{id}",
			authorization.StudentNotesDelete, false},
	}
}

func publicRoutes() []routeCase {
	return []routeCase{
		{method: "GET", path: "/health"},
		{method: "GET", path: "/api/v1/"},
		{method: "POST", path: "/api/v1/auth/login"},
		{method: "POST", path: "/api/v1/auth/login/verify"},
		{method: "POST", path: "/api/v1/auth/otp/start"},
		{method: "POST", path: "/api/v1/auth/refresh"},
		{method: "POST", path: "/api/v1/auth/logout"},
		{method: "POST", path: "/api/v1/auth/password/change"},
		{method: "POST", path: "/api/v1/auth/password/reset"},
		{method: "GET", path: "/api/v1/auth/me"},
	}
}

func quietServer(guard authorization.Guard) *Server {
	return &Server{
		cfg:     &config.Config{Env: "test"},
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		guard:   guard,
		version: "router-test",
	}
}

func offlineRouter(t *testing.T) (http.Handler, *recordingGuard) {
	t.Helper()

	guard := &recordingGuard{}
	return quietServer(guard).Router(), guard
}

func liveRouter(t *testing.T) (http.Handler, *recordingGuard, string) {
	t.Helper()

	ctx := context.Background()
	_ = testsupport.TenantTx(ctx, t)

	controlDSN := strings.TrimSpace(os.Getenv(testsupport.ControlDSNEnv))
	key := strings.TrimSpace(os.Getenv(testsupport.MasterKeyEnv))
	if controlDSN == "" || key == "" {
		t.Skip(testsupport.SkipMarker + ": routing through the real middleware chain needs " +
			testsupport.ControlDSNEnv + " and " + testsupport.MasterKeyEnv + " so that the " +
			mw.SchoolHeader + " header can be resolved by the registry")
	}

	keyring, err := crypto.ParseKeyring(key)
	if err != nil {
		t.Fatalf("the master key did not parse: %v", err)
	}

	control, err := postgres.NewControl(ctx, controlDSN, postgres.Options{})
	if err != nil {
		t.Fatalf("the control plane was configured but unreachable: %v", err)
	}
	t.Cleanup(func() { _ = control.Close() })

	guard := &recordingGuard{}
	server := quietServer(guard)
	server.control = control
	server.registry = postgres.NewRegistry(control, keyring, postgres.Options{}, postgres.Discard())

	code := strings.TrimSpace(os.Getenv(testsupport.SchoolCodeEnv))
	if code == "" {
		code = testsupport.DefaultSchoolCode
	}

	return server.Router(), guard, code
}

func send(router http.Handler, method, path, school string) *httptest.ResponseRecorder {
	var body io.Reader
	switch method {
	case http.MethodPost, http.MethodPatch, http.MethodPut:
		body = strings.NewReader(probeBody)
	}

	req := httptest.NewRequest(method, path, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if school != "" {
		req.Header.Set(mw.SchoolHeader, school)
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func routerRefused(rec *httptest.ResponseRecorder) string {
	body := rec.Body.String()
	switch {
	case rec.Code == http.StatusNotFound && strings.Contains(body, "no route matches"):
		return "the router matched no route at all"
	case rec.Code == http.StatusMethodNotAllowed && strings.Contains(body, "is not allowed on"):
		return "the router matched the path but rejected the method"
	}
	return ""
}

func normalizePattern(pattern string) string {
	var out strings.Builder
	depth, skipping := 0, false

	for _, c := range pattern {
		switch c {
		case '{':
			depth++
			if depth == 1 {
				out.WriteRune(c)
				continue
			}
		case '}':
			depth--
			if depth == 0 {
				skipping = false
				out.WriteRune(c)
				continue
			}
		case ':':
			if depth == 1 {
				skipping = true
				continue
			}
		}
		if !skipping {
			out.WriteRune(c)
		}
	}

	return strings.TrimSuffix(out.String(), "/")
}

func samePattern(want, got string) bool {
	return normalizePattern(want) == normalizePattern(got)
}

func TestNormalizePatternDropsOnlyTheParamConstraint(t *testing.T) {
	cases := map[string]string{
		"/api/v1/library/{id}": "/api/v1/library/{id}",
		"/api/v1/library/":     "/api/v1/library",
		"/api/v1/library/{id:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}": "/api/v1/library/{id}",
		"/api/v1/library/scopes":               "/api/v1/library/scopes",
		"/api/v1/schools/{id}/profiles/{type}": "/api/v1/schools/{id}/profiles/{type}",
	}

	for in, want := range cases {
		if got := normalizePattern(in); got != want {
			t.Errorf("normalizePattern(%q) = %q, want %q", in, got, want)
		}
	}

	if samePattern("/api/v1/library/scopes", "/api/v1/library/{id:[0-9a-f]{8}}") {
		t.Error("normalising the constraint must not make a static route equal to a parameter route")
	}
}

func verbFits(method string, entity authorization.Entity) bool {
	verb := string(entity)
	if i := strings.LastIndex(verb, "."); i >= 0 {
		verb = verb[i+1:]
	}
	verb = strings.TrimSuffix(verb, "_all")

	switch method {
	case http.MethodGet, http.MethodHead:
		return verb == "read"
	case http.MethodDelete:
		return verb == "delete"
	case http.MethodPatch, http.MethodPut:
		return verb == "write"
	case http.MethodPost:
		return verb == "create" || verb == "write" || verb == "generate"
	}
	return false
}

func checkProbe(t *testing.T, tc routeCase, probes []routeProbe, rec *httptest.ResponseRecorder) {
	t.Helper()

	if len(probes) == 0 {
		t.Fatalf("%s %s: the guard was never consulted, so no authorization ran here (status %d, body %s)",
			tc.method, tc.path, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	got := probes[0]
	if got.entity != tc.entity {
		t.Errorf("%s %s: the route authorized %q but the API contract says %q",
			tc.method, tc.path, got.entity, tc.entity)
	}
	if !samePattern(tc.pattern, got.pattern) {
		t.Errorf("%s %s: chi matched the pattern %q, not the expected %q, so another route shadows this one",
			tc.method, tc.path, got.pattern, tc.pattern)
	}
	if got.method != tc.method {
		t.Errorf("%s %s: chi reports the matched method as %q", tc.method, tc.path, got.method)
	}
	if !verbFits(tc.method, got.entity) {
		t.Errorf("%s %s: the guarded entity %q does not carry the verb that %s implies",
			tc.method, tc.path, got.entity, tc.method)
	}
}

func TestEveryRouteReachesAHandlerUnderTheRealChain(t *testing.T) {
	router, guard, school := liveRouter(t)

	for _, tc := range routeTable() {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, tc.method, tc.path, school)
			if why := routerRefused(rec); why != "" {
				t.Fatalf("%s %s: %s (status %d, body %s)",
					tc.method, tc.path, why, rec.Code, strings.TrimSpace(rec.Body.String()))
			}

			checkProbe(t, tc, guard.taken(), rec)
		})
	}
}

func TestTenancyIsCheckedBeforeAuthorization(t *testing.T) {
	router, guard := offlineRouter(t)

	for _, tc := range routeTable() {
		if tc.control {
			continue
		}
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, tc.method, tc.path, "")
			if why := routerRefused(rec); why != "" {
				t.Fatalf("%s %s: %s (status %d, body %s)",
					tc.method, tc.path, why, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("%s %s: expected %d because %s is missing, got %d (body %s)",
					tc.method, tc.path, http.StatusBadRequest, mw.SchoolHeader,
					rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if !strings.Contains(rec.Body.String(), mw.SchoolHeader+" header is required") {
				t.Fatalf("%s %s: expected the tenant error, got %s",
					tc.method, tc.path, strings.TrimSpace(rec.Body.String()))
			}
			if probes := guard.taken(); len(probes) != 0 {
				t.Fatalf("%s %s: authorization ran before tenancy and disclosed that %q guards this route",
					tc.method, tc.path, probes[0].entity)
			}
		})
	}
}

func TestControlPlaneRoutesAuthorizeWithoutATenantHeader(t *testing.T) {
	router, guard := offlineRouter(t)

	for _, tc := range routeTable() {
		if !tc.control {
			continue
		}
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, tc.method, tc.path, "")
			if why := routerRefused(rec); why != "" {
				t.Fatalf("%s %s: %s (status %d)", tc.method, tc.path, why, rec.Code)
			}

			checkProbe(t, tc, guard.taken(), rec)
		})
	}
}

func expectNotFound(t *testing.T, router http.Handler, guard *recordingGuard, path, school string) {
	t.Helper()

	guard.forget()

	rec := send(router, "GET", path, school)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET %s: expected %d, got %d (body %s)",
			path, http.StatusNotFound, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "no route matches") {
		t.Fatalf("GET %s: expected the not-found body of the router, got %s",
			path, strings.TrimSpace(rec.Body.String()))
	}
	if probes := guard.taken(); len(probes) != 0 {
		t.Fatalf("GET %s: the guard was consulted for a path that does not exist", path)
	}
}

func expectMethodNotAllowed(t *testing.T, router http.Handler, method, path, school string) {
	t.Helper()

	rec := send(router, method, path, school)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("%s %s: expected %d, got %d (body %s)",
			method, path, http.StatusMethodNotAllowed, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "is not allowed on") {
		t.Fatalf("%s %s: expected the method-not-allowed body of the router, got %s",
			method, path, strings.TrimSpace(rec.Body.String()))
	}
}

func TestUnknownPathsOutsideTheTenantPlaneAreNotFound(t *testing.T) {
	router, guard := offlineRouter(t)

	unknown := []string{
		"/api/v1/not-a-collection",
		"/api/v1/schools/" + probeID + "/not-a-sub-resource",
		"/api/v2/persons",
		"/nope",
	}

	for _, path := range unknown {
		t.Run(path, func(t *testing.T) { expectNotFound(t, router, guard, path, "") })
	}
}

func TestUnknownTenantPathsAreNotFoundOnceTheTenantResolves(t *testing.T) {
	router, guard, school := liveRouter(t)

	unknown := []string{
		"/api/v1/persons/" + probeID + "/not-a-sub-resource",
		"/api/v1/library/assets/" + probeID + "/not-a-verb",
		"/api/v1/curricula/" + probeID + "/not-a-sub-resource",
		"/api/v1/placements/" + probeID + "/not-a-sub-resource",
	}

	for _, path := range unknown {
		t.Run(path, func(t *testing.T) { expectNotFound(t, router, guard, path, school) })
	}
}

func TestWrongMethodOnAPublicPathIsMethodNotAllowed(t *testing.T) {
	router, _ := offlineRouter(t)

	expectMethodNotAllowed(t, router, "POST", "/health", "")
	expectMethodNotAllowed(t, router, "GET", "/api/v1/auth/login", "")
	expectMethodNotAllowed(t, router, "POST", "/api/v1/auth/me", "")
}

func TestWrongMethodOnATenantPathIsMethodNotAllowed(t *testing.T) {
	router, _, school := liveRouter(t)

	wrong := []struct {
		method string
		path   string
	}{
		{"PUT", "/api/v1/persons"},
		{"DELETE", "/api/v1/persons"},
		{"PATCH", "/api/v1/students"},
		{"PUT", "/api/v1/library/" + probeID},
		{"POST", "/api/v1/curriculum-nodes/" + probeID + "/content"},
		{"PUT", "/api/v1/placements/" + probeID},
		{"DELETE", "/api/v1/curricula/" + probeID + "/nodes"},
	}

	for _, w := range wrong {
		t.Run(w.method+" "+w.path, func(t *testing.T) {
			expectMethodNotAllowed(t, router, w.method, w.path, school)
		})
	}
}

func TestTenantPlaneAnswersTheHeaderErrorBeforeItKnowsTheRouteExists(t *testing.T) {
	router, guard := offlineRouter(t)

	masked := []struct {
		method string
		path   string
	}{
		{"GET", "/api/v1/persons/" + probeID + "/not-a-sub-resource"},
		{"GET", "/api/v1/library/assets/" + probeID + "/not-a-verb"},
		{"PUT", "/api/v1/persons"},
		{"GET", "/api/v1/curriculum-nodes"},
	}

	for _, m := range masked {
		t.Run(m.method+" "+m.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, m.method, m.path, "")
			if rec.Code != http.StatusBadRequest ||
				!strings.Contains(rec.Body.String(), mw.SchoolHeader+" header is required") {
				t.Fatalf("%s %s: the tenant plane used to answer %d with the %s error before routing; "+
					"it now answers %d (body %s), so this expectation is stale",
					m.method, m.path, http.StatusBadRequest, mw.SchoolHeader,
					rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			if probes := guard.taken(); len(probes) != 0 {
				t.Fatalf("%s %s: authorization ran for a route that does not exist and disclosed %q",
					m.method, m.path, probes[0].entity)
			}
		})
	}
}

func TestPublicRoutesNeverConsultTheGuard(t *testing.T) {
	router, guard := offlineRouter(t)

	for _, tc := range publicRoutes() {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, tc.method, tc.path, "")
			if why := routerRefused(rec); why != "" {
				t.Fatalf("%s %s: %s (status %d)", tc.method, tc.path, why, rec.Code)
			}
			if probes := guard.taken(); len(probes) != 0 {
				t.Fatalf("%s %s: this route must need no authorization, but the guard was asked about %q",
					tc.method, tc.path, probes[0].entity)
			}
		})
	}
}

func TestLivenessIsServedOutsideTheVersionedAPI(t *testing.T) {
	router, guard := offlineRouter(t)

	rec := send(router, "GET", "/health", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /health: expected %d, got %d (body %s)",
			http.StatusOK, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("GET /health: the body is not JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Fatalf("GET /health: expected status ok, got %v", body["status"])
	}
	if len(guard.taken()) != 0 {
		t.Fatal("GET /health: liveness must not consult the guard")
	}
}

func TestReferenceCollectionsExposeNoReadOneRoute(t *testing.T) {
	router, _, school := liveRouter(t)

	absent := []string{
		"/api/v1/grade-levels/" + probeID,
		"/api/v1/school-houses/" + probeID,
		"/api/v1/subjects/" + probeID,
		"/api/v1/subject-groups/" + probeID,
		"/api/v1/subject-enrollments/" + probeID,
		"/api/v1/teacher-assignments/" + probeID,
		"/api/v1/student-assignments/" + probeID,
		"/api/v1/student-notes/" + probeID,
		"/api/v1/student-addresses/" + probeID,
		"/api/v1/student-documents/" + probeID,
	}

	for _, path := range absent {
		t.Run(path, func(t *testing.T) {
			rec := send(router, "GET", path, school)
			if rec.Code != http.StatusMethodNotAllowed {
				t.Fatalf("GET %s: this resource has no read-one route today; expected %d, got %d (body %s)",
					path, http.StatusMethodNotAllowed, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
		})
	}
}

func TestCurriculumNodesHasNoCollectionRoute(t *testing.T) {
	router, guard, school := liveRouter(t)

	guard.forget()
	rec := send(router, "GET", "/api/v1/curriculum-nodes", school)
	if routerRefused(rec) == "" {
		t.Fatalf("GET /api/v1/curriculum-nodes: expected the router to refuse it, got %d (body %s)",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if probes := guard.taken(); len(probes) != 0 {
		t.Fatalf("GET /api/v1/curriculum-nodes: the guard was asked about %q for a route that does not exist",
			probes[0].entity)
	}
}

func TestStaticSubpathsAreRefusedByTheRouterNotTheItemHandler(t *testing.T) {
	router, guard, school := liveRouter(t)

	unregistered := []struct {
		method string
		path   string
	}{
		{"DELETE", "/api/v1/library/scopes"},
		{"PATCH", "/api/v1/library/scopes"},
		{"DELETE", "/api/v1/library/assets"},
		{"DELETE", "/api/v1/persons/link"},
		{"GET", "/api/v1/persons/link"},
		{"PATCH", "/api/v1/persons/provision"},
		{"DELETE", "/api/v1/persons/provision"},
	}

	for _, u := range unregistered {
		t.Run(u.method+" "+u.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, u.method, u.path, school)

			if probes := guard.taken(); len(probes) != 0 {
				t.Fatalf("%s %s: the item route has swallowed this static sibling again; "+
					"authorization evaluated %q on a request the router must refuse outright",
					u.method, u.path, probes[0].entity)
			}
			if rec.Code != http.StatusMethodNotAllowed {
				t.Fatalf("%s %s: expected %d from the router, got %d (body %s)",
					u.method, u.path, http.StatusMethodNotAllowed, rec.Code,
					strings.TrimSpace(rec.Body.String()))
			}
			if !strings.Contains(rec.Body.String(), "is not allowed on") {
				t.Fatalf("%s %s: expected the method-not-allowed body of the router, got %s",
					u.method, u.path, strings.TrimSpace(rec.Body.String()))
			}
		})
	}
}

func TestAMalformedItemIDNoLongerReachesTheConstrainedItemHandlers(t *testing.T) {
	router, guard, school := liveRouter(t)

	malformed := []struct {
		method string
		path   string
	}{
		{"GET", "/api/v1/library/not-a-uuid"},
		{"PATCH", "/api/v1/library/not-a-uuid"},
		{"DELETE", "/api/v1/library/not-a-uuid"},
		{"GET", "/api/v1/persons/not-a-uuid"},
		{"PATCH", "/api/v1/persons/not-a-uuid"},
		{"DELETE", "/api/v1/persons/not-a-uuid"},
	}

	for _, m := range malformed {
		t.Run(m.method+" "+m.path, func(t *testing.T) {
			guard.forget()

			rec := send(router, m.method, m.path, school)

			if probes := guard.taken(); len(probes) != 0 {
				t.Fatalf("%s %s: authorization evaluated %q for an id the route pattern cannot match",
					m.method, m.path, probes[0].entity)
			}
			if rec.Code != http.StatusNotFound ||
				!strings.Contains(rec.Body.String(), "no route matches") {
				t.Fatalf("%s %s: this route is constrained because it has static siblings, and the "+
					"constraint trades the specific handler 400 for the router 404; "+
					"expected %d with the not-found body, got %d (body %s)",
					m.method, m.path, http.StatusNotFound, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
		})
	}
}

func splitPattern(pattern string) []string {
	var segs []string
	var cur strings.Builder
	depth := 0

	for _, c := range pattern {
		switch c {
		case '{':
			depth++
		case '}':
			depth--
		case '/':
			if depth == 0 {
				segs = append(segs, cur.String())
				cur.Reset()
				continue
			}
		}
		cur.WriteRune(c)
	}
	segs = append(segs, cur.String())

	if len(segs) > 0 && segs[0] == "" {
		segs = segs[1:]
	}
	return segs
}

func isParamSegment(segment string) bool { return strings.HasPrefix(segment, "{") }

func isConstrainedSegment(segment string) bool {
	return isParamSegment(segment) && strings.Contains(segment, ":")
}

func childrenByParent(routes chi.Routes) (map[string]map[string]bool, error) {
	children := map[string]map[string]bool{}
	err := chi.Walk(routes, func(_, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		segs := splitPattern(route)
		for i, seg := range segs {
			if seg == "" {
				continue
			}
			parent := "/" + strings.Join(segs[:i], "/")
			if children[parent] == nil {
				children[parent] = map[string]bool{}
			}
			children[parent][seg] = true
		}
		return nil
	})
	return children, err
}

func routeChildren(t *testing.T, router http.Handler) map[string]map[string]bool {
	t.Helper()

	routes, ok := router.(chi.Routes)
	if !ok {
		t.Fatal("the router is no longer a chi.Routes, so its shape cannot be walked")
	}

	children, err := childrenByParent(routes)
	if err != nil {
		t.Fatalf("the router could not be walked: %v", err)
	}
	if len(children) == 0 {
		t.Fatal("the walk found no routes at all, so this test proves nothing")
	}

	return children
}

type shadowHazard struct {
	parent  string
	param   string
	statics []string
}

func unconstrainedParamsBesideStatics(children map[string]map[string]bool) []shadowHazard {
	parents := make([]string, 0, len(children))
	for parent := range children {
		parents = append(parents, parent)
	}
	sort.Strings(parents)

	var hazards []shadowHazard
	for _, parent := range parents {
		statics := staticSiblingsOf(children, parent)
		if len(statics) == 0 {
			continue
		}

		params := make([]string, 0, len(children[parent]))
		for seg := range children[parent] {
			if isParamSegment(seg) && !isConstrainedSegment(seg) {
				params = append(params, seg)
			}
		}
		sort.Strings(params)

		for _, param := range params {
			hazards = append(hazards, shadowHazard{parent: parent, param: param, statics: statics})
		}
	}
	return hazards
}

func constrainedParamCount(children map[string]map[string]bool) int {
	count := 0
	for _, segs := range children {
		for seg := range segs {
			if isConstrainedSegment(seg) {
				count++
			}
		}
	}
	return count
}

func staticSiblingsOf(children map[string]map[string]bool, parent string) []string {
	var statics []string
	for seg := range children[parent] {
		if !isParamSegment(seg) {
			statics = append(statics, seg)
		}
	}
	sort.Strings(statics)
	return statics
}

func TestAParamRouteBesideStaticSiblingsIsAlwaysConstrained(t *testing.T) {
	router, _ := offlineRouter(t)
	children := routeChildren(t, router)

	for _, h := range unconstrainedParamsBesideStatics(children) {
		t.Errorf("%s/%s is an unconstrained parameter sitting beside the static sibling(s) %v, "+
			"so any method not registered on those statics falls through to the parameter route "+
			"and is authorized as though it were an item request; "+
			"constrain the parameter with uuidParam as /library and /persons already are",
			h.parent, h.param, h.statics)
	}

	if constrainedParamCount(children) == 0 {
		t.Error("no constrained parameter route was found anywhere; " +
			"/api/v1/library and /api/v1/persons are supposed to have one, " +
			"so either the constraint was removed or this walk stopped seeing it")
	}
}

func TestTheStaticSiblingRuleFlagsTheHazardAndClearsTheSafeShapes(t *testing.T) {
	nothing := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

	build := func(itemPattern string, withStatic bool) map[string]map[string]bool {
		r := chi.NewRouter()
		r.Route("/things", func(r chi.Router) {
			r.Get("/", nothing)
			if withStatic {
				r.Post("/special", nothing)
			}
			r.Delete(itemPattern, nothing)
		})

		children, err := childrenByParent(r)
		if err != nil {
			t.Fatalf("the synthetic router could not be walked: %v", err)
		}
		return children
	}

	hazards := unconstrainedParamsBesideStatics(build("/{id}", true))
	if len(hazards) != 1 {
		t.Fatalf("an unconstrained {id} beside the static /special must be flagged once, got %d: %v",
			len(hazards), hazards)
	}
	if hazards[0].parent != "/things" || hazards[0].param != "{id}" ||
		len(hazards[0].statics) != 1 || hazards[0].statics[0] != "special" {
		t.Fatalf("the hazard was reported as %+v, which does not name the shadowed sibling", hazards[0])
	}

	if got := unconstrainedParamsBesideStatics(build(uuidParam, true)); len(got) != 0 {
		t.Fatalf("constraining the parameter with uuidParam must clear the hazard, got %v", got)
	}
	if got := unconstrainedParamsBesideStatics(build("/{id}", false)); len(got) != 0 {
		t.Fatalf("an unconstrained parameter with no static sibling is not a hazard, got %v", got)
	}
}

func TestUnconstrainedIDRoutesHaveNoStaticSiblingsAndKeepTheHandlerDiagnostic(t *testing.T) {
	router, guard, school := liveRouter(t)
	children := routeChildren(t, router)

	deliberate := []struct {
		method string
		parent string
		path   string
		entity authorization.Entity
	}{
		{"DELETE", "/api/v1/students", "/api/v1/students/not-a-uuid", authorization.StudentsDelete},
		{"DELETE", "/api/v1/curricula", "/api/v1/curricula/not-a-uuid", authorization.CurriculumDelete},
		{"DELETE", "/api/v1/placements", "/api/v1/placements/not-a-uuid",
			authorization.ContentPlacementsDelete},
		{"DELETE", "/api/v1/library/assets", "/api/v1/library/assets/not-a-uuid",
			authorization.LibraryDelete},
		{"DELETE", "/api/v1/enrollments", "/api/v1/enrollments/not-a-uuid",
			authorization.EnrollmentsDelete},
	}

	for _, d := range deliberate {
		t.Run(d.method+" "+d.path, func(t *testing.T) {
			if statics := staticSiblingsOf(children, d.parent); len(statics) != 0 {
				t.Fatalf("%s now has the static sibling(s) %v, so its parameter route can shadow them; "+
					"it must be constrained with uuidParam and moved out of this test",
					d.parent, statics)
			}

			guard.forget()
			rec := send(router, d.method, d.path, school)

			probes := guard.taken()
			if len(probes) == 0 {
				t.Fatalf("%s %s: this route has no static siblings, so constraining it buys no safety "+
					"and costs the caller the specific %d that names the malformed id; "+
					"it answered %d with no authorization instead",
					d.method, d.path, http.StatusBadRequest, rec.Code)
			}
			if probes[0].entity != d.entity {
				t.Fatalf("%s %s: authorized %q, expected %q",
					d.method, d.path, probes[0].entity, d.entity)
			}
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("%s %s: expected the handler UUID check to answer %d, got %d (body %s)",
					d.method, d.path, http.StatusBadRequest, rec.Code, strings.TrimSpace(rec.Body.String()))
			}
		})
	}
}

func TestATenantRouteReachesPostgresThroughTheRouter(t *testing.T) {
	router, guard, school := liveRouter(t)

	guard.forget()
	rec := send(router, "GET", "/api/v1/branches", school)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/branches with %s %s: expected %d, got %d (body %s)",
			mw.SchoolHeader, school, http.StatusOK, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body struct {
		Branches []map[string]any `json:"branches"`
		Count    *int             `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("GET /api/v1/branches: the body is not the expected JSON: %v (body %s)",
			err, strings.TrimSpace(rec.Body.String()))
	}
	if body.Count == nil {
		t.Fatalf("GET /api/v1/branches: the envelope has no count, so the handler did not run: %s",
			strings.TrimSpace(rec.Body.String()))
	}
	if *body.Count != len(body.Branches) {
		t.Fatalf("GET /api/v1/branches: count %d does not match the %d rows returned",
			*body.Count, len(body.Branches))
	}

	probes := guard.taken()
	if len(probes) == 0 {
		t.Fatal("GET /api/v1/branches: the guard was never consulted")
	}
	if probes[0].entity != authorization.ReferenceRead {
		t.Fatalf("GET /api/v1/branches: authorized %q, expected %q",
			probes[0].entity, authorization.ReferenceRead)
	}
}

func TestAnUnknownSchoolIsRejectedBeforeAuthorization(t *testing.T) {
	router, guard, _ := liveRouter(t)

	guard.forget()
	rec := send(router, "GET", "/api/v1/branches", "NO-SUCH-SCHOOL-CODE")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET /api/v1/branches with an unknown school: expected %d, got %d (body %s)",
			http.StatusNotFound, rec.Code, strings.TrimSpace(rec.Body.String()))
	}
	if !strings.Contains(rec.Body.String(), "unknown school") {
		t.Fatalf("GET /api/v1/branches with an unknown school: expected the tenancy error, got %s",
			strings.TrimSpace(rec.Body.String()))
	}
	if probes := guard.taken(); len(probes) != 0 {
		t.Fatalf("an unknown school still reached authorization and disclosed %q", probes[0].entity)
	}
}

func TestReadinessReachesTheControlPlane(t *testing.T) {
	router, guard, _ := liveRouter(t)

	guard.forget()
	rec := send(router, "GET", "/api/v1/health", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/health: expected %d, got %d (body %s)",
			http.StatusOK, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("GET /api/v1/health: the body is not JSON: %v", err)
	}
	if body["control_plane"] != "ok" {
		t.Fatalf("GET /api/v1/health: expected the control plane to answer ok, got %v", body["control_plane"])
	}
	if len(guard.taken()) != 0 {
		t.Fatal("GET /api/v1/health: readiness must not consult the guard")
	}
}
