package retrieval

import (
	"errors"
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Harbour-Emerge/emerge-core/internal/authorization"
	"github.com/Harbour-Emerge/emerge-core/internal/data/access"
	entcontent "github.com/Harbour-Emerge/emerge-core/internal/ent/generated/contentitem"
)

const generatedAudienceSource = "../ent/generated/contentitem/contentitem.go"

func declaredAudiences(t *testing.T) []entcontent.Audience {
	t.Helper()

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, generatedAudienceSource, nil, 0)
	if err != nil {
		t.Fatalf("parse %s: %v", generatedAudienceSource, err)
	}

	var out []entcontent.Audience
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || vs.Type == nil {
				continue
			}
			ident, ok := vs.Type.(*ast.Ident)
			if !ok || ident.Name != "Audience" {
				continue
			}
			for _, expr := range vs.Values {
				lit, ok := expr.(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					t.Fatalf("audience constant %v is not a string literal", vs.Names)
				}
				raw, err := strconv.Unquote(lit.Value)
				if err != nil {
					t.Fatalf("unquote %s: %v", lit.Value, err)
				}
				out = append(out, entcontent.Audience(raw))
			}
		}
	}

	if len(out) == 0 {
		t.Fatalf("no Audience constants found in %s", generatedAudienceSource)
	}
	return out
}

func ids() (school, grade, section, offering, person uuid.UUID) {
	return uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
}

func TestLabelForIsTotalOverTheDeclaredAudienceEnum(t *testing.T) {
	school, grade, section, offering, person := ids()

	item := Item{
		SchoolID:          school,
		GradeLevelID:      &grade,
		SectionID:         &section,
		SubjectOfferingID: &offering,
		OwnerPersonID:     person,
	}

	want := map[entcontent.Audience]string{
		"school":   "school_" + school.String(),
		"grade":    "grade_" + grade.String(),
		"section":  "section_" + section.String(),
		"offering": "offering_" + offering.String(),
		"owner":    "person_" + person.String(),
	}

	declared := declaredAudiences(t)
	for _, audience := range declared {
		expected, stated := want[audience]
		if !stated {
			t.Fatalf("audience %q is declared in the ent enum but the frozen label vocabulary has no entry for it; an unhandled audience stamps a document with the wildcard alone, which is tenant-wide", audience)
		}
		if _, handled := audienceAnchors[audience]; !handled {
			t.Fatalf("audience %q is declared in the ent enum but LabelFor does not handle it", audience)
		}
		got, err := LabelFor(withAudience(item, audience))
		if err != nil {
			t.Fatalf("LabelFor(%q): unexpected error %v", audience, err)
		}
		if got != expected {
			t.Fatalf("LabelFor(%q) = %q, want %q", audience, got, expected)
		}
	}

	for audience := range audienceAnchors {
		if !containsAudience(declared, audience) {
			t.Fatalf("LabelFor handles audience %q which the ent enum no longer declares", audience)
		}
	}
	if len(declared) != len(want) {
		t.Fatalf("the ent enum declares %d audiences, the frozen vocabulary names %d", len(declared), len(want))
	}
}

func withAudience(item Item, audience entcontent.Audience) Item {
	item.Audience = audience
	return item
}

func containsAudience(all []entcontent.Audience, want entcontent.Audience) bool {
	for _, a := range all {
		if a == want {
			return true
		}
	}
	return false
}

func TestLabelForNeverReturnsEmptyWithNilError(t *testing.T) {
	school, grade, section, offering, person := ids()
	full := Item{
		SchoolID:          school,
		GradeLevelID:      &grade,
		SectionID:         &section,
		SubjectOfferingID: &offering,
		OwnerPersonID:     person,
	}

	cases := []struct {
		name string
		item Item
	}{
		{"zero value", Item{}},
		{"unknown audience", withAudience(full, entcontent.Audience("cohort"))},
		{"empty audience", withAudience(full, entcontent.Audience(""))},
		{"grade without grade id", Item{SchoolID: school, Audience: entcontent.AudienceGrade}},
		{"section without section id", Item{SchoolID: school, Audience: entcontent.AudienceSection}},
		{"offering without offering id", Item{SchoolID: school, Audience: entcontent.AudienceOffering}},
		{"owner without person id", Item{SchoolID: school, Audience: entcontent.AudienceOwner}},
		{"school without school id", Item{Audience: entcontent.AudienceSchool}},
		{"section with nil uuid", withAudience(Item{SchoolID: school, SectionID: &uuid.Nil}, entcontent.AudienceSection)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			label, err := LabelFor(tc.item)
			if err == nil {
				t.Fatalf("LabelFor(%+v) = %q with nil error; a missing anchor is a corrupt row, not a school-wide document", tc.item, label)
			}
			if label != "" {
				t.Fatalf("LabelFor returned %q alongside an error", label)
			}
		})
	}
}

