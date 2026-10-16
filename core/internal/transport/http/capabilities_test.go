package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/authorization/catalog"
)

type grantGuard struct {
	label  string
	grants map[authorization.Entity]authorization.Decision
	err    error
}

func (g grantGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if g.err != nil {
		return authorization.Decision{}, g.err
	}
	decision, held := g.grants[entity]
	if !held {
		return authorization.Decision{Reason: "not granted: " + string(entity)}, nil
	}
	decision.Allowed = true
	return decision, nil
}

func (g grantGuard) Name() string { return g.label }

type capabilitiesBody struct {
	Service      string       `json:"service"`
	Capabilities []capability `json:"capabilities"`
	Count        int          `json:"count"`
}

func askCapabilities(t *testing.T, guard authorization.Guard) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/capabilities", nil)
	ctx := authorization.WithSubject(req.Context(), &authorization.Subject{CASUserID: uuid.New()})

	rec := httptest.NewRecorder()
	(&Server{guard: guard}).getCapabilities(rec, req.WithContext(ctx))
	return rec
}

func capabilitiesFor(t *testing.T, guard authorization.Guard) capabilitiesBody {
	t.Helper()

	rec := askCapabilities(t, guard)
	if rec.Code != http.StatusOK {
		t.Fatalf("%s: expected %d, got %d (body %s)",
			guard.Name(), http.StatusOK, rec.Code, strings.TrimSpace(rec.Body.String()))
	}

	var body capabilitiesBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("%s: the body is not the expected JSON: %v (body %s)",
			guard.Name(), err, strings.TrimSpace(rec.Body.String()))
	}
	if body.Count != len(body.Capabilities) {
		t.Fatalf("%s: count %d does not match the %d capabilities returned",
			guard.Name(), body.Count, len(body.Capabilities))
	}
	return body
}

func capabilityKeys(body capabilitiesBody) []string {
	out := make([]string, 0, len(body.Capabilities))
	for _, c := range body.Capabilities {
		out = append(out, c.Key)
	}
	sort.Strings(out)
	return out
}

func capabilityFor(t *testing.T, body capabilitiesBody, key string) capability {
	t.Helper()

	for _, c := range body.Capabilities {
		if c.Key == key {
			return c
		}
	}
	t.Fatalf("%q was granted but is not in the reported capabilities %v", key, capabilityKeys(body))
	return capability{}
}

func absent(body capabilitiesBody, key string) bool {
	for _, c := range body.Capabilities {
		if c.Key == key {
			return false
		}
	}
	return true
}

func permittedKeys(c capability) []string {
	out := make([]string, 0, len(c.Fields.Permitted))
	for _, f := range c.Fields.Permitted {
		out = append(out, f.Key)
	}
	sort.Strings(out)
	return out
}

func catalogueColumns(t *testing.T, key string) []string {
	t.Helper()

	for _, e := range catalog.Build().Entities {
		if e.Key != key {
			continue
		}
		out := make([]string, 0, len(e.ColumnFields()))
		for _, f := range e.ColumnFields() {
			out = append(out, f.Key)
		}
		sort.Strings(out)
		return out
	}
	t.Fatalf("the catalogue no longer carries %q, so this test is asserting about nothing", key)
	return nil
}

func allowed(fields *authorization.FieldPolicy) authorization.Decision {
	return authorization.Decision{Rule: "test", Fields: fields}
}

func including(keys ...string) *authorization.FieldPolicy {
	return &authorization.FieldPolicy{Mode: authorization.FieldModeInclude, Keys: keys}
}

func teacherGuard() grantGuard {
	return grantGuard{
		label: "teacher",
		grants: map[authorization.Entity]authorization.Decision{
			authorization.StudentsRead: {
				Rule:     "teacher-of-section",
				Reach:    authorization.ReachTeacherAssignment,
				HasReach: true,
				Fields:   including("admission_number", "status"),
			},
			authorization.StudentNotesRead: {
				Rule:        "notes-of-my-sections",
				Constraints: [][]authorization.Constraint{{{Field: "section", Values: []string{"7A"}}}},
			},
			authorization.SectionsWrite: allowed(nil),
		},
	}
}

func principalGuard() grantGuard {
	return grantGuard{
		label: "principal",
		grants: map[authorization.Entity]authorization.Decision{
			authorization.StudentsRead:    allowed(nil),
			authorization.StudentsReadAll: allowed(nil),
			authorization.StudentsWrite:   allowed(nil),
			authorization.StaffReadAll:    allowed(nil),
			authorization.SchoolsRead:     allowed(nil),
		},
	}
}

