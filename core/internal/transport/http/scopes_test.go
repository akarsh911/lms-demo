package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/domain/tenancy"
)

type scopesGuard struct {
	reach       authorization.Reach
	hasReach    bool
	constraints [][]authorization.Constraint
}

func (g scopesGuard) Allow(_ context.Context, _ *authorization.Subject,
	entity authorization.Entity, _ authorization.Attributes) (authorization.Decision, error) {
	if entity != authorization.LibraryRead {
		return authorization.Decision{}, nil
	}
	return authorization.Decision{
		Allowed:     true,
		Reach:       g.reach,
		HasReach:    g.hasReach,
		Constraints: g.constraints,
	}, nil
}

func (scopesGuard) Name() string { return "scopes test guard" }

func scopesInSchool(school uuid.UUID) libraryOption {
	return func(fx *libraryFixture) {
		fx.ctx = tenancy.WithTenant(fx.ctx, &tenancy.Tenant{SchoolID: school, Code: "SCH"})
	}
}

func scopesReaching(reach authorization.Reach) libraryOption {
	return func(fx *libraryFixture) {
		fx.server.guard = scopesGuard{reach: reach, hasReach: true}
	}
}

func scopesPinned(reach authorization.Reach, field string, values ...string) libraryOption {
	return func(fx *libraryFixture) {
		fx.server.guard = scopesGuard{
			reach:    reach,
			hasReach: true,
			constraints: [][]authorization.Constraint{
				{{Field: field, Values: values}},
			},
		}
	}
}

func scopesTeaching(section uuid.UUID) libraryOption {
	return func(fx *libraryFixture) {
		staff, teacher := uuid.New(), uuid.New()
		fx.driver.tables["staff"] = []map[string]any{{"id": staff, "person_id": fx.person}}
		fx.driver.tables["teachers"] = []map[string]any{{"id": teacher, "staff_id": staff}}
		fx.driver.tables["teacher_assignments"] = []map[string]any{
			{"id": uuid.New(), "teacher_id": teacher, "section_id": section},
		}
	}
}

func scopesGradedSection(section, grade uuid.UUID) libraryOption {
	return func(fx *libraryFixture) {
		fx.driver.tables["sections"] = []map[string]any{
			{"id": section, "grade_level_id": grade},
		}
	}
}

func scopesEnrolledSelf(offering uuid.UUID) libraryOption {
	return func(fx *libraryFixture) {
		student := uuid.New()
		fx.driver.tables["students"] = []map[string]any{{"id": student, "person_id": fx.person}}
		fx.driver.tables["student_subject_enrollments"] = []map[string]any{
			{"id": uuid.New(), "student_id": student, "subject_offering_id": offering},
		}
	}
}

func scopesGuardianOf(offering uuid.UUID) libraryOption {
	return func(fx *libraryFixture) {
		guardian, ward := uuid.New(), uuid.New()
		fx.driver.tables["guardians"] = []map[string]any{{"id": guardian, "person_id": fx.person}}
		fx.driver.tables["student_subject_enrollments"] = []map[string]any{
			{"id": uuid.New(), "student_id": ward, "subject_offering_id": offering},
		}
	}
}

func scopesUnknownPerson() libraryOption {
	return func(fx *libraryFixture) {
		fx.driver.tables["persons"] = nil
	}
}

func askForScopes(t *testing.T, opts ...libraryOption) *httptest.ResponseRecorder {
	t.Helper()
	fx := newLibraryFixture(t, opts...)
	return fx.call(fx.server.getLibraryScopes, http.MethodGet, "/api/v1/library/scopes", "", uuid.Nil)
}

func scopesFields(t *testing.T, w *httptest.ResponseRecorder) map[string]json.RawMessage {
	t.Helper()
	var body map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v (%q)", err, w.Body.String())
	}
	return body
}

func scopesLabels(t *testing.T, w *httptest.ResponseRecorder) []string {
	t.Helper()
	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	raw, carried := scopesFields(t, w)["labels"]
	if !carried {
		t.Fatalf("the response carried no labels field: %s", w.Body.String())
	}
	if string(raw) == "null" {
		t.Fatal("labels came back as null; a resolved-empty set must be an empty array")
	}
	var labels []string
	if err := json.Unmarshal(raw, &labels); err != nil {
		t.Fatalf("labels is not an array of strings: %v (%s)", err, raw)
	}
	return labels
}

func scopesCode(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	raw, carried := scopesFields(t, w)["code"]
	if !carried {
		t.Fatalf("the refusal carried no machine-readable code: %s", w.Body.String())
	}
	var code string
	if err := json.Unmarshal(raw, &code); err != nil {
		t.Fatalf("code is not a string: %v (%s)", err, raw)
	}
	return code
}

func labelWithPrefix(labels []string, prefix string) string {
	for _, label := range labels {
		if strings.HasPrefix(label, prefix) {
			return label
		}
	}
	return ""
}