func TestLabelForRejectsAMissingAnchorForEveryAudienceThatNeedsOne(t *testing.T) {
	school := uuid.New()
	for _, audience := range declaredAudiences(t) {
		if audience == entcontent.AudienceSchool {
			continue
		}
		label, err := LabelFor(Item{SchoolID: school, Audience: audience})
		if err == nil {
			t.Fatalf("audience %q with no anchor id returned %q", audience, label)
		}
		if !errors.Is(err, ErrMissingAnchor) {
			t.Fatalf("audience %q with no anchor id: got %v, want ErrMissingAnchor", audience, err)
		}
	}
}

func TestLabelsForCarriesExactlyTheWildcardAndTheAudienceLabel(t *testing.T) {
	school, _, section, _, _ := ids()

	labels, err := LabelsFor(Item{
		SchoolID:  school,
		Audience:  entcontent.AudienceSection,
		Status:    entcontent.StatusPublished,
		SectionID: &section,
	})
	if err != nil {
		t.Fatalf("LabelsFor: %v", err)
	}
	if len(labels) != 2 {
		t.Fatalf("LabelsFor returned %d labels, want 2: %v", len(labels), labels)
	}
	if labels[0] != "unrestricted_"+school.String() {
		t.Fatalf("first label = %q, want the wildcard", labels[0])
	}
	if labels[1] != "section_"+section.String() {
		t.Fatalf("second label = %q, want the audience label", labels[1])
	}
}

func TestLabelsForRefusesADocumentWithNoSchool(t *testing.T) {
	section := uuid.New()
	labels, err := LabelsFor(Item{
		Audience:  entcontent.AudienceSection,
		Status:    entcontent.StatusPublished,
		SectionID: &section,
	})
	if err == nil {
		t.Fatalf("LabelsFor with no school returned %v", labels)
	}
	if errors.Is(err, ErrNotPublished) {
		t.Fatalf("LabelsFor blamed publication for a missing school: %v", err)
	}
	if labels != nil {
		t.Fatalf("LabelsFor returned %v alongside an error", labels)
	}
}

func TestNoLabelSpansSegments(t *testing.T) {
	school, grade, section, offering, person := ids()
	full := Item{
		SchoolID:          school,
		Status:            entcontent.StatusPublished,
		GradeLevelID:      &grade,
		SectionID:         &section,
		SubjectOfferingID: &offering,
		OwnerPersonID:     person,
	}

	var minted []string
	for _, audience := range declaredAudiences(t) {
		labels, err := LabelsFor(withAudience(full, audience))
		if err != nil {
			t.Fatalf("LabelsFor(%q): %v", audience, err)
		}
		minted = append(minted, labels...)
	}

	held, err := ScopesForWithSectionGrades(
		teacher(person, section, offering),
		authorization.Decision{HasReach: true, Reach: authorization.ReachTeacherAssignment},
		school,
		SectionGrades{section: grade},
	)
	if err != nil {
		t.Fatalf("ScopesForWithSectionGrades: %v", err)
	}
	resolved, err := held.Labels()
	if err != nil {
		t.Fatalf("Labels: %v", err)
	}
	minted = append(minted, resolved...)

	for _, label := range minted {
		if strings.Contains(label, SegmentSeparator) {
			t.Fatalf("label %q contains %q; the engine applies prefix containment on dots and would silently widen it", label, SegmentSeparator)
		}
		if strings.HasPrefix(label, "_") {
			t.Fatalf("label %q starts with the engine's reserved underscore", label)
		}
	}
}