func TestTwoCallersWithDifferentGrantsGetDifferentCapabilitiesAndNeitherSeesTheOthers(t *testing.T) {
	teacher := capabilitiesFor(t, teacherGuard())
	principal := capabilitiesFor(t, principalGuard())

	if len(teacher.Capabilities) == 0 || len(principal.Capabilities) == 0 {
		t.Fatalf("one of the callers was reported no capabilities at all (teacher %d, principal %d), "+
			"so nothing below distinguishes them", len(teacher.Capabilities), len(principal.Capabilities))
	}

	teacherKeys, principalKeys := capabilityKeys(teacher), capabilityKeys(principal)
	if strings.Join(teacherKeys, ",") == strings.Join(principalKeys, ",") {
		t.Fatalf("two callers holding different grants were reported the same capabilities %v; "+
			"the catalogue is not being narrowed to the caller", teacherKeys)
	}

	for _, key := range []string{"core.students.write", "core.students.read_all",
		"core.staff.read_all", "core.schools.read"} {
		if !absent(teacher, key) {
			t.Errorf("the teacher was told it holds %q, which only the principal was granted; "+
				"a caller is learning what another role may do from this endpoint", key)
		}
	}
	for _, key := range []string{"core.student_notes.read", "core.sections.write"} {
		if !absent(principal, key) {
			t.Errorf("the principal was told it holds %q, which only the teacher was granted", key)
		}
	}

	teacherStudents := capabilityFor(t, teacher, "core.students.read")
	principalStudents := capabilityFor(t, principal, "core.students.read")

	if got := permittedKeys(teacherStudents); strings.Join(got, ",") != "admission_number,status" {
		t.Errorf("the teacher's writable fields on core.students.read are %v, want "+
			"[admission_number status] — the grant's field policy is not being applied", got)
	}
	if got, want := permittedKeys(principalStudents), catalogueColumns(t, "core.students.read"); strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("the principal's fields on core.students.read are %v, want every catalogued column %v",
			got, want)
	}
	if len(permittedKeys(principalStudents)) <= len(permittedKeys(teacherStudents)) {
		t.Errorf("the principal (unrestricted) was reported no more fields than the field-limited "+
			"teacher: principal %v, teacher %v",
			permittedKeys(principalStudents), permittedKeys(teacherStudents))
	}

	if teacherStudents.Reach != string(authorization.ReachTeacherAssignment) {
		t.Errorf("the teacher's reach on core.students.read is %q, want %q",
			teacherStudents.Reach, authorization.ReachTeacherAssignment)
	}
	if principalStudents.Reach != "" {
		t.Errorf("the principal's grant declares no reach, but %q was reported", principalStudents.Reach)
	}
	if teacherStudents.Breadth != BreadthNarrowed {
		t.Errorf("the teacher holds no core.students.read_all, so its breadth is %q, want %q",
			teacherStudents.Breadth, BreadthNarrowed)
	}
	if principalStudents.Breadth != BreadthSchoolWide {
		t.Errorf("the principal holds core.students.read_all unconstrained, so its breadth is %q, want %q",
			principalStudents.Breadth, BreadthSchoolWide)
	}
}

func TestEveryReportedCapabilityWasAllowedByTheGuard(t *testing.T) {
	for _, guard := range []grantGuard{teacherGuard(), principalGuard()} {
		body := capabilitiesFor(t, guard)

		for _, c := range body.Capabilities {
			if _, granted := guard.grants[authorization.Entity(c.Key)]; !granted {
				t.Errorf("%s was reported %q, which the guard refused; the endpoint is answering "+
					"from the catalogue instead of from the guard's decisions", guard.label, c.Key)
			}
		}
		if len(body.Capabilities) != len(guard.grants) {
			t.Errorf("%s holds %d grants but was reported %d capabilities %v",
				guard.label, len(guard.grants), len(body.Capabilities), capabilityKeys(body))
		}
	}
}

func TestAGrantWithNoFieldPolicyIsReportedAsEveryFieldNotAsNone(t *testing.T) {
	unrestricted := capabilityFor(t, capabilitiesFor(t, principalGuard()), "core.students.write")

	if !unrestricted.Fields.All {
		t.Fatalf("a grant carrying no field policy was not reported as unrestricted: %+v",
			unrestricted.Fields)
	}
	if len(unrestricted.Fields.Permitted) == 0 {
		t.Fatalf("a grant carrying no field policy was reported zero writable fields; " +
			"a nil FieldPolicy permits every field, and a UI reading this would hide inputs " +
			"the caller is allowed to fill")
	}
	if got, want := permittedKeys(unrestricted), catalogueColumns(t, "core.students.write"); strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("a grant carrying no field policy was reported %v, want every catalogued column %v",
			got, want)
	}
}

func TestAnAreaTheCatalogueCannotEnumerateSaysSoRatherThanReportingNoFields(t *testing.T) {
	schools := capabilityFor(t, capabilitiesFor(t, principalGuard()), "core.schools.read")

	if len(schools.Fields.Permitted) != 0 {
		t.Fatalf("core.schools is pinned fieldless in the catalogue but %v was reported; "+
			"this test is stale, not the code", permittedKeys(schools))
	}
	if schools.Fields.Enumerated {
		t.Fatalf("core.schools.read reports enumerated=true with an empty field list, which a UI " +
			"reads as 'this caller may write nothing'; the catalogue does not describe this area at all")
	}
	if !schools.Fields.All {
		t.Fatalf("the principal's grant on core.schools.read carries no field policy, so every " +
			"field is permitted; reporting all=false here hides inputs the caller could have used")
	}
}