func wantLabel(t *testing.T, labels []string, want string) {
	t.Helper()
	for _, label := range labels {
		if label == want {
			return
		}
	}
	t.Fatalf("want label %q among %v", want, labels)
}

func refuseLabelPrefix(t *testing.T, labels []string, prefix string) {
	t.Helper()
	if found := labelWithPrefix(labels, prefix); found != "" {
		t.Fatalf("this reach must hold no %s label, got %q among %v", prefix, found, labels)
	}
}

func TestLibraryScopesReportAnEmptySetWithTwoHundred(t *testing.T) {
	w := askForScopes(t,
		scopesInSchool(uuid.New()),
		scopesReaching(authorization.ReachSelf),
		scopesUnknownPerson())

	if w.Code != http.StatusOK {
		t.Fatalf("a caller who may see nothing must still get 200, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}
	if labels := scopesLabels(t, w); len(labels) != 0 {
		t.Fatalf("want an empty scope set, got %v", labels)
	}
	if raw := scopesFields(t, w)["labels"]; string(raw) != "[]" {
		t.Fatalf("an empty scope set must serialise as [], got %s", raw)
	}
}

func TestLibraryScopesReportTheLabelsTheCallerHolds(t *testing.T) {
	school, section, grade := uuid.New(), uuid.New(), uuid.New()

	w := askForScopes(t,
		scopesInSchool(school),
		scopesReaching(authorization.ReachTeacherAssignment),
		scopesTeaching(section),
		scopesGradedSection(section, grade))

	labels := scopesLabels(t, w)
	if len(labels) == 0 {
		t.Fatal("a teacher with a graded section must hold labels")
	}
	wantLabel(t, labels, "school_"+school.String())
	wantLabel(t, labels, "section_"+section.String())
	wantLabel(t, labels, "grade_"+grade.String())
}

func TestLibraryScopesReportTheWildcardForTenantReach(t *testing.T) {
	school := uuid.New()

	w := askForScopes(t,
		scopesInSchool(school),
		scopesReaching(authorization.ReachTenant))

	labels := scopesLabels(t, w)
	wantLabel(t, labels, "unrestricted_"+school.String())

	var unrestricted bool
	if err := json.Unmarshal(scopesFields(t, w)["unrestricted"], &unrestricted); err != nil {
		t.Fatalf("unrestricted is not a bool: %v", err)
	}
	if !unrestricted {
		t.Fatal("tenant reach must report itself as unrestricted")
	}
}

func TestLibraryScopesFailLoudlyWhenTheyCannotResolve(t *testing.T) {
	section := uuid.New()

	w := askForScopes(t,
		scopesInSchool(uuid.New()),
		scopesReaching(authorization.ReachTeacherAssignment),
		scopesTeaching(section))

	if w.Code/100 == 2 {
		t.Fatalf("an unresolved scope set must not answer with success, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}
	if code := scopesCode(t, w); code != ScopeUnresolvedCode {
		t.Fatalf("want code %q, got %q", ScopeUnresolvedCode, code)
	}
	if _, carried := scopesFields(t, w)["labels"]; carried {
		t.Fatalf("an unresolved answer must carry no labels at all: %s", w.Body.String())
	}
}

var scopesUUIDPattern = regexp.MustCompile(
	`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

func TestLibraryScopesNameNoIdentifierWhenTheyRefuse(t *testing.T) {
	school, section := uuid.New(), uuid.New()

	cases := []struct {
		name string
		opts []libraryOption
	}{
		{
			name: "a section whose grade level is unknown",
			opts: []libraryOption{
				scopesReaching(authorization.ReachTeacherAssignment),
				scopesTeaching(section),
			},
		},
		{
			name: "a pinned grant the label channel cannot express",
			opts: []libraryOption{
				scopesPinned(authorization.ReachTeacherAssignment, "section", section.String()),
				scopesTeaching(section),
				scopesGradedSection(section, uuid.New()),
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := askForScopes(t, append([]libraryOption{scopesInSchool(school)}, tc.opts...)...)

			if w.Code/100 == 2 {
				t.Fatalf("want a refusal, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
			}
			if found := scopesUUIDPattern.FindString(w.Body.String()); found != "" {
				t.Fatalf("the refusal leaked the identifier %q: %s", found, w.Body.String())
			}
		})
	}
}

func TestLibraryScopesNameAPinnedGrantAsItsOwnCause(t *testing.T) {
	section, grade := uuid.New(), uuid.New()

	w := askForScopes(t,
		scopesInSchool(uuid.New()),
		scopesPinned(authorization.ReachTeacherAssignment, "section", section.String()),
		scopesTeaching(section),
		scopesGradedSection(section, grade))

	if w.Code/100 == 2 {
		t.Fatalf("want a refusal, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if code := scopesCode(t, w); code != ScopePinnedCode {
		t.Fatalf("an operator must be able to tell a pinned grant apart; want %q, got %q",
			ScopePinnedCode, code)
	}
}

func TestLibraryScopesTellEmptyApartFromUnresolvedByStatusAlone(t *testing.T) {
	section := uuid.New()

	empty := askForScopes(t,
		scopesInSchool(uuid.New()),
		scopesReaching(authorization.ReachSelf),
		scopesUnknownPerson())

	unresolved := askForScopes(t,
		scopesInSchool(uuid.New()),
		scopesReaching(authorization.ReachTeacherAssignment),
		scopesTeaching(section))

	if empty.Code != http.StatusOK {
		t.Fatalf("a resolved-empty scope set must be 200, got %d", empty.Code)
	}
	if empty.Code == unresolved.Code {
		t.Fatalf("an unresolvable caller answered %d, the same as a caller who may see nothing; "+
			"the engine cannot tell them apart", unresolved.Code)
	}
}

func TestLibraryScopesHoldNoSectionOrGradeForPersonalReach(t *testing.T) {
	school, offering := uuid.New(), uuid.New()

	cases := []struct {
		name  string
		reach authorization.Reach
		holds libraryOption
	}{
		{
			name:  "a caller reading their own record",
			reach: authorization.ReachSelf,
			holds: scopesEnrolledSelf(offering),
		},
		{
			name:  "a guardian reading their ward's",
			reach: authorization.ReachGuardianWard,
			holds: scopesGuardianOf(offering),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := askForScopes(t, scopesInSchool(school), scopesReaching(tc.reach), tc.holds)

			labels := scopesLabels(t, w)
			wantLabel(t, labels, "school_"+school.String())
			wantLabel(t, labels, "offering_"+offering.String())
			refuseLabelPrefix(t, labels, "section_")
			refuseLabelPrefix(t, labels, "grade_")
			refuseLabelPrefix(t, labels, "unrestricted_")
		})
	}
}

type watchedBody struct {
	read bool
	rest *strings.Reader
}

func (b *watchedBody) Read(p []byte) (int, error) {
	b.read = true
	return b.rest.Read(p)
}

func TestLibraryScopesReadNothingFromTheRequestBody(t *testing.T) {
	fx := newLibraryFixture(t,
		scopesInSchool(uuid.New()),
		scopesReaching(authorization.ReachSelf),
		scopesEnrolledSelf(uuid.New()))

	body := &watchedBody{rest: strings.NewReader(
		`{"user_id":"` + uuid.New().String() + `","school_id":"` + uuid.New().String() + `"}`)}
	r := httptest.NewRequest(http.MethodGet, "/api/v1/library/scopes", body).WithContext(fx.ctx)

	w := httptest.NewRecorder()
	fx.server.getLibraryScopes(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", w.Code, strings.TrimSpace(w.Body.String()))
	}
	if body.read {
		t.Fatal("the handler read the request body; this endpoint must describe the caller " +
			"to themselves from their own token alone, and a body it reads is a body that can name someone else")
	}
}

func TestLibraryScopesIgnoreEveryParameterThatNamesAPrincipal(t *testing.T) {
	school, offering, foreign := uuid.New(), uuid.New(), uuid.New()

	fx := newLibraryFixture(t,
		scopesInSchool(school),
		scopesReaching(authorization.ReachSelf),
		scopesEnrolledSelf(offering))

	base := fx.call(fx.server.getLibraryScopes,
		http.MethodGet, "/api/v1/library/scopes", "", uuid.Nil)
	if base.Code != http.StatusOK {
		t.Fatalf("the unparameterised request must resolve, got %d: %s",
			base.Code, strings.TrimSpace(base.Body.String()))
	}

	for _, name := range []string{
		"school_id", "user_id", "person_id", "cas_user_id", "student_id", "subject", "viewer_id",
	} {
		t.Run(name, func(t *testing.T) {
			w := fx.call(fx.server.getLibraryScopes, http.MethodGet,
				"/api/v1/library/scopes?"+name+"="+foreign.String(), "", uuid.Nil)

			if strings.Contains(w.Body.String(), foreign.String()) {
				t.Fatalf("%s reached the answer; this endpoint must not describe anyone "+
					"but its own caller: %s", name, w.Body.String())
			}
			if w.Code != base.Code || w.Body.String() != base.Body.String() {
				t.Fatalf("%s changed the answer from %d %s to %d %s; the scope set must depend "+
					"on the token alone", name, base.Code, strings.TrimSpace(base.Body.String()),
					w.Code, strings.TrimSpace(w.Body.String()))
			}
		})
	}
}

func TestLibraryScopesRefuseACallerWithNoSchool(t *testing.T) {
	w := askForScopes(t, scopesReaching(authorization.ReachSelf))

	if w.Code/100 == 2 {
		t.Fatalf("a request with no resolved school must not answer with success, got %d: %s",
			w.Code, strings.TrimSpace(w.Body.String()))
	}
}