func TestMintRefusesALabelThatSpansSegments(t *testing.T) {
	if err := validate("section_9.A"); !errors.Is(err, ErrInvalidLabel) {
		t.Fatalf("validate(dotted) = %v, want ErrInvalidLabel", err)
	}
	if err := validate(""); !errors.Is(err, ErrInvalidLabel) {
		t.Fatalf("validate(empty) = %v, want ErrInvalidLabel", err)
	}
	if err := validate("_global"); !errors.Is(err, ErrInvalidLabel) {
		t.Fatalf("validate(reserved) = %v, want ErrInvalidLabel", err)
	}
}

func teacher(person, section, offering uuid.UUID) *access.Viewer {
	return &access.Viewer{
		PersonID:           &person,
		SectionIDs:         []uuid.UUID{section},
		SubjectOfferingIDs: []uuid.UUID{offering},
	}
}

func labelsOf(t *testing.T, s Scopes, err error) []string {
	t.Helper()
	if err != nil {
		t.Fatalf("ScopesFor: unexpected error %v", err)
	}
	if !s.Resolved() {
		t.Fatalf("ScopesFor returned an unresolved scope set with a nil error")
	}
	labels, err := s.Labels()
	if err != nil {
		t.Fatalf("Labels: %v", err)
	}
	return labels
}

func hasLabel(labels []string, want string) bool {
	for _, l := range labels {
		if l == want {
			return true
		}
	}
	return false
}

func hasPrefix(labels []string, prefix string) bool {
	for _, l := range labels {
		if strings.HasPrefix(l, prefix) {
			return true
		}
	}
	return false
}

func assertHolds(t *testing.T, labels []string, want ...string) {
	t.Helper()
	for _, w := range want {
		if !hasLabel(labels, w) {
			t.Fatalf("scope set %v is missing %q", labels, w)
		}
	}
	if len(labels) != len(want) {
		t.Fatalf("scope set %v holds %d labels, want exactly %d: %v", labels, len(labels), len(want), want)
	}
}

func TestScopesForEachReach(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	ownSection := uuid.New()
	otherSection := uuid.New()
	ownGrade := uuid.New()
	taughtOffering := uuid.New()
	enrolledOffering := uuid.New()
	wardOffering := uuid.New()

	v := &access.Viewer{
		PersonID:            &person,
		SectionIDs:          []uuid.UUID{ownSection},
		SubjectOfferingIDs:  []uuid.UUID{taughtOffering},
		EnrolledOfferingIDs: []uuid.UUID{enrolledOffering},
		WardOfferingIDs:     []uuid.UUID{wardOffering},
	}
	grades := SectionGrades{ownSection: ownGrade}

	wildcard := "unrestricted_" + school.String()
	schoolLabel := "school_" + school.String()
	personLabel := "person_" + person.String()
	sectionLabel := "section_" + ownSection.String()
	gradeLabel := "grade_" + ownGrade.String()
	taught := "offering_" + taughtOffering.String()
	enrolled := "offering_" + enrolledOffering.String()
	ward := "offering_" + wardOffering.String()

	cases := []struct {
		name    string
		d       authorization.Decision
		want    []string
		absent  []string
		unrestr bool
	}{
		{
			name:    "tenant",
			d:       authorization.Decision{HasReach: true, Reach: authorization.ReachTenant},
			want:    []string{wildcard},
			absent:  []string{schoolLabel, sectionLabel, gradeLabel},
			unrestr: true,
		},
		{
			name:   "self",
			d:      authorization.Decision{HasReach: true, Reach: authorization.ReachSelf},
			want:   []string{schoolLabel, personLabel, enrolled},
			absent: []string{wildcard, sectionLabel, gradeLabel, taught, ward},
		},
		{
			name:   "guardian_ward",
			d:      authorization.Decision{HasReach: true, Reach: authorization.ReachGuardianWard},
			want:   []string{schoolLabel, personLabel, ward},
			absent: []string{wildcard, sectionLabel, gradeLabel, taught, enrolled},
		},
		{
			name:   "teacher_assignment",
			d:      authorization.Decision{HasReach: true, Reach: authorization.ReachTeacherAssignment},
			want:   []string{schoolLabel, personLabel, sectionLabel, gradeLabel, taught, enrolled, ward},
			absent: []string{wildcard, "section_" + otherSection.String()},
		},
		{
			name:   "no reach",
			d:      authorization.Decision{},
			want:   []string{schoolLabel, personLabel, sectionLabel, gradeLabel, taught, enrolled, ward},
			absent: []string{wildcard, "section_" + otherSection.String()},
		},
		{
			name:   "unknown reach",
			d:      authorization.Decision{HasReach: true, Reach: authorization.Reach("wizard")},
			want:   nil,
			absent: []string{wildcard, schoolLabel, personLabel, sectionLabel, gradeLabel, taught},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, err := ScopesForWithSectionGrades(v, tc.d, school, grades)
			labels := labelsOf(t, s, err)
			assertHolds(t, labels, tc.want...)
			for _, a := range tc.absent {
				if hasLabel(labels, a) {
					t.Fatalf("scope set %v must not hold %q", labels, a)
				}
			}
			if s.Unrestricted() != tc.unrestr {
				t.Fatalf("Unrestricted() = %v, want %v", s.Unrestricted(), tc.unrestr)
			}
		})
	}
}