func TestAnAreaWithNoBreadthKeyIsNotReportedAsNarrowed(t *testing.T) {
	sections := capabilityFor(t, capabilitiesFor(t, teacherGuard()), "core.sections.write")

	if sections.Breadth != BreadthNotApplicable {
		t.Fatalf("core.sections has no core.sections.write_all to hold, so its breadth is %q, want %q; "+
			"reporting %q would tell a UI the caller is narrowed by something that does not exist",
			sections.Breadth, BreadthNotApplicable, BreadthNarrowed)
	}
}

func TestABreadthGrantPinnedToRowsIsNotReportedAsSchoolWide(t *testing.T) {
	pinned := grantGuard{
		label: "pinned breadth",
		grants: map[authorization.Entity]authorization.Decision{
			authorization.StudentsRead: allowed(nil),
			authorization.StudentsReadAll: {
				Rule:        "all-but-only-in-7A",
				Constraints: [][]authorization.Constraint{{{Field: "section", Values: []string{"7A"}}}},
			},
		},
	}

	body := capabilitiesFor(t, pinned)
	narrow := capabilityFor(t, body, "core.students.read")
	wide := capabilityFor(t, body, "core.students.read_all")

	if narrow.Breadth != BreadthNarrowed {
		t.Errorf("the breadth grant is pinned to rows, so the narrow read stays %q, got %q; "+
			"scopeFor treats a constrained breadth grant as not unrestricted and this must agree",
			BreadthNarrowed, narrow.Breadth)
	}
	if !wide.RowPinned {
		t.Errorf("core.students.read_all is granted with row constraints but row_pinned is false")
	}
	if narrow.RowPinned {
		t.Errorf("core.students.read carries no constraints but row_pinned is true")
	}
}

func TestACallerHoldingNothingGetsAnEmptyListNotTheCatalogue(t *testing.T) {
	rec := askCapabilities(t, grantGuard{label: "no grants"})

	if rec.Code != http.StatusOK {
		t.Fatalf("a caller with no grants got %d; asking what you may do is not itself a privilege",
			rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"capabilities":[]`) {
		t.Fatalf("a caller with no grants was not answered an empty list: %s",
			strings.TrimSpace(rec.Body.String()))
	}

	body := capabilitiesFor(t, grantGuard{label: "no grants"})
	if len(body.Capabilities) != 0 {
		t.Fatalf("a caller holding nothing was reported %d capabilities %v",
			len(body.Capabilities), capabilityKeys(body))
	}
}

func TestAnUnavailablePolicySourceIsReportedRatherThanReadAsNoCapabilities(t *testing.T) {
	rec := askCapabilities(t, grantGuard{label: "upstream down", err: authorization.ErrUpstream})

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("the policy source was unreachable and the endpoint answered %d (body %s); "+
			"answering 200 with an empty list would tell a UI the caller may do nothing",
			rec.Code, strings.TrimSpace(rec.Body.String()))
	}
}

func TestAnUnauthenticatedCallerIsRefusedBeforeTheCatalogueIsTouched(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/capabilities", nil)
	rec := httptest.NewRecorder()

	(&Server{guard: principalGuard()}).getCapabilities(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("a request with no subject got %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestADeleteCapabilityCarriesNoFieldsAndDoesNotClaimToEnumerateThem(t *testing.T) {
	guard := grantGuard{
		label: "deleter",
		grants: map[authorization.Entity]authorization.Decision{
			authorization.StudentsDelete: allowed(nil),
		},
	}

	del := capabilityFor(t, capabilitiesFor(t, guard), "core.students.delete")
	if len(del.Fields.Permitted) != 0 || del.Fields.Enumerated {
		t.Fatalf("a delete capability was reported fields %v (enumerated=%v); deleting a row "+
			"names no columns", permittedKeys(del), del.Fields.Enumerated)
	}
}

func TestTheReportedFieldsAreDataColumnsNotPolicyVocabulary(t *testing.T) {
	students := capabilityFor(t, capabilitiesFor(t, principalGuard()), "core.students.read")

	forbidden := append([]string{authorization.ReachField}, authorization.RowFields()...)
	for _, key := range permittedKeys(students) {
		for _, vocab := range forbidden {
			if key == vocab {
				t.Errorf("%q is a rule-authoring field the catalogue carries for CAS, not a column "+
					"on the students form; a UI would render an input for it", key)
			}
		}
	}
	if len(permittedKeys(students)) == 0 {
		t.Fatal("no fields were reported at all, so this test proves nothing")
	}
}

func TestTheAreaAndActionMatchTheEntityKey(t *testing.T) {
	for _, c := range capabilitiesFor(t, principalGuard()).Capabilities {
		if c.Key != strings.Join([]string{authorization.Service, c.Area, c.Action}, ".") {
			t.Errorf("capability %q reports area %q and action %q, which do not reassemble into it",
				c.Key, c.Area, c.Action)
		}
		if c.Name == "" {
			t.Errorf("capability %q carries no human name, so a UI has nothing to label it with", c.Key)
		}
	}
}