func TestOnlyTheWideArmsEmitTheWildcard(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	section := uuid.New()
	grade := uuid.New()
	offering := uuid.New()

	v := &access.Viewer{
		PersonID:            &person,
		SectionIDs:          []uuid.UUID{section},
		SubjectOfferingIDs:  []uuid.UUID{offering},
		EnrolledOfferingIDs: []uuid.UUID{offering},
		WardOfferingIDs:     []uuid.UUID{offering},
	}
	grades := SectionGrades{section: grade}

	narrow := []authorization.Decision{
		{},
		{HasReach: true, Reach: authorization.ReachSelf},
		{HasReach: true, Reach: authorization.ReachGuardianWard},
		{HasReach: true, Reach: authorization.ReachTeacherAssignment},
		{HasReach: true, Reach: authorization.Reach("wizard")},
	}

	for _, d := range narrow {
		s, err := ScopesForWithSectionGrades(v, d, school, grades)
		labels := labelsOf(t, s, err)
		if hasPrefix(labels, "unrestricted_") {
			t.Fatalf("reach %q emitted the wildcard: %v", d.Reach, labels)
		}
		if s.Unrestricted() {
			t.Fatalf("reach %q reports Unrestricted()", d.Reach)
		}
	}
}

func TestSelfAndWardNeverHoldSectionOrGradeLabels(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	section := uuid.New()
	grade := uuid.New()

	v := &access.Viewer{
		PersonID:            &person,
		SectionIDs:          []uuid.UUID{section},
		EnrolledOfferingIDs: []uuid.UUID{uuid.New()},
		WardOfferingIDs:     []uuid.UUID{uuid.New()},
	}
	grades := SectionGrades{section: grade}

	for _, reach := range []authorization.Reach{authorization.ReachSelf, authorization.ReachGuardianWard} {
		s, err := ScopesForWithSectionGrades(v, authorization.Decision{HasReach: true, Reach: reach}, school, grades)
		labels := labelsOf(t, s, err)
		if hasPrefix(labels, "section_") {
			t.Fatalf("reach %q holds a section label: %v; a pupil's section lets a guardian retrieve a teacher's note about another child", reach, labels)
		}
		if hasPrefix(labels, "grade_") {
			t.Fatalf("reach %q holds a grade label: %v", reach, labels)
		}
	}
}

func TestPersonalArmsCollapseWithoutAPerson(t *testing.T) {
	school := uuid.New()
	v := &access.Viewer{
		EnrolledOfferingIDs: []uuid.UUID{uuid.New()},
		WardOfferingIDs:     []uuid.UUID{uuid.New()},
	}

	for _, reach := range []authorization.Reach{authorization.ReachSelf, authorization.ReachGuardianWard} {
		s, err := ScopesFor(v, authorization.Decision{HasReach: true, Reach: reach}, school)
		labels := labelsOf(t, s, err)
		assertHolds(t, labels)
	}
}

func TestUnrestrictedViewerHoldsOnlyTheWildcard(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	section := uuid.New()

	v := &access.Viewer{PersonID: &person, SectionIDs: []uuid.UUID{section}, Unrestricted: true}

	for _, d := range []authorization.Decision{
		{},
		{HasReach: true, Reach: authorization.ReachSelf},
		{Constraints: [][]authorization.Constraint{{{Field: "section", Values: []string{"9A"}}}}},
	} {
		s, err := ScopesFor(v, d, school)
		labels := labelsOf(t, s, err)
		assertHolds(t, labels, "unrestricted_"+school.String())
		if !s.Unrestricted() {
			t.Fatalf("unrestricted viewer does not report Unrestricted()")
		}
	}
}

func TestEveryDeclaredReachIsHandledExplicitly(t *testing.T) {
	handled := map[authorization.Reach]bool{
		authorization.ReachTenant:            true,
		authorization.ReachSelf:              true,
		authorization.ReachGuardianWard:      true,
		authorization.ReachTeacherAssignment: true,
	}
	for _, reach := range authorization.AllReaches {
		if !handled[reach] {
			t.Fatalf("reach %q is declared but ScopesFor has no arm for it; it would fall to the deny arm silently", reach)
		}
	}
	if len(authorization.AllReaches) != len(handled) {
		t.Fatalf("authorization declares %d reaches, the resolver names %d", len(authorization.AllReaches), len(handled))
	}
}

func TestAnUnresolvedScopeSetIsNotAnEmptyOne(t *testing.T) {
	school := uuid.New()

	unresolved, err := ScopesFor(nil, authorization.Decision{HasReach: true, Reach: authorization.ReachSelf}, school)
	if err == nil {
		t.Fatalf("a nil viewer resolved to %+v; an unreachable authorizer must not look like a caller with no access", unresolved)
	}
	if !errors.Is(err, ErrUnresolved) {
		t.Fatalf("nil viewer: got %v, want an error wrapping ErrUnresolved", err)
	}
	if unresolved.Resolved() {
		t.Fatalf("the failure value reports Resolved()")
	}
	if labels, err := unresolved.Labels(); err == nil {
		t.Fatalf("Labels on an unresolved scope set returned %v with a nil error", labels)
	}
	if unresolved.Contains("unrestricted_" + school.String()) {
		t.Fatalf("an unresolved scope set claims to hold a label")
	}

	empty, err := ScopesFor(
		&access.Viewer{},
		authorization.Decision{HasReach: true, Reach: authorization.ReachSelf},
		school,
	)
	if err != nil {
		t.Fatalf("a caller who holds nothing must resolve: %v", err)
	}
	if !empty.Resolved() {
		t.Fatalf("a caller who holds nothing must be resolved")
	}
	labels, err := empty.Labels()
	if err != nil {
		t.Fatalf("Labels on a resolved empty scope set: %v", err)
	}
	if len(labels) != 0 {
		t.Fatalf("expected no labels, got %v", labels)
	}
	if labels == nil {
		t.Fatalf("a resolved empty scope set must render as an empty list, not nil")
	}
}

func TestNoSchoolIsAResolutionFailure(t *testing.T) {
	person := uuid.New()
	s, err := ScopesFor(&access.Viewer{PersonID: &person}, authorization.Decision{HasReach: true, Reach: authorization.ReachSelf}, uuid.Nil)
	if err == nil {
		t.Fatalf("a nil school resolved to %+v", s)
	}
	if !errors.Is(err, ErrUnresolved) {
		t.Fatalf("nil school: got %v, want an error wrapping ErrUnresolved", err)
	}
	if s.Resolved() {
		t.Fatalf("the failure value reports Resolved()")
	}
}

func TestResolutionFailuresNameNoTenantAndNoUser(t *testing.T) {
	school := uuid.New()
	person := uuid.New()

	_, noViewer := ScopesFor(nil, authorization.Decision{HasReach: true, Reach: authorization.ReachSelf}, school)
	_, noSchool := ScopesFor(&access.Viewer{PersonID: &person}, authorization.Decision{HasReach: true, Reach: authorization.ReachSelf}, uuid.Nil)

	for _, err := range []error{noViewer, noSchool} {
		if err == nil {
			t.Fatalf("expected a resolution failure")
		}
		msg := err.Error()
		if strings.Contains(msg, school.String()) || strings.Contains(msg, person.String()) {
			t.Fatalf("resolution failure %q names an identifier", msg)
		}
	}
}

func TestTeachingArmRefusesWithoutTheGradeOfEverySection(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	section := uuid.New()
	other := uuid.New()
	grade := uuid.New()

	v := &access.Viewer{PersonID: &person, SectionIDs: []uuid.UUID{section, other}}
	d := authorization.Decision{HasReach: true, Reach: authorization.ReachTeacherAssignment}

	for _, tc := range []struct {
		name   string
		grades SectionGrades
	}{
		{"no map at all", nil},
		{"one section missing", SectionGrades{section: grade}},
		{"a nil grade id", SectionGrades{section: grade, other: uuid.Nil}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, err := ScopesForWithSectionGrades(v, d, school, tc.grades)
			if err == nil {
				t.Fatalf("resolved to %+v; omitting a grade label makes a teacher unable to read their own grade's documents", s)
			}
			if !errors.Is(err, ErrSectionGradesUnknown) {
				t.Fatalf("got %v, want ErrSectionGradesUnknown", err)
			}
			if !errors.Is(err, ErrUnresolved) {
				t.Fatalf("got %v, want an error wrapping ErrUnresolved", err)
			}
			if s.Resolved() {
				t.Fatalf("the failure value reports Resolved()")
			}
		})
	}

	s, err := ScopesForWithSectionGrades(v, d, school, SectionGrades{section: grade, other: grade})
	labels := labelsOf(t, s, err)
	assertHolds(t, labels,
		"school_"+school.String(),
		"person_"+person.String(),
		"section_"+section.String(),
		"section_"+other.String(),
		"grade_"+grade.String(),
	)
}

func TestASubjectTeacherWithNoSectionsNeedsNoGrades(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	offering := uuid.New()

	v := &access.Viewer{PersonID: &person, SubjectOfferingIDs: []uuid.UUID{offering}}
	s, err := ScopesFor(v, authorization.Decision{HasReach: true, Reach: authorization.ReachTeacherAssignment}, school)
	labels := labelsOf(t, s, err)
	assertHolds(t, labels,
		"school_"+school.String(),
		"person_"+person.String(),
		"offering_"+offering.String(),
	)
	if hasPrefix(labels, "grade_") {
		t.Fatalf("an offering alone must not mint a grade label: %v", labels)
	}
}

func TestAnUntranslatablePinDenies(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	section := uuid.New()
	grade := uuid.New()

	v := &access.Viewer{PersonID: &person, SectionIDs: []uuid.UUID{section}}
	grades := SectionGrades{section: grade}

	for _, groups := range [][][]authorization.Constraint{
		{{{Field: "district", Values: []string{"north"}}}},
		{{{Field: "section", Values: nil}}},
	} {
		d := authorization.Decision{HasReach: true, Reach: authorization.ReachTeacherAssignment, Constraints: groups}
		s, err := ScopesForWithSectionGrades(v, d, school, grades)
		labels := labelsOf(t, s, err)
		assertHolds(t, labels)
	}
}

func TestAPinDropsTheSchoolAndPersonLabels(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	pins := [][]authorization.Constraint{{{Field: "section", Values: []string{"9A"}}}}

	v := &access.Viewer{
		PersonID:            &person,
		EnrolledOfferingIDs: []uuid.UUID{uuid.New()},
		WardOfferingIDs:     []uuid.UUID{uuid.New()},
	}

	for _, reach := range []authorization.Reach{authorization.ReachSelf, authorization.ReachGuardianWard} {
		d := authorization.Decision{HasReach: true, Reach: reach, Constraints: pins}
		s, err := ScopesFor(v, d, school)
		labels := labelsOf(t, s, err)
		assertHolds(t, labels)
	}
}

func TestAPinnedRoleGrantIsAResolutionFailure(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	section := uuid.New()
	grade := uuid.New()
	pins := [][]authorization.Constraint{{{Field: "section", Values: []string{"9A"}}}}

	v := &access.Viewer{PersonID: &person, SectionIDs: []uuid.UUID{section}}
	grades := SectionGrades{section: grade}

	for _, d := range []authorization.Decision{
		{HasReach: true, Reach: authorization.ReachTeacherAssignment, Constraints: pins},
		{HasReach: true, Reach: authorization.ReachTenant, Constraints: pins},
		{Constraints: pins},
	} {
		s, err := ScopesForWithSectionGrades(v, d, school, grades)
		if err == nil {
			t.Fatalf("reach %q with a pin resolved to %+v; the label set cannot express the pin and would be wider than the predicate", d.Reach, s)
		}
		if !errors.Is(err, ErrPinnedScopeUnresolved) {
			t.Fatalf("got %v, want ErrPinnedScopeUnresolved", err)
		}
		if !errors.Is(err, ErrUnresolved) {
			t.Fatalf("got %v, want an error wrapping ErrUnresolved", err)
		}
		if s.Resolved() {
			t.Fatalf("the failure value reports Resolved()")
		}
	}
}

func TestLabelsAreACopy(t *testing.T) {
	school := uuid.New()
	person := uuid.New()

	s, err := ScopesFor(&access.Viewer{PersonID: &person}, authorization.Decision{HasReach: true, Reach: authorization.ReachSelf}, school)
	labels := labelsOf(t, s, err)
	labels[0] = "tampered"

	again, err := s.Labels()
	if err != nil {
		t.Fatalf("Labels: %v", err)
	}
	if hasLabel(again, "tampered") {
		t.Fatalf("the caller mutated the held scope set: %v", again)
	}
}

func TestScopesForTakesTheSectionGradesFromTheViewer(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	sectionNine := uuid.New()
	sectionTen := uuid.New()
	gradeNine := uuid.New()
	gradeTen := uuid.New()

	v := &access.Viewer{
		PersonID:   &person,
		SectionIDs: []uuid.UUID{sectionNine, sectionTen},
		SectionGradeIDs: map[uuid.UUID]uuid.UUID{
			sectionNine: gradeNine,
			sectionTen:  gradeTen,
		},
	}

	s, err := ScopesFor(v, authorization.Decision{HasReach: true, Reach: authorization.ReachTeacherAssignment}, school)
	labels := labelsOf(t, s, err)
	assertHolds(t, labels,
		"school_"+school.String(),
		"person_"+person.String(),
		"section_"+sectionNine.String(),
		"section_"+sectionTen.String(),
		"grade_"+gradeNine.String(),
		"grade_"+gradeTen.String(),
	)
}

func TestScopesForStillRefusesAnIncompleteViewerMap(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	held := uuid.New()
	missing := uuid.New()
	grade := uuid.New()

	for _, tc := range []struct {
		name  string
		index map[uuid.UUID]uuid.UUID
	}{
		{"no map on the viewer", nil},
		{"one section absent", map[uuid.UUID]uuid.UUID{held: grade}},
		{"a section mapped to nil", map[uuid.UUID]uuid.UUID{held: grade, missing: uuid.Nil}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			v := &access.Viewer{
				PersonID:        &person,
				SectionIDs:      []uuid.UUID{held, missing},
				SectionGradeIDs: tc.index,
			}
			s, err := ScopesFor(v, authorization.Decision{HasReach: true, Reach: authorization.ReachTeacherAssignment}, school)
			if err == nil {
				t.Fatalf("resolved to %+v; a section whose grade is unknown must not yield a partial set", s)
			}
			if !errors.Is(err, ErrSectionGradesUnknown) {
				t.Fatalf("got %v, want ErrSectionGradesUnknown", err)
			}
			if s.Resolved() {
				t.Fatalf("the failure value reports Resolved()")
			}
		})
	}
}

func TestAViewerCarryingSectionGradesStillGivesPupilsAndGuardiansNeither(t *testing.T) {
	school := uuid.New()
	person := uuid.New()
	section := uuid.New()
	grade := uuid.New()
	offering := uuid.New()

	v := &access.Viewer{
		PersonID:            &person,
		SectionIDs:          []uuid.UUID{section},
		SectionGradeIDs:     map[uuid.UUID]uuid.UUID{section: grade},
		EnrolledOfferingIDs: []uuid.UUID{offering},
		WardOfferingIDs:     []uuid.UUID{offering},
	}

	for _, reach := range []authorization.Reach{authorization.ReachSelf, authorization.ReachGuardianWard} {
		s, err := ScopesFor(v, authorization.Decision{HasReach: true, Reach: reach}, school)
		labels := labelsOf(t, s, err)
		assertHolds(t, labels,
			"school_"+school.String(),
			"person_"+person.String(),
			"offering_"+offering.String(),
		)
		if hasPrefix(labels, "section_") || hasPrefix(labels, "grade_") {
			t.Fatalf("reach %q holds a section or grade label: %v", reach, labels)
		}
	}
}

const generatedStatusSource = "../ent/generated/contentitem/contentitem.go"

func declaredStatuses(t *testing.T) []entcontent.Status {
	t.Helper()

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, generatedStatusSource, nil, 0)
	if err != nil {
		t.Fatalf("parse %s: %v", generatedStatusSource, err)
	}

	var out []entcontent.Status
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || vs.Type == nil {
				continue
			}
			ident, ok := vs.Type.(*ast.Ident)
			if !ok || ident.Name != "Status" {
				continue
			}
			for _, expr := range vs.Values {
				lit, ok := expr.(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					t.Fatalf("status constant %v is not a string literal", vs.Names)
				}
				raw, err := strconv.Unquote(lit.Value)
				if err != nil {
					t.Fatalf("unquote %s: %v", lit.Value, err)
				}
				out = append(out, entcontent.Status(raw))
			}
		}
	}

	if len(out) == 0 {
		t.Fatalf("no Status constants found in %s", generatedStatusSource)
	}
	return out
}

func TestLabelsForRefusesEveryStatusThatIsNotPublished(t *testing.T) {
	school, grade, section, offering, person := ids()

	statuses := declaredStatuses(t)
	if len(statuses) < 2 {
		t.Fatalf("the status enum declares only %v, so nothing here is withheld", statuses)
	}

	refused := 0
	for _, status := range statuses {
		for _, audience := range declaredAudiences(t) {
			item := Item{
				SchoolID:          school,
				Audience:          audience,
				Status:            status,
				GradeLevelID:      &grade,
				SectionID:         &section,
				SubjectOfferingID: &offering,
				OwnerPersonID:     person,
			}

			labels, err := LabelsFor(item)
			if status == entcontent.StatusPublished {
				if err != nil {
					t.Fatalf("%q/%q: LabelsFor refused a published item: %v", status, audience, err)
				}
				continue
			}

			refused++
			if !errors.Is(err, ErrNotPublished) {
				t.Fatalf("%q/%q: LabelsFor returned %v with %v. An item that is not published must not "+
					"enter the corpus, and a label nobody holds is not the same refusal",
					status, audience, labels, err)
			}
			if labels != nil {
				t.Fatalf("%q/%q: LabelsFor returned %v alongside its refusal", status, audience, labels)
			}
			for _, other := range []error{ErrUnknownAudience, ErrMissingAnchor, ErrInvalidLabel} {
				if errors.Is(err, other) {
					t.Fatalf("%q/%q: the publication refusal also reads as %v, so a caller cannot tell "+
						"an unpublished item from a malformed one", status, audience, other)
				}
			}
		}
	}

	if refused == 0 {
		t.Fatal("every declared status stamped, so this test proved nothing")
	}
}

func TestAZeroItemIsNotPublishedByDefault(t *testing.T) {
	school, _, section, _, _ := ids()

	labels, err := LabelsFor(Item{SchoolID: school, Audience: entcontent.AudienceSection, SectionID: &section})
	if !errors.Is(err, ErrNotPublished) {
		t.Fatalf("an Item whose Status was never set stamped %v with %v. The zero value must fail closed, "+
			"because a caller that forgets the field is the caller most likely to be wrong", labels, err)
	}
}
